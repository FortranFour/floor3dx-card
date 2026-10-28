"""The overlay's colours apart from the model's: `panel_theme` picks a theme for the panel only, `panel_stage`
and `panel_text` set its colours, and `panel_daylight` makes the panel take the stage colour the model draws
at this hour, dark text on a pale stage by day and the reverse at night. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const hass = {states: {}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const make = async (extra) => { const el = document.createElement('floor3dx-rooms-card'); el.setConfig(Object.assign({card, rooms: [{id: 'a', name: 'A', floors: ['room_0_1'], entities: []}], title: 'T', height: '400px', theme: 'neon'}, extra)); el.hass = hass; const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:700px;height:400px;z-index:99'; document.body.appendChild(d); d.appendChild(el); await sleep(800); return {el, d}; };
  const read = (el) => ({stage: el.style.getPropertyValue('--f3r-stage'), ink: el.style.getPropertyValue('--f3r-ink'), light: el.classList.contains('light'), look: el._slots[0]?.el?._config?.look?.theme});
  const out = {};
  let r = await make({}); out.plain = read(r.el); r.d.remove();
  r = await make({panel_theme: 'paper'}); out.paper = read(r.el); r.d.remove();
  r = await make({panel_stage: '#f4f1ea', panel_text: '#223344'}); out.own = read(r.el); r.d.remove();
  r = await make({panel_daylight: true});
  const el = r.el, slot = el._slots[0];
  // the model draws a pale stage (day): the panel follows and turns light
  slot.el._scene.background.set('#dfe6ee'); slot.el.dispatchEvent(new CustomEvent('floor3dx-daylight')); await sleep(100);
  out.day = read(el);
  slot.el._scene.background.set('#0a0f1c'); slot.el.dispatchEvent(new CustomEvent('floor3dx-daylight')); await sleep(100);
  out.night = read(el);
  r.d.remove();
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results.update(page.evaluate(JS))
    result, errors = run(after=after, timeout_ms=400000)
    print(json.dumps(results))
    r = results; fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    p, pa, o, d, n = r.get('plain', {}), r.get('paper', {}), r.get('own', {}), r.get('day', {}), r.get('night', {})
    check('neon: dark panel, light text, neon look on the model', p.get('light') is False and p.get('look') == 'neon')
    check('panel_theme paper: a pale panel with dark text while the model keeps the neon look', pa.get('light') is True and pa.get('stage') != p.get('stage') and pa.get('look') == 'neon')
    check('panel_stage / panel_text: own colours, text colour applied, light rules from the text colour', o.get('stage') == '244, 241, 234' and o.get('ink') == '#223344' and o.get('light') is True)
    check('panel_daylight: the panel follows the stage the model draws, pale by day', d.get('stage') == '223, 230, 238' and d.get('light') is True)
    check('panel_daylight: dark at night with light text', n.get('stage') == '10, 15, 28' and n.get('light') is False)
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
