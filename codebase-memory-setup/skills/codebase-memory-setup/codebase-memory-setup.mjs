#!/usr/bin/env node
// codebase-memory-setup.mjs —— codebase-memory-mcp 安装/体检/卸载编排（无 LLM 也可独立运行）
//
// 用法：
//   node codebase-memory-setup.mjs status              体检：二进制 / 版本 / 用户级与项目级注册状态
//   node codebase-memory-setup.mjs install             安装二进制（如缺，走官方安装脚本）+ 确保用户级 MCP 注册
//   node codebase-memory-setup.mjs install --project   额外写项目级 .mcp.json + CLAUDE.md「优先图谱查询」指引
//   node codebase-memory-setup.mjs uninstall           移除项目级条目（.mcp.json 条目 / CLAUDE.md 指引块）
//   node codebase-memory-setup.mjs uninstall --all     再调上游 uninstall 移除二进制与其用户级配置
//   node codebase-memory-setup.mjs install-index-repo  （Windows）向 PowerShell profile（pwsh7/5.1）写入 index-repo 辅助函数
//
// 职责边界：
//   - 二进制本体与其自带的 skill/hooks/agents 由上游安装器负责（默认全量配置）
//   - 本脚本补：手动装过二进制时的用户级 MCP 兜底注册、项目级条目（团队共享）、体检与卸载编排
//   - ~/.claude.json / .mcp.json / CLAUDE.md 写入前自动 .bak 备份
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const IS_WIN = process.platform === "win32";
const EXE = IS_WIN ? "codebase-memory-mcp.exe" : "codebase-memory-mcp";
const INSTALLER_URL = IS_WIN
    ? "https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1"
    : "https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh";
const USER_CONFIG = path.join(os.homedir(), ".claude.json");
const PROJECT_DIR = process.cwd();
const PROJECT_MCP = path.join(PROJECT_DIR, ".mcp.json");
const CLAUDE_MD = path.join(PROJECT_DIR, "CLAUDE.md");
const SERVER_KEY = "codebase-memory-mcp";
const MD_BEGIN = "<!-- codebase-memory-mcp:begin -->";
const MD_END = "<!-- codebase-memory-mcp:end -->";

const MD_BLOCK = `${MD_BEGIN}
## 代码图谱（codebase-memory-mcp）

本项目已接入 codebase-memory-mcp（结构化代码知识图谱，自动增量索引）。
查代码结构时**优先用图谱工具，而非全库 grep**：
- 找符号/定义/引用 -> \`search_graph\`
- 调用链/依赖路径 -> \`trace_path\`
- 自定义结构查询 -> \`query_graph\`（Cypher 风格）
- 首次接入或大规模改动后 -> \`index_repository\`
仅当图谱未覆盖（未索引的新文件、纯文本内容搜索）时退回 Grep/Glob。
${MD_END}`;

function readJson(file, fallback = {}) {
    if (!fs.existsSync(file)) return fallback;
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { throw new Error(`JSON 解析失败: ${file}（${e.message}），已中止，未做任何修改`); }
}
function writeJson(file, obj) {
    if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak");
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

// —— index-repo PowerShell 辅助函数（Windows）：向用户 profile 写入，终端一键索引新仓库 ——
const INDEX_REPO_MARKER = "# ===== codebase-memory: 一键索引新仓库 =====";
const INDEX_REPO_FUNC = `${INDEX_REPO_MARKER}
function index-repo {
    <#
    .SYNOPSIS
    调用 codebase-memory-mcp 的 index_repository，为指定仓库建立/更新知识图谱索引。
    .DESCRIPTION
    不传路径时默认索引当前目录；若位于 git 仓库子目录，自动定位到 git root 索引整个仓库。
    .EXAMPLE
    index-repo                        # 索引当前目录
    index-repo D:\\work\\myrepo         # 索引指定仓库
    index-repo D:\\work\\myrepo -Mode full
    #>
    param(
        [Parameter(Position = 0)]
        [string]$Path = (Get-Location).Path,
        [ValidateSet('full', 'moderate', 'fast', 'cross-repo-intelligence')]
        [string]$Mode = 'fast'
    )

    # 优先找标准安装位置，找不到再退回 PATH
    $bin = Join-Path $env:LOCALAPPDATA 'Programs\\codebase-memory-mcp\\codebase-memory-mcp.exe'
    if (-not (Test-Path -LiteralPath $bin)) {
        $cmd = Get-Command codebase-memory-mcp -ErrorAction SilentlyContinue
        if ($cmd) { $bin = $cmd.Source } else {
            throw '找不到 codebase-memory-mcp 二进制，请先安装或将其加入 PATH'
        }
    }

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "路径不存在: $Path"
    }
    $abs = (Resolve-Path -LiteralPath $Path).Path.Replace('\\', '/')

    # 若传入的是 git 仓库子目录，向上定位到 git root，避免建立重复的子图
    $gitRoot = git -C $abs rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -eq 0 -and $gitRoot) {
        $abs = ($gitRoot | Select-Object -First 1).Trim().Replace('\\', '/')
    }

    Write-Host "索引 $abs  (mode=$Mode) ..." -ForegroundColor Cyan
    & $bin cli index_repository --repo-path $abs --mode $Mode
    if ($LASTEXITCODE -eq 0) {
        Write-Host "完成 [OK] 图谱已更新，任意目录下均可让 Claude 查询。" -ForegroundColor Green
    }
    else {
        Write-Host "索引失败（退出码 $LASTEXITCODE），请查看上方输出。" -ForegroundColor Yellow
    }
}
`;
function profileFiles() {
    // Windows PowerShell 的 Documents 目录在中文系统下可能为本地化名称，此处按英文 "Documents" 定位；
    // 若目标机器实际目录不同，可自行调整。两个条目分别对应 pwsh 7 与 Windows PowerShell 5.1。
    return [
        path.join(os.homedir(), "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
        path.join(os.homedir(), "Documents", "WindowsPowerShell", "profile.ps1"),
    ];
}
function readProfile(file) {
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "") : "";
}
function writeProfile(file, block) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let content = readProfile(file);
    if (content.includes(INDEX_REPO_MARKER)) { console.log(`  ${file} 已包含 index-repo，跳过`); return; }
    if (content && !content.endsWith("\n")) content += "\n";
    if (content) content += "\n";
    if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak");
    // 统一 UTF-8 BOM：Windows PowerShell 5.1 靠 BOM 识别 UTF-8，否则中文注释/字符串会按 ANSI 误读
    fs.writeFileSync(file, "\uFEFF" + content + block, "utf8");
    console.log(`  ✅ 已写入 ${file}（备份 .bak）`);
}
function installIndexRepo() {
    const bin = findBinary();
    console.log("写入 index-repo 辅助函数到 PowerShell profile：");
    for (const f of profileFiles()) writeProfile(f, INDEX_REPO_FUNC);
    console.log("\n✅ 完成。新开终端即可用 index-repo（不传路径索引当前目录，自动定位 git root）。");
    if (bin) console.log(`   二进制: ${bin}`);
}
function removeIndexRepo() {
    for (const f of profileFiles()) {
        if (!fs.existsSync(f)) continue;
        const content = readProfile(f);
        if (!content.includes(INDEX_REPO_MARKER)) continue;
        const head = content.slice(0, content.indexOf(INDEX_REPO_MARKER)).replace(/\n+$/, "");
        fs.copyFileSync(f, f + ".bak");
        fs.writeFileSync(f, head ? "\uFEFF" + head + "\n" : "", "utf8");
        console.log(`  ✅ 已从 ${f} 移除 index-repo（备份 .bak）`);
    }
}

function findBinary() {
    const candidates = [];
    if (IS_WIN) {
        if (process.env.LOCALAPPDATA)
            candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "codebase-memory-mcp", EXE));
    } else {
        candidates.push(path.join(os.homedir(), ".local", "bin", EXE));
        candidates.push(path.join("/usr", "local", "bin", EXE));
    }
    for (const dir of (process.env.PATH || "").split(path.delimiter).filter(Boolean))
        candidates.push(path.join(dir, EXE));
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return null;
}
function binVersion(bin) {
    try { return execFileSync(bin, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return null; }
}
// Windows 下优先使用 pwsh（PowerShell 7），未安装则退回系统自带的 powershell（5.1）；
// 两者对 -NoProfile/-ExecutionPolicy/-File 参数兼容
function findPwsh() {
    if (!IS_WIN) return null;
    const candidates = [];
    for (const dir of (process.env.PATH || "").split(path.delimiter).filter(Boolean))
        candidates.push(path.join(dir, "pwsh.exe"));
    if (process.env.ProgramFiles)
        candidates.push(path.join(process.env.ProgramFiles, "PowerShell", "7", "pwsh.exe"));
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return null;
}

async function runInstaller() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cbm-setup-"));
    const scriptPath = path.join(tmp, IS_WIN ? "install.ps1" : "install.sh");
    console.log(`下载官方安装脚本: ${INSTALLER_URL}`);
    const res = await fetch(INSTALLER_URL);
    if (!res.ok) throw new Error(`安装脚本下载失败: HTTP ${res.status}`);
    fs.writeFileSync(scriptPath, Buffer.from(await res.arrayBuffer()));
    console.log("执行安装脚本（其内部校验 SHA-256 后安装）...");
    if (IS_WIN) {
        const pwsh = findPwsh();
        console.log(pwsh ? `使用 pwsh（PowerShell 7）: ${pwsh}` : "未检测到 pwsh，使用系统自带 powershell（5.1）");
        // Claude Code 常运行在 pwsh 7 下，子进程继承的 PSModulePath 含 PS7 模块路径，
        // 会让 Windows PowerShell 5.1 模块自动发现失败（官方脚本依赖的 Get-FileHash 不可用）。
        // 剔除该变量，由 5.1 重建自身默认模块路径。Windows 环境变量名大小写不敏感，需按键名匹配清除。
        const env = { ...process.env };
        for (const k of Object.keys(env)) if (k.toLowerCase() === "psmodulepath") delete env[k];
        execFileSync(pwsh || "powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { stdio: "inherit", env });
    } else {
        execFileSync("bash", [scriptPath], { stdio: "inherit" });
    }
}

function ensureUserMcp(bin) {
    const cfg = readJson(USER_CONFIG);
    const cur = cfg.mcpServers?.[SERVER_KEY];
    if (cur?.command) { console.log(`用户级 MCP 已注册: ${cur.command}`); return; }
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers[SERVER_KEY] = { command: bin, args: [] };
    writeJson(USER_CONFIG, cfg);
    console.log(`✅ 已写入用户级 MCP 条目 -> ${USER_CONFIG}（备份 .bak）`);
}
function ensureProjectMcp() {
    const cfg = readJson(PROJECT_MCP);
    if (cfg.mcpServers?.[SERVER_KEY]) { console.log("项目级 .mcp.json 已存在该条目，跳过"); return; }
    cfg.mcpServers = cfg.mcpServers || {};
    // 项目级用命令名而非绝对路径，保证团队各成员机器上可移植（依赖各自 PATH）
    cfg.mcpServers[SERVER_KEY] = { command: "codebase-memory-mcp", args: [] };
    writeJson(PROJECT_MCP, cfg);
    console.log(`✅ 已写入项目级 MCP 条目 -> ${PROJECT_MCP}（可提交共享给团队，依赖成员 PATH）`);
}
function ensureClaudeMd() {
    let content = fs.existsSync(CLAUDE_MD) ? fs.readFileSync(CLAUDE_MD, "utf8") : "";
    if (content.includes(MD_BEGIN)) { console.log("CLAUDE.md 已包含图谱指引块，跳过"); return; }
    if (content && !content.endsWith("\n")) content += "\n";
    if (content) content += "\n";
    if (fs.existsSync(CLAUDE_MD)) fs.copyFileSync(CLAUDE_MD, CLAUDE_MD + ".bak");
    fs.writeFileSync(CLAUDE_MD, content + MD_BLOCK + "\n");
    console.log(`✅ 已注入 CLAUDE.md 图谱指引块（标记 ${MD_BEGIN}，卸载时整块移除）`);
}

function status() {
    const bin = findBinary();
    console.log("codebase-memory-mcp 体检:");
    if (bin) {
        const v = binVersion(bin);
        console.log(`  二进制:      ${bin}${v ? `  (${v})` : "  （--version 执行失败！）"}`);
    } else {
        console.log("  二进制:      （未安装）");
    }
    const userEntry = readJson(USER_CONFIG).mcpServers?.[SERVER_KEY];
    console.log(`  用户级 MCP:  ${userEntry ? `已注册 (${userEntry.command})` : "未注册"}  <- ${USER_CONFIG}`);
    const projEntry = fs.existsSync(PROJECT_MCP) ? readJson(PROJECT_MCP).mcpServers?.[SERVER_KEY] : null;
    console.log(`  项目级 MCP:  ${projEntry ? "已注册" : "未注册"}  <- ${PROJECT_MCP}`);
    const hasMd = fs.existsSync(CLAUDE_MD) && fs.readFileSync(CLAUDE_MD, "utf8").includes(MD_BEGIN);
    console.log(`  CLAUDE.md:   ${hasMd ? "已注入图谱指引" : "未注入"}  <- ${CLAUDE_MD}`);
    if (!bin) console.log("\n下一步: node codebase-memory-setup.mjs install");
    else if (!projEntry) console.log("\n项目级注册（团队共享）: node codebase-memory-setup.mjs install --project");
}

async function install(withProject) {
    let bin = findBinary();
    if (!bin) {
        await runInstaller();
        bin = findBinary();
        if (!bin) throw new Error("安装脚本执行完毕但仍未找到二进制，请检查上方安装输出");
        console.log(`✅ 二进制已安装: ${bin}  (${binVersion(bin) || "版本未知"})`);
    } else {
        console.log(`二进制已存在: ${bin}  (${binVersion(bin) || "版本未知"})，跳过下载安装`);
    }
    ensureUserMcp(bin);
    if (withProject) {
        ensureProjectMcp();
        ensureClaudeMd();
    }
    console.log("\n✅ 完成。新开会话后 MCP 生效（会话内 /mcp 可验证）；首次使用让 Claude 调 index_repository 建索引，或终端执行:");
    console.log(`   "${bin}" cli index_repository --repo-path . --mode fast`);
    if (IS_WIN) console.log("   顺手装终端一键索引函数: node codebase-memory-setup.mjs install-index-repo");
    console.log("   其后由文件 watcher 自动增量更新。可视化: --ui=true 后访问 localhost:9749");
}

function uninstall(all) {
    let touched = false;
    if (fs.existsSync(PROJECT_MCP)) {
        const cfg = readJson(PROJECT_MCP);
        if (cfg.mcpServers?.[SERVER_KEY]) {
            delete cfg.mcpServers[SERVER_KEY];
            if (!Object.keys(cfg.mcpServers).length) delete cfg.mcpServers;
            writeJson(PROJECT_MCP, cfg);
            console.log("✅ 已移除 .mcp.json 中的 codebase-memory-mcp 条目");
            touched = true;
        }
    }
    if (fs.existsSync(CLAUDE_MD)) {
        const content = fs.readFileSync(CLAUDE_MD, "utf8");
        if (content.includes(MD_BEGIN)) {
            const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`\\n?${esc(MD_BEGIN)}[\\s\\S]*?${esc(MD_END)}\\n?`);
            fs.copyFileSync(CLAUDE_MD, CLAUDE_MD + ".bak");
            fs.writeFileSync(CLAUDE_MD, content.replace(re, "\n").replace(/\n{3,}/g, "\n\n"));
            console.log("✅ 已移除 CLAUDE.md 图谱指引块");
            touched = true;
        }
    }
    if (!touched) console.log("项目级无可移除条目。");
    if (!all) {
        console.log("（二进制与用户级配置保留；完全卸载: node codebase-memory-setup.mjs uninstall --all）");
        return;
    }
    removeIndexRepo();
    const bin = findBinary();
    if (bin) {
        if (process.stdin.isTTY) {
            console.log("调用上游 uninstall（可能询问是否删除图谱索引）...");
            execFileSync(bin, ["uninstall"], { stdio: "inherit" });
        } else {
            console.log("⚠️ 非交互环境，请在终端手动执行上游卸载（会询问是否删除图谱索引）:");
            console.log(`   "${bin}" uninstall`);
        }
    } else {
        console.log("二进制已不存在。");
    }
    // 兜底：二进制已不存在但用户级条目残留 -> 清掉
    const cfg = readJson(USER_CONFIG);
    if (cfg.mcpServers?.[SERVER_KEY] && !findBinary()) {
        delete cfg.mcpServers[SERVER_KEY];
        if (!Object.keys(cfg.mcpServers).length) delete cfg.mcpServers;
        writeJson(USER_CONFIG, cfg);
        console.log("✅ 已清理 ~/.claude.json 中的残留条目");
    }
}

const [cmd, flag] = process.argv.slice(2);
try {
    if (cmd === "status") {
        status();
    } else if (cmd === "install") {
        await install(flag === "--project");
    } else if (cmd === "uninstall") {
        uninstall(flag === "--all");
    } else if (cmd === "install-index-repo") {
        installIndexRepo();
    } else {
        console.log("用法: node codebase-memory-setup.mjs [status | install [--project] | uninstall [--all] | install-index-repo]");
    }
} catch (e) {
    console.error("❌ " + e.message);
    process.exit(1);
}
