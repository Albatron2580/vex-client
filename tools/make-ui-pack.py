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

def stone_face(size, top, bottom, block):
    """Vertical gradient with blocky per-pixel noise, like the stone texture of the vanilla logo."""
    w, h = size
    img = Image.new('RGBA', size)
    px = img.load()
    for by in range(0, h, block):
        for bx in range(0, w, block):
            t = min(1, max(0, (by + block / 2) / h))
            base = [top[i] + (bottom[i] - top[i]) * t for i in range(3)]
            k = rnd.uniform(-0.09, 0.09)
            col = tuple(int(max(0, min(255, v + (255 - v) * k if k > 0 else v * (1 + k)))) for v in base) + (255,)
            for y in range(by, min(h, by + block)):
                for x in range(bx, min(w, bx + block)):
                    px[x, y] = col
    return img

def logo(text, W, H, cell, gap, depth, top, bottom, side, sub=None):
    m = text_mask(text, cell, gap)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ox = (W - m.width) // 2
    oy = (H - m.height - depth) // 2
    # extrusion: the letter repeated down-right, darker (the 3D side of the vanilla logo)
    for i in range(depth, 0, -1):
        shade = side if i > 1 else tuple(int(v * 0.8) for v in side)
        layer = Image.new('RGBA', m.size, shade + (255,))
        canvas.paste(layer, (ox + i // 2, oy + i), m)
    face = stone_face(m.size, top, bottom, max(2, cell // 4))
    canvas.paste(face, (ox, oy), m)
    # highlight on the top edge of every block row
    hl = Image.new('RGBA', m.size, (255, 255, 255, 0))
    hd = ImageDraw.Draw(hl)
    mp = m.load()
    for y in range(m.height):
        for x in range(m.width):
            if mp[x, y] and (y == 0 or not mp[x, y - 1]) :
                for k in range(max(1, cell // 6)):
                    if y + k < m.height:
                        hd.point((x, y + k), (255, 255, 255, 110))
    canvas.alpha_composite(hl, (ox, oy))
    # dark outline like the vanilla logo
    a = canvas.split()[3]
    outline = a.filter(ImageFilter.MaxFilter(max(3, (cell // 4) * 2 + 1)))
    out = Image.new('RGBA', (W, H), (8, 10, 22, 0))
    out.putalpha(outline.point(lambda v: 235 if v else 0))
    out.alpha_composite(canvas)
    return out

# ---------- title logo: textures/gui/title/minecraft.png ----------
# Vanilla draws a 256x44 region of a 256x64 texture; this is the same layout at 4x resolution.
logo_img = Image.new('RGBA', (1024, 256), (0, 0, 0, 0))
main = logo('VEX CLIENT', 1024, 176, 16, 11, 16, top=(214, 230, 255), bottom=(63, 120, 240), side=(16, 34, 92))
logo_img.alpha_composite(main, (0, 0))

# ---------- edition strip: textures/gui/title/edition.png (128x14 of 128x16, at 4x) ----------
ed = Image.new('RGBA', (512, 64), (0, 0, 0, 0))
ed_text = logo('MINECRAFT JAVA', 512, 56, 6, 5, 4, top=(255, 255, 255), bottom=(170, 200, 255), side=(20, 40, 100))
ed.alpha_composite(ed_text, (0, 0))

# ---------- widgets (exact vanilla sizes so the vanilla nine-slice settings still match) ----------
def panel(w, h, fill, border, glow=None, top_hl=None):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], fill=border)
    d.rectangle([1, 1, w - 2, h - 2], fill=fill)
    if top_hl:
        d.line([(2, 1), (w - 3, 1)], fill=top_hl)
    if glow:
        d.line([(2, h - 2), (w - 3, h - 2)], fill=glow)
    return im

button = panel(200, 20, (12, 22, 52, 225), (47, 125, 255, 255), glow=(30, 70, 170, 255), top_hl=(80, 140, 255, 120))
button_hl = panel(200, 20, (34, 86, 210, 240), (190, 220, 255, 255), glow=(20, 60, 160, 255), top_hl=(170, 205, 255, 200))
button_off = panel(200, 20, (20, 24, 36, 170), (60, 70, 95, 200))
slider = panel(200, 20, (8, 14, 36, 220), (40, 90, 200, 255))
slider_hl = panel(200, 20, (14, 26, 64, 230), (120, 170, 255, 255))
handle = panel(8, 20, (47, 125, 255, 255), (200, 225, 255, 255), top_hl=(170, 205, 255, 255))
handle_hl = panel(8, 20, (120, 170, 255, 255), (255, 255, 255, 255), top_hl=(230, 240, 255, 255))

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
v = logo('V', 128, 128, 14, 0, 8, top=(214, 230, 255), bottom=(47, 125, 255), side=(16, 34, 92))
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
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for name, data in files.items():
        zi = zipfile.ZipInfo(name, date_time=(2026, 10, 16, 0, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(zi, data)
print('wrote', OUT)
# previews for humans
logo_img.save(OUT.replace('.zip', '-logo.png'))
