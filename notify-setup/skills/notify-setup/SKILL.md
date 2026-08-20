---
name: notify-setup
description: 安装/体检/卸载 Claude Code 等待通知：权限确认（约 6 秒无输入）时经 Notification hook 通知，回答完毕立即经 Stop hook 通知——Windows Terminal 走 OSC 9 弹系统通知，Tabby 等其他终端走 PowerShell Windows 原生 toast；另提供 terminal_bell 响铃兜底。确定性脚本可脱离 Claude Code 独立运行。
---

本 skill 是**薄壳**：核心逻辑在脚本 `notify-setup.mjs`（与本文件同目录）中，
你的职责只是执行脚本并转述结果，**不要自己手写 JSON 修改**。

## 执行方式

用户说「配置/开启等待通知」「Claude 等我确认时弹个通知」「响铃提醒」或调用 `/notify-setup` 时：

1. **用户明确要装**：一次 Bash 调用 `node <skill目录>/notify-setup.mjs install`，原样转述输出。
   （用户明确表示只要响铃时用 `install --bell`。）
2. **用户只想看状态**（「装了没」「通知体检」）：一次 Bash 调用 `status`，转述结果。
3. **意图模糊**：先 `status`，把体检结果交给用户，由用户决定下一步（两段）。
4. **卸载**：`uninstall` 移除本 skill 的 Notification 条目与 hook 脚本（含旧版 notify-osc9）；
   `preferredNotifChannel`（bell 通道）保留并提示用户自行处理。
5. 脚本报错时把错误信息交给用户，不要尝试手工修复 JSON。
6. **答复末尾必须列出等效终端命令**：如
   `node ~/.claude/skills/notify-setup/notify-setup.mjs status`，
   并提示终端直跑不经过 LLM、下次更快。

## 子命令与数据流（了解即可，脚本已处理）

| 子命令 | 作用 |
|---|---|
| `status` | 体检：hook 脚本、Notification/Stop 条目、preferredNotifChannel、claude-notify: 协议、当前终端通道判定 |
| `install` | 复制 `notify.mjs` 到 `~/.claude/hooks/` + 合并 Notification 条目（matcher `permission_prompt`，旧 matcher 自动升级）与 Stop 条目（回答完毕立即通知）+ 复制聚焦脚本并注册 `claude-notify:` 协议；自动迁移清理旧版 notify-osc9 条目/脚本 |
| `install --bell` | 只设 `preferredNotifChannel=terminal_bell`（零依赖兜底，不装 hook） |
| `uninstall` | 移除本 skill 的 Notification/Stop 条目（按命令中的 `notify.mjs`/`notify-osc9.mjs` 识别，不影响其他工具的条目）+ 删 hook/聚焦脚本 + 注销 `claude-notify:` 协议 |

- 触发时机：
  - `Stop` hook：**每次回答完毕立即通知**（推荐主通道，不等空闲计时）；
    同时把完成时刻写入 `~/.claude/hooks/.last-reply-<session_id>`（epoch 毫秒），
    供 statusline-setup 的状态栏显示「回复 HH:MM X分前」（写失败静默，不影响通知）
  - `Notification` hook（matcher `permission_prompt`）：权限确认弹窗约 6 秒无输入时
    （**不含** `idle_prompt`：回答完毕已由 Stop 立即通知，再加 60 秒空闲兜底会重复弹、显得误报；空闲响铃仍由 `preferredNotifChannel=terminal_bell` 负责）
- **通道自适应**（hook 运行时判定，换终端无需重装）：
  - `TERM_PROGRAM=Tabby` → Windows toast（注意 Tabby 里 `WT_SESSION=0` 是假阳性，不能据此判 OSC 9）
  - `WT_SESSION` 为 GUID（Windows Terminal）→ 输出 `terminalSequence`（OSC 9）弹系统通知
  - 其他/不明终端 → 调 `powershell.exe` 弹 Windows 原生 toast（WinRT，无第三方模块；同步等子进程退出约 1s——不能即发即忘，否则 hook 退出时 toast 子进程被连带清理、通知静默丢失）
  - `NOTIFY_MODE=osc9|toast` 环境变量可强制指定通道（调试用）
- hook 脚本读 stdin JSON 的 `.message` 作通知正文，并附「项目名 · 终端」来源标识（取 stdin 的 `cwd` 末级目录 + TERM_PROGRAM/WT_SESSION 判定），分清是哪个程序的哪个标签弹的；toast 正文经 `NOTIFY_MSG` 环境变量传递，PS 脚本经 `-EncodedCommand` 传入
- 所有 JSON / 脚本写入前自动 `.bak` 备份
- **点击聚焦**（仅 toast 通道）：toast 经协议激活携带 `claude-notify:项目|终端进程名`，点击时
  `notify-focus.ps1` 聚焦来源终端窗口--主要按**终端进程名**找窗口（Tabby/WindowsTerminal/Code；Claude Code 会动态改写终端标题成「转轮+任务描述」，标题匹配不可靠），同进程多窗口时优先标题含项目名的；
  处理链为 `wscript notify-focus.vbs`（隐藏启动 PS）-> `notify-focus.ps1`——必须经 wscript 中转，
  直接跑 powershell.exe 在 Win11「默认终端应用=Windows Terminal」时点击通知会新开一个 WT 窗口；
  只能到**窗口粒度**，终端标签无法从外部切换；协议注册在 `HKCU\Software\Classes\claude-notify`，
  uninstall 时移除

## 注意事项

- **OSC 9 通道**：依赖终端支持（Windows Terminal 原生支持；WT 默认只在窗口失焦时弹 toast）；
  `terminalSequence` 输出需 Claude Code v2.1.141+，`-p` 非交互模式与 Agent SDK 中会被忽略。
- **toast 通道**：依赖 `powershell.exe`（Windows 自带 5.1）+ WinRT，toast 归属应用名显示为「Claude Code」；
  系统专注助手或通知设置可能屏蔽 toast。
- 生效需打开一次 `/hooks`（触发配置重载）或新开会话。
- Windows 上 hook 默认经 Git Bash 执行；无 Git Bash 时回退 PowerShell，此时命令里的
  `$HOME` 写法不适用——脚本未覆盖该场景，遇到时提示用户手动改条目或加 `"shell": "powershell"`。
- Notification hook 不可阻塞，只做副作用，失败不影响主流程。
