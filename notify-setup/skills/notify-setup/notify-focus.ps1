# notify-focus.ps1 - claude-notify: URI protocol handler.
# Invoked by Windows when the user clicks a toast notification.
# URI format: claude-notify:<urlencoded "projectName|terminalProcessName">
#
# Window lookup strategy: Claude Code rewrites the terminal title dynamically
# (spinner + task text), so title matching by project name is unreliable.
# Primary: visible windows of the terminal PROCESS (Tabby / WindowsTerminal).
# Preferred among them: title containing the project name (if any).
# Window granularity only (cannot switch terminal tabs - not possible externally).
param([string]$Uri)
$ErrorActionPreference = 'SilentlyContinue'

$kw = ''; $procName = ''
try {
    $s = [Uri]::UnescapeDataString(($Uri -replace '^claude-notify:', ''))
    $p = $s -split '\|', 2
    $kw = $p[0]
    if ($p.Count -gt 1) { $procName = $p[1] }
} catch {}

if (-not $kw -and -not $procName) { exit 0 }

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WinFocus {
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    public static List<string> Wins = new List<string>();
    static bool Cb(IntPtr h, IntPtr l) {
        var sb = new StringBuilder(512);
        GetWindowText(h, sb, 512);
        uint pid; GetWindowThreadProcessId(h, out pid);
        if (IsWindowVisible(h) && sb.Length > 0)
            Wins.Add(h.ToInt64() + "\t" + pid + "\t" + sb.ToString());
        return true;
    }
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    public static void Run() { Wins.Clear(); EnumWindows(Cb, IntPtr.Zero); }
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    public static void Focus(IntPtr h) {
        if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE only when minimized:
        // calling it on a maximized window would un-maximize it (change window size)
        SetForegroundWindow(h);
    }
}
"@

[WinFocus]::Run()
$any = [IntPtr]::Zero   # first window of the terminal process
$best = [IntPtr]::Zero  # its window whose title contains the project name
foreach ($w in [WinFocus]::Wins) {
    $f = $w -split "`t", 3
    if ($f.Count -lt 3) { continue }
    $h = [IntPtr]::new([int64]$f[0])
    $title = $f[2]
    if ($procName) {
        $pn = (Get-Process -Id ([int]$f[1])).ProcessName
        if ($pn -ieq $procName) {
            if ($kw -and $title -like "*$kw*") { $best = $h; break }
            if ($any -eq [IntPtr]::Zero) { $any = $h }
        }
    } elseif ($kw -and $title -like "*$kw*") {
        # unknown terminal: fall back to pure title matching
        $best = $h; break
    }
}
$target = $best
if ($target -eq [IntPtr]::Zero) { $target = $any }
if ($target -ne [IntPtr]::Zero) { [WinFocus]::Focus($target) }
