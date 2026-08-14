# -*- coding: utf-8 -*-
"""通用工具：将 markdown + PNG 渲染为 docx（图片内嵌）

用法:
    python md_to_docx.py <src_dir> [--md FILE1 FILE2 ...] [-o output_dir]

依赖: pip install python-docx
"""
import sys, os, re, argparse, glob

try:
    from docx import Document
    from docx.shared import Pt, Inches, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
except ImportError:
    print('错误: 缺少依赖 python-docx，请运行: pip install python-docx')
    sys.exit(1)


def set_cell_border(cell):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = tcPr.makeelement(qn('w:tcBorders'), {})
    for edge in ('top', 'left', 'bottom', 'right'):
        border = tcBorders.makeelement(qn(f'w:{edge}'), {
            qn('w:val'): 'single', qn('w:sz'): '4', qn('w:space'): '0', qn('w:color'): 'CCCCCC'
        })
        tcBorders.append(border)
    tcPr.append(tcBorders)


def add_formatted_text(paragraph, text):
    """Handle inline code, bold, links in text."""
    parts = re.split(r'(`[^`]+`|\*\*[^*]+\*\*)', text)
    for part in parts:
        if part.startswith('`') and part.endswith('`'):
            run = paragraph.add_run(part[1:-1])
            run.font.name = 'Consolas'
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
        elif part.startswith('**') and part.endswith('**'):
            run = paragraph.add_run(part[2:-2])
            run.bold = True
        elif part:
            paragraph.add_run(part)


def find_image(src_dir, output_dir, img_ref):
    """在 output_dir 和 src_dir 下查找图片文件，.svg 引用自动替换为 .png"""
    img_ref = img_ref.replace('.svg', '.png')
    for base in (output_dir, src_dir):
        img_path = os.path.join(base, img_ref)
        if os.path.exists(img_path):
            return img_path
    return None


def build_docx(src_dir, output_dir, md_name):
    md_path = os.path.join(src_dir, md_name)
    with open(md_path, encoding='utf-8') as f:
        lines = f.read().split('\n')

    doc = Document()
    style = doc.styles['Normal']
    style.font.name = 'Microsoft YaHei'
    style.font.size = Pt(10.5)
    style.paragraph_format.space_after = Pt(4)
    style.paragraph_format.line_spacing = 1.4

    i = 0
    in_code = False
    code_lines = []
    while i < len(lines):
        line = lines[i]

        # Code block
        if line.strip().startswith('```'):
            if in_code:
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(8)
                run = p.add_run('\n'.join(code_lines))
                run.font.name = 'Consolas'
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
                shading = p.paragraph_format.element.makeelement(qn('w:shd'), {
                    qn('w:val'): 'clear', qn('w:fill'): 'F7F7F7'
                })
                p.paragraph_format.element.get_or_add_pPr().append(shading)
                code_lines = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code_lines.append(line)
            i += 1
            continue

        # Image
        img_m = re.match(r'^!\[([^\]]*)\]\(([^)]+)\)', line.strip())
        if img_m:
            img_path = find_image(src_dir, output_dir, img_m.group(2))
            if img_path:
                doc.add_picture(img_path, width=Inches(6.5))
                last_p = doc.paragraphs[-1]
                last_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            i += 1
            continue

        # Headings
        h_m = re.match(r'^(#{1,4})\s+(.*)', line)
        if h_m:
            level = len(h_m.group(1))
            text = h_m.group(2).strip()
            p = doc.add_heading(level=level)
            add_formatted_text(p, text)
            i += 1
            continue

        # Table
        if '|' in line and i + 1 < len(lines) and re.match(r'^\s*\|[-:\s|]+\|?\s*$', lines[i+1]):
            rows = []
            rows.append([c.strip() for c in line.strip().strip('|').split('|')])
            i += 2
            while i < len(lines) and '|' in lines[i] and lines[i].strip():
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            if rows:
                table = doc.add_table(rows=len(rows), cols=len(rows[0]))
                table.autofit = True
                for ri, row in enumerate(rows):
                    for ci, cell_text in enumerate(row):
                        if ci < len(table.rows[ri].cells):
                            cell = table.rows[ri].cells[ci]
                            cell.text = ''
                            p = cell.paragraphs[0]
                            p.paragraph_format.space_after = Pt(0)
                            if ri == 0:
                                p.style = doc.styles['Normal']
                                for run in p.runs:
                                    run.bold = True
                            add_formatted_text(p, cell_text)
                            set_cell_border(cell)
                            if ri == 0:
                                shading = cell._tc.get_or_add_tcPr().makeelement(qn('w:shd'), {
                                    qn('w:val'): 'clear', qn('w:fill'): 'F5F5F5'
                                })
                                cell._tc.get_or_add_tcPr().append(shading)
                doc.add_paragraph()
            continue

        # Blockquote
        if line.strip().startswith('>'):
            text = re.sub(r'^>\s?', '', line).strip()
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(1)
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            add_formatted_text(p, text)
            for run in p.runs:
                run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
            i += 1
            continue

        # List items
        list_m = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)', line)
        if list_m:
            indent = len(list_m.group(1))
            text = list_m.group(3)
            p = doc.add_paragraph(style='List Bullet' if list_m.group(2) in '-*' else 'List Number')
            p.paragraph_format.left_indent = Cm(0.75 + indent * 0.4)
            add_formatted_text(p, text)
            i += 1
            continue

        # Horizontal rule
        if line.strip() in ('---', '***', '___'):
            doc.add_paragraph('-' * 40).alignment = WD_ALIGN_PARAGRAPH.CENTER
            i += 1
            continue

        # Empty line
        if not line.strip():
            i += 1
            continue

        # Normal paragraph
        p = doc.add_paragraph()
        add_formatted_text(p, line.strip())
        i += 1

    title = os.path.splitext(md_name)[0]
    out = os.path.join(output_dir, title + '.docx')
    doc.save(out)
    sz = os.path.getsize(out)
    print(f'{title}.docx OK {sz} bytes')


def main():
    parser = argparse.ArgumentParser(description='将 markdown + PNG 渲染为 docx（图片内嵌）')
    parser.add_argument('src_dir', help='包含 markdown 文件的源目录')
    parser.add_argument('--md', nargs='*', default=None, help='指定要处理的 markdown 文件名（默认处理所有 *.md）')
    parser.add_argument('-o', '--output', default=None, help='输出目录（默认 <src_dir>/build）')
    args = parser.parse_args()

    src_dir = os.path.abspath(args.src_dir)
    output_dir = os.path.abspath(args.output) if args.output else os.path.join(src_dir, 'build')
    os.makedirs(output_dir, exist_ok=True)

    if args.md:
        md_files = args.md
    else:
        md_files = sorted(os.path.basename(p) for p in glob.glob(os.path.join(src_dir, '*.md')))

    if not md_files:
        print(f'未找到 markdown 文件: {src_dir}')
        sys.exit(1)

    for md in md_files:
        build_docx(src_dir, output_dir, md)


if __name__ == '__main__':
    main()
