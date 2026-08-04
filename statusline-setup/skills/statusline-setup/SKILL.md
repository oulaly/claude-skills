---
name: statusline-setup
description: 安装、卸载或自定义 Claude Code 状态栏（statusline）：显示「工作目录 (git 分支) [模型名]」，零依赖（bash + sed + git），自动备份并修改 settings.json。适用于配置 statusline、恢复默认、调整显示字段。
---

当用户要求安装/配置/卸载/自定义 statusline 时执行。脚本文件为本 skill 目录下的
[`statusline.sh`](statusline.sh)，输出格式：`<工作目录> (<git 分支>) [<模型名>]`。

## 安装

1. 把 `statusline.sh` 复制到 `~/.claude/statusline.sh`，并 `chmod +x`。
2. **先备份**用户级配置：`cp ~/.claude/settings.json ~/.claude/settings.json.bak`。
3. 编辑 `~/.claude/settings.json`，加入或替换 `statusLine` 键（JSON 必须保持合法，
   用 Read/Edit 工具精确修改，不要整文件重写）：
   ```json
   "statusLine": {
     "type": "command",
     "command": "bash \"$HOME/.claude/statusline.sh\""
   }
   ```
   若已存在 `statusLine` 配置，告知用户原配置内容将被替换，确认后再改。
4. 用 `echo '{"cwd":"/tmp","model":{"display_name":"Test"}}' | bash ~/.claude/statusline.sh`
   验证输出，应类似 `/tmp [Test]`。
5. 提示用户重启 Claude Code 或新开会话生效。

项目级安装：改用 `<项目>/.claude/settings.json` 与 `<项目>/.claude/statusline.sh`，
命令写 `bash ".claude/statusline.sh"`。

## 卸载

1. 若存在 `~/.claude/settings.json.bak`，直接恢复覆盖；否则从 settings.json 中删除 `statusLine` 键。
2. 删除 `~/.claude/statusline.sh`（项目级则删项目内对应文件）。

## 自定义

脚本零依赖（bash + sed + tr + git），常见调整：

- **去掉模型名**：删除 `model=` 与 `[ -n "$model" ]` 两行。
- **去掉分支**：删除 `branch=` 与 `[ -n "$branch" ]` 两行（非 git 环境下还能提速）。
- **目录显示缩写**：在 `out="$cwd"` 前加 `cwd="${cwd/#$HOME/~}"` 把 home 显示为 `~`。
- **其他字段**：stdin JSON 中还有 `workspace.current_dir`、`cost`、`model.id` 等字段，
  可先 `cat` 一份实际输入（`claude --debug` 或让脚本 tee 到临时文件）再按字段扩展。

## 注意事项

- Windows 下由 Git Bash 执行，脚本内路径已统一为正斜杠，不要改回反斜杠。
- `git --no-optional-locks` 必须保留，避免状态栏刷新与正在运行的 git 操作抢锁。
- 脚本会被频繁调用（每次刷新），禁止加入网络请求等慢操作。
