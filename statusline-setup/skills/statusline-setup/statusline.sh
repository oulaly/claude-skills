#!/usr/bin/env bash
# statusline.sh —— Claude Code 自定义状态栏
#
# 输出格式：<工作目录> (<git 分支>) [<模型显示名>]
#   例：C:/workspace/projects/tabby (conpty) [KIMI K3]
#
# 输入：Claude Code 通过 stdin 传入的会话 JSON（单行）
# 依赖：bash + sed + tr + git（无需 jq，Windows Git Bash / macOS / Linux 通用）

input=$(cat | tr -d '\n\r')

# 工作目录：优先 "cwd" 字段，退回 "workspace.current_dir"，再退回 $PWD。
# Windows 路径的反斜杠统一为正斜杠并去重复。
cwd=$(echo "$input" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | tr '\\' '/' | tr -s '/')
[ -z "$cwd" ] && cwd=$(echo "$input" | sed -n 's/.*"workspace\.current_dir"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | tr '\\' '/' | tr -s '/')
[ -z "$cwd" ] && cwd=$PWD

# Git 分支；非 git 目录时为空。--no-optional-locks 避免与正在运行的 git 进程抢锁。
branch=$(git --no-optional-locks -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || true)

# 模型显示名（model.display_name）
model=$(echo "$input" | sed -n 's/.*"model"[[:space:]]*:[[:space:]]*{[^}]*"display_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

out="$cwd"
[ -n "$branch" ] && out="$out ($branch)"
[ -n "$model" ] && out="$out [$model]"
printf '%s' "$out"
