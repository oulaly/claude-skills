#!/usr/bin/env node
// notify-osc9.mjs —— Claude Code Notification hook：输出 terminalSequence（OSC 9），
// 让支持 OSC 9 的终端（如 Windows Terminal）弹系统通知。从 stdin JSON 取 .message 作通知正文。
// 不用 \uXXXX 转义：控制字符一律用 String.fromCharCode 构造，避免源码被多层解码破坏。
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

let d = "";
process.stdin.on("data", (c) => (d += c)).on("end", () => {
    let m = "Claude Code 需要你的关注";
    try { m = JSON.parse(d).message || m; } catch { /* stdin 非 JSON 时用默认文案 */ }
    // 所有 < 0x20 的控制字符（BEL/ESC/换行等）替换为空格，防止破坏 OSC 序列
    m = String(m).split("").map((c) => (c.charCodeAt(0) < 32 ? " " : c)).join("").replace(/ {2,}/g, " ").trim()
        || "Claude Code 需要你的关注";
    process.stdout.write(JSON.stringify({ terminalSequence: ESC + "]9;" + m + BEL }));
});
