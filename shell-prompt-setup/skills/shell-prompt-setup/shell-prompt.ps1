# shell-prompt.ps1 - install/restore a custom shell prompt for PS7/PS5 + Tabby Clink (cmd)
# Usage: pwsh -File shell-prompt.ps1 [show|diff|apply|restore]   (default: diff)
#
# Managed state:
#   - Region "#region shell-prompt-setup" in both PowerShell AllHosts profiles
#     (Documents\PowerShell\profile.ps1 and Documents\WindowsPowerShell\profile.ps1).
#     Other profile content (e.g. a conda lazy-init block) is left untouched.
#   - %LOCALAPPDATA%\clink\shell-prompt.lua  (Clink custom prompt for cmd.exe)
#   - Clink setting prompt.spacing=sparse (blank line before each prompt)
#   - Execution policy check for PS5/PS7 (sets CurrentUser RemoteSigned if profile
#     loading would be blocked)
#
# Backups: <file>.bak created on first apply only; restore prefers .bak.

param(
    [Parameter(Position = 0)]
    [ValidateSet('show', 'diff', 'apply', 'restore')]
    [string]$Command = 'diff'
)

$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------- templates

$PromptBlockPS = @'
#region shell-prompt-setup
function Get-PromptGitBranch {
    $gitDir = git rev-parse --git-dir 2>$null
    if (-not $gitDir) { return $null }
    $branch = git symbolic-ref --short HEAD 2>$null
    if (-not $branch) {
        $tag = git describe --tags --exact-match 2>$null
        if ($tag) { return @{ Branch = $tag; Dirty = $false } }
        $sha = git rev-parse --short HEAD 2>$null
        if ($sha) { return @{ Branch = $sha; Dirty = $false } }
        return @{ Branch = "detached"; Dirty = $false }
    }
    $status = git status --porcelain 2>$null
    $dirty = [bool]$status
    return @{ Branch = $branch; Dirty = $dirty }
}

function global:prompt {
    $time = Get-Date -Format "HH:mm:ss"
    $path = $executionContext.SessionState.Path.CurrentLocation.Path
    $gitBranch = $null
    $gitDirty = $false
    $result = Get-PromptGitBranch
    if ($result) { $gitBranch = $result.Branch; $gitDirty = $result.Dirty }
    $condaEnv = $env:CONDA_DEFAULT_ENV

    # Blank line separator
    Write-Host ""

    # Line 1: (conda env)  time  path  (git branch)
    $first = $true
    if ($condaEnv) {
        Write-Host "($condaEnv)" -NoNewline -ForegroundColor Cyan
        $first = $false
    }
    if (-not $first) { Write-Host " " -NoNewline }
    Write-Host $time -NoNewline -ForegroundColor DarkGray
    $first = $false
    Write-Host " " -NoNewline
    Write-Host $path -NoNewline -ForegroundColor Blue
    if ($gitBranch) {
        $branchColor = if ($gitDirty) { "Yellow" } else { "Green" }
        $branchText = "($gitBranch"
        if ($gitDirty) { $branchText += "*" }
        $branchText += ")"
        Write-Host " " -NoNewline
        Write-Host $branchText -NoNewline -ForegroundColor $branchColor
    }
    Write-Host ""

    # Line 2: prompt symbol
    return "$ "
}
#endregion shell-prompt-setup
'@

$PromptLua = @'
-- Custom prompt for Clink (cmd.exe), installed by shell-prompt-setup.
-- Blank line separator comes from `clink set prompt.spacing sparse`.

local function find_git_dir()
    local dir = os.getcwd()
    for _ = 1, 20 do
        local f = io.open(dir .. "\\.git\\HEAD", "r")
        if f then
            f:close()
            return dir .. "\\.git"
        end
        -- handle .git file (worktree/submodule)
        local g = io.open(dir .. "\\.git", "r")
        if g then
            local content = g:read("*l")
            g:close()
            local gd = content and content:match("gitdir:%s*(.+)")
            if gd then
                if not gd:match("^%a:") then
                    gd = dir .. "\\" .. gd
                end
                return gd
            end
        end
        local parent = dir:match("^(.+)\\[^\\]+$")
        if not parent or parent == dir then break end
        dir = parent
    end
    return nil
end

local function get_git_info()
    local git_dir = find_git_dir()
    if not git_dir then return nil end

    local f = io.open(git_dir .. "\\HEAD", "r")
    if not f then return nil end
    local head = f:read("*l") or ""
    f:close()

    local branch = head:match("ref: refs/heads/(.+)")
    if not branch then
        branch = head:sub(1, 7) -- detached HEAD: short SHA
    end

    -- Dirty check
    local dirty = false
    local p = io.popen('git status --porcelain 2>nul')
    if p then
        local out = p:read("*a")
        p:close()
        dirty = out ~= nil and #out > 0
    end

    return branch, dirty
end

local function shorten_path(cwd)
    local home = os.getenv("USERPROFILE") or ""
    if #home > 0 and cwd:sub(1, #home):lower() == home:lower() then
        return "~" .. cwd:sub(#home + 1)
    end
    return cwd
end

-- clink.promptcoroutine must be created inside a prompt filter.
local pf = clink.promptfilter(1)

function pf:filter(prompt)
    return clink.promptcoroutine(function ()
        local time = os.date("%H:%M:%S")
        local cwd = shorten_path(os.getcwd())
        local conda = os.getenv("CONDA_DEFAULT_ENV") or ""
        local branch, dirty = get_git_info()

        -- ANSI colors: 36=cyan, 90=dark gray, 34=blue, 32=green, 33=yellow
        local parts = {}
        if conda ~= "" then
            parts[#parts + 1] = "\x1b[36m(" .. conda .. ")\x1b[0m"
        end
        parts[#parts + 1] = "\x1b[90m" .. time .. "\x1b[0m"
        parts[#parts + 1] = "\x1b[34m" .. cwd .. "\x1b[0m"
        if branch then
            local color = dirty and "33" or "32"
            local btext = "(" .. branch
            if dirty then btext = btext .. "*" end
            btext = btext .. ")"
            parts[#parts + 1] = "\x1b[" .. color .. "m" .. btext .. "\x1b[0m"
        end

        return table.concat(parts, " ") .. "\n$ "
    end)
end
'@

# ---------------------------------------------------------------- helpers

function Normalize([string]$s) {
    if ($null -eq $s) { return '' }
    return ($s -replace "`r`n", "`n").TrimEnd()
}

function Write-Utf8NoBom([string]$path, [string]$text) {
    if (-not $text.EndsWith("`n")) { $text += "`n" }
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $text, $enc)
}

function Backup-Once([string]$path) {
    $bak = "$path.bak"
    if ((Test-Path $path) -and (-not (Test-Path $bak))) {
        Copy-Item $path $bak
        Write-Host "  backup -> $bak"
    }
}

$RegionRegex = [regex]'(?s)#region shell-prompt-setup.*?#endregion shell-prompt-setup'

function Get-MergedProfile([string]$path) {
    $block = $PromptBlockPS
    $existing = ''
    if (Test-Path $path) { $existing = [System.IO.File]::ReadAllText($path) }
    $m = $RegionRegex.Match($existing)
    if ($m.Success) {
        return $existing.Substring(0, $m.Index) + $block + $existing.Substring($m.Index + $m.Length)
    }
    if ($existing.Length -eq 0) { return $block }
    $sep = "`n"
    if (-not $existing.EndsWith("`n")) { $sep = "`n`n" }
    return $existing + $sep + $block
}

function Find-ClinkExe {
    $arch = 'x64'
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' }
    elseif ($env:PROCESSOR_ARCHITECTURE -eq 'x86') { $arch = 'x86' }
    $candidates = @()
    # Running Tabby process reveals its install dir (covers custom install drives)
    $tabbyProc = Get-Process tabby -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($tabbyProc -and $tabbyProc.Path) {
        $candidates += (Join-Path (Split-Path $tabbyProc.Path -Parent) "resources\extras\clink\clink_$arch.exe")
    }
    if ($env:LOCALAPPDATA) {
        $candidates += (Join-Path $env:LOCALAPPDATA "Programs\Tabby\resources\extras\clink\clink_$arch.exe")
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} "clink\clink_$arch.exe")
    }
    if ($env:ProgramFiles) {
        $candidates += (Join-Path $env:ProgramFiles "clink\clink_$arch.exe")
    }
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    $cmd = Get-Command clink -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Get-EffectivePolicy([string]$exePath) {
    if (-not $exePath -or -not (Test-Path $exePath)) { return $null }
    try {
        $out = & $exePath -NoLogo -NoProfile -Command 'Get-ExecutionPolicy' 2>$null
        $val = ($out | Out-String).Trim()
        if ($val.Length -eq 0) { return 'UNKNOWN' }
        return $val
    } catch {
        return 'UNKNOWN'
    }
}

function Set-PolicyRemoteSigned([string]$exePath) {
    & $exePath -NoLogo -NoProfile -Command 'Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force' 2>$null
}

function Get-States {
    $docs = [Environment]::GetFolderPath('MyDocuments')
    $ps7 = Join-Path $docs 'PowerShell\profile.ps1'
    $ps5 = Join-Path $docs 'WindowsPowerShell\profile.ps1'
    $clinkDir = Join-Path $env:LOCALAPPDATA 'clink'
    $lua = Join-Path $clinkDir 'shell-prompt.lua'

    $states = @()

    foreach ($t in @(@('PS7 profile', $ps7), @('PS5 profile', $ps5))) {
        $name = $t[0]; $path = $t[1]
        $desired = Get-MergedProfile $path
        if (-not (Test-Path $path)) {
            $states += @{ Name=$name; Status='MISSING'; Detail=$path; Path=$path; Desired=$desired }
        } else {
            $current = [System.IO.File]::ReadAllText($path)
            if ((Normalize $current) -eq (Normalize $desired)) {
                $states += @{ Name=$name; Status='OK'; Detail=$path; Path=$path; Desired=$desired }
            } else {
                $states += @{ Name=$name; Status='DIFFERS'; Detail=$path; Path=$path; Desired=$desired }
            }
        }
    }

    if (-not (Test-Path $clinkDir)) {
        $states += @{ Name='Clink prompt lua'; Status='SKIPPED'; Detail="clink profile dir not found: $clinkDir"; Path=$lua }
    } elseif (-not (Test-Path $lua)) {
        $states += @{ Name='Clink prompt lua'; Status='MISSING'; Detail=$lua; Path=$lua; Desired=$PromptLua }
    } else {
        $current = [System.IO.File]::ReadAllText($lua)
        if ((Normalize $current) -eq (Normalize $PromptLua)) {
            $states += @{ Name='Clink prompt lua'; Status='OK'; Detail=$lua; Path=$lua; Desired=$PromptLua }
        } else {
            $states += @{ Name='Clink prompt lua'; Status='DIFFERS'; Detail=$lua; Path=$lua; Desired=$PromptLua }
        }
    }

    $clinkExe = Find-ClinkExe
    if (-not $clinkExe) {
        $states += @{ Name='Clink prompt.spacing'; Status='SKIPPED'; Detail='clink executable not found'; Exe=$null }
    } else {
        $val = ''
        try {
            $out = & $clinkExe set prompt.spacing 2>$null
            foreach ($line in $out) {
                if ($line -match '^\s*Value:\s*(\S+)') { $val = $Matches[1]; break }
            }
        } catch {}
        if ($val -eq 'sparse') {
            $states += @{ Name='Clink prompt.spacing'; Status='OK'; Detail="sparse ($clinkExe)"; Exe=$clinkExe }
        } else {
            $states += @{ Name='Clink prompt.spacing'; Status='DIFFERS'; Detail="current: $val (want: sparse)"; Exe=$clinkExe }
        }
    }

    $ps5exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $pol5 = Get-EffectivePolicy $ps5exe
    if ($null -eq $pol5) {
        $states += @{ Name='PS5 exec policy'; Status='SKIPPED'; Detail='powershell.exe not found'; Exe=$null }
    } elseif ($pol5 -eq 'UNKNOWN') {
        $states += @{ Name='PS5 exec policy'; Status='SKIPPED'; Detail='could not query policy'; Exe=$null }
    } elseif (@('RemoteSigned','Unrestricted','Bypass') -contains $pol5) {
        $states += @{ Name='PS5 exec policy'; Status='OK'; Detail=$pol5; Exe=$ps5exe }
    } else {
        $states += @{ Name='PS5 exec policy'; Status='NEEDS-FIX'; Detail=$pol5; Exe=$ps5exe }
    }

    $pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
    if (-not $pwshCmd) {
        $states += @{ Name='PS7 exec policy'; Status='SKIPPED'; Detail='pwsh not found'; Exe=$null }
    } else {
        $pol7 = Get-EffectivePolicy $pwshCmd.Source
        if ($pol7 -eq 'UNKNOWN') {
            $states += @{ Name='PS7 exec policy'; Status='SKIPPED'; Detail='could not query policy'; Exe=$null }
        } elseif (@('RemoteSigned','Unrestricted','Bypass') -contains $pol7) {
            $states += @{ Name='PS7 exec policy'; Status='OK'; Detail=$pol7; Exe=$pwshCmd.Source }
        } else {
            $states += @{ Name='PS7 exec policy'; Status='NEEDS-FIX'; Detail=$pol7; Exe=$pwshCmd.Source }
        }
    }

    return $states
}

function Show-States($states) {
    foreach ($s in $states) {
        $line = '{0,-22} {1,-10} {2}' -f $s.Name, $s.Status, $s.Detail
        Write-Host $line
    }
}

# ---------------------------------------------------------------- commands

function Do-Show {
    Write-Host '===== PowerShell profile region (PS7 + PS5) ====='
    Write-Host $PromptBlockPS
    Write-Host ''
    Write-Host '===== Clink lua (%LOCALAPPDATA%\clink\shell-prompt.lua) ====='
    Write-Host $PromptLua
    Write-Host ''
    Write-Host '===== Clink setting ====='
    Write-Host 'prompt.spacing = sparse'
}

function Do-Diff($states) {
    Show-States $states
    $bad = @($states | Where-Object { @('MISSING','DIFFERS','NEEDS-FIX') -contains $_.Status })
    Write-Host ''
    if ($bad.Count -eq 0) {
        Write-Host 'All components in desired state.'
    } else {
        Write-Host ("{0} component(s) not in desired state. Run 'apply' to fix." -f $bad.Count)
    }
}

function Do-Apply($states) {
    foreach ($s in $states) {
        if ($s.Status -eq 'OK' -or $s.Status -eq 'SKIPPED') { continue }

        if ($s.Name -like '*profile') {
            $dir = Split-Path $s.Path -Parent
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
            Backup-Once $s.Path
            Write-Utf8NoBom $s.Path $s.Desired
            Write-Host ("WROTE  {0}  {1}" -f $s.Name, $s.Path)
        } elseif ($s.Name -eq 'Clink prompt lua') {
            Backup-Once $s.Path
            Write-Utf8NoBom $s.Path $s.Desired
            Write-Host ("WROTE  {0}  {1}" -f $s.Name, $s.Path)
        } elseif ($s.Name -eq 'Clink prompt.spacing') {
            & $s.Exe set prompt.spacing sparse | Out-Null
            Write-Host ("SET    {0} -> sparse" -f $s.Name)
        } elseif ($s.Name -like '*exec policy') {
            Set-PolicyRemoteSigned $s.Exe
            Write-Host ("SET    {0} -> RemoteSigned (CurrentUser)" -f $s.Name)
        }
    }
    Write-Host ''
    Write-Host 'Result after apply:'
    Do-Diff (Get-States)
    Write-Host ''
    Write-Host 'Open a NEW terminal tab for changes to take effect.'
}

function Do-Restore($states) {
    foreach ($s in $states) {
        if ($s.Name -like '*profile') {
            $bak = "$($s.Path).bak"
            if (Test-Path $bak) {
                Move-Item $bak $s.Path -Force
                Write-Host ("RESTORED {0} from .bak" -f $s.Path)
            } elseif (Test-Path $s.Path) {
                $text = [System.IO.File]::ReadAllText($s.Path)
                $stripped = $RegionRegex.Replace($text, '')
                if ($stripped.Trim().Length -eq 0) {
                    Remove-Item $s.Path -Force
                    Write-Host ("DELETED  {0} (was only the managed region)" -f $s.Path)
                } else {
                    Write-Utf8NoBom $s.Path $stripped
                    Write-Host ("STRIPPED managed region from {0}" -f $s.Path)
                }
            }
        } elseif ($s.Name -eq 'Clink prompt lua') {
            $bak = "$($s.Path).bak"
            if (Test-Path $bak) {
                Move-Item $bak $s.Path -Force
                Write-Host ("RESTORED {0} from .bak" -f $s.Path)
            } elseif (Test-Path $s.Path) {
                Remove-Item $s.Path -Force
                Write-Host ("DELETED  {0}" -f $s.Path)
            }
        } elseif ($s.Name -eq 'Clink prompt.spacing') {
            if ($s.Exe) {
                & $s.Exe set prompt.spacing clear | Out-Null
                Write-Host 'RESET    prompt.spacing -> default (normal)'
            }
        } elseif ($s.Name -like '*exec policy') {
            Write-Host ("SKIPPED  {0} (execution policy left unchanged)" -f $s.Name)
        }
    }
    Write-Host ''
    Write-Host 'Open a NEW terminal tab for changes to take effect.'
}

# ---------------------------------------------------------------- dispatch

switch ($Command) {
    'show'    { Do-Show }
    'diff'    { Do-Diff (Get-States) }
    'apply'   { Do-Apply (Get-States) }
    'restore' { Do-Restore (Get-States) }
}
