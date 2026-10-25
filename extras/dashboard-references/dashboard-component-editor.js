/* Dashboard Component Editor 1.1.1 — frontend resource, no dashboard migration.
 * Uses HA's own editors; the adapter is active only while editing a card.
 * No imports, external services, telemetry, or changes to card rendering.
 */
(() => {
  "use strict";
  const VERSION = "1.1.1";
  if (window.DashboardComponentEditor) return;
  const TAG = "dashboard-component-editor";
  const BYPASS = Symbol.for("dashboard-component-editor.native");
  const REFERENCE_EDITOR = "dashboard-reference-native-editor";
  const REFERENCE_TYPES = new Set([
    "custom:floor3dx-card", "custom:floor3dpro-card", "custom:floor3d-card",
    "custom:floor3d-snapshot-card",
  ]);
  // dashboard-reference-editor.js owns token resolution, reverse mapping,
  // cross-dashboard discovery, expected_domains, and preview forwarding.
  // Pass the complete original wrapper to it, including its source metadata.
  function referenceEditorOwns(card) {
    return card?.type === "custom:dashboard-entity-reference" &&
      REFERENCE_TYPES.has(card.card?.type) &&
      !!customElements.get("dashboard-entity-reference")?.referenceEditorVersion &&
      !!customElements.get(REFERENCE_EDITOR);
  }
  const PROTECTED = new Set([
    "card_mod", "card_reference_id", "entity_reference_id",
    "entity_reference_fields", "entity_reference_extra", "view_layout",
    "grid_options", "layout_options", "visibility", "popup_card_id",
  ]);
  const TOKEN = /\[\[entity:([^\]]+)\]\]/g;
  const hasTokens = v => JSON.stringify(v ?? null).includes("[[entity:");
  const obj = v => v !== null && typeof v === "object" && !Array.isArray(v);
  const clone = v => {
    if (Array.isArray(v)) return v.map(clone);
    if (obj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
    return v;
  };
  const equal = (a, b) => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
    if (!obj(a) || !obj(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  };
  const at = (v, p) => p.reduce((x, k) => x?.[k], v);
  const put = (v, p, value) => {
    if (!p.length) return value;
    const [k, ...rest] = p;
    const out = Array.isArray(v) ? v.slice() : { ...v };
    out[k] = put(v?.[k], rest, value);
    return out;
  };
  function visit(v, fn, path = []) {
    if (!v || typeof v !== "object") return;
    fn(v, path);
    for (const [k, x] of Object.entries(v)) visit(x, fn, path.concat(Array.isArray(v) ? Number(k) : k));
  }
  function indexEntities(config) {
    const found = new Map();
    const add = (key, value) => {
      if (typeof key !== "string" || typeof value !== "string" || value.includes("[[entity:")) return;
      if (found.has(key) && found.get(key) !== value) found.set(key, null);
      else if (!found.has(key)) found.set(key, value);
    };
    visit(config, v => {
      if (!obj(v)) return;
      if (v.entity_reference_id) add(v.entity_reference_id, v.entity);
      for (const [key, value] of Object.entries(v.entity_reference_extra || {})) add(key, value);
      for (const [key, spec] of Object.entries(v.entity_reference_fields || {})) {
        if (!obj(spec) || !Array.isArray(spec.path)) continue;
        let value = at(v, spec.path);
        if (typeof value === "string" && spec.domain) {
          const hits = value.match(new RegExp(`\\b${String(spec.domain).replace(/[^a-z_]/g, "")}\\.[a-z0-9_]+`, "g"));
          if (hits && new Set(hits).size === 1) value = hits[0];
        }
        add(key, value);
      }
    });
    return found;
  }
  // Metadata lives outside native editors. Bindings are resolved only in this
  // temporary working copy, and restored when the edited component is put back.
  function prepare(original, entities) {
    const unresolved = new Set();
    function walk(v) {
      if (typeof v === "string") return v.replace(TOKEN, (all, key) => {
        const value = entities.get(key);
        if (value) return value;
        unresolved.add(key);
        return all;
      });
      if (Array.isArray(v)) return v.map(walk);
      if (!obj(v)) return v;
      return Object.fromEntries(Object.entries(v).filter(([k]) => !PROTECTED.has(k)).map(([k, x]) => [k, walk(x)]));
    }
    return { clean: walk(original), unresolved: [...unresolved] };
  }
  // Pair unchanged/moved array entries before matching changed entries. If
  // identity is ambiguous, stop instead of assigning metadata to another item.
  function matchArray(before, after) {
    const map = new Map(), used = new Set();
    const take = (i, j) => { map.set(i, j); used.add(j); };
    for (let i = 0; i < after.length; i++) {
      const matches = before.flatMap((x, j) => !used.has(j) && equal(x, after[i]) ? [j] : []);
      if (matches.length) take(i, matches[0]);
    }
    for (const key of ["entity", "name", "title", "type"]) {
      for (let i = 0; i < after.length; i++) {
        if (map.has(i) || !obj(after[i]) || after[i][key] == null) continue;
        const matches = before.flatMap((x, j) => !used.has(j) && obj(x) && x[key] === after[i][key] ? [j] : []);
        const peers = after.filter((x, n) => !map.has(n) && obj(x) && x[key] === after[i][key]);
        if (matches.length === 1 && peers.length === 1) take(i, matches[0]);
      }
    }
    const a = after.map((_, i) => i).filter(i => !map.has(i));
    const b = before.map((_, i) => i).filter(i => !used.has(i));
    if (a.length === 1 && b.length === 1) take(a[0], b[0]);
    else if (a.length && b.length) {
      const ambiguous = b.some(j => JSON.stringify(before[j]) !== JSON.stringify(after[a[b.indexOf(j)]]));
      if (ambiguous) throw Error("Several entries changed without a stable identity. Edit one component or row at a time to preserve its metadata.");
    }
    return map;
  }
  function restore(original, clean, edited, locked = []) {
    if (typeof original === "string" && original.includes("[[entity:")) {
      if (!equal(clean, edited)) locked.push(original);
      return original;
    }
    if (Array.isArray(original) && Array.isArray(clean) && Array.isArray(edited)) {
      const matches = matchArray(clean, edited);
      return edited.map((x, i) => matches.has(i) ? restore(original[matches.get(i)], clean[matches.get(i)], x, locked) : clone(x));
    }
    if (!obj(original) || !obj(clean) || !obj(edited)) return clone(edited);
    const out = {};
    for (const [k, v] of Object.entries(edited)) {
      if (!PROTECTED.has(k)) out[k] = Object.hasOwn(original, k) ? restore(original[k], clean[k], v, locked) : clone(v);
    }
    for (const [k, v] of Object.entries(original)) {
      if (PROTECTED.has(k)) out[k] = clone(v);
      // A GUI removing a field must not silently break a live entity binding.
      else if (!Object.hasOwn(edited, k) && typeof v === "string" && v.includes("[[entity:")) {
        out[k] = v;
        locked.push(v);
      }
    }
    return out;
  }
  // Some native editors write [[entity:…]] tokens themselves (floor3dx-rooms-card
  // with "Keep references"). Their output is taken as it is — no row pairing,
  // which cannot work when every row changed from an id to a token — and only
  // the protected metadata is put back, object by object along the same keys.
  function reattach(original, edited) {
    if (Array.isArray(original) && Array.isArray(edited)) return edited.map((x, i) => reattach(original[i], x));
    if (!obj(original) || !obj(edited)) return clone(edited);
    const out = {};
    for (const [k, v] of Object.entries(edited)) if (!PROTECTED.has(k)) out[k] = Object.hasOwn(original, k) ? reattach(original[k], v) : clone(v);
    for (const [k, v] of Object.entries(original)) if (PROTECTED.has(k)) out[k] = clone(v);
    return out;
  }
  const label = c => {
    const name = [c.title, c.name, c.primary, c.entity].find(x => typeof x === "string" && x.length < 85 && !x.includes("{{"));
    return `${name ? `${name} · ` : ""}${c.type || "Card"}`;
  };
  function components(config) {
    const list = [];
    visit(config, (v, path) => {
      if (!obj(v) || typeof v.type !== "string") return;
      const key = path.at(-1), parentKey = path.at(-2);
      if (!path.length || key === "card" || key === "content" || parentKey === "cards" ||
          (key === "element" && at(config, path.slice(0, -1))?.type === "custom:uix-forge")) {
        list.push({ path, card: v, label: `${path.length ? path.join(" / ") + " — " : "Whole card — "}${label(v)}` });
      }
    });
    return list;
  }
  function sourceCards(config, id) {
    const matches = [];
    visit(config, (v, path) => {
      if (obj(v) && typeof v.type === "string" && v.card_reference_id === id) matches.push({ path, card: v });
    });
    return matches;
  }
  const bindingStates = new WeakMap();
  const entityID = /^[a-z_]+\.[a-z0-9_]+$/;
  const entityFields = new Set(["entity", "entity_id", "camera_entity", "remote_id", "media_player_id", "color_entity", "top_entity", "icon_entity", "triggers_update"]);
  const activeDashboard = () => location.pathname.split("/").filter(Boolean)[0] || "lovelace";
  const dashboardData = x => x?.views ? x : x?.config?.views ? x.config : x?.data?.config?.views ? x.data.config : null;
  function bindingState(editor) {
    let state = bindingStates.get(editor);
    if (!state || state.connection !== editor.hass?.connection) {
      state = { maps: new Map(), jobs: new Map(), connection: editor.hass?.connection, edit: 0 };
      bindingStates.set(editor, state);
    }
    return state;
  }
  function scopesFor(config, dashboard = activeDashboard()) {
    const scopes = new Map();
    function walk(v, scope) {
      if (typeof v === "string") {
        for (const m of v.matchAll(TOKEN)) {
          if (!scopes.has(scope)) scopes.set(scope, new Set());
          scopes.get(scope).add(m[1]);
        }
      } else if (Array.isArray(v)) v.forEach(x => walk(x, scope));
      else if (obj(v)) {
        const wrapper = v.type === "custom:dashboard-entity-reference";
        for (const [k, x] of Object.entries(v)) walk(x, wrapper && k === "card" ? v.dashboard || "lovelace" : scope);
      }
    }
    walk(config, dashboard);
    return scopes;
  }
  function scopeAtPath(config, path, dashboard = activeDashboard()) {
    let node = config, scope = dashboard;
    for (const key of path) {
      if (node?.type === "custom:dashboard-entity-reference" && key === "card") scope = node.dashboard || "lovelace";
      node = node?.[key];
    }
    return scope;
  }
  async function sourceMaps(editor, config, dashboard = activeDashboard()) {
    const state = bindingState(editor);
    const scopes = scopesFor(config, dashboard);
    await Promise.all([...scopes].map(async ([scope, roles]) => {
      if (scope === activeDashboard()) {
        const local = indexEntities(editor.lovelace || controller()?.config || {});
        for (const [k, v] of indexEntities(editor.value || editor._config || {})) local.set(k, v);
        if ([...roles].every(k => local.get(k))) { state.maps.set(scope, local); return; }
      }
      if (state.maps.has(scope) && [...roles].every(k => state.maps.get(scope).get(k))) return;
      if (!state.jobs.has(scope)) {
        state.jobs.set(scope, (async () => {
          if (typeof editor.hass?.callWS !== "function") throw Error(`Cannot read entity sources from ${scope}.`);
          const paths = scope === "lovelace" ? ["lovelace", null] : [scope];
          let data;
          for (const path of paths) {
            try { data = dashboardData(await editor.hass.callWS({ type: "lovelace/config", url_path: path, force: false })); break; }
            catch (e) { if (path === paths.at(-1) || !["not_found", "config_not_found"].includes(e?.code)) throw e; }
          }
          if (!data) throw Error(`No dashboard configuration returned for ${scope}.`);
          const map = indexEntities(data); state.maps.set(scope, map); return map;
        })());
      }
      try { await state.jobs.get(scope); } finally { state.jobs.delete(scope); }
      const missing = [...roles].filter(k => !state.maps.get(scope)?.get(k));
      if (missing.length) throw Error(`Missing or ambiguous entity sources in ${scope}: ${missing.join(", ")}.`);
    }));
    return state.maps;
  }
  function resolvedBindings(config, maps, dashboard = activeDashboard()) {
    function walk(v, scope) {
      if (typeof v === "string") return v.replace(TOKEN, (_, role) => {
        const id = maps.get(scope)?.get(role);
        if (!id) throw Error(`Cannot resolve ${role} in ${scope}.`);
        return id;
      });
      if (Array.isArray(v)) return v.map(x => walk(x, scope));
      if (!obj(v)) return v;
      const wrapper = v.type === "custom:dashboard-entity-reference";
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, wrapper && k === "card" ? v.dashboard || "lovelace" : scope)]));
    }
    return walk(config, dashboard);
  }
  // Three-way conversion preserves each original role when its resolved value
  // did not change. Only edits in a referenced card are reverse-mapped; normal
  // source-card entities and outer popup targets remain ordinary entity IDs.
  function referencedBindings(original, edited, maps, states = {}, dashboard = activeDashboard()) {
    function walk(o, e, scope, referenced = false, key = "", preferred = new Set()) {
      const r = resolvedBindings(o, maps, scope);
      if (equal(r, e)) return clone(o);
      if (typeof e === "string") {
        if (e.startsWith("data:") || (!referenced && !(typeof o === "string" && o.includes("[[entity:")))) return e;
        const sources = maps.get(scope);
        if (!sources) throw Error(`Entity sources for ${scope} are not loaded.`);
        const ownRoles = new Set(typeof o === "string" ? [...o.matchAll(TOKEN)].map(m => m[1]) : []);
        const hook = id => id.startsWith("input_button.floor3d_");
        const choose = id => {
          let roles = [...sources].filter(([, value]) => value === id).map(([role]) => role);
          if (!roles.length) {
            if (!hook(id) && (states[id] || ((entityFields.has(key) || key.endsWith("_entity")) && entityID.test(e)))) {
              throw Error(`No source reference exists for ${id}. Add it to the source dashboard, save, and reopen this editor.`);
            }
            return id;
          }
          for (const preference of [ownRoles, preferred]) {
            const selected = roles.filter(role => preference.has(role));
            if (selected.length === 1) { roles = selected; break; }
          }
          if (roles.length !== 1) throw Error(`Several source labels refer to ${id}: ${roles.join(", ")}. Use its existing source reference to disambiguate.`);
          return `[[entity:${roles[0]}]]`;
        };
        return e.replace(/\[\[entity:[^\]]+\]\]|[a-z_]+\.[a-z0-9_]+/g, (id, offset, text) => {
          if (id.startsWith("[[entity:")) {
            const role = id.slice(9, -2);
            if (!sources.get(role)) throw Error(`Unknown source reference: ${role}.`);
            return id;
          }
          if (/[A-Za-z0-9_.]/.test(text[offset - 1] || "") || /[A-Za-z0-9_.]/.test(text[offset + id.length] || "")) return id;
          return choose(id);
        });
      }
      if (Array.isArray(e)) {
        const old = Array.isArray(o) ? o : [];
        const resolved = resolvedBindings(old, maps, scope);
        const matches = matchArray(resolved, e);
        return e.map((x, i) => walk(matches.has(i) ? old[matches.get(i)] : undefined, x, scope, referenced, key, preferred));
      }
      if (!obj(e)) return e;
      const wrapper = e.type === "custom:dashboard-entity-reference";
      const out = Object.fromEntries(Object.entries(e).map(([k, x]) => {
        const childScope = wrapper && k === "card" ? e.dashboard || "lovelace" : scope;
        const roles = wrapper && k === "card" ? new Set([...JSON.stringify(o?.card || {}).matchAll(TOKEN)].map(m => m[1])) : preferred;
        return [k, walk(o?.[k], x, childScope, referenced || (wrapper && k === "card"), k, roles)];
      }));
      const roleSets = v => [...scopesFor(v, out.dashboard || "lovelace")].map(([s, roles]) => [s, [...roles].sort()]);
      if (wrapper && out.expected_domains) {
        const roles = [...scopesFor({ type: out.type, dashboard: out.dashboard, card: out.card }).values()].flatMap(x => [...x]);
        const domains = Object.fromEntries(roles.map(role => [role, maps.get(out.dashboard || "lovelace")?.get(role)?.split(".")[0]]));
        if (!equal(roleSets(o?.card), roleSets(out.card)) || roles.some(role => out.expected_domains[role] !== domains[role])) out.expected_domains = domains;
      }
      return out;
    }
    return walk(original, edited, dashboard);
  }
  // Keep HA's canonical value and preview tokenized. Replace ONLY the YAML
  // editor's defaultValue binding in the Lit template with a resolved copy.
  function yamlWorkingTemplate(template, value, result = { replaced: false }) {
    if (Array.isArray(template)) return template.map(x => yamlWorkingTemplate(x, value, result));
    if (!template?.strings || !Array.isArray(template.values)) return template;
    const values = template.values.map((x, i) => {
      if (/<ha-yaml-editor\b/.test(template.strings[i]) && /\.defaultValue=\s*$/.test(template.strings[i])) {
        result.replaced = true; return value;
      }
      return yamlWorkingTemplate(x, value, result);
    });
    return { ...template, values };
  }
  function installResolvedYAML(proto) {
    const render = proto.render, changed = proto._handleYAMLChanged;
    if (typeof render !== "function" || typeof changed !== "function") {
      console.warn("Dashboard Component Editor: resolved YAML support is unavailable for this HA frontend."); return;
    }
    proto.render = function (...args) {
      if (this.GUImode !== false || !scopesFor(this.value).size) return render.apply(this, args);
      const state = bindingState(this);
      let resolved;
      try { resolved = resolvedBindings(this.value, state.maps); }
      catch (_) {
        if (!state.loading && !state.loadError) {
          state.loading = true;
          sourceMaps(this, this.value).then(() => { state.loadError = null; }).catch(e => { state.loadError = e.message; }).finally(() => { state.loading = false; this.requestUpdate(); });
        }
        return state.loadError || "Resolving entity references for the YAML editor…";
      }
      const status = { replaced: false };
      const rendered = yamlWorkingTemplate(render.apply(this, args), resolved, status);
      if (!status.replaced) return "Resolved YAML editing is unavailable: the HA editor template has changed.";
      return [state.error || "", rendered];
    };
    proto._handleYAMLChanged = function (event) {
      const state = bindingState(this), edit = ++state.edit;
      if (!event.detail?.isValid || (!scopesFor(this.value).size && !scopesFor(event.detail.value).size)) {
        state.error = null; return changed.call(this, event);
      }
      const original = clone(this.value), working = clone(event.detail.value);
      const detail = event.detail;
      if (equal(working, state.lastDraft) && equal(original, state.lastLinked)) {
        state.error = null;
        return changed.call(this, { stopPropagation() { event.stopPropagation(); }, detail: { ...detail, isValid: true, value: clone(state.lastLinked) } });
      }
      // HA's normal invalid-input path disables Save until conversion succeeds.
      changed.call(this, { stopPropagation() { event.stopPropagation(); }, detail: { ...detail, isValid: false } });
      Promise.all([sourceMaps(this, original), sourceMaps(this, working)]).then(() => {
        if (state.edit !== edit || !this.isConnected) return;
        const linked = referencedBindings(original, working, state.maps, this.hass?.states);
        state.lastDraft = clone(working); state.lastLinked = clone(linked);
        state.error = null;
        changed.call(this, { stopPropagation() {}, detail: { ...detail, isValid: true, value: linked } });
        this.requestUpdate();
      }).catch(e => {
        if (state.edit !== edit || !this.isConnected) return;
        state.error = `Entity-reference edit was not applied: ${e.message}`;
        this.requestUpdate();
      });
    };
  }
  // The current dashboard controller is needed only for an explicit source-card
  // save. It preserves HA's storage/YAML behavior and current dashboard state.
  function controller() {
    function find(root) {
      const direct = root.querySelector("hui-root");
      if (direct?.lovelace) return direct.lovelace;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) { const result = find(el.shadowRoot); if (result) return result; }
      }
      return null;
    }
    return find(document);
  }
  function insideAdapter(el) {
    if (el[BYPASS]) return true;
    for (let x = el; x; x = x.parentNode || x.host) {
      if (x.localName === TAG || x.localName === REFERENCE_EDITOR) return true;
    }
    return false;
  }
  const css = `
    :host{display:block;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,inherit)}
    .capsule{border:1px solid rgba(var(--rgb-primary-color,3,169,244),.23);background:rgba(var(--rgb-primary-color,3,169,244),.07);border-radius:14px;padding:12px;margin-bottom:16px}
    .heading{font-weight:600;margin-bottom:7px}.hint,.path{font-size:13px;line-height:1.5;color:var(--secondary-text-color);overflow-wrap:anywhere}
    select,input,textarea{box-sizing:border-box;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;width:100%;padding:10px;min-height:44px}
    select{margin:8px 0}button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid var(--divider-color,#aaa);padding:9px 12px;background:var(--card-background-color,#fff);color:var(--primary-color,#039be5);min-height:42px}
    button:disabled{opacity:.5;cursor:default}.buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.status{font-size:13px;line-height:1.5;margin:8px 0;overflow-wrap:anywhere}.error{color:var(--error-color,#c00)}
    label{display:block}.hidden{display:none!important}#native{min-width:0}pre{white-space:pre-wrap;overflow-wrap:anywhere}textarea{font-family:monospace;min-height:280px;resize:vertical}
  `;
  class ComponentEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._selected = [];
      this._serial = 0;
      this._edited = false;
      this.shadowRoot.innerHTML = `<style>${css}</style><div class="capsule"><div class="heading">Edit component</div><label><span class="hint">Select a card inside this stack, wrapper, tab, or popup.</span><select aria-label="Component"></select></label><div class="path"></div><div class="hint">Styling, layout metadata &amp; entity bindings are preserved. Use the editor below, then the dialog’s Save button.</div><div class="buttons"><button id="mode" type="button">Show component YAML</button><button id="back" type="button" class="hidden">Back to reference</button><button id="save-source" type="button" class="hidden">Save source card</button></div><div id="source-hint" class="hint hidden">Source edits are saved separately with “Save source card”.</div></div><div class="status" role="status" aria-live="polite"></div><div id="refs" class="buttons"></div><div id="native"></div>`;
      this._select = this.shadowRoot.querySelector("select");
      this._body = this.shadowRoot.querySelector("#native");
      this._select.addEventListener("change", () => {
        this._selected = JSON.parse(this._select.value);
        this._mount();
      });
      this.shadowRoot.querySelector("#mode").addEventListener("click", () => {
        if (this._native?.toggleMode) {
          this._native.toggleMode();
          this._modeLabel();
        }
      });
      this.shadowRoot.querySelector("#back").addEventListener("click", () => {
        if (this._sourceDirty && !window.confirm("Discard unsaved source-card edits?")) return;
        this._source = null; this._sourceDirty = false; this._selected = []; this._refresh(true);
      });
      this.shadowRoot.querySelector("#save-source").addEventListener("click", () => this._saveSource());
      // Native editors can emit config-changed just from setConfig(). Do not
      // propagate anything until the user actually interacts with that editor.
      for (const name of ["input", "change", "pointerdown", "keydown", "click"]) {
        this._body.addEventListener(name, e => { if (e.isTrusted) this._edited = true; }, true);
      }
    }
    set hass(value) { this._hass = value; if (this._native) this._native.hass = value; }
    get hass() { return this._hass; }
    set lovelace(value) { this._lovelace = value; this._entities = null; }
    get lovelace() { return this._lovelace; }
    setConfig(config) {
      if (!obj(config) || typeof config.type !== "string") throw Error("A card configuration is required.");
      const changed = !equal(config, this._config);
      this._config = clone(config);
      if (!this._source && changed) this._refresh(!this._native);
    }
    _root() { return this._source ? this._source.working : this._config; }
    _status(message = "", error = false) {
      const el = this.shadowRoot.querySelector(".status");
      el.textContent = message; el.classList.toggle("error", error);
    }
    _refresh(remount = false) {
      const list = components(this._root());
      if (!list.some(x => equal(x.path, this._selected))) { this._selected = []; remount = true; }
      this._select.replaceChildren(...list.map(x => {
        const opt = document.createElement("option"); opt.value = JSON.stringify(x.path); opt.textContent = x.label; return opt;
      }));
      this._select.value = JSON.stringify(this._selected);
      for (const id of ["back", "save-source", "source-hint"]) this.shadowRoot.querySelector(`#${id}`).classList.toggle("hidden", !this._source);
      this.shadowRoot.querySelector("#save-source").disabled = !this._sourceDirty || !!this._sourceSaving;
      if (remount) this._mount();
    }
    async _mount() {
      const serial = ++this._serial;
      this._body.replaceChildren(); this._native = null; this._edited = false;
      this._status();
      const original = at(this._root(), this._selected);
      if (!obj(original)) return;
      this._original = clone(original);
      const all = this._lovelace || controller()?.config || this._config;
      if (!this._entities) {
        this._entities = indexEntities(all);
        // Unsaved source-entity edits in the current parent take precedence
        // over the dashboard's stored values while this dialog remains open.
        for (const [key, value] of indexEntities(this._config)) this._entities.set(key, value);
        if (this._source) for (const [key, value] of indexEntities(this._source.working)) this._entities.set(key, value);
      }
      this._delegated = referenceEditorOwns(original);
      let temp;
      try {
        if (this._delegated) temp = { clean: clone(original), unresolved: [] };
        else {
          const scope = scopeAtPath(this._root(), this._selected);
          if (scopesFor(original, scope).size) {
            const maps = await sourceMaps(this, this._root());
            if (serial !== this._serial) return;
            temp = prepare(resolvedBindings(original, maps, scope), new Map());
          } else temp = prepare(original, this._entities);
        }
      } catch (e) { if (serial === this._serial) this._status(`Cannot load component entity sources: ${e.message}`, true); return; }
      this._clean = temp.clean;
      this.shadowRoot.querySelector(".path").textContent = this._source ? `Source: ${this._source.id} · ${this._selected.join(" / ") || "whole card"}` : this._selected.join(" / ") || "Whole card";
      this._references(original);
      // Pure containers have no editor themselves; selection exposes their
      // children. Still allow the original YAML through the normal dialog.
      try {
        await customElements.whenDefined("hui-card-element-editor");
        if (serial !== this._serial) return;
        const editor = document.createElement("hui-card-element-editor");
        editor[BYPASS] = true;
        editor.hass = this._hass;
        editor.lovelace = this._lovelace;
        editor.context = this.context;
        editor.inDialog = false;
        editor.value = clone(temp.clean);
        editor.addEventListener("config-changed", e => {
          e.stopPropagation();
          if (serial !== this._serial) return;
          this._modeLabel();
          if (e.detail.error) { this._status(e.detail.error, true); return; }
          if (this._edited && e.detail.config) this._change(e.detail.config);
        });
        editor.addEventListener("GUImode-changed", e => { e.stopPropagation(); this._modeLabel(); });
        this._native = editor;
        this._body.append(editor);
        if (temp.unresolved.length) this._status(`Unresolved entity bindings: ${temp.unresolved.join(", ")}. Those bindings will be kept intact.`, true);
      } catch (e) { this._status(`Could not load the component editor: ${e.message}`, true); }
    }
    _modeLabel() {
      this.shadowRoot.querySelector("#mode").textContent = this._native?.GUImode === false ? "Show component visual editor" : "Show component YAML";
    }
    _change(config) {
      // Invalid or initializing editor events never replace the parent card.
      if (!obj(config) || config.type !== this._clean.type) return;
      try {
        const locked = [];
        // Tokens the native editor wrote itself are its decision: keep them.
        const selfReferenced = !this._delegated && hasTokens(config) && !hasTokens(this._clean);
        const restored = this._delegated ? clone(config) : selfReferenced ? reattach(this._original, config) : restore(this._original, this._clean, config, locked);
        if (this._delegated) {
          for (const key of PROTECTED) {
            if (Object.hasOwn(this._original, key)) restored[key] = clone(this._original[key]);
          }
        }
        const next = put(this._root(), this._selected, restored);
        if (locked.length) this._status("Entity bindings are preserved. Change the linked entity on its source card instead.");
        else if (selfReferenced) this._status("The component editor wrote its own entity references; they are kept as written. Use the dialog’s Save button.");
        else this._status(this._source ? "Source changes are pending. Use Save source card." : "Component changes are ready. Use the dialog’s Save button.");
        if (equal(next, this._root())) return;
        this._entities = null;
        if (this._source) {
          this._source.working = next;
          this._sourceDirty = !equal(next, this._source.original);
          this.shadowRoot.querySelector("#save-source").disabled = !this._sourceDirty || !!this._sourceSaving;
        } else {
          this._config = next;
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: clone(next) }, bubbles: true, composed: true }));
        }
      } catch (e) { this._status(e.message, true); }
    }
    _references(card) {
      const el = this.shadowRoot.querySelector("#refs"); el.replaceChildren();
      if (card.type !== "custom:dashboard-card-reference") return;
      const ids = card.card_ids || (card.card_id ? [card.card_id] : []);
      for (const id of ids) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = `Edit source: ${id}`;
        button.addEventListener("click", () => this._openSource(id, card.dashboard)); el.append(button);
      }
    }
    _openSource(id, dashboard) {
      const activePath = location.pathname.split("/").filter(Boolean)[0];
      const currentDashboard = !dashboard || dashboard === activePath;
      // An in-card source must be edited as part of the same parent transaction.
      const local = currentDashboard ? sourceCards(this._config, id) : [];
      if (local.length === 1) { this._selected = local[0].path; this._source = null; this._refresh(true); return; }
      const ll = controller();
      if (!ll || !currentDashboard) {
        this._status(`Open the ${dashboard || "source"} dashboard and edit the card with card_reference_id: ${id}. Source editing here is limited to the current dashboard.`, true); return;
      }
      const matches = sourceCards(ll.config, id);
      if (matches.length !== 1) { this._status(`Source “${id}” has ${matches.length} matches. A unique source is required.`, true); return; }
      const hit = matches[0];
      this._source = { id, path: hit.path, original: clone(hit.card), working: clone(hit.card), dashboardConfig: ll.config };
      this._sourceDirty = false; this._selected = []; this._lovelace = ll.config; this._entities = null; this._refresh(true);
    }
    async _saveSource() {
      const source = this._source, ll = controller();
      if (!source || !this._sourceDirty || this._sourceSaving || !ll) return;
      if (ll.mode !== "storage") { this._status("This dashboard uses YAML mode. Save source edits in its YAML file.", true); return; }
      const hits = sourceCards(ll.config, source.id);
      if (hits.length !== 1 || !equal(hits[0].card, source.original)) {
        this._status("The source card changed while you were editing. Reopen it before saving so no newer changes are overwritten.", true); return;
      }
      const button = this.shadowRoot.querySelector("#save-source"); button.disabled = true;
      const submitted = clone(source.working);
      this._sourceSaving = true;
      try {
        await ll.saveConfig(put(ll.config, hits[0].path, submitted));
        source.original = clone(submitted);
        if (this._source !== source) return;
        this._sourceDirty = !equal(source.working, submitted);
        this._lovelace = ll.config; this._entities = null;
        this._status(this._sourceDirty ? "Source card saved. Newer edits are still pending." : "Source card saved. Its references use the updated source.");
      } catch (e) { this._status(`Source was not saved: ${e.message}`, true); }
      finally { this._sourceSaving = false; button.disabled = !this._sourceDirty; }
    }
  }
  customElements.define(TAG, ComponentEditor);
  // Wait for lazy-loaded HA editors without a document-wide observer or timer.
  customElements.whenDefined("hui-card-element-editor").then(() => {
    const proto = customElements.get("hui-card-element-editor").prototype;
    if (typeof proto.getConfigElement !== "function") {
      console.warn("Dashboard Component Editor: HA editor API is unavailable; leaving the standard editor unchanged."); return;
    }
    const native = proto.getConfigElement;
    installResolvedYAML(proto);
    proto.getConfigElement = async function (...args) {
      if (insideAdapter(this) || referenceEditorOwns(this.value)) return native.apply(this, args);
      return document.createElement(TAG);
    };
  });
  window.DashboardComponentEditor = Object.freeze({ version: VERSION, prepare, restore, reattach, components, indexEntities, sourceCards, equal, resolvedBindings, referencedBindings, yamlWorkingTemplate });
  console.info(`Dashboard Component Editor ${VERSION} loaded`);
})();
