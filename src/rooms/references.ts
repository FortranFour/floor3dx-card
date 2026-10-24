// Entity-reference tokens in dashboard configurations.
//
// Some dashboards keep one authoritative copy of each entity binding and refer to it elsewhere with
// a token, so that a wrapper card resolves `[[entity:kitchen_light]]` to `light.kitchen` when the
// card is rendered (the `dashboard-entity-reference` convention: source cards carry
// `card_reference_id`, and inside them `entity_reference_id`, `entity_reference_fields` and
// `entity_reference_extra` name the entities). A floor3d card found inside such a wrapper carries
// tokens, not entity ids; this module resolves them the same way, from the saved dashboard, so the
// rooms card gets a configuration it can use on its own. Dashboards without tokens are untouched.
export const TOKEN = /\[\[entity:([A-Za-z0-9_.-]+)\]\]/g;
export const WRAPPER_TYPE = 'custom:dashboard-entity-reference';
const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;
/** Distinct first captures of a global regex in a string (matchAll needs es2020). */
function allMatches(text: string, re: RegExp): string[] {
  const out = new Set<string>();
  const r = new RegExp(re.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) { out.add(m[1]); if (m.index === r.lastIndex) r.lastIndex++; }
  return [...out];
}
const META = ['card_reference_id', 'entity_reference_id', 'entity_reference_fields', 'entity_reference_extra'];

/** The role → entity id map a dashboard's source cards define. Invalid entries are skipped. */
export function referenceSources(dashboard: any): Map<string, string> {
  const sources = new Map<string, string>();
  const add = (role: any, entity: any): void => {
    if (typeof role === 'string' && typeof entity === 'string' && ENTITY_ID.test(entity) && !sources.has(role)) sources.set(role, entity);
  };
  const visit = (value: any, inSource = false): void => {
    if (Array.isArray(value)) { value.forEach((v) => visit(v, inSource)); return; }
    if (!value || typeof value !== 'object') return;
    inSource = inSource || typeof value.card_reference_id === 'string';
    if (inSource) {
      if (value.entity_reference_id !== undefined) add(value.entity_reference_id, value.entity);
      for (const [role, selector] of Object.entries<any>(value.entity_reference_fields || {})) {
        if (!selector || !Array.isArray(selector.path)) continue;
        let entity: any = value;
        for (const key of selector.path) {
          if (['__proto__', 'constructor', 'prototype'].includes(key) || !entity || !Object.prototype.hasOwnProperty.call(entity, key)) { entity = undefined; break; }
          entity = entity[key];
        }
        if (selector.domain && typeof entity === 'string' && /^[a-z_]+$/.test(selector.domain)) {
          const found = allMatches(entity, new RegExp(`(?:^|[^A-Za-z0-9_.])(${selector.domain}\\.[a-z0-9_]+)(?![A-Za-z0-9_.])`, 'g'));
          entity = found.length === 1 ? found[0] : undefined;
        }
        add(role, entity);
      }
      for (const [role, entity] of Object.entries(value.entity_reference_extra || {})) add(role, entity);
    }
    for (const [key, child] of Object.entries(value)) if (!META.includes(key)) visit(child, inSource);
  };
  visit(dashboard);
  return sources;
}

/** Every token role used in a value. */
export function tokenRoles(value: any): string[] {
  return allMatches(JSON.stringify(value ?? null), TOKEN);
}

/** The value with its tokens replaced; roles the sources do not know are left as they are and listed. */
export function resolveTokens<T>(value: T, sources: Map<string, string>): { value: T; unresolved: string[] } {
  const unresolved = new Set<string>();
  const walk = (v: any): any => {
    if (typeof v === 'string') return v.replace(TOKEN, (all, role) => { const id = sources.get(role); if (id) return id; unresolved.add(role); return all; });
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !META.includes(k)).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(value), unresolved: [...unresolved] };
}

/** `lovelace` and the default dashboard (`url_path: null`) are the same dashboard. */
export const dashboardKey = (path: string | null | undefined): string => (path === null || path === undefined || path === 'lovelace' ? 'lovelace' : path);
