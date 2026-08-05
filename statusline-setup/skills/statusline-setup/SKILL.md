---
name: statusline-setup
description: 安装、卸载或自定义 Claude Code 状态栏（statusline）：显示「工作目录 (git 分支) [模型名]」，单进程实现（纯 bash 内建，零子进程，不调用 sed/git），自动备份并修改 settings.json。适用于配置 statusline、恢复默认、调整显示字段。
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

脚本为单进程实现（纯 bash 内建，零子进程），常见调整：

- **去掉模型名**：删除 `model` 提取段与 `[ -n "$model" ]` 一行。
- **去掉分支**：删除 `branch` 整段与 `[ -n "$branch" ]` 一行（非 git 环境下还能提速）。
- **目录显示缩写**：在 `out=$cwd` 前加 `cwd=${cwd/#$HOME/\~}` 把 home 显示为 `~`。
- **其他字段**：stdin JSON 中还有 `workspace.current_dir`、`cost`、`model.id` 等字段，
  用 `[[ $input =~ \"字段名\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]` 加 `${BASH_REMATCH[1]}` 提取即可；
  可先 `claude --debug` 或让脚本 `tee` 一份实际输入再按字段扩展。

## 注意事项

- **禁止改回管道/cat 实现**：`input=$(cat)` 等 EOF 的读法在父进程被超时强杀后收不到 EOF，
  bash 会永久挂死并逐日累积泄漏（实测曾累积 270+ 个卡死进程）；必须保持 `read -t` 按行读取。
- **禁止加入子进程调用**（sed/tr/git/jq 等）：状态栏刷新极其频繁（流式输出时每秒多次），
  每次 spawn 进程在 Windows 上代价高，会直接把 CPU 打高。分支靠读 `.git/HEAD` 获取。
- Windows 下由 Git Bash 执行，脚本内路径已统一为正斜杠，不要改回反斜杠。
- 脚本会被频繁调用，禁止加入网络请求等慢操作；`read -t` 超时保持 ≤0.2s。
