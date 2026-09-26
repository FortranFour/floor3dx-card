/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/ban-types */
import { LitElement, CSSResultGroup, css } from 'lit';
import { property, customElement, state } from 'lit/decorators';
import { TemplateResult, html } from 'lit';
import { HomeAssistant, fireEvent, LovelaceCardEditor } from 'custom-card-helpers';
import {
  createEditorConfigArray,
  arrayMove,
  createEditorObjectGroupConfigArray,
  createEditorZoomConfigArray,
  createProLogState,
  proGetLogSet,
  proGetSkillSet,
  proSkillEnabled,
  proLog,
} from './helpers';
import { loadHaComponents } from './ensureComponents';
import { Floor3dCardConfig } from './types';
import '../elements/formfield';
import '../elements/textfield';
import '../elements/button';

//Faz-0 Isolation Correction: (Fix) DOM custom element isolation for pro components
@customElement('floor3dpro-card-editor')
export class Floor3dCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: Floor3dCardConfig;
  @state() private _toggle?: boolean;
  @state() private _helpers?: any;
  private _configArray: any[] = [];
  private _configObjectArray: any[] = [];
  private _configZoomArray: any[] = [];
  private _entityOptionsArray: object[] = [];
  private _entityOptionsGroupArray: object[] = [];
  private _entityOptionsZoomArray: object[] = [];
  private _options: any;
  private _initialized = false;
  private _objects: any;
  private _entity_ids: string[];
  private _visible: any[];
  // Faz-0 Transactional Editor Backbone (Deterministic Commit Scheduler)
  // Render scheduler ile aynı omurga:
  // Guard → Coalesce → RAF Flush Only → Cancel
  private _commitRaf?: number;
  private _commitPending = false;
  private _commitDirty = false;
  private _commitReason?: string;
  // Faz-0 Typing Policy (Visual Editor): valueChanged için debounce window
  private _typingDebounceTimer?: number;
  private _typingDebounceMs = 600;

  // Faz-0 PRO Backbone (Editor): single-center pro_log (throttled, opt-in)
  private _proLogEditor = false;
  private _proLogState = createProLogState(2000);

  // Faz-0 PRO Backbone (Editor): pro_skill gate state (opt-in, default OFF)
  private _proSkillSet: { level: boolean; editor: boolean; mobile: boolean } = {
    level: false,
    editor: false,
    mobile: false,
  };

  private _proApplyConfig(): void {
    const logSet = proGetLogSet(this._config);
    const skillSet = proGetSkillSet(this._config);

    // Editor log’u: pro_log içinde 'engine' veya 'all' varsa aç
    this._proLogEditor = logSet.has('engine') || logSet.has('all');

    // pro_skill (opt-in): default OFF unless user enables
    this._proSkillSet = {
      level: skillSet.level,
      editor: skillSet.editor,
      mobile: skillSet.mobile,
    };
  }

  private _proSkillEnabled(domain: 'level' | 'editor' | 'mobile'): boolean {
    return proSkillEnabled(this._proSkillSet, domain);
  }

  private _proEditorLog(
    message: string,
    throttleKey: string,
    onceKey?: 'connected' | 'setconfig',
  ): void {
    proLog(this._proLogState, this._proLogEditor, 'EDITOR', message, throttleKey, onceKey);
  }

  private _proEditorlLog(message: string, throttleKey: string): void {
    proLog(this._proLogState, this._proSkillEnabled('editor'), 'EDITOR', message, throttleKey);
  }

  // Faz-0 Transactional Editor Backbone
  // Deterministic Commit Scheduler (Render scheduler eşleniği)

  // Guard gate (mutlak): commit mümkün değilse iz bırakma
  private _canCommit(): boolean {
    if (!this._config) return false;
    if (!this.hass) return false;
    return true;
  }

  // Cancel mekanizması (lifecycle kapanırken)
  private _cancelScheduledCommit(): void {
    if (this._commitRaf !== undefined) {
      window.cancelAnimationFrame(this._commitRaf);
      this._commitRaf = undefined;
    }

    // Faz-0 Typing Policy: hostile lifecycle exit → typing debounce iptal
    if (this._typingDebounceTimer !== undefined) {
      window.clearTimeout(this._typingDebounceTimer);
      this._typingDebounceTimer = undefined;
    }
 
    this._commitPending = false;
    this._commitDirty = false;
    this._commitReason = undefined;
  }

  // Coalesce gate: aynı frame’de 100 tetik → 1 flush
  private _requestCommit(reason?: string): void {
    // Guard (mutlak)
    if (!this._canCommit()) {
      return;
    }

    // Dirty mark (config değişti)
    this._commitDirty = true;
    this._commitReason = reason;

    // Coalesce
    if (this._commitPending) {
      // Faz-0 Backbone Debug: spam geldi ama aynı frame’de toplandı
      this._proEditorLog(
        `commit coalesced${reason ? ` (${reason})` : ''}`,
        'commit:coalesced'
      );
      return;
    }

    this._commitPending = true;

    // Render scheduler gibi: sadece RAF içinden emit
    this._commitRaf = window.requestAnimationFrame(() => {
      this._commitRaf = undefined;
      this._commitPending = false;

      // Flush only if dirty
      if (!this._commitDirty) {
        return;
      }

      this._commitDirty = false;

      const r = this._commitReason;
      this._commitReason = undefined;

      // Faz-0 PRO Backbone (Editor): throttled log
      this._proEditorLog(
        `config-changed fired${r ? ` (${r})` : ''}`,
        r ? `config-changed:${r}` : 'config-changed'
      );

      // Faz-1 PRO Skill: EDITOR gate (manual hariç commit kapalı)
      if (this._proSkillEnabled('editor') && r !== 'manual') {
        proLog(
          this._proLogState,
          this._proSkillEnabled('editor'),
          'EDITOR',
          'Active Commit Closed',
          'editor:commit-closed',
          'editor:commit-closed'
        );

        // Editor internal normalize (UI cycle)
        this.setConfig(this._config);
        this.requestUpdate();
        return;
      }
      // Faz-0 Backbone Debug: gerçek commit flush (1 frame → 1 emit)
      this._proEditorLog(
        `commit flush emit${r ? ` (${r})` : ''}`,
        'commit:flush'
      );

      // Single deterministic emit
      fireEvent(this, 'config-changed', { config: this._config });
    });
  }

  // Public entry: legacy name korunur
  private _commitConfig(reason?: string): void {
    // Faz-0 Typing Policy (Visual Editor):
    // - valueChanged (typing) → time-window batching (debounce)
    // - diğer reason’lar → mevcut RAF backbone aynen
    if (reason === 'valueChanged') {
      if (this._typingDebounceTimer !== undefined) {
        window.clearTimeout(this._typingDebounceTimer);
        this._typingDebounceTimer = undefined;
      }

      this._typingDebounceTimer = window.setTimeout(() => {
        this._typingDebounceTimer = undefined;
        this._requestCommit('valueChanged');
      }, this._typingDebounceMs);

      return;
    }

    // Typing dışı bir aksiyon geldiyse, bekleyen typing debounce’ı iptal et ve anında backbone’a gir
    if (this._typingDebounceTimer !== undefined) {
      window.clearTimeout(this._typingDebounceTimer);
      this._typingDebounceTimer = undefined;
    }

    this._requestCommit(reason);
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types

  connectedCallback() {
    super.connectedCallback();
    void loadHaComponents();

    // Faz-0 PRO Backbone (Editor): throttled log
    this._proApplyConfig();
    this._proEditorLog('requestRender: connected', 'requestRender:connected', 'connected');
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Faz-0 Transactional Editor Backbone:
    // Hostile lifecycle: pending commit mutlaka iptal edilir
    this._cancelScheduledCommit();
  }

  public setConfig(config: Floor3dCardConfig): void {
    console.log('Start editor config');

    this._config = { ...config };

    // Faz-0 PRO Backbone (Editor): apply pro_log + once log
    this._proApplyConfig();
    this._proEditorLog('setConfig: applied', 'setConfig', 'setconfig');
    // Faz-1 PRO Skill: EDITOR editor ON → log once at config apply (deterministic)
    if (this._proSkillEnabled('editor')) {
      proLog(
        this._proLogState,
        true,
        'EDITOR',
        'Editor Active',
        'editor:active',
        'editor:active'
      );
    }

    if (!config.entities) {
      this._config.entities = [{ entity: '' }];
    }

    if (!config.object_groups) {
      this._config.object_groups = [{ object_group: '' }];
    }

    if (!config.zoom_areas) {
      this._config.zoom_areas = [{ zoom: '' }];
    }

    this._configArray = createEditorConfigArray(this._config);
    this._configObjectArray = createEditorObjectGroupConfigArray(this._config);
    this._configZoomArray = createEditorZoomConfigArray(this._config);


    for (const entityConfig of this._configArray) {
      if (entityConfig.light) {
        if (Object.entries(entityConfig.light).length === 0) {
          delete entityConfig.light;
        }
      }
      if (entityConfig.hide) {
        if (Object.entries(entityConfig.hide).length === 0) {
          delete entityConfig.hide;
        }
      }
      if (entityConfig.show) {
        if (Object.entries(entityConfig.show).length === 0) {
          delete entityConfig.show;
        }
      }
      if (entityConfig.room) {
        if (Object.entries(entityConfig.room).length === 0) {
          delete entityConfig.room;
        }
      }
    }
    this._config.object_groups = this._configObjectArray;
    this._config.entities = this._configArray;
    this._config.zoom_areas = this._configZoomArray;

    //console.log(JSON.stringify(this._config));

    const typeOptions = {
      icon: 'book-variant',
      name: 'Type and Object',
      secondary: 'Type and Object settings.',
      show: false,
    };

    const appearanceOptions = {
      icon: 'palette',
      name: 'Appearance',
      secondary: 'Appearance settings.',
      show: false,
    };

    const overlayOptions = {
      icon: 'checkbox-multiple-blank-outline',
      name: 'Overlay',
      secondary: 'Overlay settings.',
      show: false,
    };

    const colorOptions = {
      icon: 'format-color-fill',
      name: 'Color',
      secondary: 'Color condition.',
      show: false,
      visible: false,
    };

    this.hass.resources;
    const hideOptions = {
      icon: 'eye-off',
      name: 'Hide',
      secondary: 'Hide options.',
      show: false,
      visible: false,
    };

    const showOptions = {
      icon: 'eye',
      name: 'Show',
      secondary: 'Show options.',
      show: false,
      visible: false,
    };

    const rotateOptions = {
      icon: 'fan',
      name: 'Rotate',
      secondary: 'Rotate options.',
      show: false,
      visible: false,
    };

    const lightOptions = {
      icon: 'lightbulb-on-outline',
      name: 'Light',
      secondary: 'Light options',
      show: false,
      visible: false,
    };

    const roomOptions = {
      icon: 'floor-plan',
      name: 'Room',
      secondary: 'Room options',
      show: false,
      visible: false,
    };

    const zoomOptions = {
      icon: 'magnify-plus',
      name: 'Zoom Area',
      secondary: 'Zoom Area options',
      show: false,
      visible: false,
    };

    const textOptions = {
      icon: 'format-text',
      name: 'Text',
      secondary: 'Text options.',
      show: false,
      visible: false,
    };

    const imageOptions = {
      icon: 'image',
      name: 'Image',
      secondary: 'Image options: picture, animated GIF or video on the object.',
      show: false,
      visible: false,
    };

    const doorOptions = {
      icon: 'door',
      name: 'Door',
      secondary: 'Door options.',
      show: false,
      visible: false,
    };

    const coverOptions = {
      icon: 'window-shutter',
      name: 'Cover',
      secondary: 'Cover options.',
      show: false,
      visible: false,
    };

    const gestureOptions = {
      icon: 'gesture-tap',
      name: 'Gesture',
      secondary: 'Gesture options.',
      show: false,
      visible: false,
    };

    const objectGroupOptions = {
      icon: 'cube-unfolded',
      name: 'Objects',
      secondary: 'Objects.',
      show: false,
      visible: false,
    };

    const actionsOptions = {
      icon: 'gesture-tap',
      name: 'Actions',
      secondary: 'Coming soon... Use code editor for Actions.',
      show: false,
    };

    const zoomAreaOptions = {
      show: false,
      options: {
        zoom: { ...zoomOptions },
      },
    };

    const entityOptions = {
      show: false,
      options: {
        threed: { ...typeOptions },
        light: { ...lightOptions },
        room: { ...roomOptions },
        color: { ...colorOptions },
        hide: { ...hideOptions },
        show: { ...showOptions },
        text: { ...textOptions },
        image: { ...imageOptions },
        door: { ...doorOptions },
        cover: { ...coverOptions },
        rotate: { ...rotateOptions },
        gesture: { ...gestureOptions },
      },
    };

    for (const objectconfig of this._configObjectArray) {
      this._entityOptionsGroupArray.push({ ...objectGroupOptions });
    }

    for (const config of this._configArray) {
      this._entityOptionsArray.push({ ...entityOptions });
    }

    for (const zoomconfig of this._configZoomArray) {
      this._entityOptionsZoomArray.push({ ...zoomAreaOptions });
    }

    if (!this._options) {
      this._options = {
        pro_feature_setting: {
          icon: 'chart-tree',
          name: 'Pro Feature Setting',
          secondary: 'Customize pro features and editor workflow settings',
          show: false,
        },
        object_groups: {
          icon: 'group',
          name: 'Object Groups',
          secondary: 'Manage card Object Groups.',
          show: false,
          options: {
            object_groups: this._entityOptionsGroupArray,
          },
        },
        zoom_areas: {
          icon: 'magnify-expand',
          name: 'Zoom Areas',
          secondary: 'Manage card Zoom Areas.',
          show: false,
          options: {
            zoom_areas: this._entityOptionsZoomArray,
          },
        },
        entities: {
          icon: 'tune',
          name: 'Entities',
          secondary: 'Manage card entities.',
          show: false,
          options: {
            entities: this._entityOptionsArray,
          },
        },
        model: {
          icon: 'video-3d',
          name: '3D Model',
          secondary: 'Reference your Waterfront 3D model',
          show: false,
        },
        appearance: {
          icon: 'palette',
          name: 'Appearance',
          secondary: 'Customize the global appearance and behavior settings',
          show: false,
        },
        overlay: {
          icon: 'checkbox-multiple-blank-outline',
          name: 'Overlay',
          secondary: 'Customize the overlay appearance and behavior settings',
          show: false,
        },
      };
    }

    if (this._config.objectlist && !this._objects) {
      this._fetchObjectList();
    }

    console.log('End editor config');

    //fireEvent(this, 'config-changed', { config: this._config });
  }

  get _show_warning(): boolean {
    return this._config?.show_warning || false;
  }

  get _show_error(): boolean {
    return this._config?.show_error || false;
  }

  private _fetchObjectList(): void {
    let path = this._config.path;
    const lastChar = path.substr(-1);
    if (lastChar != '/') {
      path = path + '/';
    }
    fetch(path + this._config.objectlist)
      .then(function (response): any {
        if (!response.ok) {
          throw Error(response.statusText);
        }
        return response.json();
      })
      .then(this._onobjectloaded.bind(this));
  }

  private _onobjectloaded(json: any): void {
    this._objects = Object.keys(json).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
  }

  protected shouldUpdate(): boolean {
    console.log('Should Update start');
    if (!this._initialized) {
      this._initialize();
    }
    return true;
  }

  // Faz-0 Deterministic Correction: (Fix) Guard reflex (Original file error correction)
  // The render can run before setConfig() appears in the Edit Card context. (hostile lifecycle)
  protected render(): TemplateResult | void {
    if (!this._config) {
      return html``;
    }

    // Commit Button (original not working)
    // Faz-1 PRO Skill: EDITOR Commit Button
    const show = this._config.overlay ? this._config.overlay == 'yes' : false;
    return html`

      ${Array.isArray((this._config as any)?.pro_skill) &&
      (this._config as any).pro_skill.includes('editor')
        ? html`

            <div
              class="card-config"
              style="
                border-right: 4px solid var(--primary-color);
              "
            >

              <div class="optionPro">
                <div class="row">
                <ha-icon
                  .icon=${`mdi:content-save-cog-outline`}
                  style="color: var(--primary-color);"
                ></ha-icon>
                  <div class="title" style="margin-top: 0; color: var(--primary-color);">
                    Apply your pending changes manually
                  </div>
                  <floor3dpro-button
                    class="add-button"
                    style="margin-left: auto;"
                    label="+ SAVE"
                    @click=${() => {
                      this._proEditorlLog('Manual Commit Send', 'editor:manual-commit');
                      this._commitConfig('manual');
                    }}
                  ></floor3dpro-button>

                </div>

              </div>
            </div>

          `
        : ``}
      ${this._createProFeatureSettingElement()}
      ${this._createModelElement()} ${this._createAppearanceElement()}
      ${show ? html` ${this._createOverlayElement()} ` : ``} ${this._createEntitiesElement()}
      ${this._createObjectGroupsElement()} ${this._createZoomAreasElement()}
    `;
  }

  private _asArray<T>(value: T | T[] | undefined | null): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  private _hasProLogEngine(): boolean {
    const logs = this._asArray(this._config?.pro_log as any);
    return logs.includes('engine') || logs.includes('all');
  }

  private _hasProSkill(skill: 'level' | 'editor' | 'mobile'): boolean {
    const skills = this._asArray(this._config?.pro_skill as any);
    return skills.includes(skill) || skills.includes('all');
  }

  private _setProLogEngine(enabled: boolean): void {
    if (!this._config) return;
    const current = this._asArray(this._config.pro_log as any).filter((x) => x !== 'all');
    const next = enabled ? Array.from(new Set([...current, 'engine'])) : current.filter((x) => x !== 'engine');
    this._config = { ...this._config, pro_log: next };
    this._commitConfig('proFeatures');
  }

  private _setProSkill(skill: 'level' | 'editor' | 'mobile', enabled: boolean): void {
    if (!this._config) return;
    const current = this._asArray(this._config.pro_skill as any).filter((x) => x !== 'all');
    const next = enabled ? Array.from(new Set([...current, skill])) : current.filter((x) => x !== skill);
    this._config = { ...this._config, pro_skill: next };
    this._commitConfig('proFeatures');
  }

  private _createProFeatureSettingElement(): TemplateResult {
    if (!this.hass || !this._config || !this._options || !(this._options as any).pro_feature_setting) {
      return html``;
    }

    const options = (this._options as any).pro_feature_setting;

    const engine = this._hasProLogEngine();
    const level = this._hasProSkill('level');
    const editor = this._hasProSkill('editor');
    const mobile = this._hasProSkill('mobile');

    return html`
      <div class="category" id="card">
        <div class="sub-category" @click=${this._toggleThing} .options=${options} .optionsTarget=${this._options}>
          <div class="row">
            <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
            <div class="title">${options.name}</div>
            <ha-icon .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`} style="margin-left: auto;"></ha-icon>
          </div>
          <div class="secondary">${options.secondary}</div>
        </div>
        ${options.show
          ? html`
              <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                <div class="pro-feature-skill-row">
                  <div class="pro-feature-skill-item">
                    <ha-switch
                      .checked=${engine}
                      @change=${(ev: Event) => this._setProLogEngine((ev.target as any).checked)}
                    ></ha-switch>
                    <span>Pro log engine</span>
                  </div>
                </div>

                <div class="pro-feature-skill-row">
                  <div class="pro-feature-skill-label">Pro skill modules</div>
                  <div class="pro-feature-skill-toggles">
                    <div class="pro-feature-skill-item">
                      <ha-switch
                        .checked=${level}
                        @change=${(ev: Event) => this._setProSkill('level', (ev.target as any).checked)}
                      ></ha-switch>
                      <span>level</span>
                    </div>
                    <div class="pro-feature-skill-item">
                      <ha-switch
                        .checked=${editor}
                        @change=${(ev: Event) => this._setProSkill('editor', (ev.target as any).checked)}
                      ></ha-switch>
                      <span>editor</span>
                    </div>
                    <div class="pro-feature-skill-item">
                      <ha-switch
                        .checked=${mobile}
                        @change=${(ev: Event) => this._setProSkill('mobile', (ev.target as any).checked)}
                      ></ha-switch>
                      <span>mobile</span>
                    </div>
                  </div>
                </div>
              </div>
            `
          : ''}
      </div>
    `;
  }

  private _preview_card(): Element {
    let root: any = document.querySelector('home-assistant');
    root = root && root.shadowRoot;
    root = root && root.querySelector('hui-dialog-edit-card');
    root = root && root.shadowRoot;
    root = root && root.querySelector('ha-dialog');

    // Faz-0 Deterministic Correction: (Fix) deterministic guard (Original file error correction)
    // Home Assistant internal DOM can change; if we cannot locate the preview safely, just return null.
    if (!root || !root.getElementsByTagName) {
      return null;
    }

    //Faz-0 Isolation Correction: (Fix) DOM custom element isolation for pro components    
    const preview_card: HTMLCollection = root.getElementsByTagName('floor3dpro-card');

    if (preview_card.length == 0) {
      return null;
    } else {
      return preview_card.item(0);
    }
  }


  private _config_changed(): void {
    console.log('Config change start');
    let preview_card: any = this._preview_card();

    if (preview_card) {
      preview_card.rerender();
    }
  }

  private _createObjectGroupsValues(): TemplateResult[] {
    if (!this.hass || !this._config) {
      return [html``];
    }

    const options = this._options.object_groups;
    //console.log('options group values: ' + JSON.stringify(options));
    const valueElementArray: TemplateResult[] = [];
    for (const config of this._configObjectArray) {
      const index = this._configObjectArray.indexOf(config);
      valueElementArray.push(html`
        <div class="sub-category" style="display: flex; flex-direction: row; align-items: center;">
          <div style="display: flex; align-items: center; flex-direction: column;">
            <div
              style="font-size: 10px; margin-bottom: -8px; opacity: 0.5;"
              @click=${this._toggleThing}
              .options=${options.options.object_groups[index]}
              .optionsTarget=${options.options.object_groups}
              .index=${index}
            >
              options
            </div>
            <ha-icon
              icon="mdi:chevron-${options.options.object_groups[index].show ? 'up' : 'down'}"
              @click=${this._toggleThing}
              .options=${options.options.object_groups[index]}
              .optionsTarget=${options.options.object_groups}
              .index=${index}
            ></ha-icon>
          </div>
          <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
            <floor3dpro-textfield
              label="Object Group"
              @input=${this._valueChanged}
              .configAttribute=${'object_group'}
              .configObject=${this._configObjectArray[index]}
              .value=${config.object_group ? config.object_group : ''}
            >
            </floor3dpro-textfield>
          </div>
          ${index !== 0
            ? html`
                <ha-icon
                  class="ha-icon-large"
                  icon="mdi:arrow-up"
                  @click=${this._moveObject_Group}
                  .configDirection=${'up'}
                  .configArray=${this._config!.object_groups}
                  .arrayAttribute=${'object_groups'}
                  .arraySource=${this._config}
                  .index=${index}
                ></ha-icon>
              `
            : html` <ha-icon icon="mdi:arrow-up" style="opacity: 25%;" class="ha-icon-large"></ha-icon> `}
          ${index !== this._configObjectArray.length - 1
            ? html`
                <ha-icon
                  class="ha-icon-large"
                  icon="mdi:arrow-down"
                  @click=${this._moveObject_Group}
                  .configDirection=${'down'}
                  .configArray=${this._config!.object_groups}
                  .arrayAttribute=${'object_groups'}
                  .arraySource=${this._config}
                  .index=${index}
                ></ha-icon>
              `
            : html` <ha-icon icon="mdi:arrow-down" style="opacity: 25%;" class="ha-icon-large"></ha-icon> `}
          <ha-icon

            icon="mdi:trash-can-outline"
            @click=${this._removeObject_Group}
            .configAttribute=${'object_group'}
            .configArray=${'object_groups'}
            .configIndex=${index}
          ></ha-icon>
        </div>
        ${options.options.object_groups[index].show
          ? html` <div class="options">${this._createObject_GroupElement(index)}</div> `
          : ''}
      `);
    }
    return valueElementArray;
  }

  private _createActionsElement(): TemplateResult {
    const options = this._options.actions;
    return html`
      <div class="sub-category" style="opacity: 0.5;">
        <div>
          <div class="row">
            <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
            <div class="title">${options.name}</div>
          </div>
          <div class="secondary">${options.secondary}</div>
        </div>
      </div>
    `;
  }

  private _createZoomAreasValues(): TemplateResult[] {
    if (!this.hass || !this._config) {
      return [html``];
    }

    const options = this._options.zoom_areas;

    const valueElementArray: TemplateResult[] = [];
    for (const config of this._configZoomArray) {
      const index = this._configZoomArray.indexOf(config);
      valueElementArray.push(html`
        <div class="sub-category" style="display: flex; flex-direction: row; align-items: center;">
          <div style="display: flex; align-items: center; flex-direction: column;">
            <div
              style="font-size: 10px; margin-bottom: -8px; opacity: 0.5;"
              @click=${this._toggleThing}
              .options=${options.options.zoom_areas[index]}
              .optionsTarget=${options.options.zoom_areas}
              .index=${index}
            >
              options
            </div>
            <ha-icon
              icon="mdi:chevron-${options.options.zoom_areas[index].show ? 'up' : 'down'}"
              @click=${this._toggleThing}
              .options=${options.options.zoom_areas[index]}
              .optionsTarget=${options.options.zoom_areas}
              .index=${index}
            ></ha-icon>
          </div>
          <div class="values" style="flex-grow: 1;">
            <floor3dpro-textfield
              label="Zoom"
              @input=${this._valueChanged}
              .configAttribute=${'zoom'}
              .configObject=${this._configZoomArray[index]}
              .value=${config.zoom ? config.zoom : ''}
            >
            </floor3dpro-textfield>
          </div>
          ${index !== 0
            ? html`
                <ha-icon
                  class="ha-icon-large"
                  icon="mdi:arrow-up"
                  @click=${this._moveZoomArea}
                  .configDirection=${'up'}
                  .configArray=${this._config!.zoom_areas}
                  .arrayAttribute=${'zoom_areas'}
                  .arraySource=${this._config}
                  .index=${index}
                ></ha-icon>
              `
            : html` <ha-icon icon="mdi:arrow-up" style="opacity: 25%;" class="ha-icon-large"></ha-icon> `}
          ${index !== this._configZoomArray.length - 1
            ? html`
                <ha-icon
                  class="ha-icon-large"
                  icon="mdi:arrow-down"
                  @click=${this._moveZoomArea}
                  .configDirection=${'down'}
                  .configArray=${this._config!.zoom_areas}
                  .arrayAttribute=${'zoom_areas'}
                  .arraySource=${this._config}
                  .index=${index}
                ></ha-icon>
              `
            : html` <ha-icon icon="mdi:arrow-down" style="opacity: 25%;" class="ha-icon-large"></ha-icon> `}
          <ha-icon

            icon="mdi:trash-can-outline"
            @click=${this._removeZoomArea}
            .configAttribute=${'zoom'}
            .configArray=${'zoom_areas'}
            .configIndex=${index}
          ></ha-icon>
        </div>
        ${options.options.zoom_areas[index].show
          ? html` <div class="options">${this._createZoomElement(index)}</div> `
          : ''}
      `);
    }
    return valueElementArray;
  }

  private _createEntitiesValues(): TemplateResult[] {
    if (!this.hass || !this._config) {
      return [html``];
    }

    const options = this._options.entities;
    if (!this._entity_ids) {
      this._entity_ids = Object.keys(this.hass.states).sort(function (a, b) {
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });
    }
    const valueElementArray: TemplateResult[] = [];
    for (const config of this._configArray) {
      const index = this._configArray.indexOf(config);
      valueElementArray.push(html`
        <div class="sub-category" style="display: flex; flex-direction: row; align-items: center;">
          <div style="display: flex; align-items: center; flex-direction: column;">
            <div
              style="font-size: 10px; margin-bottom: -8px; opacity: 0.5;"
              @click=${this._toggleThing}
              .options=${options.options.entities[index]}
              .optionsTarget=${options.options.entities}
              .index=${index}
            >
              options
            </div>
            <ha-icon
              icon="mdi:chevron-${options.options.entities[index].show ? 'up' : 'down'}"
              @click=${this._toggleThing}
              .options=${options.options.entities[index]}
              .optionsTarget=${options.options.entities}
              .index=${index}
            ></ha-icon>
          </div>
          <div class="values" style="flex-grow: 1; margin-bottom: 12px;">
            <ha-selector
              .hass=${this.hass}
              .selector=${{ entity: {} }}
              .value=${config.entity ?? ''}
              label="Entity (Required)"
              @value-changed=${(ev: any) => {
                const value = ev?.detail?.value ?? '';
                this._configArray[index].entity = value;
                this._config.entities = this._configArray;
                this._commitConfig('entityChanged');
              }}
            ></ha-selector>
          </div>
          ${index !== 0
            ? html`
                <ha-icon
                  class="ha-icon-large"
                  icon="mdi:arrow-up"
                  @click=${this._moveEntity}
                  .configDirection=${'up'}
                  .configArray=${this._config!.entities}
                  .arrayAttribute=${'entities'}
                  .arraySource=${this._config}
                  .index=${index}
                ></ha-icon>
              `
            : html` <ha-icon icon="mdi:arrow-up" style="opacity: 25%;" class="ha-icon-large"></ha-icon> `}
          ${index !== this._configArray.length - 1
            ? html`
                <ha-icon
                  class="ha-icon-large"
                  icon="mdi:arrow-down"
                  @click=${this._moveEntity}
                  .configDirection=${'down'}
                  .configArray=${this._config!.entities}
                  .arrayAttribute=${'entities'}
                  .arraySource=${this._config}
                  .index=${index}
                ></ha-icon>
              `
            : html` <ha-icon icon="mdi:arrow-down" style="opacity: 25%;" class="ha-icon-large"></ha-icon> `}
          <ha-icon

            icon="mdi:trash-can-outline"
            @click=${this._removeEntity}
            .configAttribute=${'entity'}
            .configArray=${'entities'}
            .configIndex=${index}
          ></ha-icon>
        </div>
        ${options.options.entities[index].show
          ? html`
              <div class="options">
                ${this._createTypeElement(index)} ${this._createLightElement(index)} ${this._createRoomElement(index)}
                ${this._createColorConditionElement(index)} ${this._createHideElement(index)}
                ${this._createShowElement(index)} ${this._createTextElement(index)} ${this._createImageElement(index)} ${this._createGestureElement(index)}
                ${this._createDoorElement(index)} ${this._createCoverElement(index)} ${this._createRotateElement(index)}
              </div>
            `
          : ''}
      `);
    }
    return valueElementArray;
  }

  private _createZoomAreasElement(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }
    const options = this._options.zoom_areas;

    return html`
      <div class="card-config">
        <div class="option" @click=${this._toggleThing} .options=${options} .optionsTarget=${this._options}>
          <div class="row">
            <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
            <div class="title">${options.name}</div>
            <ha-icon .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`} style="margin-left: auto;"></ha-icon>
          </div>
          <div class="secondary">${options.secondary}</div>
        </div>
        ${options.show
          ? html`
              <div class="card-background" style="max-height: 400px; overflow: auto;">
                ${this._createZoomAreasValues()}
                <div class="sub-category" style="display: flex; flex-direction: column; align-items: flex-end;">
                  <floor3dpro-button
                    class="add-button"
                    label="+ Add Zoom Area"
                    .configArray=${this._configZoomArray}
                    .configAddValue=${'zoom'}
                    .sourceArray=${this._config.zoom_areas}
                    @click=${this._addZoomArea}
                  ></floor3dpro-button>
                </div>
              </div>
            `
          : ''}
      </div>
    `;
  }

  private _createObjectGroupsElement(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }
    const options = this._options.object_groups;

    return html`
      <div class="card-config">
        <div class="option" @click=${this._toggleThing} .options=${options} .optionsTarget=${this._options}>
          <div class="row">
            <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
            <div class="title">${options.name}</div>
            <ha-icon .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`} style="margin-left: auto;"></ha-icon>
          </div>
          <div class="secondary">${options.secondary}</div>
        </div>
        ${options.show
          ? html`
              <div class="card-background" style="max-height: 400px; overflow: auto;">
                ${this._createObjectGroupsValues()}
                <div class="sub-category" style="display: flex; flex-direction: column; align-items: flex-end;">
                  <floor3dpro-button
                    class="add-button"
                    label="+ Add Object Group"
                    .configArray=${this._configObjectArray}
                    .configAddValue=${'object_group'}
                    .sourceArray=${this._config.object_groups}
                    @click=${this._addObject_Group}
                  ></floor3dpro-button>
                </div>
              </div>
            `
          : ''}
      </div>
    `;
  }

  private _createEntitiesElement(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }
    const options = this._options.entities;

    return html`
      <div class="card-config">
        <div class="option" @click=${this._toggleThing} .options=${options} .optionsTarget=${this._options}>
          <div class="row">
            <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
            <div class="title">${options.name}</div>
            <ha-icon .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`} style="margin-left: auto;"></ha-icon>
          </div>
          <div class="secondary">${options.secondary}</div>
        </div>
        ${options.show
          ? html`
              <div class="card-background" style="max-height: 400px; overflow: auto;">
                ${this._createEntitiesValues()}
                <div class="sub-category" style="display: flex; flex-direction: column; align-items: flex-end;">
                  <floor3dpro-button
                    class="add-button"
                    label="+ Add Entity"
                    .configArray=${this._configArray}
                    .configAddValue=${'entity'}
                    .sourceArray=${this._config.entities}
                    @click=${this._addEntity}
                  ></floor3dpro-button>
                </div>
              </div>
            `
          : ''}
      </div>
    `;
  }

  // Faz-0 Deterministic Correction: (Fix) Guard reflex (Original file error correction)
  private _createModelElement(): TemplateResult {
    if (!this.hass || !this._config || !this._options || !this._options.model) {
      return html``;
    }
    const config: any = this._config;
    const index = null;
    const options = this._options.model;
    return html`
      <div class="category" id="card">
        <div class="sub-category" @click=${this._toggleThing} .options=${options} .optionsTarget=${this._options}>
          <div class="row">
            <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
            <div class="title">${options.name}</div>
            <ha-icon .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`} style="margin-left: auto;"></ha-icon>
          </div>
          <div class="secondary">${options.secondary}</div>
        </div>
        ${options.show
          ? html`
              <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                <floor3dpro-textfield
                  label="Name"
                  fullwidth
                  .value=${config.name ? config.name : ''}
                  .configObject=${config}
                  .configAttribute=${'name'}
                  @input=${this._valueChanged}
                >
                </floor3dpro-textfield>
                <floor3dpro-textfield
                  label="Path"
                  fullwidth
                  .value=${config.path ? config.path : ''}
                  .configObject=${config}
                  .configAttribute=${'path'}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
                <floor3dpro-textfield
                  label="Obj/Glb file"
                  fullwidth
                  .value=${config.objfile ? config.objfile : ''}
                  .configObject=${config}
                  .configAttribute=${'objfile'}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
                <floor3dpro-textfield
                  label="Mtl Wavefront file"
                  fullwidth
                  .value=${config.mtlfile ? config.mtlfile : ''}
                  .configObject=${config}
                  .configAttribute=${'mtlfile'}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
                <floor3dpro-textfield
                  label="Object list JSON"
                  .value=${config.objectlist ? config.objectlist : ''}
                  .configObject=${config}
                  .configAttribute=${'objectlist'}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
              </div>
            `
          : ''}
      </div>
    `;
  }

  private _createOverlayElement(): TemplateResult {
    if (!this.hass) {
      return html``;
    }
    const config: any = this._config;
    const index = null;
    const options = this._options.overlay;
    return html`
      <div class="category" id="card">
        <div class="sub-category" @click=${this._toggleThing} .options=${options} .optionsTarget=${this._options}>
          <div class="row">
            <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
            <div class="title">${options.name}</div>
            <ha-icon .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`} style="margin-left: auto;"></ha-icon>
          </div>
          <div class="secondary">${options.secondary}</div>
        </div>
        ${options.show
          ? html`
              <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                <floor3dpro-textfield
                  label="Overlay Background color"
                  fullwidth
                  size="20"
                  .value=${config.overlay_bgcolor ? config.overlay_bgcolor : 'transparent'}
                  .configObject=${config}
                  .configAttribute=${'overlay_bgcolor'}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
                <floor3dpro-textfield
                  label="Overlay Foreground color"
                  fullwidth
                  size="20"
                  .value=${config.overlay_fgcolor ? config.overlay_fgcolor : 'black'}
                  .configObject=${config}
                  .configAttribute=${'overlay_fgcolor'}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
                <ha-select
                  label="Overlay Alignment"
                  size="40"
                  @selected=${this._valueChanged}
                  .value=${config.overlay_alignment ? config.overlay_alignment : 'top-left'}
                  .configObject=${config}
                  .configAttribute=${'overlay_alignment'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                  <ha-list-item></ha-list-item>
                  <ha-list-item value="top-left">top-left</ha-list-item>
                  <ha-list-item value="top-right">top-right</ha-list-item>
                  <ha-list-item value="bottom-left">bottom-left</ha-list-item>
                  <ha-list-item value="bottom-right">bottom-right</ha-list-item>
                </ha-select>
                <floor3dpro-formfield alignEnd label="Overlay Width %">
                  <floor3dpro-textfield
                    type="number"
                    min="0"
                    max="100"
                    fullwidth
                    .ignoreNull=${false}
                    .value=${config.overlay_width ? config.overlay_width : '33'}
                    .configObject=${config}
                    .configAttribute=${'overlay_width'}
                    @input=${this._valueChanged}
                  ></floor3dpro-textfield>
                </floor3dpro-formfield>
                <floor3dpro-formfield alignEnd label="Overlay Height %">
                  <floor3dpro-textfield
                    type="number"
                    min="0"
                    max="100"
                    fullwidth
                    .ignoreNull=${false}
                    .value=${config.overlay_height ? config.overlay_height : '20'}
                    .configObject=${config}
                    .configAttribute=${'overlay_height'}
                    @input=${this._valueChanged}
                  ></floor3dpro-textfield>
                </floor3dpro-formfield>
                <floor3dpro-textfield
                  label="Overlay Font"
                  size="40"
                  .value="${config.overlay_font ? config.overlay_font : ''}"
                  .configObject=${config}
                  .configAttribute=${'overlay_font'}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
                <floor3dpro-textfield
                  label="Overlay Font size"
                  .value="${config.overlay_fontsize ? config.overlay_fontsize : ''}"
                  .configObject=${config}
                  .configAttribute=${'overlay_fontsize'}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
              </div>
            `
          : ''}
      </div>
    `;
  }

  private _createAppearanceElement(): TemplateResult {
    if (!this.hass) {
      return html``;
    }
    const config: any = this._config;
    const index = null;
    const options = this._options.appearance;
    return html`
      <div class="category" id="card">
        <div class="sub-category" @click=${this._toggleThing} .options=${options} .optionsTarget=${this._options}>
          <div class="row">
            <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
            <div class="title">${options.name}</div>
            <ha-icon .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`} style="margin-left: auto;"></ha-icon>
          </div>
          <div class="secondary">${options.secondary}</div>
        </div>
        ${options.show
          ? html`
             <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                <floor3dpro-textfield
                  label="Style"
                  .value=${config.style ? config.style : ''}
                  .configObject=${config}
                  .configAttribute=${'style'}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
                <ha-select
                  label="Lock Camera (yes/<no>)"
                  @selected=${this._valueChanged}
                  .value=${config.lock_camera ? config.lock_camera : 'no'}
                  .configObject=${config}
                  .configAttribute=${'lock_camera'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                <ha-select
                  label="Selection Mode (yes/<no>)"
                  @selected=${this._valueChanged}
                  .value=${config.selectionMode ? config.selectionMode : 'no'}
                  .configObject=${config}
                  .configAttribute=${'selectionMode'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                <ha-select
                  label="Edit Mode PopUp (<yes>/no)"
                  @selected=${this._valueChanged}
                  .value=${config.editModeNotifications ? config.editModeNotifications : 'yes'}
                  .configObject=${config}
                  .configAttribute=${'editModeNotifications'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                <ha-select
                  label="Header (<yes>/no)"
                  @selected=${this._valueChanged}
                  .value=${config.header ? config.header : 'yes'}
                  .configObject=${config}
                  .configAttribute=${'header'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                <ha-select
                  label="Click (no dblclick, yes/<no>)"
                  @selected=${this._valueChanged}
                  .value=${config.click ? config.click : 'no'}
                  .configObject=${config}
                  .configAttribute=${'click'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                <ha-select
                  label="Overlay (yes/<no>)"
                  @selected=${this._valueChanged}
                  .value=${config.overlay ? config.overlay : 'no'}
                  .configObject=${config}
                  .configAttribute=${'overlay'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                <floor3dpro-textfield
                  label="Background Color"
                  fullwidth
                  .value=${config.backgroundColor ? config.backgroundColor : '#aaaaaa'}
                  .configObject=${config}
                  .configAttribute=${'backgroundColor'}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
                <ha-select
                  label="Hide Levels Menu (yes/<no>)"
                  @selected=${this._valueChanged}
                  .value=${config.hideLevelsMenu ? config.hideLevelsMenu : 'no'}
                  .configObject=${config}
                  .configAttribute=${'hideLevelsMenu'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                ></floor3dpro-textfield>
                <floor3dpro-formfield alignEnd label="Global Scene Light (0..1)" >
                  <floor3dpro-textfield
                    type="number"
                    min=0.00
                    max=1.00
                    step=0.01
                    .value=${config.globalLightPower ? config.globalLightPower : '0.8'}
                    .configObject=${config}
                    .configAttribute=${'globalLightPower'}
                    .ignoreNull=${false}
                    @input=${this._valueChanged}
                  ></floor3dpro-textfield>
                </floor3dpro-formfield>
                <ha-select
                  label="Shadow (yes/<no>)"
                  @selected=${this._valueChanged}
                  .value=${config.shadow ? config.shadow : 'no'}
                  .configObject=${config}
                  .configAttribute=${'shadow'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                <ha-select
                  label="+ Lights - Perf (yes/<no>)"
                  @selected=${this._valueChanged}
                  .value=${config.extralightmode ? config.extralightmode : 'no'}
                  .configObject=${config}
                  .configAttribute=${'extralightmode'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                <ha-select
                  label="Show Axes (yes/<no>)"
                  @selected=${this._valueChanged}
                  .value=${config.show_axes ? config.show_axes : 'no'}
                  .configObject=${config}
                  .configAttribute=${'show_axes'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                <ha-select
                  label="Sky (yes/<no>)"
                  @selected=${this._valueChanged}
                  .value=${config.sky ? config.sky : 'no'}
                  .configObject=${config}
                  .configAttribute=${'sky'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                    <ha-list-item></ha-list-item>
                    <ha-list-item value="yes">yes</ha-list-item>
                    <ha-list-item value="no">no</ha-list-item>
                </ha-select>
                <floor3dpro-textfield
                  label="North Direction (JSON) e.g. {\"x\":0,\"z\":-1}"
                  @input=${this._valueChanged}
                  .value=${config.north ? JSON.stringify(config.north) : ''}
                  .configObject=${config}
                  .configAttribute=${'north'}
                  .ignoreNull=${false}
                ></floor3dpro-textfield>
                <floor3dpro-textfield
                  label="Camera Position (JSON)"
                  @input=${this._valueChanged}
                  .value=${config.camera_position ? JSON.stringify(config.camera_position) : ''}
                  .configObject=${config}
                  .configAttribute=${'camera_position'}
                  .ignoreNull=${false}
                ></floor3dpro-textfield>
                <floor3dpro-textfield
                  label="Camera Rotation (JSON)"
                  @input=${this._valueChanged}
                  .value=${config.camera_rotate ? JSON.stringify(config.camera_rotate) : ''}
                  .configObject=${config}
                  .configAttribute=${'camera_rotate'}
                  .ignoreNull=${false}
                ></floor3dpro-textfield>
                <floor3dpro-textfield
                  label="Camera Target (JSON)"
                  @input=${this._valueChanged}
                  .value=${config.camera_target ? JSON.stringify(config.camera_target) : ''}
                  .configObject=${config}
                  .configAttribute=${'camera_target'}
                  .ignoreNull=${false}
                ></floor3dpro-textfield>
              </div>
            `
          : ''}
      </div>
    `;
  }

  private _toggleThing(ev): void {
    const options = ev.target.options;
    const show = !options.show;
    if (ev.target.optionsTarget) {
      if (Array.isArray(ev.target.optionsTarget)) {
        for (const options of ev.target.optionsTarget) {
          options.show = false;
        }
      } else {
        for (const [key] of Object.entries(ev.target.optionsTarget)) {
          ev.target.optionsTarget[key].show = false;
        }
      }
    }
    options.show = show;
    this._toggle = !this._toggle;
  }

  private _addObject_Group(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    let newObject;
    if (target.configAddObject) {
      newObject = target.configAddObject;
    } else {
      newObject = { [target.configAddValue]: '' };
    }
    const newArray = target.configArray.slice();
    newArray.push(newObject);
    this._config.object_groups = newArray;
    this._commitConfig('addObject_Group');
  }

  private _addEntity(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    let newObject;
    if (target.configAddObject) {
      newObject = target.configAddObject;
    } else {
      newObject = { [target.configAddValue]: '' };
    }
    const newArray = target.configArray.slice();
    newArray.push(newObject);
    this._config.entities = newArray;
    this._commitConfig('addEntity');
  }

  private _addZoomArea(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    let newObject;
    if (target.configAddObject) {
      newObject = target.configAddObject;
    } else {
      newObject = { [target.configAddValue]: '' };
    }
    const newArray = target.configArray.slice();
    newArray.push(newObject);
    this._config.zoom_areas = newArray;
    this._commitConfig('addZoomArea');
  }

  private _moveEntity(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    let newArray = target.configArray.slice();
    if (target.configDirection == 'up') newArray = arrayMove(newArray, target.index, target.index - 1);
    else if (target.configDirection == 'down') newArray = arrayMove(newArray, target.index, target.index + 1);
    this._config.entities = newArray;
    this._commitConfig('moveEntity');
  }

  private _moveZoomArea(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    let newArray = target.configArray.slice();
    if (target.configDirection == 'up') newArray = arrayMove(newArray, target.index, target.index - 1);
    else if (target.configDirection == 'down') newArray = arrayMove(newArray, target.index, target.index + 1);
    this._config.zoom_areas = newArray;
    this._commitConfig('moveZoomArea');
  }

  private _moveObject_Group(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    let newArray = target.configArray.slice();
    if (target.configDirection == 'up') newArray = arrayMove(newArray, target.index, target.index - 1);
    else if (target.configDirection == 'down') newArray = arrayMove(newArray, target.index, target.index + 1);
    this._config.object_groups = newArray;
    this._commitConfig('moveObject_Group');
  }

  private _removeEntity(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    const entitiesArray: Floor3dCardConfig[] = [];
    let index = 0;
    for (const config of this._configArray) {
      if (target.configIndex !== index) {
        entitiesArray.push(config);
      }
      index++;
    }
    const newConfig = { [target.configArray]: entitiesArray };
    this._config = Object.assign(this._config, newConfig);
    this._commitConfig('removeEntity');
  }

  private _removeZoomArea(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    const zoomareasArray: Floor3dCardConfig[] = [];
    let index = 0;
    for (const config of this._configArray) {
      if (target.configIndex !== index) {
        zoomareasArray.push(config);
      }
      index++;
    }
    const newConfig = { [target.configArray]: zoomareasArray };
    this._config = Object.assign(this._config, newConfig);
    this._commitConfig('removeZoomArea');
  }

  private _removeObject_Group(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    const object_groupsArray: Floor3dCardConfig[] = [];
    let index = 0;
    for (const config of this._configObjectArray) {
      if (target.configIndex !== index) {
        object_groupsArray.push(config);
      }
      index++;
    }
    const newConfig = { [target.configArray]: object_groupsArray };
    this._config = Object.assign(this._config, newConfig);
    this._commitConfig('removeObject_Group');
  }

  private _createTypeElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.threed;
    const config = this._configArray[index];
    return html`
      <div class="category" id="type" style="margin-bottom: 12px;">
        <div
          class="sub-category"
          @click=${this._toggleThing}
          .options=${options}
          .optionsTarget=${this._options.entities.options.entities[index].options}
        >
          <div class="row">
            <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
            <div class="title">${options.name}</div>
            <ha-icon .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`} style="margin-left: auto;"></ha-icon>
          </div>
          <div class="secondary">${options.secondary}</div>
        </div>
        ${options.show
          ? html`
              <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                <floor3dpro-textfield
                  label="Entity template"
                  fullwidth
                  .value=${config.entity_template ? config.entity_template : ''}
                  .configAttribute=${'entity_template'}
                  .configObject=${config}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
                <floor3dpro-textfield
                  label="Color entity (supplies colour and brightness; light and color types)"
                  fullwidth
                  .value=${config.color_entity ? config.color_entity : ''}
                  .configAttribute=${'color_entity'}
                  .configObject=${config}
                  @input=${this._valueChanged}
                ></floor3dpro-textfield>
                <ha-select
                  label="Action"
                  @selected=${this._valueChanged}
                  .value=${config.action ? config.action : null}
                  .optionTgt=${this._options.entities.options.entities[index].options}
                  .configObject=${config}
                  .configAttribute=${'action'}
                  .ignoreNull=${false}
                  @closed=${(ev) => ev.stopPropagation()}
                >
                  <ha-list-item></ha-list-item>
                  <ha-list-item value="more-info">more-info</ha-list-item>
                  <ha-list-item value="overlay">overlay</ha-list-item>
                  <ha-list-item value="default">default</ha-list-item>
                </ha-select>
                <ha-select
                  label="3D Type"
                  @selected=${this._typeChanged}
                  .value=${config.type3d ? config.type3d : null}
                  .optionTgt=${this._options.entities.options.entities[index].options}
                  .configObject=${config}
                  .configAttribute=${'type3d'}
                  .ignoreNull=${false}
                  .configIndex=${index}
                  fixedMenuPosition
                  naturalMenuWidth
                  @closed=${(ev) => ev.stopPropagation()}
                >
                  <ha-list-item></ha-list-item>
                  <ha-list-item value="light">light</ha-list-item>
                  <ha-list-item value="color">color</ha-list-item>
                  <ha-list-item value="room">room</ha-list-item>
                  <ha-list-item value="hide">hide</ha-list-item>
                  <ha-list-item value="show">show</ha-list-item>
                  <ha-list-item value="text">text</ha-list-item>
                  <ha-list-item value="image">image</ha-list-item>
                  <ha-list-item value="door">door</ha-list-item>
                  <ha-list-item value="cover">cover</ha-list-item>
                  <ha-list-item value="rotate">rotate</ha-list-item>
                  <ha-list-item value="gesture">gesture</ha-list-item>
                  <ha-list-item value="camera">camera</ha-list-item>
                </ha-select>
                ${!this._objects
                  ? html`
                      <floor3dpro-textfield
                        label="Object"
                        .value=${config.object_id ? config.object_id : ''}
                        .configAttribute=${'object_id'}
                        .configObject=${config}
                        @input=${this._valueChanged}
                        required
                      ></floor3dpro-textfield>
                    `
                  : html`
                      <ha-select
                        label="Object id"
                        @selected=${this._valueChanged}
                        .value=${config.object_id}
                        .configAttribute=${'object_id'}
                        .configObject=${config}
                        .ignoreNull=${false}
                        required
                        @closed=${(ev) => ev.stopPropagation()}
                      >
                        ${this._objects.map((object_id) => {
                          return html` <ha-list-item value="${object_id}">${object_id}</ha-list-item> `;
                        })}
                        ${this._configObjectArray.map((object_group) => {
                          return html`
                            <ha-list-item value="${'<' + object_group.object_group + '>'}"
                              >${'<' + object_group.object_group + '>'}</ha-list-item
                            >
                          `;
                        })}
                      </ha-select>
                    `}
              </div>
            `
          : ''}
      </div>
    `;
  }

  private _createObject_GroupElement(index): TemplateResult {
    const options = this._options.object_groups.options.object_groups[index];
    const config = this._configObjectArray[index];
    const arrayLength = config.objects ? config.objects.length : 0;
    const visible = true;
    return html`
      ${visible
        ? html`
            <div class="category" id="bar">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.object_groups.options.object_groups}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-background" style="overflow: auto; max-height: 420px;">
                      ${arrayLength > 0 ? html` ${this._createObjectValues(index)} ` : ''}
                      <div class="sub-category" style="display: flex; flex-direction: column; align-items: flex-end;">
                        <floor3dpro-button
                          class="add-button"
                          label="+ Add Object"
                          .index=${index}
                          @click=${this._addObject}
                        ></floor3dpro-button>
                      </div>
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createColorConditionElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.color;
    const config = this._configArray[index];
    const visible: boolean = config.type3d ? config.type3d === 'color' || config.type3d === 'room' : false;
    const arrayLength = config.colorcondition ? config.colorcondition.length : 0;
    return html`
      ${visible
        ? html`
            <div class="category" id="bar">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-background" style="overflow: auto; max-height: 420px;">
                      ${arrayLength > 0 ? html` ${this._createColorConditionValues(index)} ` : ''}
                      <div class="sub-category" style="display: flex; flex-direction: column; align-items: flex-end;">
                        <floor3dpro-button
                          class="add-button"
                          label="+ Add Color Condition"
                          .index=${index}
                          @click=${this._addColorCondition}
                        ></floor3dpro-button>
                      </div>
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createObjectValues(index): TemplateResult[] {
    const config = this._configObjectArray[index];

    const objectValuesArray: TemplateResult[] = [];
    for (const object_id of config.objects) {
      const objectIndex = config.objects.indexOf(object_id);
      objectValuesArray.push(html`
        <div class="sub-category" style="display: flex; flex-direction: row; align-items: center;">
          <div class="value">
            <div style="display:flex;">
              <floor3dpro-textfield
                label="Object Id"
                .value="${object_id.object_id ? object_id.object_id : ''}"
                .objectAttribute=${'object_id'}
                .index=${index}
                .objectIndex=${objectIndex}
                @input=${this._updateObject}
              ></floor3dpro-textfield>
            </div>
          </div>
          <div style="display: flex;">
            ${objectIndex !== 0
              ? html`
                  <ha-icon
                    class="ha-icon-large"
                    icon="mdi:arrow-up"
                    @click=${this._moveObject}
                    .configDirection=${'up'}
                    .index=${index}
                    .objectIndex=${objectIndex}
                  ></ha-icon>
                `
              : html` <ha-icon icon="mdi:arrow-up" style="opacity: 25%;" class="ha-icon-large"></ha-icon> `}
            ${objectIndex !== config.objects.length - 1
              ? html`
                  <ha-icon
                    class="ha-icon-large"
                    icon="mdi:arrow-down"
                    @click=${this._moveObject}
                    .configDirection=${'down'}
                    .index=${index}
                    .objectIndex=${objectIndex}
                  ></ha-icon>
                `
              : html` <ha-icon icon="mdi:arrow-down" style="opacity: 25%;" class="ha-icon-large"></ha-icon> `}
            <ha-icon

              icon="mdi:trash-can-outline"
              @click=${this._removeObject}
              .index=${index}
              .objectIndex=${objectIndex}
            ></ha-icon>
          </div>
        </div>
      `);
    }
    return objectValuesArray;
  }

  private _createColorConditionValues(index): TemplateResult[] {
    const config = this._configArray[index];

    const colorconditionValuesArray: TemplateResult[] = [];
    for (const colorcondition of config.colorcondition) {
      const colorconditionIndex = config.colorcondition.indexOf(colorcondition);
      colorconditionValuesArray.push(html`
        <div class="sub-category" style="display: flex; flex-direction: row; align-items: center;">
          <div class="value">
            <div style="display:flex;">
              <floor3dpro-textfield
                label="Color"
                .value="${colorcondition.color ? colorcondition.color : ''}"
                .colorconditionAttribute=${'color'}
                .index=${index}
                .colorconditionIndex=${colorconditionIndex}
                @input=${this._updateColorCondition}
              ></floor3dpro-textfield>
              <floor3dpro-textfield
                label="State"
                .value="${colorcondition.state ? colorcondition.state : ''}"
                .colorconditionAttribute=${'state'}
                .index=${index}
                .colorconditionIndex=${colorconditionIndex}
                @input=${this._updateColorCondition}
              ></floor3dpro-textfield>
            </div>
          </div>
          <div style="display: flex;">
            ${colorconditionIndex !== 0
              ? html`
                  <ha-icon
                    class="ha-icon-large"
                    icon="mdi:arrow-up"
                    @click=${this._moveColorCondition}
                    .configDirection=${'up'}
                    .index=${index}
                    .colorconditionIndex=${colorconditionIndex}
                  ></ha-icon>
                `
              : html` <ha-icon icon="mdi:arrow-up" style="opacity: 25%;" class="ha-icon-large"></ha-icon> `}
            ${colorconditionIndex !== config.colorcondition.length - 1
              ? html`
                  <ha-icon
                    class="ha-icon-large"
                    icon="mdi:arrow-down"
                    @click=${this._moveColorCondition}
                    .configDirection=${'down'}
                    .index=${index}
                    .colorconditionIndex=${colorconditionIndex}
                  ></ha-icon>
                `
              : html` <ha-icon icon="mdi:arrow-down" style="opacity: 25%;" class="ha-icon-large"></ha-icon> `}
            <ha-icon

              icon="mdi:trash-can-outline"
              @click=${this._removeColorCondition}
              .index=${index}
              .colorconditionIndex=${colorconditionIndex}
            ></ha-icon>
          </div>
        </div>
      `);
    }
    return colorconditionValuesArray;
  }

  private _addObject(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;

    let objectArray = this._config.object_groups[target.index].objects;

    if (!objectArray) {
      objectArray = [];
    }

    const newObject = { object_id: '' };
    const newArray = objectArray.slice();
    newArray.push(newObject);

    this._configObjectArray[target.index].objects = newArray;

    this._config.object_groups = this._configObjectArray;
    this._commitConfig('addObject');
  }

  private _addColorCondition(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;

    let colorconditionArray = this._config.entities[target.index].colorcondition;

    if (!colorconditionArray) {
      colorconditionArray = [];
    }

    const newObject = { state: '', color: '' };
    const newArray = colorconditionArray.slice();
    newArray.push(newObject);

    this._configArray[target.index].colorcondition = newArray;

    this._config.entities = this._configArray;
    this._commitConfig('addColorCondition');
  }

  private _moveObject(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;

    const objectArray = this._config.object_groups[target.index].objects;

    let newArray = objectArray.slice();
    if (target.configDirection == 'up') {
      newArray = arrayMove(newArray, target.objectIndex, target.objectIndex - 1);
    } else if (target.configDirection == 'down') {
      newArray = arrayMove(newArray, target.objectIndex, target.objectIndex + 1);
    }

    this._configObjectArray[target.index].objects = newArray;

    this._config.object_groups = this._configObjectArray;
    this._commitConfig('moveObject');
  }

  private _moveColorCondition(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;

    const colorconditionArray = this._config.entities[target.index].colorcondition;

    let newArray = colorconditionArray.slice();
    if (target.configDirection == 'up') {
      newArray = arrayMove(newArray, target.colorconditionIndex, target.colorconditionIndex - 1);
    } else if (target.configDirection == 'down') {
      newArray = arrayMove(newArray, target.colorconditionIndex, target.colorconditionIndex + 1);
    }

    this._configArray[target.index].colorconditions = newArray;

    this._config.entities = this._configArray;
    this._commitConfig('moveColorCondition');
  }

  private _removeObject(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;

    const objectArray = this._configObjectArray[target.index].objects;

    const clonedArray = objectArray.slice();
    const newArray: any = [];
    let arrayIndex = 0;
    for (const config of clonedArray) {
      if (target.objectIndex !== arrayIndex) {
        newArray.push(clonedArray[arrayIndex]);
      }
      arrayIndex++;
    }
    if (newArray.length === 0) {
      delete this._configObjectArray[target.index].objects;
    } else {
      this._configObjectArray[target.index].objects = newArray;
    }
    this._config.object_groups = this._configObjectArray;
    this._commitConfig('removeObject');
  }

  private _removeColorCondition(ev): void {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;

    const colorconditionArray = this._configArray[target.index].colorcondition;

    const clonedArray = colorconditionArray.slice();
    const newArray: any = [];
    let arrayIndex = 0;
    for (const config of clonedArray) {
      if (target.colorconditionIndex !== arrayIndex) {
        newArray.push(clonedArray[arrayIndex]);
      }
      arrayIndex++;
    }
    if (newArray.length === 0) {
      delete this._configArray[target.index].colorcondition;
    } else {
      this._configArray[target.index].colorcondition = newArray;
    }
    this._config.entities = this._configArray;
    this._commitConfig('removeColorCondition');
  }

  private _updateObject(ev): void {
    const target = ev.target;

    const objectArray = this._configObjectArray[target.index].objects;

    const newobjectArray: any = [];
    for (const index in objectArray) {
      if (target.objectIndex == index) {
        const clonedObject = { ...objectArray[index] };
        const newObject = { [target.objectAttribute]: target.value };
        const mergedObject = Object.assign(clonedObject, newObject);
        if (target.value == '') {
          delete mergedObject[target.objectAttribute];
        }
        newobjectArray.push(mergedObject);
      } else {
        newobjectArray.push(objectArray[index]);
      }
    }

    this._configObjectArray[target.index].objects = newobjectArray;

    this._config.object_groups = this._configObjectArray;
    this._commitConfig('updateObject');
  }

  private _updateColorCondition(ev): void {
    const target = ev.target;

    const colorconditionArray = this._configArray[target.index].colorcondition;

    const newcolorconditionArray: any = [];
    for (const index in colorconditionArray) {
      if (target.colorconditionIndex == index) {
        const clonedObject = { ...colorconditionArray[index] };
        const newObject = { [target.colorconditionAttribute]: target.value };
        const mergedObject = Object.assign(clonedObject, newObject);
        if (target.value == '') {
          delete mergedObject[target.colorconditionAttribute];
        }
        newcolorconditionArray.push(mergedObject);
      } else {
        newcolorconditionArray.push(colorconditionArray[index]);
      }
    }

    this._configArray[target.index].colorcondition = newcolorconditionArray;

    this._config.entities = this._configArray;
    this._commitConfig('updateColorCondition');
  }

  private _createLightElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.light;
    const config = this._configArray[index];
    const visible: boolean = config.type3d ? config.type3d === 'light' : false;
    if (visible) {
      config.light = { ...config.light };
    }
    return html`
      ${visible
        ? html`
            <div class="category" id="light">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                      ${index !== null
                        ? html`
                            <floor3dpro-formfield alignEnd label="Lumens (0-5000) <800>">
                              <floor3dpro-textfield
                                type="number"
                                min="0"
                                max="5000"
                                step="50"
                                .value=${config.light.lumens ? config.light.lumens : null}
                                .configObject=${config.light}
                                .configAttribute=${'lumens'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            <floor3dpro-textfield
                              label="Color"
                              .value=${config.light.color ? config.light.color : ''}
                              .configObject=${config.light}
                              .configAttribute=${'color'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                            <floor3dpro-formfield alignEnd label="Decay (0-inifinity, <2>)">
                              <floor3dpro-textfield
                                type="number"
                                min="0"
                                .value=${config.light.decay ? config.light.decay : null}
                                .configObject=${config.light}
                                .configAttribute=${'decay'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            <floor3dpro-formfield alignEnd label="Distance (cm: 0=inifinity, <600>)">
                              <floor3dpro-textfield
                                type="number"
                                min="0"
                                .value=${config.light.distance ? config.light.distance : null}
                                .configObject=${config.light}
                                .configAttribute=${'distance'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            <ha-select
                              label="Shadow (yes/<no>)"
                              @selected=${this._valueChanged}
                              .value=${config.light.shadow ? config.light.shadow : null}
                              .configObject=${config.light}
                              .configAttribute=${'shadow'}
                              .ignoreNull=${false}
                              @closed=${(ev) => ev.stopPropagation()}
                            >
                              <ha-list-item></ha-list-item>
                              <ha-list-item value="yes">yes</ha-list-item>
                              <ha-list-item value="no">no</ha-list-item>
                            </ha-select>
                            <floor3dpro-textfield
                              label="Light Direction (spot) (JSON) e.g. {\"x\":0,\"y\":1,\"z\":0}"
                              .value=${config.light.light_direction ? JSON.stringify(config.light.light_direction) : ''}
                              .configObject=${config.light}
                              .configAttribute=${'light_direction'}
                              .ignoreNull=${false}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                            <floor3dpro-textfield
                              label="Light Target Object (spot)"
                              .value=${config.light.light_target ? config.light.light_target : ''}
                              .configObject=${config.light}
                              .configAttribute=${'light_target'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                            <floor3dpro-textfield
                              label="Single Light Object (one light for the whole group)"
                              .value=${config.light.light_object ? config.light.light_object : ''}
                              .configObject=${config.light}
                              .configAttribute=${'light_object'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                            <ha-select
                              label="Follow entity (<yes>/brightness/color/no)"
                              @selected=${this._valueChanged}
                              .value=${config.light.follow_entity ? config.light.follow_entity : null}
                              .configObject=${config.light}
                              .configAttribute=${'follow_entity'}
                              .ignoreNull=${false}
                              @closed=${(ev) => ev.stopPropagation()}
                            >
                              <ha-list-item></ha-list-item>
                              <ha-list-item value="yes">yes (brightness and colour)</ha-list-item>
                              <ha-list-item value="brightness">brightness only</ha-list-item>
                              <ha-list-item value="color">color only</ha-list-item>
                              <ha-list-item value="no">no (lumens and color from config)</ha-list-item>
                            </ha-select>
                            <floor3dpro-formfield alignEnd label="Shadow map size (px, <512>)">
                              <floor3dpro-textfield
                                type="number"
                                min="128"
                                max="4096"
                                .value=${config.light.shadow_map_size ? config.light.shadow_map_size : null}
                                .configObject=${config.light}
                                .configAttribute=${'shadow_map_size'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            <floor3dpro-formfield alignEnd label="Angle degrees (spot)">
                              <floor3dpro-textfield
                                type="number"
                                min="0"
                                max="180"
                                .value=${config.light.angle ? config.light.angle : null}
                                .configObject=${config.light}
                                .configAttribute=${'angle'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            <ha-select
                              label="Light Vertical Alignment"
                              @selected=${this._valueChanged}
                              .value=${config.light.vertical_alignment ? config.light.vertical_alignment : null}
                              .configObject=${config.light}
                              .configAttribute=${'vertical_alignment'}
                              .ignoreNull=${false}
                              @closed=${(ev) => ev.stopPropagation()}
                            >
                              <ha-list-item></ha-list-item>
                              <ha-list-item value="bottom">bottom</ha-list-item>
                              <ha-list-item value="middle">middle</ha-list-item>
                              <ha-list-item value="top">top</ha-list-item>
                            </ha-select>
                          `
                        : ''}
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createRoomElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.room;
    const config = this._configArray[index];
    const visible: boolean = config.type3d ? config.type3d === 'room' : false;
    if (visible) {
      config.room = { ...config.room };
    }
    return html`
      ${visible
        ? html`
            <div class="category" id="light">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                      ${index !== null
                        ? html` <floor3dpro-formfield alignEnd label="Transparency %">
                              <floor3dpro-textfield
                                type="number"
                                min="0"
                                max="100"
                                .value=${config.room.transparency ? config.room.transparency : null}
                                .configObject=${config.room}
                                .configAttribute=${'transparency'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            <floor3dpro-textfield
                              label="Color"
                              .value=${config.room.color ? config.room.color : ''}
                              .configObject=${config.room}
                              .configAttribute=${'color'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                            <floor3dpro-formfield alignEnd label="Elevation (cm)">
                              <floor3dpro-textfield
                                type="number"
                                min="0"
                                .value=${config.room.elevation ? config.room.elevation : ''}
                                .configObject=${config.room}
                                .configAttribute=${'elevation'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            <floor3dpro-textfield
                              label="Label"
                              fullwidth
                              .value=${config.room.label ? config.room.label : ''}
                              .configObject=${config.room}
                              .configAttribute=${'label'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                            <ha-select
                              label="Label text (state or template)"
                              @selected=${this._valueChanged}
                              .value=${config.room.label_text ? config.room.label_text : null}
                              .configObject=${config.room}
                              .configAttribute=${'label_text'}
                              .ignoreNull=${false}
                              @closed=${(ev) => ev.stopPropagation()}
                            >
                              <ha-list-item></ha-list-item>
                              <ha-list-item value="state">state</ha-list-item>
                              <ha-list-item value="template">template</ha-list-item>
                            </ha-select>
                            <floor3dpro-formfield alignEnd label="Label Width (scaled cm)">
                              <floor3dpro-textfield
                                type="number"
                                min="0"
                                .value=${config.room.width ? config.room.width : null}
                                .configObject=${config.room}
                                .configAttribute=${'width'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            <floor3dpro-formfield alignEnd label="Label Height (scaled cm)">
                              <floor3dpro-textfield
                                type="number"
                                min="0"
                                .value=${config.room.height ? config.room.height : null}
                                .configObject=${config.room}
                                .configAttribute=${'height'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            ${this._createTextSubElement(config.room)}`
                        : ''}
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createZoomElement(index): TemplateResult {
    const options = this._options.zoom_areas.options.zoom_areas[index].options.zoom;
    const config = this._configZoomArray[index];
    return html`
      <div class="category" id="light">
        <div
          class="sub-category"
          @click=${this._toggleThing}
          .options=${options}
          .optionsTarget=${this._options.zoom_areas.options.zoom_areas[index].options}
        >
          <div class="row">
            <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
            <div class="title">${options.name}</div>
            <ha-icon .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`} style="margin-left: auto;"></ha-icon>
          </div>
          <div class="secondary">${options.secondary}</div>
        </div>
        ${options.show
          ? html`
              <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                ${index !== null
                  ? html`
                      ${!this._objects
                        ? html`
                            <floor3dpro-textfield
                              label="Object"
                              .value=${config.object_id ? config.object_id : ''}
                              .configAttribute=${'object_id'}
                              .configObject=${config}
                              @input=${this._valueChanged}
                              required
                            ></floor3dpro-textfield>
                          `
                        : html`
                            <ha-select
                              label="Object id"
                              @selected=${this._valueChanged}
                              .value=${config.object_id}
                              .configAttribute=${'object_id'}
                              .configObject=${config}
                              .ignoreNull=${false}
                              required
                              @closed=${(ev) => ev.stopPropagation()}
                            >
                              ${this._objects.map((object_id) => {
                                return html` <ha-list-item value="${object_id}">${object_id}</ha-list-item> `;
                              })}
                              ${this._configObjectArray.map((object_group) => {
                                return html`
                                  <ha-list-item value="${'<' + object_group.object_group + '>'}"
                                    >${'<' + object_group.object_group + '>'}</ha-list-item
                                  >
                                `;
                              })}
                            </ha-select>
                          `}
                      <floor3dpro-textfield
                        label="Zoom Direction (JSON) e.g. {\"x\":0,\"y\":0,\"z\":-1}"
                        .value=${config.direction ? JSON.stringify(config.direction) : ''}
                        .configObject=${config}
                        .configAttribute=${'direction'}
                        .ignoreNull=${false}
                        @input=${this._valueChanged}
                      ></floor3dpro-textfield>
                      <floor3dpro-textfield
                        label="Zoom Rotation (JSON) e.g. {\"x\":0,\"y\":0,\"z\":0}"
                        .value=${config.rotation ? JSON.stringify(config.rotation) : ''}
                        .configObject=${config}
                        .configAttribute=${'rotation'}
                        .ignoreNull=${false}
                        @input=${this._valueChanged}
                      ></floor3dpro-textfield>
                      <floor3dpro-formfield alignEnd label="Distance (cm)">
                        <floor3dpro-textfield
                          type="number"
                          min="0"
                          .value=${config.distance ? config.distance : null}
                          .configObject=${config}
                          .configAttribute=${'distance'}
                          .ignoreNull=${false}
                          @input=${this._valueChanged}
                        ></floor3dpro-textfield>
                      </floor3dpro-formfield>
                    `
                  : ''}
              </div>
            `
          : ''}
      </div>
    `;
  }

  private _createTextSubElement(subconfig: Floor3dCardConfig): TemplateResult {
    return html`
      <floor3dpro-textfield
        label="Attribute"
        fullwidth
        .value=${subconfig.attribute ? subconfig.room.attribute : ''}
        .configObject=${subconfig}
        .configAttribute=${'attribute'}
        @input=${this._valueChanged}
      ></floor3dpro-textfield>
      <floor3dpro-textfield
        label="font"
        fullwidth
        .value=${subconfig.font ? subconfig.font : ''}
        .configObject=${subconfig}
        .configAttribute=${'font'}
        @input=${this._valueChanged}
      ></floor3dpro-textfield>
      <floor3dpro-formfield alignEnd label="Span percentage">
        <floor3dpro-textfield
          label="Span percentage"
          type="number"
          min="0"
          max="100"
          .value=${subconfig.span ? subconfig.span : null}
          .configObject=${subconfig}
          .configAttribute=${'span'}
          .ignoreNull=${false}
          @input=${this._valueChanged}
        ></floor3dpro-textfield>
      </floor3dpro-formfield>
      <floor3dpro-textfield
        label="Text Background Color"
        .value=${subconfig.textbgcolor ? subconfig.textbgcolor : ''}
        .configObject=${subconfig}
        .configAttribute=${'textbgcolor'}
        @input=${this._valueChanged}
      ></floor3dpro-textfield>
      <floor3dpro-textfield
        label="Text Foreground Color"
        .value=${subconfig.textfgcolor ? subconfig.textfgcolor : ''}
        .configObject=${subconfig}
        .configAttribute=${'textfgcolor'}
        @input=${this._valueChanged}
      ></floor3dpro-textfield>
    `;
  }

  private _createTextElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.text;
    const config = this._configArray[index];
    const visible: boolean = config.type3d ? config.type3d === 'text' : false;
    if (visible) {
      config.text = { ...config.text };
    }
    return html`
      ${visible
        ? html`
            <div class="category" id="text">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                      ${index !== null ? html` ${this._createTextSubElement(config.text)} ` : ''}
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createImageElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.image;
    const config = this._configArray[index];
    const visible: boolean = config.type3d ? config.type3d === 'image' : false;
    if (visible) {
      config.image = { ...config.image };
    }
    return html`
      ${visible
        ? html`
            <div class="category" id="image">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                      ${index !== null ? html` ${this._createImageSubElement(config.image)} ` : ''}
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createImageSubElement(subconfig: any): TemplateResult {
    return html`
      <ha-select
        label="Source (<entity_picture>/attribute/state/url)"
        @selected=${this._valueChanged}
        .value=${subconfig.source ? subconfig.source : null}
        .configObject=${subconfig}
        .configAttribute=${'source'}
        .ignoreNull=${false}
        @closed=${(ev) => ev.stopPropagation()}
      >
        <ha-list-item></ha-list-item>
        <ha-list-item value="entity_picture">entity_picture attribute</ha-list-item>
        <ha-list-item value="attribute">another attribute</ha-list-item>
        <ha-list-item value="state">the state</ha-list-item>
        <ha-list-item value="url">a URL</ha-list-item>
      </ha-select>
      <floor3dpro-textfield
        label="Attribute (for source: attribute)"
        fullwidth
        .value=${subconfig.attribute ? subconfig.attribute : ''}
        .configObject=${subconfig}
        .configAttribute=${'attribute'}
        @input=${this._valueChanged}
      ></floor3dpro-textfield>
      <floor3dpro-textfield
        label="URL (for source: url; {state} and {attr:name} are replaced)"
        fullwidth
        .value=${subconfig.url ? subconfig.url : ''}
        .configObject=${subconfig}
        .configAttribute=${'url'}
        @input=${this._valueChanged}
      ></floor3dpro-textfield>
      <floor3dpro-formfield alignEnd label="Refresh (seconds, 0 = never)">
        <floor3dpro-textfield
          type="number"
          min="0"
          .value=${subconfig.refresh ? subconfig.refresh : null}
          .configObject=${subconfig}
          .configAttribute=${'refresh'}
          .ignoreNull=${false}
          @input=${this._valueChanged}
        ></floor3dpro-textfield>
      </floor3dpro-formfield>
      <ha-select
        label="Fit (<contain>/cover/stretch)"
        @selected=${this._valueChanged}
        .value=${subconfig.fit ? subconfig.fit : null}
        .configObject=${subconfig}
        .configAttribute=${'fit'}
        .ignoreNull=${false}
        @closed=${(ev) => ev.stopPropagation()}
      >
        <ha-list-item></ha-list-item>
        <ha-list-item value="contain">contain</ha-list-item>
        <ha-list-item value="cover">cover</ha-list-item>
        <ha-list-item value="stretch">stretch</ha-list-item>
      </ha-select>
      <floor3dpro-textfield
        label="Background colour behind a letterboxed picture (<transparent>)"
        .value=${subconfig.background ? subconfig.background : ''}
        .configObject=${subconfig}
        .configAttribute=${'background'}
        @input=${this._valueChanged}
      ></floor3dpro-textfield>
      <floor3dpro-formfield alignEnd label="Aspect (object width / height; measured if empty)">
        <floor3dpro-textfield
          type="number"
          min="0"
          step="0.01"
          .value=${subconfig.aspect ? subconfig.aspect : null}
          .configObject=${subconfig}
          .configAttribute=${'aspect'}
          .ignoreNull=${false}
          @input=${this._valueChanged}
        ></floor3dpro-textfield>
      </floor3dpro-formfield>
      <ha-select
        label="Rotate (<0>/90/180/270)"
        @selected=${this._valueChanged}
        .value=${subconfig.rotate ? String(subconfig.rotate) : null}
        .configObject=${subconfig}
        .configAttribute=${'rotate'}
        .ignoreNull=${false}
        @closed=${(ev) => ev.stopPropagation()}
      >
        <ha-list-item></ha-list-item>
        <ha-list-item value="0">0</ha-list-item>
        <ha-list-item value="90">90</ha-list-item>
        <ha-list-item value="180">180</ha-list-item>
        <ha-list-item value="270">270</ha-list-item>
      </ha-select>
      <floor3dpro-formfield alignEnd label="Max texture size (px, <1024>)">
        <floor3dpro-textfield
          type="number"
          min="64"
          max="4096"
          step="64"
          .value=${subconfig.max_size ? subconfig.max_size : null}
          .configObject=${subconfig}
          .configAttribute=${'max_size'}
          .ignoreNull=${false}
          @input=${this._valueChanged}
        ></floor3dpro-textfield>
      </floor3dpro-formfield>
    `;
  }

  private _createDoorElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.door;
    const config = this._configArray[index];
    const visible: boolean = config.type3d ? config.type3d === 'door' : false;
    if (visible) {
      config.door = { ...config.door };
    }
    return html`
      ${visible
        ? html`
            <div class="category" id="door">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                      ${index !== null
                        ? html`
                            <ha-select
                              label="Door Type"
                              @selected=${this._valueChanged}
                              .value=${config.door.doortype ? config.door.doortype : null}
                              .configObject=${config.door}
                              .configAttribute=${'doortype'}
                              .ignoreNull=${false}
                              @closed=${(ev) => ev.stopPropagation()}
                            >
                              <ha-list-item></ha-list-item>
                              <ha-list-item value="swing">swing</ha-list-item>
                              <ha-list-item value="slide">slide</ha-list-item>
                            </ha-select>
                            <ha-select
                              label="Side"
                              @selected=${this._valueChanged}
                              .value=${config.door.side ? config.door.side : null}
                              .configObject=${config.door}
                              .configAttribute=${'side'}
                              .ignoreNull=${false}
                              @closed=${(ev) => ev.stopPropagation()}
                            >
                              <ha-list-item></ha-list-item>
                              <ha-list-item value="up">up</ha-list-item>
                              <ha-list-item value="down">down</ha-list-item>
                              <ha-list-item value="left">left</ha-list-item>
                              <ha-list-item value="right">right</ha-list-item>
                            </ha-select>
                            <ha-select
                              label="Direction"
                              @selected=${this._valueChanged}
                              .value=${config.door.direction ? config.door.direction : null}
                              .configObject=${config.door}
                              .configAttribute=${'direction'}
                              .ignoreNull=${false}
                              @closed=${(ev) => ev.stopPropagation()}
                            >
                              <ha-list-item></ha-list-item>
                              <ha-list-item value="inner">inner</ha-list-item>
                              <ha-list-item value="outer">outer</ha-list-item>
                            </ha-select>
                            <floor3dpro-formfield alignEnd label="Degrees (for Swing)">
                              <floor3dpro-textfield
                                type="number"
                                min="0"
                                max="180"
                                .value=${config.door.degrees ? config.door.degrees : null}
                                .configObject=${config.door}
                                .configAttribute=${'degrees'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            <floor3dpro-formfield alignEnd label="Percentage open (for slide)">
                              <floor3dpro-textfield
                                type="number"
                                min="0"
                                max="100"
                                label="Percentage open (for slide)"
                                .value=${config.door.percentage ? config.door.percentage : null}
                                .configObject=${config.door}
                                .configAttribute=${'percentage'}
                                .ignoreNull=${false}
                                @input=${this._valueChanged}
                              ></floor3dpro-textfield>
                            </floor3dpro-formfield>
                            <floor3dpro-textfield
                              label="Pane object"
                              .value=${config.door.pane ? config.door.pane : ''}
                              .configObject=${config.door}
                              .configAttribute=${'pane'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                            <floor3dpro-textfield
                              label="Hinge object"
                              .value=${config.door.hinge ? config.door.hinge : ''}
                              .configObject=${config.door}
                              .configAttribute=${'hinge'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                          `
                        : ''}
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createCoverElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.cover;
    const config = this._configArray[index];
    const visible: boolean = config.type3d ? config.type3d === 'cover' : false;
    if (visible) {
      config.cover = { ...config.cover };
    }
    return html`
      ${visible
        ? html`
            <div class="category" id="cover">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                      ${index !== null
                        ? html`
                            <floor3dpro-textfield
                              label="Pane object"
                              .value=${config.cover.pane ? config.cover.pane : ''}
                              .configObject=${config.cover}
                              .configAttribute=${'pane'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                            <ha-select
                              label="Side"
                              @selected=${this._valueChanged}
                              .value=${config.cover.side ? config.cover.side : null}
                              .configObject=${config.cover}
                              .configAttribute=${'side'}
                              .ignoreNull=${false}
                              @closed=${(ev) => ev.stopPropagation()}
                            >
                              <ha-list-item></ha-list-item>
                              <ha-list-item value="up">up</ha-list-item>
                              <ha-list-item value="down">down</ha-list-item>
                            </ha-select>
                          `
                        : ''}
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createGestureElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.gesture;
    const config = this._configArray[index];
    const visible: boolean = config.type3d ? config.type3d === 'gesture' : false;
    if (visible) {
      config.gesture = { ...config.gesture };
    }
    return html`
      ${visible
        ? html`
            <div class="category" id="text">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                      ${index !== null
                        ? html`
                            <floor3dpro-textfield
                              label="domain"
                              fullwidth
                              .value=${config.gesture.domain ? config.gesture.domain : ''}
                              .configObject=${config.gesture}
                              .configAttribute=${'domain'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                            <floor3dpro-textfield
                              label="service"
                              fullwidth
                              .value=${config.gesture.service ? config.gesture.service : ''}
                              .configObject=${config.gesture}
                              .configAttribute=${'service'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                          `
                        : ''}
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createRotateElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.rotate;
    const config = this._configArray[index];
    const visible: boolean = config.type3d ? config.type3d === 'rotate' : false;
    if (visible) {
      config.rotate = { ...config.rotate };
    }
    return html`
      ${visible
        ? html`
            <div class="category" id="text">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                      ${index !== null
                        ? html`
                            <ha-select
                              label="Axis"
                              @selected=${this._valueChanged}
                              .value=${config.rotate.axis ? config.rotate.axis : null}
                              .configObject=${config.rotate}
                              .configAttribute=${'axis'}
                              .ignoreNull=${false}
                              @closed=${(ev) => ev.stopPropagation()}
                            >
                              <ha-list-item></ha-list-item>
                              <ha-list-item value="x">x</ha-list-item>
                              <ha-list-item value="y">y</ha-list-item>
                              <ha-list-item value="z">z</ha-list-item>
                            </ha-select>
                            <floor3dpro-textfield
                              label="Hinge-pivot object "
                              .value=${config.rotate.hinge ? config.rotate.hinge : ''}
                              .configObject=${config.rotate}
                              .configAttribute=${'hinge'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                            <floor3dpro-textfield
                              label="Round per seconds (2 or less recommended)"
                              .value=${config.rotate.round_per_second ? config.rotate.round_per_second : ''}
                              .configObject=${config.rotate}
                              .configAttribute=${'round_per_second'}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                          `
                        : ''}
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createHideElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.hide;
    const config = this._configArray[index];

    const visible: boolean = config.type3d ? config.type3d === 'hide' : false;

    if (visible) {
      config.hide = { ...config.hide };
    }
    return html`
      ${visible
        ? html`
            <div class="category" id="hide">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                      ${index !== null
                        ? html`
                            <floor3dpro-textfield
                              label="state"
                              .value=${config.hide.state ? config.hide.state : ''}
                              .configAttribute=${'state'}
                              .configObject=${config.hide}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                          `
                        : ''}
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _createShowElement(index): TemplateResult {
    const options = this._options.entities.options.entities[index].options.show;
    const config = this._configArray[index];

    const visible: boolean = config.type3d ? config.type3d === 'show' : false;

    if (visible) {
      config.show = { ...config.show };
    }
    return html`
      ${visible
        ? html`
            <div class="category" id="show">
              <div
                class="sub-category"
                @click=${this._toggleThing}
                .options=${options}
                .optionsTarget=${this._options.entities.options.entities[index].options}
              >
                <div class="row">
                  <ha-icon .icon=${`mdi:${options.icon}`}></ha-icon>
                  <div class="title">${options.name}</div>
                  <ha-icon
                    .icon=${options.show ? `mdi:chevron-up` : `mdi:chevron-down`}
                    style="margin-left: auto;"
                  ></ha-icon>
                </div>
                <div class="secondary">${options.secondary}</div>
              </div>
              ${options.show
                ? html`
                    <div class="card-options" style="display: flex; flex-direction: column; align-items: left;">
                      ${index !== null
                        ? html`
                            <floor3dpro-textfield
                              label="state"
                              .value=${config.show.state ? config.show.state : ''}
                              .configAttribute=${'state'}
                              .configObject=${config.show}
                              @input=${this._valueChanged}
                            ></floor3dpro-textfield>
                          `
                        : ''}
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }

  private _initialize(): void {
    if (this.hass === undefined) return;
    if (this._config === undefined) return;
    if (this._helpers === undefined) return;
    this._initialized = true;
  }

  private async loadCardHelpers(): Promise<void> {
    this._helpers = await (window as any).loadCardHelpers();
  }

  private _toggleAction(ev): void {
    this._toggleThing(ev);
  }

  private _toggleOption(ev): void {
    this._toggleThing(ev);
  }

  private _readEventValue(ev: any): any {
    if (ev?.detail && Object.prototype.hasOwnProperty.call(ev.detail, 'value')) {
      return ev.detail.value;
    }
    if (ev?.target && Object.prototype.hasOwnProperty.call(ev.target, 'value')) {
      return ev.target.value;
    }
    return undefined;
  }

  private _normalizeValueChangeEvent(ev: any): any {
    const target = ev?.target;
    if (!target) {
      return ev;
    }

    const nextValue = this._readEventValue(ev);
    if (nextValue !== undefined) {
      target.value = nextValue;
    }

    return ev;
  }

  private _typeChanged(ev): void {
    ev = this._normalizeValueChangeEvent(ev);
    if (!this._config || !this.hass) {
      return;
    }

    const target = ev.target;

    if (target.configObject[target.configAttribute] == target.value) {
      return;
    }

    let initialtype3d: string = target.configObject[target.configAttribute];

    this._valueChanged(ev);

    console.log('Type3D changed start');

    if (target.configObject[initialtype3d]) {
      const entityArray = this._configArray;

      const newentityArray: any = [];

      entityArray.forEach((entity, index) => {
        if (ev.target.configIndex == index) {
          let newobject;

          switch (initialtype3d) {
            case 'light':
              const { light, ...lightObject } = ev.target.configObject;
              newobject = lightObject;
              break;
            case 'room':
              let { room, ...roomObject } = ev.target.configObject;
              newobject = roomObject;
              break;
            case 'zoom':
              let { zoom, ...zoomObject } = ev.target.configObject;
              newobject = zoomObject;
              break;
            case 'color':
              let { colorcondition, ...colorObject } = ev.target.configObject;
              newobject = colorObject;
              break;
            case 'hide':
              let { hide, ...hideObject } = ev.target.configObject;
              newobject = hideObject;
              break;
            case 'show':
              let { show, ...showObject } = ev.target.configObject;
              newobject = showObject;
              break;
            case 'door':
              let { door, ...doorObject } = ev.target.configObject;
              newobject = doorObject;
              break;
            case 'gesture':
              let { gesture, ...gestureObject } = ev.target.configObject;
              newobject = gestureObject;
              break;
            case 'camera':
              let { camera, ...cameraObject } = ev.target.configObject;
              newobject = cameraObject;
              break;
            case 'text':
              let { text, ...textObject } = ev.target.configObject;
              newobject = textObject;
              break;
            case 'image':
              let { image, ...imageObject } = ev.target.configObject;
              newobject = imageObject;
              break;
            case 'rotate':
              let { rotate, ...rotateObject } = ev.target.configObject;
              newobject = rotateObject;
              break;
            case 'cover':
              let { cover, ...coverObject } = ev.target.configObject;
              newobject = coverObject;
              break;
          }
          console.log(newobject);
          newentityArray.push(newobject);
        } else {
          newentityArray.push(entity);
        }
      });

      this._configArray = newentityArray;
    }

    if (ev.target.optionTgt.color) {
      ev.target.optionTgt.color.visible = false;
    }

    if (ev.target.optionTgt.hide) {
      ev.target.optionTgt.hide.visible = false;
    }
    if (ev.target.optionTgt.show) {
      ev.target.optionTgt.show.visible = false;
    }
    if (ev.target.optionTgt.room) {
      ev.target.optionTgt.room.visible = false;
    }
    if (ev.target.optionTgt.zoom) {
      ev.target.optionTgt.zoom.visible = false;
    }
    if (ev.target.optionTgt.door) {
      ev.target.optionTgt.door.visible = false;
    }

    if (ev.target.optionTgt.text) {
      ev.target.optionTgt.text.visible = false;
    }
    if (ev.target.optionTgt.image) {
      ev.target.optionTgt.image.visible = false;
    }

    if (ev.target.optionTgt.cover) {
      ev.target.optionTgt.cover.visible = false;
    }

    if (ev.target.optionTgt.gesture) {
      ev.target.optionTgt.gesture.visible = false;
    }

    if (ev.target.optionTgt.rotate) {
      ev.target.optionTgt.rotate.visible = false;
    }

    if (ev.target.optionTgt.camera) {
      ev.target.optionTgt.camera.visible = false;
    }
    if (ev.target.optionTgt.light) {
      ev.target.optionTgt.light.visible = false;
    }

    console.log('Type3D changed end');
  }

  private _valueChanged(ev): void {
    ev = this._normalizeValueChangeEvent(ev);
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    // Paper legacy fields -> stringify/parsing bridge (north/camera_*)
    // Accepts JSON string or legacy "{ x: 0, y: 1, z: 2 }" style.
    if (
      target &&
      typeof target.value === 'string' &&
      (target.configAttribute === 'north' ||
        target.configAttribute === 'camera_position' ||
        target.configAttribute === 'camera_rotate' ||
        target.configAttribute === 'camera_target' ||
        target.configAttribute === 'direction' ||
        target.configAttribute === 'rotation' ||
        target.configAttribute === 'light_direction')
    ) {
      const raw = String(target.value).trim();

      let parsed: any = null;

      // 1) JSON first
      try {
        parsed = JSON.parse(raw);
      } catch (_e) {
        // 2) legacy key:value parse
        const getNum = (k: 'x' | 'y' | 'z'): number | null => {
          const m = raw.match(new RegExp(`${k}\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
          if (!m) return null;
          const n = Number(m[1]);
          return Number.isFinite(n) ? n : null;
        };

        const x = getNum('x');
        const y = getNum('y');
        const z = getNum('z');

        if (target.configAttribute === 'north') {
          if (x !== null && z !== null) parsed = { x, z };
        } else {
          if (x !== null && y !== null && z !== null) parsed = { x, y, z };
        }
      }

      if (parsed && typeof parsed === 'object') {
        // Force numeric fields
        if (parsed.x !== undefined) parsed.x = Number(parsed.x);
        if (parsed.y !== undefined) parsed.y = Number(parsed.y);
        if (parsed.z !== undefined) parsed.z = Number(parsed.z);

        target.value = parsed;
      }
    }

    if (target.configObject[target.configAttribute] == target.value) {
      return;
    }

    if (target.configAdd && target.value !== '') {
      target.configObject = Object.assign(target.configObject, {
        [target.configAdd]: { [target.configAttribute]: target.value },
      });
    }
    if (target.configAttribute && target.configObject && !target.configAdd) {
      if (target.value == '' || target.value === false) {
        if (target.ignoreNull == true) return;
        delete target.configObject[target.configAttribute];
      } else {
        target.configObject[target.configAttribute] = target.value;
      }
    }
    this._config.entities = this._configArray;
    this._config.object_groups = this._configObjectArray;
    this._config.zoom_areas = this._configZoomArray;
    this._commitConfig('valueChanged');
  }

  static get styles(): CSSResultGroup {
    return css`
      .option {
        padding: 4px 0px;
        cursor: pointer;
      }
      .row {
        display: flex;
        margin-bottom: -14px;
        pointer-events: none;
      }
      .title {
        padding-left: 16px;
        margin-top: -6px;
        pointer-events: none;
      }
      .secondary {
        padding-left: 40px;
        color: var(--secondary-text-color);
        pointer-events: none;
      }
      .values {
        padding-left: 0px;

        display: grid;
      }
      .cards .card-options {
        display: flex;
        justify-content: flex-end;
        width: 100%;
      }
      ha-formfield {
        padding-bottom: 8px;
      }
      ha-select,
      ha-entity-picker,
      floor3dpro-textfield {
        margin-bottom: 16px;
        display: block;
      }
      floor3dpro-formfield {
        padding-bottom: 8px;
      }

      .two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        align-items: center;
      }

      .add-button {
        width: auto;
      }

      .pro-feature-skill-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 40px;
      }

      .pro-feature-skill-label {
        font-size: 14px;
        opacity: 0.85;
      }

      .pro-feature-skill-toggles {
        display: inline-flex;
        gap: 14px;
        align-items: center;
        flex-wrap: nowrap;
      }

      .optionPro {
        padding: 4px 0px;
      } 
 
      .optionPro .row {
        pointer-events: auto;
        display: flex;
        margin-bottom: -14px;
      }      

      .pro-feature-skill-item {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        opacity: 0.9;
      }
    `;
  }
}
