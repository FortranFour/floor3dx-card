// floor3dx-rooms-card: the live 3D model of floor3dx-card with the room layer of
// floor3d-snapshot-card on top. A floor3dx (or floor3d / floor3dpro) card configuration is embedded
// as it is, so every binding keeps working: lamps, text frames, pictures, shades, doors, fans. Over
// the model: the rooms found on the plan, tinted when selected or when something in them is on,
// a pin per room, and a translucent panel of simple controls for the selected room, in the
// colours of the chosen theme. The card is meant to fill a panel view.
import * as THREE from 'three';
import { THEMES, RoomsTheme, themeOf, rgb } from './themes';
import { Room, RoomEntity, RoomIndex, suggestRooms, floorCandidates } from './rooms';
import { Tiles, TilesHost, CSS_TILES, isOn, esc, domainOf, titleCase, icon, ACTIVE_DOMAINS, OFFABLE } from './tiles';

export const ROOMS_EDITOR_EVENT = 'floor3dx-rooms-editor';
export const ROOMS_PREVIEW_EVENT = 'floor3dx-rooms-preview';
const EMBEDDED_TAG = 'floor3dpro-card'; // renamed to floor3dx-card by the build, like every element name

const STYLE = `
:host{display:block;position:relative;height:var(--f3r-height,60vh);min-height:240px;--f3r-ink:#eef2f7;--f3r-muted:rgba(238,242,247,.72);--f3r-stage:7,15,31;--f3r-accent:255,140,58;--f3r-on:255,193,7;--f3r-line:rgba(255,255,255,.16);--f3r-alpha:.55;--f3r-panel:rgba(var(--f3r-stage),var(--f3r-alpha));--f3r-blur:14px;font-family:var(--paper-font-body1_-_font-family,Roboto,sans-serif);color:var(--f3r-ink)}
:host(.light){--f3r-ink:#1b2430;--f3r-muted:rgba(27,36,48,.7);--f3r-line:rgba(0,0,0,.14);--f3r-alpha:.6}
*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;color:inherit}button:disabled{cursor:default;opacity:.45}button:focus-visible,input:focus-visible{outline:2px solid rgb(var(--f3r-accent));outline-offset:2px}ha-icon{width:22px;height:22px;flex:none;color:inherit;--mdc-icon-size:22px}
.stage{position:absolute;inset:0;overflow:hidden;background:rgb(var(--f3r-stage))}
.stage > .model{position:absolute;inset:0}
.stage > .model ::part(card),.stage > .model floor3dpro-card{display:block;width:100%;height:100%}
.ui{position:absolute;inset:0;pointer-events:none}
.ui > *{pointer-events:auto}
.title{position:absolute;left:14px;top:12px;display:flex;align-items:center;gap:10px;padding:8px 14px 8px 12px;border-radius:14px;background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));border:1px solid var(--f3r-line);font-size:15px;font-weight:500;letter-spacing:-.2px}
.title small{color:var(--f3r-muted);font-weight:400;font-size:12px}
.menu{position:absolute;right:14px;top:12px;display:flex;gap:8px}
.menu button,.panelhead .close{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;min-width:38px;padding:0 10px;border-radius:12px;border:1px solid var(--f3r-line);background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));font-size:13px}
.menu button[aria-pressed=true]{border-color:rgba(var(--f3r-accent),.6);color:rgb(var(--f3r-accent))}
.list{position:absolute;right:14px;top:58px;max-height:calc(100% - 80px);overflow:auto;padding:6px;border-radius:14px;background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));border:1px solid var(--f3r-line);display:flex;flex-direction:column;gap:2px;min-width:200px}
.list button{display:flex;align-items:center;gap:10px;padding:8px 10px;border:0;border-radius:10px;background:transparent;text-align:left;font-size:14px}
.list button[aria-pressed=true]{background:rgba(var(--f3r-accent),.18);color:rgb(var(--f3r-accent))}
.list .n{margin-left:auto;font-size:12px;color:var(--f3r-muted)}
.pins{position:absolute;inset:0;pointer-events:none}
.pin{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:5px;height:30px;min-width:30px;padding:0 6px;border-radius:15px;border:1px solid var(--f3r-line);background:var(--f3r-panel);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:var(--f3r-muted);font-size:12px;font-weight:500;white-space:nowrap;pointer-events:auto;opacity:.92;transition:opacity .2s}
.pin ha-icon{width:17px;height:17px;--mdc-icon-size:17px}.pin .pn{display:none;padding-right:2px}
.pin.on{color:rgb(var(--f3r-on));border-color:rgba(var(--f3r-on),.5)}
.pin[aria-pressed=true]{background:rgb(var(--f3r-accent));border-color:rgb(var(--f3r-accent));color:#fff;z-index:2}
.pin[aria-pressed=true] .pn,.pin.hover .pn,:host(.labels) .pin .pn{display:inline}
.pin[hidden]{display:none}
.pin .count{position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;border-radius:8px;background:rgb(var(--f3r-on));color:#1b1b1b;font-size:10px;line-height:16px;text-align:center;padding:0 4px;font-weight:600}
.panel{position:absolute;top:60px;right:14px;bottom:14px;width:min(340px,calc(100% - 28px));display:flex;flex-direction:column;border-radius:18px;background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));border:1px solid var(--f3r-line);box-shadow:0 10px 40px rgba(0,0,0,.25);overflow:hidden;animation:f3r-in .18s ease}
@keyframes f3r-in{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
:host(.narrow) .panel{top:auto;left:10px;right:10px;bottom:10px;width:auto;max-height:58%;animation-name:f3r-up}
@keyframes f3r-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.panelhead{display:flex;gap:12px;align-items:center;padding:14px 14px 10px}.roomicon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:rgba(var(--f3r-accent),.16);color:rgb(var(--f3r-accent))}
.panelhead h3{margin:0 0 2px;font-size:18px;font-weight:500}.panelhead p{margin:0;color:var(--f3r-muted);font-size:12px}.panelhead .grow{flex:1;min-width:0}
.tiles{display:grid;grid-template-columns:1fr;gap:8px;padding:4px 12px 12px;overflow:auto;flex:1;align-content:start;grid-auto-rows:max-content}
:host(.narrow) .tiles{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
${CSS_TILES}
.foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 12px 12px}.quiet{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:4px 12px;border:1px solid var(--f3r-line);border-radius:11px;background:transparent;color:var(--f3r-muted);font-size:12px}.quiet ha-icon{width:16px;height:16px;--mdc-icon-size:16px}
.empty{padding:14px;color:var(--f3r-muted);font-size:13px;line-height:1.5}
.toast{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);max-width:calc(100% - 32px);border:1px solid var(--f3r-line);border-radius:14px;background:var(--f3r-panel);-webkit-backdrop-filter:blur(var(--f3r-blur));backdrop-filter:blur(var(--f3r-blur));padding:10px 16px;font-size:13px}
.hint{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);padding:6px 12px;border-radius:12px;background:var(--f3r-panel);color:var(--f3r-muted);font-size:12px;pointer-events:none}
`;

interface Tint { mesh: THREE.Mesh; room: Room }

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
  private _embedded: any = null; // the floor3dx-card element
  private _embeddedKey = '';
  private _index: RoomIndex | null = null;
  private _tints: Tint[] = [];
  private _room: string | null = null;
  private _hover: string | null = null;
  private _listOpen = false;
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
  private _readyPoll: any;
  private _pinFrame = 0;
  private _pinUntil = 0;
  private _ro: ResizeObserver | null = null;
  private _root: ShadowRoot;
  private _ui!: HTMLElement;
  private _modelHost!: HTMLElement;
  private _onEditor = (e: Event) => this._editorRequest((e as CustomEvent).detail);

  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this._root.appendChild(style);
    const stage = document.createElement('div');
    stage.className = 'stage';
    this._modelHost = document.createElement('div');
    this._modelHost.className = 'model';
    this._ui = document.createElement('div');
    this._ui.className = 'ui';
    stage.appendChild(this._modelHost);
    stage.appendChild(this._ui);
    this._root.appendChild(stage);
    this._ui.addEventListener('click', (e) => this._click(e));
    this._ui.addEventListener('change', (e) => this._change(e));
    this._ui.addEventListener('pointerdown', () => { this._pointer = true; clearTimeout(this._pt); this._pt = setTimeout(() => this._release(), 1500); });
    this._ui.addEventListener('pointerup', () => this._release());
    this._ui.addEventListener('pointercancel', () => this._release());
    // taps on the model: a short press that did not move is a tap (OrbitControls gets the drags)
    this._modelHost.addEventListener('pointerdown', (e) => { this._down = { x: e.clientX, y: e.clientY, t: Date.now() }; this._movePins(1200); });
    this._modelHost.addEventListener('pointerup', (e) => {
      const d = this._down; this._down = null;
      if (!d || Math.abs(e.clientX - d.x) > 8 || Math.abs(e.clientY - d.y) > 8 || Date.now() - d.t > 500) return;
      this._tap(e);
    });
    this._modelHost.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !this._down) this._hoverAt(e); });
    this._modelHost.addEventListener('pointerleave', () => this._setHover(null));
    this._modelHost.addEventListener('wheel', () => this._movePins(600), { passive: true });
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
    if (this._room && !ids.includes(this._room)) this._room = null;
    this._applyTheme();
    this._mountEmbedded();
    this._request();
  }
  set hass(hass: any) {
    const old = this._hass;
    this._hass = hass;
    if (this._embedded) this._embedded.hass = hass;
    if (!old || this._roomEntities().some((id) => old.states[id] !== hass.states[id])) { this._paintTints(); this._request(); }
  }
  get hass(): any { return this._hass; }
  getCardSize(): number { return 12; }
  getGridOptions(): any { return { columns: 'full', rows: 'auto' }; }

  connectedCallback(): void {
    this._ro?.observe(this);
    this._layout();
    this._mountEmbedded();
    window.addEventListener(ROOMS_EDITOR_EVENT, this._onEditor);
    this._request();
  }
  disconnectedCallback(): void {
    this._ro?.disconnect();
    clearInterval(this._readyPoll);
    clearTimeout(this._pt); clearTimeout(this._toastTimer); clearTimeout(this._confirmTimer);
    cancelAnimationFrame(this._pinFrame); this._pinFrame = 0;
    window.removeEventListener(ROOMS_EDITOR_EVENT, this._onEditor);
  }

  // ---- layout and theme --------------------------------------------------------------------
  private _layout(): void {
    const w = this.getBoundingClientRect().width;
    if (w) this.classList.toggle('narrow', w < 700);
    const h = this._config?.height;
    if (h) this.style.setProperty('--f3r-height', typeof h === 'number' ? h + 'px' : String(h));
    else this.style.setProperty('--f3r-height', this._inPanel() ? 'calc(100vh - var(--header-height, 56px))' : '60vh');
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
  private _applyTheme(): void {
    const t = this._theme;
    this.classList.toggle('light', t.light);
    this.classList.toggle('labels', this._config.labels === true || this._config.labels === 'yes');
    this.style.setProperty('--f3r-stage', rgb(t.stage));
    // the accent is the theme's line colour when it contrasts with the stage; otherwise plain
    const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
    const accent = Math.abs(lum(t.edges) - lum(t.stage)) > 0.3 ? t.edges : t.light ? '#1b2430' : '#eef2f7';
    this.style.setProperty('--f3r-accent', rgb(this._config.accent || accent));
    const alpha = Number(this._config.panel_opacity);
    if (Number.isFinite(alpha) && alpha >= 0 && alpha <= 1) this.style.setProperty('--f3r-alpha', String(alpha)); else this.style.removeProperty('--f3r-alpha');
  }

  // ---- the embedded floor3dx card ---------------------------------------------------------
  private _embeddedConfig(): any {
    const src = this._config.card && typeof this._config.card === 'object' ? this._config.card : null;
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
      const skip = this._config.edge_skip !== undefined && this._config.edge_skip !== '' ? this._config.edge_skip : this._config.panel_lines === true || this._config.panel_lines === 'yes' ? 'seams, floors' : 'seams, floors, texts, images';
      cfg.look.edge_skip = skip;
    } // theme off: the card's own look, if it has one, stays
    // in the editor's preview every floor must be a separate object, so detection finds them all
    if (this._isPreview()) cfg.merge_static = 'no';
    // the rooms' floors must stay separate objects (tints, taps); reservedNames() reads every
    // string in the configuration, so listing them here keeps merge_static off them
    cfg.f3dx_rooms_floors = (this._config.rooms || []).flatMap((r: Room) => r.floors || []);
    return cfg;
  }
  private _mountEmbedded(): void {
    if (!this.isConnected || !this._config) return;
    const cfg = this._embeddedConfig();
    const key = cfg ? JSON.stringify(cfg) : '';
    if (key === this._embeddedKey) return;
    this._embeddedKey = key;
    clearInterval(this._readyPoll);
    this._index = null; this._tints = [];
    if (this._embedded) { this._embedded.remove(); this._embedded = null; }
    if (!cfg) { this._request(); return; }
    const el: any = document.createElement(EMBEDDED_TAG);
    el.style.cssText = 'display:block;width:100%;height:100%';
    this._modelHost.appendChild(el);
    try { el.setConfig(cfg); } catch (err) { this._toast = `Model configuration: ${(err as Error).message}`; this._request(); return; }
    if (this._hass) el.hass = this._hass;
    this._embedded = el;
    this._readyPoll = setInterval(() => { if (el._modelready) { clearInterval(this._readyPoll); this._onModelReady(); } }, 200);
    this._request();
  }
  private _onModelReady(): void {
    const el = this._embedded; if (!el || !el._scene) return;
    this._buildIndex();
    const controls = el._controls;
    if (controls && controls.addEventListener) controls.addEventListener('change', () => this._movePins(0));
    this._movePins(0);
    this._request();
    if (this._isPreview()) this._toEditor({ objects: this._objectNames() });
  }
  private _buildIndex(): void {
    const el = this._embedded; if (!el || !el._scene) return;
    const scene: THREE.Scene = el._scene;
    this._tints.forEach((t) => { t.mesh.parent?.remove(t.mesh); (t.mesh.material as THREE.Material).dispose(); });
    this._tints = [];
    this._index = new RoomIndex(scene, this._config.rooms);
    for (const room of this._config.rooms as Room[]) {
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
          this._tints.push({ mesh, room });
        });
      }
    }
    this._paintTints();
  }
  private _paintTints(): void {
    if (!this._tints.length) return;
    const on = new Set((this._config.rooms as Room[]).filter((r) => this._activeCount(r)).map((r) => r.id));
    const accent = new THREE.Color(`rgb(${getComputedStyle(this).getPropertyValue('--f3r-accent').trim() || '255,140,58'})`);
    const amber = new THREE.Color(0xffc107);
    const roomColors = this._config.room_colors === true || this._config.room_colors === 'yes';
    const tintOn = this._config.tint_on === true || this._config.tint_on === 'yes'; // the lamps show it themselves
    let changed = false;
    for (const t of this._tints) {
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
    if (changed) this._embedded?._requestRender?.('rooms');
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
    const el = this._embedded, layer = this._ui.querySelector('.pins') as HTMLElement | null;
    if (!el || !el._camera || !el._renderer || !layer || !this._index) return;
    const canvas: HTMLCanvasElement = el._renderer.domElement;
    const rect = canvas.getBoundingClientRect(), host = this.getBoundingClientRect();
    if (!rect.width) return;
    const cam: THREE.Camera = el._camera;
    cam.updateMatrixWorld();
    const v = new THREE.Vector3();
    for (const pin of Array.from(layer.children) as HTMLElement[]) {
      const room = (this._config.rooms as Room[]).find((r) => r.id === pin.dataset.room);
      const c = room ? this._index.centre(room, el._scene) : null;
      if (!c) { pin.hidden = true; continue; }
      v.copy(c).project(cam);
      const behind = v.z > 1 || v.z < -1;
      pin.hidden = behind;
      if (behind) continue;
      pin.style.left = `${rect.left - host.left + ((v.x + 1) / 2) * rect.width}px`;
      pin.style.top = `${rect.top - host.top + ((1 - v.y) / 2) * rect.height}px`;
    }
  }

  // ---- taps and hover --------------------------------------------------------------------
  private _hits(e: PointerEvent): THREE.Intersection[] {
    const el = this._embedded;
    if (!el || !el._renderer || typeof el._getintersect !== 'function') return [];
    const rect = el._renderer.domElement.getBoundingClientRect();
    return el._getintersect({ offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
  }
  private _roomAtEvent(e: PointerEvent): Room | undefined {
    if (!this._index) return undefined;
    const hits = this._hits(e);
    if (!hits.length) return undefined;
    const rooms = this._config.rooms as Room[];
    const floorRoom = (h: THREE.Intersection) => rooms.find((r) => (r.floors || []).includes(h.object.name));
    // the floor that was tapped; or, through a wall in front of it, the floor behind (walls are
    // thin, the room is what was aimed at); else the room nearest to what was hit (a chair, a lamp)
    const first = floorRoom(hits[0]);
    if (first) return first;
    if (/^wall/i.test(hits[0].object.name)) for (const h of hits.slice(1, 6)) { const r = floorRoom(h); if (r) return r; }
    return this._index.roomAt(hits[0].point.x, hits[0].point.z, 0.03);
  }
  private _tap(e: PointerEvent): void {
    const room = this._roomAtEvent(e);
    if (room) this._select(room.id);
    else if (this._room && !this._config.keep_panel) this._select(null);
    this._listOpen = false;
    this._request();
  }
  private _hoverAt(e: PointerEvent): void {
    const room = this._roomAtEvent(e);
    this._setHover(room ? room.id : null);
  }
  private _setHover(id: string | null): void {
    if (id === this._hover) return;
    this._hover = id;
    this._modelHost.style.cursor = id ? 'pointer' : '';
    this._ui.querySelectorAll('.pin').forEach((p) => p.classList.toggle('hover', (p as HTMLElement).dataset.room === id));
    this._paintTints();
  }
  private _select(id: string | null): void {
    this._room = id;
    this._confirm = null;
    this._paintTints();
    this._request();
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

  private _render(): void {
    const c = this._config, rooms: Room[] = c.rooms;
    const focus = (this._root.activeElement as HTMLElement | null)?.dataset?.focus;
    const scroll = (this._ui.querySelector('.tiles') as HTMLElement | null)?.scrollTop || 0;
    const room = this._roomOf(this._room);
    const hasModel = !!this._embedded;
    const title = c.title ? `<div class="title">${c.icon ? icon(c.icon) : ''}<span>${esc(c.title)}${c.subtitle ? `<br><small>${esc(c.subtitle)}</small>` : ''}</span></div>` : '';
    const menu = rooms.length ? `<div class="menu"><button data-action="list" aria-pressed="${this._listOpen}" aria-label="Rooms">${icon('mdi:floor-plan')}<span>Rooms</span></button></div>` : '';
    const list = this._listOpen ? `<div class="list" role="menu">${rooms.map((r) => { const n = this._activeCount(r); return `<button data-action="room" data-room="${esc(r.id)}" aria-pressed="${r.id === this._room}">${icon(r.icon || 'mdi:door-open')}<span>${esc(this._roomName(r))}</span><span class="n">${n ? `${n} on` : ''}</span></button>`; }).join('')}</div>` : '';
    const pins = c.pins !== false && c.pins !== 'no' ? `<div class="pins">${rooms.filter((r) => (r.floors || []).length).map((r) => { const n = this._activeCount(r); return `<button class="pin ${n ? 'on' : ''} ${r.id === this._hover ? 'hover' : ''}" hidden data-action="room" data-room="${esc(r.id)}" aria-pressed="${r.id === this._room}" aria-label="${esc(this._roomName(r))}${n ? `, ${n} on` : ''}">${icon(r.icon || 'mdi:door-open')}<span class="pn">${esc(this._roomName(r))}</span>${n ? `<span class="count" aria-hidden="true">${n}</span>` : ''}</button>`; }).join('')}</div>` : '';
    const panel = room ? this._panel(room) : '';
    const hint = !hasModel ? `<div class="hint">Open the card editor to choose a floor3d card and detect its rooms.</div>` : !rooms.length ? `<div class="hint">No rooms yet: detect them in the card editor.</div>` : '';
    this._ui.innerHTML = `${title}${menu}${list}${pins}${panel}${hint}${this._toast ? `<div class="toast" role="status">${esc(this._toast)}</div>` : ''}`;
    if (focus) (this._root.querySelector(`[data-focus="${CSS.escape(focus)}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
    const tiles = this._ui.querySelector('.tiles') as HTMLElement | null; if (tiles) tiles.scrollTop = scroll;
    this._placePins();
  }
  private _panel(room: Room): string {
    const ents = (room.entities || []).filter((e) => !this._tiles.hidden(e));
    const active = this._activeCount(room);
    const offable = ents.filter((e) => OFFABLE.includes(domainOf(e.entity)) && !e.read_only);
    const roomName = room.name || room.id;
    return `<section class="panel" aria-label="${esc(this._roomName(room))}"><div class="panelhead"><div class="roomicon">${icon(room.icon || 'mdi:door-open')}</div><div class="grow"><h3>${esc(this._roomName(room))}</h3><p>${esc(room.description || (active ? `${active} on` : ents.length ? 'Everything is off' : 'Nothing to control here'))}</p></div><button class="close" data-action="close" aria-label="Close">${icon('mdi:close')}</button></div><div class="tiles">${ents.length ? ents.map((e) => this._tiles.tile(e, roomName)).join('') : '<div class="empty">No entities in this room. Add them in the card editor.</div>'}</div>${offable.length ? `<div class="foot"><button class="quiet" data-action="room-off" data-focus="room-off" ${offable.some((e) => isOn(this._s(e.entity))) ? '' : 'disabled'}>${icon('mdi:power')}All off in this room</button></div>` : ''}</section>`;
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
    const { action, entity: id = '', room } = b.dataset as any;
    if (action === 'room') { this._listOpen = false; this._select(room === this._room ? null : room); return; }
    if (action === 'close') { this._select(null); return; }
    if (action === 'list') { this._listOpen = !this._listOpen; this._request(); return; }
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
  private _objectNames(): { floors: string[]; all: string[] } {
    const scene = this._embedded?._scene;
    const all: string[] = [];
    scene?.traverse((o: any) => { if (o.name && (o.isMesh || o.children.length) && !o.name.startsWith('f3dx_')) all.push(o.name); });
    return { floors: scene ? floorCandidates(scene) : [], all: all.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) };
  }
  private _editorRequest(detail: any): void {
    if (!detail || !this._isPreview()) return;
    const scene = this._embedded?._scene;
    if (detail.request === 'objects') { if (this._embedded?._modelready) this._toEditor({ objects: this._objectNames() }); return; }
    if (detail.request === 'detect') {
      if (!scene || !this._embedded._modelready) { this._toEditor({ error: 'The model has not finished loading yet.' }); return; }
      const name = (id: string) => this._hass?.states?.[id]?.attributes?.friendly_name || String(id).split('.')[1]?.replace(/_/g, ' ') || id;
      try { this._toEditor({ rooms: suggestRooms(scene, this._config.card, name, !!detail.sensors) }); }
      catch (err) { this._toEditor({ error: (err as Error).message }); }
    }
    if (detail.request === 'select') { this._select(detail.room || null); }
  }
}

export const ROOMS_THEMES = THEMES;
export type { Room, RoomEntity };
