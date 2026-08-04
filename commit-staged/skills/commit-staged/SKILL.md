---
name: commit-staged
description: 对已经 git add 的修改分析、生成中文 commit message，经确认后提交，支持按 scope 拆分为多个 commit，自动附加 Co-Authored-By 信息，可选确认任务 ID。
---

当用户调用 `/commit-staged`（或表达类似“提交已暂存改动”“commit staged 文件”“帮我提交”）时，按以下流程执行：

## 0. 交互方式（强制统一）

- **所有需要用户确认或选择的环节，必须一律使用 `AskUserQuestion` 工具**（方向键聚焦选项、回车/空格确认的界面），禁止以纯文本提问后等待用户打字回答。
- 需要用户自由输入时（如修改 message、填写新 ID），引导用户使用选项界面中的 “Other” 入口输入。
- 一次提问最多 4 个选项；有推荐项时将其放在第一位并标注 “(Recommended)”。

## 1. 检查暂存区

- 运行 `git status --short` 和 `git diff --staged --stat`。
- 如果没有 staged 文件，礼貌提示用户先执行 `git add`，然后结束。
- 如果同时存在 unstaged 修改，仅处理已 staged 的部分，并提示用户剩余未暂存的改动不会进入本次提交。

## 2. 按 scope 分组

根据 staged 文件路径，将变更拆分为逻辑独立的提交组。推断规则（通用，不绑定特定项目）：

- **顶层目录名作为 scope**：例如 `src/`、`app/`、`packages/`、`docs/`、`tests/`、`scripts/`、`config/` 等。
- **特殊文件类型**：
  - `*.md` 文档类 → `docs`
  - `*.test.*`、`*.spec.*`、`tests/**` → `test`
  - `package.json`、`pnpm-lock.yaml`、`yarn.lock`、`pyproject.toml`、`requirements.txt`、CI 配置 → `chore` 或 `repo`
- **根目录配置** → `repo`
- **无法推断时** → 使用 `repo` 或根据文件名生成简短的 scope

同一 scope 内若变更意图明显不同（例如同时包含新功能与 bug 修复），可进一步拆分为多个 commit。

## 3. 生成中文 commit message

- 格式遵循 Conventional Commits：`type(scope): 中文简要描述`。
- `type` 根据变更性质选择：
  - `feat`：新功能
  - `fix`：Bug 修复
  - `docs`：文档更新
  - `refactor`：重构（无功能变更）
  - `test`：测试相关
  - `chore`：构建/工具链/依赖变更
  - `perf`：性能优化
  - `security`：安全修复
- `subject` 使用中文，简洁明确，尽量控制在 50 字以内。
- 若变更较复杂，在 body 中补充“为什么修改”“主要做了什么”。body 也用中文。
- 若调用 skill 时附带了参数文本（如 `/commit-staged 补充说明内容`），将该文本作为补充说明加入每个 commit 的 body 末尾，并在确认计划中展示。

## 4. 确认任务 ID（可选步骤，按需保留）

> **本节为团队约定示例**：某些团队要求 commit message 关联任务管理平台的
> 需求/任务 ID（如 Teambition 的 `#xxx`）。如果你的团队没有此约定，
> 安装后可整节删除，流程会自动跳过本步骤。

1. 读取仓库本地文件 `.git/teambition-ids`（每行一个 ID，最近使用的在最前；不存在则视为空）。
2. 使用 `AskUserQuestion` 提问“本次提交关联的任务 ID？”：
   - 有历史记录时：选项为最近使用的 ID（最多 2 个，最近的排第一并标注 “(Recommended)”）+ “无关联 ID”；用户也可通过 “Other” 输入新 ID。
   - 无历史记录时：选项为 “无关联 ID” + “输入新 ID（选 Other 填写）”，并提示用户用 “Other” 直接输入 `#xxx`。
3. 处理结果：
   - 用户选择/输入了 ID：规范化为 `#xxx` 形式（去掉多余空格、补 `#` 前缀），将其写入 `.git/teambition-ids` 顶部并去重（文件最多保留 10 条），并在**每个 commit message 的 body 末尾**追加一行：`Teambition: #xxx`。
   - 用户选择“无关联 ID”：不加该行，继续流程。
4. 在确认计划中展示 ID 行的加入效果。

## 5. 展示提交计划并请求确认

以清晰列表形式输出：

- 每组包含的文件清单；
- 每组拟定的 commit message（含任务 ID 行，如有）；
- 预计生成几个 commit。

然后使用 `AskUserQuestion` 询问，选项固定为：

1. “按计划提交 (Recommended)”
2. “合并为一个 commit”
3. “修改 message”——用户选择后，引导其通过 “Other” 输入修改意见，调整后重新展示计划并再次确认。

## 6. 执行提交

用户确认后，按组逐个提交。

- 若只有一组，直接执行：
  ```bash
  git commit -m "type(scope): 中文描述" --trailer="Co-Authored-By: <当前Agent> + <当前模型> <noreply@localhost>"
  ```
- 若有多组，使用 `git commit --only <files...>` 逐个提交，避免影响其他 staged 文件：
  ```bash
  git commit --only <file1> <file2> ... -m "type(scope): 中文描述" --trailer="Co-Authored-By: <当前Agent> + <当前模型> <noreply@localhost>"
  ```
- 若用户要求合并为一笔，则对所有 staged 文件生成一个综合 message 后统一提交。
- 若用户要求修改 message，按用户意见调整后再次确认（仍使用 `AskUserQuestion`），再提交。

## 7. 收尾与报告

- 提交完成后，运行 `git log --oneline -n <提交数>` 展示结果。
- 若提交过程中出现错误、冲突或被 hooks 拦截，立即停止并报告错误信息，不强制继续。
- 保持友好、简洁的总结。

## 注意事项

- 绝不在未获用户明确同意前执行 `git commit`。
- 不要自动 push；本 skill 只负责本地 commit。
- 使用 `--trailer` 附加 AI 署名。**署名自动感知**：以当前会话声明的 CLI agent 与模型为准
  （如 `Claude Code CLI Agent + KIMI K3`），格式 `<Agent> + <模型> <noreply@localhost>`；
  无法确定时在确认计划阶段通过 `AskUserQuestion` 询问用户。不得沿用写死的署名。
- 若当前项目有明确的提交规范（如 `CLAUDE.md` 或 `CONTRIBUTING.md`），优先参考项目级约定。
- `.git/teambition-ids` 仅存在于本地 `.git` 目录，不会被提交，可安全写入。
