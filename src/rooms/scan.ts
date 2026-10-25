// The dashboards' floor3d cards and rooms cards, for the two editors' "find … in my dashboards"
// buttons. Every readable dashboard is fetched; a card inside a `dashboard-entity-reference`
// wrapper is offered twice over: with its `[[entity:role]]` tokens resolved from the wrapper's
// dashboard (`card`), and as it is, tokens kept, for a card that will itself sit inside a wrapper
// (`raw`).
import { referenceSources, resolveTokens, tokenRoles, dashboardKey, WRAPPER_TYPE } from './references';

export interface FoundCard {
  kind: 'floor3d' | 'rooms';
  label: string;
  url: string; // the model file
  card: any; // a floor3d card configuration, tokens resolved, without type / style / layout keys
  raw: any; // the same with its tokens kept (the reference metadata stripped)
  unresolved: string[];
  model?: string; // for a rooms card's model: its name
}

const clone = (v: any) => JSON.parse(JSON.stringify(v ?? null));
const LAYOUT_KEYS = ['type', 'style', 'card_mod', 'view_layout', 'layout_options', 'grid_options', 'visibility'];
export const ROOMS_TYPE_RE = /rooms-card/i;

/** A floor3d card configuration as the rooms card embeds it: no type, no layout keys. */
export function embeddable(node: any): any {
  const card = clone(node);
  LAYOUT_KEYS.forEach((k) => delete card[k]);
  return card;
}

export async function scanDashboards(hass: any, kinds: Set<'floor3d' | 'rooms'>): Promise<FoundCard[]> {
  const found: FoundCard[] = [];
  const boards: any[] = await hass.callWS({ type: 'lovelace/dashboards/list' }).catch(() => []);
  const targets = [{ url_path: null, title: 'Overview' }, ...boards];
  // every dashboard first: a wrapper's tokens may resolve from another dashboard's sources
  const configs = new Map<string, { title: string; cfg: any }>();
  for (const b of targets) {
    try { configs.set(dashboardKey(b.url_path), { title: b.title || b.url_path || 'Dashboard', cfg: await hass.callWS({ type: 'lovelace/config', url_path: b.url_path, force: false }) }); } catch { /* not readable */ }
  }
  const sources = new Map<string, Map<string, string>>();
  const sourcesOf = (key: string): Map<string, string> => {
    if (!sources.has(key)) sources.set(key, referenceSources(configs.get(key)?.cfg || {}));
    return sources.get(key)!;
  };
  const offer = (kind: 'floor3d' | 'rooms', node: any, label: string, scope: string, model?: string): void => {
    const raw = resolveTokens(embeddable(node), new Map()).value; // reference metadata stripped, tokens kept
    let card = raw, unresolved: string[] = [];
    if (tokenRoles(raw).length) ({ value: card, unresolved } = resolveTokens(raw, sourcesOf(scope)));
    found.push({ kind, label, url: `${node.path || ''}${node.objfile}`, card, raw, unresolved, model });
  };
  for (const [key, { title, cfg }] of configs) {
    const walk = (node: any, view: string, scope: string): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach((n) => walk(n, view, scope)); return; }
      if (typeof node.type === 'string' && /floor3d/i.test(node.type)) {
        const where = `${title} › ${view || 'view'} · ${node.type.replace('custom:', '')}`;
        if (ROOMS_TYPE_RE.test(node.type)) {
          if (kinds.has('rooms')) {
            const models: any[] = Array.isArray(node.models) ? node.models : node.card ? [{ name: node.title, card: node.card }] : [];
            models.forEach((m, i) => { if (m && m.card && typeof m.card.objfile === 'string') offer('rooms', m.card, `${where}${models.length > 1 ? ` (${m.name || `model ${i + 1}`})` : ''}`, scope, m.name); });
          }
          return;
        }
        if (kinds.has('floor3d') && typeof node.objfile === 'string') offer('floor3d', node, where, scope);
        return;
      }
      // inside a wrapper, `card:` belongs to the wrapper's dashboard (default: the main one)
      const inner = node.type === WRAPPER_TYPE ? dashboardKey(node.dashboard) : scope;
      for (const [k, v] of Object.entries(node)) walk(v, k === 'views' ? view : node.title && node.cards ? node.title : view, k === 'card' ? inner : scope);
    };
    (cfg.views || []).forEach((v: any) => walk(v, v.title || v.path, key));
  }
  return found;
}
