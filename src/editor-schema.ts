/* eslint-disable @typescript-eslint/no-explicit-any */
// Fields of the editor, as ha-form schemas, with their labels and help texts. Adapted from
// giosci1994/floor3d-card (MIT) to the options of floor3dx-card.
// The defaults written in the help texts are the values the card uses when an option is missing.

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
};
// The same inside the options block of a type.
export const BLOCK_SWITCHES: { [block: string]: { [key: string]: 'yes' | 'no' } } = {
  room: { label: 'no' },
  image: { mirror: 'no', planar_uv: 'no' },
  shade: { invert: 'no' },
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
      [text('name'), bool('header')],
      [text('path'), row(text('objfile'), text('mtlfile')), text('objectlist')],
      [row(text('draco_path'), text('basis_path'))],
      [row(text('backgroundColor'), text('style'))],
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
      [text('globalLightPower'), row(bool('shadow'), bool('extralightmode')), bool('sky')],
      'daylight',
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
  draco_path: 'Draco decoder folder',
  basis_path: 'KTX2 transcoder folder',
  sky: 'Sky and real sun (needs a roof)',
  antialias: 'Antialiasing',
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
  invert: '100 means closed',
  weather_entity: 'Weather entity',
  time_entity: 'Time override entity',
  beam_full: 'Beams at full strength from',
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
  ramp: 'Spin-up and coast-down',
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
  exterior_night: 'Fraction of the day level. Default 0.08',
  exterior_sun: 'Fraction of the day level. Default 0.6',
  hemisphere: 'Default yes',
  path: 'For example /local/floor3d/',
  objectlist: 'Optional: a JSON list of the object names, for the object menus',
  backgroundColor: 'A colour, #rrggbb or transparent. Default #aaaaaa',
  globalLightPower: 'From 0 to 1, or a numeric sensor. Default 0.2',
  light_power: 'Multiplies all the lamps. Default 1',
  exposure: 'Default 1',
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
  ramp: 'Seconds to full speed or to stop. Default 1.5, 0 for none',
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
