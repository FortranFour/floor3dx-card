// floor3dx-rooms-card: the live 3D model of floor3dx-card with the room layer of
// floor3d-snapshot-card on top. A floor3dx (or floor3d / floor3dpro) card configuration is embedded
// as it is, so every binding keeps working: lamps, text frames, pictures, shades, doors, fans. Over
// the model: the rooms found on the plan, tinted when selected or when something in them is on,
// a pin per room, and a translucent panel of simple controls for the selected room, in the
// colours of the chosen theme. The card is meant to fill a panel view. Several models (a house
// and a garage) can share one card (`models:`), each in its own view, with a switcher.
import * as THREE from 'three';
import { weatherKind } from '../daylight';
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
/** The room and model last shown per card on this page: the card editor's preview makes a new element for
 *  every change, and the panel the user was looking at would close each time. */
const RECENT = new Map<string, { room: string | null; active: string; at: number }>();
/** A room entity whose `entity` is a Jinja template rather than an id: a readout rendered by Home Assistant. */
export function isTemplate(v: any): boolean { return typeof v === 'string' && /\{\{|\{%/.test(v); }
/** Row types of the embedded card whose double tap runs an action; a `camera` row is a room's popup button, not a control. */
const TAP_TYPES = new Set(['light', 'gesture']);

const STYLE = `
:host{display:block;position:relative;height:var(--f3r-height,60vh);min-height:240px;--f3r-ink:#eef2f7;--f3r-muted:rgba(238,242,247,.72);--f3r-stage:7,15,31;--f3r-accent:255,140,58;--f3r-on:255,193,7;--f3r-line:rgba(255,255,255,.16);--f3r-alpha:.55;--f3r-panel:rgba(var(--f3r-stage),var(--f3r-alpha));--f3r-blur:14px;font-family:var(--paper-font-body1_-_font-family,Roboto,sans-serif);color:var(--f3r-ink)}
:host(.light){--f3r-ink:#1b2430;--f3r-muted:rgba(27,36,48,.7);--f3r-line:rgba(0,0,0,.14);--f3r-alpha:.6}
*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;color:inherit}button:disabled{cursor:default;opacity:.45}button:focus-visible,input:focus-visible{outline:2px solid rgb(var(--f3r-accent));outline-offset:2px}ha-icon{width:22px;height:22px;flex:none;color:inherit;--mdc-icon-size:22px}
.stage{position:absolute;inset:0;overflow:hidden;background:var(--f3r-canvas,rgb(var(--f3r-stage)))}
.stage > .models{position:absolute;inset:0;display:flex;flex-direction:row;gap:var(--f3r-gap,14px)}
.stage > .models.column{flex-direction:column}
.stage > .models > .model{position:relative;flex:1 1 0;min-width:0;min-height:0}
.stage > .models > .model[hidden]{display:none}
.stage > .models.many > .model + .model:not([hidden])::before{content:"";position:absolute;left:calc(var(--f3r-gap,14px) / -2);top:8%;bottom:8%;border-left:1px solid var(--f3r-divider,var(--f3r-line));pointer-events:none}
.stage > .models.many.column > .model + .model:not([hidden])::before{left:8%;right:8%;top:calc(var(--f3r-gap,14px) / -2);bottom:auto;border-left:0;border-top:1px solid var(--f3r-divider,var(--f3r-line))}
.stage > .models > .model > .caption{position:absolute;z-index:2;left:12px;bottom:10px;padding:3px 9px;border-radius:9px;background:var(--f3r-panel);color:var(--f3r-muted);font-size:12px;pointer-events:none;display:none}
.stage > .models.many > .model > .caption{display:block}
:host(.compact) .stage > .models.many > .model > .caption{left:auto;right:12px}
.modelbtn{position:absolute;z-index:3;left:12px;bottom:12px;display:inline-flex;align-items:center;gap:4px;min-height:34px;padding:0 8px 0 12px;border-radius:12px;border:1px solid var(--f3r-line);background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));font-size:13px;font-weight:500}.modelbtn ha-icon{width:16px;height:16px;--mdc-icon-size:16px;opacity:.7}
:host(.narrow.open) .modelbtn{display:none}
.list.modelmenu{right:auto;top:auto;left:12px;bottom:54px}
:host(.narrow.open) .stage > .models > .model > .caption{display:none}
.stage > .models > .model ::part(card),.stage > .models > .model floor3dpro-card{display:block;width:100%;height:100%}
.ui{position:absolute;inset:0;pointer-events:none}
.ui > div{pointer-events:none}
.ui .title,.ui .menu,.ui .list,.ui .pin,.ui .panel,.ui .toast{pointer-events:auto}
.title{position:absolute;left:14px;top:12px;display:flex;align-items:center;gap:10px;padding:8px 14px 8px 12px;border-radius:14px;background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));border:1px solid var(--f3r-line);font-size:15px;font-weight:500;letter-spacing:-.2px}
.title small{color:var(--f3r-muted);font-weight:400;font-size:12px}
.menu{position:absolute;right:14px;top:12px;display:flex;gap:8px;align-items:flex-start}
.menu button,.panelhead .close{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;min-width:38px;padding:0 10px;border-radius:12px;border:1px solid var(--f3r-line);background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));font-size:13px}
.menu button[aria-pressed=true]{border-color:rgba(var(--f3r-accent),.6);color:rgb(var(--f3r-accent))}
.menu .seg{display:inline-flex;border-radius:12px;border:1px solid var(--f3r-line);background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));overflow:hidden}
.menu .seg button{border:0;border-radius:0;background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;min-width:44px}
.menu .seg button[aria-pressed=true]{background:rgba(var(--f3r-accent),.18)}
.menu .seg button + button{border-left:1px solid var(--f3r-line)}
/* the dividers either side of the pressed segment vanish, so its tint fills the slot edge to edge */
.menu .seg button[aria-pressed=true] + button,.menu .seg button + button[aria-pressed=true]{border-left-color:transparent}
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
.panel.still{animation:none}
/* phones: the title keeps to half the width; the buttons (icons only) take the first row on the right, the model switcher the second */
:host(.narrow) .title{max-width:48%}:host(.narrow) .title span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
:host(.narrow) .menu{flex-wrap:wrap;justify-content:flex-end;max-width:calc(52% - 14px)}
:host(.narrow) .menu > button span{display:none}:host(.narrow) .menu > button{padding:0 8px}
:host(.narrow) .menu::before{content:"";order:1;flex-basis:100%;height:0}
:host(.narrow) .menu .seg{order:2}
/* day & night lighting: a compass whose needle points north on screen; off, it is dimmed and the needle loses its red */
.menu .dl{position:relative;padding:0 8px}
.menu .dl svg{width:22px;height:22px;display:block;overflow:visible}
.menu .dl .needle{transform-origin:12px 12px;transition:transform .15s}
.menu .dl .n{fill:#e5473b}.menu .dl .s{fill:currentColor;fill-opacity:.4}
.menu .dl .badge{position:absolute;right:-5px;top:-5px;width:16px;height:16px;border-radius:8px;display:grid;place-items:center;background:var(--f3r-panel);border:1px solid var(--f3r-line);color:#e9a825}
.menu .dl .badge svg{width:10px;height:10px;fill:currentColor}
.menu .dl .badge.night{color:#8da2d6}.menu .dl .badge.cloud{color:#7d8b9c}.menu .dl .badge.rain{color:#4f87c8}.menu .dl .badge.snow{color:#7fb6d9}.menu .dl .badge.fog{color:#9aa5b1}
.menu .dl .badge svg.stroke{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}
.list .chk{width:16px;height:16px;border-radius:5px;border:1.5px solid currentColor;display:grid;place-items:center;font-size:11px;line-height:1}.list button[disabled]{opacity:.45}
.menu .dl[aria-pressed=false] svg{opacity:.35}
.menu .dl[aria-pressed=false] .n{fill:currentColor}
:host(.narrow.models) .list{top:104px;max-height:calc(100% - 126px)}
@keyframes f3r-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.panelhead{flex:none;display:flex;gap:12px;align-items:center;padding:14px 14px 10px}.roomicon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:rgba(var(--f3r-accent),.16);color:rgb(var(--f3r-accent))}
.panelhead h3{margin:0 0 2px;font-size:18px;font-weight:500}.panelhead p{margin:0;color:var(--f3r-muted);font-size:12px}.panelhead .grow{flex:1;min-width:0}
.readouts.more{padding-top:0}.rule{flex:none;border:0;border-top:1px solid var(--f3r-line);margin:0 14px 8px}
.readouts{flex:none;margin:0;padding:0 14px 10px;color:var(--f3r-ink);font-size:12px;display:flex;flex-wrap:wrap;gap:2px 0;line-height:1.5}.readouts em{font-style:normal;color:var(--f3r-muted)}.readouts span:before{content:"·";margin:0 6px 0 0;color:var(--f3r-muted)}.readouts span+span:before{margin:0 6px}.readouts .alert{color:rgb(var(--f3r-on))}
.body{display:flex;flex-direction:column;overflow:auto;flex:0 1 auto;min-height:0}
.readoutbox{position:relative;flex:none;padding-right:34px}.readoutbox .fold{position:absolute;right:10px;top:-2px;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--f3r-muted);display:grid;place-items:center}.readoutbox .fold ha-icon{--mdc-icon-size:20px}
.readoutbox:not(.open) .readouts.more,.readoutbox:not(.open) .rule{display:none}.readoutbox:not(.open) .readouts{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.tiles{display:grid;grid-template-columns:1fr;gap:8px;padding:4px 12px 12px;flex:none;min-height:0;align-content:start;grid-auto-rows:max-content}
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
  private _templates = new Map<string, { text: string; error: boolean; unsub: Promise<() => void> | null }>(); // template readouts, rendered by HA
  private _fresh = false; // a new element whose room and model may be restored from RECENT when it lands in the editor's preview
  private _daylightOn = true; // the day & night switch (remembered per card in this browser)
  private _weatherOn = true; // follow the weather entity (remembered per card in this browser)
  private _fixedHour: number | null = null; // the long-press menu's fixed time, this session
  private _dlMenu = false; // the compass's long-press menu
  private _dlPress = 0; // its timer
  private _dlLong = false; // the click after a long-press is swallowed
  private _camMenu = false; // the camera button's long-press menu: perspective and lens
  private _modelMenu = false; // the compact model button's long-press menu
  private _proj: string | null = null; // the viewer's perspective choice this browser (null: the models' own)
  private _fov: number | null = null;
  private _needleQueued = false;
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
  private _onResize = () => { this._layout(); this._movePins(0); };

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
    this._ui.addEventListener('pointerdown', (e) => {
      this._pointer = true; clearTimeout(this._pt); this._pt = setTimeout(() => this._release(), 1500);
      this._dlLong = false;
      // a long press on the compass opens its menu; the click that follows the release is swallowed
      clearTimeout(this._dlPress);
      if ((e.target as HTMLElement).closest('button.dl') && this._daylightOn) this._dlPress = window.setTimeout(() => { this._dlLong = true; const was = this._dlMenu; this._closeMenus(); this._dlMenu = !was; this._release(); this._request(); }, 450);
      // a long press on the camera button opens the perspective and lens menu
      const camBtn = (e.target as HTMLElement).closest('.menu button[data-action="reset"], .menu button[data-action="views"]');
      if (camBtn) this._dlPress = window.setTimeout(() => { this._dlLong = true; const was = this._camMenu; this._closeMenus(); this._camMenu = !was; this._release(); this._request(); }, 450);
      // a long press on the compact model button lists the models
      const modelBtn = (e.target as HTMLElement).closest('button.modelbtn');
      if (modelBtn) this._dlPress = window.setTimeout(() => { this._dlLong = true; const was = this._modelMenu; this._closeMenus(); this._modelMenu = !was; this._release(); this._request(); }, 450);
      // a tap anywhere but inside an open menu closes the menus (the tap itself still does its job)
      if (!(e.target as HTMLElement).closest('.list') && this._closeMenus()) this._request();
    });
    this._ui.addEventListener('contextmenu', (e) => { if ((e.target as HTMLElement).closest('button.dl, button.modelbtn, .menu button[data-action="reset"], .menu button[data-action="views"]')) e.preventDefault(); });
    this._ui.addEventListener('pointerup', () => { clearTimeout(this._dlPress); this._release(); });
    this._ui.addEventListener('pointercancel', () => { clearTimeout(this._dlPress); this._dlLong = false; this._release(); });
    this._ui.addEventListener('pointerleave', () => clearTimeout(this._dlPress));
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
      template: (t) => { const x = this._templates.get(t); return x ? x.text : null; },
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
    if (defs.length > 1 && !this._slots.length) {
      // the model the card opens on: `default_model` (an id, a name, or `all`), else the first
      const want = String(this._config.default_model || '').toLowerCase();
      const def = defs.find((d) => d.id === want || d.name.toLowerCase() === want);
      this._active = def ? def.id : want === ALL || want === 'both' ? ALL : this._active !== ALL && defs.some((d) => d.id === this._active) ? this._active : defs[0].id;
    }
    if (defs.length <= 1) this._active = ALL;
    this._fresh = !this._slots.length;
    if (!this._slots.length) { try { this._daylightOn = localStorage.getItem(this._storeKey('daylight')) !== 'off'; this._weatherOn = localStorage.getItem(this._storeKey('weather')) !== 'off'; const f = localStorage.getItem(this._storeKey('readouts')); if (f === 'open' || f === 'closed') this._readoutsFold = f === 'open'; const pj = localStorage.getItem(this._storeKey('projection')) || ({ on: 'two_point', off: 'three_point' } as any)[localStorage.getItem(this._storeKey('two_point')) || '']; if (pj === 'three_point' || pj === 'two_point' || pj === 'orthographic') this._proj = pj; const fv = Number(localStorage.getItem(this._storeKey('fov'))); if (fv >= 10 && fv <= 120) this._fov = fv; } catch (_) { /* private mode */ } }
    this._applyTheme();
    this._mountModels();
    this._syncTemplates();
    this._request();
  }
  set hass(hass: any) {
    const old = this._hass;
    this._hass = hass;
    if (!old || old.connection !== hass?.connection) this._syncTemplates();
    this._slots.forEach((s) => { if (s.el) s.el.hass = hass; });
    if (!old || this._roomEntities().some((id) => old.states[id] !== hass.states[id])) { this._paintTints(); this._request(); }
  }
  get hass(): any { return this._hass; }
  getCardSize(): number { return 12; }
  getGridOptions(): any { return { columns: 'full', rows: 'auto' }; }

  connectedCallback(): void {
    clearTimeout(this._dropTimer); this._dropTimer = 0; // back before the grace period ran out: keep the subscriptions
    if (this._config && this._hass) this._syncTemplates();
    if (this._fresh && this._config) {
      // the editor's preview: a new element for every change of the configuration, so the room and
      // the model shown a moment ago come back instead of closing on every keystroke
      this._fresh = false;
      const r = RECENT.get(this._storeKey('view'));
      if (r && Date.now() - r.at < 300000 && this._isPreview()) {
        if (r.active !== ALL && this._slots.some((s) => s.id === r.active)) this._active = r.active;
        if (r.room && (this._config.rooms || []).some((x: Room) => x.id === r.room)) this._room = r.room;
        this._layout(); this._request();
      }
    }
    this._ro?.observe(this);
    this._layout();
    this._mountModels();
    window.addEventListener(ROOMS_EDITOR_EVENT, this._onEditor);
    window.addEventListener(ROOMS_SELECT_EVENT, this._onSelect);
    window.addEventListener('hashchange', this._onHash);
    window.addEventListener('resize', this._onResize);
    this._fromHash();
    this._request();
  }
  disconnectedCallback(): void {
    this._ro?.disconnect();
    // Home Assistant detaches and re-attaches a card freely (edit mode, the preview, a view change).
    // Unsubscribing at once races the server's first render event: the event then reaches the websocket
    // library for a subscription it has forgotten, and its own unsubscribe of it rejects unhandled
    // ("Uncaught (in promise)" in the console). So the templates are dropped after a short grace period,
    // and not at all when the card is back by then.
    clearTimeout(this._dropTimer);
    this._dropTimer = window.setTimeout(() => { this._dropTimer = 0; if (!this.isConnected) this._dropTemplates(); }, 1500);
    this._slots.forEach((s) => clearInterval(s.poll));
    clearTimeout(this._pt); clearTimeout(this._toastTimer); clearTimeout(this._confirmTimer); clearTimeout(this._focusTimer);
    cancelAnimationFrame(this._pinFrame); this._pinFrame = 0;
    cancelAnimationFrame(this._flight); this._flight = 0;
    window.removeEventListener(ROOMS_EDITOR_EVENT, this._onEditor);
    window.removeEventListener(ROOMS_SELECT_EVENT, this._onSelect);
    window.removeEventListener('hashchange', this._onHash);
    window.removeEventListener('resize', this._onResize);
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
    else if (this._inPanel()) {
      // what is left of the window below the card's top: 100vh counts the space behind a phone's
      // bars and HA's header, and left the card a little taller than the view, with a scroll
      const top = Math.min(Math.max(0, rect.top), window.innerHeight / 2);
      // the dashboard's edit mode puts its Edit bar under the card: leave it room, or it is off screen
      // on a phone with nothing to scroll by (the model takes the drags)
      const edit = this._editMode() ? 110 : 0;
      this.style.setProperty('--f3r-height', `calc(${Math.round(window.innerHeight - top - edit)}px - env(safe-area-inset-bottom, 0px))`);
    } else this.style.setProperty('--f3r-height', this._isPreview() && this._wideEditor() ? PREVIEW_HEIGHT : '60vh');
    // every model, side by side or stacked: as configured, else by the card's shape
    const layout = this._config?.layout;
    const column = layout === 'column' || (layout !== 'row' && rect.width && rect.height && rect.height > rect.width);
    this._modelsHost.classList.toggle('column', !!column);
    const shownCount = this._slots.filter((s) => this._active === ALL || s.id === this._active).length;
    this._modelsHost.classList.toggle('many', shownCount > 1 && this._config?.model_labels !== false && this._config?.model_labels !== 'no');
    // the hairline belongs to a theme; with the model as it is, the gap alone separates the views
    const gap = Number(this._config?.models_gap);
    if (Number.isFinite(gap) && gap >= 0) this._modelsHost.style.setProperty('--f3r-gap', gap + 'px'); else this._modelsHost.style.removeProperty('--f3r-gap');
    // in edit mode a vertical finger drag on the model scrolls the page (to the Edit bar); otherwise the model has every drag
    const pan = this._editMode() && !this._isPreview();
    this._slots.forEach((s) => { const cv = s.el?._renderer?.domElement; if (cv) cv.style.touchAction = pan ? 'pan-y' : 'none'; });
    this._slots.forEach((s) => {
      const shown = this._active === ALL || s.id === this._active;
      if (s.host.hidden !== !shown) s.host.hidden = !shown;
      s.host.style.flex = s.width > 0 && this._active === ALL ? `${s.width} 1 0` : '1 1 0';
    });
  }
  /** The card editor puts the preview beside the editor from 1000px; below that it sits above it. */
  private _wideEditor(): boolean { return typeof window !== 'undefined' && window.innerWidth >= 1000; }
  /** The dashboard's edit mode (not the card editor's preview). */
  private _editMode(): boolean {
    try { const ll: any = (document.querySelector('home-assistant') as any)?.shadowRoot?.querySelector('home-assistant-main')?.shadowRoot?.querySelector('ha-drawer partial-panel-resolver, partial-panel-resolver')?.querySelector('ha-panel-lovelace'); const l = ll?.lovelace; if (l && typeof l.editMode === 'boolean') return l.editMode; } catch (_) { /* no dashboard */ }
    let node: any = this;
    for (let i = 0; i < 20 && node; i++) { if (node.tagName === 'HUI-CARD-OPTIONS') return true; node = node.parentElement || (node.getRootNode && (node.getRootNode() as any).host); }
    return false;
  }
  private _inPanel(): boolean {
    let node: any = this;
    for (let i = 0; i < 20 && node; i++) {
      if (node.tagName === 'HUI-PANEL-VIEW') return true;
      if (node.tagName === 'HUI-CARD' && node.hasAttribute && node.hasAttribute('preview')) return false;
      node = node.parentElement || (node.getRootNode && (node.getRootNode() as any).host);
    }
    return false;
  }
  /** The overlay's colours: `panel_theme` (any theme, for the panel only) else the theme; `panel_stage` /
   *  `panel_text` override the panel and text colours; with `panel_daylight` the panel takes the stage
   *  colour the model draws at this hour and flips between dark and light text to keep its contrast. */
  private _applyTheme(): void {
    const c = this._config;
    const hex6 = (v: any): string | null => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : null);
    const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
    let t = c.panel_theme && String(c.panel_theme).toLowerCase() !== 'off' ? themeOf(c.panel_theme) : this._theme;
    if (t !== this._theme && t.key === 'off') t = this._theme;
    let stage = t.panel || t.stage, light = t.light;
    const follow = c.panel_daylight === true || c.panel_daylight === 'yes';
    if (follow && this._canvasHex) { stage = this._canvasHex; light = lum(stage) > 0.5; }
    const own = hex6(c.panel_stage);
    if (own) { stage = own; light = lum(own) > 0.5; }
    const ink = hex6(c.panel_text);
    if (ink) light = lum(ink) < 0.5; // dark text: the light-stage rules (lines, chips), and the reverse
    this.classList.toggle('light', light);
    this.classList.toggle('labels', c.labels === true || c.labels === 'yes');
    this.style.setProperty('--f3r-stage', rgb(stage));
    if (ink) { this.style.setProperty('--f3r-ink', ink); this.style.setProperty('--f3r-muted', `rgba(${rgb(ink)},.72)`); } else { this.style.removeProperty('--f3r-ink'); this.style.removeProperty('--f3r-muted'); }
    // the accent is the theme's line colour when it contrasts with the stage; otherwise plain
    const accent = t.accent || (Math.abs(lum(t.edges) - lum(stage)) > 0.3 ? t.edges : light ? '#1b2430' : '#eef2f7');
    this.style.setProperty('--f3r-accent', rgb(c.accent || accent));
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
          // the daylight changed the stage colour (the hour, the weather, the switch): the gap follows, the badge too
          el.addEventListener('floor3dx-daylight', () => { if (slot === this._slots[0]) this._syncCanvas(slot); this._request(); });
          if (!this._daylightOn && el.setDaylight) el.setDaylight(false);
          if (!this._weatherOn && el.setDaylightWeather) el.setDaylightWeather(false);
          if (this._fixedHour !== null && el.setDaylightTime) el.setDaylightTime(this._fixedHour);
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
    host.addEventListener('pointerdown', (e) => { this._down = { x: e.clientX, y: e.clientY, t: Date.now() }; this._movePins(1200); if (this._closeMenus()) this._request(); });
    host.addEventListener('pointerup', (e) => {
      const d = this._down; this._down = null;
      if (!d || Math.abs(e.clientX - d.x) > 8 || Math.abs(e.clientY - d.y) > 8 || Date.now() - d.t > 500) return;
      if (slot.el?._pickMode) return; // the regular editor is picking an object on this model
      this._tap(e, slot);
      // the window for the compatibility click starts when the panel the tap opened is on screen
      this._tappedAt = Date.now(); requestAnimationFrame(() => { this._tappedAt = Date.now(); });
    });
    // iOS synthesises mousedown/mouseup/click a moment after a touch ends. By then the panel the tap
    // opened is on screen, and if it opened under the finger the click lands on its first tile and
    // toggles that light. A handled tap keeps its compatibility mouse events to itself.
    host.addEventListener('touchend', (e) => { if (Date.now() - this._tappedAt < 400 && e.cancelable) e.preventDefault(); }, { passive: false });
    host.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !this._down) this._hoverAt(e, slot); });
    host.addEventListener('pointerleave', () => this._setHover(null));
    host.addEventListener('wheel', () => this._movePins(600), { passive: true });
    // a double tap on a bound object would run the embedded card's action on top of the tap's:
    // swallowed unless taps leave objects to the card (object_tap: room)
    host.addEventListener('dblclick', (e) => { if (this._objectTap() !== 'room' && this._boundRow(slot, this._hits(e, slot))) e.stopPropagation(); }, true);
  }
  /** The space between the models and the hairline take the colour the embedded card actually draws behind its model (a theme's stage at its time of day, the card's own backgroundColor), so the gap is invisible and the line reads on light and dark alike. */
  private _canvasHex = '';
  /** The gap between models takes the first model's stage colour. The daylight changes that colour through
   *  the day (and with the weather or a fixed time), so this runs on every render and after each daylight
   *  update, not only when the model loads. */
  private _syncCanvas(slot: Slot): void {
    const bg = slot.el?._scene?.background;
    if (!bg || !bg.isColor) { if (this._canvasHex) { this._canvasHex = ''; this.style.removeProperty('--f3r-canvas'); this.style.removeProperty('--f3r-divider'); } return; }
    const hex = '#' + bg.getHexString();
    if (hex === this._canvasHex) return;
    this._canvasHex = hex;
    const lum = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b; // linear-ish, good enough to pick a side
    this.style.setProperty('--f3r-canvas', hex);
    this.style.setProperty('--f3r-divider', lum > 0.4 ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.28)');
    if (this._config.panel_daylight === true || this._config.panel_daylight === 'yes') this._applyTheme(); // the panel follows the stage
  }
  private _onModelReady(slot: Slot): void {
    const el = slot.el; if (!el || !el._scene) return;
    this._applyProjection(slot);
    if (slot === this._slots[0]) this._syncCanvas(slot);
    this._buildIndex(slot);
    const controls = el._controls;
    if (controls && controls.addEventListener) controls.addEventListener('change', () => { this._movePins(0); this._needleSoon(); });
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
  /** The day & night switch: a compass (its needle points north on screen, red tip) with a sun or moon
   *  badge for what the daylight is doing now; off, dimmed and struck through. Only when a model has daylight. */
  private _daylightButton(): string {
    const states = this._slots.filter((s) => s.el?.daylightState).map((s) => s.el.daylightState());
    if (!states.some((d) => d.has)) return '';
    const on = this._daylightOn, night = on && states.some((d) => d.has && d.dark > 0.5);
    // the sky right now: the weather condition (when followed) over day or night
    const live = states.find((d) => d.has && d.weather && d.weatherOn && d.condition);
    const kind = on && live ? weatherKind(live.condition) : '';
    const wet = kind === 'rain' || kind === 'snow';
    const key = !on ? '' : night && !wet ? 'night' : kind && kind !== 'clear' ? kind : 'day';
    // the badge is inline SVG (mdi-like sun, moon, cloud, rain, snow, fog), so it draws before ha-icon is defined
    const paths: { [k: string]: [string, boolean] } = {
      day: ['M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0-5 1.9 3.1h-3.8M12 22l-1.9-3.1h3.8M2 12l3.1-1.9v3.8M22 12l-3.1 1.9v-3.8M4.9 4.9l3.5.9-2.6 2.6M19.1 19.1l-3.5-.9 2.6-2.6M19.1 4.9l-.9 3.5-2.6-2.6M4.9 19.1l.9-3.5 2.6 2.6', false],
      night: ['M17.8 15.9a8 8 0 0 1-9.7-9.7A8 8 0 1 0 17.8 15.9z', false],
      partly: ['M17 20H8a4 4 0 0 1-.5-7.97A5 5 0 0 1 17 11.5 4.25 4.25 0 0 1 17 20zM6.5 8.5a3.5 3.5 0 0 1 6.6-1.6 6.4 6.4 0 0 0-5.2 4A3.5 3.5 0 0 1 6.5 8.5z', false],
      cloud: ['M6.5 20a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.6 9.5 5.25 5.25 0 0 1 17 20H6.5z', false],
      rain: ['M6.5 16a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.6 5.5 5.25 5.25 0 0 1 17 16H6.5zM8 18l-1.5 3.5M12 18l-1.5 3.5M16 18l-1.5 3.5', true],
      snow: ['M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M12 2l-2.5 2.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5', true],
      fog: ['M3 9h18M3 13h18M3 17h12', true],
    };
    const [path, stroke] = paths[key] || paths.day;
    const cls = key === 'night' ? 'night' : key === 'partly' || key === 'cloud' ? 'cloud' : key === 'rain' || key === 'snow' || key === 'fog' ? key : '';
    const badge = on ? `<span class="badge${cls ? ' ' + cls : ''}"><svg viewBox="0 0 24 24"${stroke ? ' class="stroke"' : ''}><path d="${path}"/></svg></span>` : '';
    const words: { [k: string]: string } = { day: 'day', night: 'night', partly: 'partly cloudy', cloud: 'overcast', rain: 'rain', snow: 'snow', fog: 'fog' };
    const fixed = this._fixedHour !== null ? ` · time fixed at ${this._fixedHour === 12 ? 'noon' : 'midnight'}` : '';
    const title = on ? `Day & night lighting on (${words[key] || key}${fixed}) · tap to switch off, hold for options · the needle points north` : 'Day & night lighting off · tap to switch on · the needle points north';
    return `<button class="dl" data-action="daylight" aria-pressed="${on}" aria-label="Day and night lighting" title="${title}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.6" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.3"/><g class="needle"><path class="n" d="M12 2.6 L14.7 12 L9.3 12 Z"/><path class="s" d="M12 21.4 L14.7 12 L9.3 12 Z"/></g><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>${badge}</button>`;
  }
  /** The compass's long-press menu: follow the weather, fix the time at noon or midnight. */
  private _daylightMenu(): string {
    const states = this._slots.filter((s) => s.el?.daylightState).map((s) => s.el.daylightState());
    const weather = states.some((d) => d.has && d.weather);
    const chk = (on: boolean) => `<span class="chk">${on ? '✓' : ''}</span>`;
    return `<div class="list" role="menu"><div class="group">Day &amp; night lighting</div>` +
      `<button data-action="dl-weather" aria-pressed="${weather && this._weatherOn}"${weather ? '' : ' disabled title="No weather entity in daylight"'}>${chk(weather && this._weatherOn)}<span>Follow the weather</span></button>` +
      `<button data-action="dl-time" data-i="12" aria-pressed="${this._fixedHour === 12}">${chk(this._fixedHour === 12)}<span>Fix the time: noon</span></button>` +
      `<button data-action="dl-time" data-i="0" aria-pressed="${this._fixedHour === 0}">${chk(this._fixedHour === 0)}<span>Fix the time: midnight</span></button></div>`;
  }
  /** The camera button's long-press menu: straight verticals (two-point perspective) and the lens. */
  private _cameraMenu(): string {
    const cur = this._projectionNow();
    const chk = (on: boolean) => `<span class="chk">${on ? '✓' : ''}</span>`;
    const lens = [[35, 'Narrow'], [45, 'Normal'], [60, 'Wide']] as [number, string][];
    const flat = cur.projection === 'orthographic';
    return `<div class="list" role="menu"><div class="group">Camera</div>` +
      `<button data-action="cam-two" aria-pressed="${cur.projection === 'two_point'}">${chk(cur.projection === 'two_point')}<span>Straight verticals</span></button>` +
      `<button data-action="cam-flat" aria-pressed="${flat}">${chk(flat)}<span>Flat view (no perspective)</span></button>` +
      `<div class="group">Lens</div>` +
      lens.map(([f, l]) => `<button data-action="cam-fov" data-i="${f}" aria-pressed="${!flat && cur.fov === f}"${flat ? ' disabled title="No lens in the flat view"' : ''}>${chk(!flat && cur.fov === f)}<span>${l} (${f}°)</span></button>`).join('') + `</div>`;
  }
  /** The perspective and lens in force: the viewer's choice, else the first model's configuration. */
  private _projectionNow(): { projection: string; fov: number } {
    const base = this._slots.find((s) => s.el?.projectionState)?.el.projectionState() || { projection: 'three_point', fov: 45 };
    return { projection: this._proj === null ? base.projection : this._proj, fov: this._fov === null ? base.fov : this._fov };
  }
  private _applyProjection(slot: Slot): void {
    if (!slot.el?.setProjection || (this._proj === null && this._fov === null)) return;
    const next: any = {};
    if (this._proj !== null) next.projection = this._proj;
    if (this._fov !== null) next.fov = this._fov;
    slot.el.setProjection(next);
  }
  private _setProjection(p: string): void {
    this._proj = p;
    this._slots.forEach((s) => this._applyProjection(s));
    try { localStorage.setItem(this._storeKey('projection'), p); localStorage.removeItem(this._storeKey('two_point')); } catch (_) { /* private mode */ }
    this._needleSoon(); this._movePins(0); this._request();
  }
  private _setFov(fov: number): void {
    this._fov = fov;
    this._slots.forEach((s) => this._applyProjection(s));
    try { localStorage.setItem(this._storeKey('fov'), String(fov)); } catch (_) { /* private mode */ }
    this._movePins(0); this._request();
  }
  private _setWeather(on: boolean): void {
    this._weatherOn = on;
    this._slots.forEach((s) => { if (s.el?.setDaylightWeather) s.el.setDaylightWeather(on); });
    try { localStorage.setItem(this._storeKey('weather'), on ? 'on' : 'off'); } catch (_) { /* private mode */ }
    this._request();
  }
  private _setFixedHour(hour: number | null): void {
    this._fixedHour = hour;
    this._slots.forEach((s) => { if (s.el?.setDaylightTime) s.el.setDaylightTime(hour); });
    this._request();
  }
  private _setDaylight(on: boolean): void {
    this._daylightOn = on;
    this._slots.forEach((s) => { if (s.el?.setDaylight) s.el.setDaylight(on); });
    try { localStorage.setItem(this._storeKey('daylight'), on ? 'on' : 'off'); } catch (_) { /* private mode */ }
    this._request();
  }
  private _storeKey(what: string): string { return `floor3dx-rooms:${what}:${this._config?.title || ''}:${modelDefs(this._config).map((d) => d.card?.objfile || '').join(',')}`; }
  /** Turn the compass needle to where north is on screen for the model in view (the first of several). */
  private _needleSoon(): void {
    if (this._needleQueued) return;
    this._needleQueued = true;
    requestAnimationFrame(() => { this._needleQueued = false; this._turnNeedle(); });
  }
  private _turnNeedle(): void {
    const needle = this._ui.querySelector('.dl .needle') as SVGGElement | null;
    if (!needle) return;
    const slot = this._slots.find((s) => s.el?._camera && (this._active === ALL || s.id === this._active)) || this._slots.find((s) => s.el?._camera);
    if (!slot) return;
    const north = slot.card?.north || { x: 0, z: -1 };
    const n = new THREE.Vector3(Number(north.x) || 0, 0, Number(north.z) || 0);
    if (n.lengthSq() === 0) n.set(0, 0, -1);
    const cam: THREE.Camera = slot.el._camera;
    cam.updateMatrixWorld();
    const v = n.normalize().transformDirection(cam.matrixWorldInverse);
    const deg = Math.atan2(v.x, v.y) * 180 / Math.PI; // clockwise from screen-up
    needle.style.transform = `rotate(${deg.toFixed(1)}deg)`;
  }
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
    // nothing to hit until the model is in (a hover while it loads reached the raycaster with no objects)
    if (!el || !el._renderer || !el._modelready || typeof el._getintersect !== 'function') return [];
    const rect = el._renderer.domElement.getBoundingClientRect();
    try { return el._getintersect({ offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top }) || []; } catch (_) { return []; }
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
  private _remember(): void { if (this._config) RECENT.set(this._storeKey('view'), { room: this._room, active: this._active, at: Date.now() }); }
  private _select(id: string | null): void {
    this._room = id;
    if (id) this._closeMenus();
    this._remember();
    this._confirm = null;
    if (id !== this._focus) this._focus = null;
    // a room of another model: show that model
    const slot = this._slotOf(this._roomOf(id));
    if (slot && this._active !== ALL && this._active !== slot.id) this._showModel(slot.id);
    this._paintTints();
    this._request();
  }
  /** How the model switcher is shown: the segmented control, the compact corner button, or not at all. */
  private _switcherMode(): 'segments' | 'compact' | 'none' {
    const v = this._config?.models_menu;
    if (this._slots.length < 2 || v === false || v === 'no') return 'none';
    if (v === 'compact' || v === 'button') return 'compact';
    if (v === 'segments' || v === 'seg' || v === true || v === 'yes') return 'segments';
    return this.classList.contains('narrow') ? 'compact' : 'segments'; // auto: compact on a phone
  }
  private _modelOrder(): string[] { return [...this._slots.map((s) => s.id), ALL]; }
  private _nextModel(): string { const o = this._modelOrder(); return o[(o.indexOf(this._active) + 1) % o.length]; }
  /** Every pop-up menu shut (a tap elsewhere, a room opening, another menu opening). Returns whether one was open. */
  private _closeMenus(): boolean {
    const open = this._dlMenu || this._camMenu || this._modelMenu || this._listOpen || this._viewsOpen;
    this._dlMenu = this._camMenu = this._modelMenu = this._listOpen = this._viewsOpen = false;
    return open;
  }
  private _showModel(id: string): void {
    if (id !== ALL && !this._slots.some((s) => s.id === id)) return;
    this._active = id;
    this._remember();
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
  /** The room's doors, locks and windows in a phrase or two for the panel's subtitle: "Doors shut & locked"
   *  or "Side door open, Back door unlocked"; "Windows closed" or "West window open" (the side from where the
   *  window's object stands in the model, when the 3D card binds it; else its name). */
  private _security(room: Room): string[] {
    const out: string[] = [];
    const ents = room.entities || [];
    const nameOf = (e: any) => this._tiles.name(e, room.name || room.id).replace(new RegExp('^' + (room.name || room.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), '');
    const cls = (e: any) => String(this._s(e.entity)?.attributes?.device_class || '');
    const doors = ents.filter((e) => (domainOf(e.entity) === 'binary_sensor' && /^(door|garage_door|opening)$/.test(cls(e))) || (domainOf(e.entity) === 'cover' && /^(garage|door|gate)$/.test(cls(e))));
    const locks = ents.filter((e) => domainOf(e.entity) === 'lock');
    const windows = ents.filter((e) => domainOf(e.entity) === 'binary_sensor' && cls(e) === 'window');
    if (doors.length || locks.length) {
      const openDoors = doors.filter((e) => { const st = this._s(e.entity); return st && (domainOf(e.entity) === 'cover' ? st.state !== 'closed' : st.state === 'on'); });
      const unlocked = locks.filter((e) => { const st = this._s(e.entity); return st && st.state !== 'locked'; });
      if (!openDoors.length && !unlocked.length) out.push(doors.length && locks.length ? 'Doors shut & locked' : doors.length ? 'Doors shut' : 'Locked');
      else out.push([...openDoors.map((e) => `${nameOf(e)} ${domainOf(e.entity) === 'cover' && this._s(e.entity).state !== 'open' ? this._s(e.entity).state : 'open'}`), ...unlocked.map((e) => `${nameOf(e)} ${this._s(e.entity).state === 'unlocked' ? 'unlocked' : this._s(e.entity).state.replace(/_/g, ' ')}`)].join(', '));
    }
    if (windows.length) {
      const open = windows.filter((e) => this._s(e.entity)?.state === 'on');
      if (!open.length) out.push('Windows closed');
      else {
        const byDir = new Map<string, number>();
        open.forEach((e) => { const dir = this._sideOf(room, e.entity) || nameOf(e); byDir.set(dir, (byDir.get(dir) || 0) + 1); });
        out.push(Array.from(byDir, ([dir, n]) => `${n > 1 ? `${n} ${dir} windows` : `${dir.charAt(0).toUpperCase() + dir.slice(1)} window`} open`).join(', '));
      }
    }
    return out;
  }
  /** The compass side of the room on which an entity's object stands (from the 3D card's door/colour rows
   *  bound to it), by the card's `north`; null when the model does not bind it. */
  private _sideOf(room: Room, entityId: string): string | null {
    const slot = this._slotOf(room), el = slot?.el;
    if (!el || !el._resolveObjects || !el._modelready) return null;
    const rows = (slot.card?.entities || []).filter((r: any) => r.entity === entityId && r.object_id);
    const meshes: THREE.Mesh[] = rows.flatMap((r: any) => { try { return el._resolveObjects(r.object_id) || []; } catch (_) { return []; } });
    if (!meshes.length) return null;
    const centre = (ms: THREE.Mesh[]) => { const b = new THREE.Box3(); ms.forEach((m) => { m.updateWorldMatrix(true, false); b.expandByObject(m); }); return b.isEmpty() ? null : b.getCenter(new THREE.Vector3()); };
    const p = centre(meshes);
    const floors: THREE.Mesh[] = (room.floors || []).flatMap((f: string) => { try { return el._resolveObjects(f) || []; } catch (_) { return []; } });
    const c = centre(floors);
    if (!p || !c) return null;
    const d = new THREE.Vector3(p.x - c.x, 0, p.z - c.z);
    if (d.length() < 1) return null;
    const north = slot.card?.north || { x: 0, z: -1 };
    const n = new THREE.Vector3(Number(north.x) || 0, 0, Number(north.z) || 0).normalize();
    const e = new THREE.Vector3(-n.z, 0, n.x); // east is north turned clockwise seen from above
    const deg = (Math.atan2(d.dot(e), d.dot(n)) * 180) / Math.PI; // 0 north, 90 east
    const names = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    return names[Math.round(((deg + 360) % 360) / 45) % 8];
  }
  private _roomEntities(): string[] { return (this._config?.rooms || []).flatMap((r: Room) => (r.entities || []).flatMap((e: any) => [e.entity, e.top_entity, e.dimmer, e.remote, this._config.guest_mode_entity].filter(Boolean))); }
  private _activeCount(room: Room): number { return (room.entities || []).filter((e) => ACTIVE_DOMAINS.has(domainOf(e.entity)) && isOn(this._s(e.entity))).length; }
  private _roomName(r: Room): string { return titleCase(r.name || r.id); }
  /** Subscribe to Home Assistant's rendering of every template readout in the configuration (and drop
   *  the ones no longer there). HA pushes a new result whenever an entity the template reads changes. */
  private _syncTemplates(): void {
    const conn = this._hass?.connection;
    if (!conn || !this._config) return;
    const wanted = new Set<string>();
    (this._config.rooms || []).forEach((r: Room) => (r.entities || []).forEach((e: any) => { if (isTemplate(e.entity)) wanted.add(e.entity); if (isTemplate(e.status)) wanted.add(e.status); }));
    this._templates.forEach((t, template) => { if (!wanted.has(template)) { this._templates.delete(template); this._unsubTemplate(t); } });
    wanted.forEach((template) => {
      if (this._templates.has(template)) return;
      const entry = { text: '…', error: false, unsub: null as Promise<() => void> | null };
      this._templates.set(template, entry);
      try {
        entry.unsub = conn.subscribeMessage((msg: any) => {
          try {
            if (msg && msg.error !== undefined && msg.result === undefined) { entry.error = true; entry.text = '⚠ template'; console.warn('floor3dx-rooms-card: template error: ' + (msg.error?.message || msg.error) + '\n' + template); }
            else { entry.error = false; const r = msg?.result; entry.text = r === undefined || r === null ? '' : String(r); }
            this._request();
          } catch (_) { /* a render error must not surface as a rejected promise */ }
        }, { type: 'render_template', template, timeout: 10, report_errors: true });
        entry.unsub.catch((err: any) => { entry.error = true; entry.text = '⚠ template'; console.warn('floor3dx-rooms-card: template rejected: ' + (err?.message || err)); this._request(); });
      } catch (err) { entry.error = true; entry.text = '⚠ template'; }
    });
  }
  private _dropTimer = 0;
  private _dropTemplates(): void {
    this._templates.forEach((t) => this._unsubTemplate(t));
    this._templates.clear();
  }
  /** Unsubscribe once the subscription is established; a failure (the server already closed it) is nobody's concern. */
  private _unsubTemplate(t: { unsub: Promise<() => void> | null }): void {
    const p = t.unsub; if (!p) return;
    p.then((u) => { try { const r: any = u(); if (r && typeof r.catch === 'function') r.catch(() => undefined); } catch (_) { /* already gone */ } }).catch(() => undefined);
  }
  private _sensorTiles(): boolean { return this._config.sensor_tiles === true || this._config.sensor_tiles === 'yes'; }
  /** The room's sensors as a line of readouts: "21 °C · 48 % · Window open". */
  /** The room's sensors as a line of labelled readouts: "Temperature 21.4°C · Humidity 48% · Side door closed". */
  private _readoutsFold: boolean | null = null; // the user's choice this session (null: narrow folds, wide opens)
  private _readoutsOpen(): boolean { if (this._readoutsFold !== null) return this._readoutsFold; return !this.classList.contains('narrow'); }
  private _readouts(room: Room): string {
    // `break: yes` after an entity starts a new line of readouts; `break: rule` puts a hairline between
    const groups: string[][] = [[]], rules: boolean[] = [];
    const cur = () => groups[groups.length - 1];
    const breakAfter = (e: any) => { const b = String(e.break ?? '').toLowerCase(); if (!b || b === 'no' || b === 'false') return; rules.push(b === 'rule' || b === 'line' || b === 'divider'); groups.push([]); };
    const roomName = room.name || room.id;
    // the label: the entity's label or friendly name, without the room's own name in front of it
    const labelOf = (e: any) => { const n = this._tiles.name(e, roomName); return n.replace(new RegExp('^' + roomName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), '') || n; };
    for (const e of room.entities || []) {
      if (this._tiles.hidden(e) || e.summary_only === true || e.summary_only === 'yes') continue;
      if (isTemplate(e.entity)) {
        // a template readout: Home Assistant renders it and pushes every change (see _syncTemplates)
        const t = this._templates.get(e.entity);
        const text = t ? t.text : '…';
        if (text === '') continue;
        cur().push(`<span${t?.error ? ' class="alert"' : ''}>${e.name ? `<em>${esc(e.name)}</em> ` : ''}${esc(text)}</span>`);
        breakAfter(e);
        continue;
      }
      if (this._sensorTiles() || !READOUT_DOMAINS.has(domainOf(e.entity))) continue;
      const s = this._s(e.entity); if (!s || s.state === 'unavailable' || s.state === 'unknown') continue;
      const a = s.attributes || {}, dc = a.device_class || '', label = labelOf(e);
      if (domainOf(e.entity) === 'sensor') {
        const n = Number(s.state), unit = a.unit_of_measurement || '';
        const val = Number.isFinite(n) ? (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10) : titleCase(String(s.state).replace(/_/g, ' '));
        cur().push(`<span><em>${esc(label)}</em> ${esc(String(val))}${unit ? (unit.startsWith('°') || unit === '%' ? '' : ' ') + esc(unit) : ''}</span>`);
        breakAfter(e);
      } else {
        const on = isOn(s);
        const word = /door|window|garage|opening/.test(dc) ? (on ? 'open' : 'closed') : /motion|occupancy|presence/.test(dc) ? (on ? 'motion' : 'clear') : /moisture/.test(dc) ? (on ? 'wet' : 'dry') : /smoke|gas|carbon_monoxide|safety|problem/.test(dc) ? (on ? 'alert' : 'ok') : /lock/.test(dc) ? (on ? 'unlocked' : 'locked') : /battery/.test(dc) ? (on ? 'low' : 'ok') : /connectivity/.test(dc) ? (on ? 'connected' : 'disconnected') : (on ? 'on' : 'off');
        cur().push(`<span class="${on && /door|window|garage|opening|moisture|smoke|gas|carbon_monoxide|safety|problem|lock|battery/.test(dc) ? 'alert' : ''}"><em>${esc(label)}</em> ${word}</span>`);
        breakAfter(e);
      }
    }
    const filled = groups.map((g, i) => ({ g, rule: i > 0 && rules[i - 1] })).filter((x) => x.g.length);
    if (!filled.length) return '';
    const lines = filled.map((x, i) => `${i > 0 && x.rule ? '<hr class="rule">' : ''}<p class="readouts${i > 0 ? ' more' : ''}">${x.g.join('')}</p>`).join('');
    if (filled.length < 2) return lines;
    // several lines: on a phone they fold to the first one, a chevron opens them (remembered per card)
    const open = this._readoutsOpen();
    return `<div class="readoutbox${open ? ' open' : ''}"><button class="fold" data-action="readouts" aria-expanded="${open}" aria-label="${open ? 'Fewer readings' : 'All readings'}" title="${open ? 'Fewer readings' : 'All readings'}">${icon(open ? 'mdi:chevron-up' : 'mdi:chevron-down')}</button>${lines}</div>`;
  }

  private _render(): void {
    const c = this._config, rooms: Room[] = c.rooms;
    const focus = (this._root.activeElement as HTMLElement | null)?.dataset?.focus;
    const scroll = (this._ui.querySelector('.body') as HTMLElement | null)?.scrollTop || 0;
    const room = this._roomOf(this._room);
    const hasModel = this._slots.some((s) => s.el);
    const title = c.title ? `<div class="title">${c.icon ? icon(c.icon) : ''}<span>${esc(c.title)}${c.subtitle ? `<br><small>${esc(c.subtitle)}</small>` : ''}</span></div>` : '';
    const mode = this._switcherMode(), many = mode !== 'none';
    this.classList.toggle('models', many); this.classList.toggle('compact', mode === 'compact');
    const allLabel = this._slots.length === 2 ? 'Both' : 'All';
    const switcher = mode === 'segments' ? `<div class="seg" role="group" aria-label="Model">${this._slots.map((s) => `<button data-action="model" data-model="${esc(s.id)}" aria-pressed="${this._active === s.id}">${esc(s.name)}</button>`).join('')}<button data-action="model" data-model="${ALL}" aria-pressed="${this._active === ALL}">${allLabel}</button></div>` : '';
    const current = this._active === ALL ? allLabel : (this._slots.find((s) => s.id === this._active)?.name || this._slots[0]?.name || '');
    const modelBtn = mode === 'compact' ? `<button class="modelbtn" data-action="model-cycle" aria-label="Model: ${esc(current)} · tap for the next, hold to choose" title="Model: ${esc(current)} · tap for the next, hold to choose">${esc(current)}${icon('mdi:chevron-right')}</button>` : '';
    const modelMenu = this._modelMenu && mode === 'compact' ? `<div class="list modelmenu" role="menu"><div class="group">Model</div>${this._slots.map((s) => `<button data-action="model" data-model="${esc(s.id)}" aria-pressed="${this._active === s.id}"><span class="chk">${this._active === s.id ? '✓' : ''}</span><span>${esc(s.name)}</span></button>`).join('')}<button data-action="model" data-model="${ALL}" aria-pressed="${this._active === ALL}"><span class="chk">${this._active === ALL ? '✓' : ''}</span><span>${allLabel}</span></button></div>` : '';
    const views = this._views();
    const reset = hasModel ? (views ? `<button data-action="views" aria-pressed="${this._viewsOpen}" aria-label="Views" title="Views · hold for perspective and lens">${icon('mdi:camera-outline')}</button>` : `<button data-action="reset" aria-label="Reset view" title="Reset view · hold for perspective and lens">${icon('mdi:camera-flip-outline')}</button>`) : '';
    const dl = this._daylightButton();
    const menu = rooms.length || hasModel ? `<div class="menu">${switcher}${dl}${reset}${rooms.length ? `<button data-action="list" aria-pressed="${this._listOpen}" aria-label="Rooms">${icon('mdi:floor-plan')}<span>Rooms</span></button>` : ''}</div>` : '';
    const roomButton = (r: Room) => { const n = this._activeCount(r); return `<button data-action="room" data-room="${esc(r.id)}" aria-pressed="${r.id === this._room}">${icon(r.icon || 'mdi:door-open')}<span>${esc(this._roomName(r))}</span><span class="n">${n ? `${n} on` : ''}</span></button>`; };
    const list = this._listOpen ? `<div class="list" role="menu">${this._slots.length > 1 ? this._slots.map((s) => { const rs = this._slotRooms(s); return rs.length ? `<div class="group">${esc(s.name)}</div>${rs.map(roomButton).join('')}` : ''; }).join('') : rooms.map(roomButton).join('')}</div>`
      : this._dlMenu ? this._daylightMenu()
      : this._camMenu ? this._cameraMenu()
      : this._viewsOpen && views ? `<div class="list" role="menu"><button data-action="reset">${icon('mdi:camera-flip-outline')}<span>Reset view</span></button>${views.views.map((v, i) => `<button data-action="view" data-i="${i}">${icon('mdi:magnify-expand')}<span>${esc(String(v.name || `View ${i + 1}`))}</span></button>`).join('')}</div>` : '';
    const pins = c.pins !== false && c.pins !== 'no' ? `<div class="pins">${rooms.filter((r) => (r.floors || []).length).map((r) => { const n = this._activeCount(r); return `<button class="pin ${n ? 'on' : ''} ${r.id === this._hover ? 'hover' : ''}" hidden data-action="room" data-room="${esc(r.id)}" aria-pressed="${r.id === this._room}" aria-label="${esc(this._roomName(r))}${n ? `, ${n} on` : ''}">${icon(r.icon || 'mdi:door-open')}<span class="pn">${esc(this._roomName(r))}</span>${n ? `<span class="count" aria-hidden="true">${n}</span>` : ''}</button>`; }).join('')}</div>` : '';
    const panel = room ? this._panel(room) : '';
    if (!room) this._lastPanelRoom = null;
    this.classList.toggle('open', !!room);
    const tokens = this._isPreview() ? 0 : tokenRoles(c).length;
    const hint = !hasModel ? `<div class="hint">Open the card editor to choose a floor3d card and detect its rooms.</div>` : !rooms.length ? `<div class="hint">No rooms yet: detect them in the card editor.</div>` : tokens ? `<div class="hint">${tokens} entity reference${tokens === 1 ? '' : 's'} ([[entity:…]]) unresolved: this card must sit inside a dashboard-entity-reference wrapper.</div>` : '';
    // three regions, each replaced only when its markup changed: a state update that touches one
    // tile no longer rebuilds the whole overlay (which replayed the panel's entrance and blinked)
    this._region('chrome', `${title}${menu}${list}${modelBtn}${modelMenu}${pins}`);
    this._region('panelhost', panel);
    this._region('notes', `${hint}${this._toast ? `<div class="toast" role="status">${esc(this._toast)}</div>` : ''}`);
    if (focus) (this._root.querySelector(`[data-focus="${CSS.escape(focus)}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
    const body = this._ui.querySelector('.body') as HTMLElement | null; if (body) body.scrollTop = scroll; const tiles = this._ui.querySelector('.tiles') as HTMLElement | null;
    if (this._focus && tiles) {
      const t = (tiles.querySelector(`[data-entity="${CSS.escape(this._focus)}"]`) as HTMLElement | null)?.closest('.tile') as HTMLElement | null;
      if (t) { t.classList.add('focus'); t.scrollIntoView({ block: 'nearest' }); }
    }
    this._placePins();
    this._turnNeedle();
    if (this._slots[0]) this._syncCanvas(this._slots[0]);
  }
  private _regions = new Map<string, { el: HTMLElement; html: string }>();
  private _region(name: string, html: string): void {
    let r = this._regions.get(name);
    if (!r) { const el = document.createElement('div'); el.className = name; this._ui.appendChild(el); r = { el, html: '' }; this._regions.set(name, r); }
    if (r.html === html) return;
    r.html = html; r.el.innerHTML = html;
  }
  private _lastPanelRoom: string | null = null;
  private _panel(room: Room): string {
    const readouts = this._readouts(room);
    const ents = (room.entities || []).filter((e) => !this._tiles.hidden(e) && !isTemplate(e.entity) && (this._sensorTiles() || !READOUT_DOMAINS.has(domainOf(e.entity))));
    const active = this._activeCount(room);
    const offable = ents.filter((e) => OFFABLE.includes(domainOf(e.entity)) && !e.read_only);
    const roomName = room.name || room.id;
    // the entrance animation plays when the panel opens, not on every re-render while it is open
    const still = this._lastPanelRoom === room.id; this._lastPanelRoom = room.id;
    return `<section class="panel${still ? ' still' : ''}" aria-label="${esc(this._roomName(room))}"><div class="panelhead"><div class="roomicon">${icon(room.icon || 'mdi:door-open')}</div><div class="grow"><h3>${esc(this._roomName(room))}</h3><p>${esc(room.description || [active ? `${active} on` : ents.length ? 'Everything is off' : readouts ? 'Readings only' : 'Nothing to control here', ...this._security(room)].join(' · '))}</p></div><button class="close" data-action="close" aria-label="Close">${icon('mdi:close')}</button></div><div class="body">${readouts}<div class="tiles">${ents.length ? ents.map((e) => this._tiles.tile(e, roomName)).join('') : readouts ? '' : '<div class="empty">No entities in this room. Add them in the card editor.</div>'}</div></div>${offable.length ? `<div class="foot"><button class="quiet" data-action="room-off" data-focus="room-off" ${offable.some((e) => isOn(this._s(e.entity))) ? '' : 'disabled'}>${icon('mdi:power')}All off in this room</button></div>` : ''}</section>`;
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
  private _tappedAt = 0;
  private _click(ev: Event): void {
    const b = (ev.target as HTMLElement).closest('button[data-action]') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    // a click that arrives right after a tap on the model is that tap's compatibility event, not a choice
    if (Date.now() - this._tappedAt < 400) return;
    const { action, entity: id = '', room, model, i } = b.dataset as any;
    if (action === 'room') { this._listOpen = false; this._select(room === this._room ? null : room); return; }
    if (action === 'close') { this._select(null); return; }
    if (action === 'readouts') { this._readoutsFold = !this._readoutsOpen(); try { localStorage.setItem(this._storeKey('readouts'), this._readoutsFold ? 'open' : 'closed'); } catch (_) { /* private mode */ } this._request(); return; }
    if (['list', 'views', 'reset', 'daylight', 'model', 'model-cycle', 'room'].includes(action)) { const keepDl = action === 'daylight' && this._dlMenu, keepCam = (action === 'reset' || action === 'views') && this._camMenu; this._closeMenus(); this._dlMenu = keepDl; this._camMenu = keepCam; }
    if (action === 'list') { this._listOpen = !this._listOpen; this._viewsOpen = false; if (this._listOpen && this._room) { this._room = null; this._confirm = null; this._paintTints(); } this._request(); return; }
    if (action === 'views') { if (this._dlLong) { this._dlLong = false; return; } this._camMenu = false; this._viewsOpen = !this._viewsOpen; this._listOpen = false; this._request(); return; }
    if (action === 'reset') { if (this._dlLong) { this._dlLong = false; return; } this._camMenu = false; this._viewsOpen = false; this._resetView(); this._request(); return; }
    if (action === 'cam-two') { this._setProjection(this._projectionNow().projection === 'two_point' ? 'three_point' : 'two_point'); return; }
    if (action === 'cam-flat') { this._setProjection(this._projectionNow().projection === 'orthographic' ? 'three_point' : 'orthographic'); return; }
    if (action === 'cam-fov') { this._setFov(Number(i)); return; }
    if (action === 'daylight') { if (this._dlLong) { this._dlLong = false; return; } this._dlMenu = false; this._setDaylight(!this._daylightOn); return; }
    if (action === 'dl-weather') { this._setWeather(!this._weatherOn); return; }
    if (action === 'dl-time') { const h = Number(i); this._setFixedHour(this._fixedHour === h ? null : h); return; }
    if (action === 'view') { this._viewsOpen = false; this._gotoView(Number(i)); this._request(); return; }
    if (action === 'model') { this._closeMenus(); this._showModel(model); return; }
    if (action === 'model-cycle') { if (this._dlLong) { this._dlLong = false; return; } this._closeMenus(); this._showModel(this._nextModel()); return; }
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
    if (detail.request === 'edit-model') {
      // the rooms editor opened the regular card's editor on one model: that embedded card becomes the
      // regular editor's preview card (object lists, picking, highlights, "use current camera")
      this._slots.forEach((s) => { if (s.el) { s.el.preview = s.id === detail.model; if (!s.el.preview && s.el._pickMode) { s.el._pickMode = false; if (s.el._renderer) s.el._renderer.domElement.style.cursor = ''; } } });
      return;
    }
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
