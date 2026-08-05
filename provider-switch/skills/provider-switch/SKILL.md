---
name: provider-switch
description: 为当前项目交互式切换模型供应商（类似 /model 的选项选择）：从全局供应商清单 ~/.claude/providers.json 读取候选，选中后写入项目级 .claude/settings.json（非密钥配置）与 .claude/settings.local.json（token），实现进项目自动生效。也支持管理供应商清单（新增/查看）。
---

当用户要求「切换/设置项目模型供应商」「按部门配置 provider」或调用 `/provider-switch` 时执行。

## 核心概念

- **全局清单**：`~/.claude/providers.json` 登记所有可用供应商（本机文件，不进任何仓库）。
- **项目级生效**：选中后写入当前项目的 `.claude/settings.json`（BASE_URL/MODEL 等非密钥项，
  可提交共享）与 `.claude/settings.local.json`（token，不提交）。
- Claude Code 配置优先级：项目本地 > 项目 > 用户全局，因此进项目即自动切换，无需手动操作。

清单格式：

```json
{
  "providers": {
    "<slug>": {
      "label": "显示名（如 Kimi K3 / 部门B网关）",
      "env": {
        "ANTHROPIC_BASE_URL": "https://...",
        "ANTHROPIC_MODEL": "..."
      },
      "token": "sk-...（可选；缺失则切换时询问）"
    }
  }
}
```

## 流程 1：切换供应商（主流程）

1. **读取清单**：读 `~/.claude/providers.json`。
   - 不存在 → 进入「流程 3：初始化清单」。
   - 存在但为空 → 提示先新增供应商（流程 2）。
2. **展示当前状态**：读当前项目 `.claude/settings.json` / `settings.local.json` 的
   `env.ANTHROPIC_BASE_URL`，告知当前项目用的是哪个供应商（未配置则为「跟随全局」）。
3. **选项选择**：用 `AskUserQuestion` 列出所有供应商（label + BASE_URL 摘要，
   当前生效的标注「(当前)」），另加「跟随全局（清除项目级配置）」选项。
4. **写入项目配置**：
   - 创建/更新 `.claude/settings.json`：合并写入 `env`（ANTHROPIC_BASE_URL、ANTHROPIC_MODEL
     及清单中其他非密钥项）。**用 Read/Edit 精确合并，不得整文件重写、不得丢失已有键**。
   - token 写入 `.claude/settings.local.json`（同样合并写）；清单中无 token 时通过
     `AskUserQuestion` 的 Other 让用户输入。
   - 选「跟随全局」：从两个项目文件中删除 ANTHROPIC_* 相关 env 键（键空则删 env 对象）。
5. **检查 .gitignore**：确认 `.claude/settings.local.json` 已被 git 忽略；
   未忽略则追加到项目 `.gitignore` 并告知。
6. **冲突检查**：若系统环境变量存在同名 `ANTHROPIC_*`（Windows 查 `setx`/注册表、
   Unix 查 shell profile），提醒其优先级可能覆盖项目配置，建议清理后统一管理。
7. **汇报**：显示写入结果与生效方式（新开会话生效）。

## 流程 2：新增供应商到清单

1. 通过 `AskUserQuestion`（Other 输入）依次收集：slug、label、ANTHROPIC_BASE_URL、
   ANTHROPIC_MODEL、token（可留空）、其他 ANTHROPIC_* 键（可留空）。
2. 合并写入 `~/.claude/providers.json`（备份原文件为 `.bak`），确认后返回主流程。

## 流程 3：初始化清单

1. 告知清单不存在，提议从**用户级全局配置**（`~/.claude/settings.json` 的 `env` 中
   ANTHROPIC_* 项）导入为第一个供应商，slug 让用户命名（如 `kimi`）。
2. 用户确认后创建清单文件，再进入主流程。

## 注意事项

- token 只能出现在 `~/.claude/providers.json` 与项目 `settings.local.json`，
  **绝不写入** `settings.json` 或任何会被提交的文件。
- 打印配置到对话时，token 一律脱敏为 `sk-...xxxx`（只留后 4 位）。
- 所有 JSON 修改先备份（`.bak`），用 Read/Edit 精确合并，保持 JSON 合法。
- 项目级 `settings.json` 可提交给团队共享（不含密钥），`settings.local.json` 是个人配置。
