#!/usr/bin/env node
// notify-setup.mjs —— Claude Code 等待通知（Notification hook）安装/体检/卸载（无 LLM 也可独立运行）
//
// 用法：
//   node notify-setup.mjs status           体检：hook 脚本 / settings.json 条目 / 响铃通道
//   node notify-setup.mjs install          安装 OSC 9 通知 hook（默认；Windows Terminal 弹系统通知）
//   node notify-setup.mjs install --bell   只设 terminal_bell 响铃（零依赖兜底，不装 hook）
//   node notify-setup.mjs uninstall        移除 OSC 9 hook 条目与脚本（bell 通道保留并提示）
//
// 数据流：notify-osc9.mjs（与本脚本同目录）→ ~/.claude/hooks/notify-osc9.mjs
//         + ~/.claude/settings.json 的 hooks.Notification 条目（写入前自动 .bak 备份）
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SRC = path.join(HERE, "notify-osc9.mjs");
const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const SETTINGS = path.join(CLAUDE_DIR, "settings.json");
const HOOK_DEST = path.join(CLAUDE_DIR, "hooks", "notify-osc9.mjs");
const MATCHER = "permission_prompt|idle_prompt";
const HOOK_COMMAND = 'node "$HOME/.claude/hooks/notify-osc9.mjs"';
const HOOK_MARKER = "notify-osc9.mjs"; // 识别本 skill 条目的标记（不区分 $HOME/$USERPROFILE 写法）

function readJson(file, fallback = {}) {
    if (!fs.existsSync(file)) return fallback;
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { throw new Error(`JSON 解析失败: ${file}（${e.message}），已中止，未做任何修改`); }
}
function writeJson(file, obj) {
    if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak");
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

// 返回 hooks.Notification 中属于本 skill 的条目下标（按命令里的 notify-osc9.mjs 识别，
// 不影响其他工具注册的 Notification 条目）
function ourEntryIndexes(cfg) {
    const arr = cfg.hooks?.Notification;
    if (!Array.isArray(arr)) return [];
    const idx = [];
    arr.forEach((e, i) => {
        if ((e.hooks || []).some(h => h.type === "command" && String(h.command).includes(HOOK_MARKER)))
            idx.push(i);
    });
    return idx;
}

function status() {
    const hasScript = fs.existsSync(HOOK_DEST);
    const cfg = readJson(SETTINGS);
    const idx = ourEntryIndexes(cfg);
    const bell = cfg.preferredNotifChannel;
    console.log("notify-setup 体检:");
    console.log(`  hook 脚本:  ${hasScript ? HOOK_DEST : "（未安装）"}`);
    console.log(`  hook 条目:  ${idx.length ? `已注册（matcher: ${cfg.hooks.Notification[idx[0]].matcher || "(空=全部通知)"}）` : "未注册"}  <- ${SETTINGS}`);
    console.log(`  响铃通道:   preferredNotifChannel = ${bell ?? "（未设置）"}`);
    if (!hasScript || !idx.length)
        console.log("\n下一步: node notify-setup.mjs install    （不支持 OSC 9 的终端: install --bell）");
}

function install(bell) {
    if (bell) {
        const cfg = readJson(SETTINGS);
        if (cfg.preferredNotifChannel === "terminal_bell") {
            console.log("preferredNotifChannel 已是 terminal_bell，跳过");
            return;
        }
        cfg.preferredNotifChannel = "terminal_bell";
        writeJson(SETTINGS, cfg);
        console.log(`✅ 已设置 preferredNotifChannel=terminal_bell -> ${SETTINGS}（备份 .bak）`);
        console.log("权限确认约 6 秒无输入 / 回答完毕空闲约 60 秒时终端响铃。新开会话生效。");
        return;
    }
    // 1. hook 脚本（内容一致则跳过，不一致先 .bak 再覆盖）
    if (!fs.existsSync(HOOK_SRC)) throw new Error(`hook 脚本源缺失: ${HOOK_SRC}`);
    fs.mkdirSync(path.dirname(HOOK_DEST), { recursive: true });
    if (fs.existsSync(HOOK_DEST) && fs.readFileSync(HOOK_DEST, "utf8") === fs.readFileSync(HOOK_SRC, "utf8")) {
        console.log(`hook 脚本已是最新: ${HOOK_DEST}`);
    } else {
        if (fs.existsSync(HOOK_DEST)) fs.copyFileSync(HOOK_DEST, HOOK_DEST + ".bak");
        fs.copyFileSync(HOOK_SRC, HOOK_DEST);
        console.log(`✅ 已写入 hook 脚本 -> ${HOOK_DEST}`);
    }
    // 2. settings.json 条目（已有本 skill 条目则跳过，其他工具的 Notification 条目不动）
    const cfg = readJson(SETTINGS);
    if (ourEntryIndexes(cfg).length) {
        console.log("settings.json 已存在本 hook 条目，跳过");
    } else {
        cfg.hooks = cfg.hooks || {};
        cfg.hooks.Notification = cfg.hooks.Notification || [];
        cfg.hooks.Notification.push({
            matcher: MATCHER,
            hooks: [{ type: "command", command: HOOK_COMMAND, timeout: 5 }],
        });
        writeJson(SETTINGS, cfg);
        console.log(`✅ 已写入 Notification hook（matcher: ${MATCHER}）-> ${SETTINGS}（备份 .bak）`);
    }
    console.log("\n✅ 完成。权限确认约 6 秒无输入 / 回答完毕空闲约 60 秒时，终端弹系统通知。");
    console.log("生效：打开一次 /hooks 或新开会话。终端需支持 OSC 9（Windows Terminal 原生支持），不支持则改用 --bell。");
}

function uninstall() {
    let touched = false;
    const cfg = readJson(SETTINGS);
    const idx = ourEntryIndexes(cfg);
    if (idx.length) {
        cfg.hooks.Notification = cfg.hooks.Notification.filter((_, i) => !idx.includes(i));
        if (!cfg.hooks.Notification.length) delete cfg.hooks.Notification;
        if (!Object.keys(cfg.hooks).length) delete cfg.hooks;
        writeJson(SETTINGS, cfg);
        console.log("✅ 已移除 settings.json 中的 notify-osc9 条目（备份 .bak）");
        touched = true;
    }
    if (fs.existsSync(HOOK_DEST)) {
        fs.copyFileSync(HOOK_DEST, HOOK_DEST + ".bak");
        fs.rmSync(HOOK_DEST);
        console.log("✅ 已删除 hook 脚本（备份 notify-osc9.mjs.bak）");
        touched = true;
    }
    if (!touched) console.log("无可移除条目。");
    if (readJson(SETTINGS).preferredNotifChannel === "terminal_bell")
        console.log("（preferredNotifChannel=terminal_bell 保留；如需移除用 /config 或手动改 settings.json）");
}

const [cmd, flag] = process.argv.slice(2);
try {
    if (cmd === "status") {
        status();
    } else if (cmd === "install") {
        install(flag === "--bell");
    } else if (cmd === "uninstall") {
        uninstall();
    } else {
        console.log("用法: node notify-setup.mjs [status | install [--bell] | uninstall]");
    }
} catch (e) {
    console.error("❌ " + e.message);
    process.exit(1);
}
