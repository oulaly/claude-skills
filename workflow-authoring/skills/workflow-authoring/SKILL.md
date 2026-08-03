---
name: workflow-authoring
description: Claude Code workflow 编写规范：文件布局、meta/phases 定义、args 契约注释、分阶段 stage 参数与冻结点、角色子代理扇出、COMMON 前导约束、结构化输出 schema、参数校验与状态收敛。适用于编写或审查 .claude/workflows/ 下的编排脚本。
---

当用户要编写、审查或标准化 Claude Code workflow（`.claude/workflows/*.js`）时，按本规范执行。

## 1. 文件布局

- 位置：项目 `.claude/workflows/<name>.js`，一个文件一个 workflow。
- 头部用 JSDoc 注释写清：用途、阶段流程、args 契约（字段名/类型/是否必需/枚举值/示例）。

```js
/**
 * <name> —— 一句话说明
 *
 * 流程：阶段A → 阶段B → 阶段C
 *
 * args: {
 *   slug: string,        // 必需，说明
 *   stage?: "a" | "b" | "c" | "all"   // 可选，默认 all
 * }
 */
```

## 2. meta 定义

- `export const meta` 必须是纯字面量：`name`、`description`、`phases`。
- `phases` 与脚本中的 `phase()` 调用**一一对应、同名**，每项带 `detail` 说明该阶段由哪个角色做什么。

## 3. 分阶段 + 冻结点（核心模式）

- 用 `STAGES` 字典登记各阶段函数；支持 `stage` 参数逐阶段执行（便于人工逐阶段冻结确认），`all` 顺序跑完全部。
- 每个冻结点阶段结束时用 `log('⏸ 冻结点：…')` 提示需要确认的内容，再进入下一阶段。
- 未知 `stage` 值直接抛错并列出可选值；必需 args 在脚本开头校验。

```js
const STAGES = { plan: stagePlan, design: stageDesign, /* … */ }
const stage = args.stage || 'all'
if (stage === 'all') { for (const [, fn] of Object.entries(STAGES)) await fn() }
else if (!STAGES[stage]) throw new Error(`未知 stage: ${stage}（可选 ${Object.keys(STAGES).join('/')}/all）`)
else await STAGES[stage]()
```

## 4. 角色子代理扇出

- 每个 `agent()` 调用代表一个角色：`label` 用角色名（如 `架构师`），`phase` 显式指定所属阶段分组（不要依赖全局 `phase()` 时序，避免并行时串组）。
- 同一阶段内可并行的角色用 `parallel()` 扇出（如 架构师 ∥ 测试工程师、开发 ∥ 运维）；有先后依赖的串行 `await`。
- 角色 prompt 以「你是【角色名】」开头，写清职责边界（只做什么、不做什么）与产出文件路径。

## 5. COMMON 前导约束

所有角色 prompt 共享一段 `COMMON` 约束，至少包含：

- 项目流程与文档位置（唯一源目录）；
- 编号/命名规范；
- 文档语言与风格基线（对齐仓库既有同类文档）；
- 「你的最终回复是给协调员的原始数据，不是给人看的消息：直接输出结构化结论」。

## 6. 结构化输出 schema

- 阶段产出用统一 schema（如 `{files, summary, openQuestions}`），门禁/审查类用 `{pass, issues[{kind, detail, owner}], summary}`。
- 协调员依据结构化结果做冻结判断与日志输出（如 `log(pre.pass ? '预审通过' : '发现问题')`），不解析自由文本。

## 7. 状态收敛

- 角色只更新自身职责范围内的任务状态，不动其他角色的条目。
- 环境不可用等原因无法执行时，标注 `⛔` 并注明原因与 Owner，不得静默跳过。
- 终审 `pass=false` 时中止后续流程并报告待回写问题数。

## 8. 其他约束

- workflow 脚本内禁用 `Date.now()`/`Math.random()`（会破坏断点续跑）；需要时间戳由 args 传入。
- 多阶段默认用 `pipeline()` 而非屏障式 `parallel()`，除非后续阶段确实需要全部前序结果。
- 脚本不落地为项目文件，通过 Workflow 工具内联传入或在 `.claude/workflows/` 中持久化复用。
