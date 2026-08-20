' notify-focus.vbs - launch notify-focus.ps1 with NO console window.
' Why: powershell.exe is a console app; on Windows 11 with "Default terminal
' application" = Windows Terminal, launching it (even -WindowStyle Hidden)
' opens a new Windows Terminal window. wscript has no console and
' WScript.Shell.Run with window style 0 keeps the PowerShell hidden too.
If WScript.Arguments.Count = 0 Then WScript.Quit
Dim sh, fso, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ _
    & fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "notify-focus.ps1") _
    & """ """ & WScript.Arguments(0) & """"
sh.Run cmd, 0, False
