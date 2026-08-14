# -*- coding: utf-8 -*-
"""通用工具：将 markdown 渲染为自包含 HTML（图片 base64 内嵌）

用法:
    python md_to_html.py <src_dir> [--md FILE1 FILE2 ...] [--render-diagrams] [-o output_dir]

依赖: pip install markdown
"""
import sys, os, re, zlib, base64, urllib.request, argparse, glob

try:
    import markdown
except ImportError:
    print('错误: 缺少依赖 markdown，请运行: pip install markdown')
    sys.exit(1)

CSS = """
body { font-family: "Microsoft YaHei", sans-serif; max-width: 1100px; margin: 24px auto; padding: 0 16px; color: #333; line-height: 1.7; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; }
th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 14px; }
th { background: #f5f5f5; }
code { background: #f3f3f3; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
pre { background: #f7f7f7; padding: 12px; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; }
img { max-width: 100%; border: 1px solid #eee; }
blockquote { border-left: 4px solid #ddd; margin: 12px 0; padding: 4px 12px; color: #666; }
h1, h2, h3 { line-height: 1.4; }
"""


def download_png(src_dir, output_dir, name):
    """kroki.io: deflate + base64url 编码渲染 PNG"""
    src = os.path.join(src_dir, 'diagrams', name + '.mmd')
    out_dir = os.path.join(output_dir, 'diagrams')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, name + '.png')
    with open(src, 'rb') as f:
        data = f.read()
    enc = base64.urlsafe_b64encode(zlib.compress(data, 9)).decode('ascii')
    url = f'https://kroki.io/mermaid/png/{enc}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=90) as resp:
        png = resp.read()
    if not png.startswith(b'\x89PNG'):
        raise RuntimeError(f'{name}: not a PNG response')
    with open(out, 'wb') as f:
        f.write(png)
    print(f'{name}.png OK {len(png)} bytes')


def build_html(src_dir, output_dir, md_name):
    md_path = os.path.join(src_dir, md_name)
    with open(md_path, encoding='utf-8') as f:
        text = f.read()
    text = text.replace('.svg)', '.png)')  # 图片引用指向 PNG
    body = markdown.markdown(text, extensions=['tables', 'fenced_code'])

    def inline_img(m):
        src_attr = m.group(1)
        for base in (output_dir, src_dir):
            png_path = os.path.join(base, src_attr)
            if os.path.exists(png_path):
                with open(png_path, 'rb') as f:
                    b64 = base64.b64encode(f.read()).decode('ascii')
                return f'src="data:image/png;base64,{b64}"'
        return m.group(0)

    body = re.sub(r'src="(diagrams/[^"]+\.png)"', inline_img, body)
    title = os.path.splitext(md_name)[0]
    html = f'<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>{title}</title><style>{CSS}</style></head><body>{body}</body></html>'
    out = os.path.join(output_dir, title + '.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'{title}.html OK {len(html)} chars')


def main():
    parser = argparse.ArgumentParser(description='将 markdown 渲染为自包含 HTML（图片 base64 内嵌）')
    parser.add_argument('src_dir', help='包含 markdown 文件的源目录')
    parser.add_argument('--md', nargs='*', default=None, help='指定要处理的 markdown 文件名（默认处理所有 *.md）')
    parser.add_argument('--render-diagrams', action='store_true', help='将 diagrams/*.mmd 渲染为 PNG')
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

    if args.render_diagrams:
        diagrams_dir = os.path.join(src_dir, 'diagrams')
        if os.path.isdir(diagrams_dir):
            mmd_files = sorted(glob.glob(os.path.join(diagrams_dir, '*.mmd')))
            for mmd_path in mmd_files:
                name = os.path.splitext(os.path.basename(mmd_path))[0]
                download_png(src_dir, output_dir, name)
        else:
            print(f'未找到 diagrams 目录: {diagrams_dir}')

    for md in md_files:
        build_html(src_dir, output_dir, md)


if __name__ == '__main__':
    main()
