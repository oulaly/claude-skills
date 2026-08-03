---
name: dev-conventions
description: 通用开发规范：命名约定（Python/TypeScript/React/API/数据库/Git 分支）、Conventional Commits 提交信息、分支命名、代码风格原则。项目已有约定优先，本规范仅在项目无约定时生效。
---

**总原则：项目已有约定（lint 配置、CONTRIBUTING、CLAUDE.md 等）优先于本规范；本规范仅在项目无约定时作为默认。**

## 1. 命名约定

| 类型 | 规范 | 示例 |
|------|------|------|
| Python 模块 | 小写下划线 | `document_parser.py` |
| Python 类 | 大驼峰 | `DocumentParser` |
| Python 函数 | 小写下划线 | `parse_document` |
| Python 常量 | 大写下划线 | `MAX_CHUNK_SIZE` |
| React 组件 | 大驼峰 | `DocumentList.tsx` |
| TypeScript 接口 | 大驼峰（可选 I 前缀） | `IDocument` |
| Hook / 工具函数 | camelCase（Hook 加 use 前缀） | `useDocumentList` |
| API 端点 | 小写中划线 | `/api/knowledge-bases` |
| 数据库表 | 小写下划线复数 | `knowledge_bases` |
| Git 分支 | 前缀 + 小写中划线 | `feature/dingtalk-auth` |

## 2. 提交信息

使用 Conventional Commits 格式：`type(scope): subject`。

| Type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（无功能变更） |
| `test` | 测试相关 |
| `docs` | 文档更新 |
| `chore` | 构建/工具链变更 |
| `perf` | 性能优化 |
| `security` | 安全修复 |

## 3. 分支命名

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feature/` | 新功能 | `feature/dingtalk-auth` |
| `fix/` | Bug 修复 | `fix/race-condition-search` |
| `hotfix/` | 线上紧急修复 | `hotfix/login-token-expiry` |
| `refactor/` | 重构 | `refactor/extract-rag-pipeline` |
| `docs/` | 文档 | `docs/api-documentation` |
| `chore/` | 工具链 | `chore/update-dependencies` |

## 4. 代码风格原则

- **以项目 lint 配置文件为实际标准**：文档中写的风格约定（如行宽）若与 lint 配置
  （如 ruff/eslint/prettier 配置）冲突，以配置为准，并尽快修正文档消除不一致。
- Python 建议：自动格式化（Black 或 ruff format）+ import 排序 + 静态检查 + 类型标注 + docstring。
- TypeScript/React 建议：Prettier + ESLint（含 typescript-eslint）+ 严格模式 + 函数组件 + Hooks。
- 不在代码中硬编码环境相关值（API 地址、密钥等），只在应用层通过环境变量/配置注入。
