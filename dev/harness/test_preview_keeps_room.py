"""The card editor's preview creates a new rooms card element for every change of the configuration; the
room and the model that were open come back on the new element (within five minutes, preview only), so
editing a label no longer closes the panel. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const hass = {states: {'light.a': {state: 'on', attributes: {friendly_name: 'Lamp'}}}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const cfg = (label) => ({card, rooms: [{id: 'a', name: 'Room A', floors: ['room_0_1'], entities: [{entity: 'light.a', name: label}]}, {id: 'b', name: 'Room B', floors: ['room_1_1'], entities: []}], title: 'Keep', height: '500px'});
  const make = async (c, preview) => { const el = document.createElement('floor3dx-rooms-card'); if (preview) el.preview = true; el.setConfig(c); el.hass = hass; const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:500px;z-index:99'; document.body.appendChild(d); d.appendChild(el); await sleep(400); return {el, d}; };
  const out = {};
  let {el, d} = await make(cfg('Lamp'), true);
  el._select('b'); await sleep(200); out.first = el._room;
  d.remove();
  ({el, d} = await make(cfg('Lamp renamed'), true)); await sleep(300);
  out.restored = el._room; out.restoredPanelLabel = (el._ui.querySelector('.panelhead h3') || {}).textContent;
  d.remove();
  // not in the preview: a fresh card starts with no room open
  ({el, d} = await make(cfg('Lamp'), false)); await sleep(300); out.dashboard = el._room; d.remove();
  // the room gone from the configuration: nothing restored
  ({el, d} = await make({card, rooms: [{id: 'a', name: 'Room A', floors: ['room_0_1'], entities: []}], title: 'Keep', height: '500px'}, true)); await sleep(300); out.gone = el._room; d.remove();
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results.update(page.evaluate(JS))
    result, errors = run(after=after, timeout_ms=400000)
    print(json.dumps(results))
    r = results
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('the new preview element reopens the room that was open', r.get('first') == 'b' and r.get('restored') == 'b' and r.get('restoredPanelLabel') == 'Room B')
    check('outside the preview a fresh card opens with no room', r.get('dashboard') is None)
    check('a room no longer in the configuration is not restored', r.get('gone') is None)
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
