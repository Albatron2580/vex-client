# Builds the "Vex Client UI" resource pack: the title-screen logo says VEX CLIENT, buttons and
# sliders get the Vex look, and the splash texts are Vex ones.
# Usage: python3 tools/make-ui-pack.py <output.zip>
# The launcher ships the result in assets/vex-ui-pack.zip and enables it in every profile.
import io, json, math, random, sys, zipfile
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else 'vex-ui-pack.zip'
rnd = random.Random(1337)

# ---------- chunky pixel font (5 wide x 7 high) ----------
FONT = {
    'V': ['X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '.X.X.', '..X..'],
    'E': ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
    'X': ['X...X', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X', 'X...X'],
    'C': ['.XXXX', 'X....', 'X....', 'X....', 'X....', 'X....', '.XXXX'],
    'L': ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
    'I': ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'],
    'N': ['X...X', 'XX..X', 'X.X.X', 'X.X.X', 'X.X.X', 'X..XX', 'X...X'],
    'T': ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
    'M': ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
    'A': ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
    'R': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
    'F': ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'X....'],
    'J': ['..XXX', '...X.', '...X.', '...X.', '...X.', 'X..X.', '.XX..'],
    'D': ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
    'O': ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    'P': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
    'U': ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    'S': ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
    '•': ['.....', '.....', '.....', '..X..', '.....', '.....', '.....'],
    ' ': ['.....'] * 7,
}

def text_mask(text, cell, gap):
    w = sum((3 if ch == ' ' else 5) * cell + gap for ch in text) - gap
    h = 7 * cell
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    x = 0
    for ch in text:
        g = FONT[ch]
        cols = 3 if ch == ' ' else 5
        for r, row in enumerate(g):
            for c, px in enumerate(row[:cols]):
                if px == 'X':
                    d.rectangle([x + c * cell, r * cell, x + (c + 1) * cell - 1, (r + 1) * cell - 1], fill=255)
        x += cols * cell + gap
    return m

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))

def bevel_blocks(text, cell, gap, top, bottom, depth, side):
    """Every pixel of the font becomes a little beveled block, like the stone blocks of the vanilla logo."""
    m = text_mask(text, cell, gap)
    mw, mh = m.size
    W2, H2 = mw + depth + 8, mh + depth + 8
    img = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cells = []
    x0 = 0
    for ch in text:
        cols = 3 if ch == ' ' else 5
        for r, row in enumerate(FONT[ch]):
            for c, px in enumerate(row[:cols]):
                if px == 'X':
                    cells.append((x0 + c * cell, r * cell))
        x0 += cols * cell + gap
    b = max(2, cell // 6)
    # 3D extrusion first (down-right), each step a little darker
    for i in range(depth, 0, -1):
        k = 0.55 + 0.45 * (1 - i / depth)
        col = tuple(int(c * k) for c in side) + (255,)
        for (x, y) in cells:
            d.rectangle([x + i * 0.6 + 4, y + i + 4, x + i * 0.6 + cell + 3, y + i + cell + 3], fill=col)
    for (x, y) in cells:
        t = (y + cell / 2) / mh
        base = lerp(top, bottom, t)
        jit = rnd.uniform(-0.06, 0.06)
        base = tuple(int(max(0, min(255, v + (255 - v) * jit if jit > 0 else v * (1 + jit)))) for v in base)
        X, Y = x + 4, y + 4
        d.rectangle([X, Y, X + cell - 1, Y + cell - 1], fill=base + (255,))
        light = lerp(base, (255, 255, 255), 0.45) + (255,)
        dark = lerp(base, (0, 10, 40), 0.35) + (255,)
        d.rectangle([X, Y, X + cell - 1, Y + b - 1], fill=light)          # top bevel
        d.rectangle([X, Y, X + b - 1, Y + cell - 1], fill=light)          # left bevel
        d.rectangle([X, Y + cell - b, X + cell - 1, Y + cell - 1], fill=dark)  # bottom bevel
        d.rectangle([X + cell - b, Y, X + cell - 1, Y + cell - 1], fill=dark)  # right bevel
        if rnd.random() < 0.18:  # little crack, like the vanilla logo
            cx, cy = X + rnd.randint(b, cell - 2 * b), Y + rnd.randint(b, cell - 2 * b)
            d.rectangle([cx, cy, cx + b - 1, cy + b * 2 - 1], fill=dark)
    return img

def logo(text, W, H, cell, gap, depth, top, bottom, side, glow=(80, 160, 255)):
    blocks = bevel_blocks(text, cell, gap, top, bottom, depth, side)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ox = (W - blocks.width) // 2
    oy = (H - blocks.height) // 2
    canvas.alpha_composite(blocks, (ox, oy))
    a = canvas.split()[3]
    # dark outline, then a soft electric glow behind everything
    outline = a.filter(ImageFilter.MaxFilter(max(3, (cell // 5) * 2 + 1)))
    halo = a.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(cell * 0.9))
    out = Image.new('RGBA', (W, H), glow + (0,))
    out.putalpha(halo.point(lambda v: int(v * 0.55)))
    ol = Image.new('RGBA', (W, H), (6, 10, 28, 0))
    ol.putalpha(outline.point(lambda v: 245 if v else 0))
    out.alpha_composite(ol)
    out.alpha_composite(canvas)
    return out

# ---------- title logo: textures/gui/title/minecraft.png ----------
# Vanilla draws a 256x44 region of a 256x64 texture; this is the same layout at 4x resolution.
logo_img = Image.new('RGBA', (1024, 256), (0, 0, 0, 0))
main = logo('VEX CLIENT', 1024, 176, 15, 9, 16, top=(236, 244, 255), bottom=(40, 110, 255), side=(18, 40, 110))
logo_img.alpha_composite(main, (0, 0))

# ---------- edition strip: textures/gui/title/edition.png (128x14 of 128x16, at 4x) ----------
ed = Image.new('RGBA', (512, 64), (0, 0, 0, 0))
ed_text = logo('JAVA EDITION', 512, 56, 6, 4, 4, top=(255, 255, 255), bottom=(150, 195, 255), side=(20, 40, 100))
ed.alpha_composite(ed_text, (0, 0))

# ---------- widgets (exact vanilla sizes so the vanilla nine-slice settings still match) ----------
def panel(w, h, top, bottom, border, alpha=235, shine=None, shade=None, rounded=True):
    """Sleek widget: vertical gradient, 1px border with rounded (cut) corners, soft top shine and bottom shade."""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = im.load()
    for y in range(h):
        for x in range(w):
            edge = x in (0, w - 1) or y in (0, h - 1)
            corner = rounded and (x in (0, w - 1)) and (y in (0, h - 1))
            if corner:
                continue
            if edge:
                px[x, y] = border
            else:
                c = lerp(top, bottom, (y - 1) / max(1, h - 3))
                px[x, y] = c + (alpha,)
    d = ImageDraw.Draw(im)
    if shine:
        d.line([(2, 1), (w - 3, 1)], fill=shine)
    if shade:
        d.line([(2, h - 2), (w - 3, h - 2)], fill=shade)
    return im

button = panel(200, 20, (30, 52, 108), (12, 22, 54), (66, 132, 255, 255), alpha=230, shine=(140, 185, 255, 70), shade=(4, 8, 24, 160))
button_hl = panel(200, 20, (84, 160, 255), (34, 98, 235), (210, 232, 255, 255), alpha=245, shine=(235, 245, 255, 190), shade=(16, 52, 150, 220))
button_off = panel(200, 20, (34, 38, 52), (22, 24, 34), (70, 78, 100, 200), alpha=160)
slider = panel(200, 20, (12, 22, 52), (8, 14, 36), (52, 110, 230, 255), alpha=225, shade=(4, 8, 24, 160))
slider_hl = panel(200, 20, (20, 36, 82), (12, 24, 58), (130, 180, 255, 255), alpha=235, shade=(4, 8, 24, 160))
handle = panel(8, 20, (150, 195, 255), (58, 130, 255), (230, 242, 255, 255), alpha=255, shine=(255, 255, 255, 200))
handle_hl = panel(8, 20, (215, 233, 255), (120, 178, 255), (255, 255, 255, 255), alpha=255, shine=(255, 255, 255, 255))

NINE = lambda w, h, b: json.dumps({'gui': {'scaling': {'type': 'nine_slice', 'width': w, 'height': h, 'border': b}}}, indent=2)

splashes = [
    'Vex Client!', 'Join VexVanilla!', 'Now with falling leaves!', 'Blue is the new green!', 'PvP ready!',
    'Signed and verified!', 'Updates itself!', 'Made for VexVanilla!', 'Also try the Halloween theme!',
    'Leaves included!', 'gg/VexVanilla', 'Season out now!', 'Painted biomes!', 'Vex > vanilla?', '100% blocks!',
]

def png(im):
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return b.getvalue()

# pack icon
icon = Image.new('RGBA', (128, 128), (5, 11, 26, 255))
v = logo('V', 128, 128, 14, 0, 8, top=(236, 244, 255), bottom=(40, 110, 255), side=(18, 40, 110))
icon.alpha_composite(v)

mcmeta = {'pack': {
    'description': '§9§lVex Client§r §7UI: logo, buttons, splashes',
    # Old-style and new-style (1.21.9+) format ranges, so the pack loads on 1.20.5 through 1.21.x.
    'pack_format': 34,
    'supported_formats': [34, 99],
    'min_format': 34,
    'max_format': 99,
}}

files = {
    'pack.mcmeta': json.dumps(mcmeta, indent=2, ensure_ascii=False).encode(),
    'pack.png': png(icon),
    'assets/minecraft/textures/gui/title/minecraft.png': png(logo_img),
    'assets/minecraft/textures/gui/title/edition.png': png(ed),
    'assets/minecraft/textures/gui/sprites/widget/button.png': png(button),
    'assets/minecraft/textures/gui/sprites/widget/button.png.mcmeta': NINE(200, 20, 3).encode(),
    'assets/minecraft/textures/gui/sprites/widget/button_highlighted.png': png(button_hl),
    'assets/minecraft/textures/gui/sprites/widget/button_highlighted.png.mcmeta': NINE(200, 20, 3).encode(),
    'assets/minecraft/textures/gui/sprites/widget/button_disabled.png': png(button_off),
    'assets/minecraft/textures/gui/sprites/widget/button_disabled.png.mcmeta': NINE(200, 20, 1).encode(),
    'assets/minecraft/textures/gui/sprites/widget/slider.png': png(slider),
    'assets/minecraft/textures/gui/sprites/widget/slider.png.mcmeta': NINE(200, 20, 3).encode(),
    'assets/minecraft/textures/gui/sprites/widget/slider_highlighted.png': png(slider_hl),
    'assets/minecraft/textures/gui/sprites/widget/slider_highlighted.png.mcmeta': NINE(200, 20, 3).encode(),
    'assets/minecraft/textures/gui/sprites/widget/slider_handle.png': png(handle),
    'assets/minecraft/textures/gui/sprites/widget/slider_handle.png.mcmeta': NINE(8, 20, 2).encode(),
    'assets/minecraft/textures/gui/sprites/widget/slider_handle_highlighted.png': png(handle_hl),
    'assets/minecraft/textures/gui/sprites/widget/slider_handle_highlighted.png.mcmeta': NINE(8, 20, 2).encode(),
    'assets/minecraft/texts/splashes.txt': ('\n'.join(splashes) + '\n').encode(),
}
# Title background: only the Vex colours (no world). The Vex Client mod draws falling leaves over it.
def grad_face(top, bottom, size=256):
    im = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(im)
    for y in range(size):
        d.line([(0, y), (size, y)], fill=lerp(top, bottom, y / (size - 1)))
    return im
SKY_TOP, SKY_MID, SKY_LOW = (3, 8, 23), (10, 30, 90), (24, 66, 170)
for i in range(4):
    files[f'assets/minecraft/textures/gui/title/background/panorama_{i}.png'] = png(grad_face(SKY_MID, SKY_LOW))
files['assets/minecraft/textures/gui/title/background/panorama_4.png'] = png(grad_face(SKY_MID, SKY_MID))
files['assets/minecraft/textures/gui/title/background/panorama_5.png'] = png(grad_face(SKY_LOW, SKY_LOW))
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for name, data in files.items():
        zi = zipfile.ZipInfo(name, date_time=(2026, 10, 16, 0, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(zi, data)
print('wrote', OUT)
# previews for humans
logo_img.save(OUT.replace('.zip', '-logo.png'))
