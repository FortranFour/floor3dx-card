// The room panel's controls: one tile per entity, the same simple set as floor3d-snapshot-card
// (toggle with a switch, brightness, fan speed, volume, cover buttons, thermostat steps, lock,
// run), with its guest-mode limits. Adapted from floor3d-snapshot-card (same author, MIT).
import { RoomEntity } from './rooms';

const BAD = new Set(['unknown', 'unavailable', 'none', '']);
export const available = (s: any) => !!s && !BAD.has(s.state);
export const isOn = (s: any) => available(s) && !['off', 'standby', 'idle', 'closed', 'locked', 'paused'].includes(s.state);
export const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
export const domainOf = (id: string) => String(id || '').split('.')[0];
const num = (v: any) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
export const titleCase = (v: any) => String(v ?? '').replace(/(^|[\s/-])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
export const icon = (name: string) => `<ha-icon icon="${esc(name)}" aria-hidden="true"></ha-icon>`;
export const ACTIVE_DOMAINS = new Set(['light', 'switch', 'fan', 'input_boolean', 'media_player']);
const DEFAULT_ICONS: Record<string, string> = { light: 'mdi:lightbulb-outline', switch: 'mdi:toggle-switch-outline', fan: 'mdi:fan', cover: 'mdi:window-shutter', climate: 'mdi:thermostat', media_player: 'mdi:television', lock: 'mdi:lock-outline', scene: 'mdi:palette-outline', script: 'mdi:script-text-outline', sensor: 'mdi:eye-outline', binary_sensor: 'mdi:checkbox-blank-circle-outline', input_boolean: 'mdi:toggle-switch-outline', button: 'mdi:gesture-tap-button', input_button: 'mdi:gesture-tap-button', alarm_control_panel: 'mdi:shield-home-outline', vacuum: 'mdi:robot-vacuum' };
const SENSITIVE_COVERS = new Set(['garage', 'gate', 'door']);
const READ_ONLY_DOMAINS = ['sensor', 'binary_sensor', 'weather', 'alarm_control_panel', 'person', 'device_tracker'];

export interface TileContext {
  hass: any;
  guest: boolean;
  maxVolume: number;
  temperatureRange?: [number, number];
  busy: Set<string>;
  confirm: { entity: string; text: string } | null;
  roomName: string;
}

export function entityName(e: RoomEntity, s: any, roomName: string): string {
  if (e.name) return e.name;
  let n = titleCase(s?.attributes?.friendly_name || e.entity);
  const r = String(roomName || '').trim();
  if (r && n.toLowerCase().startsWith(r.toLowerCase() + ' ') && n.length > r.length + 2) n = n.slice(r.length + 1);
  return n.charAt(0).toUpperCase() + n.slice(1);
}
export function entityIcon(e: RoomEntity, s: any): string {
  return e.icon || s?.attributes?.icon || DEFAULT_ICONS[domainOf(e.entity)] || 'mdi:circle-outline';
}

export function stateText(s: any, guest: boolean): string {
  const d = domainOf(s.entity_id), a = s.attributes || {};
  if (d === 'light' && isOn(s) && num(a.brightness)) return `On · ${Math.round(a.brightness / 2.55)}%`;
  if (d === 'climate') return `${titleCase(String(s.state).replace(/_/g, ' '))}${num(a.current_temperature) ? ` · ${a.current_temperature}°` : ''}`;
  if (d === 'media_player' && isOn(s) && num(a.volume_level)) return `On · vol ${Math.round(a.volume_level * 100)}%`;
  if (d === 'sensor') return `${s.state}${a.unit_of_measurement ? ` ${a.unit_of_measurement}` : ''}`;
  if (d === 'binary_sensor') return isOn(s) ? 'Detected' : 'Clear';
  if (['scene', 'script', 'button', 'input_button'].includes(d)) return 'Tap to run';
  if (d === 'lock' && s.state === 'unlocked') return guest ? 'Unlocked · tap to lock' : 'Unlocked';
  return titleCase(String(s.state).replace(/_/g, ' '));
}

export function tileHtml(e: RoomEntity, ctx: TileContext): string {
  const id = e.entity, s = ctx.hass?.states?.[id], d = domainOf(id), a = s?.attributes || {}, g = ctx.guest;
  const name = esc(entityName(e, s, ctx.roomName)), ic = icon(entityIcon(e, s));
  const busy = ctx.busy.has(id);
  const dis = !available(s) || busy ? 'disabled' : '';
  const text = !s ? 'Not found' : !available(s) ? 'Unavailable' : busy ? 'Changing…' : stateText(s, g);
  const on = isOn(s);
  const ro = e.read_only || READ_ONLY_DOMAINS.includes(d);
  const head = (action: string | null, sw = true) =>
    `<button class="row" ${action ? `data-action="${action}" data-entity="${esc(id)}" data-focus="t-${esc(id)}"` : 'tabindex=-1'} ${action ? dis : ''}><span class="ticon">${ic}</span><span class="ttext"><span class="tname">${name}</span><span class="tstate">${esc(ctx.confirm?.entity === id ? ctx.confirm.text : text)}</span></span>${sw && action ? '<span class="sw" aria-hidden="true"></span>' : ''}</button>`;
  if (ro || !s) return `<div class="tile">${head(null, false)}</div>`;
  let extra = '';
  if (d === 'light' && on && (num(a.brightness) || (a.supported_color_modes || []).some((m: string) => m !== 'onoff'))) {
    const pct = num(a.brightness) ? Math.max(1, Math.round(a.brightness / 2.55)) : 100;
    extra = `<div class="extra"><input class="range" type="range" min="1" max="100" value="${pct}" data-action="brightness" data-entity="${esc(id)}" data-focus="b-${esc(id)}" aria-label="${name} brightness"></div>`;
  }
  if (d === 'fan' && Number(a.supported_features) & 1) {
    const p = on ? Number(a.percentage ?? 100) : 0;
    const opts: [string, number][] = [['Off', 0], ['Low', 33], ['Med', 67], ['High', 100]];
    const sel = opts.reduce((b, o) => (Math.abs(o[1] - p) < Math.abs(b[1] - p) ? o : b))[1];
    extra = `<div class="extra"><div class="seg">${opts.map(([n, v]) => `<button data-action="fan" data-entity="${esc(id)}" data-value="${v}" data-focus="f-${esc(id)}-${v}" aria-pressed="${v === sel}" ${dis}>${n}</button>`).join('')}</div></div>`;
  }
  if (d === 'media_player' && on && Number(a.supported_features) & 4 && num(a.volume_level)) {
    const cap = Math.min(1, ctx.maxVolume);
    extra = `<div class="extra"><input class="range" type="range" min="0" max="${cap}" step="0.02" value="${Math.min(cap, a.volume_level)}" data-action="volume" data-entity="${esc(id)}" data-focus="v-${esc(id)}" aria-label="${name} volume"></div>`;
  }
  if (d === 'cover') {
    const sensitive = g && SENSITIVE_COVERS.has(a.device_class);
    const btn = (svc: string, label: string) => `<button data-action="cover" data-service="${svc}" data-entity="${esc(id)}" data-focus="c-${esc(id)}-${svc}" ${dis}>${label}</button>`;
    return `<div class="tile ${on ? 'on' : ''}">${head(null, false)}<div class="extra"><div class="seg">${sensitive ? btn('close_cover', 'Close') : btn('open_cover', 'Open') + btn('stop_cover', 'Stop') + btn('close_cover', 'Close')}</div></div></div>`;
  }
  if (d === 'climate') {
    const range = ctx.temperatureRange;
    const step = Number(a.target_temp_step) || (String(ctx.hass?.config?.unit_system?.temperature).includes('C') ? 0.5 : 1);
    const t = a.temperature;
    const ctl = num(t)
      ? `<div class="temp"><button class="step" data-action="temp" data-entity="${esc(id)}" data-value="${-step}" data-focus="tm-${esc(id)}" ${dis || (range && t - step < range[0] ? 'disabled' : '')} aria-label="Lower">−</button><span class="val">${t}°</span><button class="step" data-action="temp" data-entity="${esc(id)}" data-value="${step}" data-focus="tp-${esc(id)}" ${dis || (range && t + step > range[1] ? 'disabled' : '')} aria-label="Raise">+</button></div>`
      : '';
    return `<div class="tile ${on ? 'on' : ''}">${head(null, false)}${ctl ? `<div class="extra">${ctl}</div>` : ''}</div>`;
  }
  if (d === 'lock') {
    const locked = s.state === 'locked';
    if (g && locked) return `<div class="tile">${head(null, false)}</div>`;
    return `<div class="tile">${head(g ? 'lock' : locked ? 'unlock' : 'lock', false)}</div>`;
  }
  if (['scene', 'script', 'button', 'input_button'].includes(d)) return `<div class="tile">${head('run', false)}</div>`;
  if (['light', 'switch', 'input_boolean', 'fan', 'media_player', 'remote', 'humidifier'].includes(d)) return `<div class="tile ${on ? 'on' : ''}">${head('toggle')}${extra}</div>`;
  return `<div class="tile">${head(null, false)}</div>`;
}

export const OFFABLE = ['light', 'switch', 'input_boolean', 'fan'];
export const sensitiveCover = (s: any) => SENSITIVE_COVERS.has(s?.attributes?.device_class);
