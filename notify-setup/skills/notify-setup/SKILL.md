---
name: notify-setup
description: 安装/体检/卸载 Claude Code 等待通知：权限确认（约 6 秒无输入）或回答完毕空闲等待（约 60 秒）时，经 Notification hook 输出 OSC 9 序列让 Windows Terminal 弹系统通知；终端不支持 OSC 9 时可改用 terminal_bell 响铃兜底。确定性脚本可脱离 Claude Code 独立运行。
---

本 skill 是**薄壳**：核心逻辑在脚本 `notify-setup.mjs`（与本文件同目录）中，
你的职责只是执行脚本并转述结果，**不要自己手写 JSON 修改**。

## 执行方式

用户说「配置/开启等待通知」「Claude 等我确认时弹个通知」「响铃提醒」或调用 `/notify-setup` 时：

1. **用户明确要装**：一次 Bash 调用 `node <skill目录>/notify-setup.mjs install`
   （用户终端不支持 OSC 9、或明确表示只要响铃时加 `--bell`），原样转述输出。
2. **用户只想看状态**（「装了没」「通知体检」）：一次 Bash 调用 `status`，转述结果。
3. **意图模糊**：先 `status`，把体检结果交给用户，由用户决定下一步（两段）。
4. **卸载**：`uninstall` 移除本 skill 的 Notification 条目与 hook 脚本；
   `preferredNotifChannel`（bell 通道）保留并提示用户自行处理。
5. 脚本报错时把错误信息交给用户，不要尝试手工修复 JSON。
6. **答复末尾必须列出等效终端命令**：如
   `node ~/.claude/skills/notify-setup/notify-setup.mjs status`，
   并提示终端直跑不经过 LLM、下次更快。

## 子命令与数据流（了解即可，脚本已处理）

| 子命令 | 作用 |
|---|---|
| `status` | 体检：hook 脚本、settings.json 条目及 matcher、preferredNotifChannel |
| `install` | 复制 `notify-osc9.mjs` 到 `~/.claude/hooks/` + 合并 Notification 条目（matcher `permission_prompt\|idle_prompt`） |
| `install --bell` | 只设 `preferredNotifChannel=terminal_bell`（零依赖兜底，不装 hook） |
| `uninstall` | 移除本 skill 的 Notification 条目（按命令中的 `notify-osc9.mjs` 识别，不影响其他工具的条目）+ 删 hook 脚本 |

- 触发时机：`permission_prompt`（权限确认弹窗约 6 秒无输入）、`idle_prompt`（回答完毕约 60 秒无输入）
- hook 脚本读 stdin JSON 的 `.message` 作通知正文，输出 `terminalSequence`（OSC 9），
  由 Claude Code 经自己的终端写入路径发出序列（不依赖 hook 进程有控制终端）
- 所有 JSON / 脚本写入前自动 `.bak` 备份

## 注意事项

- **OSC 9 依赖终端支持**：Windows Terminal 原生支持；Tabby 等终端不弹通知时改用 `--bell` 响铃。
- `terminalSequence` 输出需 Claude Code v2.1.141+；`-p` 非交互模式与 Agent SDK 中会被忽略。
- 生效需打开一次 `/hooks`（触发配置重载）或新开会话。
- Windows 上 hook 默认经 Git Bash 执行；无 Git Bash 时回退 PowerShell，此时命令里的
  `$HOME` 写法不适用——脚本未覆盖该场景，遇到时提示用户手动改条目或加 `"shell": "powershell"`。
- Notification hook 不可阻塞，只做副作用，失败不影响主流程。
