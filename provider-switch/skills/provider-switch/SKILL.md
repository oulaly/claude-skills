---
name: provider-switch
description: [自制] 为当前项目切换模型供应商：执行确定性脚本（菜单选择/直接指定 slug），从全局清单 ~/.claude/providers.json 读取候选，写入项目级 .claude/settings.json（非密钥）与 settings.local.json（token），进项目自动生效。脚本也可脱离 Claude Code 独立运行。
---

本 skill 是**薄壳**：核心逻辑在脚本 `provider-switch.mjs`（与本文件同目录）中，
你的职责只是执行脚本并转述结果，**不要自己手写 JSON 修改**。

## 执行方式

用户说「切换/设置项目模型供应商」「列出供应商」或调用 `/provider-switch` 时：

1. 用户意图明确时直接带参执行（cwd 为当前项目根目录）：
   - 列出：`node <skill目录>/provider-switch.mjs list`
   - 指定供应商：`node <skill目录>/provider-switch.mjs use <slug>`
   - 跟随全局：`node <skill目录>/provider-switch.mjs use --global`
   - 新增供应商：`node <skill目录>/provider-switch.mjs add`
2. 用户意图不明确时，先 `list` 展示候选与当前状态，用 `AskUserQuestion` 让用户选，
   再以 `use <slug>` 执行（菜单由脚本处理时亦可直接运行无参命令，但脚本菜单是
   终端编号输入，优先用 AskUserQuestion 保持一致交互）。
3. 原样转述脚本输出；脚本报错时把错误信息交给用户，不要尝试手工修复 JSON。

## 数据流（了解即可，脚本已处理）

- 清单：`~/.claude/providers.json`（本机文件，含 token，不进任何仓库）
- 写入：项目 `.claude/settings.json`（ANTHROPIC_* 非密钥 env，可提交共享）
  + `.claude/settings.local.json`（token，自动检查 .gitignore）
- 修改前自动备份 `.bak`；token 输出一律脱敏

## 注意事项

- 提醒用户：若系统环境变量存在同名 `ANTHROPIC_*`，可能覆盖项目配置，建议清理后统一管理。
- 切换后新开会话生效。
