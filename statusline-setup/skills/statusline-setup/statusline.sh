#!/usr/bin/env bash
# statusline.sh —— Claude Code 自定义状态栏（单进程实现）
#
# 输出格式：<工作目录> (<git 分支>) [<模型显示名>]
#   例：C:/workspace/projects/tabby (conpty) [KIMI K3]
#
# 输入：Claude Code 通过 stdin 传入的会话 JSON
# 依赖：仅 bash（>=4，支持 read -t 小数超时与 BASH_REMATCH），无任何子进程。
#
# 为什么不用 cat/sed/tr/git：
#   状态栏刷新极其频繁（流式输出时每秒多次），管道版每次要 spawn ~8 个进程，
#   Windows 上进程创建昂贵会导致 CPU 飙升；且 cat 等 EOF 的读法在父进程被
#   超时强杀后会收不到 EOF，bash 永久挂死并累积泄漏（实测曾累积 270+ 个）。
#   本实现：read 按行读取（每行最多等 0.2s，不等 EOF），字段用 bash 正则提取，
#   分支直接读 .git/HEAD —— 每次刷新只有 1 个进程，且必然退出。

# 读取输入 JSON：逐行读取，stdin 正常关闭时立即结束
input=""
while IFS= read -r -t 0.2 line; do
    input+="$line"
done

# --- 提取 cwd ---
cwd=""
if [[ $input =~ \"cwd\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then
    cwd=${BASH_REMATCH[1]}
elif [[ $input =~ \"current_dir\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then
    cwd=${BASH_REMATCH[1]}
fi
[ -z "$cwd" ] && cwd=$PWD
# 反斜杠转正斜杠、折叠重复斜杠（纯内建替换）
cwd=${cwd//\\//}
while [[ $cwd == *'//'* ]]; do cwd=${cwd//\/\//\/}; done

# --- 提取模型显示名 ---
model=""
if [[ $input =~ \"display_name\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then
    model=${BASH_REMATCH[1]}
fi

# --- 获取 git 分支（直接读 .git/HEAD，不 spawn git，自然无锁冲突） ---
branch=""
dir=$cwd
while [ -n "$dir" ]; do
    head=""
    if [ -f "$dir/.git/HEAD" ]; then
        IFS= read -r head < "$dir/.git/HEAD"
    elif [ -f "$dir/.git" ]; then
        # worktree：.git 是文件，内容为 "gitdir: <path>"
        IFS= read -r gd < "$dir/.git"
        gd=${gd#gitdir: }
        [[ $gd != /* && $gd != ?:* ]] && gd="$dir/$gd"
        [ -f "$gd/HEAD" ] && IFS= read -r head < "$gd/HEAD"
    fi
    if [ -n "$head" ]; then
        case $head in
            "ref: refs/heads/"*) branch=${head#ref: refs/heads/} ;;
            *) branch=${head:0:7} ;; # detached HEAD：取短 hash
        esac
        break
    fi
    [ "$dir" = "/" ] && break
    parent=${dir%/*}
    [ "$parent" = "$dir" ] && break
    dir=$parent
    [ -z "$dir" ] && dir=/
done

out=$cwd
[ -n "$branch" ] && out="$out ($branch)"
[ -n "$model" ] && out="$out [$model]"
printf '%s' "$out"
