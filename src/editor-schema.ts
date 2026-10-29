/* eslint-disable @typescript-eslint/no-explicit-any */
// Fields of the editor, as ha-form schemas, with their labels and help texts. Adapted from
// giosci1994/floor3d-card (MIT) to the options of floor3dx-card.
// The defaults written in the help texts are the values the card uses when an option is missing.

import { PALETTES, paletteOf } from './look-palettes';

export type Schema = any;

const text = (name: string, options: any = {}): Schema => ({ name, selector: { text: options } });
const num = (name: string, options: any = {}): Schema => ({
  name,
  selector: { number: { mode: 'box', step: 'any', ...options } },
});
const bool = (name: string): Schema => ({ name, selector: { boolean: {} } });
const choice = (name: string, options: [string, string][]): Schema => ({
  name,
  selector: { select: { mode: 'dropdown', options: options.map(([value, label]) => ({ value, label })) } },
});
const entity = (name: string, domain?: string | string[], multiple = false): Schema => ({
  name,
  selector: { entity: { ...(domain ? { filter: { domain } } : {}), ...(multiple ? { multiple: true } : {}) } },
});
// Several fields side by side, their values at the same level as the others.
const row = (...schema: Schema[]): Schema => ({ type: 'grid', name: '', flatten: true, column_min_width: '140px', schema });
// { x, y, z } (or the given keys) stored under one name.
export const vector = (name: string, keys = ['x', 'y', 'z']): Schema => ({
  type: 'grid',
  name,
  column_min_width: '70px',
  schema: keys.map((key) => num(key)),
});

// An object of the model: a list of its objects and groups, where any other name can be typed too.
export const objectField = (name: string, objects: string[]): Schema => ({
  name,
  selector: { select: { mode: 'dropdown', custom_value: true, sort: false, options: objects } },
});
export const objectListField = (name: string, objects: string[]): Schema => ({
  name,
  selector: { select: { mode: 'dropdown', custom_value: true, multiple: true, options: objects } },
});

// Switches written 'yes'/'no' in the YAML and shown as toggles, with the value used when missing.
export const SWITCHES: { [key: string]: 'yes' | 'no' } = {
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
  hide_spare_panels: 'no',
  merge_static: 'no',
  bokeh: 'no',
  ao: 'no',
};
// The same inside the options block of a type.
export const BLOCK_SWITCHES: { [block: string]: { [key: string]: 'yes' | 'no' } } = {
  room: { label: 'no' },
  image: { mirror: 'no', planar_uv: 'no' },
  shade: { invert: 'no' },
  transparent: { invert: 'no' },
};
// Options written as [x, y, z] lists, edited as three numbers.
export const ARRAY_VECTORS: { [block: string]: string[] } = {};

export interface Section {
  key: string;
  title: string;
  icon: string;
  // Fields and headings, in order; a heading is a string.
  content: (config: any) => (Schema[] | string)[];
}

export const SECTIONS: Section[] = [
  {
    key: 'model',
    title: '3D model',
    icon: 'mdi:cube-outline',
    content: () => [
      'find_rooms',
      [text('name'), bool('header')],
      [text('path'), row(text('objfile'), text('mtlfile')), text('objectlist')],
      [row(text('draco_path'), text('basis_path'))],
      [row(text('backgroundColor'), text('style'))],
      [bool('hide_spare_panels')],
      [text('hide_objects')],
      [bool('merge_static')],
    ],
  },
  {
    key: 'view',
    title: 'Camera and navigation',
    icon: 'mdi:camera-outline',
    content: () => [
      'Initial view',
      [vector('camera_position')],
      [vector('camera_target')],
      [vector('camera_rotate')],
      'use_current_view',
      'Lens and perspective',
      [row(choice('camera_projection', [['', 'Three-point (a camera: verticals lean when tilted)'], ['two_point', 'Two-point (verticals stay vertical)']]), choice('camera_fov', [['', 'Normal (45°)'], ['25', 'Telephoto (25°)'], ['35', 'Narrow (35°)'], ['60', 'Wide (60°)']]))],
      [row(bool('lock_camera'), bool('hideLevelsMenu')), num('initialLevel', { step: 1 })],
      'North (orients the sun and daylight)',
      [vector('north', ['x', 'z'])],
    ],
  },
  {
    key: 'light',
    title: 'Light and shadows',
    icon: 'mdi:lightbulb-on-outline',
    content: () => [
      [text('globalLightPower'), row(bool('shadow'), bool('extralightmode')), row(num('shadow_budget', { min: 1, max: 32, step: 1 }), bool('sky')), row(bool('light_rooms'), num('wall_seal', { min: 0, max: 10, step: 0.1 }))],
      'Render model (2.0; leave as is to keep the 1.x picture)',
      [
        row(
          choice('lights', [
            ['legacy', 'Legacy (1.x): reach = distance, linear falloff'],
            ['physical', 'Physical: candela, inverse-square falloff'],
          ]),
          choice('color_management', [
            ['legacy', 'Legacy (1.x): colours as given'],
            ['managed', 'Managed: sRGB colours and output'],
          ]),
        ),
        num('exposure', { min: 0.05, max: 5, step: 0.05 }),
      ],
      'daylight',
    ],
  },
  {
    key: 'look',
    title: 'Look (NeonPlan / NextFloor style)',
    icon: 'mdi:palette-swatch-outline',
    content: (config) => [
      [
        {
          name: 'look',
          type: 'grid',
          column_min_width: '140px',
          schema: [
            choice('theme', [
              ['off', 'Off (model as it is)'],
              ['neon', 'Neon'],
              ['blueprint', 'Blueprint'],
              ['day', 'Day'],
              ['paper', 'Paper (architect\'s drawing)'],
              ['ember', 'Ember (charcoal, amber lines)'],
              ['pastel', 'Pastel (own colours, softened)'],
              ['custom', 'Custom (your colours)'],
              ...PALETTES.map((p): [string, string] => [p.key, `${p.label} (${p.group.toLowerCase()})`]),
            ]),
            text('accent'),
            choice('edges', [
              ['yes', 'Yes'],
              ['no', 'No'],
            ]),
            num('edge_angle', { min: 1, max: 179, unit_of_measurement: '°' }),
            num('edge_opacity', { min: 0, max: 1, step: 0.05 }),
            text('edge_skip'),
            text('keep'),
            num('glow', { min: 0, max: 2, step: 0.1 }),
            choice('flat', [
              ['yes', 'Yes'],
              ['no', 'No'],
            ]),
            choice('keep_signal', [
              ['yes', 'Yes'],
              ['no', 'No'],
            ]),
            choice('stage', [
              ['yes', 'Yes'],
              ['no', 'No'],
            ]),
            text('walls'),
            text('floors'),
          ],
        },
      ],
      ...(config && config.look && (String(config.look.theme).toLowerCase() === 'custom' || paletteOf(config.look.theme)) ? ['look_custom'] : []),
    ],
  },
  {
    key: 'interaction',
    title: 'Interaction',
    icon: 'mdi:gesture-tap',
    content: (config) => [
      [row(bool('click'), bool('editModeNotifications')), row(bool('selectionMode'), bool('show_axes')), bool('overlay')],
      ...(config.overlay === 'yes' || config.overlay === true
        ? [
            'Overlay',
            [
              row(text('overlay_bgcolor'), text('overlay_fgcolor')),
              row(
                choice('overlay_alignment', [
                  ['top-left', 'Top left'],
                  ['top-right', 'Top right'],
                  ['bottom-left', 'Bottom left'],
                  ['bottom-right', 'Bottom right'],
                ]),
                num('overlay_width', { min: 0, max: 100, unit_of_measurement: '%' }),
                num('overlay_height', { min: 0, max: 100, unit_of_measurement: '%' }),
              ),
              row(text('overlay_font'), text('overlay_fontsize')),
            ],
          ]
        : []),
    ],
  },
  {
    key: 'rendering',
    title: 'Rendering',
    icon: 'mdi:tune-variant',
    content: () => [
      [
        row(
          choice('pro_skill', [
            ['', 'Default'],
            ['mobile', 'Mobile (adaptive resolution)'],
            ['level', 'Level (workload log)'],
          ]),
          num('pixel_ratio', { min: 0.5, max: 4 }),
        ),
        row(bool('antialias'), num('anisotropy', { min: 1, max: 16, step: 1 })),
      ],
    ],
  },
  {
    key: 'effects',
    title: 'Effects',
    icon: 'mdi:blur',
    content: () => [
      [
        row(bool('ao'), num('ao_strength', { min: 0.1, max: 3, step: 0.1 })),
        row(choice('ao_quality', [['', 'Medium (16 samples)'], ['low', 'Low (8 samples, tablets)'], ['high', 'High (32 samples)']]), num('ao_radius', { min: 0 })),
        row(bool('bokeh'), num('bokeh_strength', { min: 1, max: 10, step: 1 })),
        row(num('bokeh_blur', { min: 0.002, max: 0.05, step: 0.002 }), num('bokeh_focus', { min: 0 })),
        choice('smaa', [['', 'With any effect (automatic)'], ['yes', 'Always'], ['no', 'Never']]),
      ],
    ],
  },
];

// The daylight block: a card-level option edited as its own forms.
export const daylightSchema = (): (Schema[] | string)[] => [
  [
    {
      name: 'daylight',
      type: 'grid',
      column_min_width: '140px',
      schema: [
        entity('sun_entity', 'sun'),
        entity('weather_entity', 'weather'),
        entity('time_entity'),
        choice('real_sun', [
          ['yes', 'Yes'],
          ['no', 'No'],
        ]),
        num('sun_strength', { min: 0, max: 4, step: 0.1 }),
        num('sun_shadow_size', { min: 512, max: 8192, step: 512 }),
        choice('pane_glow', [
          ['yes', 'Every pane after dark'],
          ['no', 'No'],
        ]),
        choice('weather_effects', [
          ['yes', 'Yes'],
          ['no', 'No'],
        ]),
        num('lamps_night', { min: 1, max: 4, step: 0.1 }),
        num('lamps_reach', { min: 1, max: 3, step: 0.1 }),
        num('beam_full', { min: 0, max: 30, unit_of_measurement: '°' }),
        num('exterior_night', { min: 0, max: 1 }),
        num('exterior_sun', { min: 0, max: 2 }),
        choice('hemisphere', [
          ['yes', 'Yes'],
          ['no', 'No'],
        ]),
      ],
    },
  ],
  'daylight.ambient',
  'daylight.colors',
  'daylight.sun_colors',
  'daylight.background',
  'daylight.gradient',
];

export const TYPES: [string, string, string][] = [
  ['light', 'Light', 'mdi:lightbulb-outline'],
  ['hide', 'Hidden in a state', 'mdi:eye-off-outline'],
  ['show', 'Shown in a state', 'mdi:eye-outline'],
  ['color', 'Colour by state', 'mdi:palette-outline'],
  ['text', 'Text', 'mdi:format-text'],
  ['image', 'Picture, GIF or video', 'mdi:image-outline'],
  ['room', 'Room label and colour', 'mdi:floor-plan'],
  ['door', 'Door or window', 'mdi:door-open'],
  ['cover', 'Cover (sliding)', 'mdi:window-shutter'],
  ['shade', 'Shade (shrinks with position)', 'mdi:blinds-horizontal'],
  ['transparent', 'Transparent (walls see-through)', 'mdi:square-opacity'],
  ['rotate', 'Rotating object (fan)', 'mdi:fan'],
  ['gesture', 'Service on tap', 'mdi:gesture-tap'],
  ['camera', 'Camera', 'mdi:cctv'],
];

const ACTIONS: [string, string][] = [
  ['more-info', 'Show the entity details'],
  ['overlay', 'Show the state in the overlay'],
  ['default', 'Default (toggle a light, run the service, open the camera)'],
];

// First fields of an entity (object_id is added by the editor, with the objects of the model).
export const entitySchema = (type?: string): Schema[] => [
  entity('entity'),
  { name: 'type3d', selector: { select: { mode: 'dropdown', options: TYPES.map(([value, label]) => ({ value, label })) } } },
  ...(type === 'light' || type === 'color' ? [entity('color_entity', 'light')] : []),
];
export const entityActionsSchema = (): Schema[] => [
  row(choice('action', ACTIONS), choice('long_press_action', ACTIONS)),
  text('entity_template'),
];

// Options of each type, stored under its name (light: {...}), except the text style of text and room.
export const typeSchema = (type: string, objects: string[]): (Schema[] | string)[] => {
  switch (type) {
    case 'light':
      return [
        [
          {
            name: 'light',
            type: 'grid',
            column_min_width: '140px',
            schema: [
              num('lumens', { min: 0, max: 20000, step: 50 }),
              text('color'),
              choice('follow_entity', [
                ['yes', 'Brightness and colour'],
                ['brightness', 'Brightness only'],
                ['color', 'Colour only'],
                ['no', 'Neither'],
              ]),
              num('decay', { min: 0 }),
              num('distance', { min: 0, unit_of_measurement: 'cm' }),
              choice('shadow', [
                ['yes', 'Yes'],
                ['no', 'No'],
              ]),
              num('shadow_map_size', { min: 128, max: 4096, step: 128 }),
              choice('vertical_alignment', [
                ['top', 'Top'],
                ['middle', 'Middle'],
                ['bottom', 'Bottom'],
              ]),
              objectField('light_object', objects),
            ],
          },
        ],
        'light.offset',
        'Spot (optional)',
        [
          {
            name: 'light',
            type: 'grid',
            column_min_width: '140px',
            schema: [objectField('light_target', objects), num('angle', { min: 0, max: 180, unit_of_measurement: '°' })],
          },
        ],
        'light.light_direction',
      ];
    case 'door':
      return [
        [
          {
            name: 'door',
            type: 'grid',
            column_min_width: '140px',
            schema: [
              choice('doortype', [
                ['swing', 'Swing'],
                ['slide', 'Slide'],
              ]),
              choice('side', [
                ['left', 'Left'],
                ['right', 'Right'],
                ['up', 'Up'],
                ['down', 'Down'],
              ]),
              choice('direction', [
                ['inner', 'Inner'],
                ['outer', 'Outer'],
              ]),
              num('degrees', { min: -180, max: 180, unit_of_measurement: '°' }),
              num('percentage', { min: 0, max: 100, unit_of_measurement: '%' }),
              objectField('hinge', objects),
              objectField('pane', objects),
            ],
          },
        ],
      ];
    case 'cover':
      return [
        [
          {
            name: 'cover',
            type: 'grid',
            column_min_width: '140px',
            schema: [
              objectField('pane', objects),
              choice('side', [
                ['up', 'Up'],
                ['down', 'Down'],
              ]),
            ],
          },
        ],
      ];
    case 'rotate':
      return [
        [
          {
            name: 'rotate',
            type: 'grid',
            column_min_width: '140px',
            schema: [
              choice('axis', [
                ['x', 'X'],
                ['y', 'Y'],
                ['z', 'Z'],
              ]),
              num('round_per_second', { min: 0 }),
              num('ramp', { min: 0, step: 0.5 }),
              objectField('hinge', objects),
            ],
          },
        ],
      ];
    case 'room':
      return [
        [
          {
            name: 'room',
            type: 'grid',
            column_min_width: '140px',
            schema: [
              text('color'),
              num('transparency', { min: 0, max: 100, unit_of_measurement: '%' }),
              num('elevation', { min: 0, unit_of_measurement: 'cm' }),
              bool('label'),
              choice('label_text', [
                ['state', 'State'],
                ['template', 'Template'],
              ]),
              text('attribute'),
              num('width', { min: 0 }),
              num('height', { min: 0 }),
            ],
          },
        ],
        'Label text',
        textStyle(),
        'colorcondition',
      ];
    case 'text':
      return [[{ name: 'text', type: 'grid', column_min_width: '140px', schema: [text('attribute')] }], textStyle()];
    case 'color':
      return ['colorcondition'];
    case 'hide':
    case 'show':
      return [[{ name: type, type: 'grid', column_min_width: '140px', schema: [text('state')] }]];
    case 'gesture':
      return [[{ name: 'gesture', type: 'grid', column_min_width: '140px', schema: [text('domain'), text('service')] }]];
    case 'transparent':
      return [
        [
          {
            name: 'transparent',
            type: 'grid',
            column_min_width: '140px',
            schema: [
              {
                ...num('transparency', { min: 0, max: 100, unit_of_measurement: '%' }),
                helper: '0 solid, 100 invisible, while the entity is in the state. A numeric entity sets it directly. Default 70',
              },
              num('transparency_off', { min: 0, max: 100, unit_of_measurement: '%' }),
              text('state'),
              {
                ...choice('invert', [
                  ['yes', 'Yes'],
                  ['no', 'No'],
                ]),
                label: 'Invert a numeric entity',
                helper: 'Numeric entity: 100 - value',
              },
            ],
          },
        ],
      ];
    case 'image':
      return [
        [
          {
            name: 'image',
            type: 'grid',
            column_min_width: '140px',
            schema: [
              choice('source', [
                ['entity_picture', 'entity_picture attribute'],
                ['attribute', 'Another attribute'],
                ['state', 'The state'],
                ['url', 'A URL'],
              ]),
              text('attribute'),
              text('url'),
              num('refresh', { min: 0, unit_of_measurement: 's' }),
              choice('fit', [
                ['contain', 'Contain'],
                ['cover', 'Cover'],
                ['stretch', 'Stretch'],
              ]),
              text('background'),
              num('aspect', { min: 0 }),
              choice('rotate', [
                ['0', '0°'],
                ['90', '90°'],
                ['180', '180°'],
                ['270', '270°'],
              ]),
              bool('mirror'),
              bool('planar_uv'),
              num('max_size', { min: 64, max: 4096, step: 64 }),
              num('fps', { min: 1, max: 60 }),
            ],
          },
        ],
      ];
    case 'shade':
      return [
        [
          {
            name: 'shade',
            type: 'grid',
            column_min_width: '140px',
            schema: [entity('top_entity', 'cover'), bool('invert')],
          },
        ],
      ];
    default:
      return [];
  }
};

// Font and colours of the text of the text and room types (at the level of the entity).
const textStyle = (): Schema[] => [
  row(text('font'), num('span', { min: 0, max: 100, unit_of_measurement: '%' })),
  row(text('textfgcolor'), text('textbgcolor')),
];

export const groupSchema = (): Schema[] => [text('object_group')];
export const roomSchema = (objects: string[]): Schema[] => [
  row(text('name'), objectField('object_id', objects)),
  row(entity('temperature', 'sensor'), entity('presence', ['binary_sensor', 'person', 'device_tracker'], true)),
];
export const zoomSchema = (): Schema[] => [row(text('zoom'), num('level', { step: 1 }))];
export const zoomObjectSchema = (objects: string[]): Schema[] => [
  row(objectField('object_id', objects), num('distance', { min: 0, unit_of_measurement: 'cm' })),
];
export const colorConditionSchema = (): Schema[] => [row(text('state'), text('color'))];

const LABELS: { [name: string]: string } = {
  theme: 'Theme',
  accent: 'Accent (neon edge colour)',
  edges: 'Edge lines',
  edge_angle: 'Edge angle',
  edge_opacity: 'Edge opacity',
  glow: 'Lamp glow',
  flat: 'Flat shading',
  keep_signal: 'Keep signal colours',
  stage: 'Stage background',
  walls: 'Wall object prefixes',
  floors: 'Floor object prefixes',
  shadow_budget: 'Shadow-casting lights (max)',
  lights: 'Light model',
  color_management: 'Colour management',
  wall_seal: 'Seal wall joints (model units)',
  light_rooms: 'Lamps stay in their room',
  draco_path: 'Draco decoder folder',
  basis_path: 'KTX2 transcoder folder',
  sky: 'Sky and real sun (needs a roof)',
  antialias: 'Antialiasing',
  ao: 'Ambient occlusion',
  ao_strength: 'Occlusion strength',
  ao_quality: 'Occlusion quality',
  ao_radius: 'Occlusion radius (model units; blank: by the model size)',
  smaa: 'Edge smoothing (SMAA)',
  bokeh: 'Depth of field (bokeh)',
  bokeh_strength: 'Bokeh strength (1–10)',
  bokeh_blur: 'Widest blur (fraction of the frame)',
  bokeh_focus: 'Focus distance (model units; blank: the camera target)',
  anisotropy: 'Texture anisotropy',
  pixel_ratio: 'Pixel ratio',
  pro_skill: 'Rendering profile',
  color_entity: 'Colour from entity',
  follow_entity: 'Follow the entity',
  shadow_map_size: 'Shadow map size',
  light_object: 'Single light on object',
  source: 'Picture source',
  url: 'URL or state map',
  refresh: 'Refresh',
  fit: 'Fit',
  background: 'Background colour',
  aspect: 'Aspect (width / height)',
  planar_uv: 'Flat mapping',
  max_size: 'Texture size',
  fps: 'Frames per second',
  top_entity: 'Top-edge motor',
  edge_skip: 'No edge lines on',
  keep: 'Keep as in the model',
  hide_spare_panels: 'Hide unused text and picture panels',
  merge_static: 'Merge the objects no row refers to (fewer draw calls)',
  hide_objects: 'Hide objects',
  transparency_off: 'Transparency otherwise',
  invert: '100 means closed',
  weather_entity: 'Weather entity',
  time_entity: 'Time override entity',
  beam_full: 'Beams at full strength from',
  real_sun: 'Real sun with shadows',
  sun_strength: 'Sun strength',
  sun_shadow_size: 'Sun shadow map',
  pane_glow: 'Panes glow after dark',
  weather_effects: 'Weather in the light',
  lamps_night: 'Lamps brighter after dark',
  lamps_reach: 'Lamps reach farther after dark',
  exterior_night: 'Exterior at night',
  exterior_sun: 'Exterior sun',
  hemisphere: 'Hemisphere light',
  day: 'Day',
  dusk: 'Dusk',
  dawn: 'Dawn',
  night: 'Night',
  ground: 'Ground',
  name: 'Name',
  header: 'Show the header',
  path: 'Folder of the model',
  objfile: 'Model file (.obj or .glb)',
  mtlfile: 'Materials file (.mtl)',
  objectlist: 'Object list (JSON file)',
  backgroundColor: 'Background colour',
  style: 'Canvas style (CSS)',
  x: 'X',
  y: 'Y',
  z: 'Z',
  lock_camera: 'Lock the camera',
  hideZoomMenu: 'Buttons instead of the Views menu',
  hideLevelsMenu: 'Hide the levels menu',
  initialLevel: 'Initial level',
  globalLightPower: 'Light following the camera',
  light_power: 'Lamp power',
  exposure: 'Exposure',
  tone_mapping: 'Tone mapping',
  shadow: 'Shadows',
  extralightmode: 'Extra light mode',
  sun: 'Sunlight',
  sun_entity: 'Sun entity',
  sun_power: 'Sun power',
  sun_shadow: 'Sun shadows',
  click: 'Tap runs the action',
  editModeNotifications: 'Object names on double click (dashboard in edit mode)',
  selectionMode: 'Selection mode',
  show_axes: 'Show the axes',
  overlay: 'Overlay',
  overlay_bgcolor: 'Background colour',
  overlay_fgcolor: 'Text colour',
  overlay_alignment: 'Position',
  overlay_width: 'Width',
  overlay_height: 'Height',
  overlay_font: 'Font',
  overlay_fontsize: 'Font size',
  state_colors: 'Colour open doors and windows',
  open_color: 'Colour when open',
  alarm_color: 'Colour when the alarm is armed',
  alarm_entity: 'Alarm',
  room_colors: 'Initial room map',
  presence_color: 'Presence colour',
  temperature_min: 'Temperature for blue',
  temperature_max: 'Temperature for red',
  max_pixel_ratio: 'Maximum pixel ratio',
  log_depth: 'Logarithmic depth buffer',
  reversed_depth: 'Reversed depth buffer',
  entity: 'Entity',
  type3d: 'Type',
  object_id: 'Object',
  action: 'Tap action',
  long_press_action: 'Long press action',
  entity_template: 'Entity template',
  lumens: 'Lumens',
  color: 'Colour',
  decay: 'Decay',
  distance: 'Distance',
  vertical_alignment: 'Vertical position',
  light_target: 'Spot target object',
  angle: 'Spot angle',
  doortype: 'Door type',
  side: 'Side',
  direction: 'Direction',
  degrees: 'Opening angle (swing)',
  percentage: 'Opening (slide)',
  hinge: 'Hinge object',
  pane: 'Pane object',
  axis: 'Axis',
  round_per_second: 'Rounds per second',
  ramp: 'Ramp (seconds to full speed)',
  draco_decoder_path: 'Draco decoder folder',
  transparency: 'Transparency',
  elevation: 'Height of the room',
  label: 'Label',
  label_text: 'Label shows',
  attribute: 'Attribute',
  width: 'Width',
  height: 'Height',
  font: 'Font',
  span: 'Width of the text',
  textfgcolor: 'Text colour',
  textbgcolor: 'Background colour',
  state: 'State',
  domain: 'Service domain',
  service: 'Service',
  mirror: 'Mirror',
  lighting_lumens: 'Lumens',
  lighting_direction: 'Direction',
  lighting_distance: 'Distance',
  lighting_off_state: 'Off in state',
  lighting_shadow: 'Shadows',
  text: 'Text or template',
  size: 'Size',
  velocity: 'Speed',
  count: 'Drops',
  sensor_x: 'X sensor',
  sensor_y: 'Y sensor',
  unit: 'Unit of the coordinates',
  scale: 'Scale',
  flip_x: 'Mirror X',
  flip_y: 'Mirror Y',
  zone: 'Zone entity',
  sensor_rotation: 'Sensor rotation',
  object_group: 'Group name',
  temperature: 'Temperature sensor',
  presence: 'Presence entities',
  zoom: 'Name',
  level: 'Level',
};

const HELPERS: { [name: string]: string } = {
  theme: 'Off keeps the model exactly as before. The names after Custom are palettes of the custom theme; their colours can be adjusted below',
  transparency_off: 'When the entity is not in the state. Default 0 (solid)',
  accent: 'Default #37e0ff',
  edge_angle: 'Lines where faces meet at more than this. Default 40; 60 thins window mullions',
  edge_opacity: 'Default 0.85',
  edge_skip: 'Comma separated: images, texts, seams, floors, ceilings, coplanar, or object ids / patterns / <groups>. Default: nothing skipped',
  keep: 'Objects the theme leaves untouched, materials and lines: ids, patterns, <groups>, comma separated',
  hide_spare_panels: 'Flat objects of the same name family and size as a text or picture panel, near it, that no row binds. Default no',
  merge_static: 'Walls, floors and furniture that nothing binds are drawn as one object per level and material: same picture, much less work per frame. Default no',
  hide_objects: 'Never drawn: object ids, * patterns or <groups>, comma separated',
  glow: 'Emissive glow of a lit lamp object in its light colour. Default 0.9',
  keep_signal: 'Bright saturated colours (Gold, red) stay as they are. Default yes',
  stage: 'Background from the theme, night to day with daylight. Default yes',
  walls: 'Comma separated. Default wall',
  floors: 'Comma separated. Default room, floor',
  shadow_budget: 'Default: from the GPU. Lights past it shine without a shadow',
  lights: 'Physical: inverse-square lamps, matched to legacy halfway along their reach. Default legacy',
  color_management: 'Managed: sRGB colours and output; textures as authored, the rest kept close to legacy. Default legacy',
  light_rooms: 'Each lamp lights only the room its floor belongs to (from the room_N_1 floors), so no light leaks through walls and no shadow maps are needed. Light no longer spills through doorways. Default: off',
  ao: 'Soft contact shadows where surfaces meet: walls on floors, furniture on the ground, the inside of corners. Adds depth without more lamps. A post-processing pass; costs on a tablet. Default: off',
  ao_strength: 'How dark the occlusion is drawn. Default 1.5',
  ao_quality: 'Samples per pixel: more is smoother and slower. Default: medium',
  ao_radius: 'How far a surface looks for occluders, in the model\'s units; blank: about 2.5% of the model\'s longest side',
  smaa: 'Antialiasing for frames drawn through an effect, where multisampling is lost. Automatic whenever an effect is on; Always forces the pipeline on even without one',
  camera_projection: 'Two-point keeps vertical lines vertical, as a tilt-shift lens does, whatever the tilt of the view; three-point is a plain camera. Default: three-point',
  camera_fov: 'The lens: a narrower field of view flattens the perspective, a wider one exaggerates it. Changing it in the Rooms Card keeps the framing. Any number of degrees in YAML. Default 45',
  bokeh: 'Blurs what is nearer or farther than the point of focus, by default where the camera looks. A post-processing pass: one more full-frame render per frame. Default: off',
  bokeh_strength: 'How fast the blur grows away from the focus: at 10 the widest blur is reached a quarter of the focus distance away, at 1 ten times farther. Default 5',
  bokeh_blur: 'The widest blur, as a fraction of the frame width. Default 0.01',
  bokeh_focus: 'Sharp at this distance from the camera, in the model\'s units; blank: the camera target, so the room you orbit is sharp',
  wall_seal: 'Stretches every wall this much at each end, so light cannot leak between two segments that do not quite meet. 0.5 for a cm model. Default: off',
  draco_path: 'Only for Draco models. Default: next to the card',
  basis_path: 'Only for KTX2 textures. Default: next to the card',
  pixel_ratio: 'Default: the device pixel ratio',
  anisotropy: 'Default 8',
  pro_skill: 'Mobile drops resolution while dragging',
  color_entity: 'A bulb behind a switch: the switch is the entity, the bulb supplies colour and brightness',
  follow_entity: 'Default: brightness and colour',
  shadow_map_size: 'Default 512; 2048 for crisp slat shadows',
  light_object: 'One light on this object; the whole group stays clickable',
  source: 'Default entity_picture; url when a URL is given',
  url: '{state} and {attr:name} are replaced. A map of state to URL goes in YAML',
  refresh: 'Seconds between re-fetches. 0: never',
  fit: 'Default contain',
  background: 'Behind a letterboxed picture. Default transparent',
  aspect: 'Default: measured from the object',
  max_size: 'Default 1024, 512 for video',
  fps: 'Default 15',
  top_entity: 'Second motor that lowers the top edge',
  time_entity: 'A 0-24 slider or a time; replaces the real sun while tuning',
  beam_full: 'Default 4°',
  real_sun: 'One directional light with a shadow map: light comes in through the openings, the ceilings stand in for the roof, furniture casts moving shadows. Needs ceilings in the model (room_N_2)',
  lamps_night: 'Multiplier on every lamp at night, 1 by day. Default 1.6 when set',
  lamps_reach: 'Multiplier on every lamp\'s distance at night. Default 1.3 when set',
  sun_strength: 'Multiple of the day ambient. Default 1.4',
  sun_shadow_size: 'Default 2048; 4096 for a sharper pool on a large house',
  weather_effects: 'With a weather entity: clouds take the direct sun before the diffuse light, rain and fog cool the tint, snow keeps the day bright. Default: with the real sun',
  pane_glow: 'Every translucent pane glows warm at night; or list panes with entities under glow: in YAML',
  exterior_night: 'Fraction of the day level. Default 0.08',
  exterior_sun: 'Fraction of the day level. Default 0.6',
  hemisphere: 'Default yes',
  path: 'For example /local/floor3d/',
  objectlist: 'Optional: a JSON list of the object names, for the object menus',
  backgroundColor: 'A colour, #rrggbb or transparent. Default #aaaaaa',
  globalLightPower: 'From 0 to 1, or a numeric sensor. Default 0.2',
  light_power: 'Multiplies all the lamps. Default 1',
  exposure: 'Tone-mapping exposure. Default 0.6 in both colour modes',
  sun_power: 'Default 1',
  extralightmode: 'Only the lights that are on cast shadows',
  click: 'Off: a double click runs it',
  selectionMode: 'Taps color the objects and list them, to build groups',
  max_pixel_ratio: 'Default 2',
  temperature_min: 'Default 17',
  temperature_max: 'Default 27',
  entity_template: 'JavaScript between [[[ ]]], $entity is the state',
  lumens: 'Default 800',
  decay: 'Default 2',
  distance: 'Default 600 cm',
  round_per_second: '2 or less',
  ramp: 'A fan speeds up and slows down over this many seconds instead of at once. Default: at once',
  objfile: 'A .glb can be compressed with Draco or meshopt',
  draco_decoder_path: 'Only for .glb models compressed with Draco. Default: Google CDN',
  span: 'Of the object, in %',
  lighting_off_state: 'Default off, standby, unavailable, unknown',
  scale: 'Default 0.001',
  text: 'A text or a template',
};

// A field can bring its own label and help text, when its name is used elsewhere with another meaning.
export const computeLabel = (schema: Schema): string => schema.label ?? LABELS[schema.name] ?? schema.name;
export const computeHelper = (schema: Schema): string | undefined => schema.helper ?? HELPERS[schema.name];

export const HEADINGS: { [key: string]: string } = {
  camera_position: 'Camera position',
  camera_projection: 'Perspective',
  camera_fov: 'Lens (field of view)',
  camera_target: 'Camera target',
  camera_rotate: 'Camera rotation',
  'light.light_direction': 'Spot direction',
  'light.offset': 'Light offset from the object',
  'daylight.ambient': 'Daylight level',
  'daylight.colors': 'Room light colours',
  'daylight.sun_colors': 'Beam colours',
  'daylight.background': 'Background colours',
  'daylight.gradient': 'Elevation stops',
};
// Keys of the nested daylight blocks edited as small grids.
export const DAYLIGHT_BLOCKS: { [key: string]: string[] } = {
  ambient: ['day', 'night'],
  colors: ['day', 'dusk', 'dawn', 'night', 'ground'],
  sun_colors: ['day', 'dusk', 'dawn'],
  background: ['day', 'dusk', 'night'],
  gradient: ['night', 'dusk', 'day'],
};
