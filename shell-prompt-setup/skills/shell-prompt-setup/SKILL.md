---
name: shell-prompt-setup
description: 一键安装/恢复 Windows 终端定制 prompt（PS7/PS5 profile + Tabby Clink cmd）：空行分隔、(conda环境) 时间 路径 (git分支/脏标记)、输入在新行。托管区块写入、自动备份，支持 show/diff/apply/restore，确定性脚本可脱离 Claude Code 独立运行。
---

本 skill 是**薄壳**：核心逻辑在脚本 `shell-prompt.ps1`（与本文件同目录）中，
你的职责只是执行脚本并转述结果，**不要自己手写 profile 或 Lua 内容**。

## 管理范围

| 组件 | 位置 | 说明 |
|---|---|---|
| PS7 profile | `Documents\PowerShell\profile.ps1` | 写入/替换 `#region shell-prompt-setup` 托管区块 |
| PS5 profile | `Documents\WindowsPowerShell\profile.ps1` | 同上 |
| Clink lua | `%LOCALAPPDATA%\clink\shell-prompt.lua` | Tabby 内置 clink / 独立 clink 的自定义 prompt |
| Clink 设置 | `prompt.spacing = sparse` | 每个 prompt 前空行分隔 |
| 执行策略 | PS5/PS7 检查 | 若 profile 会被 Restricted 阻止，则设 CurrentUser RemoteSigned |

托管区块之外的 profile 内容（如 conda 懒加载块）**不动**；restore 优先恢复 `.bak`。

## 执行方式

用户说「装/恢复终端 prompt」「统一 shell 提示符」或调用 `/shell-prompt-setup` 时：

1. **用户明确要写入**（说了「应用」「装上」「恢复」）：
   **一段完成**——直接一次 Bash 调用
   `pwsh -File <skill目录>/shell-prompt.ps1 apply`，原样转述输出。
2. **用户只想查看**：一次 Bash 调用 `show`（看模板内容）或 `diff`（看与本机差异），转述结果。
3. **意图模糊**：先 `diff`，把差异交给用户确认，用户同意后再 `apply`（两段）。
4. **恢复默认**：`restore`（优先用 `.bak`，无备份则移除托管区块/删除 lua、spacing 还原默认；执行策略不动）。
5. 脚本报错时把错误信息交给用户，不要尝试手工修复文件。
6. **答复末尾必须列出等效终端命令**：
   `pwsh -File "$HOME/.claude/skills/shell-prompt-setup/shell-prompt.ps1" apply`，
   并提示终端直跑不经过 LLM、下次更快（PS5 下用 `powershell -File ...` 同样可跑）。

## 前置条件与边界

- Windows 专属；PS5 系统自带，PS7 没有则对应项 SKIPPED。
- Clink 部分自动探测：Tabby（`%LOCALAPPDATA%\Programs\Tabby\resources\extras\clink`）或独立安装；
  找不到 clink 可执行文件时 lua 仍会写入，spacing 项 SKIPPED 并提示手动执行。
- git 需在 PATH 中（分支/脏标记依赖 `git` 命令）；非 git 目录不显示分支。
- 生效需**新开终端标签页**（PS profile / clink 脚本都是启动时加载）。
- conda 懒加载、PATH 配置不在本 skill 范围；若新机器需要，另行处理。

## 执行失败处理（权限与分类器）

1. **auto 模式分类器暂不可用**（报错含 `auto mode cannot determine the safety` 或
   `<模型名> is temporarily unavailable`）：这是**暂时性**故障，与脚本无关。
   **等待 30~60 秒后原样重试同一命令**即可；不要改用手工 Edit/Write 文件的方式绕过——
   那会把确定性流程拆成多次写操作，反而触发更多权限检查。
2. **用户拒绝了权限弹窗**：不要换写法重试同一命令（等于绕过用户决定）。
   把等效终端命令交给用户，请其在提示符中用 `! ` 前缀直接执行
   （如 `! pwsh -File "$HOME/.claude/skills/shell-prompt-setup/shell-prompt.ps1" apply`），
   输出会进入会话，你再转述结果。
3. **想免审批**：权限弹窗出现时选「不再询问/总是允许」；或手动在
   `~/.claude/settings.json` 的 `permissions.allow` 加前缀规则
   `Bash(pwsh -File <skill目录绝对路径>/shell-prompt.ps1:*)`，
   覆盖 show/diff/apply/restore 全部子命令。
4. **脚本内部的文件操作不产生额外弹窗**：写 profile、备份 `.bak`、删除 lua、
   设置 clink/执行策略等全部发生在 pwsh 子进程内，Claude Code 只对这一次
   Bash 调用做权限检查。

## 效果

```
                                  <- 空行分隔（sparse）
(base) 19:41:32 ~\work\repo (master*)   <- conda青 时间灰 路径蓝 分支绿(脏则黄带*)
$                                 <- 输入行
```
