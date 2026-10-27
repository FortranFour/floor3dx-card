"""A garage door, gate or door cover opens on a second tap (like a lock unlocks): the first tap on Open
shows 'Tap Open again to open' and calls nothing; the second within 3.5 s calls open_cover; Close is one
tap; a plain window cover opens on one tap; in guest mode a garage shows Close only. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const calls = [];
  const states = {'cover.garage': {state: 'closed', attributes: {device_class: 'garage', supported_features: 11, friendly_name: 'Overhead Door'}}, 'cover.blind': {state: 'closed', attributes: {device_class: 'blind', supported_features: 11, friendly_name: 'Blind'}}};
  const hass = {states, language: 'en', themes: {}, config: {}, user: {}, callService(d, s, data) { calls.push([d, s, data.entity_id]); return Promise.resolve(); }};
  const make = async (guest) => { const el = document.createElement('floor3dx-rooms-card'); el.setConfig({card, rooms: [{id: 'g', name: 'Garage', floors: ['room_0_1'], entities: [{entity: 'cover.garage'}, {entity: 'cover.blind'}]}], title: 'Doors', height: '560px', guest_mode: guest}); el.hass = hass; const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:560px;z-index:99'; document.body.appendChild(d); d.appendChild(el); await sleep(400); el._select('g'); await sleep(300); el._render(); return {el, d}; };
  const out = {};
  let {el, d} = await make(false);
  const btn = (id, svc) => el._ui.querySelector(`[data-action="cover"][data-entity="${id}"][data-service="${svc}"]`);
  const status = (id) => { const b = el._ui.querySelector(`[data-focus="t-${id}"]`) || el._ui.querySelector(`[data-entity="${id}"]`)?.closest('.tile'); const t = (b || el._ui).querySelector ? (b.closest ? b.closest('.tile') : b).querySelector('.tstate') : null; return t ? t.textContent : null; };
  btn('cover.garage', 'open_cover').click(); await sleep(150); el._render();
  out.afterFirst = {calls: calls.length, status: status('cover.garage')};
  btn('cover.garage', 'open_cover').click(); await sleep(150); el._render();
  out.afterSecond = {calls: calls.slice(), status: status('cover.garage')};
  btn('cover.garage', 'close_cover').click(); await sleep(150);
  out.closeCalls = calls.length;
  btn('cover.blind', 'open_cover').click(); await sleep(150);
  out.blindCalls = calls.slice(-1)[0];
  d.remove();
  ({el, d} = await make(true));
  out.guestButtons = Array.from(el._ui.querySelectorAll('[data-action="cover"][data-entity="cover.garage"]')).map(b => b.dataset.service);
  d.remove();
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
    a, b = r.get('afterFirst') or {}, r.get('afterSecond') or {}
    check('first tap on Open: no call, a prompt on the tile', a.get('calls') == 0 and 'Tap Open again' in (a.get('status') or ''))
    check('second tap opens', b.get('calls') == [['cover', 'open_cover', 'cover.garage']] and 'Tap Open again' not in (b.get('status') or ''))
    check('Close is one tap', r.get('closeCalls') == 2)
    check('a blind opens on one tap', r.get('blindCalls') == ['cover', 'open_cover', 'cover.blind'])
    check('guest mode: Close only on a garage', r.get('guestButtons') == ['close_cover'])
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
