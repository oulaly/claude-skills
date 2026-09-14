---
name: session-resume
description: 安装/卸载 claude-resume 命令：交互式选择最近关闭的 Claude Code 会话并恢复（claude --resume）。列表展示会话 ID、标题/摘要、工作目录、git 分支、最后活跃时间与活跃状态。提供 PowerShell 函数与 cmd 包装。适用于会话恢复、多项目切换。
---

# session-resume —— 交互式恢复最近的 Claude 会话

提供 `claude-resume` 命令：扫描 `~/.claude/projects/*/*.jsonl` 转录文件，按最后活跃时间列出
最近的会话（ID、标题、工作目录、分支、时间、活跃标记），键盘选择编号后自动
`Set-Location` 到该会话工作目录并执行 `claude --resume <id>`。

## 数据源与口径

| 字段 | 来源 |
|------|------|
| 会话 ID | 转录文件名（GUID）；子代理 `agent-*.jsonl` 自动排除 |
| 标题/摘要 | 首条用户文本消息（跳过 `<command-name>` 等命令/系统消息）；无则显示「(无标题)」 |
| 工作目录 | 转录条目 `cwd` 字段（目录 slug 解码有损，仅作兜底展示） |
| 关闭时间 | 文件最后写入时间 ≈ 最后活跃时间；2 分钟内有写入标记为「●活跃」 |

性能：每个会话只读转录前 80 行，大文件无压力。

## 用法

```powershell
claude-resume            # 最近 15 条会话，交互选择
claude-resume -Top 30    # 多列一些
claude-resume -Here      # 只看当前目录的会话
```

交互：输入编号回车打开（直接回车 = 第 1 条），`q` 退出。

## 安装

### PowerShell（推荐）

把 dot-source 行追加到 profile（`$PROFILE`，PS7 与 PS5 各一份按需）：

```powershell
Add-Content $PROFILE "`n. `"`$env:USERPROFILE\.claude\skills\session-resume\claude-resume.ps1`""
```

重开终端（或 `. $PROFILE`）后即可使用 `claude-resume`。

### cmd

把 skill 目录加入 PATH，或将 `claude-resume.cmd` 复制到任一 PATH 目录
（cmd 包装优先用 pwsh，退回 powershell）：

```cmd
setx PATH "%PATH%;%USERPROFILE%\.claude\skills\session-resume"
```

## 卸载

1. 从 profile 删除 dot-source 行；
2. 从 PATH 移除 skill 目录（如加过）；
3. 删除 `~/.claude/skills/session-resume/`。

## 注意

- 「关闭时间」没有精确事件，用转录文件最后写入时间近似；正在运行的会话会标记「●活跃」。
- 恢复会话本质是 `claude --resume <id>`，需 claude CLI 在 PATH 中；目标工作目录必须仍存在。
- 会话标题取首条用户消息，若首条是粘贴的长文本/路径，标题就是它的截断。
