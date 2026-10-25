// floor3dx-rooms-card: the live 3D model of floor3dx-card with the room layer of
// floor3d-snapshot-card on top. A floor3dx (or floor3d / floor3dpro) card configuration is embedded
// as it is, so every binding keeps working: lamps, text frames, pictures, shades, doors, fans. Over
// the model: the rooms found on the plan, tinted when selected or when something in them is on,
// a pin per room, and a translucent panel of simple controls for the selected room, in the
// colours of the chosen theme. The card is meant to fill a panel view. Several models (a house
// and a garage) can share one card (`models:`), each in its own view, with a switcher.
import * as THREE from 'three';
import { THEMES, RoomsTheme, themeOf, stageOfCard, rgb } from './themes';
import { Room, RoomEntity, RoomIndex, suggestRooms, floorCandidates, slug } from './rooms';
import { Tiles, TilesHost, CSS_TILES, isOn, esc, domainOf, titleCase, icon, ACTIVE_DOMAINS, OFFABLE } from './tiles';
import { tokenRoles } from './references';

export const ROOMS_EDITOR_EVENT = 'floor3dx-rooms-editor';
export const ROOMS_PREVIEW_EVENT = 'floor3dx-rooms-preview';
/** `window.dispatchEvent(new CustomEvent('floor3dx-rooms-select', {detail: {model: 'garage', room: 'bay'}}))` opens a model or a room from outside the card; `#model=garage&room=bay` in the URL does the same. */
export const ROOMS_SELECT_EVENT = 'floor3dx-rooms-select';
// the card editor's content is capped at calc(100vh - 209px) on wide screens, the preview adds 8px
// of padding and hui-card 16px; this fills the preview column instead of leaving the space below empty
const PREVIEW_HEIGHT = 'calc(100vh - 235px)';
const EMBEDDED_TAG = 'floor3dpro-card'; // renamed to floor3dx-card by the build, like every element name
const ALL = 'all';
const READOUT_DOMAINS = new Set(['sensor', 'binary_sensor']);
/** Row types of the embedded card whose double tap runs an action; a `camera` row is a room's popup button, not a control. */
const TAP_TYPES = new Set(['light', 'gesture']);

const STYLE = `
:host{display:block;position:relative;height:var(--f3r-height,60vh);min-height:240px;--f3r-ink:#eef2f7;--f3r-muted:rgba(238,242,247,.72);--f3r-stage:7,15,31;--f3r-accent:255,140,58;--f3r-on:255,193,7;--f3r-line:rgba(255,255,255,.16);--f3r-alpha:.55;--f3r-panel:rgba(var(--f3r-stage),var(--f3r-alpha));--f3r-blur:14px;font-family:var(--paper-font-body1_-_font-family,Roboto,sans-serif);color:var(--f3r-ink)}
:host(.light){--f3r-ink:#1b2430;--f3r-muted:rgba(27,36,48,.7);--f3r-line:rgba(0,0,0,.14);--f3r-alpha:.6}
*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;color:inherit}button:disabled{cursor:default;opacity:.45}button:focus-visible,input:focus-visible{outline:2px solid rgb(var(--f3r-accent));outline-offset:2px}ha-icon{width:22px;height:22px;flex:none;color:inherit;--mdc-icon-size:22px}
.stage{position:absolute;inset:0;overflow:hidden;background:rgb(var(--f3r-stage))}
.stage > .models{position:absolute;inset:0;display:flex;flex-direction:row;gap:var(--f3r-gap,14px)}
.stage > .models.column{flex-direction:column}
.stage > .models > .model{position:relative;flex:1 1 0;min-width:0;min-height:0}
.stage > .models > .model[hidden]{display:none}
.stage > .models.many.lined > .model + .model:not([hidden])::before{content:"";position:absolute;left:calc(var(--f3r-gap,14px) / -2);top:8%;bottom:8%;border-left:1px solid var(--f3r-line);pointer-events:none}
.stage > .models.many.lined.column > .model + .model:not([hidden])::before{left:8%;right:8%;top:calc(var(--f3r-gap,14px) / -2);bottom:auto;border-left:0;border-top:1px solid var(--f3r-line)}
.stage > .models > .model > .caption{position:absolute;z-index:2;left:12px;bottom:10px;padding:3px 9px;border-radius:9px;background:var(--f3r-panel);color:var(--f3r-muted);font-size:12px;pointer-events:none;display:none}
.stage > .models.many > .model > .caption{display:block}
.stage > .models > .model ::part(card),.stage > .models > .model floor3dpro-card{display:block;width:100%;height:100%}
.ui{position:absolute;inset:0;pointer-events:none}
.ui > *{pointer-events:auto}
.title{position:absolute;left:14px;top:12px;display:flex;align-items:center;gap:10px;padding:8px 14px 8px 12px;border-radius:14px;background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));border:1px solid var(--f3r-line);font-size:15px;font-weight:500;letter-spacing:-.2px}
.title small{color:var(--f3r-muted);font-weight:400;font-size:12px}
.menu{position:absolute;right:14px;top:12px;display:flex;gap:8px;align-items:flex-start}
.menu button,.panelhead .close{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;min-width:38px;padding:0 10px;border-radius:12px;border:1px solid var(--f3r-line);background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));font-size:13px}
.menu button[aria-pressed=true]{border-color:rgba(var(--f3r-accent),.6);color:rgb(var(--f3r-accent))}
.menu .seg{display:inline-flex;border-radius:12px;border:1px solid var(--f3r-line);background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));overflow:hidden}
.menu .seg button{border:0;border-radius:0;background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;min-width:44px}
.menu .seg button[aria-pressed=true]{background:rgba(var(--f3r-accent),.18)}
.menu .seg button + button{border-left:1px solid var(--f3r-line)}
.list{position:absolute;z-index:3;right:14px;top:58px;max-height:calc(100% - 80px);overflow:auto;padding:6px;border-radius:14px;background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));border:1px solid var(--f3r-line);display:flex;flex-direction:column;gap:2px;min-width:200px}
.list button{display:flex;align-items:center;gap:10px;padding:8px 10px;border:0;border-radius:10px;background:transparent;text-align:left;font-size:14px}
.list button[aria-pressed=true]{background:rgba(var(--f3r-accent),.18);color:rgb(var(--f3r-accent))}
.list .n{margin-left:auto;font-size:12px;color:var(--f3r-muted)}
.list .group{padding:8px 10px 2px;font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:var(--f3r-muted)}
.pins{position:absolute;inset:0;pointer-events:none}
.pin{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:5px;height:30px;min-width:30px;padding:0 6px;border-radius:15px;border:1px solid var(--f3r-line);background:var(--f3r-panel);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:var(--f3r-muted);font-size:12px;font-weight:500;white-space:nowrap;pointer-events:auto;opacity:.92;transition:opacity .2s}
.pin ha-icon{width:17px;height:17px;--mdc-icon-size:17px}.pin .pn{display:none;padding-right:2px}
.pin.on{color:rgb(var(--f3r-on));border-color:rgba(var(--f3r-on),.5)}
.pin[aria-pressed=true]{background:rgb(var(--f3r-accent));border-color:rgb(var(--f3r-accent));color:#fff;z-index:2}
.pin[aria-pressed=true] .pn,.pin.hover .pn,:host(.labels) .pin .pn{display:inline}
.pin[hidden]{display:none}
.pin .count{position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;border-radius:8px;background:rgb(var(--f3r-on));color:#1b1b1b;font-size:10px;line-height:16px;text-align:center;padding:0 4px;font-weight:600}
.panel{position:absolute;top:60px;right:14px;max-height:calc(100% - 74px);width:min(340px,calc(100% - 28px));display:flex;flex-direction:column;border-radius:18px;background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));border:1px solid var(--f3r-line);box-shadow:0 10px 40px rgba(0,0,0,.25);overflow:hidden;animation:f3r-in .18s ease}
@keyframes f3r-in{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
:host(.narrow) .panel{top:auto;left:10px;right:10px;bottom:10px;width:auto;max-height:58%;animation-name:f3r-up}
/* phones: the title keeps to half the width, the Rooms button is an icon, the model switcher drops to a second row on the right */
:host(.narrow) .title{max-width:48%}:host(.narrow) .title span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
:host(.narrow) .menu{flex-wrap:wrap;justify-content:flex-end;max-width:calc(52% - 14px)}
:host(.narrow) .menu > button span{display:none}:host(.narrow) .menu > button{padding:0 8px}
:host(.narrow) .menu::before{content:"";order:8;flex-basis:100%;height:0}
:host(.narrow) .menu .seg{order:9}
:host(.narrow.models) .list{top:104px;max-height:calc(100% - 126px)}
@keyframes f3r-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.panelhead{flex:none;display:flex;gap:12px;align-items:center;padding:14px 14px 10px}.roomicon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:rgba(var(--f3r-accent),.16);color:rgb(var(--f3r-accent))}
.panelhead h3{margin:0 0 2px;font-size:18px;font-weight:500}.panelhead p{margin:0;color:var(--f3r-muted);font-size:12px}.panelhead .grow{flex:1;min-width:0}
.readouts{flex:none;margin:0;padding:0 14px 10px;color:var(--f3r-ink);font-size:12px;display:flex;flex-wrap:wrap;gap:2px 0;line-height:1.5}.readouts em{font-style:normal;color:var(--f3r-muted)}.readouts span+span:before{content:"·";margin:0 6px;color:var(--f3r-muted)}.readouts .alert{color:rgb(var(--f3r-on))}
.tiles{display:grid;grid-template-columns:1fr;gap:8px;padding:4px 12px 12px;overflow:auto;flex:0 1 auto;min-height:0;align-content:start;grid-auto-rows:max-content}
:host(.narrow) .tiles{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
.tile.focus{box-shadow:0 0 0 2px rgb(var(--f3r-accent));transition:box-shadow .3s}
${CSS_TILES}
.foot{flex:none;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 12px 12px}.quiet{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:4px 12px;border:1px solid var(--f3r-line);border-radius:11px;background:transparent;color:var(--f3r-muted);font-size:12px}.quiet ha-icon{width:16px;height:16px;--mdc-icon-size:16px}
.empty{padding:14px;color:var(--f3r-muted);font-size:13px;line-height:1.5}
.toast{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);max-width:calc(100% - 32px);border:1px solid var(--f3r-line);border-radius:14px;background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));padding:10px 16px;font-size:13px}
.hint{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);padding:6px 12px;border-radius:12px;background:var(--f3r-panel);color:var(--f3r-muted);font-size:12px;pointer-events:none}
`;

interface Tint { mesh: THREE.Mesh; room: Room }
/** One model of the card: its embedded floor3dx card, the rooms on it and their tints. */
interface Slot {
  id: string;
  name: string;
  width: number;
  card: any;
  key: string; // the embedded configuration, to tell a change
  host: HTMLElement;
  el: any; // the floor3dx-card element
  index: RoomIndex | null;
  tints: Tint[];
  home: { position: THREE.Vector3; target: THREE.Vector3 } | null;
  poll: any;
}
export interface ModelDef { id: string; name: string; width: number; card: any }

/** The models of a configuration: `models:` or the single `card:`. */
export function modelDefs(config: any): ModelDef[] {
  if (Array.isArray(config?.models) && config.models.length) {
    const taken = new Set<string>();
    return config.models.map((m: any, i: number) => {
      const name = (m && typeof m.name === 'string' && m.name) || `Model ${i + 1}`;
      const id = slug((m && m.id) || name, taken); taken.add(id);
      return { id, name, width: Number(m?.width) || 0, card: m?.card };
    });
  }
  return config?.card ? [{ id: 'model', name: config.title || 'Model', width: 0, card: config.card }] : [];
}

export class Floor3dxRoomsCard extends HTMLElement {
  static getConfigElement(): HTMLElement {
    return document.createElement('floor3dx-rooms-card-editor');
  }
  static getStubConfig(): any {
    return { theme: 'neon', rooms: [] };
  }

  public preview = false;
  private _config: any;
  private _hass: any;
  private _theme: RoomsTheme = themeOf('neon');
  private _slots: Slot[] = [];
  private _active = ALL; // a model id, or every model
  private _room: string | null = null;
  private _hover: string | null = null;
  private _listOpen = false;
  private _viewsOpen = false;
  private _focus: string | null = null; // an entity whose tile is highlighted (object_tap: panel)
  private _focusTimer: any;
  private _busy = new Set<string>();
  private _seq = new Set<string>();
  private _confirm: { entity: string; text: string } | null = null;
  private _confirmTimer: any;
  private _tiles: Tiles;
  private _toast = '';
  private _toastTimer: any;
  private _queued = false;
  private _pointer = false;
  private _held = false;
  private _pt: any;
  private _down: { x: number; y: number; t: number } | null = null;
  private _pinFrame = 0;
  private _pinUntil = 0;
  private _flight = 0;
  private _ro: ResizeObserver | null = null;
  private _root: ShadowRoot;
  private _ui!: HTMLElement;
  private _modelsHost!: HTMLElement;
  private _onEditor = (e: Event) => this._editorRequest((e as CustomEvent).detail);
  private _onSelect = (e: Event) => this._fromOutside((e as CustomEvent).detail);
  private _onHash = () => this._fromHash();

  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this._root.appendChild(style);
    const stage = document.createElement('div');
    stage.className = 'stage';
    this._modelsHost = document.createElement('div');
    this._modelsHost.className = 'models';
    this._ui = document.createElement('div');
    this._ui.className = 'ui';
    stage.appendChild(this._modelsHost);
    stage.appendChild(this._ui);
    this._root.appendChild(stage);
    this._ui.addEventListener('click', (e) => this._click(e));
    this._ui.addEventListener('change', (e) => this._change(e));
    this._ui.addEventListener('input', (e) => this._input(e));
    this._ui.addEventListener('pointerdown', () => { this._pointer = true; clearTimeout(this._pt); this._pt = setTimeout(() => this._release(), 1500); });
    this._ui.addEventListener('pointerup', () => this._release());
    this._ui.addEventListener('pointercancel', () => this._release());
    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { this._layout(); this._movePins(0); }) : null;
    const card = this;
    const host: TilesHost = {
      get hass() { return card._hass; },
      get config() { return card._config || {}; },
      busy: this._busy, seq: this._seq,
      get confirm() { return card._confirm; },
      request: () => this._request(),
      call: (id, domain, service, data) => this._call(id, domain, service, data),
      showToast: (t) => this._showToast(t),
      entityConfig: (id) => this._entityConfig(id),
      setConfirm: (c) => { this._confirm = c; clearTimeout(this._confirmTimer); if (c) this._confirmTimer = setTimeout(() => { this._confirm = null; this._request(); }, 3500); this._request(); },
    };
    this._tiles = new Tiles(host);
  }

  setConfig(config: any): void {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    const rooms: Room[] = Array.isArray(config.rooms) ? config.rooms : [];
    const ids = rooms.map((r) => r.id);
    if (new Set(ids).size !== ids.length) throw new Error('Room ids must be unique');
    this._config = { guest_mode: true, pins: true, ...config, rooms };
    this._theme = themeOf(config.theme);
    if (this._theme.key === 'off') {
      // the model as it is: the overlay takes the embedded card's own stage colour
      const stage = stageOfCard(modelDefs(this._config)[0]?.card);
      if (stage) { const lum = parseInt(stage.slice(1), 16); const l = (0.2126 * ((lum >> 16) & 255) + 0.7152 * ((lum >> 8) & 255) + 0.0722 * (lum & 255)) / 255; this._theme = { ...this._theme, stage, light: l > 0.5, edges: l > 0.5 ? '#1b2430' : '#ffffff' }; }
    }
    if (this._room && !ids.includes(this._room)) this._room = null;
    const defs = modelDefs(this._config);
    if (defs.length > 1 && (this._active === ALL || !defs.some((d) => d.id === this._active)) && !this._slots.length) this._active = defs[0].id;
    if (defs.length <= 1) this._active = ALL;
    this._applyTheme();
    this._mountModels();
    this._request();
  }
  set hass(hass: any) {
    const old = this._hass;
    this._hass = hass;
    this._slots.forEach((s) => { if (s.el) s.el.hass = hass; });
    if (!old || this._roomEntities().some((id) => old.states[id] !== hass.states[id])) { this._paintTints(); this._request(); }
  }
  get hass(): any { return this._hass; }
  getCardSize(): number { return 12; }
  getGridOptions(): any { return { columns: 'full', rows: 'auto' }; }

  connectedCallback(): void {
    this._ro?.observe(this);
    this._layout();
    this._mountModels();
    window.addEventListener(ROOMS_EDITOR_EVENT, this._onEditor);
    window.addEventListener(ROOMS_SELECT_EVENT, this._onSelect);
    window.addEventListener('hashchange', this._onHash);
    this._fromHash();
    this._request();
  }
  disconnectedCallback(): void {
    this._ro?.disconnect();
    this._slots.forEach((s) => clearInterval(s.poll));
    clearTimeout(this._pt); clearTimeout(this._toastTimer); clearTimeout(this._confirmTimer); clearTimeout(this._focusTimer);
    cancelAnimationFrame(this._pinFrame); this._pinFrame = 0;
    cancelAnimationFrame(this._flight); this._flight = 0;
    window.removeEventListener(ROOMS_EDITOR_EVENT, this._onEditor);
    window.removeEventListener(ROOMS_SELECT_EVENT, this._onSelect);
    window.removeEventListener('hashchange', this._onHash);
  }

  // the first model's parts, for the harness and for anyone who poked at 2.4's internals
  get _embedded(): any { return this._slots[0]?.el || null; }
  get _modelHost(): HTMLElement | null { return this._slots[0]?.host || null; }
  get _index(): RoomIndex | null { return this._slots[0]?.index || null; }
  get _tints(): Tint[] { return this._slots.flatMap((s) => s.tints); }

  // ---- layout and theme --------------------------------------------------------------------
  private _layout(): void {
    const rect = this.getBoundingClientRect();
    if (rect.width) this.classList.toggle('narrow', rect.width < 700);
    const h = this._config?.height;
    if (h) this.style.setProperty('--f3r-height', typeof h === 'number' ? h + 'px' : String(h));
    else this.style.setProperty('--f3r-height', this._inPanel() ? 'calc(100vh - var(--header-height, 56px))' : this._isPreview() && this._wideEditor() ? PREVIEW_HEIGHT : '60vh');
    // every model, side by side or stacked: as configured, else by the card's shape
    const layout = this._config?.layout;
    const column = layout === 'column' || (layout !== 'row' && rect.width && rect.height && rect.height > rect.width);
    this._modelsHost.classList.toggle('column', !!column);
    const shownCount = this._slots.filter((s) => this._active === ALL || s.id === this._active).length;
    this._modelsHost.classList.toggle('many', shownCount > 1 && this._config?.model_labels !== false && this._config?.model_labels !== 'no');
    // the hairline belongs to a theme; with the model as it is, the gap alone separates the views
    this._modelsHost.classList.toggle('lined', this._theme.key !== 'off');
    const gap = Number(this._config?.models_gap);
    if (Number.isFinite(gap) && gap >= 0) this._modelsHost.style.setProperty('--f3r-gap', gap + 'px'); else this._modelsHost.style.removeProperty('--f3r-gap');
    this._slots.forEach((s) => {
      const shown = this._active === ALL || s.id === this._active;
      if (s.host.hidden !== !shown) s.host.hidden = !shown;
      s.host.style.flex = s.width > 0 && this._active === ALL ? `${s.width} 1 0` : '1 1 0';
    });
  }
  /** The card editor puts the preview beside the editor from 1000px; below that it sits above it. */
  private _wideEditor(): boolean { return typeof window !== 'undefined' && window.innerWidth >= 1000; }
  private _inPanel(): boolean {
    let node: any = this;
    for (let i = 0; i < 20 && node; i++) {
      if (node.tagName === 'HUI-PANEL-VIEW') return true;
      if (node.tagName === 'HUI-CARD' && node.hasAttribute && node.hasAttribute('preview')) return false;
      node = node.parentElement || (node.getRootNode && (node.getRootNode() as any).host);
    }
    return false;
  }
  private _applyTheme(): void {
    const t = this._theme;
    this.classList.toggle('light', t.light);
    this.classList.toggle('labels', this._config.labels === true || this._config.labels === 'yes');
    this.style.setProperty('--f3r-stage', rgb(t.panel || t.stage));
    // the accent is the theme's line colour when it contrasts with the stage; otherwise plain
    const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
    const accent = t.accent || (Math.abs(lum(t.edges) - lum(t.stage)) > 0.3 ? t.edges : t.light ? '#1b2430' : '#eef2f7');
    this.style.setProperty('--f3r-accent', rgb(this._config.accent || accent));
    const alpha = Number(this._config.panel_opacity);
    if (Number.isFinite(alpha) && alpha >= 0 && alpha <= 1) this.style.setProperty('--f3r-alpha', String(alpha)); else this.style.removeProperty('--f3r-alpha');
  }

  // ---- the embedded floor3dx cards --------------------------------------------------------
  private _slotOf(room: Room | undefined): Slot | undefined {
    if (!room) return undefined;
    return this._slots.find((s) => s.id === (room.model || this._slots[0]?.id)) || this._slots[0];
  }
  private _slotRooms(slot: Slot): Room[] { return (this._config.rooms as Room[]).filter((r) => this._slotOf(r) === slot); }
  private _embeddedConfig(def: ModelDef, firstId: string): any {
    const src = def.card && typeof def.card === 'object' ? def.card : null;
    if (!src || typeof src.objfile !== 'string') return null;
    const cfg: any = JSON.parse(JSON.stringify(src));
    cfg.type = 'custom:' + EMBEDDED_TAG;
    cfg.style = 'height:100%;width:100%;margin:0;padding:0;border:0;border-radius:0;overflow:hidden;position:relative;';
    cfg.header = 'no';
    cfg.click = 'no';
    cfg.selectionMode = 'no';
    cfg.editModeNotifications = 'no';
    cfg.stencil = 'yes'; // the room tints use the stencil buffer
    if (this._theme.look) {
      cfg.look = JSON.parse(JSON.stringify(this._theme.look));
      // no theme lines on the text and picture panels unless asked; `edge_skip` replaces the list
      const skip = this._config.edge_skip !== undefined && this._config.edge_skip !== '' ? this._config.edge_skip : this._config.panel_lines === true || this._config.panel_lines === 'yes' ? 'seams, floors, ceilings' : 'seams, floors, ceilings, texts, images';
      cfg.look.edge_skip = skip;
    } // theme off: the card's own look, if it has one, stays
    // in the editor's preview every floor must be a separate object, so detection finds them all
    if (this._isPreview()) cfg.merge_static = 'no';
    // the rooms' floors must stay separate objects (tints, taps); reservedNames() reads every
    // string in the configuration, so listing them here keeps merge_static off them
    cfg.f3dx_rooms_floors = (this._config.rooms as Room[]).filter((r) => (r.model || firstId) === def.id).flatMap((r) => r.floors || []);
    return cfg;
  }
  private _mountModels(): void {
    if (!this.isConnected || !this._config) return;
    const defs = modelDefs(this._config);
    const next: Slot[] = [];
    for (const def of defs) {
      const cfg = this._embeddedConfig(def, defs[0].id);
      const key = cfg ? JSON.stringify(cfg) : '';
      const old = this._slots.find((s) => s.id === def.id);
      if (old && old.key === key) { old.name = def.name; old.width = def.width; old.card = def.card; const cap = old.host.querySelector(':scope > .caption'); if (cap) cap.textContent = def.name; next.push(old); continue; }
      if (old) this._dropSlot(old);
      const host = document.createElement('div');
      host.className = 'model';
      host.dataset.model = def.id;
      const caption = document.createElement('div'); caption.className = 'caption'; caption.textContent = def.name; host.appendChild(caption);
      const slot: Slot = { id: def.id, name: def.name, width: def.width, card: def.card, key, host, el: null, index: null, tints: [], home: null, poll: null };
      this._listen(slot);
      if (cfg) {
        const el: any = document.createElement(EMBEDDED_TAG);
        el.style.cssText = 'display:block;width:100%;height:100%';
        host.appendChild(el);
        try { el.setConfig(cfg); slot.el = el; } catch (err) { this._toast = `Model configuration: ${(err as Error).message}`; el.remove(); }
        if (slot.el) {
          if (this._hass) el.hass = this._hass;
          slot.poll = setInterval(() => { if (el._modelready) { clearInterval(slot.poll); this._onModelReady(slot); } }, 200);
        }
      }
      next.push(slot);
    }
    this._slots.filter((s) => !next.includes(s)).forEach((s) => this._dropSlot(s));
    this._slots = next;
    // hosts in the configured order
    this._slots.forEach((s) => this._modelsHost.appendChild(s.host));
    this._layout();
    this._request();
  }
  private _dropSlot(s: Slot): void {
    clearInterval(s.poll);
    s.tints.forEach((t) => { t.mesh.parent?.remove(t.mesh); (t.mesh.material as THREE.Material).dispose(); });
    s.host.remove();
  }
  private _listen(slot: Slot): void {
    const host = slot.host;
    // taps on the model: a short press that did not move is a tap (OrbitControls gets the drags)
    host.addEventListener('pointerdown', (e) => { this._down = { x: e.clientX, y: e.clientY, t: Date.now() }; this._movePins(1200); });
    host.addEventListener('pointerup', (e) => {
      const d = this._down; this._down = null;
      if (!d || Math.abs(e.clientX - d.x) > 8 || Math.abs(e.clientY - d.y) > 8 || Date.now() - d.t > 500) return;
      this._tap(e, slot);
    });
    host.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !this._down) this._hoverAt(e, slot); });
    host.addEventListener('pointerleave', () => this._setHover(null));
    host.addEventListener('wheel', () => this._movePins(600), { passive: true });
    // a double tap on a bound object would run the embedded card's action on top of the tap's:
    // swallowed unless taps leave objects to the card (object_tap: room)
    host.addEventListener('dblclick', (e) => { if (this._objectTap() !== 'room' && this._boundRow(slot, this._hits(e, slot))) e.stopPropagation(); }, true);
  }
  private _onModelReady(slot: Slot): void {
    const el = slot.el; if (!el || !el._scene) return;
    this._buildIndex(slot);
    const controls = el._controls;
    if (controls && controls.addEventListener) controls.addEventListener('change', () => this._movePins(0));
    if (el._camera && controls) slot.home = { position: el._camera.position.clone(), target: controls.target.clone() };
    this._movePins(0);
    this._request();
    if (this._isPreview()) this._toEditor({ objects: this._objectNames(slot), model: slot.id });
  }
  private _buildIndex(slot: Slot): void {
    const el = slot.el; if (!el || !el._scene) return;
    const scene: THREE.Scene = el._scene;
    slot.tints.forEach((t) => { t.mesh.parent?.remove(t.mesh); (t.mesh.material as THREE.Material).dispose(); });
    slot.tints = [];
    const rooms = this._slotRooms(slot);
    slot.index = new RoomIndex(scene, rooms);
    for (const room of rooms) {
      for (const name of room.floors || []) {
        const floor = scene.getObjectByName(name);
        floor?.traverse((m: any) => {
          if (!m.isMesh || !m.geometry) return;
          m.updateWorldMatrix(true, false);
          // adjacent floors overlap by a few centimetres in Sweet Home 3D exports; the stencil lets
          // each pixel take one tint, so the strip where two tinted rooms meet is not drawn twice
          const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
          mat.stencilWrite = true; mat.stencilRef = 1; mat.stencilFunc = THREE.NotEqualStencilFunc; mat.stencilZPass = THREE.ReplaceStencilOp;
          const mesh = new THREE.Mesh(m.geometry, mat);
          mesh.name = 'f3dx_rooms_tint';
          mesh.matrixAutoUpdate = false;
          mesh.matrix.copy(m.matrixWorld);
          mesh.renderOrder = 50;
          mesh.layers.mask = m.layers.mask;
          mesh.visible = false;
          scene.add(mesh);
          slot.tints.push({ mesh, room });
        });
      }
    }
    this._paintTints();
  }
  private _paintTints(): void {
    const on = new Set((this._config.rooms as Room[]).filter((r) => this._activeCount(r)).map((r) => r.id));
    const accent = new THREE.Color(`rgb(${getComputedStyle(this).getPropertyValue('--f3r-accent').trim() || '255,140,58'})`);
    const amber = new THREE.Color(0xffc107);
    const roomColors = this._config.room_colors === true || this._config.room_colors === 'yes';
    const tintOn = this._config.tint_on === true || this._config.tint_on === 'yes'; // the lamps show it themselves
    for (const slot of this._slots) {
      if (!slot.tints.length) continue;
      let changed = false;
      for (const t of slot.tints) {
        const mat = t.mesh.material as THREE.MeshBasicMaterial;
        let visible = false, opacity = 0, color: THREE.Color | null = null;
        if (t.room.id === this._room) { visible = true; opacity = 0.5; color = accent; }
        else if (t.room.id === this._hover) { visible = true; opacity = 0.25; color = accent; }
        else if (tintOn && on.has(t.room.id)) { visible = true; opacity = 0.4; color = amber; }
        else if (roomColors && t.room.color) { visible = true; opacity = 0.35; color = new THREE.Color(t.room.color); }
        const order = t.room.id === this._room ? 50 : t.room.id === this._hover ? 51 : 52;
        if (t.mesh.visible !== visible || mat.opacity !== opacity || (color && !mat.color.equals(color)) || t.mesh.renderOrder !== order) {
          t.mesh.visible = visible; mat.opacity = opacity; if (color) mat.color.copy(color); t.mesh.renderOrder = order; changed = true;
        }
      }
      if (changed) slot.el?._requestRender?.('rooms');
    }
  }

  // ---- the camera ---------------------------------------------------------------------------
  /** Back to the configured view, in a short flight; every model when all are shown. */
  private _resetView(): void {
    const slots = this._slots.filter((s) => s.el && s.home && (this._active === ALL || s.id === this._active));
    if (!slots.length) return;
    cancelAnimationFrame(this._flight);
    const from = slots.map((s) => ({ s, p: s.el._camera.position.clone(), t: s.el._controls.target.clone() }));
    const t0 = performance.now(), ms = 450;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      for (const { s, p, t } of from) {
        if (k < 1) { s.el._camera.position.lerpVectors(p, s.home!.position, e); s.el._controls.target.lerpVectors(t, s.home!.target, e); }
        else { s.el._camera.position.copy(s.home!.position); s.el._controls.target.copy(s.home!.target); }
        s.el._controls.update();
        s.el._requestRender?.('rooms');
      }
      this._placePins();
      this._flight = k < 1 ? requestAnimationFrame(step) : 0;
    };
    this._flight = requestAnimationFrame(step);
  }
  /** The saved views (`zoom_areas`) of the shown model, if it is the only one shown. */
  private _views(): { slot: Slot; views: any[] } | null {
    const slot = this._slots.find((s) => s.id === this._active) || (this._slots.length === 1 ? this._slots[0] : null);
    const views: any[] = slot?.el?._zoom || [];
    return slot && views.length ? { slot, views } : null;
  }
  private _gotoView(index: number): void {
    const v = this._views(); if (!v) return;
    cancelAnimationFrame(this._flight);
    v.slot.el._handleZoomClick({ stopPropagation() { /* a synthetic click */ }, target: { index } });
    this._movePins(300);
  }

  // ---- pins ------------------------------------------------------------------------------
  /** Re-place the pins now and, if `ms` > 0, keep following the camera for that long. */
  private _movePins(ms: number): void {
    this._pinUntil = Math.max(this._pinUntil, performance.now() + ms);
    if (this._pinFrame) return;
    const step = () => {
      this._pinFrame = 0;
      this._placePins();
      if (performance.now() < this._pinUntil && this.isConnected) this._pinFrame = requestAnimationFrame(step);
    };
    this._pinFrame = requestAnimationFrame(step);
  }
  private _placePins(): void {
    const layer = this._ui.querySelector('.pins') as HTMLElement | null;
    if (!layer) return;
    const host = this.getBoundingClientRect();
    const v = new THREE.Vector3();
    for (const pin of Array.from(layer.children) as HTMLElement[]) {
      const room = (this._config.rooms as Room[]).find((r) => r.id === pin.dataset.room);
      const slot = this._slotOf(room), el = slot?.el;
      if (!room || !slot || !el || !el._camera || !el._renderer || !slot.index || slot.host.hidden) { pin.hidden = true; continue; }
      const rect = (el._renderer.domElement as HTMLCanvasElement).getBoundingClientRect();
      const c = slot.index.centre(room, el._scene);
      if (!c || !rect.width) { pin.hidden = true; continue; }
      const cam: THREE.Camera = el._camera;
      cam.updateMatrixWorld();
      v.copy(c).project(cam);
      const behind = v.z > 1 || v.z < -1 || v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1;
      pin.hidden = behind;
      if (behind) continue;
      pin.style.left = `${rect.left - host.left + ((v.x + 1) / 2) * rect.width}px`;
      pin.style.top = `${rect.top - host.top + ((1 - v.y) / 2) * rect.height}px`;
    }
  }

  // ---- taps and hover --------------------------------------------------------------------
  private _hits(e: { clientX: number; clientY: number }, slot: Slot): THREE.Intersection[] {
    const el = slot.el;
    if (!el || !el._renderer || typeof el._getintersect !== 'function') return [];
    const rect = el._renderer.domElement.getBoundingClientRect();
    return el._getintersect({ offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
  }
  private _roomAt(hits: THREE.Intersection[], slot: Slot): Room | undefined {
    if (!slot.index || !hits.length) return undefined;
    const rooms = this._slotRooms(slot);
    const floorRoom = (h: THREE.Intersection) => rooms.find((r) => (r.floors || []).includes(h.object.name));
    // the floor that was tapped; or, through a wall in front of it, the floor behind (walls are
    // thin, the room is what was aimed at); else the room nearest to what was hit (a chair, a lamp)
    const first = floorRoom(hits[0]);
    if (first) return first;
    if (/^wall/i.test(hits[0].object.name)) for (const h of hits.slice(1, 6)) { const r = floorRoom(h); if (r) return r; }
    return slot.index.roomAt(hits[0].point.x, hits[0].point.z, 0.03);
  }
  /** The embedded card's entity row whose object was hit, if its double tap would act on it. */
  private _boundRow(slot: Slot, hits: THREE.Intersection[]): any | null {
    const el = slot.el, name = hits[0]?.object?.name;
    if (!el || !name || !Array.isArray(el._object_ids) || !Array.isArray(el._config?.entities)) return null;
    if (this._slotRooms(slot).some((r) => (r.floors || []).includes(name))) return null; // a room's floor is the room, whatever is bound to it
    for (let i = 0; i < el._config.entities.length; i++) {
      const row = el._config.entities[i];
      if (!row || !TAP_TYPES.has(row.type3d)) continue;
      if ((el._object_ids[i]?.objects || []).some((o: any) => o.object_id === name)) return row;
    }
    return null;
  }
  private _objectTap(): string { const v = this._config?.object_tap; return v === 'panel' || v === 'room' ? v : 'action'; }
  private _tap(e: PointerEvent, slot: Slot): void {
    const hits = this._hits(e, slot);
    const mode = this._objectTap();
    const row = mode === 'room' ? null : this._boundRow(slot, hits);
    if (row && mode === 'action') { this._runRow(row); return; } // the object's own action, the room untouched
    const room = this._roomAt(hits, slot);
    if (room) {
      this._select(room.id);
      if (row && mode === 'panel') this._focusEntity(row.entity);
    } else if (this._room && !this._config.keep_panel) this._select(null);
    this._listOpen = false; this._viewsOpen = false;
    this._request();
  }
  /** What the embedded card's double tap does for the row: toggle a light, run a gesture's service. */
  private _runRow(row: any): void {
    if (!this._hass || typeof row.entity !== 'string') return;
    const domain = row.entity.split('.')[0];
    if (row.type3d === 'light') this._hass.callService(domain, 'toggle', { entity_id: row.entity });
    else if (row.type3d === 'gesture' && row.gesture?.domain && row.gesture?.service) this._hass.callService(row.gesture.domain, row.gesture.service, { entity_id: row.entity });
  }
  private _focusEntity(id: string): void {
    this._focus = id; clearTimeout(this._focusTimer);
    this._focusTimer = setTimeout(() => { this._focus = null; this._request(); }, 4000);
  }
  private _hoverAt(e: PointerEvent, slot: Slot): void {
    const room = this._roomAt(this._hits(e, slot), slot);
    this._setHover(room ? room.id : null);
  }
  private _setHover(id: string | null): void {
    if (id === this._hover) return;
    this._hover = id;
    this._slots.forEach((s) => { s.host.style.cursor = id ? 'pointer' : ''; });
    this._ui.querySelectorAll('.pin').forEach((p) => p.classList.toggle('hover', (p as HTMLElement).dataset.room === id));
    this._paintTints();
  }
  private _select(id: string | null): void {
    this._room = id;
    this._confirm = null;
    if (id !== this._focus) this._focus = null;
    // a room of another model: show that model
    const slot = this._slotOf(this._roomOf(id));
    if (slot && this._active !== ALL && this._active !== slot.id) this._showModel(slot.id);
    this._paintTints();
    this._request();
  }
  private _showModel(id: string): void {
    if (id !== ALL && !this._slots.some((s) => s.id === id)) return;
    this._active = id;
    this._layout();
    this._movePins(400);
    this._request();
  }
  /** `{model, room}` from the select event or the URL hash. */
  private _fromOutside(detail: any): void {
    if (!detail || typeof detail !== 'object' || !this._config) return;
    if (typeof detail.model === 'string') {
      const slot = this._slots.find((s) => s.id === detail.model || s.name.toLowerCase() === detail.model.toLowerCase());
      if (slot) this._showModel(slot.id); else if (detail.model === ALL || detail.model === 'both') this._showModel(ALL);
    }
    if (typeof detail.room === 'string') {
      const room = (this._config.rooms as Room[]).find((r) => r.id === detail.room || (r.name || '').toLowerCase() === detail.room.toLowerCase());
      if (room) this._select(room.id);
    }
  }
  private _fromHash(): void {
    const hash = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
    if (!/(^|&)(model|room)=/.test(hash)) return;
    const p = new URLSearchParams(hash);
    this._fromOutside({ model: p.get('model') ?? undefined, room: p.get('room') ?? undefined });
  }

  // ---- render -----------------------------------------------------------------------------
  private _request(): void {
    if (this._queued || !this.isConnected) return;
    this._queued = true;
    requestAnimationFrame(() => {
      this._queued = false;
      if (!this.isConnected || !this._config) return;
      if (this._pointer) { this._held = true; return; }
      this._render();
    });
  }
  private _release(): void {
    clearTimeout(this._pt);
    if (!this._pointer) return;
    this._pointer = false;
    if (this._held) { this._held = false; setTimeout(() => this._request(), 60); }
  }
  private _s(id: string): any { return this._hass?.states?.[id]; }
  private _roomOf(id: string | null): Room | undefined { return (this._config.rooms as Room[]).find((r) => r.id === id); }
  private _roomEntities(): string[] { return (this._config?.rooms || []).flatMap((r: Room) => (r.entities || []).flatMap((e: any) => [e.entity, e.top_entity, e.dimmer, e.remote, this._config.guest_mode_entity].filter(Boolean))); }
  private _activeCount(room: Room): number { return (room.entities || []).filter((e) => ACTIVE_DOMAINS.has(domainOf(e.entity)) && isOn(this._s(e.entity))).length; }
  private _roomName(r: Room): string { return titleCase(r.name || r.id); }
  private _sensorTiles(): boolean { return this._config.sensor_tiles === true || this._config.sensor_tiles === 'yes'; }
  /** The room's sensors as a line of readouts: "21 °C · 48 % · Window open". */
  /** The room's sensors as a line of labelled readouts: "Temperature 21.4°C · Humidity 48% · Side door closed". */
  private _readouts(room: Room): string {
    if (this._sensorTiles()) return '';
    const out: string[] = [];
    const roomName = room.name || room.id;
    // the label: the entity's label or friendly name, without the room's own name in front of it
    const labelOf = (e: any) => { const n = this._tiles.name(e, roomName); return n.replace(new RegExp('^' + roomName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), '') || n; };
    for (const e of room.entities || []) {
      if (!READOUT_DOMAINS.has(domainOf(e.entity)) || this._tiles.hidden(e)) continue;
      const s = this._s(e.entity); if (!s || s.state === 'unavailable' || s.state === 'unknown') continue;
      const a = s.attributes || {}, dc = a.device_class || '', label = labelOf(e);
      if (domainOf(e.entity) === 'sensor') {
        const n = Number(s.state), unit = a.unit_of_measurement || '';
        const val = Number.isFinite(n) ? (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10) : titleCase(String(s.state).replace(/_/g, ' '));
        out.push(`<span><em>${esc(label)}</em> ${esc(String(val))}${unit ? (unit.startsWith('°') || unit === '%' ? '' : ' ') + esc(unit) : ''}</span>`);
      } else {
        const on = isOn(s);
        const word = /door|window|garage|opening/.test(dc) ? (on ? 'open' : 'closed') : /motion|occupancy|presence/.test(dc) ? (on ? 'motion' : 'clear') : /moisture/.test(dc) ? (on ? 'wet' : 'dry') : /smoke|gas|carbon_monoxide|safety|problem/.test(dc) ? (on ? 'alert' : 'ok') : /lock/.test(dc) ? (on ? 'unlocked' : 'locked') : /battery/.test(dc) ? (on ? 'low' : 'ok') : /connectivity/.test(dc) ? (on ? 'connected' : 'disconnected') : (on ? 'on' : 'off');
        out.push(`<span class="${on && /door|window|garage|opening|moisture|smoke|gas|carbon_monoxide|safety|problem|lock|battery/.test(dc) ? 'alert' : ''}"><em>${esc(label)}</em> ${word}</span>`);
      }
    }
    return out.length ? `<p class="readouts">${out.join('')}</p>` : '';
  }

  private _render(): void {
    const c = this._config, rooms: Room[] = c.rooms;
    const focus = (this._root.activeElement as HTMLElement | null)?.dataset?.focus;
    const scroll = (this._ui.querySelector('.tiles') as HTMLElement | null)?.scrollTop || 0;
    const room = this._roomOf(this._room);
    const hasModel = this._slots.some((s) => s.el);
    const title = c.title ? `<div class="title">${c.icon ? icon(c.icon) : ''}<span>${esc(c.title)}${c.subtitle ? `<br><small>${esc(c.subtitle)}</small>` : ''}</span></div>` : '';
    const many = this._slots.length > 1 && c.models_menu !== false && c.models_menu !== 'no';
    this.classList.toggle('models', many);
    const switcher = many ? `<div class="seg" role="group" aria-label="Model">${this._slots.map((s) => `<button data-action="model" data-model="${esc(s.id)}" aria-pressed="${this._active === s.id}">${esc(s.name)}</button>`).join('')}<button data-action="model" data-model="${ALL}" aria-pressed="${this._active === ALL}">${this._slots.length === 2 ? 'Both' : 'All'}</button></div>` : '';
    const views = this._views();
    const reset = hasModel ? (views ? `<button data-action="views" aria-pressed="${this._viewsOpen}" aria-label="Views" title="Views">${icon('mdi:camera-outline')}</button>` : `<button data-action="reset" aria-label="Reset view" title="Reset view">${icon('mdi:camera-flip-outline')}</button>`) : '';
    const menu = rooms.length || hasModel ? `<div class="menu">${switcher}${reset}${rooms.length ? `<button data-action="list" aria-pressed="${this._listOpen}" aria-label="Rooms">${icon('mdi:floor-plan')}<span>Rooms</span></button>` : ''}</div>` : '';
    const roomButton = (r: Room) => { const n = this._activeCount(r); return `<button data-action="room" data-room="${esc(r.id)}" aria-pressed="${r.id === this._room}">${icon(r.icon || 'mdi:door-open')}<span>${esc(this._roomName(r))}</span><span class="n">${n ? `${n} on` : ''}</span></button>`; };
    const list = this._listOpen ? `<div class="list" role="menu">${this._slots.length > 1 ? this._slots.map((s) => { const rs = this._slotRooms(s); return rs.length ? `<div class="group">${esc(s.name)}</div>${rs.map(roomButton).join('')}` : ''; }).join('') : rooms.map(roomButton).join('')}</div>`
      : this._viewsOpen && views ? `<div class="list" role="menu"><button data-action="reset">${icon('mdi:camera-flip-outline')}<span>Reset view</span></button>${views.views.map((v, i) => `<button data-action="view" data-i="${i}">${icon('mdi:magnify-expand')}<span>${esc(String(v.name || `View ${i + 1}`))}</span></button>`).join('')}</div>` : '';
    const pins = c.pins !== false && c.pins !== 'no' ? `<div class="pins">${rooms.filter((r) => (r.floors || []).length).map((r) => { const n = this._activeCount(r); return `<button class="pin ${n ? 'on' : ''} ${r.id === this._hover ? 'hover' : ''}" hidden data-action="room" data-room="${esc(r.id)}" aria-pressed="${r.id === this._room}" aria-label="${esc(this._roomName(r))}${n ? `, ${n} on` : ''}">${icon(r.icon || 'mdi:door-open')}<span class="pn">${esc(this._roomName(r))}</span>${n ? `<span class="count" aria-hidden="true">${n}</span>` : ''}</button>`; }).join('')}</div>` : '';
    const panel = room ? this._panel(room) : '';
    const tokens = this._isPreview() ? 0 : tokenRoles(c).length;
    const hint = !hasModel ? `<div class="hint">Open the card editor to choose a floor3d card and detect its rooms.</div>` : !rooms.length ? `<div class="hint">No rooms yet: detect them in the card editor.</div>` : tokens ? `<div class="hint">${tokens} entity reference${tokens === 1 ? '' : 's'} ([[entity:…]]) unresolved: this card must sit inside a dashboard-entity-reference wrapper.</div>` : '';
    this._ui.innerHTML = `${title}${menu}${list}${pins}${panel}${hint}${this._toast ? `<div class="toast" role="status">${esc(this._toast)}</div>` : ''}`;
    if (focus) (this._root.querySelector(`[data-focus="${CSS.escape(focus)}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
    const tiles = this._ui.querySelector('.tiles') as HTMLElement | null; if (tiles) tiles.scrollTop = scroll;
    if (this._focus && tiles) {
      const t = (tiles.querySelector(`[data-entity="${CSS.escape(this._focus)}"]`) as HTMLElement | null)?.closest('.tile') as HTMLElement | null;
      if (t) { t.classList.add('focus'); t.scrollIntoView({ block: 'nearest' }); }
    }
    this._placePins();
  }
  private _panel(room: Room): string {
    const readouts = this._readouts(room);
    const ents = (room.entities || []).filter((e) => !this._tiles.hidden(e) && (this._sensorTiles() || !READOUT_DOMAINS.has(domainOf(e.entity))));
    const active = this._activeCount(room);
    const offable = ents.filter((e) => OFFABLE.includes(domainOf(e.entity)) && !e.read_only);
    const roomName = room.name || room.id;
    return `<section class="panel" aria-label="${esc(this._roomName(room))}"><div class="panelhead"><div class="roomicon">${icon(room.icon || 'mdi:door-open')}</div><div class="grow"><h3>${esc(this._roomName(room))}</h3><p>${esc(room.description || (active ? `${active} on` : ents.length ? 'Everything is off' : readouts ? 'Readings only' : 'Nothing to control here'))}</p></div><button class="close" data-action="close" aria-label="Close">${icon('mdi:close')}</button></div>${readouts}<div class="tiles">${ents.length ? ents.map((e) => this._tiles.tile(e, roomName)).join('') : readouts ? '' : '<div class="empty">No entities in this room. Add them in the card editor.</div>'}</div>${offable.length ? `<div class="foot"><button class="quiet" data-action="room-off" data-focus="room-off" ${offable.some((e) => isOn(this._s(e.entity))) ? '' : 'disabled'}>${icon('mdi:power')}All off in this room</button></div>` : ''}</section>`;
  }

  // ---- actions ----------------------------------------------------------------------------
  private _entityConfig(id: string): RoomEntity | null {
    for (const r of this._config.rooms as Room[]) for (const e of r.entities || []) if (e.entity === id) return e;
    return null;
  }
  /** The entities the card may act on: the rooms' entities and the rails, bulbs and remotes paired with them. */
  private _allowed(id: string): boolean {
    for (const r of this._config.rooms as Room[]) for (const e of (r.entities || []) as any[]) if (e.entity === id || e.top_entity === id || e.dimmer === id || e.remote === id) return true;
    return false;
  }
  private async _call(id: string, domain: string, service: string, data: any = {}): Promise<boolean> {
    if (!this._allowed(id)) return false;
    this._busy.add(id); this._request();
    try { await this._hass.callService(domain, service, { entity_id: id, ...data }); return true; }
    catch { this._showToast(`Couldn't change ${this._tiles.name({ entity: id })}.`); return false; }
    finally { this._busy.delete(id); this._request(); }
  }
  private _showToast(text: string): void {
    this._toast = text; clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this._toast = ''; this._request(); }, 5000);
    this._request();
  }
  private _click(ev: Event): void {
    const b = (ev.target as HTMLElement).closest('button[data-action]') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    const { action, entity: id = '', room, model, i } = b.dataset as any;
    if (action === 'room') { this._listOpen = false; this._select(room === this._room ? null : room); return; }
    if (action === 'close') { this._select(null); return; }
    if (action === 'list') { this._listOpen = !this._listOpen; this._viewsOpen = false; if (this._listOpen && this._room) { this._room = null; this._confirm = null; this._paintTints(); } this._request(); return; }
    if (action === 'views') { this._viewsOpen = !this._viewsOpen; this._listOpen = false; this._request(); return; }
    if (action === 'reset') { this._viewsOpen = false; this._resetView(); this._request(); return; }
    if (action === 'view') { this._viewsOpen = false; this._gotoView(Number(i)); this._request(); return; }
    if (action === 'model') { this._listOpen = false; this._viewsOpen = false; this._showModel(model); return; }
    if (action === 'room-off') {
      for (const e of this._roomOf(this._room)?.entities || []) if (OFFABLE.includes(domainOf(e.entity)) && !e.read_only && isOn(this._s(e.entity))) this._call(e.entity, domainOf(e.entity), 'turn_off');
      return;
    }
    if (!id || !this._allowed(id)) return;
    this._tiles.click(b);
  }
  private _change(ev: Event): void {
    const i = ev.target as HTMLInputElement;
    if (!i.dataset || !this._allowed(i.dataset.entity as string)) return;
    this._tiles.change(i);
  }
  private _input(ev: Event): void {
    const i = ev.target as HTMLInputElement;
    if (i.matches && i.matches('input.range.hue')) i.style.setProperty('--hue', i.value); // the thumb follows the hue while dragging
  }

  // ---- the card editor talks to the preview card ------------------------------------------
  private _isPreview(): boolean {
    if (this.preview) return true;
    let node: any = this;
    for (let i = 0; i < 20 && node; i++) {
      if (node.tagName === 'HUI-CARD' && node.hasAttribute && node.hasAttribute('preview')) return true;
      node = node.parentElement || (node.getRootNode && (node.getRootNode() as any).host);
    }
    return false;
  }
  private _toEditor(detail: any): void { window.dispatchEvent(new CustomEvent(ROOMS_PREVIEW_EVENT, { detail })); }
  private _objectNames(slot: Slot): { floors: string[]; all: string[] } {
    const scene = slot.el?._scene;
    const all: string[] = [];
    scene?.traverse((o: any) => { if (o.name && (o.isMesh || o.children.length) && !o.name.startsWith('f3dx_')) all.push(o.name); });
    return { floors: scene ? floorCandidates(scene) : [], all: all.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) };
  }
  private _editorRequest(detail: any): void {
    if (!detail || !this._isPreview()) return;
    const slot = (detail.model && this._slots.find((s) => s.id === detail.model)) || this._slots[0];
    if (detail.request === 'objects') { this._slots.forEach((s) => { if (s.el?._modelready) this._toEditor({ objects: this._objectNames(s), model: s.id }); }); return; }
    if (detail.request === 'detect') {
      const scene = slot?.el?._scene;
      if (!slot || !scene || !slot.el._modelready) { this._toEditor({ error: 'The model has not finished loading yet.', model: slot?.id }); return; }
      const name = (id: string) => this._hass?.states?.[id]?.attributes?.friendly_name || String(id).split('.')[1]?.replace(/_/g, ' ') || id;
      try { this._toEditor({ rooms: suggestRooms(scene, slot.card, name, !!detail.sensors), model: slot.id }); }
      catch (err) { this._toEditor({ error: (err as Error).message, model: slot.id }); }
    }
    if (detail.request === 'select') { this._select(detail.room || null); }
    if (detail.request === 'model') { this._showModel(detail.model || ALL); }
  }
}

export const ROOMS_THEMES = THEMES;
export type { Room, RoomEntity };
