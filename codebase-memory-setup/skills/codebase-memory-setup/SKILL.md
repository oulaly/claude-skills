---
name: codebase-memory-setup
description: 安装/体检/卸载 codebase-memory-mcp（代码知识图谱 MCP server，自动增量索引）：编排官方安装脚本（自动校验 SHA-256），注册 MCP 条目（用户级 ~/.claude.json 或项目级 .mcp.json 团队共享），注入 CLAUDE.md「优先图谱查询」指引。确定性脚本可脱离 Claude Code 独立运行。
---

本 skill 是**薄壳**：核心逻辑在脚本 `codebase-memory-setup.mjs`（与本文件同目录）中，
你的职责只是执行脚本并转述结果，**不要自己手写 JSON 修改**。

## 执行方式

用户说「装/接入 codebase-memory」「配置代码图谱 MCP」或调用 `/codebase-memory-setup` 时：

1. **install 前必须先确认**：安装会**下载并执行官方远程脚本、安装闭源预编译二进制**。
   先向用户说明这一点并获得同意，再执行。确认后**一段完成**——一次 Bash 调用
   `node <skill目录>/codebase-memory-setup.mjs install`（用户提到团队共享/项目级时加 `--project`），
   原样转述输出。
2. **用户只想看状态**（「装了没」「体检一下」）：一次 Bash 调用 `status`，转述结果。
3. **意图模糊**：先 `status`，把体检结果交给用户，由用户决定下一步（两段）。
4. **卸载**：`uninstall` 只清项目级条目（默认，安全）；`uninstall --all` 连二进制与
   用户级配置一起卸。执行前向用户说明两者区别并确认。
5. 脚本报错时把错误信息交给用户，不要尝试手工修复 JSON。
6. **答复末尾必须列出等效终端命令**：如
   `node ~/.claude/skills/codebase-memory-setup/codebase-memory-setup.mjs status`，
   并提示终端直跑不经过 LLM、下次更快。

## 权限与会话模式

- **install 被权限系统拦截是预期场景**：auto 模式下分类器可能以「执行外部下载代码」
  为由拒绝（对话中的用户同意不被视为对外部来源的授权）；分类器临时故障时也会默认
  阻断。被拦截后**不要反复重试同一命令**，按下面路径引导用户。
- **三条出路**（按推荐顺序）：
  1. 用户切换权限模式（`Shift+Tab` 或 `/permissions`，auto -> default），
     之后同类命令弹交互确认框，由用户手动放行；
  2. 在 `/permissions` 为本脚本加 allow 规则（之后免确认、不受分类器故障影响）：
     `Bash(node <skill目录>/codebase-memory-setup.mjs:*)`；
  3. 用户以 `!` 前缀在输入框直跑 install 命令（用户发起的命令不经分类器）。
- **已知环境问题（脚本已内建修复，仅作排查参考）**：会话内派生的 powershell.exe
  （5.1）会继承 pwsh 7 的 PSModulePath，导致官方安装脚本里 `Get-FileHash` 不可用；
  本脚本调用安装器前已剔除该变量。若用户**在终端手动**跑官方 install.ps1 遇到同样
  报错，在脚本执行前 `Import-Module Microsoft.PowerShell.Utility` 即可，系统环境
  本身无需修复。

## 子命令与数据流（了解即可，脚本已处理）

| 子命令 | 作用 |
|---|---|
| `status` | 体检：二进制路径/版本、用户级与项目级 MCP 条目、CLAUDE.md 指引块 |
| `install` | 缺二进制则跑官方安装脚本；确保用户级 MCP 条目存在（兜底手动安装场景） |
| `install --project` | 额外写项目 `.mcp.json`（命令名形式，可提交共享）+ CLAUDE.md 指引块 |
| `uninstall` | 移除项目级条目（.mcp.json / CLAUDE.md 块），保留二进制与用户级配置 |
| `uninstall --all` | 再调上游 `uninstall` 移除二进制与其自带的用户级 skill/hooks；非 TTY 下退化为打印手动命令 |

- 二进制安装位置：Windows `%LOCALAPPDATA%\Programs\codebase-memory-mcp\`，unix `~/.local/bin/`
- Windows 下执行安装脚本时**优先用 `pwsh`（PowerShell 7，若已安装）**，检测不到再退回系统自带
  `powershell`（5.1）；两者对安装脚本参数兼容，7 的 TLS 默认值更稳
- 上游安装器默认还会注册用户级 MCP（~/.claude.json）并安装它自带的 skill/hooks/agents——
  正常行为，正是「自动提示优先用图谱」的机制，不要当成异常
- 所有 JSON / CLAUDE.md 写入前自动 .bak 备份

## 注意事项

- **信任边界**：二进制为上游闭源预编译（C 编写），安装脚本只从官方仓库
  `DeusData/codebase-memory-mcp` 获取；不要改用其他来源或镜像。
- 项目级 `.mcp.json` 条目用命令名（`codebase-memory-mcp`），依赖各成员机器 PATH 中有该
  二进制；用户级条目用绝对路径（仅本机）。
- MCP 生效需**新开会话**，验证方式：会话内 `/mcp` 应列出 codebase-memory-mcp。
- 装好后首次让 Claude 调 `index_repository` 建索引（大库需等待；其后 watcher 自动增量更新）。
- 图谱可视化：终端运行 `codebase-memory-mcp --ui=true` 后访问 localhost:9749。
