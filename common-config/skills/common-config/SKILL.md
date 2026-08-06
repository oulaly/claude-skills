---
name: common-config
description: 把一组通用 Claude Code 偏好（env 开关等，固化在 snippet.json）一键合并进全局 ~/.claude/settings.json，用于新机器/重装后快速统一配置。支持 show/diff/apply，确定性脚本可脱离 Claude Code 独立运行。
---

本 skill 是**薄壳**：核心逻辑在脚本 `common-config.mjs`（与本文件同目录）中，
你的职责只是执行脚本并转述结果，**不要自己手写 JSON 修改**。

## 执行方式

用户说「统一/应用通用配置」「看下通用配置差异」或调用 `/common-config` 时：

1. **用户明确要写入**（说了「应用」「套上」「统一配置」）：
   **一段完成**——直接一次 Bash 调用 `node <skill目录>/common-config.mjs apply`，
   原样转述输出。apply 内部会先打印差异再写入，无需先跑 diff。
2. **用户只想查看**：一次 Bash 调用 `show`（看片段）或 `diff`（看与本机的差异），转述结果。
3. **意图模糊**：先 `diff`，把差异交给用户确认，用户同意后再 `apply`（两段）。
4. 脚本报错时把错误信息交给用户，不要尝试手工修复 JSON。
5. **答复末尾必须列出等效终端命令**：附上本次操作对应可直接在终端运行的命令
   （如 `node ~/.claude/skills/common-config/common-config.mjs apply`），
   并提示终端直跑不经过 LLM、下次更快。

## 片段配置说明

| 键 | 值 | 用途 |
|---|---|---|
| `env.CLAUDE_CODE_ATTRIBUTION_HEADER` | `"0"` | 关闭 commit/PR 中的 Claude 署名头 |
| `env.CLAUDE_CODE_DISABLE_MOUSE` | `"1"` | 禁用 TUI 鼠标捕获，恢复终端原生选中文本/滚动 |
| `env.CLAUDE_CODE_NO_FLICKER` | `"0"` | 关闭防闪烁渲染模式（显式保持默认行为） |
| `env.CLAUDE_CODE_NATIVE_CURSOR` | `"1"` | 使用终端原生光标，而非 TUI 自绘光标 |
| `env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | `"1"` | 禁非必要网络流量（遥测、报错上报等） |
| `env.CLAUDE_CODE_USE_POWERSHELL_TOOL` | `"1"` | 启用 PowerShell 工具（Windows 专属，其他平台脚本自动剔除） |
| `env.ENABLE_TOOL_SEARCH` | `"true"` | 启用 ToolSearch 工具延迟加载，节省上下文 |
| `env.DISABLE_AUTOUPDATER` | `"1"` | 禁用自动更新（手动控制升级时机） |
| `autoUpdatesChannel` | `"latest"` | 更新通道（配合 DISABLE_AUTOUPDATER 仅作偏好记录） |
| `tui` | `"default"` | TUI 界面模式 |

## 数据流（了解即可，脚本已处理）

- 片段：`snippet.json`（与本文件同目录，唯一事实源；要改通用偏好就改它）
- 写入：全局 `~/.claude/settings.json`，**只写片段内的键**，其余现有配置不动；自动备份 `.bak`
- `CLAUDE_CODE_USE_POWERSHELL_TOOL` 为 Windows 专属，非 win32 平台自动剔除
- statusLine 不在本片段内，由 `statusline-setup` skill 单独管理

## 注意事项

- 写入的是**全局** settings；项目级 `.claude/settings.json` 中的同名键会覆盖全局。
- 若本机装了 cc-switch：它在 GUI 里切换供应商时会用 **db 里自己的片段副本**重新合并全局
  settings，可能覆盖本 skill 写入的值。改了 `snippet.json` 后，提示用户同步更新 cc-switch
  的「通用配置片段」（或反向以 cc-switch 为准）。
- 提醒用户：若系统环境变量存在同名键，优先级高于 settings.json 的 env。
- 生效需新开会话。
