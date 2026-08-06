---
name: provider-switch
description: 为当前项目切换模型供应商：执行确定性脚本（菜单选择/直接指定 slug），从全局清单 ~/.claude/providers.json 读取候选，写入项目级 .claude/settings.json（非密钥）与 settings.local.json（token），进项目自动生效。脚本也可脱离 Claude Code 独立运行。
---

本 skill 是**薄壳**：核心逻辑在脚本 `provider-switch.mjs`（与本文件同目录）中，
你的职责只是执行脚本并转述结果，**不要自己手写 JSON 修改**。

## 执行方式

用户说「切换/设置项目模型供应商」「列出供应商」或调用 `/provider-switch` 时，
按以下效率规则执行（LLM 往返最少化）：

1. **用户已指明供应商**（说了 slug 或供应商名，如「切换到火山方舟」）：
   **一段完成**——直接一次 Bash 调用 `node <skill目录>/provider-switch.mjs use <slug>`，
   原样转述输出。不要先 list、不要再确认（slug 与用户口述不一致无法确定时才确认）。
2. **用户未指明供应商**：**两段完成**——
   - 第 1 段：同一轮内先 Bash 执行 `list`（拿到候选与当前状态），紧接 `AskUserQuestion`
     弹选项（按下文展示规则），中间不输出无关内容；
   - 第 2 段（用户选择后）：立即一次 Bash 调用 `use <slug>`，转述结果。
   这是会话内交互的最小往返，无法再压缩；追求零 LLM 时可提示用户在终端直接运行脚本。
3. 其他子命令：`use --global`、`add`，均一次 Bash 调用完成。
4. **禁止通过 Bash 无参运行脚本**：其编号菜单需要 TTY，Bash 工具下等不到输入会造成
   空轮次。交互选择一律走 `AskUserQuestion`（脚本在非 TTY 下会退化为输出清单）。
5. 脚本报错时把错误信息交给用户，不要尝试手工修复 JSON。
6. **不要分析、不要解释、不要复述计划**：收到调用后不再审视项目文件、不展开
   推理过程、不输出执行前后的铺垫文字，直接按上述规则发起对应的脚本调用，
   输出仅限脚本结果转述与第 7 条的终端等效命令。
7. **答复末尾必须列出等效终端命令**：每次执行完（list/use/--global/add 均适用），
   在答复最后附上「终端等效命令」小节，给出用户本次操作对应的可直接在终端运行的
   命令（如 `node ~/.claude/skills/provider-switch/provider-switch.mjs use <slug>`），
   并提示终端直跑不经过 LLM、下次更快。

**选项展示规则**（单次 `AskUserQuestion` 调用最多 4 个标签页 × 每页 4 个选项）：
   - 供应商 ≤ 3 个：单个标签页，选项为「各供应商」+「跟随全局」。
   - 供应商 > 3 个：**一次调用拆多个标签页**（不追加 LLM 往返）。把供应商按每页 3 个
     分组，每页末位放「本页不选」；「跟随全局」放最后一页。标签页 header 用
     「供应商 1/2」「供应商 2/2」等。
   - 冲突处理：若用户在多个标签页都选了供应商，以**最后一个标签页**的选择为准，
     执行前向用户说明；只有一页有有效选择时直接用。
   - 绝不用「选 Other 输入 slug」代替选项列出。

## 数据流（了解即可，脚本已处理）

- 清单：`~/.claude/providers.json`（本机文件，含 token，不进任何仓库）
- 写入：项目 `.claude/settings.json`（ANTHROPIC_* 非密钥 env，可提交共享）
  + `.claude/settings.local.json`（token，自动检查 .gitignore）
- 修改前自动备份 `.bak`；token 输出一律脱敏

## 注意事项

- **经 LLM 切换依赖当前供应商 API 可达**：`/provider-switch` 本身要过 LLM，当前供应商
  API 不可用时会话内调不动本 skill，无法切换。此时只能在终端直跑脚本或手动改配置：
  ① 清掉项目级配置跟随全局：`node ~/.claude/skills/provider-switch/provider-switch.mjs use --global`；
  ② 或手动修改本项目 `.claude/settings.json` 与 `.claude/settings.local.json` 中的 `ANTHROPIC_*`。
  终端直跑不经 LLM，API 故障时仍可切换——这也是推荐它的原因之一。
- **token 不进对话**：list/use 输出脚本已脱敏；但**不要在会话内用 `add` 录入 token**——
  选项框输入的 token 会进入对话记录。新增供应商请提示用户在终端直接运行
  `node provider-switch.mjs add`（TTY 输入），或手动编辑 `~/.claude/providers.json`。
- 提醒用户：若系统环境变量存在同名 `ANTHROPIC_*`，可能覆盖项目配置，建议清理后统一管理。
- 切换后新开会话生效。
