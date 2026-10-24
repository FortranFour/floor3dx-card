// The room panel's controls: the tile set of floor3d-snapshot-card 0.12 (same author, MIT), one tile
// per entity. Switches with a dimmable bulb behind them, brightness / warmth / colour for lights,
// fan speeds, TVs and speakers (volume, channels through a remote, sources), covers, top-down /
// bottom-up shades (one end open at a time), thermostats (power, setpoints, modes, guest levels),
// locks, scenes and scripts, read-only sensors; guest mode limits throughout.
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
export const OFFABLE = ['light', 'switch', 'input_boolean', 'fan'];
const DEFAULT_ICONS: Record<string, string> = { light: 'mdi:lightbulb-outline', switch: 'mdi:toggle-switch-outline', fan: 'mdi:fan', cover: 'mdi:window-shutter', climate: 'mdi:thermostat', media_player: 'mdi:television', lock: 'mdi:lock-outline', scene: 'mdi:palette-outline', script: 'mdi:script-text-outline', sensor: 'mdi:eye-outline', binary_sensor: 'mdi:checkbox-blank-circle-outline', input_boolean: 'mdi:toggle-switch-outline', button: 'mdi:gesture-tap-button', input_button: 'mdi:gesture-tap-button', alarm_control_panel: 'mdi:shield-home-outline', vacuum: 'mdi:robot-vacuum' };
const SENSITIVE_COVERS = new Set(['garage', 'gate', 'door']);
const READ_ONLY_DOMAINS = ['sensor', 'binary_sensor', 'weather', 'alarm_control_panel', 'person', 'device_tracker'];
const HVAC: Record<string, [string, string]> = { heat_cool: ['Heat/Cool', 'mdi:sun-snowflake-variant'], auto: ['Auto', 'mdi:thermostat-auto'], heat: ['Heat', 'mdi:fire'], cool: ['Cool', 'mdi:snowflake'], dry: ['Dry', 'mdi:water-percent'], fan_only: ['Fan', 'mdi:fan'], off: ['Off', 'mdi:power'] };
const GUEST_THERMOSTAT = ['full', 'setpoint_power', 'setpoint', 'view'];
const REMOTE_KEYS: Record<string, Record<string, string>> = { samsungtv: { channel_up: 'KEY_CHUP', channel_down: 'KEY_CHDOWN', info: 'KEY_INFO' }, androidtv_remote: { channel_up: 'CHANNEL_UP', channel_down: 'CHANNEL_DOWN', info: 'INFO' } };
const MP = { PAUSE: 1, VOLUME_SET: 4, VOLUME_MUTE: 8, PREVIOUS: 16, NEXT: 32, TURN_ON: 128, VOLUME_STEP: 1024, SELECT_SOURCE: 2048, PLAY: 16384 };
const COLOR_MODES = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
// the colour swatches: two rows, red to cyan, then white, pink, purple, blue; [label, hue, saturation, shown as]
type Swatch = [string, number, number, string];
const SWATCHES: Swatch[][] = [
  [['Red', 0, 100, '#f23b3b'], ['Orange', 30, 100, '#ff941f'], ['Yellow', 50, 100, '#ffdc32'], ['Green', 138, 100, '#35bd60'], ['Cyan', 184, 100, '#25d7e5']],
  [['White', 0, 0, '#ffffff'], ['Pink', 330, 70, '#fa78ba'], ['Purple', 273, 90, '#9948dc'], ['Blue', 218, 100, '#3478ef']],
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What the tiles need from the card. */
export interface TilesHost {
  hass: any;
  config: any; // guest_mode, guest_mode_entity, max_volume, temperature_range, guest_thermostat, brightness_slider, white_slider, color_swatches
  busy: Set<string>;
  seq: Set<string>; // entities held by a multi-step action (a shade changing ends)
  confirm: { entity: string; text: string } | null;
  request(): void;
  call(id: string, domain: string, service: string, data?: any): Promise<boolean>;
  showToast(text: string): void;
  entityConfig(id: string): RoomEntity | null;
  setConfirm(c: { entity: string; text: string } | null): void;
}

export const CSS_TILES = `
.tile{border:1px solid var(--f3r-line);border-radius:14px;overflow:hidden;min-width:0;background:rgba(var(--f3r-stage),calc(var(--f3r-alpha) * .5));container-type:inline-size}.tile.on{border-color:rgba(var(--f3r-accent),.45);background:rgba(var(--f3r-accent),.1)}
.row{display:flex;align-items:center;gap:10px;width:100%;min-height:60px;padding:10px 12px;border:0;background:transparent;text-align:left}
.ticon{display:grid;place-items:center;width:34px;height:34px;flex:none;border-radius:10px;background:rgba(127,127,127,.14);color:var(--f3r-muted)}.tile.on .ticon{color:rgb(var(--f3r-on));background:rgba(var(--f3r-on),.14)}
.ttext{flex:1;min-width:0}.tname{display:block;font-size:14px;font-weight:500;line-height:1.3;overflow-wrap:anywhere}.tstate{display:block;color:var(--f3r-muted);font-size:12px;margin-top:2px}.tstate.warn{color:#e57373}
.sw{flex:none;width:28px;height:17px;border-radius:10px;background:rgba(127,127,127,.3);padding:3px}.sw:before{content:"";display:block;width:11px;height:11px;border-radius:50%;background:var(--f3r-ink)}.tile.on .sw{background:rgb(var(--f3r-accent))}.tile.on .sw:before{margin-left:11px;background:#fff}
.extra{padding:0 12px 10px}.ctl{margin-top:2px}.ctl-l{display:block;font-size:11px;color:var(--f3r-muted);margin:2px 0 -2px}
.range{display:block;width:100%;height:28px;margin:0;accent-color:rgb(var(--f3r-accent));touch-action:pan-x}.range.warmth{accent-color:#e9a65a}
.wheel{display:flex;flex-direction:column;align-items:center;gap:8px;margin:4px 0 2px}.wheel .row{display:flex;justify-content:center;gap:10px}.swatch-b{width:32px;height:32px;border-radius:50%;border:1px solid rgba(0,0,0,.2);background:var(--sw);padding:0;flex:none}.swatch-b[aria-pressed=true]{box-shadow:0 0 0 2px rgb(var(--f3r-stage)),0 0 0 4px rgb(var(--f3r-accent))}
.seg{display:flex;gap:5px}.seg button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:34px;min-width:0;padding:0 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border:1px solid var(--f3r-line);border-radius:10px;background:transparent;color:var(--f3r-muted);font-size:12px}.seg button[aria-pressed=true]{color:rgb(var(--f3r-accent));border-color:rgba(var(--f3r-accent),.6);background:rgba(var(--f3r-accent),.12)}.seg.wrap{flex-wrap:wrap}.seg button ha-icon{width:19px;height:19px;--mdc-icon-size:19px}
.seg+.ctl,.ctl+.seg,.seg+.range,.minfo+.vol,.vol+.seg,.seg+.msel,.vol+.msel,.ctl+.ctl{margin-top:8px}
.vol{display:flex;align-items:center;gap:8px}.vol .range{flex:1;min-width:0}.vol .seg{flex:1}.mbtn{flex:none;display:grid;place-items:center;width:36px;height:34px;border:1px solid var(--f3r-line);border-radius:10px;background:transparent;color:var(--f3r-muted)}.mbtn ha-icon{width:19px;height:19px;--mdc-icon-size:19px}.mbtn[aria-pressed=true]{color:rgb(var(--f3r-accent));border-color:rgba(var(--f3r-accent),.6);background:rgba(var(--f3r-accent),.12)}
.msel{display:block;width:100%;min-height:34px;padding:0 10px;border:1px solid var(--f3r-line);border-radius:10px;background:transparent;color:var(--f3r-ink);font:inherit;font-size:13px}.msel option{color:#233246;background:#fff}
.minfo{margin:-4px 0 8px;color:var(--f3r-muted);font-size:12px;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.temp{display:flex;align-items:center;gap:10px;justify-content:space-between}.ctl .temp{margin-top:5px}.temp .val{font-size:20px}.step{width:40px;height:38px;border:1px solid var(--f3r-line);border-radius:11px;background:rgba(var(--f3r-accent),.1);color:rgb(var(--f3r-accent));font-size:22px}
`;

export class Tiles {
  private lastHvac = new Map<string, string>();
  constructor(private host: TilesHost) {}

  private s(id: string): any { return this.host.hass?.states?.[id]; }
  guest(): boolean {
    const c = this.host.config, gid = c.guest_mode_entity;
    if (typeof gid === 'string' && gid) { const st = this.s(gid); if (st) return isOn(st); }
    return c.guest_mode !== false;
  }
  hidden(e: RoomEntity): boolean { return !!(e as any).guest_hidden && this.guest(); }
  name(e: RoomEntity, roomName = ''): string {
    if (e.name) return e.name;
    let n = titleCase(this.s(e.entity)?.attributes?.friendly_name || e.entity);
    const r = String(roomName || '').trim();
    if (r && n.toLowerCase().startsWith(r.toLowerCase() + ' ') && n.length > r.length + 2) n = n.slice(r.length + 1);
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  private iconOf(e: RoomEntity): string { return e.icon || this.s(e.entity)?.attributes?.icon || DEFAULT_ICONS[domainOf(e.entity)] || 'mdi:circle-outline'; }

  // ---- the tile ---------------------------------------------------------------------------
  tile(e: any, roomName: string): string {
    const id: string = e.entity, s = this.s(id), d = domainOf(id), a = s?.attributes || {}, g = this.guest();
    const name = esc(this.name(e, roomName)), ic = icon(this.iconOf(e));
    const H = this.host;
    const busy = H.busy.has(id) || H.seq.has(id) || (!!e.top_entity && (H.busy.has(e.top_entity) || H.seq.has(e.top_entity)));
    const dis = !available(s) || busy ? 'disabled' : '';
    // a dimmer is the light behind a switch: the switch powers it, the light sets the brightness
    const dimId: string | null = e.dimmer || (d === 'light' ? id : null), ds = dimId ? this.s(dimId) : null, da = ds?.attributes || {};
    const dimReady = !!ds && (e.dimmer ? available(ds) : isOn(ds));
    const dimmable = dimReady && (num(da.brightness) || (da.supported_color_modes || []).some((m: string) => m !== 'onoff'));
    const pct = dimmable ? (num(da.brightness) && isOn(ds) ? Math.max(1, Math.round(da.brightness / 2.55)) : 100) : null;
    const dimNote = e.dimmer && isOn(s) ? (!ds ? ' · bulb not found' : !available(ds) ? ' · bulb unavailable' : !isOn(ds) ? ' · bulb off' : pct ? ` · ${pct}%` : '') : '';
    const stateText = !s ? 'Not found' : !available(s) ? 'Unavailable' : busy || (dimId && H.busy.has(dimId)) ? 'Changing…' : e.dimmer && isOn(s) ? `On${dimNote}` : this.stateText(s, e);
    const on = isOn(s);
    const ro = e.read_only || READ_ONLY_DOMAINS.includes(d);
    const warn = d === 'cover' && e.top_entity && this.railPos(id) > 0 && this.railPos(e.top_entity) > 0;
    const head = (action: string | null, sw = true) =>
      `<button class="row" ${action ? `data-action="${action}" data-entity="${esc(id)}" data-focus="t-${esc(id)}"` : 'tabindex=-1'} ${action ? dis : ''}><span class="ticon">${ic}</span><span class="ttext"><span class="tname">${name}</span><span class="tstate${warn ? ' warn' : ''}">${esc(H.confirm?.entity === id ? H.confirm.text : stateText)}</span></span>${sw && action ? '<span class="sw" aria-hidden="true"></span>' : ''}</button>`;
    if (ro || !s) return `<div class="tile">${head(null, false)}</div>`;
    let extra = '';
    if (on && dimReady) {
      const c = H.config, modes: string[] = da.supported_color_modes || [];
      const want = Array.isArray(e.controls) ? new Set<string>(e.controls) : new Set<string>([
        ...(c.brightness_slider !== false ? ['brightness'] : []),
        ...(c.white_slider !== false ? ['white'] : []),
        ...((c.color_swatches ?? !g) ? ['color'] : []),
      ]);
      const parts: [string, string][] = [];
      if (want.has('brightness') && dimmable) parts.push(['Brightness', `<input class="range" type="range" min="1" max="100" value="${pct}" data-action="brightness" data-entity="${esc(dimId)}" data-focus="b-${esc(id)}" aria-label="${name} brightness">`]);
      if (want.has('white') && modes.includes('color_temp')) {
        const lo = Number(da.min_color_temp_kelvin) || 2000, hi = Number(da.max_color_temp_kelvin) || 6500;
        const k = num(da.color_temp_kelvin) ? Math.min(hi, Math.max(lo, Number(da.color_temp_kelvin))) : Math.round((lo + hi) / 2);
        parts.push(['Warmth', `<input class="range warmth" type="range" min="${lo}" max="${hi}" step="50" value="${k}" data-action="kelvin" data-entity="${esc(dimId)}" data-focus="k-${esc(id)}" aria-label="${name} white warmth">`]);
      }
      if (want.has('color') && modes.some((m) => COLOR_MODES.includes(m))) {
        const cur = COLOR_MODES.includes(da.color_mode) && Array.isArray(da.hs_color) ? da.hs_color.map(Number) : null;
        const isSel = (h: number, sat: number) => cur && (sat === 0 ? cur[1] < 12 : cur[1] >= 25 && Math.min(Math.abs(cur[0] - h), 360 - Math.abs(cur[0] - h)) < 22);
        const btn = ([label, h, sat, css]: Swatch) => `<button class="swatch-b" data-action="color" data-entity="${esc(dimId)}" data-h="${h}" data-s="${sat}" data-focus="c-${esc(id)}-${label}" style="--sw:${css}" aria-label="${label}" title="${label}" aria-pressed="${!!isSel(h, sat)}"></button>`;
        parts.push(['Color', `<div class="wheel" role="group" aria-label="${name} color">${SWATCHES.map((row) => `<div class="row">${row.map(btn).join('')}</div>`).join('')}</div>`]);
      }
      if (parts.length) extra = `<div class="extra">${parts.map(([label, html]) => (parts.length > 1 ? `<div class="ctl"><span class="ctl-l">${label}</span>${html}</div>` : html)).join('')}</div>`;
    }
    if (d === 'fan' && Number(a.supported_features) & 1) {
      const p = on ? Number(a.percentage ?? 100) : 0;
      const opts: [string, number][] = [['Off', 0], ['Low', 33], ['Med', 67], ['High', 100]];
      const sel = opts.reduce((b, o) => (Math.abs(o[1] - p) < Math.abs(b[1] - p) ? o : b))[1];
      extra = `<div class="extra"><div class="seg">${opts.map(([n, v]) => `<button data-action="fan" data-entity="${esc(id)}" data-value="${v}" data-focus="f-${esc(id)}-${v}" aria-pressed="${v === sel}" ${dis}>${n}</button>`).join('')}</div></div>`;
    }
    if (d === 'media_player') return this.mediaTile(e, s, a, on, name, head, dis);
    if (d === 'cover') return this.coverTile(e, a, on, name, head, dis, g);
    if (d === 'climate') return this.climateTile(e, s, a, on, head, dis);
    if (d === 'lock') {
      const locked = s.state === 'locked';
      if (g && locked) return `<div class="tile">${head(null, false)}</div>`;
      return `<div class="tile">${head(g ? 'lock' : locked ? 'unlock' : 'lock', false)}</div>`;
    }
    if (['scene', 'script', 'button', 'input_button'].includes(d)) return `<div class="tile">${head('run', false)}</div>`;
    if (['light', 'switch', 'input_boolean', 'fan', 'media_player', 'remote', 'humidifier'].includes(d)) return `<div class="tile ${on ? 'on' : ''}">${head('toggle')}${extra}</div>`;
    return `<div class="tile">${head(null, false)}</div>`;
  }

  // ---- thermostats ----------------------------------------------------------------------------
  private thermoLevel(): string { if (!this.guest()) return 'full'; const v = this.host.config.guest_thermostat; return GUEST_THERMOSTAT.includes(v) ? v : 'setpoint_power'; }
  private tempStep(a: any): number { return Number(a.target_temp_step) || (String(this.host.hass?.config?.unit_system?.temperature).includes('C') ? 0.5 : 1); }
  private tempLimits(a: any): [number, number] {
    let lo = num(a.min_temp) ? Number(a.min_temp) : -Infinity, hi = num(a.max_temp) ? Number(a.max_temp) : Infinity;
    const r = this.host.config.temperature_range;
    if (this.guest() && Array.isArray(r) && num(r[0]) && num(r[1])) { lo = Math.max(lo, Number(r[0])); hi = Math.min(hi, Number(r[1])); }
    return [lo, hi];
  }
  private dual(a: any): boolean { return num(a.target_temp_low) && num(a.target_temp_high) && !num(a.temperature); }
  private gap(a: any): number {
    const want = String(this.host.hass?.config?.unit_system?.temperature).includes('C') ? 1 : 2;
    return this.dual(a) ? Math.max(0, Math.min(want, Number(a.target_temp_high) - Number(a.target_temp_low))) : 0;
  }
  private resumeMode(s: any): string | undefined {
    const modes: string[] = s.attributes.hvac_modes || [], last = this.lastHvac.get(s.entity_id);
    if (last && modes.includes(last)) return last;
    return ['heat_cool', 'auto', 'heat', 'cool'].find((m) => modes.includes(m)) || modes.find((m) => m !== 'off');
  }
  private climateTile(e: any, s: any, a: any, on: boolean, head: (action: string | null, sw?: boolean) => string, dis: string): string {
    const id = e.entity, level = this.thermoLevel();
    if (on) this.lastHvac.set(id, s.state);
    const power = level === 'full' || level === 'setpoint_power';
    const step = this.tempStep(a), [lo, hi] = this.tempLimits(a), gap = this.gap(a);
    const fmt = (t: number) => `${Math.round(Number(t) * 10) / 10}°`;
    const stepper = (which: string, t: number, minus: boolean, plus: boolean, label: string) => `<div class="temp"><button class="step" data-action="temp" data-which="${which}" data-entity="${esc(id)}" data-value="${-step}" data-focus="tm${which}-${esc(id)}" ${dis || (minus ? '' : 'disabled')} aria-label="Lower ${label}">−</button><span class="val">${fmt(t)}</span><button class="step" data-action="temp" data-which="${which}" data-entity="${esc(id)}" data-value="${step}" data-focus="tp${which}-${esc(id)}" ${dis || (plus ? '' : 'disabled')} aria-label="Raise ${label}">+</button></div>`;
    const parts: [string, string][] = [];
    if (on && level !== 'view') {
      if (this.dual(a)) {
        const L = Number(a.target_temp_low), Hh = Number(a.target_temp_high);
        parts.push(['Heat to', stepper('low', L, L - step >= lo, L + step <= hi - gap, 'heat setpoint')]);
        parts.push(['Cool to', stepper('high', Hh, Hh - step >= lo + gap, Hh + step <= hi, 'cool setpoint')]);
      } else if (num(a.temperature)) {
        const t = Number(a.temperature);
        parts.push(['', stepper('', t, t - step >= lo, t + step <= hi, 'setpoint')]);
      }
    }
    const modes: string[] = (a.hvac_modes || []).filter((m: string) => m !== 'off' && HVAC[m]);
    let html = parts.map(([label, h]) => (label ? `<div class="ctl"><span class="ctl-l">${label}</span>${h}</div>` : `<div class="ctl">${h}</div>`)).join('');
    if (level === 'full' && modes.length > 1) {
      html += `<div class="seg${modes.length > 5 ? ' wrap' : ''}" role="group" aria-label="Mode">${modes.map((m) => `<button data-action="hvac" data-mode="${m}" data-entity="${esc(id)}" data-focus="h-${esc(id)}-${m}" aria-pressed="${s.state === m}" aria-label="${HVAC[m][0]}" title="${HVAC[m][0]}" ${dis}>${icon(HVAC[m][1])}</button>`).join('')}</div>`;
    }
    return `<div class="tile ${on ? 'on' : ''}">${head(power ? 'climate-power' : null, power)}${html ? `<div class="extra">${html}</div>` : ''}</div>`;
  }

  // ---- TVs and speakers ---------------------------------------------------------------------
  private volCap(): number { return Math.min(1, Number(this.host.config.max_volume ?? (this.guest() ? 0.6 : 1))); }
  private platform(id: string): string | undefined { return this.host.hass?.entities?.[id]?.platform; }
  private remoteKeys(e: any): Record<string, string> {
    if (!e.remote || !available(this.s(e.remote))) return {};
    return { ...(REMOTE_KEYS[this.platform(e.remote) || ''] || {}), ...(e.remote_commands || {}) };
  }
  private mediaTile(e: any, s: any, a: any, on: boolean, name: string, head: (action: string | null, sw?: boolean) => string, dis: string): string {
    const id = e.entity, f = Number(a.supported_features) || 0, rows: string[] = [];
    if (on) {
      const what = [a.media_title, a.media_series_title || a.media_artist].filter(Boolean).join(' — ');
      if (what) rows.push(`<div class="minfo" title="${esc(what)}">${esc(what)}</div>`);
      const cap = this.volCap();
      const mute = f & MP.VOLUME_MUTE ? `<button class="mbtn" data-action="tv" data-cmd="mute" data-entity="${esc(id)}" data-focus="mu-${esc(id)}" aria-pressed="${!!a.is_volume_muted}" aria-label="Mute" title="Mute" ${dis}>${icon(a.is_volume_muted ? 'mdi:volume-off' : 'mdi:volume-high')}</button>` : '';
      if (f & MP.VOLUME_SET && num(a.volume_level)) rows.push(`<div class="vol">${mute}<input class="range" type="range" min="0" max="${cap}" step="0.02" value="${Math.min(cap, a.volume_level)}" data-action="volume" data-entity="${esc(id)}" data-focus="v-${esc(id)}" aria-label="${name} volume"></div>`);
      else if (f & MP.VOLUME_STEP) {
        const atCap = num(a.volume_level) && Number(a.volume_level) >= cap - 0.001;
        rows.push(`<div class="vol">${mute}<div class="seg"><button data-action="tv" data-cmd="vol-down" data-entity="${esc(id)}" data-focus="vd-${esc(id)}" aria-label="Volume down" title="Volume down" ${dis}>${icon('mdi:volume-minus')}</button><button data-action="tv" data-cmd="vol-up" data-entity="${esc(id)}" data-focus="vu-${esc(id)}" aria-label="Volume up" title="Volume up" ${dis || (atCap ? 'disabled' : '')}>${icon('mdi:volume-plus')}</button></div></div>`);
      } else if (mute) rows.push(`<div class="vol">${mute}</div>`);
      const keys = this.remoteKeys(e), bt = (cmd: string, label: string, inner: string) => `<button data-action="tv" data-cmd="${cmd}" data-entity="${esc(id)}" data-focus="tv-${esc(id)}-${cmd}" aria-label="${label}" title="${label}" ${dis}>${inner}</button>`;
      const channels = keys.channel_up && keys.channel_down, tracks = f & MP.PREVIOUS && f & MP.NEXT;
      const tvTracks = !channels && tracks && this.platform(id) === 'samsungtv';
      const mid = keys.info ? bt('info', 'Show info on the TV', 'Info') : !channels && !tvTracks && f & (MP.PAUSE | MP.PLAY) ? bt('play-pause', 'Play or pause', icon(s.state === 'playing' ? 'mdi:pause' : 'mdi:play')) : '';
      if (channels || tvTracks) rows.push(`<div class="seg">${bt(channels ? 'ch-down' : 'prev', 'Channel down', 'Ch −')}${mid}${bt(channels ? 'ch-up' : 'next', 'Channel up', 'Ch +')}</div>`);
      else if (tracks) rows.push(`<div class="seg">${bt('prev', 'Previous', icon('mdi:skip-previous'))}${mid}${bt('next', 'Next', icon('mdi:skip-next'))}</div>`);
      else if (mid) rows.push(`<div class="seg">${mid}</div>`);
      const list: string[] = (Array.isArray(a.source_list) ? a.source_list : []).filter((x: string) => !Array.isArray(e.sources) || e.sources.includes(x));
      if (f & MP.SELECT_SOURCE && list.length) {
        const cur = list.includes(a.source) ? '' : `<option value="" selected disabled>${esc(a.source || 'Source')}</option>`;
        rows.push(`<select class="msel" data-action="source" data-entity="${esc(id)}" data-focus="src-${esc(id)}" aria-label="${name} source" ${dis}>${cur}${list.map((x) => `<option value="${esc(x)}" ${x === a.source ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`);
      }
    }
    return `<div class="tile ${on ? 'on' : ''}">${head('toggle')}${rows.length ? `<div class="extra">${rows.join('')}</div>` : ''}</div>`;
  }

  // ---- covers and shades ----------------------------------------------------------------------
  railPos(id: string): number { const st = this.s(id); return available(st) && num(st.attributes.current_position) ? Number(st.attributes.current_position) : st?.state === 'open' ? 100 : 0; }
  private coverTile(e: any, a: any, on: boolean, name: string, head: (action: string | null, sw?: boolean) => string, dis: string, g: boolean): string {
    const id = e.entity, f = Number(a.supported_features) || 0;
    if (e.top_entity) return this.shadeTile(e, name, head, dis);
    const sensitive = g && SENSITIVE_COVERS.has(a.device_class);
    const btn = (svc: string, label: string) => `<button data-action="cover" data-service="${svc}" data-entity="${esc(id)}" data-focus="c-${esc(id)}-${svc}" ${dis}>${label}</button>`;
    let html = `<div class="seg">${sensitive ? btn('close_cover', 'Close') : btn('open_cover', 'Open') + btn('stop_cover', 'Stop') + btn('close_cover', 'Close')}</div>`;
    if (!sensitive && f & 4 && num(a.current_position)) html += `<input class="range" type="range" min="0" max="100" step="1" value="${Number(a.current_position)}" data-action="position" data-entity="${esc(id)}" data-focus="p-${esc(id)}" aria-label="${name} position" ${dis}>`;
    return `<div class="tile ${on ? 'on' : ''}">${head(null, false)}<div class="extra">${html}</div></div>`;
  }
  /** A top-down/bottom-up shade: the tile's entity is the bottom rail, top_entity the top rail. */
  private shadeTile(e: any, name: string, head: (action: string | null, sw?: boolean) => string, dis: string): string {
    const id = e.entity, top = e.top_entity, ts = this.s(top);
    const b = this.railPos(id), t = this.railPos(top);
    const off = dis || !available(ts) ? 'disabled' : '';
    const mode = b > 0 && t > 0 ? 'both' : t > 0 ? 'top' : b > 0 ? 'bottom' : 'closed';
    const btn = (rail: string, label: string, title: string) => `<button data-action="shade" data-rail="${rail}" data-entity="${esc(id)}" data-focus="sh-${esc(id)}-${rail}" aria-pressed="${mode === (rail === 'none' ? 'closed' : rail)}" title="${title}" ${off}>${label}</button>`;
    let html = `<div class="seg" role="group" aria-label="${name}">${btn('top', 'Top', 'Open from the top')}${btn('none', 'Close', 'Close')}${btn('bottom', 'Bottom', 'Open from the bottom')}</div>`;
    if (mode === 'top' || mode === 'bottom') {
      const v = mode === 'top' ? t : b;
      html += `<div class="ctl"><span class="ctl-l">${mode === 'top' ? 'Open from the top' : 'Open from the bottom'}</span><input class="range" type="range" min="0" max="100" step="1" value="${v}" data-action="shade-pos" data-rail="${mode}" data-entity="${esc(id)}" data-focus="sp-${esc(id)}" aria-label="${name} ${mode} opening" ${off}></div>`;
    }
    return `<div class="tile ${mode === 'closed' ? '' : 'on'}">${head(null, false)}<div class="extra">${html}</div></div>`;
  }
  /** Move one rail of a top-down/bottom-up shade, closing the other end first so both are never open. */
  private async shade(id: string, rail: string, position: number): Promise<void> {
    const H = this.host, e: any = H.entityConfig(id);
    if (!e?.top_entity) return;
    const top: string = e.top_entity, ids = [id, top];
    if (ids.some((x) => H.seq.has(x))) return;
    ids.forEach((x) => H.seq.add(x)); H.request();
    try {
      if (rail === 'none') { await Promise.all(ids.filter((x) => this.railPos(x) > 0).map((x) => H.call(x, 'cover', 'close_cover'))); return; }
      const me = rail === 'top' ? top : id, other = rail === 'top' ? id : top;
      if (this.railPos(other) > 0) {
        if (!(await H.call(other, 'cover', 'set_cover_position', { position: 0 }))) return;
        for (let n = 0; n < 240 && this.railPos(other) > 0; n++) await sleep(250);
        if (this.railPos(other) > 0) { H.showToast(`The other end of ${this.name(e)} didn't close, so this end stayed put.`); return; }
      }
      await H.call(me, 'cover', 'set_cover_position', { position: Math.max(0, Math.min(100, Math.round(position))) });
    } finally { ids.forEach((x) => H.seq.delete(x)); H.request(); }
  }

  stateText(s: any, e: any = {}): string {
    const id = s.entity_id || e.entity, d = domainOf(id), a = s.attributes;
    if (d === 'cover' && e.top_entity) {
      const b = this.railPos(id), t = this.railPos(e.top_entity);
      if (!available(this.s(e.top_entity))) return 'Top rail unavailable';
      return b > 0 && t > 0 ? `Both ends open · top ${t}% · bottom ${b}%` : t > 0 ? `Open from the top · ${t}%` : b > 0 ? `Open from the bottom · ${b}%` : 'Closed';
    }
    if (d === 'cover' && num(a.current_position) && s.state !== 'closed') return `${titleCase(s.state)} · ${Math.round(a.current_position)}%`;
    if (d === 'light' && isOn(s) && num(a.brightness)) return `On · ${Math.round(a.brightness / 2.55)}%`;
    if (d === 'climate') {
      const mode = HVAC[s.state]?.[0] || titleCase(String(s.state).replace(/_/g, ' '));
      const action = a.hvac_action && !['idle', 'off'].includes(a.hvac_action) && s.state !== 'off' ? ` · ${String(a.hvac_action).replace(/_/g, ' ')}` : '';
      return `${mode}${action}${num(a.current_temperature) ? ` · ${a.current_temperature}° now` : ''}`;
    }
    if (d === 'media_player' && isOn(s)) {
      const what = a.app_name || a.source || (s.state === 'playing' ? 'Playing' : s.state === 'paused' ? 'Paused' : 'On');
      return `${what}${a.is_volume_muted ? ' · muted' : num(a.volume_level) ? ` · vol ${Math.round(a.volume_level * 100)}%` : ''}`;
    }
    if (d === 'sensor') return `${s.state}${a.unit_of_measurement ? ` ${a.unit_of_measurement}` : ''}`;
    if (d === 'binary_sensor') return isOn(s) ? 'Detected' : 'Clear';
    if (['scene', 'script', 'button', 'input_button'].includes(d)) return 'Tap to run';
    if (d === 'lock' && s.state === 'unlocked') return this.guest() ? 'Unlocked · tap to lock' : 'Unlocked';
    return titleCase(String(s.state).replace(/_/g, ' '));
  }

  // ---- actions --------------------------------------------------------------------------------
  /** A click on a tile's button. Returns false when the button was not a tile action. */
  click(b: HTMLButtonElement): boolean {
    const H = this.host, { action, entity: id = '' } = b.dataset as any, s = this.s(id), d = domainOf(id), g = this.guest();
    if (!action || !s) return false;
    if (action === 'toggle') {
      const e: any = H.entityConfig(id) || {};
      if (d === 'media_player' && !isOn(s) && !(Number(s.attributes.supported_features) & MP.TURN_ON) && e.remote) H.call(e.remote, 'remote', 'turn_on');
      else H.call(id, d, isOn(s) ? 'turn_off' : 'turn_on');
    } else if (action === 'climate-power') {
      const level = this.thermoLevel(); if (level !== 'full' && level !== 'setpoint_power') return true;
      const f = Number(s.attributes.supported_features) || 0;
      if (isOn(s)) f & 128 ? H.call(id, 'climate', 'turn_off') : H.call(id, 'climate', 'set_hvac_mode', { hvac_mode: 'off' });
      else if (f & 256) H.call(id, 'climate', 'turn_on');
      else { const m = this.resumeMode(s); if (m) H.call(id, 'climate', 'set_hvac_mode', { hvac_mode: m }); }
    } else if (action === 'hvac') {
      if (this.thermoLevel() !== 'full') return true;
      const m = b.dataset.mode as string; if ((s.attributes.hvac_modes || []).includes(m)) H.call(id, 'climate', 'set_hvac_mode', { hvac_mode: m });
    } else if (action === 'tv') {
      const a = s.attributes, cmd = b.dataset.cmd, e: any = H.entityConfig(id) || {}, keys = this.remoteKeys(e);
      const send = (k: string) => keys[k] && e.remote && H.call(e.remote, 'remote', 'send_command', { command: keys[k] });
      if (cmd === 'mute') H.call(id, 'media_player', 'volume_mute', { is_volume_muted: !a.is_volume_muted });
      else if (cmd === 'vol-down') H.call(id, 'media_player', 'volume_down');
      else if (cmd === 'vol-up') { if (!(num(a.volume_level) && Number(a.volume_level) >= this.volCap() - 0.001)) H.call(id, 'media_player', 'volume_up'); }
      else if (cmd === 'ch-up') send('channel_up');
      else if (cmd === 'ch-down') send('channel_down');
      else if (cmd === 'info') send('info');
      else if (cmd === 'prev') H.call(id, 'media_player', 'media_previous_track');
      else if (cmd === 'next') H.call(id, 'media_player', 'media_next_track');
      else if (cmd === 'play-pause') H.call(id, 'media_player', 'media_play_pause');
    } else if (action === 'shade') this.shade(id, b.dataset.rail as string, 100);
    else if (action === 'color') { if (d === 'light') H.call(id, 'light', 'turn_on', { hs_color: [Number(b.dataset.h), Number(b.dataset.s)] }); }
    else if (action === 'fan') { const v = Number(b.dataset.value); v ? H.call(id, 'fan', 'set_percentage', { percentage: v }) : H.call(id, 'fan', 'turn_off'); }
    else if (action === 'cover') { const svc = b.dataset.service as string; if (g && SENSITIVE_COVERS.has(s.attributes.device_class) && svc !== 'close_cover') return true; H.call(id, 'cover', svc); }
    else if (action === 'temp') {
      if (this.thermoLevel() === 'view') return true;
      const a = s.attributes, step = this.tempStep(a), [lo, hi] = this.tempLimits(a), delta = Number(b.dataset.value);
      const rnd = (v: number) => Math.round(Math.round(v / step) * step * 10) / 10;
      if (!b.dataset.which) {
        const t = rnd(Number(a.temperature) + delta);
        if (t < lo || t > hi) return true;
        H.call(id, 'climate', 'set_temperature', { temperature: t });
      } else {
        const gap = this.gap(a);
        let L = Number(a.target_temp_low), Hh = Number(a.target_temp_high);
        if (b.dataset.which === 'low') { L = rnd(L + delta); if (Hh - L < gap) Hh = rnd(L + gap); } else { Hh = rnd(Hh + delta); if (Hh - L < gap) L = rnd(Hh - gap); }
        if (L < lo || Hh > hi) return true;
        H.call(id, 'climate', 'set_temperature', { target_temp_low: L, target_temp_high: Hh });
      }
    } else if (action === 'lock' || action === 'unlock' || action === 'run') {
      if (action === 'unlock' && g) return true;
      if (H.confirm?.entity !== id) { H.setConfirm({ entity: id, text: action === 'run' ? 'Tap again to run' : `Tap again to ${action}` }); return true; }
      H.setConfirm(null);
      if (action === 'run') H.call(id, d, ['button', 'input_button'].includes(d) ? 'press' : 'turn_on');
      else H.call(id, 'lock', action);
    } else return false;
    return true;
  }
  /** A change of a tile's slider or select. */
  change(i: HTMLInputElement | HTMLSelectElement): void {
    const H = this.host, id = i.dataset.entity as string;
    if (i.matches('select[data-action=source]')) {
      const e: any = H.entityConfig(id) || {}, list: string[] = this.s(id)?.attributes?.source_list || [];
      (i as HTMLSelectElement).blur();
      if (i.value && list.includes(i.value) && (!Array.isArray(e.sources) || e.sources.includes(i.value))) H.call(id, 'media_player', 'select_source', { source: i.value });
      return;
    }
    if (!i.matches('input[type=range]')) return;
    const action = i.dataset.action;
    if (action === 'position') { const st = this.s(id); if (!(this.guest() && SENSITIVE_COVERS.has(st?.attributes?.device_class))) H.call(id, 'cover', 'set_cover_position', { position: Number(i.value) }); }
    if (action === 'shade-pos') this.shade(id, i.dataset.rail as string, Number(i.value));
    if (action === 'brightness') H.call(id, 'light', 'turn_on', { brightness_pct: Number(i.value) });
    if (action === 'kelvin') H.call(id, 'light', 'turn_on', { color_temp_kelvin: Number(i.value) });
    if (action === 'volume') H.call(id, 'media_player', 'volume_set', { volume_level: Math.min(this.volCap(), Number(i.value)) });
  }
}

export const sensitiveCover = (s: any) => SENSITIVE_COVERS.has(s?.attributes?.device_class);
