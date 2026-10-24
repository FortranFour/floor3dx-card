"""Render a model under several `look: theme: custom` palettes, for choosing colours.

    python3 dev/harness/render_themes.py <palettes.json> <out-dir> [house|garage]

palettes.json: {"name": {"dark": "#..", "light": "#..", "walls": "#..", "floors": "#..", "edges": "#..",
"stage": "#..", "hue": 0.15}, ...}. Each palette is rendered with the lamps on (the house's reference
lamps) and edge_skip 'seams, floors', one PNG per palette, plus a contact sheet with the names."""
import json, os, sys
from run import run
from render_views import HOUSE, GARAGE, JS

palettes = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
WHICH = sys.argv[3] if len(sys.argv) > 3 else 'house'
os.makedirs(OUT, exist_ok=True)
model = {'house': HOUSE, 'garage': GARAGE}[WHICH]


def after(page):
    for name, colours in palettes.items():
        extra = {'look': {'theme': 'custom', 'custom': colours, 'edge_skip': 'seams, floors'}}
        if WHICH == 'house':
            extra['lights'] = True
        ok = page.evaluate(JS, [model, name, extra])
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(OUT, f'{name}.png'), clip={'x': 0, 'y': 0, 'width': 800, 'height': 560}, timeout=120000)
        page.evaluate('() => { window.shot.remove(); }')
        print(('rendered ' if ok else 'FAILED ') + name, flush=True)


result, errors = run(query=f'path=/dev/private/&model={model["file"]}&', after=after, timeout_ms=300000)
for e in errors[:5]:
    print('  error:', e[:200])

try:
    from PIL import Image, ImageDraw, ImageFont
    names = list(palettes)
    cols = 3
    rows = (len(names) + cols - 1) // cols
    w, h = 800, 560
    sheet = Image.new('RGB', (cols * w, rows * (h + 36)), (20, 20, 20))
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26)
    except Exception:
        font = ImageFont.load_default()
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        x, y = (i % cols) * w, (i // cols) * (h + 36)
        sheet.paste(Image.open(os.path.join(OUT, f'{name}.png')).convert('RGB'), (x, y + 36))
        d.text((x + 12, y + 5), name, fill=(240, 240, 240), font=font)
    sheet.save(os.path.join(OUT, 'sheet.jpg'), quality=88)
    print('sheet', os.path.join(OUT, 'sheet.jpg'))
except ImportError:
    pass
