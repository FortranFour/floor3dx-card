/* eslint-disable @typescript-eslint/no-explicit-any */
// Card editor built on the components of Home Assistant. Adapted from giosci1994/floor3d-card (MIT).
// Built on the components of Home Assistant (ha-form and its selectors, ha-sortable,
// ha-expansion-panel), like the editors of the built-in cards. When Home Assistant doesn't provide
// them, it shows the editor of version 2.1 (editor-classic.ts) instead.
//
// The config goes through normalizeConfig() when it comes in and cleanConfig() when it goes out
// (config.ts). Home Assistant passes back every config the editor sends; the editor keeps its own
// copy, which holds the rows still empty (left out of the YAML), and goes on from it.
//
// The editor talks to the card shown next to it (the preview) through window events: it asks for
// the names of the objects of the model and for the current view, and turns on picking objects with
// a tap and highlighting them (see _onPreview() and the "Editor" part of floor3d-card.ts).
import { LitElement, html, css, nothing, TemplateResult, CSSResultGroup } from 'lit';
import { customElement, property, state } from 'lit/decorators';
import { repeat } from 'lit/directives/repeat';
import { fireEvent, HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';
import {
  mdiArrowLeft,
  mdiCameraOutline,
  mdiCursorDefaultClickOutline,
  mdiDelete,
  mdiDragHorizontalVariant,
  mdiPencil,
  mdiPlus,
  mdiRefresh,
} from '@mdi/js';
import { cleanConfig, matchObjects, normalizeConfig, objectPattern } from './config';
import { CARD_VERSION, EDITOR_EVENT, PREVIEW_EVENT } from './const';
import {
  ARRAY_VECTORS,
  BLOCK_SWITCHES,
  DAYLIGHT_BLOCKS,
  HEADINGS,
  SECTIONS,
  SWITCHES,
  TYPES,
  Schema,
  colorConditionSchema,
  computeHelper,
  computeLabel,
  daylightSchema,
  entityActionsSchema,
  entitySchema,
  groupSchema,
  objectField,
  typeSchema,
  vector,
  zoomObjectSchema,
  zoomSchema,
} from './editor-schema';

type ListKey = 'entities' | 'object_groups' | 'zoom_areas';
type View = { list?: ListKey; index?: number };
// Where a picked object goes: a field of the config (path of keys), or the objects of a group.
type PickTarget = { path: (string | number)[]; add?: boolean };


const isObject = (value: any): boolean => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

// Top-level switches: 'yes'/'no' in the config, true/false in the form.
function switchesToForm(object: any, switches: { [key: string]: 'yes' | 'no' }): any {
  const data = { ...object };
  Object.entries(switches).forEach(([key, fallback]) => {
    const value = data[key] ?? fallback;
    data[key] = value === true || value === 'yes';
  });
  return data;
}

function switchesFromForm(data: any, original: any, switches: { [key: string]: 'yes' | 'no' }): any {
  const object = { ...data };
  Object.entries(switches).forEach(([key, fallback]) => {
    if (typeof object[key] !== 'boolean') return;
    const value = object[key] ? 'yes' : 'no';
    // Left out while it is the default and wasn't written before.
    if (value === fallback && (original || {})[key] === undefined) delete object[key];
    else object[key] = value;
  });
  return object;
}

// Values cleared in a form: removed from the config.
function dropEmpty(object: any): any {
  Object.keys(object).forEach((key) => {
    if (object[key] === undefined || object[key] === '' || object[key] === null) delete object[key];
  });
  return object;
}

// An entity in the form: yes/no switches of its options block as toggles, [x, y, z] lists as vectors.
function entityToForm(entity: any): any {
  const data = { ...entity };
  Object.entries(BLOCK_SWITCHES).forEach(([block, switches]) => {
    if (isObject(data[block]) || data.type3d === block) data[block] = switchesToForm(data[block] || {}, switches);
  });
  Object.entries(ARRAY_VECTORS).forEach(([block, keys]) => {
    if (!isObject(data[block])) return;
    data[block] = { ...data[block] };
    keys.forEach((key) => {
      const value = data[block][key];
      if (Array.isArray(value)) data[block][key] = { x: value[0], y: value[1], z: value[2] };
    });
  });
  return data;
}

function entityFromForm(data: any, original: any): any {
  const entity = dropEmpty({ ...data });
  Object.entries(BLOCK_SWITCHES).forEach(([block, switches]) => {
    if (isObject(entity[block])) entity[block] = switchesFromForm(entity[block], (original || {})[block], switches);
  });
  Object.entries(ARRAY_VECTORS).forEach(([block, keys]) => {
    if (!isObject(entity[block])) return;
    keys.forEach((key) => {
      const value = entity[block][key];
      if (!isObject(value)) return;
      const list = [value.x, value.y, value.z];
      // Written as [x, y, z] once complete; while being typed it stays { x, y, z }.
      if (list.every((n) => typeof n === 'number' && isFinite(n))) entity[block][key] = list;
      else if (list.every((n) => n === undefined || n === null)) delete entity[block][key];
    });
  });
  Object.keys(entity).forEach((key) => {
    if (isObject(entity[key])) dropEmpty(entity[key]);
  });
  return entity;
}

// Components of Home Assistant used by the editor. They are defined once any built-in editor with
// forms has been loaded: in the card dialog they usually are; otherwise the editors of the entities
// and tile cards load them.
async function loadHaComponents(): Promise<boolean> {
  if (customElements.get('ha-form') && customElements.get('ha-expansion-panel')) return true;
  try {
    const helpers = await (window as any).loadCardHelpers();
    for (const config of [{ type: 'entities', entities: [] }, { type: 'tile', entity: 'sun.sun' }]) {
      const card = await helpers.createCardElement(config);
      await (card.constructor as any).getConfigElement?.();
    }
  } catch (e) {
    // Home Assistant without loadCardHelpers: the classic editor is used.
  }
  const defined = await Promise.race([
    customElements.whenDefined('ha-form').then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  return defined && !!customElements.get('ha-expansion-panel');
}

@customElement('floor3dpro-card-editor')
export class Floor3dxCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: any;
  @state() private _view: View = {};
  @state() private _expanded: string[] = [];
  @state() private _mode: 'loading' | 'ready' | 'classic' = 'loading';
  @state() private _modelObjects: string[] = [];
  @state() private _listObjects: string[] = [];
  @state() private _picking?: PickTarget;
  private _held?: string;
  private _internal?: any;
  private _classic?: any;
  private _keys = new WeakMap<Record<string, unknown>, string>();
  private _objectlist?: string;
  private _previewListener = (ev: Event): void => this._onPreview((ev as CustomEvent).detail);

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(PREVIEW_EVENT, this._previewListener);
    this._toPreview({ request: 'objects' });
    if (this._mode === 'loading') {
      loadHaComponents().then((ready) => {
        this._mode = ready ? 'ready' : 'classic';
        if (!ready) this._showClassic();
      });
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener(PREVIEW_EVENT, this._previewListener);
    this._toPreview({ pick: false, highlight: [] });
  }

  public setConfig(config: any): void {
    const json = JSON.stringify(config);
    const own = this._internal && json === this._held;
    this._held = json;
    const normalized: any = normalizeConfig(own ? this._internal : config);
    if (!Array.isArray(normalized.entities)) normalized.entities = [];
    if (!this._config) this._expanded = normalized.entities.length ? ['entities'] : ['model'];
    this._config = normalized;
    if (this._classic) this._classic.setConfig(config);
    this._loadObjectList();
  }

  // --- Config changes -------------------------------------------------------------------------

  private _update(config: any): void {
    this._config = config;
    this._internal = normalizeConfig(config);
    const clean = cleanConfig(config);
    const json = JSON.stringify(clean);
    if (json === this._held) return; // same YAML (a row still empty was added): nothing to send
    this._held = json;
    fireEvent(this, 'config-changed', { config: clean });
  }

  private _setTop(data: any): void {
    this._update(dropEmpty(switchesFromForm(data, this._config, SWITCHES)));
  }

  private _list(key: ListKey): any[] {
    return Array.isArray(this._config[key]) ? this._config[key] : [];
  }

  private _setList(key: ListKey, list: any[]): void {
    this._update({ ...this._config, [key]: list });
  }

  private _setItem(key: ListKey, index: number, item: any): void {
    const list = this._list(key).slice();
    list[index] = item;
    this._setList(key, list);
  }

  // A stable key for each row, so that dragging and editing keep the row elements.
  private _key(item: any): string {
    if (!isObject(item)) return String(item);
    if (!this._keys.has(item)) this._keys.set(item, Math.random().toString(36).slice(2));
    return this._keys.get(item) as string;
  }

  // --- Preview (the card next to the editor) ------------------------------------------------------

  private _toPreview(detail: any): void {
    window.dispatchEvent(new CustomEvent(EDITOR_EVENT, { detail }));
  }

  private _onPreview(detail: any): void {
    if (!detail) return;
    if (detail.objects) {
      this._modelObjects = detail.objects;
      // The preview is created again at every change of the config: it gets the state again.
      if (this._picking) this._toPreview({ pick: true });
      this._highlightCurrent();
    }
    if (detail.picked && this._picking) this._onPicked(detail.picked);
    if (detail.camera && this._cameraTarget) {
      const target = this._cameraTarget;
      this._cameraTarget = undefined;
      this._applyCamera(target, detail.camera);
    }
  }

  private _cameraTarget?: { list?: ListKey; index?: number };

  private _useCurrentView(list?: ListKey, index?: number): void {
    this._cameraTarget = { list, index };
    this._toPreview({ request: 'camera' });
  }

  private _applyCamera(target: { list?: ListKey; index?: number }, camera: any): void {
    const round = (v: any): any => ({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) });
    const values = {
      camera_position: round(camera.camera_position),
      camera_target: round(camera.camera_target),
      camera_rotate: {
        x: +camera.camera_rotate.x.toFixed(4),
        y: +camera.camera_rotate.y.toFixed(4),
        z: +camera.camera_rotate.z.toFixed(4),
      },
    };
    if (target.list) {
      const item = { ...this._list(target.list)[target.index as number], ...values };
      this._setItem(target.list, target.index as number, item);
    } else {
      this._update({ ...this._config, ...values });
    }
  }

  private _startPick(target: PickTarget): void {
    const same = this._picking && JSON.stringify(this._picking) === JSON.stringify(target);
    this._picking = same ? undefined : target;
    this._toPreview({ pick: !same });
  }

  private _onPicked(name: string): void {
    const target = this._picking as PickTarget;
    if (target.add) {
      // Objects of a group: a tap adds the object, a second tap takes it out.
      const [list, index] = target.path as [ListKey, number];
      const group = { ...this._list(list)[index] };
      const objects = (group.objects || []).slice();
      const at = objects.findIndex((o) => (isObject(o) ? o.object_id : o) === name);
      if (at >= 0) objects.splice(at, 1);
      else objects.push({ object_id: name });
      this._setItem(list, index, { ...group, objects });
    } else {
      this._picking = undefined;
      this._toPreview({ pick: false });
      this._setPath(target.path, name);
    }
  }

  // Sets config[path[0]][path[1]]... = value.
  private _setPath(path: (string | number)[], value: any): void {
    const config = copy(this._config);
    let object = config;
    path.slice(0, -1).forEach((key) => {
      if (object[key] === undefined) object[key] = {};
      object = object[key];
    });
    object[path[path.length - 1]] = value;
    this._update(config);
  }

  // The objects shown in the preview while a row is under the mouse or an item is edited.
  private _highlight(ids: string[]): void {
    this._toPreview({ highlight: ids.filter((id) => typeof id === 'string' && id !== '') });
  }

  private _highlightCurrent(): void {
    const { list, index } = this._view;
    this._highlight(list && index !== undefined ? this._itemObjects(list, this._list(list)[index]) : []);
  }

  private _itemObjects(list: ListKey, item: any): string[] {
    if (!isObject(item)) return [];
    if (list === 'object_groups') return (item.objects || []).map((o) => (isObject(o) ? o.object_id : o));
    return [item.object_id];
  }

  // Objects offered in the object menus: groups first, then the objects of the model.
  private _objectOptions(): string[] {
    const groups = this._list('object_groups')
      .filter((g) => isObject(g) && g.object_group)
      .map((g) => '<' + g.object_group + '>');
    const names = Array.from(new Set([...this._modelObjects, ...this._listObjects])).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    return [...groups, ...names];
  }

  // objectlist: a JSON file next to the model whose keys are the names of the objects.
  private _loadObjectList(): void {
    const { path, objectlist } = this._config || {};
    const url = objectlist && path ? path.replace(/\/?$/, '/') + objectlist : undefined;
    if (url === this._objectlist) return;
    this._objectlist = url;
    this._listObjects = [];
    if (!url) return;
    fetch(url)
      .then((response) => (response.ok ? response.json() : {}))
      .then((json) => {
        if (this._objectlist === url) this._listObjects = Object.keys(json || {});
      })
      .catch(() => undefined);
  }

  // --- Classic editor ---------------------------------------------------------------------------

  private async _showClassic(): Promise<void> {
    await import('./editor-classic');
    const classic: any = document.createElement('floor3dpro-card-editor-classic');
    classic.hass = this.hass;
    if (this._config) classic.setConfig(this._config);
    this._classic = classic;
    this.requestUpdate();
  }

  protected updated(changed: Map<string, any>): void {
    if (changed.has('hass') && this._classic) this._classic.hass = this.hass;
    if (changed.has('_view')) this._highlightCurrent();
  }

  // --- Rendering ---------------------------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    if (this._mode === 'classic') return html`${this._classic || nothing}`;
    if (this._mode === 'loading') return html`<div class="loading">Loading…</div>`;
    const { list, index } = this._view;
    if (list && index !== undefined && this._list(list)[index] !== undefined) {
      return this._renderItemEditor(list, index);
    }
    return html`
      <div class="version">
        floor3dx-card ${CARD_VERSION}
        <ha-icon-button .label=${'Reload the preview'} .path=${mdiRefresh} @click=${() => this._toPreview({ request: 'reload' })}></ha-icon-button>
      </div>
      ${SECTIONS.map((section) => this._renderPanel(section.key, section.title, section.icon, () =>
        this._renderContent(section.content(this._config), this._config, (data) => this._setTop(data), true),
      ))}
      ${this._renderPanel('entities', `Entities (${this._list('entities').length})`, 'mdi:format-list-bulleted', () =>
        this._renderList('entities', 'Add entity', { entity: '' }),
      )}
      ${this._renderPanel('object_groups', `Object groups (${this._list('object_groups').length})`, 'mdi:group', () =>
        this._renderList('object_groups', 'Add group', { object_group: '', objects: [] }),
      )}
      ${this._renderPanel('zoom_areas', `Views (${this._list('zoom_areas').length})`, 'mdi:magnify-expand', () =>
        this._renderList('zoom_areas', 'Add view', { zoom: '' }),
      )}
    `;
  }

  private _renderPanel(key: string, title: string, icon: string, content: () => TemplateResult | TemplateResult[]): TemplateResult {
    const expanded = this._expanded.includes(key);
    return html`
      <ha-expansion-panel
        outlined
        .header=${title}
        .expanded=${expanded}
        @expanded-changed=${(ev: CustomEvent) => {
          const now = ev.detail.expanded;
          if (now !== this._expanded.includes(key)) {
            this._expanded = now ? [...this._expanded, key] : this._expanded.filter((k) => k !== key);
          }
        }}
      >
        <ha-icon slot="leading-icon" .icon=${icon}></ha-icon>
        <div class="panel">${expanded ? content() : nothing}</div>
      </ha-expansion-panel>
    `;
  }

  // Forms, headings and the parts that aren't plain fields, in the order of the schema.
  private _renderContent(
    items: (Schema[] | string)[],
    data: any,
    onChange: (data: any) => void,
    top = false,
    list?: ListKey,
    index?: number,
  ): TemplateResult[] {
    return items.map((item) => {
      if (typeof item !== 'string') {
        return this._form(item, top ? switchesToForm(data, SWITCHES) : entityToForm(data), (value) =>
          onChange(top ? value : entityFromForm(value, data)),
        );
      }
      switch (item) {
        case 'daylight':
          return this._renderDaylight(data, onChange);
        case 'use_current_view':
          return html`
            <ha-button appearance="plain" size="s" @click=${() => this._useCurrentView()}>
              <ha-svg-icon slot="start" .path=${mdiCameraOutline}></ha-svg-icon>Use the current view of the preview
            </ha-button>
          `;
        case 'colorcondition':
          return this._renderColorConditions(list as ListKey, index as number, data);
        default:
          if (item in HEADINGS) {
            // A vector inside the options block: block.key
            const [block, key] = item.split('.');
            return this._form(
              [{ name: block, type: 'grid', schema: [vector(key)] }],
              entityToForm(data),
              (value) => onChange(entityFromForm(value, data)),
              HEADINGS[item],
            );
          }
          return html`<div class="heading">${item}</div>`;
      }
    });
  }

  // The daylight block: a button to add or remove it, then its fields and nested colour blocks.
  // Windows, exterior and glow lists stay in YAML.
  private _renderDaylight(config: any, onChange: (data: any) => void): TemplateResult {
    const enabled = isObject(config.daylight);
    const setDaylight = (daylight: any): void => {
      const next = { ...switchesToForm(config, SWITCHES) };
      if (daylight === undefined) delete next.daylight;
      else next.daylight = daylight;
      onChange(next);
    };
    return html`
      <div class="heading-row">
        <div class="heading">Daylight (time of day on a roofless plan)</div>
        <ha-button appearance="plain" size="s" @click=${() => setDaylight(enabled ? undefined : {})}>
          ${enabled ? 'Remove' : 'Enable'}
        </ha-button>
      </div>
      ${enabled
        ? html`
            ${daylightSchema().map((item) => {
              if (typeof item !== 'string') {
                return this._form(item, { daylight: config.daylight }, (value) => setDaylight(dropEmpty({ ...value.daylight })));
              }
              const key = item.split('.')[1];
              const keys = DAYLIGHT_BLOCKS[key];
              const numeric = key === 'ambient' || key === 'gradient';
              const fields = keys.map((k) => (numeric ? { name: k, selector: { number: { mode: 'box', step: 'any' } } } : { name: k, selector: { text: {} } }));
              return this._form(
                [{ name: key, type: 'grid', column_min_width: '110px', schema: fields }],
                { [key]: isObject(config.daylight[key]) ? config.daylight[key] : {} },
                (value) => {
                  const block = dropEmpty({ ...(value[key] || {}) });
                  const daylight = { ...config.daylight };
                  if (Object.keys(block).length) daylight[key] = block;
                  else delete daylight[key];
                  setDaylight(daylight);
                },
                HEADINGS[item],
              );
            })}
            <div class="hint">Windows, exterior objects and glass glow are set in the code editor (daylight.windows, exterior, glow).</div>
          `
        : html`<div class="hint">Off. Lighting stays as configured above.</div>`}
    `;
  }

  private _form(schema: Schema[], data: any, onChange: (data: any) => void, heading?: string): TemplateResult {
    // A vector alone gets its name above it (ha-form shows no label for a grid).
    const title = heading ?? (schema.length === 1 && HEADINGS[schema[0].name] ? HEADINGS[schema[0].name] : undefined);
    return html`
      ${title ? html`<div class="heading">${title}</div>` : nothing}
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${schema}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${(ev: CustomEvent) => {
          ev.stopPropagation();
          onChange(ev.detail.value);
        }}
      ></ha-form>
    `;
  }

  // --- Lists ---------------------------------------------------------------------------------------

  // An object id that the model doesn't have (a group: that the card doesn't define).
  private _missing(id: string): boolean {
    if (!id) return false;
    const group = /^<(.*)>$/.exec(id);
    if (group) return !this._list('object_groups').some((g) => isObject(g) && g.object_group === group[1]);
    const known = [...this._modelObjects, ...this._listObjects];
    if (objectPattern(id)) return known.length > 0 && matchObjects(id, known).length === 0;
    return known.length > 0 && !known.includes(id);
  }

  // The object of an entity in its line: a name with * says how many objects it matches.
  private _objectText(id: string): string {
    if (!id) return 'no object';
    if (this._missing(id)) return id + ' (not in the model)';
    const known = Array.from(new Set([...this._modelObjects, ...this._listObjects]));
    if (!objectPattern(id) || known.length === 0) return id;
    const count = matchObjects(id, known).length;
    return id + ' (' + count + ' object' + (count === 1 ? '' : 's') + ')';
  }

  private _describe(list: ListKey, item: any): { icon: string; primary: string; secondary: string; warning?: boolean } {
    if (list === 'entities') {
      const entity = isObject(item) ? item : { entity: item };
      const type = TYPES.find(([value]) => value === entity.type3d);
      const state = entity.entity && this.hass?.states[entity.entity];
      const name = state ? state.attributes.friendly_name || entity.entity : entity.entity || 'No entity';
      const missing = this._missing(entity.object_id);
      const parts = [type ? type[1] : 'No type', this._objectText(entity.object_id)];
      if (entity.entity && !state) parts.unshift('Entity not found');
      return {
        icon: type ? type[2] : 'mdi:help-circle-outline',
        primary: name,
        secondary: parts.join(' · '),
        warning: !state || !type || !entity.object_id || missing,
      };
    }
    if (list === 'object_groups') {
      const count = (item.objects || []).length;
      return { icon: 'mdi:group', primary: item.object_group || 'No name', secondary: `${count} object${count === 1 ? '' : 's'}`, warning: !item.object_group };
    }
    if (list === 'zoom_areas') {
      const kind = item.object_id ? 'Around ' + item.object_id : item.camera_position ? 'Camera position' : 'Not set';
      return { icon: 'mdi:magnify-expand', primary: item.zoom || 'No name', secondary: kind, warning: !item.zoom };
    }
    return { icon: 'mdi:help-circle-outline', primary: '', secondary: '' };
  }

  private _renderList(list: ListKey, addLabel: string, newItem: any): TemplateResult {
    const items = this._list(list);
    return html`
      <ha-sortable handle-selector=".handle" @item-moved=${(ev: CustomEvent) => this._moveItem(list, ev.detail.oldIndex, ev.detail.newIndex)}>
        <div class="rows">
          ${repeat(
            items,
            (item) => this._key(item),
            (item, index) => {
              const d = this._describe(list, item);
              return html`
                <div
                  class="row"
                  @mouseenter=${() => this._highlight(this._itemObjects(list, item))}
                  @mouseleave=${() => this._highlight([])}
                >
                  <div class="handle"><ha-svg-icon .path=${mdiDragHorizontalVariant}></ha-svg-icon></div>
                  <ha-icon class="type" .icon=${d.icon}></ha-icon>
                  <div class="info" @click=${() => this._edit(list, index)}>
                    <span class="primary">${d.primary}</span>
                    <span class="secondary ${d.warning ? 'warning' : ''}">${d.secondary}</span>
                  </div>
                  <ha-icon-button .label=${'Edit'} .path=${mdiPencil} @click=${() => this._edit(list, index)}></ha-icon-button>
                  <ha-icon-button .label=${'Remove'} .path=${mdiDelete} @click=${() => this._removeItem(list, index)}></ha-icon-button>
                </div>
              `;
            },
          )}
        </div>
      </ha-sortable>
      <ha-button class="add" @click=${() => this._addItem(list, newItem)}>
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>${addLabel}
      </ha-button>
    `;
  }

  private _moveItem(list: ListKey, from: number, to: number): void {
    const items = this._list(list).slice();
    items.splice(to, 0, items.splice(from, 1)[0]);
    this._setList(list, items);
  }

  private _removeItem(list: ListKey, index: number): void {
    const items = this._list(list).slice();
    items.splice(index, 1);
    this._highlight([]);
    this._setList(list, items);
  }

  private _addItem(list: ListKey, item: any): void {
    const items = [...this._list(list), copy(item)];
    this._setList(list, items);
    this._edit(list, items.length - 1);
  }

  private _edit(list: ListKey, index: number): void {
    this._view = { list, index };
  }

  private _back(): void {
    if (this._picking) this._startPick(this._picking);
    this._view = {};
    this._highlight([]);
  }

  // --- Item editors --------------------------------------------------------------------------------

  private _renderItemEditor(list: ListKey, index: number): TemplateResult {
    const item = this._list(list)[index];
    const titles = { entities: 'Entity', object_groups: 'Object group', zoom_areas: 'View' };
    const set = (value: any): void => this._setItem(list, index, value);
    let content: TemplateResult | TemplateResult[];
    if (list === 'entities') content = this._renderEntity(index, isObject(item) ? item : { entity: item }, set);
    else if (list === 'object_groups') content = this._renderGroup(index, item, set);
    else content = this._renderZoom(index, item, set);
    return html`
      <div class="subheader">
        <ha-icon-button .label=${'Back'} .path=${mdiArrowLeft} @click=${() => this._back()}></ha-icon-button>
        <span>${titles[list]}</span>
      </div>
      ${content}
    `;
  }

  // Object field with the button that picks the object in the preview.
  private _objectRow(path: (string | number)[], schema: Schema[], data: any, onChange: (data: any) => void): TemplateResult {
    const active = this._picking && JSON.stringify(this._picking.path) === JSON.stringify(path);
    return html`
      <div class="object-row">
        ${this._form(schema, data, onChange)}
        <ha-icon-button
          class=${active ? 'picking' : ''}
          .label=${'Pick in the preview'}
          .path=${mdiCursorDefaultClickOutline}
          @click=${() => this._startPick({ path })}
        ></ha-icon-button>
      </div>
      ${active ? html`<div class="hint">Tap an object in the preview</div>` : nothing}
    `;
  }

  private _renderEntity(index: number, entity: any, set: (value: any) => void): TemplateResult[] {
    const onChange = (value: any): void => {
      // A new type: the options block of the previous one goes away.
      if (value.type3d !== entity.type3d && entity.type3d && value[entity.type3d] !== undefined) {
        delete value[entity.type3d];
      }
      set(value);
    };
    const objects = this._objectOptions();
    return [
      this._form(entitySchema(entity.type3d), entityToForm(entity), (value) => onChange(entityFromForm(value, entity))),
      this._objectRow(['entities', index, 'object_id'], [{ ...objectField('object_id', objects), helper: 'An object, a <group>, or a name with * for all the objects it matches (Lamp_*)' }], entity, (value) =>
        onChange(dropEmpty({ ...entity, object_id: value.object_id })),
      ),
      ...(entity.type3d
        ? [
            html`<div class="heading">${(TYPES.find(([value]) => value === entity.type3d) || [])[1] || ''} options</div>`,
            ...this._renderContent(typeSchema(entity.type3d, objects), entity, onChange, false, 'entities', index),
          ]
        : []),
      html`
        <ha-expansion-panel outlined .header=${'Tap, long press and template'}>
          <div class="panel">
            ${this._form(entityActionsSchema(), entity, (value) => onChange(dropEmpty({ ...value })))}
          </div>
        </ha-expansion-panel>
      `,
    ];
  }

  private _renderColorConditions(list: ListKey, index: number, entity: any): TemplateResult {
    const conditions: any[] = Array.isArray(entity.colorcondition) ? entity.colorcondition : [];
    const set = (next: any[]): void => this._setItem(list, index, { ...entity, colorcondition: next });
    return html`
      <div class="heading">Colour by state</div>
      <ha-sortable
        handle-selector=".handle"
        @item-moved=${(ev: CustomEvent) => {
          const next = conditions.slice();
          next.splice(ev.detail.newIndex, 0, next.splice(ev.detail.oldIndex, 1)[0]);
          set(next);
        }}
      >
        <div class="rows">
          ${repeat(
            conditions,
            (c) => this._key(c),
            (c, i) => html`
              <div class="row condition">
                <div class="handle"><ha-svg-icon .path=${mdiDragHorizontalVariant}></ha-svg-icon></div>
                ${this._form(colorConditionSchema(), c, (value) => {
                  const next = conditions.slice();
                  next[i] = dropEmpty({ ...value });
                  set(next);
                })}
                <ha-icon-button
                  .label=${'Remove'}
                  .path=${mdiDelete}
                  @click=${() => set(conditions.filter((_, j) => j !== i))}
                ></ha-icon-button>
              </div>
            `,
          )}
        </div>
      </ha-sortable>
      <ha-button class="add" @click=${() => set([...conditions, { state: '', color: '' }])}>
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>Add colour
      </ha-button>
    `;
  }

  private _renderGroup(index: number, group: any, set: (value: any) => void): TemplateResult[] {
    const objects: any[] = group.objects || [];
    const idOf = (o: any): string => (isObject(o) ? o.object_id : o);
    const path = ['object_groups', index, 'objects'];
    const active = this._picking && JSON.stringify(this._picking.path) === JSON.stringify(path);
    const setObjects = (next: any[]): void => set({ ...group, objects: next });
    return [
      this._form(groupSchema(), group, (value) => set(dropEmpty({ ...value }))),
      html`
        <div class="heading">Objects</div>
        <ha-sortable
          handle-selector=".handle"
          @item-moved=${(ev: CustomEvent) => {
            const next = objects.slice();
            next.splice(ev.detail.newIndex, 0, next.splice(ev.detail.oldIndex, 1)[0]);
            setObjects(next);
          }}
        >
          <div class="rows">
            ${repeat(
              objects,
              (o) => this._key(o),
              (o, i) => html`
                <div class="row" @mouseenter=${() => this._highlight([idOf(o)])} @mouseleave=${() => this._highlightCurrent()}>
                  <div class="handle"><ha-svg-icon .path=${mdiDragHorizontalVariant}></ha-svg-icon></div>
                  <div class="info"><span class="primary">${idOf(o) || 'No object'}</span></div>
                  <ha-icon-button
                    .label=${'Remove'}
                    .path=${mdiDelete}
                    @click=${() => setObjects(objects.filter((_, j) => j !== i))}
                  ></ha-icon-button>
                </div>
              `,
            )}
          </div>
        </ha-sortable>
        <div class="object-row">
          ${this._form([objectField('add', this._objectOptions().filter((o) => !o.startsWith('<')))], {}, (value) => {
            if (value.add) setObjects([...objects, { object_id: value.add }]);
          }, '')}
          <ha-icon-button
            class=${active ? 'picking' : ''}
            .label=${'Pick in the preview'}
            .path=${mdiCursorDefaultClickOutline}
            @click=${() => this._startPick({ path, add: true })}
          ></ha-icon-button>
        </div>
        ${active ? html`<div class="hint">Tap objects in the preview to add them, tap again to take them out</div>` : nothing}
      `,
    ];
  }

  private _renderZoom(index: number, zoom: any, set: (value: any) => void): TemplateResult[] {
    const onChange = (value: any): void => set(entityFromForm(value, zoom));
    return [
      this._form(zoomSchema(), zoom, onChange),
      html`<div class="hint">The camera looks at the object from the direction and distance below.</div>`,
      this._objectRow(['zoom_areas', index, 'object_id'], zoomObjectSchema(this._objectOptions()), zoom, onChange),
      this._form([vector('direction')], zoom, onChange, 'Direction'),
      this._form([vector('rotation')], zoom, onChange, 'Rotation'),
    ];
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        display: block;
      }
      .version {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-bottom: 4px;
      }
      .loading {
        padding: 16px;
        color: var(--secondary-text-color);
      }
      ha-expansion-panel {
        display: block;
        margin-bottom: 8px;
        --expansion-panel-content-padding: 0;
        border-radius: 6px;
      }
      ha-expansion-panel ha-icon[slot='leading-icon'] {
        color: var(--secondary-text-color);
      }
      .panel {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .heading {
        font-weight: 500;
        margin-top: 8px;
        color: var(--primary-text-color);
      }
      .heading-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 8px;
      }
      .heading-row .heading {
        margin-top: 0;
      }
      .hint {
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .rows {
        display: flex;
        flex-direction: column;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 4px;
        border-bottom: 1px solid var(--divider-color);
        min-height: 52px;
      }
      .row.condition ha-form {
        flex: 1;
      }
      .row:hover {
        background: var(--secondary-background-color);
      }
      .handle {
        cursor: grab;
        padding: 0 8px;
        color: var(--secondary-text-color);
        display: flex;
      }
      .row ha-icon.type {
        color: var(--secondary-text-color);
        margin-right: 8px;
      }
      .info {
        flex: 1;
        display: flex;
        flex-direction: column;
        cursor: pointer;
        overflow: hidden;
        padding: 6px 0;
      }
      .info span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .secondary {
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      .secondary.warning {
        color: var(--warning-color);
      }
      .add {
        align-self: flex-start;
        margin-top: 8px;
      }
      .subheader {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 18px;
        margin-bottom: 8px;
      }
      .object-row {
        display: flex;
        align-items: flex-start;
        gap: 4px;
      }
      .object-row ha-form {
        flex: 1;
      }
      .object-row ha-icon-button {
        margin-top: 4px;
      }
      ha-icon-button.picking {
        color: var(--primary-color);
        background: rgba(var(--rgb-primary-color), 0.15);
        border-radius: 50%;
      }
    `;
  }
}
