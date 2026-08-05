#!/usr/bin/env node
// provider-switch.mjs —— 项目级模型供应商切换脚本（无 LLM 也可独立运行）
//
// 用法：
//   node provider-switch.mjs              交互式菜单（编号选择）
//   node provider-switch.mjs list         列出供应商与当前项目状态
//   node provider-switch.mjs use <slug>   直接切换到指定供应商
//   node provider-switch.mjs use --global 清除项目级配置（跟随全局）
//   node provider-switch.mjs add          交互式新增供应商到清单
//
// 数据流：
//   清单  ~/.claude/providers.json  →  项目 .claude/settings.json（非密钥 env）
//                                     项目 .claude/settings.local.json（token）
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

const REG_PATH = path.join(os.homedir(), ".claude", "providers.json");
const PROJECT_DIR = process.cwd();
const CLAUDE_DIR = path.join(PROJECT_DIR, ".claude");
const SETTINGS = path.join(CLAUDE_DIR, "settings.json");
const SETTINGS_LOCAL = path.join(CLAUDE_DIR, "settings.local.json");
const GITIGNORE = path.join(PROJECT_DIR, ".gitignore");
const PROVIDER_KEY_RE = /^ANTHROPIC_/;

const mask = t => (t ? t.slice(0, 7) + "..." + t.slice(-4) : "(无)");

function readJson(file, fallback = {}) {
    if (!fs.existsSync(file)) return fallback;
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { throw new Error(`JSON 解析失败: ${file}（${e.message}），已中止，未做任何修改`); }
}
function writeJson(file, obj) {
    if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak");
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}
function loadRegistry() {
    if (!fs.existsSync(REG_PATH)) throw new Error(`供应商清单不存在: ${REG_PATH}，请先运行 add 或从 cc-switch 导入`);
    return readJson(REG_PATH).providers || {};
}
function currentProjectProvider(providers) {
    const env = readJson(SETTINGS).env || {};
    const url = (env.ANTHROPIC_BASE_URL || "").replace(/\/+$/, "");
    if (!url) return "(跟随全局)";
    for (const [slug, p] of Object.entries(providers)) {
        if ((p.env.ANTHROPIC_BASE_URL || "").replace(/\/+$/, "") === url) return `${slug} (${p.label})`;
    }
    return `未知供应商 (${url})`;
}

function applyProvider(slug, p) {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    // settings.json：清掉旧 ANTHROPIC_*，写入新供应商的非密钥 env
    const s = readJson(SETTINGS);
    s.env = s.env || {};
    for (const k of Object.keys(s.env)) if (PROVIDER_KEY_RE.test(k)) delete s.env[k];
    Object.assign(s.env, p.env);
    if (!Object.keys(s.env).length) delete s.env;
    writeJson(SETTINGS, s);
    // settings.local.json：只放 token
    const sl = readJson(SETTINGS_LOCAL);
    sl.env = sl.env || {};
    for (const k of Object.keys(sl.env)) if (PROVIDER_KEY_RE.test(k)) delete sl.env[k];
    if (p.token) sl.env.ANTHROPIC_AUTH_TOKEN = p.token;
    if (!Object.keys(sl.env).length) delete sl.env;
    writeJson(SETTINGS_LOCAL, sl);
    ensureGitignore();
    console.log(`✅ 已切换项目供应商 -> ${slug} (${p.label})`);
    console.log(`   BASE_URL: ${p.env.ANTHROPIC_BASE_URL || "-"}`);
    console.log(`   MODEL:    ${p.env.ANTHROPIC_MODEL || "-"}`);
    console.log(`   token:    ${mask(p.token)}（写入 .claude/settings.local.json）`);
    console.log("   新开会话后生效。");
}

function followGlobal() {
    for (const f of [SETTINGS, SETTINGS_LOCAL]) {
        if (!fs.existsSync(f)) continue;
        const j = readJson(f);
        if (!j.env) continue;
        for (const k of Object.keys(j.env)) if (PROVIDER_KEY_RE.test(k)) delete j.env[k];
        if (!Object.keys(j.env).length) delete j.env;
        writeJson(f, j);
    }
    console.log("✅ 已清除项目级 ANTHROPIC_* 配置，本项目将跟随全局配置。");
}

function ensureGitignore() {
    const entry = ".claude/settings.local.json";
    let content = fs.existsSync(GITIGNORE) ? fs.readFileSync(GITIGNORE, "utf8") : "";
    const ignored = content.split("\n").some(l => l.trim() === entry || l.trim() === "settings.local.json");
    if (!ignored) {
        fs.appendFileSync(GITIGNORE, (content.endsWith("\n") || !content ? "" : "\n") + entry + "\n");
        console.log(`   已将 ${entry} 加入 .gitignore`);
    }
}

async function menu(providers) {
    const slugs = Object.keys(providers);
    const current = currentProjectProvider(providers);
    console.log(`当前项目供应商: ${current}\n`);
    slugs.forEach((s, i) => {
        const p = providers[s];
        console.log(`  ${i + 1}) ${s} — ${p.label}  [${p.env.ANTHROPIC_BASE_URL || ""}]`);
    });
    console.log(`  0) 跟随全局（清除项目级配置）`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(res => rl.question("\n请选择编号: ", res));
    rl.close();
    const n = parseInt(answer.trim(), 10);
    if (n === 0) return followGlobal();
    if (n >= 1 && n <= slugs.length) return applyProvider(slugs[n - 1], providers[slugs[n - 1]]);
    console.log("无效选择，未做任何修改。");
}

async function addProvider() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = q => new Promise(res => rl.question(q, res));
    const slug = (await ask("slug（小写字母/数字/中划线）: ")).trim();
    const label = (await ask("显示名: ")).trim();
    const baseUrl = (await ask("ANTHROPIC_BASE_URL: ")).trim();
    const model = (await ask("ANTHROPIC_MODEL: ")).trim();
    const token = (await ask("token（可留空）: ")).trim();
    rl.close();
    if (!slug || !baseUrl) { console.log("slug 与 BASE_URL 必填，已取消。"); return; }
    const reg = readJson(REG_PATH, { providers: {} });
    reg.providers = reg.providers || {};
    if (reg.providers[slug]) { console.log(`slug ${slug} 已存在，已取消。`); return; }
    reg.providers[slug] = { label: label || slug, env: { ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_MODEL: model }, token };
    writeJson(REG_PATH, reg);
    console.log(`✅ 已新增供应商 ${slug} 到 ${REG_PATH}`);
}

const [cmd, arg] = process.argv.slice(2);
try {
    if (cmd === "list") {
        const providers = loadRegistry();
        console.log(`当前项目供应商: ${currentProjectProvider(providers)}\n清单 (${REG_PATH}):`);
        for (const [slug, p] of Object.entries(providers)) {
            console.log(`  ${slug} — ${p.label}  [${p.env.ANTHROPIC_BASE_URL || ""}]  token=${mask(p.token)}`);
        }
    } else if (cmd === "use" && arg === "--global") {
        followGlobal();
    } else if (cmd === "use" && arg) {
        const providers = loadRegistry();
        if (!providers[arg]) throw new Error(`未知供应商: ${arg}（可选: ${Object.keys(providers).join(", ")}）`);
        applyProvider(arg, providers[arg]);
    } else if (cmd === "add") {
        await addProvider();
    } else if (!cmd) {
        await menu(loadRegistry());
    } else {
        console.log("用法: node provider-switch.mjs [list | use <slug> | use --global | add]");
    }
} catch (e) {
    console.error("❌ " + e.message);
    process.exit(1);
}
