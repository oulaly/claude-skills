#!/usr/bin/env node
// notify.mjs -- Claude Code Notification/Stop hook（运行时自适应通道）：
//   Windows Terminal（WT_SESSION 为 GUID）-> 输出 terminalSequence 弹系统通知；
//   Tabby（TERM_PROGRAM=Tabby，其 WT_SESSION=0 是假阳性）等其他终端 -> 调 powershell.exe 弹 Windows 原生 toast（WinRT，无第三方模块）。
//   Stop 事件额外把完成时刻写入 ~/.claude/hooks/.last-reply-<session_id>（epoch 毫秒），
//   供 statusline-setup 的状态栏显示「回复 HH:MM X分前」（读小文件，避开 transcript 活文件的 I/O 争用）。
// 从 stdin JSON 取 .message 作通知正文，并附「项目名 · 终端」来源标识；NOTIFY_MODE=osc9|toast 可强制指定通道（调试用）。
// 不用 \uXXXX 转义：控制字符一律用 String.fromCharCode 构造，避免源码被多层解码破坏。
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
    // 点击通知 -> 协议激活 claude-notify: -> notify-focus.ps1 聚焦来源终端窗口
    "$u = $env:NOTIFY_LAUNCH",
    "if ($u) { $t.DocumentElement.SetAttribute('activationType','protocol'); $t.DocumentElement.SetAttribute('launch',$u) }",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show($n)",
].join("\n");

function toast(message, launch) {
    const env = { ...process.env, NOTIFY_MSG: message };
    if (launch) env.NOTIFY_LAUNCH = launch;
    delete env.PSModulePath; // 继承 pwsh7 的 PSModulePath 会破坏 powershell.exe(5.1) 子进程
    const enc = Buffer.from(TOAST_PS, "utf16le").toString("base64");
    // 不能 detached+unref 即发即忘：hook 进程一退出，尚未 Show() 的 toast 子进程会被一起
    // 清理掉（通知静默丢失）。同步等子进程退出（约 1s，远小于 hook timeout 5s），
    // 子进程句柄会自然挂住 node 事件循环，进程随子进程退出而结束。
    spawn("powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc],
        { env, stdio: "ignore", windowsHide: true });
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

// 来源标识「项目名 · 终端」：区分是哪个程序的哪个标签弹的通知。
// 项目名取 hook stdin JSON 的 cwd 末级目录（通常一个标签对应一个项目）；
// 终端判定与 detectMode 同规则（TERM_PROGRAM 原名展示，如 Tabby/vscode）。
function sourceSuffix(env, cwd) {
    const term = (env.TERM_PROGRAM || "").toLowerCase() === "tabby" ? "Tabby"
        : env.WT_SESSION && env.WT_SESSION !== "0" ? "Windows Terminal"
        : env.TERM_PROGRAM || "";
    const proj = cwd ? path.basename(String(cwd).replace(/[\\/]+$/, "")) : "";
    return [proj, term].filter(Boolean).join(" · ");
}

// 点击通知聚焦来源终端窗口：claude-notify:<enc("项目名|终端进程名")>。
// 协议由 notify-setup.mjs install 注册（notify-focus.ps1 处理）；
// 传终端**进程名**（Tabby/WindowsTerminal/Code）而非显示名--Claude Code 会动态改写
// 终端标题（转轮+任务描述），标题匹配不可靠，聚焦脚本主要按进程名找窗口。
// 只能聚焦到窗口粒度，终端标签无法从外部切换。
function launchUri(env, cwd) {
    const term = (env.TERM_PROGRAM || "").toLowerCase() === "tabby" ? "Tabby"
        : env.WT_SESSION && env.WT_SESSION !== "0" ? "WindowsTerminal"
        : (env.TERM_PROGRAM || "").toLowerCase() === "vscode" ? "Code"
        : env.TERM_PROGRAM || "";
    const proj = cwd ? path.basename(String(cwd).replace(/[\\/]+$/, "")) : "";
    if (!proj && !term) return "";
    return "claude-notify:" + encodeURIComponent([proj, term].join("|"));
}

let d = "";
process.stdin.on("data", (c) => (d += c)).on("end", () => {
    let evt = "";
    let sessionId = "";
    let m = null;
    let cwd = "";
    try {
        const j = JSON.parse(d);
        evt = j.hook_event_name || "";
        sessionId = j.session_id || "";
        m = j.message || null;
        cwd = j.cwd || "";
    } catch { /* stdin 非 JSON 时用默认文案 */ }
    // Stop（回答完毕，立即触发）用专属文案；Notification 沿用其 .message
    if (evt === "Stop") {
        m = m || "回答完毕，等你回来";
        // 写状态文件供 statusline 显示「回复时间」（会话粒度；失败静默，不影响通知）
        try {
            const dir = path.join(os.homedir(), ".claude", "hooks");
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `.last-reply-${sessionId || "default"}`), String(Date.now()));
        } catch { /* 忽略：状态栏缺时间不影响通知 */ }
    }
    m = m || "Claude Code 需要你的关注";
    // 附上来源标识，分清是哪个程序的哪个标签弹的
    const src = sourceSuffix(process.env, cwd);
    if (src) m = `${m}｜${src}`;
    // 所有 < 0x20 的控制字符（BEL/ESC/换行等）替换为空格，防止破坏 OSC 序列 / toast 文本
    m = String(m).split("").map((c) => (c.charCodeAt(0) < 32 ? " " : c)).join("").replace(/ {2,}/g, " ").trim()
        || "Claude Code 需要你的关注";
    if (detectMode(process.env) === "osc9") {
        process.stdout.write(JSON.stringify({ terminalSequence: ESC + "]9;" + m + BEL }));
    } else {
        toast(m, launchUri(process.env, cwd));
    }
});
