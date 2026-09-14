# claude-resume.ps1 —— 交互式选择最近关闭的 Claude Code 会话并恢复
#
# 数据源：~/.claude/projects/<目录slug>/<session-id>.jsonl（转录文件）
#   - 会话 ID  = 文件名（GUID），子代理文件 agent-*.jsonl 自动排除
#   - 标题     = 首条用户文本消息（无 summary 条目的环境下这是最准的近似）
#   - 工作目录 = 转录条目中的 cwd 字段（比目录 slug 解码可靠）
#   - 关闭时间 ≈ 文件最后写入时间（最后活跃时间；2 分钟内有写入视为「活跃中」）
#
# 用法：
#   claude-resume            # 列出最近 15 条会话，选择后以 claude --resume 打开
#   claude-resume -Top 30    # 多列一些
#   claude-resume -Here      # 只看当前目录的会话
#
# 安装：在 PowerShell profile 里 dot-source 本文件（见 SKILL.md）。
# cmd 下用同目录 claude-resume.cmd 包装调用。

function Get-ClaudeSessionInfo {
    param(
        [int]$Top = 15,
        [switch]$Here
    )
    $root = Join-Path $env:USERPROFILE '.claude\projects'
    if (-not (Test-Path -LiteralPath $root)) { return @() }

    $files = Get-ChildItem -LiteralPath $root -Recurse -Filter '*.jsonl' -File |
        Where-Object { $_.BaseName -match '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$' } |
        Sort-Object LastWriteTime -Descending

    $herePath = if ($Here) { (Get-Location).Path.TrimEnd('\') } else { $null }

    $sessions = @()
    foreach ($f in $files) {
        if ($Top -gt 0 -and $sessions.Count -ge $Top) { break }
        $cwd = $null; $branch = $null; $title = $null
        # 只读前 80 行：cwd/分支/首条用户消息都在头部，避免整文件扫描
        foreach ($line in (Get-Content -LiteralPath $f.FullName -TotalCount 80 -Encoding UTF8)) {
            if (-not $cwd -and $line -match '"cwd":"((?:[^"\\]|\\.)+)"') {
                $cwd = ($Matches[1] -replace '\\\\', '\')
            }
            if (-not $branch -and $line -match '"gitBranch":"([^"]*)"') {
                $branch = $Matches[1]
            }
            if (-not $title -and
                $line -match '"type":"user","message":\{"role":"user","content":"((?:[^"\\]|\\.){4,400})"' -and
                $line -notmatch '"content":"(<|Caveat)') {
                $title = $Matches[1]
            }
            if ($cwd -and $title) { break }
        }
        if (-not $cwd) { $cwd = $f.Directory.Name }  # 兜底：slug 目录名（有损，仅展示）
        if ($herePath -and $cwd.TrimEnd('\') -ne $herePath) { continue }

        # 反转义 + 清洗标题
        $clean = '(无标题)'
        if ($title) {
            $clean = $title -replace '\\n', ' ' -replace '\\r', ' ' -replace '\\t', ' ' `
                            -replace '\\"', '"' -replace '\\\\', '\'
            $clean = ($clean -replace '\s+', ' ').Trim()
            if ($clean.StartsWith('<')) { $clean = '(命令/系统消息)' }
        }

        $obj = [pscustomobject]@{
            Id       = $f.BaseName
            Title    = $clean
            Directory = $cwd
            Branch   = $branch
            Time     = $f.LastWriteTime
            Active   = ((Get-Date) - $f.LastWriteTime).TotalMinutes -lt 2
            File     = $f.FullName
        }
        $sessions += $obj
    }
    return $sessions
}

function claude-resume {
    <#
    .SYNOPSIS
    交互式选择最近关闭的 Claude Code 会话并打开（claude --resume）。
    #>
    param(
        [int]$Top = 15,
        [switch]$Here
    )
    $sessions = Get-ClaudeSessionInfo -Top $Top -Here:$Here
    if (-not $sessions -or $sessions.Count -eq 0) {
        Write-Host '没有找到任何会话记录。' -ForegroundColor Yellow
        return
    }

    Write-Host ''
    Write-Host "最近的 Claude 会话（按最后活跃排序）" -ForegroundColor Cyan
    Write-Host ('─' * 72) -ForegroundColor DarkGray
    for ($i = 0; $i -lt $sessions.Count; $i++) {
        $s = $sessions[$i]
        $state = if ($s.Active) { '●活跃' } else { '  关闭' }
        $stateColor = if ($s.Active) { 'Green' } else { 'DarkGray' }
        $t = if ($s.Time.Date -eq (Get-Date).Date) { $s.Time.ToString('HH:mm') } else { $s.Time.ToString('MM-dd HH:mm') }
        $title = if ($s.Title.Length -gt 42) { $s.Title.Substring(0, 42) + '…' } else { $s.Title }
        Write-Host ('{0,3} ' -f ($i + 1)) -NoNewline -ForegroundColor Yellow
        Write-Host "$state " -NoNewline -ForegroundColor $stateColor
        Write-Host ('{0,-12} ' -f $t) -NoNewline -ForegroundColor DarkGray
        Write-Host ('{0}  ' -f $s.Id.Substring(0, 8)) -NoNewline -ForegroundColor DarkCyan
        Write-Host $title -ForegroundColor White
        $branch = if ($s.Branch) { "  ($($s.Branch))" } else { '' }
        Write-Host "      $($s.Directory)$branch" -ForegroundColor DarkGray
    }
    Write-Host ('─' * 72) -ForegroundColor DarkGray

    $choice = Read-Host "选择编号打开（Enter=1，q=退出）"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = '1' }
    if ($choice -match '^(q|quit|exit)$') { return }
    $n = 0
    if (-not [int]::TryParse($choice, [ref]$n) -or $n -lt 1 -or $n -gt $sessions.Count) {
        Write-Host "无效选择：$choice" -ForegroundColor Red
        return
    }
    $sel = $sessions[$n - 1]

    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
        Write-Host '找不到 claude 命令，请确认 Claude Code CLI 已安装并在 PATH 中。' -ForegroundColor Red
        return
    }
    if (-not (Test-Path -LiteralPath $sel.Directory)) {
        Write-Host "工作目录不存在：$($sel.Directory)" -ForegroundColor Red
        return
    }

    Write-Host "→ 打开会话 $($sel.Id)（$($sel.Directory)）" -ForegroundColor Cyan
    Set-Location -LiteralPath $sel.Directory
    & claude --resume $sel.Id
}

# 直接运行（cmd 包装/双击/ powershell -File）时立即执行；被 dot-source 时只定义函数
if ($MyInvocation.InvocationName -ne '.') {
    claude-resume @args
}
