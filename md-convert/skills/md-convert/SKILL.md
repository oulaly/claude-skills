---
name: md-convert
description: "Converts markdown to self-contained HTML (base64-embedded images) or DOCX (embedded images), with optional mermaid diagram rendering via kroki.io. Invoke when user asks to convert/export markdown to HTML or DOCX, or render mermaid diagrams to PNG."
---

# Markdown 格式转换

将 markdown 文件转换为自包含的 HTML 或 DOCX，支持 mermaid 图表渲染和图片内嵌。

## 依赖安装

首次使用前需安装 Python 依赖：

```bash
pip install -r <skill目录>/requirements.txt
```

依赖：`markdown`、`python-docx`

## 转换为 HTML

```bash
python <skill目录>/md_to_html.py <src_dir> [选项]
```

选项：
- `--md FILE1 FILE2 ...`：指定文件名（相对于 src_dir），默认处理所有 *.md
- `--render-diagrams`：将 src_dir/diagrams/*.mmd 通过 kroki.io 渲染为 PNG
- `-o, --output DIR`：输出目录，默认 `<src_dir>/build`

示例：
```bash
python ~/.claude/skills/md-convert/md_to_html.py docs/changes/my-feature --render-diagrams
```

## 转换为 DOCX

```bash
python <skill目录>/md_to_docx.py <src_dir> [选项]
```

选项：
- `--md FILE1 FILE2 ...`：指定文件名，默认处理所有 *.md
- `-o, --output DIR`：输出目录，默认 `<src_dir>/build`

示例：
```bash
python ~/.claude/skills/md-convert/md_to_docx.py docs/changes/my-feature
```

## 使用指引

1. 确认用户要转换的源目录路径
2. 确认输出格式（HTML / DOCX / 两者都要）
3. 如果源目录有 `diagrams/*.mmd` 文件且用户要 HTML，询问是否需要 `--render-diagrams`（需要网络访问 kroki.io）
4. 如果用户未指定文件名，默认转换源目录下所有 *.md
5. 执行脚本，转述输出结果
6. 答复末尾附上等效终端命令

## 注意事项

- markdown 中引用 `.svg` 的图片路径会自动替换为 `.png`
- HTML 输出图片以 base64 内嵌，生成完全自包含的单文件
- `--render-diagrams` 需要网络访问 kroki.io
- 输出默认在 `<src_dir>/build/` 目录下
