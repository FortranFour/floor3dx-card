"""The compass's weather: the badge shows the weather entity's condition (rain, cloud, snow, fog; the
moon at night unless it rains), a long press opens a menu, "Follow the weather" turns the condition's
effect off and on (remembered), "Fix the time" overrides the hour; weather_effects take the direct sun
before the diffuse light. Runs on the demo house."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: [], north: {x: -1, z: 0}}); delete card.style; delete card.type; delete card.look;
  card.daylight = {sun: 'yes', time: 13, weather_entity: 'weather.home', ambient: {day: 0.6, night: 0.2}};
  try { localStorage.removeItem('floor3dx-rooms:weather:Weather test:' + card.objfile); localStorage.removeItem('floor3dx-rooms:daylight:Weather test:' + card.objfile); } catch (_) {}
  const hassAt = (cond) => ({states: {'weather.home': {state: cond, attributes: {}}}, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }});
  const make = async (cond) => {
    const el = document.createElement('floor3dx-rooms-card');
    el.setConfig({card, rooms: [], title: 'Weather test', height: '560px'}); el.hass = hassAt(cond);
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:560px;z-index:99'; document.body.appendChild(d); d.appendChild(el);
    const t = performance.now(); while (!(el._slots.length && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 240000) await sleep(200);
    await sleep(700); el._render(); return {el, d};
  };
  const out = {};
  let {el, d} = await make('sunny');
  const emb = el._embedded;
  const sunI = () => { let s = 0; emb._scene.traverse(o => { if (o.isDirectionalLight && o.castShadow) s = o.intensity; }); return s; };
  const badgeClass = () => { const b = el._ui.querySelector('.dl .badge'); return b ? b.className.replace('badge', '').trim() || 'day' : 'none'; };
  const at = async (cond) => { el.hass = hassAt(cond); await sleep(150); el._render(); return {badge: badgeClass(), sun: sunI(), ambient: emb._ambient_light.intensity}; };
  out.sunny = await at('sunny'); out.cloudy = await at('cloudy'); out.rainy = await at('rainy'); out.snowy = await at('snowy'); out.fog = await at('fog'); out.partly = await at('partlycloudy');
  // long press opens the menu
  const btn = el._ui.querySelector('.dl');
  btn.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, composed: true})); await sleep(600); btn.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, composed: true})); btn.click(); await sleep(100); el._render();
  out.menuOpen = !!el._ui.querySelector('[data-action="dl-weather"]'); out.stillOn = btn.getAttribute('aria-pressed');
  // follow the weather off: rain no longer dims
  el._ui.querySelector('[data-action="dl-weather"]').click(); await sleep(200); el._render();
  out.rainyIgnored = await at('rainy');
  out.stored = (() => { try { return localStorage.getItem('floor3dx-rooms:weather:Weather test:' + card.objfile); } catch (_) { return null; } })();
  // fix the time at midnight: the sun goes out, the badge is the moon
  el._ui.querySelector('[data-action="dl-time"][data-i="0"]').click(); await sleep(200); el._render();
  out.midnight = await at('sunny'); out.midnightPressed = el._ui.querySelector('[data-action="dl-time"][data-i="0"]').getAttribute('aria-pressed');
  el._ui.querySelector('[data-action="dl-time"][data-i="0"]').click(); await sleep(200); el._render(); out.unfixed = await at('sunny');
  d.remove();
  ({el, d} = await make('rainy'));
  out.rememberedOff = el._embedded.daylightState().weatherOn; out.rememberedBadge = badgeClass();
  d.remove();
  return out;
}"""

if __name__ == '__main__':
    results = {}
    def after(page):
        results.update(page.evaluate(JS))
    result, errors = run(after=after, timeout_ms=600000)
    print(json.dumps(results))
    r = results
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    g = lambda k, f: (r.get(k) or {}).get(f)
    check('the badge follows the condition: sun, cloud, rain, snow, fog, partly cloudy', [g(k, 'badge') for k in ('sunny', 'cloudy', 'rainy', 'snowy', 'fog', 'partly')] == ['day', 'cloud', 'rain', 'snow', 'fog', 'cloud'])
    check('clouds take the direct sun before the diffuse light', g('cloudy', 'sun') < g('sunny', 'sun') * 0.5 and g('cloudy', 'ambient') > g('sunny', 'ambient') * 0.7 and g('rainy', 'sun') < g('cloudy', 'sun'))
    check('snow keeps the day bright', g('snowy', 'ambient') > g('rainy', 'ambient'))
    check('a long press opens the menu without switching the lighting off', r.get('menuOpen') is True and r.get('stillOn') == 'true')
    check('follow the weather off: rain no longer dims, remembered', g('rainyIgnored', 'sun') == g('sunny', 'sun') and g('rainyIgnored', 'badge') == 'day' and r.get('stored') == 'off' and r.get('rememberedOff') is False and r.get('rememberedBadge') == 'day')
    check('fix the time at midnight: the sun out, the moon on the badge; unfixed, the day again', g('midnight', 'sun') == 0 and g('midnight', 'badge') == 'night' and r.get('midnightPressed') == 'true' and g('unfixed', 'sun') > 0)
    check('no page errors', not errors)
    for e in errors[:5]:
        print('  error:', e[:300])
    sys.exit(1 if fails else 0)
