/**
 * Dashboard Card Reference 1.2.0
 * Render the current saved configuration of a card elsewhere in a dashboard.
 * Browser Mod supplies the popup title and close button; this card supplies
 * its referenced content. Utilities includes its date selector below the
 * graphs; other combined cards use tabs without repeating headings.
 * Keep the 3D house mail label proportional on its model panel.
 * Resolve named dashboard entities inside existing 3D popup layouts.
 * Index saved configurations once; refresh on Lovelace saves/reconnections.
 * No polling or backend services are added.
 */
(() => {
  'use strict';
  const ELEMENT_NAME = 'dashboard-card-reference';
  const ENTITY_ELEMENT_NAME = 'dashboard-entity-reference';
  const VERSION = '1.2.0';
  const ENTITY_TOKEN = /\[\[entity:([A-Za-z0-9_.-]+)\]\]/g;
  const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;
  const REFERENCE_ID = /^[A-Za-z0-9_.-]+$/;
  const REFERENCE_METADATA = new Set([
    'entity_reference_id', 'entity_reference_fields', 'entity_reference_extra'
  ]);
  let dashboardIndexes = new WeakMap();
  let activePanels = [];
  const connectionCaches = new WeakMap();

  // floor3dx sizes text textures from each string, then maps them across the
  // whole panel. A single envelope consequently stretches horizontally.
  // Draw this mail label into a texture with the panel's own aspect ratio.
  function installProportionalMailLabel() {
    if (typeof customElements.whenDefined !== 'function') return;
    customElements.whenDefined('floor3dx-card').then(() => {
      const prototype = customElements.get('floor3dx-card')?.prototype;
      const marker = Symbol.for('dashboard-card-reference.proportional-mail');
      if (!prototype || prototype[marker] || typeof prototype._updatetext !== 'function' ||
          typeof prototype._applyTextCanvas !== 'function') return;
      const original = prototype._updatetext;

      prototype._updatetext = function(entity, state, canvas, unit) {
        if (entity?.entity !== 'counter.mail_deliveries' || entity.text?.fit !== 'contain' || entity.type3d !== 'text' ||
            entity.object_id !== '1_17') return original.call(this, entity, state, canvas, unit);
        const object = this._scene?.getObjectByName(entity.object_id);
        if (!object || !canvas) return original.call(this, entity, state, canvas, unit);

        let aspect;
        if (typeof this._imageAspect === 'function') {
          aspect = this._imageAspect({ image: {} }, object);
        } else {
          // Older releases have the same text methods, without image fitting.
          object.geometry?.computeBoundingBox?.();
          const box = object.geometry?.boundingBox?.clone();
          if (box && object.matrixWorld && object.position?.clone) {
            object.updateWorldMatrix?.(true, false);
            const size = box.applyMatrix4(object.matrixWorld).getSize(object.position.clone());
            const dimensions = ['x', 'y', 'z'].map(axis => ({ axis, size: size[axis] }))
              .sort((a, b) => b.size - a.size);
            const [a, b] = dimensions;
            aspect = a.axis === 'y' ? b.size / a.size : a.size / b.size;
          }
        }
        if (!Number.isFinite(aspect) || aspect <= 0) {
          return original.call(this, entity, state, canvas, unit);
        }

        const settings = entity.text || {};
        const label = String(state ?? '') + String(unit ?? '');
        const span = Number.parseFloat(settings.span);
        const fraction = Number.isFinite(span) && span > 0 ? Math.min(span / 100, 1) : 1;
        canvas.width = Math.max(2, Math.round(aspect >= 1 ? 512 : 512 * aspect));
        canvas.height = Math.max(2, Math.round(aspect >= 1 ? 512 / aspect : 512));
        const context = canvas.getContext('2d');
        if (!context) return original.call(this, entity, state, canvas, unit);
        const font = settings.font || 'monospace';
        let fontSize = canvas.height * 0.9 * fraction;
        context.font = `${fontSize}px ${font}`;
        const width = context.measureText(label).width;
        if (width > canvas.width * 0.9 * fraction) {
          fontSize *= canvas.width * 0.9 * fraction / width;
          context.font = `${fontSize}px ${font}`;
        }
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = settings.textbgcolor || 'transparent';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = settings.textfgcolor || 'white';
        context.fillText(label, canvas.width / 2, canvas.height / 2);
        this._applyTextCanvas(canvas, object);
      };
      Object.defineProperty(prototype, marker, { value: true });
    });
  }

  installProportionalMailLabel();

  function dashboardConfig(value) {
    // Accept the raw configuration and common wrappers used by card helpers.
    if (typeof value === 'string') value = JSON.parse(value);
    if (Array.isArray(value?.views)) return value;
    if (Array.isArray(value?.config?.views)) return value.config;
    if (Array.isArray(value?.data?.config?.views)) return value.data.config;
    return null;
  }

  function activeDashboardConfigs() {
    const configs = [];
    // Reuse the two Lovelace roots, not a walk through every rendered card on
    // each popup. Read their current config property every time, so saving an
    // edit is visible without retaining a copied snapshot of the dashboard.
    activePanels = activePanels.filter(el => el.isConnected !== false);
    const readConfigs = panels => {
      for (const el of panels) {
        const lovelace = el.lovelace;
        for (const candidate of [lovelace?.rawConfig, lovelace?.config]) {
          const config = dashboardConfig(candidate);
          if (config && !configs.includes(config)) configs.push(config);
        }
      }
    };
    readConfigs(activePanels);
    if (configs.length) return configs;
    const seen = new Set();
    const roots = [document];
    // Lovelace may sit inside a panel resolver's shadow root. Search roots,
    // not rendered source card elements, so cards in unopened tabs work too.
    while (roots.length) {
      const root = roots.shift();
      if (!root || seen.has(root) || typeof root.querySelectorAll !== 'function') continue;
      seen.add(root);
      for (const el of root.querySelectorAll('*')) {
        if (el.localName === 'ha-panel-lovelace' || el.localName === 'hui-root') {
          if (!activePanels.includes(el)) activePanels.push(el);
        }
        if (el.shadowRoot) roots.push(el.shadowRoot);
      }
    }
    readConfigs(activePanels);
    return configs;
  }

  function collectSources(value, sources = new Map()) {
    if (Array.isArray(value)) {
      for (const child of value) collectSources(child, sources);
    } else if (value && typeof value === 'object') {
      if (typeof value.card_reference_id === 'string' && typeof value.type === 'string') {
        if (sources.has(value.card_reference_id)) {
          throw new Error(`Duplicate card_reference_id: ${value.card_reference_id}`);
        }
        sources.set(value.card_reference_id, value);
      }
      // Only inspect dashboard/card containers; action payloads are not sources.
      for (const key of ['views', 'sections', 'cards', 'card', 'tabs', 'entities', 'elements']) {
        if (value[key]) collectSources(value[key], sources);
      }
    }
    return sources;
  }

  function referencePath(node, path, id) {
    if (!Array.isArray(path) || !path.length || path.some(key =>
      !(typeof key === 'string' || Number.isInteger(key)) ||
      ['__proto__', 'prototype', 'constructor'].includes(key))) {
      throw new Error(`Entity reference ${id} needs a nonempty field path.`);
    }
    let value = node;
    for (const key of path) {
      if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) {
        throw new Error(`Entity reference ${id} cannot find ${path.join('.')}.`);
      }
      value = value[key];
    }
    return value;
  }

  function readReference(reference, id) {
    let value = referencePath(reference.node, reference.path, id);
    if (reference.domain) {
      // A few authoritative entities live in a JS/Jinja field rather than an
      // entity property. The explicit selector must contain exactly one
      // distinct ID of the requested domain; never infer from a friendly name.
      const domain = reference.domain;
      if (typeof domain !== 'string' || !/^[a-z_]+$/.test(domain) || typeof value !== 'string') {
        throw new Error(`Entity reference ${id} has an invalid template selector.`);
      }
      const pattern = new RegExp(`(?:^|[^A-Za-z0-9_.])(${domain}\\.[a-z0-9_]+)(?![A-Za-z0-9_.])`, 'g');
      const entities = [...new Set([...value.matchAll(pattern)].map(match => match[1]))];
      if (entities.length !== 1) {
        throw new Error(`Entity reference ${id}: ${reference.path.join('.')} must contain one ${domain} entity (found ${entities.length}).`);
      }
      value = entities[0];
    }
    if (typeof value !== 'string' || !ENTITY_ID.test(value)) {
      throw new Error(`Entity reference ${id} must resolve to an entity ID.`);
    }
    return value;
  }

  function collectEntityReferences(config) {
    const references = new Map();
    const add = (id, reference) => {
      if (typeof id !== 'string' || !REFERENCE_ID.test(id)) {
        throw new Error('Entity reference identifiers must use letters, numbers, dots, underscores or hyphens.');
      }
      if (references.has(id)) throw new Error(`Duplicate entity reference: ${id}. Keep one authoritative dashboard entry.`);
      references.set(id, reference);
    };
    const visit = (value, inSource = false) => {
      if (Array.isArray(value)) {
        for (const child of value) visit(child, inSource);
        return;
      }
      if (!value || typeof value !== 'object') return;
      inSource = inSource || typeof value.card_reference_id === 'string';
      if (inSource) {
        if (value.entity_reference_id !== undefined) {
          add(value.entity_reference_id, { node: value, path: ['entity'] });
        }
        for (const [id, selector] of Object.entries(value.entity_reference_fields || {})) {
          if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
            throw new Error(`Entity reference ${id} needs a field selector.`);
          }
          add(id, { node: value, path: selector.path, domain: selector.domain });
        }
        for (const id of Object.keys(value.entity_reference_extra || {})) {
          add(id, { node: value, path: ['entity_reference_extra', id] });
        }
      }
      for (const [key, child] of Object.entries(value)) {
        if (!REFERENCE_METADATA.has(key)) visit(child, inSource);
      }
    };
    visit(config);
    return references;
  }

  function indexDashboard(config, needEntities) {
    let index = dashboardIndexes.get(config);
    if (!index) {
      index = { config, sources: collectSources(config), entities: null };
      dashboardIndexes.set(config, index);
    }
    if (needEntities && !index.entities) index.entities = collectEntityReferences(config);
    return index;
  }

  function defaultPath(path) {
    return path === null || path === 'lovelace' ? 'lovelace' : path;
  }

  function connectionCache(hass) {
    const connection = hass?.connection;
    if (!connection || typeof connection !== 'object') return null;
    let state = connectionCaches.get(connection);
    if (state) return state;
    state = { configs: new Map(), pending: new Map(), active: new Map(),
      stale: new WeakSet(), generation: 0, canCache: false };
    connectionCaches.set(connection, state);
    const clear = path => {
      state.generation += 1;
      dashboardIndexes = new WeakMap();
      for (const key of [...state.configs.keys()]) {
        if (path === undefined || defaultPath(key) === defaultPath(path)) state.configs.delete(key);
      }
      for (const [key, configs] of state.active) {
        if (path === undefined || defaultPath(key) === defaultPath(path)) {
          for (const config of configs) state.stale.add(config);
        }
      }
    };
    if (typeof connection.addEventListener === 'function') {
      connection.addEventListener('disconnected', () => clear());
      connection.addEventListener('ready', () => clear());
    }
    if (typeof connection.subscribeEvents === 'function') {
      // One narrowly filtered subscription per connection; no timers or
      // state-event subscriptions. Failed subscriptions disable remote cache.
      try {
        Promise.resolve(connection.subscribeEvents(event => {
          const path = event?.data?.url_path;
          clear(path === undefined ? undefined : path);
        }, 'lovelace_updated')).then(() => { state.canCache = true; }).catch(() => {
          state.canCache = false;
          state.configs.clear();
        });
      } catch (_) { /* Fetch on each opening if subscriptions are unavailable. */ }
    }
    return state;
  }

  async function savedDashboard(hass, path, state) {
    if (state?.canCache && state.configs.has(path)) return state.configs.get(path);
    if (state?.pending.has(path)) return state.pending.get(path);
    const request = { type: 'lovelace/config', url_path: path, force: false };
    const task = (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const generation = state?.generation;
        const result = typeof hass?.callWS === 'function'
          ? await hass.callWS(request)
          : await hass.connection.sendMessagePromise(request);
        const config = dashboardConfig(result);
        if (!config) throw new Error('Home Assistant returned a dashboard without a views list.');
        // An edit/reconnection during a request may make its response stale.
        if (state && generation !== state.generation) continue;
        state?.configs.set(path, config);
        return config;
      }
      throw new Error('The dashboard changed during lookup. Reopen the popup to use the latest saved configuration.');
    })();
    if (state) state.pending.set(path, task);
    try { return await task; }
    finally { if (state?.pending.get(path) === task) state.pending.delete(path); }
  }

  async function fetchDashboardIndex(hass, dashboard, cardIds = [], entityIds = []) {
    const frontendHass = document.querySelector?.('home-assistant')?.hass;
    const apiHass = [hass, frontendHass].find(value =>
      typeof value?.callWS === 'function' || typeof value?.connection?.sendMessagePromise === 'function');
    const state = connectionCache(apiHass);
    const hasEntries = index => cardIds.every(id => index.sources.has(id)) &&
      entityIds.every(id => index.entities.has(id));
    const active = activeDashboardConfigs();
    for (const config of active) {
      if (state?.stale.has(config)) continue;
      const index = indexDashboard(config, entityIds.length > 0);
      if (hasEntries(index)) {
        state?.active.set(dashboard, new Set(active));
        return index;
      }
    }
    if (!apiHass) throw new Error('The popup did not receive a Home Assistant WebSocket connection.');
    const paths = dashboard === 'lovelace' ? ['lovelace', null] : [dashboard];
    // Remember which path actually supplied this dashboard, including the
    // default null path, instead of repeating a failed alias request.
    paths.sort((a, b) => Number(state?.configs.has(b) || false) - Number(state?.configs.has(a) || false));
    const checked = [];
    for (const path of paths) {
      let config;
      try { config = await savedDashboard(apiHass, path, state); }
      catch (error) {
        if (['not_found', 'config_not_found'].includes(error?.code)) {
          checked.push(`${path ?? 'default'}: configuration not found`);
          continue;
        }
        throw error;
      }
      const index = indexDashboard(config, entityIds.length > 0);
      if (hasEntries(index)) return index;
      checked.push(`${path ?? 'default'}: missing ${[
        ...cardIds.filter(id => !index.sources.has(id)),
        ...entityIds.filter(id => !index.entities.has(id))
      ].join(', ')}`);
    }
    throw new Error(`Cannot find the dashboard references. Checked ${checked.join('; ')}. ` +
      'Save the updated dashboard YAML and retain its reference identifiers.');
  }

  function entityTokens(card) {
    const ids = new Set();
    const visit = value => {
      if (typeof value === 'string') {
        for (const match of value.matchAll(ENTITY_TOKEN)) ids.add(match[1]);
        if (value.includes('[[entity:') && value.replace(ENTITY_TOKEN, '').includes('[[entity:')) {
          throw new Error('An entity reference token is incomplete. Use [[entity:identifier]].');
        }
      } else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(card);
    return [...ids];
  }

  function resolveEntityCard(card, references, ids, expectedDomains) {
    const values = new Map();
    for (const id of ids) {
      const reference = references.get(id);
      if (!reference) throw new Error(`Missing entity reference: ${id}.`);
      const entity = readReference(reference, id);
      const expected = expectedDomains[id];
      if (expected && entity.split('.')[0] !== expected) {
        throw new Error(`${id} now points to ${entity}; its existing popup control expects ${expected}. Update that control before changing its domain.`);
      }
      values.set(id, entity);
    }
    const resolve = value => {
      if (typeof value === 'string') return value.replace(ENTITY_TOKEN, (_match, id) => values.get(id));
      if (Array.isArray(value)) return value.map(resolve);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).filter(([key]) =>
          !REFERENCE_METADATA.has(key)).map(([key, child]) => [key, resolve(child)]));
      }
      return value;
    };
    return resolve(card);
  }

  function isHeadingButton(card) {
    // Integration badges decorate a heading; they do not turn it into a
    // control. Remove that whole row in popups, keeping the original intact.
    const decorativeFields = !card?.custom_fields ||
      Object.keys(card.custom_fields).every(key => key === 'integrations');
    return card?.type === 'custom:button-card' &&
      typeof card.name === 'string' && card.name.trim() &&
      !card.entity && !card.template && decorativeFields &&
      card.show_icon === false && card.show_state === false &&
      card.show_label === false &&
      ['tap_action', 'hold_action', 'double_tap_action'].every(key =>
        !card[key] || card[key].action === 'none');
  }

  function removePrimaryHeading(card) {
    if (!card || typeof card !== 'object') return card;
    if (isHeadingButton(card)) return null;
    if (card.type === 'custom:mushroom-title-card' && card.title) {
      // Billing subtitles describe the data and should remain visible.
      if (!card.subtitle) return null;
      delete card.title;
      return card;
    }
    if (typeof card.title === 'string' && card.title.trim()) {
      // An entities header can also hold an all-on/off switch. Keep that
      // header truthy so removing its label does not remove the switch.
      if (card.type === 'entities' && card.show_header_toggle !== false) {
        card.title = ' ';
      } else {
        delete card.title;
      }
      return card;
    }
    if (card.card) {
      const content = removePrimaryHeading(card.card);
      if (!content) return null;
      card.card = content;
    } else if (Array.isArray(card.cards) && card.cards.length) {
      const first = removePrimaryHeading(card.cards[0]);
      if (first) card.cards[0] = first;
      else card.cards.shift();
    }
    return card;
  }

  function isDateSelector(card) {
    if (card?.type === 'energy-date-selection') return true;
    return Array.isArray(card?.cards) && card.cards.length > 0 &&
      card.cards.every(isDateSelector);
  }

  function sourceHeading(card) {
    if (!card || typeof card !== 'object') return '';
    if (typeof card.title === 'string' && card.title.trim()) return card.title.trim();
    if (isHeadingButton(card)) return card.name.trim();
    if (card.card) return sourceHeading(card.card);
    return Array.isArray(card.cards) && card.cards.length ? sourceHeading(card.cards[0]) : '';
  }

  function tabLabel(source, id) {
    if (isDateSelector(source)) return 'Date Range';
    return titleCase(sourceHeading(source) || id.replaceAll('_', ' '));
  }

  function titleCase(text) {
    const minorWords = new Set([
      'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in',
      'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs'
    ]);
    const words = [...text.matchAll(/[A-Za-z][A-Za-z0-9\u2019']*/g)];
    let index = 0;
    return text.replace(/[A-Za-z][A-Za-z0-9\u2019']*/g, (word, offset) => {
      const first = index === 0;
      const last = index === words.length - 1;
      const afterBreak = /[:.!?\u2014\u2013]\s*$/.test(text.slice(0, offset));
      index += 1;
      // Preserve acronyms and product names such as HVAC, EV and ESPHome.
      if (word.length > 1 && word === word.toUpperCase()) return word;
      if (!first && !last && !afterBreak && minorWords.has(word.toLowerCase())) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
  }

  function cloneCard(card, removeHeading = false) {
    const clone = JSON.parse(JSON.stringify(card));
    const strip = (value) => {
      if (Array.isArray(value)) return value.forEach(strip);
      if (!value || typeof value !== 'object') return;
      delete value.card_reference_id;
      for (const key of REFERENCE_METADATA) delete value[key];
      for (const child of Object.values(value)) strip(child);
    };
    strip(clone);
    // These options belong to the original section's placement, not the popup.
    delete clone.grid_options;
    delete clone.layout_options;
    const content = removeHeading ? removePrimaryHeading(clone) : clone;
    const formatTitles = value => {
      if (Array.isArray(value)) return value.forEach(formatTitles);
      if (!value || typeof value !== 'object') return;
      const staticText = text => typeof text === 'string' &&
        !['{{', '{%', '[[['].some(marker => text.includes(marker));
      if (staticText(value.title)) value.title = titleCase(value.title);
      if (isHeadingButton(value) && staticText(value.name)) value.name = titleCase(value.name);
      for (const key of ['cards', 'card', 'tabs', 'entities', 'elements']) {
        if (value[key]) formatTitles(value[key]);
      }
    };
    formatTitles(content);
    return content;
  }

  function utilitiesWithDateSelector(entries) {
    if (entries.length !== 2) return null;
    const utilities = entries.find(entry => entry.id === 'utilities');
    const dateRange = entries.find(entry => entry.id === 'energy_date');
    if (!utilities || !dateRange || !isDateSelector(dateRange.card)) return null;

    const selectors = [];
    const collectSelectors = card => {
      if (card.type === 'energy-date-selection') selectors.push(card);
      else for (const child of card.cards || []) collectSelectors(child);
    };
    collectSelectors(dateRange.card);

    // These are already clones: only the popup gets the appended control
    // and shared collection. The saved Environment cards are never mutated.
    const card = utilities.card.type === 'custom:stack-in-card' &&
      utilities.card.mode !== 'horizontal' && Array.isArray(utilities.card.cards)
      ? utilities.card
      : { type: 'custom:stack-in-card', mode: 'vertical', cards: [utilities.card] };
    card.cards.push(...selectors);

    const linkedTypes = new Set([
      'energy-date-selection', 'energy-distribution',
      'energy-grid-balance', 'power-sources-graph'
    ]);
    const linkDateRange = value => {
      if (Array.isArray(value)) return value.forEach(linkDateRange);
      if (!value || typeof value !== 'object') return;
      if (linkedTypes.has(value.type)) value.collection_key = 'energy_utilities_popup';
      for (const key of ['cards', 'card', 'tabs']) {
        if (value[key]) linkDateRange(value[key]);
      }
    };
    linkDateRange(card);
    return card;
  }

  class DashboardCardReference extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = ':host{display:block;min-width:0;width:100%}.status{padding:16px;color:var(--secondary-text-color);font:inherit}';
      this._container = document.createElement('div');
      this.shadowRoot.append(style, this._container);
      this._generation = 0;
      this._pending = false;
      this._ready = false;
      this._card = null;
      this._config = null;
      this._hass = null;
    }

    setConfig(config) {
      const ids = config.card_ids || (config.card_id ? [config.card_id] : []);
      if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id)) {
        throw new Error('Supply card_id or a nonempty card_ids list.');
      }
      if (config.dashboard !== undefined && typeof config.dashboard !== 'string') {
        throw new Error('dashboard must be the dashboard URL path.');
      }
      this._config = { ids: [...ids], dashboard: config.dashboard || 'lovelace' };
      this._generation += 1;
      this._pending = false;
      this._ready = false;
      this._card = null;
      this._showStatus('Loading…');
      this._start();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._card) this._card.hass = hass;
      this._start();
    }

    get hass() { return this._hass; }

    connectedCallback() { this._start(); }

    disconnectedCallback() {
      this._generation += 1;
      this._pending = false;
    }

    _showStatus(message) {
      const status = document.createElement('div');
      status.className = 'status';
      status.textContent = message;
      this._container.replaceChildren(status);
    }

    async _fetchSources(ids) {
      return (await fetchDashboardIndex(this._hass, this._config.dashboard, ids)).sources;
    }

    async _start() {
      if (!this._config || !this._hass || this._pending || this._ready || !this.isConnected) return;
      const generation = this._generation;
      const ids = [...this._config.ids];
      let stage = 'dashboard lookup';
      this._pending = true;
      try {
        const sources = await this._fetchSources(ids);
        if (generation !== this._generation || !this.isConnected) return;
        const entries = ids.map(id => {
          const source = sources.get(id);
          if (!source) throw new Error(`Source card not found: ${id}`);
          if (source.type === 'custom:dashboard-card-reference') {
            throw new Error(`Source ${id} refers to another reference card.`);
          }
          return { id, label: tabLabel(source, id), card: cloneCard(source, true) };
        }).filter(entry => entry.card);
        if (!entries.length) throw new Error('The referenced cards contain only headings.');
        // Utilities keeps its selector within the same card, below the graphs.
        // Other combined popups retain their existing tabs.
        const cardConfig = utilitiesWithDateSelector(entries) ||
          (entries.length === 1 ? entries[0].card : {
          type: 'custom:tabbed-card-programmable',
          options: { defaultTabIndex: 0 },
          styles: {
            '--md-divider-color': 'rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.10)',
            '--md-divider-thickness': '1px',
            '--md-primary-tab-active-indicator-color': 'var(--primary-color)',
            '--md-primary-tab-active-label-text-color': 'var(--primary-color)',
            '--md-primary-tab-container-color': 'transparent',
            '--md-primary-tab-label-text-size': '0.9rem',
            '--md-sys-color-on-surface-variant': 'rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.58)',
            '--md-sys-color-primary': 'var(--primary-color)'
          },
          tabs: entries.map(({ label, card }) => ({
            attributes: { label, stacked: false }, card
          }))
        });
        stage = 'card helpers';
        if (typeof window.loadCardHelpers !== 'function') {
          throw new Error('Home Assistant card helpers are unavailable.');
        }
        const helpers = await window.loadCardHelpers();
        if (generation !== this._generation || !this.isConnected) return;
        if (typeof helpers?.createCardElement !== 'function') {
          throw new Error('Home Assistant card helpers do not expose createCardElement.');
        }
        stage = 'card rendering';
        const card = await helpers.createCardElement(cardConfig);
        if (generation !== this._generation || !this.isConnected) return;
        if (!card) throw new Error('The source card renderer returned no element.');
        card.hass = this._hass;
        this._card = card;
        this._container.replaceChildren(card);
        this._ready = true;
      } catch (error) {
        if (generation !== this._generation || !this.isConnected) return;
        const message = String(error?.message || error?.code || error || 'Unknown error');
        console.error(`Dashboard Card Reference ${VERSION} (${stage}, ${ids.join(', ')}):`, error);
        this._showStatus(`Popup ${ids.join(', ')} — ${stage}: ${message.slice(0, 600)} [helper ${VERSION}]`);
        // Do not retry a failed source lookup on every state update.
        this._ready = true;
      } finally {
        if (generation === this._generation) this._pending = false;
      }
    }

    getCardSize() {
      return this._card?.getCardSize?.() || 4;
    }

    getGridOptions() {
      return this._card?.getGridOptions?.() || { columns: 12, rows: 'auto' };
    }
  }

  class DashboardEntityReference extends DashboardCardReference {
    setConfig(config) {
      if (!config.card || typeof config.card !== 'object' || Array.isArray(config.card) ||
          typeof config.card.type !== 'string') {
        throw new Error('Supply the existing popup layout under card.');
      }
      if (config.card.type === `custom:${ENTITY_ELEMENT_NAME}`) {
        throw new Error('An entity reference card cannot wrap itself.');
      }
      if (config.dashboard !== undefined && typeof config.dashboard !== 'string') {
        throw new Error('dashboard must be the dashboard URL path.');
      }
      const ids = entityTokens(config.card);
      if (!ids.length) throw new Error('The popup layout needs at least one [[entity:identifier]] reference.');
      const expectedDomains = config.expected_domains || {};
      if (typeof expectedDomains !== 'object' || Array.isArray(expectedDomains) ||
          Object.values(expectedDomains).some(domain => typeof domain !== 'string' || !/^[a-z_]+$/.test(domain))) {
        throw new Error('expected_domains must map reference identifiers to entity domains.');
      }
      this._config = { ids, dashboard: config.dashboard || 'lovelace',
        card: config.card, expectedDomains: { ...expectedDomains } };
      this._generation += 1;
      this._pending = false;
      this._ready = false;
      this._card = null;
      this._showStatus('Loading…');
      this._start();
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      // If Browser Mod reuses the same content element after closing a popup,
      // its next attachment must resolve the latest saved entity bindings.
      this._ready = false;
      this._card = null;
    }

    async _start() {
      if (!this._config || !this._hass || this._pending || this._ready || !this.isConnected) return;
      const generation = this._generation;
      const { ids, dashboard, card: layout, expectedDomains } = this._config;
      let stage = 'entity lookup';
      this._pending = true;
      try {
        const index = await fetchDashboardIndex(this._hass, dashboard, [], ids);
        if (generation !== this._generation || !this.isConnected) return;
        const resolved = resolveEntityCard(layout, index.entities, ids, expectedDomains);
        stage = 'card helpers';
        if (typeof window.loadCardHelpers !== 'function') throw new Error('Home Assistant card helpers are unavailable.');
        const helpers = await window.loadCardHelpers();
        if (generation !== this._generation || !this.isConnected) return;
        if (typeof helpers?.createCardElement !== 'function') throw new Error('Home Assistant card helpers do not expose createCardElement.');
        stage = 'card rendering';
        const card = await helpers.createCardElement(resolved);
        if (generation !== this._generation || !this.isConnected) return;
        if (!card) throw new Error('The Room popup renderer returned no element.');
        card.hass = this._hass;
        this._card = card;
        this._container.replaceChildren(card);
        this._ready = true;
      } catch (error) {
        if (generation !== this._generation || !this.isConnected) return;
        console.error(`Dashboard Entity Reference ${VERSION} (${stage}):`, error);
        const message = String(error?.message || error?.code || error || 'Unknown error');
        this._showStatus(`Room popup — ${stage}: ${message.slice(0, 600)} [helper ${VERSION}]`);
        this._ready = true;
      } finally {
        if (generation === this._generation) this._pending = false;
      }
    }
  }

  if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, DashboardCardReference);
  if (!customElements.get(ENTITY_ELEMENT_NAME)) customElements.define(ENTITY_ELEMENT_NAME, DashboardEntityReference);
  window.customCards = window.customCards || [];
  if (!window.customCards.some(card => card.type === ELEMENT_NAME)) {
    window.customCards.push({ type: ELEMENT_NAME, name: 'Dashboard Card Reference',
      description: 'Open the saved source card from another dashboard tab.' });
  }
  if (!window.customCards.some(card => card.type === ENTITY_ELEMENT_NAME)) {
    window.customCards.push({ type: ENTITY_ELEMENT_NAME, name: 'Dashboard Entity Reference',
      description: 'Keep an existing Room popup layout and inherit named dashboard entities.' });
  }
})();
