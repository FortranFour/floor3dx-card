"""2.16: the long-press menus close on a tap elsewhere (the model, the chrome) and when a room opens, and one
menu opening closes another; the compact model switcher (a corner button: tap for the next model, hold to
choose) replaces the segmented control on a phone-width card or with models_menu: compact. Demo house, two
models."""
import json, sys
from run import run

JS = r"""async (width) => {
  const q = (el, sel) => el.shadowRoot.querySelector(sel);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const c = window.card;
  const card = Object.assign({}, c._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const hass = {states: {'light.a': {state: 'off', attributes: {}}}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const mk = async (extra) => { const el = document.createElement('floor3dx-rooms-card'); el.setConfig(Object.assign({models: [{name: 'House', card}, {name: 'Garage', card}], rooms: [{id: 'a', name: 'Room A', model: 'house', floors: ['room_0_1'], entities: [{entity: 'light.a'}]}], title: 'T', height: '560px'}, extra || {})); el.hass = hass; const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:560px;z-index:99`; document.body.appendChild(d); d.appendChild(el); await new Promise(r => { const t = setInterval(() => { if (el._slots.every(s => s.el?._modelready)) { clearInterval(t); r(); } }, 100); }); await sleep(400); el._layout(); el._request(); await sleep(200); return {el, d}; };
  const tap = (b) => { b.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, composed: true})); b.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, composed: true})); b.click(); };
  const hold = async (sel) => { const btn = typeof sel === 'string' ? q(el, sel) : sel; btn.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, composed: true})); await sleep(600); btn.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, composed: true})); btn.click(); await sleep(150); };
  const out = {width};
  let {el, d} = await mk();
  out.compact = !!q(el, 'button.modelbtn'); out.segments = !!q(el, '.menu .seg');
  // the button is actually hit by a finger (its container passes pointer events through; 2.17.1)
  if (out.compact) { const r = q(el, 'button.modelbtn').getBoundingClientRect(); const hit = el.shadowRoot.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); out.hit = !!(hit && hit.closest('button.modelbtn')); const ic = q(el, 'button.modelbtn ha-icon'); out.iconStyle = getComputedStyle(ic).display; }
  // camera menu: open by a hold, closed by a tap on the chrome elsewhere
  const cam = '.menu button[data-action="reset"], .menu button[data-action="views"]';
  await hold(cam); out.camOpen = !!q(el, 'button[data-action="cam-two"]');
  const title = q(el, '.title') || el.shadowRoot.querySelector('.ui');
  title.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, composed: true})); title.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, composed: true})); await sleep(250); out.camClosedByTap = !q(el, 'button[data-action="cam-two"]');
  // open again, closed by a tap on the model
  await hold(cam); const open2 = !!q(el, 'button[data-action="cam-two"]');
  el._slots[0].host.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, composed: true, clientX: 10, clientY: 300})); await sleep(250); out.camClosedByModel = open2 && !q(el, 'button[data-action="cam-two"]');
  // open again, closed when a room opens
  await hold(cam); el._select('a'); await sleep(150); out.camClosedByRoom = !q(el, 'button[data-action="cam-two"]') && el._room === 'a';
  el._select(null); await sleep(100);
  // the Rooms list opening closes the camera menu
  await hold(cam); tap(q(el, '.menu button[data-action="list"]')); await sleep(150); out.camClosedByList = !q(el, 'button[data-action="cam-two"]') && !!q(el, '.list button[data-action="room"]');
  tap(q(el, '.menu button[data-action="list"]')); await sleep(100);
  if (out.compact) {
    // tap cycles House -> Garage -> Both -> House; hold lists
    const label = () => q(el, 'button.modelbtn').textContent.trim();
    out.cycle = [label()]; for (let i = 0; i < 3; i++) { tap(q(el, 'button.modelbtn')); await sleep(200); out.cycle.push(label()); }
    await hold('button.modelbtn'); out.modelMenu = [...el.shadowRoot.querySelectorAll('.list.modelmenu button[data-action="model"] span:last-child')].map(s => s.textContent);
    el.shadowRoot.querySelector('.list.modelmenu button[data-model]:nth-of-type(2)') && el.shadowRoot.querySelectorAll('.list.modelmenu button[data-action="model"]')[1].click(); await sleep(200);
    out.chosen = label(); out.menuGone = !q(el, '.list.modelmenu');
  }
  d.remove();
  // forced modes
  ({el, d} = await mk({models_menu: 'segments'})); out.forcedSegments = !!q(el, '.menu .seg') && !q(el, 'button.modelbtn'); d.remove();
  ({el, d} = await mk({models_menu: 'compact'})); out.forcedCompact = !!q(el, 'button.modelbtn') && !q(el, '.menu .seg'); d.remove();
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results['phone'] = page.evaluate(JS, 390)
        results['desk'] = page.evaluate(JS, 1100)
    result, errors = run(after=after, timeout_ms=600000)
    print(json.dumps(results))
    p, w = results.get('phone', {}), results.get('desk', {}); fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('phone width: the compact model button, no segmented control', p.get('compact') is True and p.get('segments') is False)
    check('the compact button is hit at its centre (pointer events reach it); the chevron is a flex box', p.get('hit') is True and p.get('iconStyle') == 'flex')
    check('desktop width: the segmented control, no compact button', w.get('segments') is True and w.get('compact') is False)
    check('a long-press menu closes on a tap elsewhere on the chrome', p.get('camOpen') and p.get('camClosedByTap') and w.get('camClosedByTap'))
    check('… and on a tap on the model', p.get('camClosedByModel') and w.get('camClosedByModel'))
    check('… and when a room opens', p.get('camClosedByRoom') and w.get('camClosedByRoom'))
    check('… and when another menu (Rooms) opens', p.get('camClosedByList') and w.get('camClosedByList'))
    check('compact: a tap cycles House → Garage → Both → House', p.get('cycle') == ['House', 'Garage', 'Both', 'House'])
    check('compact: a hold lists the models and Both; choosing applies and closes', p.get('modelMenu') == ['House', 'Garage', 'Both'] and p.get('chosen') == 'Garage' and p.get('menuGone') is True)
    check('models_menu: segments / compact force either form', p.get('forcedSegments') is True and p.get('forcedCompact') is True)
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
