# Renders the title-screen panorama for the Vex UI resource pack: the launcher's painted Vex biome,
# painted as a seamless 360° strip in a headless browser, then projected onto the 6 cube faces
# Minecraft uses (panorama_0..5: front, right, back, left, up, down).
# Needs Playwright + Chromium (dev only). Output goes to tools/panorama/, which make-ui-pack.py packs.
# Usage: python3 tools/make-panorama.py [theme]
import base64, io, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEME = sys.argv[1] if len(sys.argv) > 1 else 'vex'
OUT = os.path.join(ROOT, 'tools', 'panorama')
os.makedirs(OUT, exist_ok=True)
W, H = 4096, 2304          # cylindrical strip: x = yaw, y = horizon - tan(pitch) * f
F = W / (2 * math.pi)
FACE = 1024

html = f"""<!doctype html><html><body style="margin:0"><canvas id=c width={W} height={H}></canvas>
<script>window.V = {{}};</script>
<script src="file://{ROOT}/renderer/themes.js"></script>
<script src="file://{ROOT}/renderer/biome.js"></script>
<script>
  const t = VexThemes.get({json.dumps(THEME)});
  const c = document.getElementById('c');
  V.paintBiomeInto(c, t.land, {{ periodic: true, noBody: true, noVignette: true, seed: 7, unit: 1.1 }});
  window.done = c.toDataURL('image/png');
</script></body></html>"""
page_file = os.path.join(OUT, '_render.html')
open(page_file, 'w').write(html)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'), args=['--allow-file-access-from-files'])
    pg = b.new_page()
    pg.goto('file://' + page_file)
    pg.wait_for_function('window.done')
    data = pg.evaluate('window.done')
    b.close()
os.remove(page_file)
strip = Image.open(io.BytesIO(base64.b64decode(data.split(',')[1]))).convert('RGB')

# moon with glow, added after painting so it isn't affected by the periodic terrain
theme = json.load(open(os.path.join(OUT, '..', '..', 'package.json'))) if False else None
land_body = {'vex': ('#e4ecff', '#5b8cff'), 'halloween': ('#ffb347', '#ff8a2a'), 'christmas': ('#f6f2e0', '#a6f0d2'), 'newyear': ('#f4e2a8', '#e6b84a')}.get(THEME, ('#e4ecff', '#5b8cff'))
hexrgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
mx, my = int(W * 0.08) + W // 2, int(H / 2 - math.tan(math.radians(36)) * F)
glow = Image.new('L', (W, H), 0)
ImageDraw.Draw(glow).ellipse([mx - 260, my - 260, mx + 260, my + 260], fill=150)
glow = glow.filter(ImageFilter.GaussianBlur(120))
strip = Image.composite(Image.new('RGB', (W, H), hexrgb(land_body[1])), strip, glow.point(lambda v: int(v * 0.55)))
d = ImageDraw.Draw(strip)
s = 120
d.rectangle([mx - s // 2, my - s // 2, mx + s // 2, my + s // 2], fill=hexrgb(land_body[0]))
q = s // 8
shade = tuple(int(v * 0.86) for v in hexrgb(land_body[0]))
d.rectangle([mx - s // 2 + q, my - s // 2 + 2 * q, mx - s // 2 + 3 * q, my - s // 2 + 4 * q], fill=shade)
d.rectangle([mx + q, my + q, mx + 3 * q, my + 2 * q], fill=shade)
strip.save(os.path.join(OUT, 'strip.png'))

src = np.asarray(strip).astype(np.float32)

def sample(yaw, pitch):
    x = (yaw / (2 * math.pi) % 1.0) * W
    y = H / 2 - np.tan(np.clip(pitch, -1.45, 1.45)) * F
    x = np.clip(x, 0, W - 1.001); y = np.clip(y, 0, H - 1.001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    x1 = (x0 + 1) % W; y1 = np.minimum(y0 + 1, H - 1)
    return (src[y0, x0] * (1 - fx) * (1 - fy) + src[y0, x1] * fx * (1 - fy) + src[y1, x0] * (1 - fx) * fy + src[y1, x1] * fx * fy)

g = (np.arange(FACE) + 0.5) / FACE * 2 - 1
U, Vv = np.meshgrid(g, g)        # U: left->right, Vv: top->bottom
faces = []
for i in range(4):               # sides: yaw 0, 90, 180, 270 degrees (turning right)
    yaw = i * math.pi / 2 + np.arctan(U)
    pitch = np.arctan(-Vv / np.sqrt(1 + U ** 2))
    faces.append(sample(yaw, pitch))
# up: bottom edge meets the top edge of face 0
t = Vv
faces.append(sample(np.arctan2(U, t), np.arctan(1 / np.sqrt(U ** 2 + t ** 2))))
# down: top edge meets the bottom edge of face 0
t = -Vv
faces.append(sample(np.arctan2(U, t), -np.arctan(1 / np.sqrt(U ** 2 + t ** 2))))
# Straight up/down the strip is stretched into rings; fade the centre of those faces to plain sky/ground.
r = np.sqrt(U ** 2 + Vv ** 2)[..., None]
w = np.clip((1.15 - r) / 0.6, 0, 1)
sky_col = src[:40].reshape(-1, 3).mean(0)
ground_col = src[-40:].reshape(-1, 3).mean(0)
faces[4] = faces[4] * (1 - w) + sky_col * w
faces[5] = faces[5] * (1 - w) + ground_col * w
rng = np.random.default_rng(3)
for _ in range(260):  # a few stars overhead
    y, x = rng.integers(0, FACE, 2)
    a = rng.uniform(0.3, 0.9)
    faces[4][y:y + 3, x:x + 3] = faces[4][y:y + 3, x:x + 3] * (1 - a) + 255 * a
for i, f in enumerate(faces):
    Image.fromarray(np.clip(f, 0, 255).astype(np.uint8)).save(os.path.join(OUT, f'panorama_{i}.png'), optimize=True)
print('panorama faces written to', OUT)
