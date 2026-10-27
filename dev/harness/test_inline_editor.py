"""Edit 3D settings: the rooms editor opens the regular card's editor inline on one model's block. The
embedded card of that model becomes the regular editor's preview (answers the object list, takes picks);
a change in the inline editor lands in models[i].card without its `type` and reaches Home Assistant as
the rooms card's configuration; closing it releases the preview. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const hass = {states: {'light.a': {state: 'on', attributes: {friendly_name: 'Lamp'}}}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }, callWS: () => Promise.resolve([])};
  const cfg = {models: [{id: 'house', name: 'House', card}, {id: 'annex', name: 'Annex', card: Object.assign({}, card)}], rooms: [], title: 'Inline', height: '500px'};
  // the preview card
  const el = document.createElement('floor3dx-rooms-card'); el.preview = true; el.setConfig(cfg); el.hass = hass;
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:500px;z-index:99'; document.body.appendChild(d); d.appendChild(el);
  const t = performance.now(); while (!(el._slots.length === 2 && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 240000) await sleep(200);
  // the editor
  const ed = document.createElement('floor3dx-rooms-card-editor'); ed.hass = hass; ed.setConfig(JSON.parse(JSON.stringify(cfg)));
  const edHost = document.createElement('div'); edHost.style.cssText = 'position:fixed;left:0;top:520px;width:600px;height:400px;overflow:auto;z-index:99'; document.body.appendChild(edHost); edHost.appendChild(ed);
  const emitted = []; ed.addEventListener('config-changed', (e) => emitted.push(e.detail.config));
  await sleep(300);
  const out = {};
  const root = ed.shadowRoot;
  root.querySelector('details[data-section="model"]').open = true;
  const buttons = root.querySelectorAll('[data-act="model-edit"]');
  out.buttons = buttons.length;
  buttons[1].click(); await sleep(1500);
  const inline = root.querySelector('[data-inline="1"] floor3dx-card-editor');
  out.inlineOpen = !!inline; out.dbg = {hostHtml: (root.querySelector('[data-inline="1"]') || {}).innerHTML, card: !!customElements.get('floor3dx-card'), editing: ed._editing, placeholder: !!root.querySelector('[data-inline="1"]'), defined: !!customElements.get('floor3dx-card-editor'), inlineAny: !!root.querySelector('floor3dx-card-editor')};
  if (!inline) { d.remove(); edHost.remove(); return out; }
  out.inlineConfig = inline ? {type: inline._config?.type, objfile: inline._config?.objfile} : null;
  out.previewFlags = el._slots.map(s => !!s.el.preview);
  // the embedded annex answers the regular editor's object request
  const got = []; const onP = (e) => got.push(e.detail); window.addEventListener('floor3dx-card-preview', onP);
  window.dispatchEvent(new CustomEvent('floor3dx-card-editor', {detail: {request: 'objects'}})); await sleep(200);
  window.removeEventListener('floor3dx-card-preview', onP);
  out.objectAnswers = got.filter(x => x.objects).length; out.objectsCount = (got.find(x => x.objects) || {objects: []}).objects.length;
  // a change from the inline editor: lands in models[1].card, type stripped, emitted as the rooms card's config
  const changed = Object.assign({}, inline._config, {globalLightPower: 0.42});
  inline.dispatchEvent(new CustomEvent('config-changed', {detail: {config: changed}, bubbles: true, composed: true}));
  await sleep(300);
  const last = emitted[emitted.length - 1];
  out.emitted = emitted.length; out.written = last ? {glp: last.models[1].card.globalLightPower, hasType: 'type' in last.models[1].card, houseUntouched: last.models[0].card.globalLightPower === card.globalLightPower, title: last.title} : null;
  // the inline editor survives the re-render and is the same element
  out.sameElement = root.querySelector('[data-inline="1"] floor3dx-card-editor') === inline;
  // done: the inline editor goes, the preview is released
  root.querySelectorAll('[data-act="model-edit"]')[1].click(); await sleep(300);
  out.closed = !root.querySelector('floor3dx-card-editor'); out.previewAfter = el._slots.map(s => !!s.el.preview);
  d.remove(); edHost.remove();
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results.update(page.evaluate(JS))
    result, errors = run(after=after, timeout_ms=500000)
    print(json.dumps(results))
    r = results
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('a button per model; the inline regular editor opens on the chosen model with its block and type', r.get('buttons') == 2 and r.get('inlineOpen') is True and (r.get('inlineConfig') or {}).get('type') == 'custom:floor3dx-card' and (r.get('inlineConfig') or {}).get('objfile'))
    check("that model's embedded card is the regular editor's preview, the other is not", r.get('previewFlags') == [False, True])
    check('it answers the object request, once', r.get('objectAnswers') == 1 and r.get('objectsCount', 0) > 10)
    check("a change lands in models[1].card without type, the other model untouched, emitted as the rooms card's config", (r.get('written') or {}).get('glp') == 0.42 and (r.get('written') or {}).get('hasType') is False and (r.get('written') or {}).get('houseUntouched') is True and (r.get('written') or {}).get('title') == 'Inline')
    check('the inline editor survives the re-render', r.get('sameElement') is True)
    check('Done closes it and releases the preview', r.get('closed') is True and r.get('previewAfter') == [False, False])
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
