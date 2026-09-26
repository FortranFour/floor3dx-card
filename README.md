# Floor3DX Card

A Home Assistant dashboard card that shows a live 3D model of your home and binds its objects to your entities. Floor3DX is a fork of [floor3dpro-card](https://github.com/levonisyas/floor3dpro-card) that adds compressed-model support (Draco, Meshopt, KTX2, WebP), renders at full screen resolution, and fixes a bug that displaced doors and windows when you returned to a view.

![License MIT](https://img.shields.io/badge/License-MIT-97CA00.svg) ![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)

<img src="https://raw.githubusercontent.com/FortranFour/floor3dx-card/main/demo/demo.jpg" width="900" alt="Floor3DX Card">

## Lineage and compatibility

| Project | Author | Role |
|---|---|---|
| [floor3d-card](https://github.com/adizanni/floor3d-card) | Andrea Di Zanni | The original card: model loading, entity bindings, the configuration format |
| [floor3dpro-card](https://github.com/levonisyas/floor3dpro-card) | Levent Erdem | Rebuilt the engine around on-demand rendering, a shared model cache, and a mobile profile. It describes itself as backwards compatible with floor3d-card configurations |
| floor3dx-card (this repository) | FortranFour | The changes listed below, on top of floor3dpro-card 1.5.3-Pro.Faz.2.1 |

Floor3DX changes nothing in the configuration format. A floor3dpro-card or floor3d-card configuration works as it is; only the first line differs:

```yaml
type: custom:floor3dx-card
```

The card registers its own element names (`floor3dx-*`), so it can be installed next to floor3dpro-card and floor3d-card and used on the same dashboard. That makes it easy to compare them on a duplicate of an existing card before switching.

For the full configuration reference, see the [floor3dpro-card README](docs/floor3dpro-card-README.md) (kept here unmodified) and the [floor3d-card documentation](https://github.com/adizanni/floor3d-card#readme).

## What this fork changes

### Compressed models

`objfile` accepts `.glb` and `.gltf` files that use any of these glTF extensions. The card reads the file header and sets up only the decoders the model declares, so plain models load exactly as before.

| Extension | What it compresses | Decoder |
|---|---|---|
| `KHR_draco_mesh_compression` | geometry | `draco_*` files next to the card, in a worker pool |
| `EXT_meshopt_compression`, `KHR_mesh_quantization` | geometry | bundled in the card |
| `EXT_texture_webp` | texture download size | the browser |
| `KHR_texture_basisu` (KTX2) | texture download size and GPU memory | `basis_*` files next to the card, in a worker pool |

Upstream loads compressed files with a bare `GLTFLoader`, which stalls at "Loading: 100%".

### Full-resolution rendering

- **The canvas follows its container in every view type.** Upstream watches the card's size only in panel and sidebar views. Elsewhere the drawing buffer keeps the size it had when the model finished loading. A card that finished while hidden, or before the layout settled, kept a small default buffer that the browser stretched across the card, which looks like a low-resolution render.
- **`pro_skill: mobile` no longer pins the pixel ratio to 1.** It drops to 1 only while the camera is being dragged and redraws at device resolution about 160 ms after the drag ends. Animations do not trigger the drop. `pixel_ratio: 1` restores the permanent clamp.
- **Antialiasing under the mobile profile** is skipped only on screens with a device pixel ratio of 2 or more, where it is not visible.
- **Anisotropic filtering** (8x by default) keeps floor and wall textures sharp at shallow angles.
- The card redraws when the device pixel ratio changes (browser zoom, moving the window to another monitor).

### Fix: doors and windows displaced after returning to a view

The card caches the loaded model and builds a new card from the cache each time a view is opened. The cache shares geometry between those cards, but the setup for `door`, `rotate`, `cover` and `room` entries re-centres geometry in place. The first visit looked right; from the second visit on, every door and window part started from already-shifted geometry and was shifted again, so it ended up far from the house until the browser was refreshed.

Those meshes now take a private copy of their geometry. The re-centring step also checks that the mesh occupies the same place afterwards as before, puts it back if not, and logs one console line. `dev/harness/test_lifecycle.py` is the regression test.

### Smaller fixes

- A second card that reused a cached GLB skipped the GLB-specific handling because the model type was only set on a cold load.
- Upstream logged `Entity <undefined> not found` for every entity-less `gesture` entry on every state update, hundreds of lines per update on a large configuration. Gesture entries are now silent, and a genuinely missing entity warns once.
- Load errors are shown in the card. Progress no longer prints `Infinity%` when the server compresses the response.
- The console banner includes a build id, so it is obvious which file a browser is running.

### New option: one light for a multi-part fixture

A `type3d: light` entry creates one light per object in its `object_id` group. Every light costs GPU time on every frame, lit or not. `light_object` keeps the whole group clickable but creates a single light on the named object, which can be a member of the group or any other object in the model.

```yaml
- entity: switch.closet
  type3d: light
  object_id: <closet_strips>            # every strip toggles the switch when clicked
  light:
    light_object: Fluorescent_strip_2   # only this object emits light
    lumens: '900'
```

### Light colour and brightness from the entity

A virtual light takes its brightness and colour from the Home Assistant entity while the entity is on. A dimmer scales the intensity between 0 and `lumens`; a colour or tunable-white light also sets the light's colour. A switch or a plain on/off light reports neither, so it uses `lumens` and `color` from the configuration. `follow_entity` chooses what is taken from the entity:

```yaml
- entity: light.dining_chandelier
  type3d: light
  object_id: <chandelier>
  light:
    light_object: '158_3'
    lumens: '3000'
    color: '#FFB830'
    follow_entity: brightness     # dim with the dimmer, keep the warm colour
```

| `follow_entity` | brightness | colour |
|---|---|---|
| `yes` (default) | from the entity | from the entity |
| `brightness` | from the entity | `light.color` |
| `color` | `light.lumens` | from the entity |
| `no` | `light.lumens` | `light.color` |

Upstream intended `yes` but the code compared colour arrays by reference and assigned where it meant to compare, so a light with a `color_mode` attribute was re-lit and the whole scene re-rendered on every state change anywhere in Home Assistant. That is fixed.

### A switch for the state, a bulb for the colour

A colour bulb behind a wall switch has its colour on one entity and its power on another, and the bulb goes `unavailable` whenever the switch is off. `color_entity` on an entry, for `type3d: light` and `type3d: color`, names the entity that supplies brightness and colour while `entity` keeps supplying the state. When the colour entity is unavailable or reports no colour, the entry uses its configured `color` and `lumens`; changes to the colour entity alone re-light and re-colour the object.

```yaml
- entity: switch.kitchen_sink
  color_entity: light.kitchen_sink_bulb
  type3d: light
  object_id: sink_light
  light:
    lumens: '900'
    color: '#FFB830'
- entity: switch.kitchen_sink
  color_entity: light.kitchen_sink_bulb
  type3d: color
  object_id: sink_light
  colorcondition:
    - state: 'off'
      color: LightSteelBlue
    - state: 'on'
      color: entity
```

### Mesh colour from the light itself

A `type3d: color` condition can take its colour from the entity instead of a fixed value: `color: entity` uses the light's current colour darkened by its brightness (a dim bulb is a dark bulb), `color: entity_color` uses the colour at full strength. The mesh is re-coloured whenever the light's colour or brightness changes, not only when it switches on or off. Colour comes from `rgb_color`, or from the colour temperature when that is all the light reports, or white.

```yaml
- entity: light.headboard_strip
  type3d: color
  object_id: <headboard>
  colorcondition:
    - state: 'off'
      color: LightSteelBlue
    - state: 'on'
      color: entity
```

### Shadows cast by the light's own object

A light sits at the centre of its object, so an object that should be lit from in front (a slatted headboard, a railing, a sculpture) needs the light moved out: `light.offset` shifts it by a fixed amount in model units. With `shadow: 'yes'` on the card and on the entry, the object then throws its shadow on the wall behind it; `shadow_map_size: 2048` keeps thin shadows crisp, and `angle` (the cone's half-angle in degrees, default 18) sets how much of the wall is lit. Use `light_object` to name one part of a group as the source, because the source itself never casts a shadow.

```yaml
- entity: light.headboard_strip
  type3d: light
  object_id: <headboard>
  light:
    light_object: top_rail
    shadow: 'yes'
    shadow_map_size: '2048'
    angle: '60'
    offset: { x: -70, 'y': -20, z: 0 }     # out in front of the headboard
    light_direction: { x: 5, 'y': 0, z: 0 } # pointing back at the wall
```

### Pictures on model objects (`type3d: image`)

`type3d: text` paints a state onto an object. `type3d: image` paints a picture onto it: a still image, an animated GIF, or a video file. The picture comes from the entity's `entity_picture` attribute by default (a camera snapshot, a person's photo, a media player's album art), from any other attribute, from the state, or from a URL that can include the state.

```yaml
- entity: camera.driveway            # camera snapshot on a picture frame, refreshed every 10 s
  type3d: image
  object_id: Frame7_1
  image:
    refresh: 10

- entity: media_player.family_room   # album art on the TV screen
  type3d: image
  object_id: '1_21'
  image:
    fit: contain
    background: '#000000'

- entity: weather.home               # an animated GIF chosen by the state
  type3d: image
  object_id: Frame3_1
  image:
    url: /local/weather/{state}.gif
```

| `image.` | Values | Default |
|---|---|---|
| `source` | `entity_picture`, `attribute`, `state`, `url` | `entity_picture`, or `url`/`attribute` when one of those is set |
| `attribute` | attribute name, for `source: attribute` | |
| `url` | a URL; `{state}` and `{attr:name}` are replaced from the entity | |
| `refresh` | seconds between re-fetches of an unchanged URL | 0, never |
| `fit` | `contain`, `cover`, `stretch` | `contain` |
| `background` | CSS colour behind a letterboxed picture | transparent |
| `aspect` | object width divided by height | measured from the object |
| `rotate` | 0, 90, 180, 270 | 0 |
| `max_size` | longest side of the texture, in pixels | 1024 |

Animated GIFs are decoded in the card, so they animate in every browser and keep the scene's animation loop running while they show. Video files (`.mp4`, `.webm`) play muted in a loop. The card re-draws the object when the URL changes, when `refresh` fires, and on every animation frame while a GIF or video is showing. `/api/` URLs without an access token are fetched with the dashboard's credentials, so `entity_picture` of a camera works as is. An entity is required; use any entity, `sun.sun` for example, for a fixed picture.

## Options added by this fork

| Option | Values | Default |
|---|---|---|
| `draco_path` | folder holding the Draco decoder files | found automatically |
| `basis_path` | folder holding the Basis transcoder files | found automatically |
| `pixel_ratio` | `device`, `adaptive`, or a number | `device`; `adaptive` under `pro_skill: mobile` |
| `antialias` | `yes`, `no` | `yes`; see the mobile profile above |
| `anisotropy` | 1 to 16 | 8 |
| `light.light_object` | an object name | not set: one light per object in the group |
| `light.follow_entity` | `yes`, `brightness`, `color`, `no` | `yes` |
| `light.offset` | `{x, y, z}` in model units, added to the object's centre | 0 |
| `light.shadow_map_size` | 128 to 4096 | 512 |
| `color_entity` | an entity id, on `light` and `color` entries | `entity` |
| `colorcondition[].color` | `entity`, `entity_color` in addition to any colour | |
| `type3d: image` | see above | |

## Installation

### HACS

1. HACS → three-dot menu → **Custom repositories**.
2. Add `https://github.com/FortranFour/floor3dx-card` with type **Dashboard**.
3. Install **Floor3DX Card** and reload the browser.

HACS adds the resource `/hacsfiles/floor3dx-card/floor3dx-card.js` and downloads the decoder files into the same folder.

### Manual

1. Download every file from the [latest release](https://github.com/FortranFour/floor3dx-card/releases/latest) into `/config/www/floor3dx/`.
2. Settings → Dashboards → three-dot menu → Resources → add `/local/floor3dx/floor3dx-card.js?v=1` as a JavaScript module.
3. Change the number after `?v=` every time you replace the file. Browsers keep the old copy otherwise.

Install the card one way only. Two resources that both define `floor3dx-card` conflict.

### Decoder files

The card looks for the Draco and Basis decoders in this order: the `draco_path` or `basis_path` option, the card's own folder, a `draco/` or `basis/` sub-folder of it, then jsDelivr. With the files from a release in place, nothing is fetched from the internet. With `pro_log: engine`, the console reports which source was used.

## Compressing a model

The card binds entities to object names, and its door code assumes every node has an identity transform. General-purpose optimisers break both: `gltf-transform optimize` and `gltfpack` without `-kn` merge and rename objects, and position quantisation moves a transform onto every node. The scripts in `tools/` avoid this:

```bash
cd tools
npm install
node compress.mjs          /path/to/home.glb home     # writes home.draco.glb and home.meshopt.glb
node compress-textures.mjs /path/to/home.glb home     # writes home.draco-webp.glb
```

`compress.mjs` keeps node and mesh names in order and leaves every node transform untouched. Its Meshopt output keeps positions at full precision for that reason, which is why Draco comes out smaller here. `compress-textures.mjs` converts PNG textures to lossless WebP and JPEG textures to WebP at quality 90, and scales anything larger than 2048 pixels (pass another limit as a third argument).

Measured on two Sweet Home 3D exports, loaded through the card:

| Model | Original | Draco | Meshopt | Draco + WebP |
|---|---|---|---|---|
| 2,944 meshes, 0.2 MB of textures | 12.8 MB | 4.0 MB | 6.7 MB | not needed |
| 1,345 meshes, 2.8 MB of textures | 15.5 MB | 5.9 MB | 8.3 MB | 3.3 MB |

Draco adds roughly half a second of decoding on first load; the decoded model is cached for the rest of the browser session. Draco geometry stayed within 0.02 model units of the original, and Meshopt geometry was exact.

WebP textures need a current browser. Safari before version 14 shows them blank.

## Troubleshooting

- **The card still behaves like an older version.** Check the build id in the console banner. If it has not changed, the browser is running a cached file: change the `?v=` number on the resource (manual installs) and reload with the cache cleared.
- **`light_object <name> not found in the model`.** The name in `light.light_object` does not match any object.
- **`object <name> moved by (...) during door/pivot setup and was put back`.** The safety check described above caught a displaced part and corrected it. Please open an issue with the line.

## Development

```bash
npm ci
npm run build        # lint, bundle to dist/floor3dx-card.js, copy the decoders into dist/
npm start            # watch mode, served on port 5000
```

The source stays close to upstream so that upstream changes remain easy to merge. The element names and the build id are applied at build time by `rollup-fork-identity.js`; source files still say `floor3dpro-*`.

`dev/harness/` runs the built card in headless Chromium against `demo/demo.glb`. See its README.

Pushing a tag such as `v1.0.1` builds the card and publishes a release with the card and decoder files attached.

## Credits

Floor3DX exists because of the work of Andrea Di Zanni on [floor3d-card](https://github.com/adizanni/floor3d-card) and Levent Erdem on [floor3dpro-card](https://github.com/levonisyas/floor3dpro-card). The engine changes are kept as a single commit on top of upstream so that they can be proposed back to floor3dpro-card. The card is built on [three.js](https://threejs.org/); the Draco and Basis decoders shipped in `dist/` come from the three.js distribution and are covered by their own licenses (Apache 2.0).

## License

MIT. See [LICENSE](LICENSE), which keeps the copyright notices of both upstream projects.
