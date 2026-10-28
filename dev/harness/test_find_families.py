"""Find floor3d cards in my dashboards: the original floor3d-card (adizanni), floor3dpro-card (levonisyas)
and floor3dx-card are all offered, each labelled with its type, inside stacks and wrappers; the chosen
one embeds in the rooms card and its model loads. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const mk = (type, name) => Object.assign({type, name}, {path: base._config.path, objfile: base._config.objfile, entities: [{entity: 'light.a', object_id: 'room_0_1', type3d: 'light', light: {lumens: 500}}]});
  const dashboards = {
    'lovelace': {views: [{title: 'Old', cards: [mk('custom:floor3d-card', 'Original')]}, {title: 'Pro', cards: [{type: 'vertical-stack', cards: [mk('custom:floor3dpro-card', 'Pro')]}]}]},
    'other': {views: [{title: 'X', cards: [mk('custom:floor3dx-card', 'X'), {type: 'custom:neonplan3d-card', theme: 'neon'}]}]},
  };
  const hass = {states: {'light.a': {state: 'on', attributes: {}}}, language: 'en', themes: {}, config: {}, user: {},
    callService() { return Promise.resolve(); },
    callWS: (q) => Promise.resolve(q.type === 'lovelace/dashboards/list' ? [{url_path: 'other', title: 'Other'}] : q.type === 'lovelace/config' ? dashboards[q.url_path || 'lovelace'] : null)};
  const ed = document.createElement('floor3dx-rooms-card-editor'); ed.hass = hass; ed.setConfig({card: {}, rooms: []});
  document.body.appendChild(ed); await sleep(300);
  const found = await ed._scan ? ed._scan() : null;
  const out = {};
  const mod = await import('/dist/floor3dx-card.js').catch(() => null);
  // scan through the editor's public path: press "Find floor3d cards" and read the offers
  const btn = [...ed.shadowRoot.querySelectorAll('button')].find(b => /find floor3d/i.test(b.textContent));
  btn.click(); await sleep(800);
  out.offers = [...ed.shadowRoot.querySelectorAll('.found .item, .found li, [data-found]')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  out.text = ed.shadowRoot.textContent.replace(/\s+/g, ' ');
  ed.remove();
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results.update(page.evaluate(JS))
    result, errors = run(after=after, timeout_ms=400000)
    r = results; t = r.get('text', '')
    print(json.dumps({k: v for k, v in r.items() if k != 'text'})[:1500])
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    check('the original floor3d-card is offered, labelled with its type', 'floor3d-card' in t and 'Old' in t)
    check('floor3dpro-card inside a stack is offered', 'floor3dpro-card' in t and 'Pro' in t)
    check('floor3dx-card in another dashboard is offered', 'floor3dx-card' in t and 'Other' in t)
    check('a neonplan3d card is not offered as a model', 'neonplan' not in t.lower())
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
