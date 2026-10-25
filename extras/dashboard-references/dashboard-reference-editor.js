/**
 * Dashboard Reference Editor 1.0.0
 * Optional editor support for dashboard-entity-reference 1.2.x.
 * Uses the native floor3dx/snapshot editors and saves stable entity references.
 * Does not change either native card, save dashboards, or load remote scripts.
 */
(() => {
  'use strict';
  const TAG = 'dashboard-reference-native-editor';
  const WRAPPER = 'dashboard-entity-reference';
  const SUPPORTED = new Set(['custom:floor3dx-card', 'custom:floor3dpro-card',
    'custom:floor3d-card', 'custom:floor3d-snapshot-card']);
  const TOKEN = /\[\[entity:([A-Za-z0-9_.-]+)\]\]/g;
  const ID = /^[a-z_]+\.[a-z0-9_]+$/;
  const META = new Set(['entity_reference_id', 'entity_reference_fields', 'entity_reference_extra']);
  const FIELDS = new Set(['entity', 'entity_id', 'camera_entity', 'remote_id',
    'media_player_id', 'color_entity', 'top_entity', 'icon_entity', 'triggers_update']);
  const copy = value => JSON.parse(JSON.stringify(value));
  const tokenIds = value => [...new Set([...JSON.stringify(value).matchAll(TOKEN)].map(match => match[1]))];

  function readSources(dashboard) {
    const sources = new Map();
    const add = (role, entity) => {
      if (typeof role !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(role) ||
          typeof entity !== 'string' || !ID.test(entity)) throw new Error(`Invalid source entry: ${role}.`);
      if (sources.has(role)) throw new Error(`Duplicate source label: ${role}.`);
      sources.set(role, entity);
    };
    const visit = (value, source = false) => {
      if (Array.isArray(value)) return value.forEach(child => visit(child, source));
      if (!value || typeof value !== 'object') return;
      source = source || typeof value.card_reference_id === 'string';
      if (source) {
        if (value.entity_reference_id !== undefined) add(value.entity_reference_id, value.entity);
        for (const [role, selector] of Object.entries(value.entity_reference_fields || {})) {
          if (!Array.isArray(selector.path) || !selector.path.length) throw new Error(`Invalid selector: ${role}.`);
          let entity = value;
          for (const key of selector.path) {
            if (['__proto__', 'constructor', 'prototype'].includes(key) ||
                !entity || !Object.prototype.hasOwnProperty.call(entity, key)) throw new Error(`Cannot read source: ${role}.`);
            entity = entity[key];
          }
          if (selector.domain) {
            if (!/^[a-z_]+$/.test(selector.domain) || typeof entity !== 'string') throw new Error(`Invalid selector domain: ${role}.`);
            const pattern = new RegExp(`(?:^|[^A-Za-z0-9_.])(${selector.domain}\\.[a-z0-9_]+)(?![A-Za-z0-9_.])`, 'g');
            const found = [...new Set([...entity.matchAll(pattern)].map(match => match[1]))];
            if (found.length !== 1) throw new Error(`Source ${role} must select exactly one entity.`);
            entity = found[0];
          }
          add(role, entity);
        }
        for (const [role, entity] of Object.entries(value.entity_reference_extra || {})) add(role, entity);
      }
      for (const [key, child] of Object.entries(value)) if (!META.has(key)) visit(child, source);
    };
    visit(dashboard);
    return sources;
  }

  function resolve(value, sources) {
    if (typeof value === 'string') return value.replace(TOKEN, (_match, role) => {
      if (!sources.has(role)) throw new Error(`Missing source label: ${role}.`);
      return sources.get(role);
    });
    if (Array.isArray(value)) return value.map(child => resolve(child, sources));
    if (value && typeof value === 'object') return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, resolve(child, sources)]));
    return value;
  }

  function reference(value, sources, original, states) {
    const preferred = new Set(tokenIds(original));
    const reverse = new Map();
    for (const [role, entity] of sources) {
      if (!reverse.has(entity)) reverse.set(entity, []);
      reverse.get(entity).push(role);
    }
    const missing = new Set();
    const hook = id => id.startsWith('input_button.floor3d_');
    const visit = (child, key = '') => {
      if (typeof child === 'string') {
        if (child.startsWith('data:')) return child;
        if ((FIELDS.has(key) || key.endsWith('_entity')) && ID.test(child) &&
            !reverse.has(child) && !hook(child)) missing.add(child);
        return child.replace(/\[\[entity:[A-Za-z0-9_.-]+\]\]|[a-z_]+\.[a-z0-9_]+/g, (entity, offset, text) => {
          if (entity.startsWith('[[entity:') || /[A-Za-z0-9_.]/.test(text[offset - 1] || '') ||
              /[A-Za-z0-9_.]/.test(text[offset + entity.length] || '')) return entity;
          let roles = reverse.get(entity);
          if (!roles) {
            if (states?.[entity] && !hook(entity)) missing.add(entity);
            return entity;
          }
          if (roles.length > 1) {
            const retained = roles.filter(role => preferred.has(role));
            if (retained.length === 1) roles = retained;
            else throw new Error(`Ambiguous source for ${entity}: ${roles.join(', ')}.`);
          }
          return `[[entity:${roles[0]}]]`;
        });
      }
      if (Array.isArray(child)) return child.map(item => visit(item, key));
      if (child && typeof child === 'object') return Object.fromEntries(
        Object.entries(child).map(([field, item]) => [field, visit(item, field)]));
      return child;
    };
    const linked = visit(value);
    if (missing.size) throw new Error(`Add a source entry with an entity_reference_id in a hidden source tab for: ${[...missing].join(', ')}. Save that dashboard, then reopen this editor. Your changes are still displayed here.`);
    if (!tokenIds(linked).length) throw new Error('At least one entity reference is required by the existing wrapper. Use a standalone native card for a configuration without referenced entities.');
    return linked;
  }

  function dashboardValue(value) {
    if (Array.isArray(value?.views)) return value;
    if (Array.isArray(value?.config?.views)) return value.config;
    if (Array.isArray(value?.data?.config?.views)) return value.data.config;
    throw new Error('Home Assistant returned no dashboard views.');
  }

  class NativeReferenceEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._epoch = 0;
      this._edit = 0;
      this._sourceCache = new Map();
      this._nativeArea = document.createElement('div');
      this._notice = document.createElement('div');
      this._notice.style.cssText = 'padding:10px 0;white-space:pre-wrap;color:var(--secondary-text-color);font:inherit';
      this.shadowRoot.append(this._notice, this._nativeArea);
      this._nativeArea.addEventListener('config-changed', event => this._changed(event));
    }

    setConfig(config) {
      if (!SUPPORTED.has(config?.card?.type)) throw new Error('This visual editor supports wrapped floor3d-family and floor3d-snapshot cards. Use YAML for other reference layouts.');
      const own = this._lastEmitted === JSON.stringify(config.card) &&
        (config.dashboard || 'lovelace') === (this._config?.dashboard || 'lovelace');
      const same = this._native && JSON.stringify(config.card) === JSON.stringify(this._config?.card) &&
        config.dashboard === this._config?.dashboard;
      this._config = copy(config);
      if (this._native && (own || same)) return;
      this._epoch += 1;
      this._pending = false;
      this._native = null;
      this._sourceCache.clear();
      this._start();
    }

    set hass(hass) {
      if (this._hass?.connection !== hass?.connection) this._sourceCache.clear();
      this._hass = hass;
      if (this._native) this._native.hass = this._editorHass();
      this._start();
    }
    get hass() { return this._hass; }
    set lovelace(value) {
      this._lovelace = value;
      if (this._native) this._native.lovelace = value;
    }
    get lovelace() { return this._lovelace; }
    connectedCallback() { this._start(); }
    disconnectedCallback() {
      this._epoch += 1;
      this._pending = false;
      this._native = null;
      this._nativeArea.replaceChildren();
      this._sourceCache.clear();
    }

    async _sources(dashboard = this._config?.dashboard || 'lovelace') {
      if (this._sourceCache.has(dashboard)) return this._sourceCache.get(dashboard);
      const job = (async () => {
        const paths = dashboard === 'lovelace' ? ['lovelace', null] : [dashboard];
        for (const path of paths) {
          try {
            const result = await this._hass.callWS({ type: 'lovelace/config', url_path: path, force: false });
            return readSources(dashboardValue(result));
          } catch (error) {
            if (path === paths[paths.length - 1] || !['not_found', 'config_not_found'].includes(error?.code)) throw error;
          }
        }
      })();
      this._sourceCache.set(dashboard, job);
      try { return await job; }
      catch (error) { this._sourceCache.delete(dashboard); throw error; }
    }

    _editorHass() {
      const original = this._hass;
      // Only the editor's dashboard-discovery reads receive resolved copies.
      // Keep the real hass object and connection unchanged.
      const facade = { ...original };
      for (const key of ['callService', 'callApi', 'fetchWithAuth']) {
        if (typeof original[key] === 'function') facade[key] = original[key].bind(original);
      }
      facade.callWS = async message => {
        const result = await original.callWS(message);
        if (message?.type !== 'lovelace/config') return result;
        const dashboard = dashboardValue(result);
        const visit = async node => {
          if (Array.isArray(node)) return Promise.all(node.map(visit));
          if (!node || typeof node !== 'object') return node;
          if (node.type === `custom:${WRAPPER}` && node.card) {
            const sources = await this._sources(node.dashboard || 'lovelace');
            return resolve(node.card, sources);
          }
          return Object.fromEntries(await Promise.all(Object.entries(node).map(async ([key, child]) => [key, await visit(child)])));
        };
        const resolved = await visit(dashboard);
        if (Array.isArray(result.views)) return resolved;
        if (Array.isArray(result.config?.views)) return { ...result, config: resolved };
        return { ...result, data: { ...result.data, config: resolved } };
      };
      return facade;
    }

    async _start() {
      if (!this.isConnected || !this._config || !this._hass || this._native || this._pending) return;
      const epoch = this._epoch;
      this._pending = true;
      this._notice.textContent = 'Loading native editor…';
      try {
        const sources = await this._sources();
        const resolved = resolve(this._config.card, sources);
        const tag = resolved.type.replace(/^custom:/, '');
        if (!customElements.get(tag)) {
          const helpers = await window.loadCardHelpers();
          await helpers.createCardElement(resolved);
          // Resources can define their element asynchronously.
          if (!customElements.get(tag)) throw new Error(`${tag} is not loaded. Check its dashboard resource and reload the frontend.`);
        }
        const cardClass = customElements.get(tag);
        if (typeof cardClass.getConfigElement !== 'function') throw new Error(`${tag} does not expose a native visual editor.`);
        const native = await cardClass.getConfigElement();
        if (epoch !== this._epoch || !this.isConnected) return;
        native.hass = this._editorHass();
        native.lovelace = this._lovelace;
        native.setConfig(resolved);
        this._native = native;
        this._nativeArea.replaceChildren(native);
        this._notice.textContent = '';
      } catch (error) {
        if (epoch === this._epoch) this._notice.textContent = String(error?.message || error);
      } finally {
        if (epoch === this._epoch) this._pending = false;
      }
    }

    async _changed(event) {
      if (!event.detail?.config) return;
      event.stopPropagation();
      const epoch = this._epoch, edit = ++this._edit;
      const native = copy(event.detail.config);
      try {
        const sources = await this._sources();
        if (epoch !== this._epoch || edit !== this._edit || !this.isConnected) return;
        const card = reference(native, sources, this._config.card, this._hass.states);
        const config = { ...this._config, card };
        if (config.expected_domains) config.expected_domains = Object.fromEntries(
          tokenIds(card).map(role => [role, sources.get(role).split('.')[0]]));
        this._config = copy(config);
        this._lastEmitted = JSON.stringify(card);
        this._notice.textContent = '';
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
      } catch (error) {
        if (epoch === this._epoch && edit === this._edit) this._notice.textContent = String(error?.message || error);
      }
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, NativeReferenceEditor);
  customElements.whenDefined(WRAPPER).then(() => {
    const wrapper = customElements.get(WRAPPER);
    if (wrapper.referenceEditorVersion === '1.0.0') return;
    wrapper.getConfigElement = () => document.createElement(TAG);
    wrapper.referenceEditorVersion = '1.0.0';

    // Preview is a standard HA card property. Forward it through our own
    // wrapper so floor3dx's native object/camera picker can talk to its preview.
    const forwardPreview = element => {
      element._referencePreviewObserver?.disconnect();
      if (element._card) {
        element._card.preview = !!element._referencePreview;
        return;
      }
      if (!element._referencePreview || !element.shadowRoot) return;
      element._referencePreviewObserver = new MutationObserver(() => {
        if (!element._card) return;
        element._card.preview = true;
        element._referencePreviewObserver.disconnect();
      });
      element._referencePreviewObserver.observe(element.shadowRoot, { childList: true, subtree: true });
    };
    Object.defineProperty(wrapper.prototype, 'preview', {
      configurable: true,
      get() { return !!this._referencePreview; },
      set(value) { this._referencePreview = !!value; forwardPreview(this); }
    });
    const setConfig = wrapper.prototype.setConfig;
    wrapper.prototype.setConfig = function(config) {
      setConfig.call(this, config);
      if (this._referencePreview) forwardPreview(this);
    };
  });
})();