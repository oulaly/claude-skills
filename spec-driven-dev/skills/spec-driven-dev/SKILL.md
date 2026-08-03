---
name: spec-driven-dev
description: 规范驱动开发总入口：编排 spec-change-flow（变更流程）、ai-collab-guardrails（协作护栏）、dev-conventions（开发规范）、workflow-authoring（workflow 规范）四个子规范，覆盖需求立项到合入门禁的完整流程。适用于新需求启动、开发流程问答、规范落地检查。
---

本 skill 是规范驱动开发体系的**总入口**，不重复各子规范内容，负责判断场景并分发到对应子规范。子规范以独立 skill 形式存在（需一并安装），被分发时通过 Skill 工具按名调用。

## 子规范一览

| 子规范 | 触发场景 |
|--------|----------|
| `spec-change-flow` | 新需求/变更立项：变更包四件套、分级、冻结点、角色分工、编号与文档同步 |
| `ai-collab-guardrails` | 任何代码修改：自主/确认权限边界、修改前确认、测试门禁、TEST_REPORT |
| `dev-conventions` | 命名、提交信息、分支、代码风格问题（项目已有约定优先） |
| `workflow-authoring` | 编写/审查 `.claude/workflows/` 编排脚本 |

## 完整流程（需求 → 合并）

```
需求提出
  └─ spec-change-flow：判定变更级别（豁免/标准/重大）
       ├─ 豁免级 → 直接修改（仍受 ai-collab-guardrails 约束）
       └─ 标准/重大级 → 建变更包 docs/changes/<slug>/
            ├─ 立项：analysis.md + prd.md        ⏸ 冻结点（重大级强制人类确认）
            ├─ 设计：design.md (+ tests.md 策略)  ⏸ 冻结点 + 合规预审
            ├─ 实施：代码 + 单测 + 埋点 ∥ 部署     （贯穿 dev-conventions、ai-collab-guardrails）
            ├─ 验证：集成/E2E + TEST_REPORT.md
            └─ 门禁：质量合规终审，pass 后方可合并
```

## 使用规则

1. **先判场景再分发**：用户问题命中上表某行时，调用对应子规范 skill 执行；多场景叠加时按流程顺序逐个调用。
2. **贯穿性约束**：`dev-conventions` 与 `ai-collab-guardrails` 在所有阶段始终生效，无需显式触发。
3. **冻结点即卡点**：到达冻结点时停下等待确认，不得自动推进到下一阶段（重大级必须人类确认）。
4. **编排可选**：多阶段执行可用标准 workflow 编排（编写规范见 `workflow-authoring`），也可由主 agent 逐阶段手动推进。
5. **项目约定优先**：项目自身的 CLAUDE.md/文档与子规范冲突时，以项目约定为准。
