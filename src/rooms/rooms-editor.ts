// Visual editor for floor3dx-rooms-card. The same four steps as floor3d-snapshot-card's editor:
// pick a floor3d card from your dashboards (or several: a house and a garage), detect the rooms,
// choose a theme, display options. Rooms are detected by the live preview card (it has the models
// loaded), over a window event.
import { THEMES } from './themes';
import { Room, slug } from './rooms';
import { esc } from './tiles';
import { ROOMS_EDITOR_EVENT, ROOMS_PREVIEW_EVENT } from './rooms-card';
import { tokenRoles } from './references';
import { scanDashboards, FoundCard } from './scan';
import { normalizeConfig, cleanConfig } from '../config';

const clone = (v: any) => JSON.parse(JSON.stringify(v ?? null));
const ENTITY_DOMAINS = /^(light|switch|fan|cover|climate|media_player|lock|input_boolean|scene|script|sensor|binary_sensor|remote|button|input_button|vacuum|humidifier|valve|water_heater|alarm_control_panel)\./;

/** The regular editor hands back its whole block, normalised ('60' -> 60, defaults dropped). Only what
 *  really changed is written: a top-level key, or an entity row, whose normalised form equals the
 *  original's keeps the original's text, so the YAML diff is the edit and nothing else (and a wrapper
 *  that maps rows back to references sees only the rows that changed). */
function minimalWrite(original: any, next: any): any {
  if (!original || typeof original !== 'object') return next;
  const norm = (v: any) => { try { return JSON.stringify(cleanConfig(normalizeConfig({ type: 'custom:floor3dx-card', entities: [], ...v }))); } catch (_) { return undefined; } };
  const out: any = {};
  const empty = norm({});
  const keys = [...Object.keys(original), ...Object.keys(next).filter((k) => !(k in original))];
  for (const k of keys) {
    if (!(k in next)) { // dropped as a default by the regular editor: keep it as written if it was one
      if (norm({ [k]: original[k] }) === empty) out[k] = original[k];
      continue;
    }
    if (k === 'entities' && Array.isArray(next.entities) && Array.isArray(original.entities)) {
      out.entities = next.entities.map((row: any, idx: number) => {
        const was = original.entities[idx];
        if (!was) return row;
        const a = norm({ entities: [was] }), b = norm({ entities: [row] });
        return a !== undefined && a === b ? was : row;
      });
      continue;
    }
    const a = norm({ [k]: original[k] }), b = norm({ [k]: next[k] });
    out[k] = k in original && a !== undefined && a === b ? original[k] : next[k];
  }
  return out;
}

const STYLE = `
.inline{margin:8px 0 4px;padding:8px 10px 10px;border:1px solid var(--divider-color,#ddd);border-radius:12px;background:var(--secondary-background-color,rgba(0,0,0,.03))}.inline>p.note{margin:0 0 6px}
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
.ent{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:end;margin:6px 0}.ent .tools{display:flex;gap:2px}.row.pair{margin:0 0 4px 12px}.check.small,label.small{margin:0 0 8px 12px;min-height:26px;font-size:12px;color:var(--secondary-text-color)}label.small select{display:block;margin-top:2px;max-width:320px}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;margin:8px 0}.sw{display:flex;flex-direction:column;align-items:stretch;gap:0;padding:0;border-radius:10px;overflow:hidden;border:2px solid transparent;background:transparent;color:var(--primary-text-color);min-height:0}.sw[aria-pressed=true]{border-color:var(--primary-color)}.sw .c{height:34px;display:flex;align-items:center;justify-content:center}.sw .c i{display:block;width:60%;height:2px}.sw .l{font-size:11px;padding:4px 2px;text-align:center;line-height:1.2}
ha-icon{--mdc-icon-size:20px;width:20px;height:20px;color:var(--secondary-text-color)}
.found{max-height:220px;overflow:auto}
.group{margin:14px 0 4px;font-size:12px;font-weight:500;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.4px}
`;

/** The editor's view of the models: `models:` or the single `card:` as a one-item list. */
interface ModelItem { id: string; name: string; width?: number; card: any }

class Floor3dxRoomsCardEditor extends HTMLElement {
  private _config: any;
  private _hass: any;
  private _open: Record<string, boolean> = { model: true, rooms: true, theme: false, display: false };
  private _roomOpen = new Set<string>();
  private _found: FoundCard[] | null = null;
  private _used = new Map<number, number>(); // model index → found index
  private _target = 0; // the model a found card is used for
  private _scanning = false;
  private _keep = false; // keep [[entity:…]] references when copying
  private _editing: number | null = null; // the model whose 3D settings are open in the regular card's editor, inline
  private _inline: any = null; // that editor element (kept across re-renders)
  private _inlineHeld = ''; // the JSON it last emitted, so its own change is not fed back
  private _busy: string | null = null;
  private _msg: Record<string, [string, string]> = {};
  private _objects = new Map<string, { floors: string[]; all: string[] }>(); // by model id
  private _detectSensors = false;
  private _detectTimer: any;
  private _detectLeft: string[] = [];
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
  disconnectedCallback(): void { window.removeEventListener(ROOMS_PREVIEW_EVENT, this._onPreview); clearTimeout(this._detectTimer); if (this._editing !== null) window.dispatchEvent(new CustomEvent(ROOMS_EDITOR_EVENT, { detail: { request: 'edit-model', model: null } })); }
  setConfig(config: any): void {
    this._config = clone(config) || {};
    this._config.rooms ||= [];
    if (!this._found && this._models().some((m) => m.card && tokenRoles(m.card).length)) this._keep = true;
    this._render();
  }
  set hass(hass: any) { const first = !this._hass; this._hass = hass; if (this._inline) this._inline.hass = hass; if (first) this._render(); }

  private _emit(): void {
    const config = clone(this._config);
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
    this._render();
  }

  // ---- models --------------------------------------------------------------------------------
  private _models(): ModelItem[] {
    const c = this._config;
    if (Array.isArray(c.models) && c.models.length) {
      const taken = new Set<string>();
      return c.models.map((m: any, i: number) => { const name = m?.name || `Model ${i + 1}`; const id = slug(m?.id || name, taken); taken.add(id); return { id, name, width: m?.width, card: m?.card }; });
    }
    return [{ id: 'model', name: c.title || 'Model', card: c.card }];
  }
  /** Writes the models back: one model stays `card:`, several become `models:`; rooms follow. */
  private _setModels(list: ModelItem[]): void {
    const c = this._config, rooms: Room[] = c.rooms;
    if (list.length <= 1) {
      c.card = list[0]?.card; if (!c.card) delete c.card;
      delete c.models;
      rooms.forEach((r) => delete r.model);
    } else {
      c.models = list.map((m) => { const o: any = { id: m.id, name: m.name }; if (Number(m.width) > 0) o.width = Number(m.width); o.card = m.card; return o; });
      delete c.card;
      rooms.forEach((r) => { if (!r.model || !list.some((m) => m.id === r.model)) r.model = list[0].id; });
    }
  }

  // ---- rendering ---------------------------------------------------------------------------
  private _render(): void {
    if (!this._config) return;
    const root = this.shadowRoot!, focus = (root.activeElement as HTMLElement | null)?.dataset?.key;
    const c = this._config, models = this._models();
    const entities = this._hass ? Object.keys(this._hass.states).filter((id) => ENTITY_DOMAINS.test(id)).sort() : [];
    const objects = Array.from(new Set(Array.from(this._objects.values()).flatMap((o) => o.all)));
    const modelBadge = models.length > 1 ? `${models.length} models` : models[0].card?.objfile ? String(models[0].card.objfile) : 'None';
    root.innerHTML = `<style>${STYLE}</style>
<datalist id="f3r-entities">${entities.map((id) => `<option value="${esc(id)}">${esc(this._hass.states[id].attributes.friendly_name || '')}</option>`).join('')}</datalist>
<datalist id="f3r-covers">${entities.filter((id) => id.startsWith('cover.')).map((id) => `<option value="${esc(id)}">${esc(this._hass.states[id].attributes.friendly_name || '')}</option>`).join('')}</datalist>
<datalist id="f3r-remotes">${entities.filter((id) => id.startsWith('remote.')).map((id) => `<option value="${esc(id)}">${esc(this._hass.states[id].attributes.friendly_name || '')}</option>`).join('')}</datalist>
<datalist id="f3r-objects">${objects.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
${this._section('model', models.length > 1 ? '1 · Models' : '1 · Model', modelBadge, models.some((m) => !m.card?.objfile) ? 'warn' : '', this._modelSection())}
${this._section('rooms', '2 · Rooms', `${c.rooms.length} room${c.rooms.length === 1 ? '' : 's'}`, '', this._roomsSection())}
${this._section('theme', '3 · Theme', THEMES.find((t) => t.key === (c.theme || 'neon'))?.label || String(c.theme), '', this._themeSection())}
${this._section('display', '4 · Display', '', '', this._displaySection())}`;
    if (focus) (root.querySelector(`[data-key="${CSS.escape(focus)}"]`) as HTMLElement | null)?.focus();
    this._mountInline();
  }
  /** The regular card's editor inline on one model: one element, kept across this editor's re-renders
   *  (the HTML is rebuilt on every change) and fed the model's block with its `type`. Its config-changed
   *  is taken here, written into `models[i].card` and never reaches Home Assistant as this card's. */
  private _mountInline(): void {
    const i = this._editing, host = i === null ? null : (this.shadowRoot!.querySelector(`[data-inline="${i}"]`) as HTMLElement | null);
    if (i === null || !host) { if (this._inline) { this._inline.remove(); this._inline = null; } window.dispatchEvent(new CustomEvent(ROOMS_EDITOR_EVENT, { detail: { request: 'edit-model', model: null } })); return; }
    const m = this._models()[i]; if (!m?.card) return;
    if (!customElements.get('floor3dpro-card-editor')) {
      // the regular editor is a lazy chunk, loaded when a regular card's editor opens; load it now
      host.innerHTML += '<p class="note">Loading the editor…</p>';
      const card: any = customElements.get('floor3dx-card');
      (card && card.getConfigElement ? card.getConfigElement() : import('../editor')).then(() => { if (this._editing === i) this._mountInline(); }).catch((err: any) => { host.innerHTML += `<p class="note warn">The editor could not be loaded: ${esc(String(err?.message || err))}</p>`; });
      return;
    }
    if (!this._inline) {
      const el: any = document.createElement('floor3dpro-card-editor');
      el.addEventListener('config-changed', (ev: Event) => {
        ev.stopPropagation();
        const cfg = (ev as CustomEvent).detail?.config; if (!cfg) return;
        this._inlineHeld = JSON.stringify(cfg);
        const list = this._models(); if (!list[i]) return;
        const card = { ...cfg }; delete card.type;
        list[i].card = minimalWrite(list[i].card, card); this._setModels(list); this._emit();
      });
      this._inline = el;
    }
    if (this._hass) this._inline.hass = this._hass;
    const withType = { type: 'custom:floor3dx-card', ...m.card };
    if (JSON.stringify(withType) !== this._inlineHeld) { this._inlineHeld = ''; this._inline.setConfig(withType); }
    if (this._inline.parentElement !== host) host.appendChild(this._inline);
    window.dispatchEvent(new CustomEvent(ROOMS_EDITOR_EVENT, { detail: { request: 'edit-model', model: m.id } }));
  }
  private _section(id: string, title: string, badge: string, badgeClass: string, body: string): string {
    return `<details data-section="${id}" ${this._open[id] ? 'open' : ''}><summary>${title}<span class="badge ${badgeClass}">${esc(badge)}</span></summary><div class="body">${body}</div></details>`;
  }
  private _modelSection(): string {
    const models = this._models(), found = this._found, many = models.length > 1;
    const target = models[Math.min(this._target, models.length - 1)];
    const modelItem = (m: ModelItem, i: number) => `<div class="item">
${many ? `<div class="row"><label>Name<input type="text" data-model-field="name" data-i="${i}" value="${esc(m.name)}" data-key="mn${i}"></label><label>Width share (blank: equal)<input type="number" min="1" max="99" data-model-field="width" data-i="${i}" value="${esc(m.width ?? '')}" placeholder="50" data-key="mw${i}"></label></div>` : ''}
<div class="row">${m.card?.objfile ? `<span class="note" style="flex:1">Model: <code>${esc((m.card.path || '') + m.card.objfile)}</code> · ${(m.card.entities || []).length} entity rows${tokenRoles(m.card).length ? ` · ${tokenRoles(m.card).length} reference token${tokenRoles(m.card).length === 1 ? '' : 's'}` : ''}</span>` : `<span class="note warn" style="flex:1">No card yet: find one below and press Use.</span>`}${m.card?.objfile ? `<button data-act="model-edit" data-i="${i}" aria-pressed="${this._editing === i}">${this._editing === i ? 'Done with 3D settings' : 'Edit 3D settings'}</button>` : ''}${many ? `<button class="icon" data-act="model-remove" data-i="${i}">Remove</button>` : ''}</div>${this._editing === i ? `<div class="inline" data-inline="${i}"><p class="note">The regular floor3dx card's editor, on this model's block: lamps, daylight, doors, text panels, the look. The preview is this model in the rooms card; <em>pick</em> an object by tapping it there.</p></div>` : ''}</div>`;
    return `<p class="note">The rooms card shows the live 3D model of an existing floor3dx-card (or floor3d-card / floor3dpro-card), with all of that card's lights, text frames, pictures, doors and shades. Pick the card; its configuration is copied in here and the two cards stay independent afterwards. A second model (a garage) gets its own view and a switcher on the card.</p>
${models.map(modelItem).join('')}
<div class="row"><button data-act="scan" ${this._scanning ? 'disabled' : ''}>${this._scanning ? 'Searching dashboards…' : 'Find floor3d cards in my dashboards'}</button><button data-act="model-add">Add another model</button>${many ? `<label>Found cards go to<select id="model-target" data-key="mt">${models.map((m, i) => `<option value="${i}" ${i === this._target ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>` : ''}</div>
<label class="check"><input type="checkbox" id="keep-refs" ${this._keep ? 'checked' : ''}>Keep <code>&nbsp;[[entity:…]]&nbsp;</code> references (this rooms card will sit inside a dashboard-entity-reference wrapper)</label>
${found ? (found.length ? `<div class="found">${found.map((f, i) => { const inUse = this._used.get(this._target) === i || (this._used.get(this._target) === undefined && target?.card && JSON.stringify(target.card) === JSON.stringify(this._keep ? f.raw : f.card)); return `<div class="item"><div class="title"><b>${esc(f.label)}</b><button data-act="use-found" data-i="${i}">${inUse ? 'In use' : many ? `Use for ${esc(target?.name || '')}` : 'Use'}</button></div><div class="note">${esc(f.url)} · ${(f.card.entities || []).length} entities${f.card.look?.theme ? ` · ${esc(f.card.look.theme)} look` : ''}${tokenRoles(f.raw).length ? ` · ${tokenRoles(f.raw).length} references` : ''}</div>${f.unresolved?.length && !this._keep ? `<p class="note warn">${f.unresolved.length} entity reference${f.unresolved.length === 1 ? '' : 's'} could not be resolved from the dashboard's sources (${esc(f.unresolved.slice(0, 4).join(', '))}${f.unresolved.length > 4 ? ', …' : ''}); those rows will not work unless this rooms card is itself inside the same wrapper.</p>` : ''}</div>`; }).join('')}</div>` : '<p class="note warn">No floor3d cards found in dashboards you can read. Paste a card configuration under <code>card:</code> in the YAML editor.</p>') : ''}
${models.some((m) => m.card && tokenRoles(m.card).length) ? (this._keep ? `<p class="note">The configuration keeps its <code>[[entity:…]]</code> references: place this rooms card inside a <code>custom:dashboard-entity-reference</code> wrapper, which resolves them when the card is shown. Outside a wrapper the lamps stay dark and detection places rows by their type.</p>` : `<p class="note warn">The model configuration contains unresolved entity reference tokens (<code>[[entity:…]]</code>). Use “Find floor3d cards” and “Use” again to copy a resolved configuration, or tick “Keep references” if the card sits inside a wrapper.</p>`) : ''}
${models.some((m) => m.card?.objfile) ? '<p class="note">Changes to the original card are not copied; use “Use” again to refresh.</p>' : ''}`;
  }
  private _roomsSection(): string {
    const c = this._config, models = this._models(), many = models.length > 1;
    const ready = models.some((m) => m.card?.objfile);
    const group = (m: ModelItem) => c.rooms.map((r: Room, i: number) => [r, i] as [Room, number]).filter(([r]) => (r.model || models[0].id) === m.id);
    return `<div class="row"><button class="primary" data-act="detect" ${!ready || this._busy ? 'disabled' : ''}>${this._busy === 'detect' ? 'Analysing the model…' : c.rooms.length ? 'Detect rooms again' : 'Detect rooms from the model'}</button><button data-act="room-add">Add room</button></div>
<label class="check"><input type="checkbox" id="detect-sensors" ${this._detectSensors ? 'checked' : ''}>Also add sensors (temperatures, doors, windows…) when detecting</label>
<p class="note">Detection finds the floor objects named <code>room_N_1</code> (Sweet Home 3D exports), names each room from the floor3d entity bound to its floor, and puts the card's entities in the room they stand in. Rooms you have edited keep their edits; review below. Tap a room in the preview to check it.</p>
${this._msg.rooms ? `<p class="note ${this._msg.rooms[0]}">${esc(this._msg.rooms[1])}</p>` : ''}
${many ? models.map((m) => `<div class="group">${esc(m.name)}</div>${group(m).map(([r, i]) => this._roomEditor(r, i)).join('') || '<p class="note">No rooms on this model yet.</p>'}`).join('') : c.rooms.map((r: Room, i: number) => this._roomEditor(r, i)).join('')}`;
  }
  private _roomEditor(r: Room, i: number): string {
    const n = this._config.rooms.length, ents = r.entities || [], models = this._models();
    return `<details class="room item" data-room="${i}" ${this._roomOpen.has(r.id) ? 'open' : ''}><summary><ha-icon icon="${esc(r.icon || 'mdi:door-open')}"></ha-icon>${esc(r.name || r.id)}<span class="badge">${ents.length} entit${ents.length === 1 ? 'y' : 'ies'}</span></summary><div class="body">
<div class="row"><label>Name<input type="text" data-field="rooms.${i}.name" value="${esc(r.name || '')}" data-key="rn${i}"></label><label>Icon<input type="text" data-field="rooms.${i}.icon" value="${esc(r.icon || '')}" placeholder="mdi:sofa-outline" data-key="ri${i}"></label>${models.length > 1 ? `<label>Model<select data-field="rooms.${i}.model" data-key="rm${i}">${models.map((m) => `<option value="${esc(m.id)}" ${(r.model || models[0].id) === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>` : ''}</div>
<label>Floor objects (tap target, tint and pin)</label><div class="chips">${(r.floors || []).map((f, j) => `<span class="chip">${esc(f)}<button data-act="floor-remove" data-i="${i}" data-j="${j}" title="Remove">✕</button></span>`).join('') || '<span class="note">None: the room is reachable from the Rooms menu only.</span>'}</div>
<div class="row"><label>Add floor object<input type="text" list="f3r-objects" placeholder="room_3_1" data-key="rf${i}" id="floor-${i}"></label><button data-act="floor-add" data-i="${i}">Add</button></div>
<label>Entities</label>
${ents.map((e: any, j) => `<div class="ent"><label>Entity<input type="text" list="f3r-entities" data-field="rooms.${i}.entities.${j}.entity" value="${esc(e.entity)}" data-key="re${i}-${j}"></label><label>Label<input type="text" data-field="rooms.${i}.entities.${j}.name" value="${esc(e.name || '')}" placeholder="${esc(this._hass?.states[e.entity]?.attributes?.friendly_name || '')}" data-key="rl${i}-${j}"></label><div class="tools"><button class="icon" data-act="ent-up" data-i="${i}" data-j="${j}" ${j ? '' : 'disabled'} title="Move up">↑</button><button class="icon" data-act="ent-remove" data-i="${i}" data-j="${j}" title="Remove">✕</button></div></div>${this._pairing(e, i, j)}${this._hass && e.entity && !/\[\[|\{\{|\{%/.test(e.entity) && !this._hass.states[e.entity] ? `<p class="note warn">${esc(e.entity)} doesn't exist.</p>` : ''}${/\{\{|\{%/.test(e.entity || '') ? `<p class="note">A template: Home Assistant renders it as a readout under the room's name (the label in front, when given).</p>` : ''}${this._hass ? [e.dimmer, e.remote, e.top_entity].filter((x: string) => x && !/\[\[/.test(x) && !this._hass.states[x]).map((x: string) => `<p class="note warn">${esc(x)} doesn't exist.</p>`).join('') : ''}`).join('')}
<div class="row"><label>Add entity<input type="text" list="f3r-entities" placeholder="light.kitchen" data-key="ra-${i}" id="ent-${i}"></label><button data-act="ent-add" data-i="${i}">Add</button></div>
<div class="row"><button class="icon" data-act="room-show" data-i="${i}">Show in preview</button><button class="icon" data-act="room-up" data-i="${i}" ${i ? '' : 'disabled'}>↑ Move up</button><button class="icon" data-act="room-down" data-i="${i}" ${i < n - 1 ? '' : 'disabled'}>↓ Move down</button><button class="icon" data-act="room-remove" data-i="${i}">Delete room</button></div>
</div></details>`;
  }
  /** The fields that pair an entity with another: a shade's top rail, the bulb behind a switch, a TV's remote. */
  private _pairing(e: any, i: number, j: number): string {
    const id = String(e.entity || ''), f = (key: string, label: string, list: string, ph: string) => `<div class="row pair"><label>${label}<input type="text" list="${list}" data-field="rooms.${i}.entities.${j}.${key}" value="${esc(e[key] || '')}" placeholder="${ph}" data-key="r${key}${i}-${j}"></label></div>`;
    let html = '';
    if (/^cover\./.test(id)) html += f('top_entity', 'Top rail: makes this a top-down/bottom-up shade (optional)', 'f3r-covers', 'cover.…_top');
    if (/^(switch|input_boolean)\./.test(id) || e.dimmer) html += f('dimmer', 'Dimmer: the light behind this switch, for brightness (optional)', 'f3r-entities', 'light.…');
    if (/^media_player\./.test(id)) html += f('remote', 'TV remote, for channel and Info keys (optional)', 'f3r-remotes', 'remote.…');
    if (id && !/\{\{|\{%/.test(id) && !/^(sensor|binary_sensor)\./.test(id)) html += f('status', 'Status template: a Jinja template Home Assistant renders as this tile\'s status line (optional)', '', "{{ states('sensor.…') }} W");
    if (/^(binary_sensor|lock)\./.test(id) || /^cover\./.test(id)) html += `<label class="check small"><input type="checkbox" data-field="rooms.${i}.entities.${j}.summary_only" data-bool ${e.summary_only ? 'checked' : ''} data-key="rso${i}-${j}">Only in the room's subtitle (doors, locks and windows are summarised there; no readout line)</label>`;
    html += `<label class="check small"><input type="checkbox" data-field="rooms.${i}.entities.${j}.guest_hidden" data-bool ${e.guest_hidden ? 'checked' : ''} data-key="rg${i}-${j}">Hide in guest mode</label>`;
    // readouts can be grouped: a new line or a hairline after this one (sensors, binary sensors, templates)
    if (/^(sensor|binary_sensor)\./.test(id) || /\{\{|\{%/.test(id)) {
      const cur = String(e.break ?? '').toLowerCase();
      html += `<label class="small">After this readout<select data-field="rooms.${i}.entities.${j}.break" data-key="rb${i}-${j}"><option value="" ${!cur || cur === 'no' ? 'selected' : ''}>Nothing</option><option value="yes" ${cur === 'yes' || cur === 'true' ? 'selected' : ''}>Start a new line</option><option value="rule" ${cur === 'rule' || cur === 'line' || cur === 'divider' ? 'selected' : ''}>A thin divider, then a new line</option></select></label>`;
    }
    return html;
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
    const c = this._config, many = this._models().length > 1;
    const sel = (field: string, label: string, opts: [string, string][], cur: string, key: string) => `<label>${label}<select data-field="${field}" data-key="${key}">${opts.map(([v, t]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    return `<div class="row"><label>Title<input type="text" data-field="title" value="${esc(c.title || '')}" data-key="dt"></label><label>Subtitle<input type="text" data-field="subtitle" value="${esc(c.subtitle || '')}" data-key="ds"></label></div>
<div class="row"><label>Height (blank: the panel view's height, or 60vh)<input type="text" data-field="height" value="${esc(c.height ?? '')}" placeholder="calc(100vh - 56px)" data-key="dh"></label></div>
<div class="row">${sel('object_tap', 'A tap on an object bound to a light or a gesture', [['', 'Runs its action (toggle the lamp); the room stays as it is'], ['panel', 'Opens the room panel with that tile highlighted'], ['room', 'Selects the room; double-tap for the action']], c.object_tap || '', 'dot')}</div>
${many ? `<div class="row">${sel('default_model', 'Opens on', [['', esc(this._models()[0].name) + ' (the first model)'], ...this._models().slice(1).map((m): [string, string] => [m.id, esc(m.name)]), ['all', this._models().length === 2 ? 'Both' : 'All']], c.default_model || '', 'ddm')}</div>
<div class="row">${sel('layout', 'When every model is shown', [['', 'Side by side on a wide card, stacked on a tall one'], ['row', 'Side by side'], ['column', 'Stacked']], c.layout || '', 'dl')}<label class="check"><input type="checkbox" data-field="models_menu" data-bool data-default-true ${c.models_menu !== false ? 'checked' : ''}>Model switcher on the card</label></div>
<div class="row"><label>Space between the models (px)<input type="number" min="0" max="80" data-field="models_gap" data-num value="${esc(c.models_gap ?? '')}" placeholder="14" data-key="dmg"></label><label class="check"><input type="checkbox" data-field="model_labels" data-bool data-default-true ${c.model_labels !== false ? 'checked' : ''}>Divider and the model's name in each view when all are shown</label></div>` : ''}
<div class="row"><label class="check"><input type="checkbox" data-field="panel_lines" data-bool ${c.panel_lines ? 'checked' : ''}>Theme lines on text and picture panels</label><label>Edge lines skipped (<code>edge_skip</code>)<input type="text" data-field="edge_skip" value="${esc(c.edge_skip ?? '')}" placeholder="seams, floors, ceilings, texts, images" data-key="des"></label></div>
<div class="row"><label class="check"><input type="checkbox" data-field="pins" data-bool data-default-true ${c.pins !== false ? 'checked' : ''}>Room pins on the model</label><label class="check"><input type="checkbox" data-field="labels" data-bool ${c.labels ? 'checked' : ''}>Pins always show the room's name</label><label class="check"><input type="checkbox" data-field="keep_panel" data-bool ${c.keep_panel ? 'checked' : ''}>A tap outside the rooms keeps the panel open</label></div>
<div class="row"><label>Panel opacity: <span data-unit="">${Math.round(Number(c.panel_opacity ?? 0.55) * 100)}%</span><input type="range" min="0.2" max="0.95" step="0.05" data-field="panel_opacity" data-num data-pct value="${esc(c.panel_opacity ?? 0.55)}" data-key="dpo"></label></div>
<div class="row"><label class="check"><input type="checkbox" data-field="tint_on" data-bool ${c.tint_on ? 'checked' : ''}>Tint the floor of rooms with something on (the lamps show it themselves)</label><label class="check"><input type="checkbox" data-field="sensor_tiles" data-bool ${c.sensor_tiles ? 'checked' : ''}>Sensors as tiles (instead of a line of readings under the room's name)</label></div>
<div class="row"><label class="check"><input type="checkbox" data-field="brightness_slider" data-bool data-default-true ${c.brightness_slider !== false ? 'checked' : ''}>Brightness slider</label><label class="check"><input type="checkbox" data-field="white_slider" data-bool data-default-true ${c.white_slider !== false ? 'checked' : ''}>Warmth slider</label><label>Colour swatches<select data-field="color_swatches" data-key="dcs"><option value="" ${c.color_swatches === undefined ? 'selected' : ''}>Unless guest mode is on</option><option value="true" ${c.color_swatches === true ? 'selected' : ''}>Always</option><option value="false" ${c.color_swatches === false ? 'selected' : ''}>Never</option></select></label>${sel('color_control', 'Colour control', [['', 'Swatches'], ['slider', 'Hue slider'], ['both', 'Slider with the swatches as presets']], c.color_control || '', 'dcc')}</div>
<label class="check"><input type="checkbox" data-field="guest_mode" data-bool data-default-true ${c.guest_mode !== false ? 'checked' : ''}>Guest mode: locks can only be locked, garage doors and gates only closed, alarms are read-only, TV volume is capped</label>
<div class="row"><label>Guest mode follows this switch (optional)<input type="text" list="f3r-entities" data-field="guest_mode_entity" value="${esc(c.guest_mode_entity || '')}" placeholder="input_boolean.guest_mode" data-key="dge"></label><label>Thermostats in guest mode<select data-field="guest_thermostat" data-key="dgt">${[['', 'Setpoint and power'], ['setpoint', 'Setpoint only'], ['view', 'View only'], ['full', 'Everything']].map(([v, t]) => `<option value="${v}" ${(c.guest_thermostat || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
<div class="row"><label>Max volume (0–1)<input type="number" min="0" max="1" step="0.05" data-field="max_volume" data-num value="${esc(c.max_volume ?? '')}" placeholder="${c.guest_mode !== false ? '0.6' : '1'}" data-key="dv"></label><label>Thermostat min<input type="number" data-field="temperature_range.0" data-num value="${esc(c.temperature_range?.[0] ?? '')}" data-key="dmin"></label><label>Thermostat max<input type="number" data-field="temperature_range.1" data-num value="${esc(c.temperature_range?.[1] ?? '')}" data-key="dmax"></label></div>
<p class="note">A single tap on a floor, a wall or a piece of furniture selects the room. A tap on a lamp (an object bound to a light or a gesture) does what is set above. Other dashboards can open a model or a room with <code>#model=garage&amp;room=bay</code> in the URL. A dashboard is not a security boundary: give guests a non-admin Home Assistant user.</p>`;
  }

  // ---- events ------------------------------------------------------------------------------
  private _events(): void {
    const root = this.shadowRoot!;
    root.addEventListener('toggle', (e) => {
      const d = e.target as HTMLDetailsElement;
      if (d.dataset?.section) this._open[d.dataset.section] = d.open;
      if (d.dataset?.room !== undefined) { const id = this._config.rooms[Number(d.dataset.room)]?.id; if (id) d.open ? this._roomOpen.add(id) : this._roomOpen.delete(id); }
    }, true);
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'detect-sensors') { this._detectSensors = t.checked; return; }
      if (t.id === 'keep-refs') { this._keep = t.checked; this._render(); return; }
      if (t.id === 'model-target') { this._target = Number(t.value) || 0; this._render(); return; }
      if (t.dataset?.modelField) { this._modelField(t); return; }
      this._field(t);
    });
    root.addEventListener('input', (e) => { const el = e.target as HTMLInputElement; if (el.type !== 'range') return; const u = el.closest('label')?.querySelector('[data-unit]'); if (u) u.textContent = el.dataset.pct !== undefined ? `${Math.round(Number(el.value) * 100)}%` : el.value; });
    root.addEventListener('keydown', (e) => { const t = e.target as HTMLElement; if ((e as KeyboardEvent).key === 'Enter' && t.id?.match(/^(ent-|floor-)/)) { e.preventDefault(); (t.closest('.row')?.querySelector('button') as HTMLButtonElement | null)?.click(); } });
    root.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null; if (b && !b.disabled) this._act(b.dataset.act as string, b.dataset as any); });
  }
  private _modelField(el: HTMLInputElement): void {
    const list = this._models(), i = Number(el.dataset.i), m = list[i]; if (!m) return;
    if (el.dataset.modelField === 'name') { const name = el.value.trim() || `Model ${i + 1}`; const oldId = m.id; m.name = name; m.id = slug(name, new Set(list.filter((x) => x !== m).map((x) => x.id))); this._config.rooms.forEach((r: Room) => { if (r.model === oldId) r.model = m.id; }); if (this._used.has(i)) { /* keep */ } }
    if (el.dataset.modelField === 'width') m.width = el.value === '' ? undefined : Number(el.value);
    this._setModels(list);
    this._emit();
  }
  private _field(el: HTMLInputElement): void {
    const path = el.dataset?.field; if (!path) return;
    let value: any = el.dataset.bool !== undefined ? el.checked : el.value;
    if (el.dataset.num !== undefined) value = value === '' ? undefined : Number(value);
    if (typeof value === 'string') value = value.trim();
    if (path === 'color_swatches') value = value === 'true' ? true : value === 'false' ? false : undefined;
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
      const f = this._found![i], list = this._models(), t = Math.min(this._target, list.length - 1), m = list[t];
      m.card = clone(this._keep ? f.raw : f.card);
      if (list.length > 1 && f.model && /^Model \d+$/.test(m.name)) { m.name = f.model; m.id = slug(m.name, new Set(list.filter((x) => x !== m).map((x) => x.id))); }
      this._used.set(t, i);
      this._setModels(list);
      if (!c.theme && f.card.look?.theme && THEMES.some((th) => th.key === String(f.card.look.theme).toLowerCase())) c.theme = String(f.card.look.theme).toLowerCase();
      this._objects.delete(m.id);
      this._emit();
      // the preview card reloads the model; ask for its objects when it is ready
      clearTimeout(this._detectTimer);
      this._detectTimer = setTimeout(() => window.dispatchEvent(new CustomEvent(ROOMS_EDITOR_EVENT, { detail: { request: 'objects' } })), 4000);
      return;
    }
    if (act === 'model-edit') { this._editing = this._editing === i ? null : i; this._render(); return; }
    if (act === 'model-add') {
      const list = this._models(); const n = list.length + 1;
      list.push({ id: slug(`model-${n}`, new Set(list.map((m) => m.id))), name: `Model ${n}`, card: undefined });
      this._target = list.length - 1;
      this._setModels(list); this._emit();
      if (!this._found) this._scan();
      return;
    }
    if (act === 'model-remove') {
      const list = this._models(); const [gone] = list.splice(i, 1);
      c.rooms = rooms.filter((r) => (r.model || gone.id) !== gone.id || list.length === 0);
      this._used.delete(i); this._target = 0;
      this._setModels(list); this._emit(); return;
    }
    if (act === 'theme') { c.theme = d.theme; if (c.theme === 'neon') delete c.theme; this._emit(); return; }
    if (act === 'room-add') { const id = slug('room', new Set(rooms.map((r) => r.id))); const room: Room = { id, name: 'New room', floors: [], entities: [] }; const list = this._models(); if (list.length > 1) room.model = list[Math.min(this._target, list.length - 1)].id; rooms.push(room); this._roomOpen.add(id); this._emit(); return; }
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
    try { this._found = await scanDashboards(this._hass, new Set(['floor3d'])); }
    catch { this._found = []; }
    finally { this._scanning = false; }
    this._render();
  }

  // ---- detection, by the preview card -----------------------------------------------------
  private _detect(): void {
    this._busy = 'detect'; this._msg = {}; this._render();
    const models = this._models().filter((m) => m.card?.objfile);
    this._detectLeft = models.map((m) => m.id);
    models.forEach((m, n) => setTimeout(() => window.dispatchEvent(new CustomEvent(ROOMS_EDITOR_EVENT, { detail: { request: 'detect', sensors: this._detectSensors, model: m.id } })), n * 150));
    clearTimeout(this._detectTimer);
    this._detectTimer = setTimeout(() => { if (this._busy === 'detect') { this._busy = null; this._msg = { rooms: ['err', 'No answer from the preview: is the model still loading? Try again in a moment.'] }; this._render(); } }, 15000);
  }
  private _fromPreview(detail: any): void {
    if (!detail) return;
    if (detail.objects) { this._objects.set(detail.model || 'model', detail.objects); if (this._busy !== 'detect') this._render(); }
    if (this._busy !== 'detect') return;
    if (detail.error) { this._busy = null; this._msg = { rooms: ['err', detail.error] }; this._render(); return; }
    if (!detail.rooms) return;
    const models = this._models(), many = models.length > 1;
    const modelId: string = detail.model && models.some((m) => m.id === detail.model) ? detail.model : models[0].id;
    const proposed: Room[] = detail.rooms;
    const mine = (r: Room) => (r.model || models[0].id) === modelId;
    const existing = new Map<string, Room>(this._config.rooms.filter(mine).map((r: Room) => [JSON.stringify(r.floors || []), r]));
    const taken = new Set<string>(this._config.rooms.filter((r: Room) => !mine(r)).map((r: Room) => r.id));
    const merged = proposed.map((p) => {
      const keep = existing.get(JSON.stringify(p.floors || []));
      const room: Room = keep ? { ...keep, entities: keep.entities?.length ? keep.entities : p.entities } : p;
      room.id = slug(room.id || room.name || 'room', taken); taken.add(room.id);
      if (many) room.model = modelId; else delete room.model;
      return room;
    }).concat(this._config.rooms.filter((r: Room) => mine(r) && !(r.floors || []).length));
    // this model's rooms are replaced in place; the other models' rooms stay where they are
    const others = this._config.rooms.filter((r: Room) => !mine(r));
    this._config.rooms = many ? [...others.filter((r: Room) => models.findIndex((m) => m.id === r.model) < models.findIndex((m) => m.id === modelId)), ...merged, ...others.filter((r: Room) => models.findIndex((m) => m.id === r.model) > models.findIndex((m) => m.id === modelId))] : merged;
    this._detectLeft = this._detectLeft.filter((id) => id !== modelId);
    if (!proposed.length) this._msg = { rooms: ['warn', `No room_N_1 floor objects found${many ? ` on ${models.find((m) => m.id === modelId)?.name}` : ''}. Add rooms by hand and pick their floor objects.`] };
    if (this._detectLeft.length) { this._render(); return; }
    clearTimeout(this._detectTimer);
    this._busy = null;
    const ents = this._config.rooms.reduce((n: number, r: Room) => n + (r.entities?.length || 0), 0);
    if (this._config.rooms.length) this._msg = { rooms: ['', `Found ${this._config.rooms.filter((r: Room) => (r.floors || []).length).length} rooms and placed ${ents} of the card's entities in them.`] };
    this._open.rooms = true;
    this._emit();
  }
}

if (!customElements.get('floor3dx-rooms-card-editor')) customElements.define('floor3dx-rooms-card-editor', Floor3dxRoomsCardEditor);
