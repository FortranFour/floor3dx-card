// Visual editor for floor3dx-rooms-card. The same four steps as floor3d-snapshot-card's editor:
// pick a floor3d card from your dashboards, detect the rooms, choose a theme, display options.
// Rooms are detected by the live preview card (it has the model loaded), over a window event.
import { THEMES } from './themes';
import { Room, slug } from './rooms';
import { esc } from './tiles';
import { ROOMS_EDITOR_EVENT, ROOMS_PREVIEW_EVENT } from './rooms-card';

const clone = (v: any) => JSON.parse(JSON.stringify(v ?? null));
const ENTITY_DOMAINS = /^(light|switch|fan|cover|climate|media_player|lock|input_boolean|scene|script|sensor|binary_sensor|remote|button|input_button|vacuum|humidifier|valve|water_heater|alarm_control_panel)\./;

const STYLE = `
:host{display:block;color:var(--primary-text-color);font-size:14px}
details{border:1px solid var(--divider-color,rgba(127,127,127,.25));border-radius:12px;margin:0 0 12px;background:var(--card-background-color)}
summary{cursor:pointer;padding:12px 14px;font-weight:500;list-style:none;display:flex;align-items:center;gap:8px}summary::-webkit-details-marker{display:none}summary:before{content:"▸";color:var(--secondary-text-color);transition:transform .15s}details[open]>summary:before{transform:rotate(90deg)}
summary .badge{margin-left:auto;font-weight:400;font-size:12px;color:var(--secondary-text-color)}summary .badge.warn{color:var(--warning-color,#e69500)}summary .badge.ok{color:var(--success-color,#2e7d32)}
.body{padding:0 14px 14px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}.row>label{flex:1;min-width:140px}
label{display:block;font-size:12px;color:var(--secondary-text-color)}label>input,label>select{margin-top:4px}
input[type=text],input[type=number],select{width:100%;box-sizing:border-box;min-height:38px;padding:6px 10px;border:1px solid var(--divider-color,rgba(127,127,127,.35));border-radius:8px;background:var(--secondary-background-color,transparent);color:var(--primary-text-color);font:inherit}
.check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--primary-text-color);min-height:32px}
button{font:inherit;cursor:pointer;min-height:36px;padding:6px 12px;border-radius:8px;border:1px solid var(--divider-color,rgba(127,127,127,.35));background:transparent;color:var(--primary-color)}button.primary{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff)}button.icon{min-height:30px;padding:2px 8px;color:var(--secondary-text-color)}button:disabled{opacity:.5;cursor:default}
.note{font-size:12px;color:var(--secondary-text-color);line-height:1.5;margin:6px 0}.note.warn{color:var(--warning-color,#e69500)}.note.err{color:var(--error-color,#db4437)}
.item{border:1px solid var(--divider-color,rgba(127,127,127,.2));border-radius:10px;padding:8px 10px;margin:8px 0}.item .title{display:flex;align-items:center;gap:8px}.item .title b{flex:1;font-weight:500;overflow-wrap:anywhere}
.room>summary{padding:10px 12px}.room{margin:8px 0}.room .body{padding:0 12px 12px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.chip{display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 10px;border-radius:14px;background:var(--secondary-background-color,rgba(127,127,127,.12));font-size:12px}.chip button{min-height:24px;padding:0 6px;border:0}
.ent{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:end;margin:6px 0}.ent .tools{display:flex;gap:2px}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;margin:8px 0}.sw{display:flex;flex-direction:column;align-items:stretch;gap:0;padding:0;border-radius:10px;overflow:hidden;border:2px solid transparent;background:transparent;color:var(--primary-text-color);min-height:0}.sw[aria-pressed=true]{border-color:var(--primary-color)}.sw .c{height:34px;display:flex;align-items:center;justify-content:center}.sw .c i{display:block;width:60%;height:2px}.sw .l{font-size:11px;padding:4px 2px;text-align:center;line-height:1.2}
ha-icon{--mdc-icon-size:20px;width:20px;height:20px;color:var(--secondary-text-color)}
.found{max-height:220px;overflow:auto}
`;

class Floor3dxRoomsCardEditor extends HTMLElement {
  private _config: any;
  private _hass: any;
  private _open: Record<string, boolean> = { model: true, rooms: true, theme: false, display: false };
  private _roomOpen = new Set<string>();
  private _found: any[] | null = null;
  private _scanning = false;
  private _busy: string | null = null;
  private _msg: Record<string, [string, string]> = {};
  private _objects: { floors: string[]; all: string[] } | null = null;
  private _detectSensors = false;
  private _detectTimer: any;
  private _onPreview = (e: Event) => this._fromPreview((e as CustomEvent).detail);

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._events();
  }
  connectedCallback(): void {
    window.addEventListener(ROOMS_PREVIEW_EVENT, this._onPreview);
    window.dispatchEvent(new CustomEvent(ROOMS_EDITOR_EVENT, { detail: { request: 'objects' } }));
  }
  disconnectedCallback(): void { window.removeEventListener(ROOMS_PREVIEW_EVENT, this._onPreview); clearTimeout(this._detectTimer); }
  setConfig(config: any): void { this._config = clone(config) || {}; this._config.rooms ||= []; this._render(); }
  set hass(hass: any) { const first = !this._hass; this._hass = hass; if (first) this._render(); }

  private _emit(): void {
    const config = clone(this._config);
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
    this._render();
  }

  // ---- rendering ---------------------------------------------------------------------------
  private _render(): void {
    if (!this._config) return;
    const root = this.shadowRoot!, focus = (root.activeElement as HTMLElement | null)?.dataset?.key;
    const c = this._config;
    const entities = this._hass ? Object.keys(this._hass.states).filter((id) => ENTITY_DOMAINS.test(id)).sort() : [];
    const objects = this._objects?.all || [];
    root.innerHTML = `<style>${STYLE}</style>
<datalist id="f3r-entities">${entities.map((id) => `<option value="${esc(id)}">${esc(this._hass.states[id].attributes.friendly_name || '')}</option>`).join('')}</datalist>
<datalist id="f3r-objects">${objects.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
${this._section('model', '1 · Model', c.card?.objfile ? String(c.card.objfile) : 'None', c.card?.objfile ? '' : 'warn', this._modelSection())}
${this._section('rooms', '2 · Rooms', `${c.rooms.length} room${c.rooms.length === 1 ? '' : 's'}`, '', this._roomsSection())}
${this._section('theme', '3 · Theme', THEMES.find((t) => t.key === (c.theme || 'neon'))?.label || String(c.theme), '', this._themeSection())}
${this._section('display', '4 · Display', '', '', this._displaySection())}`;
    if (focus) (root.querySelector(`[data-key="${CSS.escape(focus)}"]`) as HTMLElement | null)?.focus();
  }
  private _section(id: string, title: string, badge: string, badgeClass: string, body: string): string {
    return `<details data-section="${id}" ${this._open[id] ? 'open' : ''}><summary>${title}<span class="badge ${badgeClass}">${esc(badge)}</span></summary><div class="body">${body}</div></details>`;
  }
  private _modelSection(): string {
    const c = this._config, found = this._found;
    return `<p class="note">The rooms card shows the live 3D model of an existing floor3dx-card (or floor3d-card / floor3dpro-card), with all of that card's lights, text frames, pictures, doors and shades. Pick the card; its configuration is copied in here and the two cards stay independent afterwards.</p>
<div class="row"><button data-act="scan" ${this._scanning ? 'disabled' : ''}>${this._scanning ? 'Searching dashboards…' : 'Find floor3d cards in my dashboards'}</button></div>
${found ? (found.length ? `<div class="found">${found.map((f, i) => `<div class="item"><div class="title"><b>${esc(f.label)}</b><button data-act="use-found" data-i="${i}">${c.card && JSON.stringify(c.card) === JSON.stringify(f.card) ? 'In use' : 'Use'}</button></div><div class="note">${esc(f.url)} · ${(f.card.entities || []).length} entities${f.card.look?.theme ? ` · ${esc(f.card.look.theme)} look` : ''}</div></div>`).join('')}</div>` : '<p class="note warn">No floor3d cards found in dashboards you can read. Paste a card configuration under <code>card:</code> in the YAML editor.</p>') : ''}
${c.card?.objfile ? `<p class="note">Model: <code>${esc((c.card.path || '') + c.card.objfile)}</code> · ${(c.card.entities || []).length} entity rows. Changes to the original card are not copied; use “Use” again to refresh.</p>` : ''}`;
  }
  private _roomsSection(): string {
    const c = this._config;
    return `<div class="row"><button class="primary" data-act="detect" ${!c.card?.objfile || this._busy ? 'disabled' : ''}>${this._busy === 'detect' ? 'Analysing the model…' : c.rooms.length ? 'Detect rooms again' : 'Detect rooms from the model'}</button><button data-act="room-add">Add room</button></div>
<label class="check"><input type="checkbox" id="detect-sensors" ${this._detectSensors ? 'checked' : ''}>Also add sensors (temperatures, doors, windows…) when detecting</label>
<p class="note">Detection finds the floor objects named <code>room_N_1</code> (Sweet Home 3D exports), names each room from the floor3d entity bound to its floor, and puts the card's entities in the room they stand in. Rooms you have edited keep their edits; review below. Tap a room in the preview to check it.</p>
${this._msg.rooms ? `<p class="note ${this._msg.rooms[0]}">${esc(this._msg.rooms[1])}</p>` : ''}
${c.rooms.map((r: Room, i: number) => this._roomEditor(r, i)).join('')}`;
  }
  private _roomEditor(r: Room, i: number): string {
    const n = this._config.rooms.length, ents = r.entities || [];
    return `<details class="room item" data-room="${i}" ${this._roomOpen.has(r.id) ? 'open' : ''}><summary><ha-icon icon="${esc(r.icon || 'mdi:door-open')}"></ha-icon>${esc(r.name || r.id)}<span class="badge">${ents.length} entit${ents.length === 1 ? 'y' : 'ies'}</span></summary><div class="body">
<div class="row"><label>Name<input type="text" data-field="rooms.${i}.name" value="${esc(r.name || '')}" data-key="rn${i}"></label><label>Icon<input type="text" data-field="rooms.${i}.icon" value="${esc(r.icon || '')}" placeholder="mdi:sofa-outline" data-key="ri${i}"></label></div>
<label>Floor objects (tap target, tint and pin)</label><div class="chips">${(r.floors || []).map((f, j) => `<span class="chip">${esc(f)}<button data-act="floor-remove" data-i="${i}" data-j="${j}" title="Remove">✕</button></span>`).join('') || '<span class="note">None: the room is reachable from the Rooms menu only.</span>'}</div>
<div class="row"><label>Add floor object<input type="text" list="f3r-objects" placeholder="room_3_1" data-key="rf${i}" id="floor-${i}"></label><button data-act="floor-add" data-i="${i}">Add</button></div>
<label>Entities</label>
${ents.map((e, j) => `<div class="ent"><label>Entity<input type="text" list="f3r-entities" data-field="rooms.${i}.entities.${j}.entity" value="${esc(e.entity)}" data-key="re${i}-${j}"></label><label>Label<input type="text" data-field="rooms.${i}.entities.${j}.name" value="${esc(e.name || '')}" placeholder="${esc(this._hass?.states[e.entity]?.attributes?.friendly_name || '')}" data-key="rl${i}-${j}"></label><div class="tools"><button class="icon" data-act="ent-up" data-i="${i}" data-j="${j}" ${j ? '' : 'disabled'} title="Move up">↑</button><button class="icon" data-act="ent-remove" data-i="${i}" data-j="${j}" title="Remove">✕</button></div></div>${this._hass && e.entity && !this._hass.states[e.entity] ? `<p class="note warn">${esc(e.entity)} doesn't exist.</p>` : ''}`).join('')}
<div class="row"><label>Add entity<input type="text" list="f3r-entities" placeholder="light.kitchen" data-key="ra-${i}" id="ent-${i}"></label><button data-act="ent-add" data-i="${i}">Add</button></div>
<div class="row"><button class="icon" data-act="room-show" data-i="${i}">Show in preview</button><button class="icon" data-act="room-up" data-i="${i}" ${i ? '' : 'disabled'}>↑ Move up</button><button class="icon" data-act="room-down" data-i="${i}" ${i < n - 1 ? '' : 'disabled'}>↓ Move down</button><button class="icon" data-act="room-remove" data-i="${i}">Delete room</button></div>
</div></details>`;
  }
  private _themeSection(): string {
    const cur = this._config.theme || 'neon';
    const groups: string[] = [];
    THEMES.forEach((t) => { if (!groups.includes(t.group)) groups.push(t.group); });
    return `<p class="note">The look of the model and the colours of the overlay. The first seven are floor3dx-card's looks; the rest are palettes of its custom theme, chosen to read well with lamps on.</p>
${groups.map((g) => `<label>${esc(g)}</label><div class="swatches">${THEMES.filter((t) => t.group === g).map((t) => `<button class="sw" data-act="theme" data-theme="${t.key}" aria-pressed="${t.key === cur}" title="${esc(t.label)}"><span class="c" style="background:${t.stage}"><i style="background:${t.edges}"></i></span><span class="l">${esc(t.label)}</span></button>`).join('')}</div>`).join('')}
<div class="row"><label class="check"><input type="checkbox" data-field="room_colors" data-bool ${this._config.room_colors ? 'checked' : ''}>Tint every room's floor in its own pastel colour</label></div>`;
  }
  private _displaySection(): string {
    const c = this._config;
    return `<div class="row"><label>Title<input type="text" data-field="title" value="${esc(c.title || '')}" data-key="dt"></label><label>Subtitle<input type="text" data-field="subtitle" value="${esc(c.subtitle || '')}" data-key="ds"></label></div>
<div class="row"><label>Height (blank: the panel view's height, or 60vh)<input type="text" data-field="height" value="${esc(c.height ?? '')}" placeholder="calc(100vh - 56px)" data-key="dh"></label></div>
<div class="row"><label class="check"><input type="checkbox" data-field="pins" data-bool data-default-true ${c.pins !== false ? 'checked' : ''}>Room pins on the model</label><label class="check"><input type="checkbox" data-field="labels" data-bool ${c.labels ? 'checked' : ''}>Pins always show the room's name</label><label class="check"><input type="checkbox" data-field="keep_panel" data-bool ${c.keep_panel ? 'checked' : ''}>A tap outside the rooms keeps the panel open</label></div>
<label class="check"><input type="checkbox" data-field="guest_mode" data-bool data-default-true ${c.guest_mode !== false ? 'checked' : ''}>Guest mode: locks can only be locked, garage doors and gates only closed, alarms are read-only, TV volume is capped</label>
<div class="row"><label>Max volume (0–1)<input type="number" min="0" max="1" step="0.05" data-field="max_volume" data-num value="${esc(c.max_volume ?? '')}" placeholder="${c.guest_mode !== false ? '0.6' : '1'}" data-key="dv"></label><label>Thermostat min<input type="number" data-field="temperature_range.0" data-num value="${esc(c.temperature_range?.[0] ?? '')}" data-key="dmin"></label><label>Thermostat max<input type="number" data-field="temperature_range.1" data-num value="${esc(c.temperature_range?.[1] ?? '')}" data-key="dmax"></label></div>
<p class="note">Double-tap on the model still does what the floor3dx card does (toggle a lamp, open a camera). A single tap selects the room. A dashboard is not a security boundary: give guests a non-admin Home Assistant user.</p>`;
  }

  // ---- events ------------------------------------------------------------------------------
  private _events(): void {
    const root = this.shadowRoot!;
    root.addEventListener('toggle', (e) => {
      const d = e.target as HTMLDetailsElement;
      if (d.dataset?.section) this._open[d.dataset.section] = d.open;
      if (d.dataset?.room !== undefined) { const id = this._config.rooms[Number(d.dataset.room)]?.id; if (id) d.open ? this._roomOpen.add(id) : this._roomOpen.delete(id); }
    }, true);
    root.addEventListener('change', (e) => { const t = e.target as HTMLInputElement; if (t.id === 'detect-sensors') { this._detectSensors = t.checked; return; } this._field(t); });
    root.addEventListener('keydown', (e) => { const t = e.target as HTMLElement; if ((e as KeyboardEvent).key === 'Enter' && t.id?.match(/^(ent-|floor-)/)) { e.preventDefault(); (t.closest('.row')?.querySelector('button') as HTMLButtonElement | null)?.click(); } });
    root.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null; if (b && !b.disabled) this._act(b.dataset.act as string, b.dataset as any); });
  }
  private _field(el: HTMLInputElement): void {
    const path = el.dataset?.field; if (!path) return;
    let value: any = el.dataset.bool !== undefined ? el.checked : el.value;
    if (el.dataset.num !== undefined) value = value === '' ? undefined : Number(value);
    if (typeof value === 'string') value = value.trim();
    const keys = path.split('.'), last = keys.pop() as string;
    let o = this._config;
    keys.forEach((k, n) => { const next = keys[n + 1] ?? last; o[k] ??= /^\d+$/.test(next) ? [] : {}; o = o[k]; });
    if (value === '' || value === undefined || (el.dataset.defaultTrue !== undefined && value === true) || (el.dataset.bool !== undefined && el.dataset.defaultTrue === undefined && value === false)) delete o[last];
    else o[last] = value;
    if (Array.isArray(this._config.temperature_range) && this._config.temperature_range.filter((x: any) => x !== null && x !== undefined).length < 2) delete this._config.temperature_range;
    if (/^rooms\.\d+\.name$/.test(path)) {
      const r = this._config.rooms[Number(keys[1])];
      if (r && (!r.id || /^room(-\d+)?$/.test(r.id))) { const taken = new Set<string>(this._config.rooms.filter((x: Room) => x !== r).map((x: Room) => x.id)); this._roomOpen.delete(r.id); r.id = slug(value, taken); this._roomOpen.add(r.id); }
    }
    this._emit();
  }
  private _act(act: string, d: any): void {
    const c = this._config, i = Number(d.i), j = Number(d.j), rooms: Room[] = c.rooms;
    if (act === 'scan') { this._scan(); return; }
    if (act === 'use-found') {
      const f = this._found![i];
      c.card = clone(f.card);
      if (!c.theme && f.card.look?.theme && THEMES.some((t) => t.key === String(f.card.look.theme).toLowerCase())) c.theme = String(f.card.look.theme).toLowerCase();
      this._objects = null;
      this._emit();
      // the preview card reloads the model; ask for its objects when it is ready
      clearTimeout(this._detectTimer);
      this._detectTimer = setTimeout(() => window.dispatchEvent(new CustomEvent(ROOMS_EDITOR_EVENT, { detail: { request: 'objects' } })), 4000);
      return;
    }
    if (act === 'theme') { c.theme = d.theme; if (c.theme === 'neon') delete c.theme; this._emit(); return; }
    if (act === 'room-add') { const id = slug('room', new Set(rooms.map((r) => r.id))); rooms.push({ id, name: 'New room', floors: [], entities: [] }); this._roomOpen.add(id); this._emit(); return; }
    if (act === 'room-remove') { rooms.splice(i, 1); this._emit(); return; }
    if (act === 'room-up' && i) { [rooms[i - 1], rooms[i]] = [rooms[i], rooms[i - 1]]; this._emit(); return; }
    if (act === 'room-down' && i < rooms.length - 1) { [rooms[i + 1], rooms[i]] = [rooms[i], rooms[i + 1]]; this._emit(); return; }
    if (act === 'room-show') { window.dispatchEvent(new CustomEvent(ROOMS_EDITOR_EVENT, { detail: { request: 'select', room: rooms[i].id } })); return; }
    if (act === 'floor-add') {
      const input = this.shadowRoot!.getElementById(`floor-${i}`) as HTMLInputElement, obj = input.value.trim(); if (!obj) return;
      (rooms[i].floors ||= []).push(obj); this._emit(); return;
    }
    if (act === 'floor-remove') { rooms[i].floors!.splice(j, 1); this._emit(); return; }
    if (act === 'ent-add') {
      const id = (this.shadowRoot!.getElementById(`ent-${i}`) as HTMLInputElement).value.trim(); if (!id) return;
      (rooms[i].entities ||= []).push({ entity: id }); this._emit(); return;
    }
    if (act === 'ent-remove') { rooms[i].entities!.splice(j, 1); this._emit(); return; }
    if (act === 'ent-up' && j) { const e = rooms[i].entities!; [e[j - 1], e[j]] = [e[j], e[j - 1]]; this._emit(); return; }
    if (act === 'detect') { this._detect(); return; }
  }

  // ---- the dashboards' floor3d cards ------------------------------------------------------
  private async _scan(): Promise<void> {
    this._scanning = true; this._render();
    const found: any[] = [];
    try {
      const boards: any[] = await this._hass.callWS({ type: 'lovelace/dashboards/list' }).catch(() => []);
      const targets = [{ url_path: null, title: 'Overview' }, ...boards];
      for (const b of targets) {
        let cfg: any;
        try { cfg = await this._hass.callWS({ type: 'lovelace/config', url_path: b.url_path, force: false }); } catch { continue; }
        const walk = (node: any, view: string): void => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { node.forEach((n) => walk(n, view)); return; }
          if (typeof node.type === 'string' && /floor3d/i.test(node.type) && !/rooms-card/i.test(node.type) && typeof node.objfile === 'string') {
            const url = `${node.path || ''}${node.objfile}`;
            const card = clone(node);
            delete card.type; delete card.style; delete card.card_mod; delete card.view_layout; delete card.layout_options; delete card.grid_options;
            found.push({ url, card, label: `${b.title || b.url_path || 'Dashboard'} › ${view || 'view'} · ${node.type.replace('custom:', '')}` });
          }
          for (const [k, v] of Object.entries(node)) walk(v, k === 'views' ? view : node.title && node.cards ? node.title : view);
        };
        (cfg.views || []).forEach((v: any) => walk(v, v.title || v.path));
      }
    } finally { this._scanning = false; }
    this._found = found;
    this._render();
  }

  // ---- detection, by the preview card -----------------------------------------------------
  private _detect(): void {
    this._busy = 'detect'; this._msg = {}; this._render();
    window.dispatchEvent(new CustomEvent(ROOMS_EDITOR_EVENT, { detail: { request: 'detect', sensors: this._detectSensors } }));
    clearTimeout(this._detectTimer);
    this._detectTimer = setTimeout(() => { if (this._busy === 'detect') { this._busy = null; this._msg = { rooms: ['err', 'No answer from the preview: is the model still loading? Try again in a moment.'] }; this._render(); } }, 15000);
  }
  private _fromPreview(detail: any): void {
    if (!detail) return;
    if (detail.objects) { this._objects = detail.objects; if (this._busy !== 'detect') this._render(); }
    if (this._busy !== 'detect') return;
    if (detail.error) { this._busy = null; this._msg = { rooms: ['err', detail.error] }; this._render(); return; }
    if (!detail.rooms) return;
    clearTimeout(this._detectTimer);
    this._busy = null;
    const proposed: Room[] = detail.rooms;
    if (!proposed.length) { this._msg = { rooms: ['warn', 'No room_N_1 floor objects found. Add rooms by hand and pick their floor objects.'] }; this._render(); return; }
    const existing = new Map<string, Room>(this._config.rooms.map((r: Room) => [JSON.stringify(r.floors || []), r]));
    const taken = new Set<string>();
    this._config.rooms = proposed.map((p) => {
      const keep = existing.get(JSON.stringify(p.floors || []));
      const room: Room = keep ? { ...keep, entities: keep.entities?.length ? keep.entities : p.entities } : p;
      room.id = slug(room.id || room.name || 'room', taken); taken.add(room.id);
      return room;
    }).concat(this._config.rooms.filter((r: Room) => !(r.floors || []).length));
    const ents = this._config.rooms.reduce((n: number, r: Room) => n + (r.entities?.length || 0), 0);
    this._msg = { rooms: ['', `Found ${proposed.length} rooms and placed ${ents} of the card's entities in them.`] };
    this._open.rooms = true;
    this._emit();
  }
}

if (!customElements.get('floor3dx-rooms-card-editor')) customElements.define('floor3dx-rooms-card-editor', Floor3dxRoomsCardEditor);
