# claude-skills

[English](#english) | [中文](#中文)

---

## English

A collection of custom skills for [Claude Code](https://claude.ai/code).

### Skills

| Skill | Description |
|-------|-------------|
| [commit-staged](commit-staged/skills/commit-staged/SKILL.md) | Analyzes staged changes, generates Chinese Conventional Commits messages, confirms via a keyboard-driven option UI, and commits — optionally split into multiple commits by scope, with an optional task-ID step (e.g. Teambition `#xxx`). |

### Install

**Option A — as a plugin (recommended):**

```
/plugin marketplace add oulaly/claude-skills
/plugin install commit-staged@oulaly-skills
```

**Option B — copy the skill folder:**

```bash
git clone https://github.com/oulaly/claude-skills.git

# For all projects (personal):
cp -r claude-skills/commit-staged/skills/commit-staged ~/.claude/skills/

# Or for a single project (shared with the team via the project repo):
cp -r claude-skills/commit-staged/skills/commit-staged <your-project>/.claude/skills/
```

Then restart Claude Code and run `/commit-staged` after `git add`.

### Customization

- The task-ID step (section 4 of `SKILL.md`) is a team convention example — delete that section if your team doesn't need it.
- The default `Co-Authored-By` trailer can be changed to whatever your team requires.

### License

MIT

---

## 中文

[Claude Code](https://claude.ai/code) 的自定义 skill 合集。

### Skill 列表

| Skill | 说明 |
|-------|------|
| [commit-staged](commit-staged/skills/commit-staged/SKILL.md) | 分析已暂存的改动，生成中文 Conventional Commits 提交信息，通过键盘选项界面确认后提交；支持按 scope 拆分为多个 commit，可选确认任务 ID（如 Teambition `#xxx`）。 |

### 安装

**方式 A —— 插件安装（推荐）：**

```
/plugin marketplace add oulaly/claude-skills
/plugin install commit-staged@oulaly-skills
```

**方式 B —— 复制 skill 目录：**

```bash
git clone https://github.com/oulaly/claude-skills.git

# 个人级（所有项目可用）：
cp -r claude-skills/commit-staged/skills/commit-staged ~/.claude/skills/

# 或项目级（随项目仓库共享给团队）：
cp -r claude-skills/commit-staged/skills/commit-staged <你的项目>/.claude/skills/
```

然后重启 Claude Code，`git add` 之后运行 `/commit-staged` 即可。

### 自定义

- 任务 ID 确认步骤（`SKILL.md` 第 4 节）是团队约定示例，不需要可整节删除。
- 默认的 `Co-Authored-By` 署名可按团队要求修改。

### 许可证

MIT
