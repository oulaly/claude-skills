@echo off
REM claude-resume.cmd —— cmd 下的包装入口，优先用 pwsh，退回 powershell
where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoLogo -File "%USERPROFILE%\.claude\skills\session-resume\claude-resume.ps1" %*
) else (
    powershell -NoLogo -ExecutionPolicy Bypass -File "%USERPROFILE%\.claude\skills\session-resume\claude-resume.ps1" %*
)
