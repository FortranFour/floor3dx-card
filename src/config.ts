/* eslint-disable @typescript-eslint/no-explicit-any */
// Forms of the configuration shared by the card and its editor. Adapted from giosci1994/floor3d-card
// (MIT), with the switches and option blocks of this card.
// normalizeConfig(): what the card and the editor work with. It accepts the short forms (true/false
// for the yes/no switches, object_id strings in object_groups, a missing options block).
// cleanConfig(): what the editor writes to the YAML. Only the long forms the card has always read,
// plus object_id strings, without empty rows, empty blocks and switches left at their default.

// Top-level switches, written 'yes' or 'no', and the value the card uses when they are missing.
const SWITCH_DEFAULTS: { [key: string]: 'yes' | 'no' } = {
  header: 'yes',
  click: 'no',
  overlay: 'no',
  lock_camera: 'no',
  show_axes: 'no',
  shadow: 'no',
  extralightmode: 'no',
  hideLevelsMenu: 'no',
  editModeNotifications: 'yes',
  selectionMode: 'no',
  sky: 'no',
  antialias: 'yes',
};

// Other top-level options whose value, when missing, is the one written here.
const VALUE_DEFAULTS: { [key: string]: string | number } = {
  overlay_width: 33,
  overlay_height: 20,
  overlay_bgcolor: 'transparent',
  overlay_fgcolor: 'black',
};

// Switches inside the options block of an entity. They have no default: the card reads a missing
// value differently from 'no' (light.shadow, for example), so they are never removed.
const BLOCK_SWITCHES: [string, string][] = [
  ['light', 'shadow'],
  ['room', 'label'],
  ['image', 'mirror'],
  ['image', 'planar_uv'],
  ['shade', 'invert'],
];

// Types whose options block the card reads without checking that it exists.
const REQUIRED_BLOCKS = ['light', 'door', 'cover', 'rotate', 'room', 'text', 'gesture', 'hide', 'show'];

// Numbers the editor used to save as text ('700'): written as numbers.
const TOP_NUMBERS = ['overlay_width', 'overlay_height', 'globalLightPower', 'pixel_ratio', 'anisotropy', 'initialLevel'];
const BLOCK_NUMBERS: { [block: string]: string[] } = {
  light: ['lumens', 'decay', 'distance', 'angle', 'shadow_map_size'],
  door: ['degrees', 'percentage'],
  room: ['transparency', 'elevation', 'width', 'height'],
  image: ['rotate', 'refresh', 'aspect', 'max_size', 'fps'],
  rotate: ['round_per_second'],
};

const NUMBER = /^-?\d+(\.\d+)?$/;

const isObject = (value: any): boolean => value !== null && typeof value === 'object' && !Array.isArray(value);

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function yesNo(object: any, key: string): void {
  if (object[key] === true) object[key] = 'yes';
  else if (object[key] === false) object[key] = 'no';
}

function toNumber(object: any, key: string): void {
  if (typeof object[key] === 'string' && NUMBER.test(object[key].trim())) {
    object[key] = Number(object[key]);
  }
}

export function normalizeConfig<T>(config: T): T {
  const c: any = copy(config);
  Object.keys(SWITCH_DEFAULTS).forEach((key) => yesNo(c, key));
  if (Array.isArray(c.entities)) {
    c.entities.forEach((entity) => {
      if (!isObject(entity)) return;
      BLOCK_SWITCHES.forEach(([block, key]) => {
        if (isObject(entity[block])) yesNo(entity[block], key);
      });
      if (REQUIRED_BLOCKS.includes(entity.type3d) && entity[entity.type3d] == null) {
        entity[entity.type3d] = {};
      }
    });
  }
  if (Array.isArray(c.object_groups)) {
    c.object_groups.forEach((group) => {
      if (!isObject(group)) return;
      // The card goes through the objects of a group without checking that the list exists.
      group.objects = (Array.isArray(group.objects) ? group.objects : []).map((object) =>
        typeof object === 'string' ? { object_id: object } : object,
      );
    });
  }
  return c;
}

// Removes empty strings and the blocks left empty, at any depth below a list item.
function removeEmpty(object: any): void {
  Object.keys(object).forEach((key) => {
    const value = object[key];
    if (value === '') {
      delete object[key];
    } else if (isObject(value)) {
      removeEmpty(value);
      if (Object.keys(value).length === 0) delete object[key];
    } else if (Array.isArray(value)) {
      object[key] = value.filter((item) => {
        if (!isObject(item)) return item !== '';
        removeEmpty(item);
        return Object.keys(item).length > 0;
      });
      if (object[key].length === 0) delete object[key];
    }
  });
}

// A list item keeps its name ('entity', 'object_group', 'zoom') even when empty, as long as
// something else is filled in; an item with nothing filled in is dropped.
function cleanItem(item: any, name: string): any {
  if (!isObject(item)) return item === '' ? undefined : item;
  const clean = copy(item);
  const named = clean[name];
  removeEmpty(clean);
  if (Object.keys(clean).filter((key) => key !== name).length === 0 && !named) return undefined;
  if (named === '') clean[name] = '';
  return clean;
}

export function cleanConfig<T>(config: T): T {
  const c: any = normalizeConfig(config);

  Object.entries(SWITCH_DEFAULTS).forEach(([key, value]) => {
    if (c[key] === value) delete c[key];
  });
  TOP_NUMBERS.forEach((key) => toNumber(c, key));
  Object.entries(VALUE_DEFAULTS).forEach(([key, value]) => {
    if (c[key] !== undefined && String(c[key]) === String(value)) delete c[key];
  });

  // The card needs the entities list, even when empty.
  c.entities = (Array.isArray(c.entities) ? c.entities : [])
    .map((entity) => {
      const clean = cleanItem(entity, 'entity');
      if (isObject(clean)) {
        Object.entries(BLOCK_NUMBERS).forEach(([block, keys]) => {
          if (isObject(clean[block])) keys.forEach((key) => toNumber(clean[block], key));
        });
      }
      return clean;
    })
    .filter((entity) => entity !== undefined);

  if (Array.isArray(c.object_groups)) {
    c.object_groups = c.object_groups
      .map((group) => {
        const clean = cleanItem(group, 'object_group');
        // A group object with only its object_id is written as that id.
        if (isObject(clean) && Array.isArray(clean.objects)) {
          clean.objects = clean.objects.map((object) =>
            isObject(object) && Object.keys(object).length === 1 && typeof object.object_id === 'string'
              ? object.object_id
              : object,
          );
        }
        return clean;
      })
      .filter((group) => group !== undefined);
    if (c.object_groups.length === 0) delete c.object_groups;
  }

  if (Array.isArray(c.zoom_areas)) {
    c.zoom_areas = c.zoom_areas.map((zoom) => cleanItem(zoom, 'zoom')).filter((zoom) => zoom !== undefined);
    if (c.zoom_areas.length === 0) delete c.zoom_areas;
  }

  return c;
}

// An object id with * stands for all the objects of the model whose name matches it, as an object
// group would: Lamp_* is Lamp_1, Lamp_2, Lamp_kitchen... null for a plain object id.
export function objectPattern(id: string): RegExp | null {
  if (typeof id !== 'string' || !id.includes('*')) return null;
  const escaped = id.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
}

// The names matching an object id: itself when it is a plain id, the matching names (in the order
// of the model) when it has *.
export function matchObjects(id: string, names: string[]): string[] {
  const pattern = objectPattern(id);
  return pattern ? names.filter((name) => pattern.test(name)) : [id];
}
