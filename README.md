# claude-skills

[English](#english) | [中文](#中文)

---

## English

A collection of custom skills for [Claude Code](https://claude.ai/code).

### Skills

| Skill | Description |
|-------|-------------|
| [commit-staged](commit-staged/skills/commit-staged/SKILL.md) | Analyzes staged changes, generates Chinese Conventional Commits messages, confirms via a keyboard-driven option UI, and commits — optionally split into multiple commits by scope, with an optional task-ID step (e.g. Teambition `#xxx`). |
| [spec-driven-dev](spec-driven-dev/skills/spec-driven-dev/SKILL.md) | **Entry point** of the spec-driven development system — routes to the four sub-skills below. |
| [spec-change-flow](spec-change-flow/skills/spec-change-flow/SKILL.md) | Spec-driven change flow: change-package docs (analysis/prd/design/tasks), change levels & freeze points, role division, ID conventions, doc sync. |
| [ai-collab-guardrails](ai-collab-guardrails/skills/ai-collab-guardrails/SKILL.md) | AI collaboration guardrails: autonomy vs. human-confirmation boundaries, pre-edit confirmation, test gates, TEST_REPORT conventions. |
| [dev-conventions](dev-conventions/skills/dev-conventions/SKILL.md) | General dev conventions: naming, Conventional Commits, branch naming, code style principles (project conventions win). |
| [workflow-authoring](workflow-authoring/skills/workflow-authoring/SKILL.md) | Standards for authoring Claude Code workflows: meta/phases, args contract, staged freeze points, role fan-out, output schemas. |
| [claude-md-init](claude-md-init/skills/claude-md-init/SKILL.md) | Generate or review a project CLAUDE.md from a generic template: fact-checked commands, single source of truth, authority boundaries, common pitfalls. |
| [statusline-setup](statusline-setup/skills/statusline-setup/SKILL.md) | Install/uninstall/customize a Claude Code statusline — `cwd (branch) [model]`, zero dependencies (bash + sed + git), backs up settings.json automatically. |

> `spec-driven-dev` orchestrates the other three spec skills — install all four together for the full system.

### Install

**Option A — as plugins (recommended):**

```
/plugin marketplace add oulaly/claude-skills
/plugin install commit-staged@oulaly-skills
/plugin install spec-driven-dev@oulaly-skills
```

**Option B — copy the skill folder:**

```bash
git clone https://github.com/oulaly/claude-skills.git

# For all projects (personal):
cp -r claude-skills/<skill>/skills/<skill> ~/.claude/skills/

# Or for a single project (shared with the team via the project repo):
cp -r claude-skills/<skill>/skills/<skill> <your-project>/.claude/skills/
```

Then restart Claude Code and invoke the skill (e.g. `/commit-staged` after `git add`).

### Customization

- The task-ID step in commit-staged (section 4 of `SKILL.md`) is a team convention example — delete that section if your team doesn't need it.
- The default `Co-Authored-By` trailer can be changed to whatever your team requires.
- All spec-driven skills yield to the project's own conventions (CLAUDE.md / CONTRIBUTING) when they conflict.

### License

MIT

---

## 中文

[Claude Code](https://claude.ai/code) 的自定义 skill 合集。

### Skill 列表

| Skill | 说明 |
|-------|------|
| [commit-staged](commit-staged/skills/commit-staged/SKILL.md) | 分析已暂存的改动，生成中文 Conventional Commits 提交信息，通过键盘选项界面确认后提交；支持按 scope 拆分为多个 commit，可选确认任务 ID（如 Teambition `#xxx`）。 |
| [spec-driven-dev](spec-driven-dev/skills/spec-driven-dev/SKILL.md) | 规范驱动开发体系**总入口**，按场景分发到下面四个子规范。 |
| [spec-change-flow](spec-change-flow/skills/spec-change-flow/SKILL.md) | 规范驱动变更流程：变更包四件套、变更分级与冻结点、多角色分工、编号规范、文档同步。 |
| [ai-collab-guardrails](ai-collab-guardrails/skills/ai-collab-guardrails/SKILL.md) | AI 协作护栏：自主/确认权限边界、修改前确认规则、测试门禁、TEST_REPORT 测试报告规范。 |
| [dev-conventions](dev-conventions/skills/dev-conventions/SKILL.md) | 通用开发规范：命名约定、Conventional Commits、分支命名、代码风格原则（项目已有约定优先）。 |
| [workflow-authoring](workflow-authoring/skills/workflow-authoring/SKILL.md) | Claude Code workflow 编写规范：meta/phases、args 契约、分阶段冻结点、角色扇出、schema 输出、状态收敛。 |
| [claude-md-init](claude-md-init/skills/claude-md-init/SKILL.md) | 按通用模板生成或审查项目 CLAUDE.md：命令经实际验证、单一事实源、权威边界、常见陷阱、长度克制。 |
| [statusline-setup](statusline-setup/skills/statusline-setup/SKILL.md) | 安装/卸载/自定义 Claude Code 状态栏：显示「工作目录 (git 分支) [模型名]」，零依赖（bash + sed + git），自动备份 settings.json。 |

> `spec-driven-dev` 依赖另外三个规范子 skill，建议四个一起安装。

### 安装

**方式 A —— 插件安装（推荐）：**

```
/plugin marketplace add oulaly/claude-skills
/plugin install commit-staged@oulaly-skills
/plugin install spec-driven-dev@oulaly-skills
```

**方式 B —— 复制 skill 目录：**

```bash
git clone https://github.com/oulaly/claude-skills.git

# 个人级（所有项目可用）：
cp -r claude-skills/<skill>/skills/<skill> ~/.claude/skills/

# 或项目级（随项目仓库共享给团队）：
cp -r claude-skills/<skill>/skills/<skill> <你的项目>/.claude/skills/
```

然后重启 Claude Code，按需调用对应 skill（如 `git add` 后运行 `/commit-staged`）。

### 自定义

- commit-staged 的任务 ID 确认步骤（`SKILL.md` 第 4 节）是团队约定示例，不需要可整节删除。
- 默认的 `Co-Authored-By` 署名可按团队要求修改。
- 所有规范类 skill 与项目自身约定（CLAUDE.md / CONTRIBUTING）冲突时，以项目约定为准。

### 许可证

MIT
