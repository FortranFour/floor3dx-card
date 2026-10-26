"""The real sun through a day: daylight with `sun: yes` at several hours on the house (dev/private).

    HOURS=7,10,13,16,19,22 NORTH='{"x":-1,"z":0}' LOOK=day python3 dev/harness/render_sun.py <out-dir>
"""
import json, os, sys
from run import run
from render_views import HOUSE, JS

OUT = sys.argv[1] if len(sys.argv) > 1 else 'dev/out/sun'
os.makedirs(OUT, exist_ok=True)
HOURS = [float(h) for h in os.environ.get('HOURS', '7,10,13,16,19,22').split(',')]
NORTH = json.loads(os.environ.get('NORTH', '{"x":-1,"z":0}'))
LOOK = os.environ.get('LOOK', '')
EXTRA = json.loads(os.environ.get('EXTRA', '{}'))


def after(page):
    for hour in HOURS:
        daylight = dict({'sun': 'yes', 'glow': 'auto', 'time': hour, 'ambient': {'day': 0.77, 'night': 0.4}, 'sun_shadow_size': 4096}, **EXTRA)
        extra = {'lights': True, 'daylight': daylight, 'north': NORTH, 'globalLightPower': 0.77, 'merge_static': 'yes'}
        if LOOK:
            extra['look'] = {'theme': LOOK, 'edge_skip': 'seams, floors, ceilings'}
        name = f'h{hour:04.1f}'
        ok = page.evaluate(JS, [HOUSE, name, extra])
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(OUT, f'{name}.png'), clip={'x': 0, 'y': 0, 'width': 800, 'height': 560}, timeout=120000)
        page.evaluate('() => { window.shot.remove(); }')
        print(('rendered ' if ok else 'FAILED ') + name, flush=True)


result, errors = run(query=f'path=/dev/private/&model={HOUSE["file"]}&', after=after, timeout_ms=400000)
for e in errors[:5]:
    print('  error:', e[:200])
