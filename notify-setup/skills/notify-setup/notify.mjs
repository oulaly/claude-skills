#!/usr/bin/env node
// notify.mjs —— Claude Code Notification hook（运行时自适应通道）：
//   Windows Terminal（WT_SESSION 为 GUID）→ 输出 terminalSequence 弹系统通知；
//   Tabby（TERM_PROGRAM=Tabby，其 WT_SESSION=0 是假阳性）等其他终端 → 调 powershell.exe 弹 Windows 原生 toast（WinRT，无第三方模块）。
// 从 stdin JSON 取 .message 作通知正文；NOTIFY_MODE=osc9|toast 可强制指定通道（调试用）。
// 不用 \uXXXX 转义：控制字符一律用 String.fromCharCode 构造，避免源码被多层解码破坏。
import { spawn } from "node:child_process";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

// PowerShell toast 脚本（PS 5.1 语法；经 -EncodedCommand 传入避免引号/编码问题；
// 正文走 NOTIFY_MSG 环境变量，支持任意 Unicode 文本）
const TOAST_PS = [
    "$m = $env:NOTIFY_MSG",
    "if (-not $m) { $m = 'Claude Code' }",
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
    "$x = $t.GetElementsByTagName('text')",
    "$x.Item(0).AppendChild($t.CreateTextNode('Claude Code')) | Out-Null",
    "$x.Item(1).AppendChild($t.CreateTextNode($m)) | Out-Null",
    "$n = New-Object Windows.UI.Notifications.ToastNotification $t",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show($n)",
].join("\n");

function toast(message) {
    const env = { ...process.env, NOTIFY_MSG: message };
    delete env.PSModulePath; // 继承 pwsh7 的 PSModulePath 会破坏 powershell.exe(5.1) 子进程
    const enc = Buffer.from(TOAST_PS, "utf16le").toString("base64");
    const child = spawn("powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc],
        { env, detached: true, stdio: "ignore" });
    child.unref(); // 即发即忘：hook 不阻塞等待 toast 进程
}

// 通道判定（与 notify-setup.mjs 的 channelGuess 保持一致）：
// TERM_PROGRAM 最权威（Tabby 会设 TERM_PROGRAM=Tabby，且 Tabby 里 WT_SESSION=0 是假阳性）；
// 无 TERM_PROGRAM 时看 WT_SESSION（Windows Terminal 为 GUID）；都不明则走 toast（Windows 上总是可用）。
function detectMode(env) {
    if (env.NOTIFY_MODE === "osc9" || env.NOTIFY_MODE === "toast") return env.NOTIFY_MODE;
    if ((env.TERM_PROGRAM || "").toLowerCase() === "tabby") return "toast";
    if (env.WT_SESSION && env.WT_SESSION !== "0") return "osc9";
    return "toast";
}

let d = "";
process.stdin.on("data", (c) => (d += c)).on("end", () => {
    let evt = "";
    let m = null;
    try {
        const j = JSON.parse(d);
        evt = j.hook_event_name || "";
        m = j.message || null;
    } catch { /* stdin 非 JSON 时用默认文案 */ }
    // Stop（回答完毕，立即触发）用专属文案；Notification 沿用其 .message
    if (evt === "Stop") m = m || "回答完毕，等你回来";
    m = m || "Claude Code 需要你的关注";
    // 所有 < 0x20 的控制字符（BEL/ESC/换行等）替换为空格，防止破坏 OSC 序列 / toast 文本
    m = String(m).split("").map((c) => (c.charCodeAt(0) < 32 ? " " : c)).join("").replace(/ {2,}/g, " ").trim()
        || "Claude Code 需要你的关注";
    if (detectMode(process.env) === "osc9") {
        process.stdout.write(JSON.stringify({ terminalSequence: ESC + "]9;" + m + BEL }));
    } else {
        toast(m);
    }
});
