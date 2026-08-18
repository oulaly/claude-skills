#!/usr/bin/env node
// notify-setup.mjs —— Claude Code 等待通知（Notification hook）安装/体检/卸载（无 LLM 也可独立运行）
//
// 用法：
//   node notify-setup.mjs status           体检：hook 脚本 / settings.json 条目 / 响铃通道 / 当前终端通道判定
//   node notify-setup.mjs install          安装自适应通知 hook（默认；OSC 9 与 Windows toast 运行时自动选择）
//   node notify-setup.mjs install --bell   只设 terminal_bell 响铃（零依赖兜底，不装 hook）
//   node notify-setup.mjs uninstall        移除本 skill 的 hook 条目与脚本（bell 通道保留并提示）
//
// 数据流：notify.mjs（与本脚本同目录）→ ~/.claude/hooks/notify.mjs
//         + ~/.claude/settings.json 的 hooks.Notification 条目（写入前自动 .bak 备份）
//         旧版 notify-osc9.mjs 条目/脚本在 install/uninstall 时自动迁移清理
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SRC = path.join(HERE, "notify.mjs");
const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const SETTINGS = path.join(CLAUDE_DIR, "settings.json");
const HOOK_DEST = path.join(CLAUDE_DIR, "hooks", "notify.mjs");
const LEGACY_DEST = path.join(CLAUDE_DIR, "hooks", "notify-osc9.mjs");
const MATCHER = "permission_prompt|idle_prompt";
const HOOK_COMMAND = 'node "$HOME/.claude/hooks/notify.mjs"';
// 识别本 skill 条目的标记：新版 notify.mjs 与旧版 notify-osc9.mjs（不区分 $HOME/$USERPROFILE 写法）
const HOOK_MARKER = /notify(-osc9)?\.mjs/;

function readJson(file, fallback = {}) {
    if (!fs.existsSync(file)) return fallback;
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { throw new Error(`JSON 解析失败: ${file}（${e.message}），已中止，未做任何修改`); }
}
function writeJson(file, obj) {
    if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak");
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

// 当前终端会走哪条通道（与 notify.mjs 的 detectMode 保持一致；可用 NOTIFY_MODE 覆盖）
function channelGuess() {
    const env = process.env;
    const mode = (env.NOTIFY_MODE === "osc9" || env.NOTIFY_MODE === "toast") ? env.NOTIFY_MODE
        : (env.TERM_PROGRAM || "").toLowerCase() === "tabby" ? "toast"
        : (env.WT_SESSION && env.WT_SESSION !== "0") ? "osc9" : "toast";
    return mode === "osc9" ? "OSC 9（Windows Terminal）" : "Windows toast（Tabby/其他终端）";
}

// 返回 hooks.Notification 中属于本 skill 的条目下标（按命令里的 notify.mjs / notify-osc9.mjs 识别，
// 不影响其他工具注册的 Notification 条目）
function ourEntryIndexes(cfg) {
    const arr = cfg.hooks?.Notification;
    if (!Array.isArray(arr)) return [];
    const idx = [];
    arr.forEach((e, i) => {
        if ((e.hooks || []).some(h => h.type === "command" && HOOK_MARKER.test(String(h.command))))
            idx.push(i);
    });
    return idx;
}

// 移除 settings.json 中本 skill 的 Notification 条目（含旧版 osc9 条目）；返回是否改动
function removeEntries(cfg) {
    const idx = ourEntryIndexes(cfg);
    if (!idx.length) return false;
    cfg.hooks.Notification = cfg.hooks.Notification.filter((_, i) => !idx.includes(i));
    if (!cfg.hooks.Notification.length) delete cfg.hooks.Notification;
    if (!Object.keys(cfg.hooks).length) delete cfg.hooks;
    return true;
}

// 删除 hook 脚本（先 .bak 备份）；返回是否改动
function removeScript(dest) {
    if (!fs.existsSync(dest)) return false;
    fs.copyFileSync(dest, dest + ".bak");
    fs.rmSync(dest);
    return true;
}

function status() {
    const hasScript = fs.existsSync(HOOK_DEST);
    const hasLegacy = fs.existsSync(LEGACY_DEST);
    const cfg = readJson(SETTINGS);
    const idx = ourEntryIndexes(cfg);
    const bell = cfg.preferredNotifChannel;
    console.log("notify-setup 体检:");
    console.log(`  hook 脚本:  ${hasScript ? HOOK_DEST : "（未安装）"}${hasLegacy ? "（另发现旧版 notify-osc9.mjs，install 时会清理）" : ""}`);
    console.log(`  hook 条目:  ${idx.length ? `已注册（matcher: ${cfg.hooks.Notification[idx[0]].matcher || "(空=全部通知)"}）` : "未注册"}  <- ${SETTINGS}`);
    console.log(`  响铃通道:   preferredNotifChannel = ${bell ?? "（未设置）"}`);
    console.log(`  当前终端:   ${channelGuess()}（NOTIFY_MODE=osc9|toast 可强制覆盖）`);
    if (!hasScript || !idx.length)
        console.log("\n下一步: node notify-setup.mjs install    （零依赖响铃兜底: install --bell）");
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
    // 0. 迁移：清掉旧版 notify-osc9 条目与脚本（新版条目不删，下面幂等处理）
    const cfg = readJson(SETTINGS);
    const legacyIdx = ourEntryIndexes(cfg).filter(i =>
        (cfg.hooks.Notification[i].hooks || []).some(h => String(h.command).includes("notify-osc9.mjs")));
    if (legacyIdx.length) {
        cfg.hooks.Notification = cfg.hooks.Notification.filter((_, i) => !legacyIdx.includes(i));
        console.log("已移除旧版 notify-osc9 hook 条目（迁移到自适应版）");
    }
    if (removeScript(LEGACY_DEST)) console.log("已删除旧版 hook 脚本（备份 notify-osc9.mjs.bak）");
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
    // 2. settings.json 条目（已有本 skill 新版条目则跳过，其他工具的 Notification 条目不动）
    if (ourEntryIndexes(cfg).length) {
        if (legacyIdx.length) writeJson(SETTINGS, cfg); // 只做了迁移删除，落盘
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
    console.log(`\n✅ 完成。权限确认约 6 秒无输入 / 回答完毕空闲约 60 秒时通知（当前终端通道: ${channelGuess()}）。`);
    console.log("hook 运行时自适应：Windows Terminal 走 OSC 9，其他终端走 Windows 原生 toast，换终端无需重装。");
    console.log("生效：打开一次 /hooks 或新开会话。");
}

function uninstall() {
    let touched = false;
    const cfg = readJson(SETTINGS);
    if (removeEntries(cfg)) {
        writeJson(SETTINGS, cfg);
        console.log("✅ 已移除 settings.json 中的 notify hook 条目（备份 .bak）");
        touched = true;
    }
    if (removeScript(HOOK_DEST)) {
        console.log("✅ 已删除 hook 脚本（备份 notify.mjs.bak）");
        touched = true;
    }
    if (removeScript(LEGACY_DEST)) {
        console.log("✅ 已删除旧版 hook 脚本（备份 notify-osc9.mjs.bak）");
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
