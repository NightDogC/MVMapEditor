"""
MVMap 占位图标导出工具 —— 把 MVMapEditor 词表里 manual 类型的 emoji 渲染成 png，给 UE 导入工具当占位图标

做法：
    用本机的 Chrome / Edge 无头模式打开一个临时页面。页面加载 MVMapEditor 的词表 mvmap-types.js，
    再用和编辑器画 stamp 完全相同的画法（canvas fillText、同一组 emoji 字体）逐个画出 manual 类型的 emoji，
    导出为带透明通道的 png。浏览器和字体都和编辑器里看到的是同一套，所以图标一致。

    字体组是从 MVMapEditor 的 index.html 里读出来的。编辑器改了 stamp 的画法、找不到这组字体时，
    脚本会报错退出，不会悄悄用别的字体。

    导出后自动调用 Batches/Python/dilate_alpha.py --dilate-only（在 MVMapEditor 仓库外，按相对本脚本的
    ../../Batches/Python 查找），把透明像素的 RGB 换成相邻可见像素的颜色，避免 UE 里双线性过滤出现黑边。
    找不到它时只跳过这一步并给出警告。

输出：
    <输出目录>/T_Emoji_MVMap_<typeId>.png，例如 T_Emoji_MVMap_SavePoint.png。导出词表里所有 generate 为 manual 的类型：
    全部 stamp，以及 manual 的 structure / edge 类型（如单向门、隐藏区域）。后两者在编辑器地图上不画 emoji，
    用的是词表里给它们配的 emoji，画法和 stamp 相同。

用法：
    python export_mvmap_stamp_icons.py                      （默认输出到本目录下的 StampIcons/，由 P4 管理、git 不跟踪）
    python export_mvmap_stamp_icons.py --out D:/somewhere   （指定输出目录）
    python export_mvmap_stamp_icons.py --size 128           （贴图边长，默认 256，必须是 2 的次幂）

导入 UE：
    把 png 拖进 Content/ProjectNS/UI/Icon/Emoji/（UE 资产名和 png 同名），贴图设置里 Compression 选 UserInterface2D、
    Mip Gen 选 NoMipmaps，然后在 Project Settings > Editor > NS MVMap Import > Placeholder Icons 里
    按 typeId 配上。

依赖：
    本机装有 Chrome 或 Edge；Python 库 pillow、numpy、scipy（dilate_alpha.py 需要）。
"""

import argparse
import base64
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

# 路径都相对本脚本所在位置（MVMapEditor 根目录）计算，和从哪个目录运行无关。
SCRIPT_DIR = Path(__file__).resolve().parent
MVMAP_DIR = SCRIPT_DIR
DEFAULT_OUT = SCRIPT_DIR / "StampIcons"  # 由 P4 管理，已在 .gitignore 里排除
# dilate_alpha.py 在 MVMapEditor 仓库外：ArtResource/MVMapEditor -> 仓库最外层 -> Batches/Python
DILATE_SCRIPT = SCRIPT_DIR.parent.parent / "Batches" / "Python" / "dilate_alpha.py"

BROWSER_CANDIDATES = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]

# 编辑器里 stamp 的写法：ctx.font = `${...}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", ${FONTF}`;
STAMP_FONT_PATTERN = re.compile(r'ctx\.font = `\$\{Math\.max\(6, Math\.round\(s \* 0\.62\)\)\}px ([^`$]+), \$\{FONTF\}`')
FONTF_PATTERN = re.compile(r"const FONTF = `([^`]+)`;")

# 编辑器里 emoji 字号是格子边长的 0.62，竖直方向往下偏格子边长的 0.04。图标里把 emoji 放大到
# 贴图边长的 EMOJI_SCALE，偏移按同一比例换算，形状和位置关系与编辑器一致。
EDITOR_FONT_RATIO = 0.62
EDITOR_OFFSET_RATIO = 0.04
EMOJI_SCALE = 0.8

PAGE_TEMPLATE = """<!doctype html>
<html><head><meta charset="utf-8">
<script src="{types_url}"></script>
</head><body>
<pre id="out"></pre>
<script>
(async () => {{
  const size = {size};
  const fontPx = Math.round(size * {emoji_scale});
  const font = `${{fontPx}}px {font_stack}`;
  const offset = fontPx * {offset_ratio} / {font_ratio};
  const result = {{}};
  try {{
    await document.fonts.load(font);
  }} catch (e) {{}}
  for (const t of MVMapTypes.types.filter((x) => x.generate === "manual")) {{
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = font;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(t.emoji, size / 2, size / 2 + offset);
    result[t.id] = {{ emoji: t.emoji, label: t.label, png: canvas.toDataURL("image/png") }};
  }}
  document.getElementById("out").textContent = JSON.stringify(result);
}})();
</script>
</body></html>
"""


def find_browser() -> Path:
    for candidate in BROWSER_CANDIDATES:
        if candidate.exists():
            return candidate
    sys.exit("找不到 Chrome 或 Edge（查过：" + "、".join(str(p) for p in BROWSER_CANDIDATES) + "）。")


def read_editor_font_stack(index_html: Path) -> str:
    """编辑器画 stamp 用的字体组，原样照抄（包括 FONTF 兜底字体）。"""
    text = index_html.read_text(encoding="utf-8")
    stamp_fonts = STAMP_FONT_PATTERN.findall(text)
    fontf = FONTF_PATTERN.findall(text)
    if not stamp_fonts or not fontf:
        sys.exit(f"在 {index_html} 里找不到 stamp 的字体写法（ctx.font = `...px \"Segoe UI Emoji\"...`）或 FONTF。"
                 "编辑器改过 stamp 的画法，先更新本脚本里的 STAMP_FONT_PATTERN / FONTF_PATTERN。")
    if len(set(stamp_fonts)) != 1:
        sys.exit(f"index.html 里 stamp 的字体写法不止一种：{sorted(set(stamp_fonts))}，不知道该用哪个。")
    return f"{stamp_fonts[0]}, {fontf[0]}"


def render(browser: Path, size: int, font_stack: str) -> dict:
    types_js = MVMAP_DIR / "mvmap-types.js"
    if not types_js.exists():
        sys.exit(f"找不到词表 {types_js}。")

    page = PAGE_TEMPLATE.format(
        types_url=types_js.as_uri(),
        size=size,
        emoji_scale=EMOJI_SCALE,
        font_stack=font_stack,
        offset_ratio=EDITOR_OFFSET_RATIO,
        font_ratio=EDITOR_FONT_RATIO,
    )
    with tempfile.TemporaryDirectory() as tmp:
        page_path = Path(tmp) / "render.html"
        page_path.write_text(page, encoding="utf-8")
        completed = subprocess.run(
            [str(browser), "--headless=new", "--disable-gpu", "--no-first-run", "--virtual-time-budget=5000",
             f"--user-data-dir={Path(tmp) / 'profile'}", "--dump-dom", page_path.as_uri()],
            capture_output=True, text=True, encoding="utf-8", timeout=120,
        )
    match = re.search(r'<pre id="out">(.*?)</pre>', completed.stdout, re.S)
    if completed.returncode != 0 or not match or not match.group(1).strip():
        sys.exit(f"浏览器没有输出渲染结果（返回码 {completed.returncode}）。\nstderr:\n{completed.stderr[-2000:]}")
    # dump-dom 输出的是 HTML，文本里的 & < > 被转义过。
    payload = match.group(1).replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    return json.loads(payload)


def check_color(png_path: Path) -> str:
    """空白，或者只有白色（emoji 字体缺失，退回成了单色文字）时返回问题描述。"""
    import numpy as np
    from PIL import Image

    pixels = np.asarray(Image.open(png_path).convert("RGBA"))
    visible = pixels[pixels[..., 3] > 128][:, :3]
    if visible.size == 0:
        return "图是空的"
    if (visible > 240).all():
        return "只有白色，看起来没用上彩色 emoji 字体"
    return ""


def main() -> int:
    # 中文 Windows 控制台默认 GBK，打印 emoji 会报错。
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="把 MVMapEditor 词表里 manual 类型的 emoji 渲染成 UE 占位图标 png")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"输出目录，默认 {DEFAULT_OUT}")
    parser.add_argument("--size", type=int, default=256, help="贴图边长（像素），必须是 2 的次幂，默认 256")
    args = parser.parse_args()

    if args.size < 16 or args.size & (args.size - 1):
        sys.exit("--size 必须是不小于 16 的 2 的次幂。")

    browser = find_browser()
    font_stack = read_editor_font_stack(MVMAP_DIR / "index.html")
    print(f"浏览器：{browser}")
    print(f"字体：{font_stack}")

    rendered = render(browser, args.size, font_stack)
    if not rendered:
        sys.exit("词表里没有 manual 类型。")

    args.out.mkdir(parents=True, exist_ok=True)
    written = []
    for type_id, item in rendered.items():
        data = item["png"].split(",", 1)[1]
        path = args.out / f"T_Emoji_MVMap_{type_id}.png"
        path.write_bytes(base64.b64decode(data))
        written.append(path)

    # 透明像素的颜色扩散，避免黑边。dilate_alpha.py 原地覆盖，不改尺寸。
    if not DILATE_SCRIPT.exists():
        print(f"警告：找不到 {DILATE_SCRIPT}（只单独拿到了 MVMapEditor 仓库？），png 已导出，但透明边缘没有处理。", file=sys.stderr)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            list_file = Path(tmp) / "list.txt"
            list_file.write_text("\n".join(str(p) for p in written), encoding="utf-8")
            dilate = subprocess.run([sys.executable, str(DILATE_SCRIPT), "--dilate-only", "--file-list", str(list_file)])
            if dilate.returncode != 0:
                print("警告：dilate_alpha.py 执行失败，png 已导出，但透明边缘没有处理。", file=sys.stderr)

    problems = 0
    for type_id, item in rendered.items():
        path = args.out / f"T_Emoji_MVMap_{type_id}.png"
        problem = check_color(path)
        status = f"  ← 问题：{problem}" if problem else ""
        problems += 1 if problem else 0
        print(f"{path.name}  {item['emoji']} {item['label']}{status}")

    print(f"\n导出 {len(written)} 张到 {args.out}" + (f"，其中 {problems} 张有问题，见上方标注。" if problems else "。"))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
