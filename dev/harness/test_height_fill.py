"""`height: fill` (2.19.5): in any view the Rooms Card measures its own top edge and fills the window from
there to the bottom, as it does in a panel view; the dashboard's edit mode gets its 110px under the card
and a vertical drag scrolls the page; the editor's preview keeps its own height; a blank height outside
a panel view is still 60vh; a custom height is still taken as given. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const hass = base.hass || base._hass || {states: {}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const out = {innerHeight: window.innerHeight};
  const ready = (el) => new Promise(r => { const t = setInterval(() => { if (el._slots.length && el._slots.every(s => s.el?._modelready)) { clearInterval(t); r(); } }, 100); });
  // a sections-like page: a header and a badge strip above the card, nothing fixed-position
  const page = document.createElement('div'); page.style.cssText = 'position:absolute;left:0;top:0;width:100%;z-index:99;background:#eee;margin:0';
  const strip = document.createElement('div'); strip.style.cssText = 'height:130px;background:#ccc'; page.appendChild(strip);
  const slot = document.createElement('div'); page.appendChild(slot); document.body.appendChild(page);
  const make = async (cfg, wrap) => {
    slot.replaceChildren();
    const el = document.createElement('floor3dx-rooms-card'); el.setConfig(Object.assign({models: [{name: 'A', card}], rooms: [], title: 'H'}, cfg)); el.hass = hass;
    if (wrap) { const w = document.createElement(wrap); slot.appendChild(w); w.appendChild(el); } else slot.appendChild(el);
    await ready(el); await sleep(300); el._layout(); await sleep(50);
    const r = el.getBoundingClientRect(); const cv = el._slots[0].el._renderer.domElement;
    return {el, top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), var: el.style.getPropertyValue('--f3r-height'), touch: cv.style.touchAction};
  };
  const fill = await make({height: 'fill'}); out.fill = {top: fill.top, bottom: fill.bottom, var: fill.var, touch: fill.touch};
  // the strip grows (badges wrap): a window resize re-measures
  strip.style.height = '190px'; window.dispatchEvent(new Event('resize')); await sleep(100);
  { const r = fill.el.getBoundingClientRect(); out.regrow = {top: Math.round(r.top), bottom: Math.round(r.bottom)}; }
  strip.style.height = '130px';
  // the dashboard's edit mode: HA wraps the card in hui-card-options
  const edit = await make({height: 'fill'}, 'hui-card-options'); out.edit = {top: edit.top, bottom: edit.bottom, touch: edit.touch, innerHeight: window.innerHeight};
  const blank = await make({}); out.blank = {height: blank.height, var: blank.var, sixty: Math.round(window.innerHeight * 0.6)};
  const custom = await make({height: '333px'}); out.custom = {height: custom.height, var: custom.var};
  // the card editor's preview: hui-card[preview] above the card
  slot.replaceChildren(); const hc = document.createElement('hui-card'); hc.setAttribute('preview', ''); slot.appendChild(hc);
  const pv = document.createElement('floor3dx-rooms-card'); pv.setConfig({models: [{name: 'A', card}], rooms: [], title: 'H', height: 'fill'}); pv.hass = hass; hc.appendChild(pv); await ready(pv); await sleep(300); pv._layout();
  out.preview = {var: pv.style.getPropertyValue('--f3r-height'), height: Math.round(pv.getBoundingClientRect().height)};
  page.remove();
  return out;
}"""


def main():
    r, errors = run(after=lambda page: page.evaluate(JS))
    print(json.dumps(r))
    ok = True
    def check(label, cond):
        nonlocal ok
        print(('PASS ' if cond else 'FAIL ') + label); ok = ok and bool(cond)
    H = r['innerHeight']
    f = r['fill']
    check('fill: the card starts under the badge strip and ends at the bottom of the window', f['top'] == 130 and abs(f['bottom'] - H) <= 2 and 'px' in f['var'])
    check('fill: outside edit mode the model keeps every drag', f['touch'] == 'none')
    g = r['regrow']
    check('fill: when the strip above grows, a resize re-measures and the bottom stays at the window edge', g['top'] == 190 and abs(g['bottom'] - H) <= 2)
    e = r['edit']
    check('fill in the dashboard edit mode: 110px are left under the card for the Edit bar and a vertical drag scrolls the page', abs((H - 110) - e['bottom']) <= 2 and e['touch'] == 'pan-y')
    b = r['blank']
    check('a blank height outside a panel view is still 60vh', b['var'] == '60vh' and abs(b['height'] - b['sixty']) <= 2)
    c = r['custom']
    check('a custom height is still taken as given', c['var'] == '333px' and c['height'] == 333)
    p = r['preview']
    check("fill in the card editor's preview keeps the preview's own height", p['var'] in ('60vh', 'calc(100vh - 235px)'))
    check('no page errors', not errors)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
