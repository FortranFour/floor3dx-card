# Changelog

## 2.5.0

### Added (rooms card)
- **Several models in one card**: `models:` (a list of `{id, name, width, card}`) instead of `card:`; each model in its own view with its own camera, a **House · Garage · Both** switcher at the top (`models_menu: no` hides it), all models side by side or stacked (`layout: row | column`, else by the card's shape; `width` shares), only the shown models rendering. Rooms carry `model:`; the *Rooms* menu is grouped by model; selecting a room of a hidden model shows it. In the editor: **Add another model**, **Use for …**, detection on every model, rooms grouped by model with a model field.
- **`object_tap`**: a single tap on an object bound to a `light` or `gesture` row runs that row's action (the lamp toggles, the room stays as it was) — `action`, the default — or opens the room's panel with that entity's tile highlighted (`panel`), or selects the room as in 2.4 (`room`). The double tap on such an object is swallowed, so it no longer opened the panel on its first tap and toggled on its second. A room's floor is always the room.
- **`color_control`**: `slider` puts a hue slider in a colour light's tile (the thumb takes the light's hue; `hs_color: [hue, 100]` when released; a white swatch beside it unless the light has a Warmth slider), `both` adds the swatches under it as presets; per entity with `controls: [..., slider]`. Default: the swatches.
- **Readouts in the panel header**: sensors and binary sensors of a room are one line under its name (`Temperature 21.4°C · Humidity 48% · Side door closed`, open doors / windows / leaks highlighted) instead of tiles; `sensor_tiles: yes` keeps them as tiles.
- **Reset view**: a camera button next to *Rooms* flies the camera back to the configured view; with saved views (`zoom_areas`) it opens their list.
- **From outside the card**: `#model=garage&room=bay` in the URL, or a `floor3dx-rooms-select` window event with `{model, room}`, shows a model or opens a room.
- **Keep references**: a checkbox in the editor's scanner writes the `card:` block (and the detected rooms) with their `[[entity:…]]` tokens, for a rooms card that sits inside a `dashboard-entity-reference` wrapper and should follow the same source block as the regular card.

- **`dashboard` palette**: Home Assistant's stock light dashboard (page grey, white walls, capsule-blue floors, slate lines; the rooms card's overlay takes the icon blue as accent and capsule-blue panels). A palette may now carry `accent` and `panel` for the rooms card. 34 palettes, 41 rooms themes.

- With all models shown, a gap, a hairline and a small caption with the model's name separate the views (`models_gap`, `model_labels`). The editor's per-model "Receives Use" buttons are one **Found cards go to** dropdown.

### Fixed
- The look's fragment shader returns from one place, so ANGLE's D3D compiler (Windows browsers) no longer logs `warning X4000: use of potentially uninitialized variable (f_f3dxThemed)` as a program info log. The picture is unchanged (pixel-identical on the reference views).

### Added (card editor)
- **Find rooms cards in my dashboards** in the 3D model section: lists the rooms cards (one entry per model) and takes a model's `card:` block as this card's configuration, resolved or with its references kept. The dashboard scanner is shared by both editors (`src/rooms/scan.ts`, unit test `scan.test.ts`).

### Harness
- `dev/harness/test_rooms2.py` (17 checks for the above), `render_models.py` (the house and the garage in one card), `run.py` takes `VW`/`VH`.

## 2.4.5

### Changed (rooms card)
- Colour swatches in two rows, red, orange, yellow, green, cyan, then white, pink, purple, blue, in saturated colours (the ring of pastel swatches is gone); a swatch sets the light to that colour at full saturation.
- The room panel is as tall as its contents, not the card: a room with two switches gets a short panel; one with more tiles than fit scrolls its tiles, within the card's height. (On phones the bottom sheet already did this.)
- In the card editor the preview fills the preview column on wide screens (`calc(100vh - 235px)`, the dialog's content height) instead of 60vh, so the model is as large as the dialog allows. Below 1000px, where the editor stacks the preview above the form, it stays at 60vh so the form stays reachable. `height` still overrides both.

## 2.4.4

### Added
- `look.edge_skip: ceilings`: no edge lines on the ceiling objects (`room_N_2` in a Sweet Home 3D export: the look's floor prefixes with `_2`). A ceiling faces down and is invisible from above, but the look still drew its outline, which showed as a line across every room opening without a wall (the living/dining opening). The rooms card's default `edge_skip` includes it.

## 2.4.3

### Changed (rooms card)
- **The snapshot card's current tiles** (0.12): a switch with the bulb behind it (`dimmer`), brightness, warmth and colour swatches for lights (`controls`, `brightness_slider`, `white_slider`, `color_swatches`), TVs and speakers with volume, mute, channels through a remote and sources (`remote`, `remote_commands`, `sources`), covers with a position slider, top-down/bottom-up shades as one tile that opens one end at a time (`top_entity`), thermostats with power, single or heat/cool setpoints and modes (`guest_thermostat`), `guest_hidden`, a guest mode that can follow a switch (`guest_mode_entity`). Shades no longer read "Closed" while their top rail is open. Fields for the pairings and the options in the editor.
- **Detection** counts a readout panel (`type3d: text`) of a controllable entity as that entity, so thermostats and TVs bound as readouts are placed; pairs a shade's top rail from the row's `shade.top_entity` / `cover.top_entity` and a switch with the bulb its `color_entity` names; drops a leading "Popup", "Room" or "View" from room names.
- **No amber tint on rooms with something on** by default; `tint_on: yes` brings it back. The lamps show it themselves.
- **No dark line where two tinted rooms meet.** Adjacent floors in a Sweet Home 3D export overlap by a few centimetres, and two translucent tints there blended twice into a strip. The tints are drawn through a stencil, so each pixel is tinted once; the embedded card is created with `stencil: yes` (new renderer option, off by default in the card itself).
- Theme `off` keeps the card's own `look`, if it has one.
- **More transparent panels**, with `panel_opacity` (0.2 to 0.95, a slider in the editor; default 0.55, 0.6 on a light stage).

## 2.4.2

### Fixed (rooms card)
- **Detection found no entities** when the floor3d card came from a dashboard that binds entities through `[[entity:role]]` reference tokens (`dashboard-entity-reference` wrappers): the scanner copied the tokens, which the embedded card cannot resolve (text panels read NaN, lamps stayed dark) and detection skipped every row. The scanner now resolves the tokens from the sources of the wrapper's dashboard (`entity_reference_id`, `entity_reference_fields`, `entity_reference_extra` in cards with a `card_reference_id`), strips the reference metadata, and lists any role it could not resolve; the editor also warns when the configuration in use still carries tokens. Detection judges a row whose `entity` is not a plain id by its `type3d` (`light`, `door`, `cover`, `shade`, `rotate`, `gesture`, `color`, `hide`, `transparent` are controls), so a rooms card kept inside such a wrapper gets its rooms filled too. `src/rooms/references.ts`, unit test `references.test.ts`.
- **Only the rooms with a bound entity were found** when the card uses `merge_static`: the other floors were merged away before detection ran. The editor's preview now keeps `merge_static` off; the saved card still reserves the rooms' floors.
- The found-cards list labelled two identical cards both "In use"; the one chosen is now the one marked.

### Added (rooms card)
- No theme lines on text and picture panels by default (`edge_skip: seams, floors, texts, images`); `panel_lines: yes` draws them, `edge_skip` replaces the list. Both in the editor's Display section.

## 2.4.1

### Added
- Ten more named palettes for `look.theme`, so every palette in the README's picture has a name: `true-colour` (grey with the model's own colours showing through) and the nine three-tone palettes, walls, floors and furniture each in their own hue: `harbour`, `autumn`, `coral-reef`, `berry`, `forest-floor`, `steel-brass`, `mondrian`, `lagoon-sand`, `candy`. 33 palettes; the rooms card offers 40 themes.

## 2.4.0

### Added
- **Floor3DX Rooms Card** (`custom:floor3dx-rooms-card`), installed with this card: the live 3D model as a full-page room controller. A floor3dx (or floor3d / floor3dpro) card configuration is embedded as it is, so all its bindings keep working; on top, the rooms of the plan (detected from the `room_N_1` floors, named and filled from the card's entities, as in the Floor3D Snapshot Card), tinted when selected or when something in them is on, a pin per room following the camera, and a translucent panel of the snapshot card's simple controls for the selected room, overlaid on the model in the theme's colours; a bottom sheet on phones. Thirty themes: the seven looks and the twenty-three named palettes. Visual editor with the snapshot card's four steps; room detection runs in the live preview. README section, `dev/harness/test_rooms.py`, `render_rooms.py`.
- **Twenty-three named palettes for `look.theme`** (`midnight-teal`, `riso`, `x-ray`, `ivory-on-black`, ...; the list is in the README): each is the custom theme with preset colours, so `look: {theme: riso}` renders exactly as the equivalent `custom` block (pixel-identical on the reference views); a `custom:` block beside a palette name overrides single colours. In the editor's theme dropdown; the colour pickers show the palette's colours. Shared with the rooms card (`src/look-palettes.ts`). Unit test `test/unit/look-palettes.test.ts`.
- `dev/harness/render_themes.py`: renders a model under a JSON of `look.custom` palettes, with a contact sheet.

### Changed
- `render_views.py` can be imported (its views and models) without rendering.

## 2.3.2

### Fixed
- On phones and tablets (iOS, and any browser that fires touch events), a single tap anywhere on the card ran the default action of an arbitrary object: in the garage every tap, inside or outside the model, opened the camera's popup; in the house it happened to hit nothing actionable. The card runs the default action from `touchstart` with the event's `offsetX`/`offsetY`, which a TouchEvent does not have; three.js r130 cast that NaN ray and hit nothing, so on 1.x the listener was inert, while r186 reports every triangle of every object as hit and the first of them got the action (2.0 to 2.3.1). A ray without coordinates now hits nothing, as before; taps act through the mouse events the browser synthesises (double tap, long press, `click: yes`), as on 1.x. Regression test `dev/harness/test_touch.py`.

## 2.3.1

### Fixed
- With `merge_static: yes`, the editor's object menus listed only the objects left unmerged when the editor was opened on a card that had not been in preview while it loaded (the editor asks the card for the list on demand; embedding hosts such as Home Scheduler open it that way). The card now keeps the full list from before the merge.

## 2.3.0

### Changed
- `lights: physical` and `color_management: managed` now keep the 1.x picture as closely as the new models allow, so switching either on needs no re-tuning:
  - physical: every lamp's intensity is derived from its `lumens`, `distance` and `decay` so that the inverse-square falloff gives the same light as the legacy falloff halfway along the lamp's reach (for `distance: 0`, at 200 cm); the camera light, ambient and daylight keep the π factor of the legacy model. House with five lamps and shadows against the 1.9.12 render: 0.4% of pixels differ (legacy itself: 0.03%).
  - managed: the light amounts (intensity, falloff, the cosine to the light) are raised to the power 1.8 in the shader, which undoes most of the lift the sRGB output encoding gives them; the look's shader palette and stage colours are converted to linear so they show as the numbers say; the default exposure stays 0.6. Against the 1.9.12 renders: the garage within 2 levels on all views, the house's shading a little flatter (mean 2–9 levels). Found by rendering the reference views over a grid of exponent and exposure (`render_views.py` with `EXTRA`).
- Editor hints and README for the two options updated. `render_views.py` takes `EXTRA` (options added to every view) and `ONLY` (a list of views) for such comparisons.

### Added
- Unit tests of the render-mode maths (`test/unit/render-mode.test.ts`).

## 2.2.1

### Fixed
- With `merge_static: yes`, a tap anywhere on the model could fire the action of an object behind the tapped wall (the garage's `type3d: camera` on the floor opened from a single tap on any wall): the merged meshes had been taken out of the raycasting lists, so taps passed through them. They are back in, standing in for the originals, and a tap on merged geometry does nothing, as a tap on a wall always did.

## 2.2.0

### Fixed
- An entity whose setup fails (an object that is not in the model, a template that throws) is left out with a console warning that names it, and the other entities keep their objects and updates. Before, the first such entity stopped the whole setup (`Error adding 3D Object … Object issue for Entity`) and every entity after it did nothing. A failing update of one entity is handled the same way.
- Text panels (`type3d: text`, and room labels) leaked one GPU texture per state change: the previous canvas texture was never disposed. `test_leaks.py` counts textures across 40 updates (80 leaked on 2.1.0, 0 now).

### Changed
- Objects are looked up through an index built when the model is ready, instead of a walk over the whole scene per bound object on every state change; a name not in the index falls back to the walk.
- While something animates, the shadow maps are redrawn at most every 300 ms, and once more exactly when the movement stops; before, every frame.
- The loading screen: the model's name and the step (downloading, materials, geometry, preparing the 3D scene), a progress bar in the theme's colours, percentage and megabytes (megabytes alone when the server does not send the size).

### Added
- `rotate.ramp`: seconds a rotating object takes to reach its speed and to come to rest (default: at once, as before). Editor field in the rotate options.
- `npm test`: Node unit tests of the logic that needs no browser (`test/unit/`: configuration normalisation and patterns, `merge_static` reservation and merging, the r130 object names), bundled with esbuild and run with `node --test`; also run by the Build workflow.
- `dev/harness/fakegl.js`: a stand-in WebGL2 context (`?fakegl=1`) that counts draw calls, programs and texture create/delete calls; three.js runs its whole pipeline against it in a couple of seconds with no GPU. `test_budget.py` (draw calls with and without `merge_static`) and `test_leaks.py` (textures across state changes) use it; `test_robust.py` covers the broken-entity isolation.
- The materials of the cached model carry a source id (2.1.0) — now also used by the unit tests.

## 2.1.0

### Added
- `merge_static: yes` merges, when the model loads, every mesh no configuration entry refers to into one mesh per level, material and shadow setting, and the look's edge lines of those meshes into one object per level. On a 2,944-mesh house: 3,054 draw calls → 401 and the frame's CPU work 26 → 8 ms; with a look theme 5,313 → 426 and 47 → 5 ms; the reference views are pixel-identical. Objects named anywhere in the configuration (patterns and groups expanded), hidden objects, translucent materials and multi-material meshes stay separate; nothing is merged in the editor's preview. Off by default; editor field in the 3D model section. Harness: `test_merge.py` and merged variants of the reference views.
- The materials of the cached model carry a source id through the per-instance clones (`userData.f3dxSourceId`), so code can tell the copies of one material apart from materials that differ in the file.

## 2.0.5

### Fixed
- `tools/remove-objects.mjs` dropped the texture coordinates of every mesh whose material has no texture (gltf-transform's `prune()` default), and those are exactly the panels the card draws text and pictures onto: a model trimmed with the 1.9.12 tool showed no readouts on any card version. The tool now prunes with `keepAttributes`; re-run it on the original model to get a file with its UVs back.
- A model replaced on the server under the same name is now picked up at once: the card fetches it with `cache: 'no-cache'` (revalidated with the server, a 304 when unchanged), where Home Assistant's 31-day `max-age` on `/local/` kept the browser on the old file.

## 2.0.4

### Fixed
- Text and picture panels of a Draco model stayed blank although their canvases were drawn: the panels' geometry had lost its UV coordinates. HACS installs only the card's JS (`hacs.json` names that one file), so the Draco decoder files next to it on the server were whatever had been copied there before, and a decoder from another generation than the card's three.js r186 decoded the meshes without their texture coordinates. The Draco decoder (wrapper and wasm, the ones shipped with the bundled three.js) is now embedded in the card's JS and handed to the loader as blob URLs; nothing on the server has to match any more, and no decoder file is needed for a Draco model. `draco_path` remains for a custom decoder build. The bundle grows by about 300 KB.

## 2.0.3

### Fixed
- `type3d: image` pictures (stills, GIFs, camera streams) did not show on 2.0: three.js r186 allocates a texture's GPU storage at the size of the first upload, and the picture's canvas is a 2x2 placeholder until the file arrives, so the panel stayed blank (or black). The texture is now re-created when its canvas changes size.
- On a fresh page load the first card's hex colours (`backgroundColor`, say) came out dark, while the same card after navigating within the dashboard was right: three.js turns colour management on by default and the card switched it off only when its renderer was set up, after the background colour had been parsed. Colour management is now off from the moment the card loads, and the render mode is applied before any colour of the scene is made.
- Harness: `test_engine.py` covers both (the pixel comparison draws a second card on a page where the first has already run, so it could not see either).

## 2.0.2

### Fixed
- Objects configured by name could go missing after 2.0 (`Object issue for Entity ... reading 'material'`, text and picture panels gone): a glTF file may name two nodes alike, and Sweet Home 3D exports do. three.js r130 made such names unique by appending `_1`, `_2`, ... and checking the result against every name so far; r186 appends a counter without that check, so the second `1_1` and the file's own `1_1_1` both come out as `1_1_1` and a configured `1_1_1_1` finds nothing. The card now recomputes the r130 names from the glTF JSON and puts them on the objects, so every name a 1.x configuration refers to is still there. Checked on two real models: the object names are identical to 1.9.12.

## 2.0.1

### Fixed
- After the update to 2.0.0 a Draco model could fail with `Model load error: [object Object]`: the browser kept the 1.x decoder files in its cache (their URLs carry no version, unlike the card's) and the r186 loader cannot use them. Once per card version the card now re-fetches the decoder files past the cache, and a decoder failure is reported with its message and a hint to check that the decoder files next to the card are the version's own.

## 2.0.0

### Changed
- three.js r130 → r186, Lit 2 → 3, TypeScript 4 → 5; the bundle is built with esbuild (rollup, babel and their plugins are gone). Imports and the renderer, loader, light and material APIs are updated to r186 (`outputColorSpace`, `BoxGeometry`, the `examples/jsm` paths, decoders under `examples/jsm/libs`).
- The picture does not change: the reference views of two real models (plain, lamps with shadows, daylight, `look` day and neon) differ from 1.9.12 by 0.00% of their pixels. Two three.js changes are held at their 1.x behaviour by default, as options:
  - `lights: legacy` (default) keeps the r130 light model: a lamp's reach is its `distance`, the brightness falls off linearly raised to `decay`, and every light carries the π factor that model had. `lights: physical` uses three.js' physically based model (candela, inverse-square falloff); the card converts `lumens` to candela and the model's centimetres to metres, and `lumens`, `globalLightPower` and `exposure` need re-tuning.
  - `color_management: legacy` (default) takes hex colours as given and leaves the output linear, as 1.x did. `color_management: managed` turns on three.js' colour management: sRGB colours, sRGB-encoded output, textures as authored.
- Editor: Light model, Colour management and Exposure fields in the Light and shadows section.

### Added
- `exposure`: the tone-mapping exposure (default 0.6, as before).
- `dev/harness/render_views.py` and `compare_views.py`: reference renders of a model and a pixel comparison between two builds.

### Development
- `npm run build` lints and bundles with esbuild; `npm start` watches. `npm run typecheck` runs tsc. `fork-identity.mjs` applies the element names and build id to the bundle, as the rollup plugin did.

## 1.9.12

### Fixed
- `look`: 1.9.11 put the edge lines in depth order with the translucent objects, which was not enough: the parts of one item share an origin, so a dial's lines and the glass dome over it sorted as equals and the lines still showed through. The lines are now drawn in the opaque pass, after the opaque meshes and before every translucent object, with their blending set explicitly (additive on a dark stage, alpha on a light one). A line behind a 50% glass dome now comes through at half strength, as the model behind it does.

## 1.9.11

### Fixed
- `look`: edge lines were drawn after everything else, so the outlines of objects behind a translucent surface (a frosted glass dome, a wall made see-through with `transparent`) showed through it at full strength and the surface looked clear. Lines are now drawn in depth order with the other translucent things, so the glass covers them as it covers the model.

## 1.9.10

### Fixed
- `hide_spare_panels` now also hides whole unused items. Sweet Home 3D names a furniture item's parts `<item>_<part>` and a copy's `<item>_<copy>_<part>` (`Frame7_1_9`); a label frame is such an item, panel plus frame pieces. An item of a bound family none of whose parts is bound, about the size of a bound item (10%) and within six widths of it, is hidden with all its parts, frame pieces included; the bound item keeps its frame. The flat-object rule stays for numeric names (`1_14`), which have no item level.

## 1.9.9

### Added
- `hide_objects`: objects hidden when the model loads (ids, `*` patterns, `<group>`s). Editor field in the 3D model section.

### Changed
- `hide_spare_panels`: size tolerance 8% (was 3%) and reach four panel widths (was three); the console also names flat objects of a bound family nearby that were another size, ready to be listed in `hide_objects`.

## 1.9.8

### Changed
- Console lines for `look.keep` (which objects it matched, or a warning when none) and `hide_spare_panels` (the bound panels' families and sizes, what was hidden, or why nothing was), so a setting that seems to do nothing can be read off the console.

## 1.9.7

### Added
- `hide_spare_panels: 'yes'`: hides the blank placeholder panels a model carries beside the ones bound as `type3d: text` or `image`: flat objects of the same name family and size, within a few panel widths of a bound one, that no row binds. Off by default. Editor switch in the 3D model section.

## 1.9.6

### Added
- `look.keep`: objects the theme leaves exactly as the model has them, materials and edge lines alike (ids, `*` patterns, `<group>`s). For a frosted glass dome, a photograph, a screen. Editor field.

## 1.9.5

### Changed
- Version shown in the editor is the card's own (`1.9.5`); the upstream lineage (floor3dpro-card 1.5.3-Pro.Faz.2.1) moves to the console banner.
- Loading messages name the model: `Loading house.glb: 42%` (and `(materials)` / `(geometry)` for OBJ models) in place of `Loading: 42%`, `1/2`, `2/2`; the text shown while the card waits for its box reads `Loading house.glb…` instead of `[PRO] Asset Cache Loading…`.

## 1.9.4

### Fixed
- Card editor preview: in the narrow dialog the height stopped at twice the width and so no longer followed the window; the cap is gone, the preview fills the window's height in every dialog width.

## 1.9.3

### Changed
- Card editor preview: the card's height now follows the window as well, filling the pane down to the dialog's bottom bar (never shorter than 240 px or squatter than 2:1), and re-sizes when the window is resized. Replaces the fixed 4:3 preview box of 1.9.2.

## 1.9.2

### Fixed
- Card editor preview: the card now fills the preview pane and follows it when the dialog is expanded. Home Assistant caps its preview card at 390 px (500 px on wide screens), so no card follows the pane by itself; a 3D view is worth the room, so the card lifts that cap on its own preview wrapper. In the preview the card also keeps a 4:3 box that follows its width instead of taking the dashboard's panel-view height (the whole viewport), which made a very tall, narrow preview. Dashboards are unchanged.

## 1.9.1

### Fixed
- The card did not widen with its container in a pane that centres its children instead of stretching them, such as the card editor's preview when the dialog is expanded: the host element took the width of its content, the canvas, so the canvas could never grow past its last size. The host is now `display: block; width: 100%`; the resize observer then sees the new width and resizes the canvas as it does in every other view.

## 1.9.0

### Added
- `look.theme: custom` with a `look.custom` block of colours: `dark` and `light` surfaces, `walls` and `floors` bright colours, `edges`, `stage` and `stage_day`, and `hue` for how much of the model's own hue remains. Edge lines blend additively on a dark stage, normally on a light one. In the editor, choosing Custom shows the colours as colour pickers (ha-form's colour selector), written back as `#rrggbb`.

## 1.8.0

### Added
- `look` themes `paper` (architect's drawing: cream card, ink lines, warmer walls, parchment floors), `ember` (charcoal with a warm cast, amber glowing lines) and `pastel` (the model's own colours, lightened and softened, on a pale stage). Each has its stage colours for `daylight` and its edge colour; paper and pastel blend their lines normally like day, ember additively like neon. Editor choices.

## 1.7.3

### Fixed
- `look.edge_skip` `seams`: the vertical lines on walls with windows. Sweet Home 3D exports such a wall as overlapping closed pieces, often inside one mesh (full-height pieces either side, a piece under the sill, one over the lintel), and the end of a full-height piece is buried under the sill, exposed up the jamb and buried again above the lintel, all on one edge. Edges are now cut where other vertices lie on them, and each part is judged on its own; a face pressed against a face of another piece (more coplanar faces covering a point than one surface has, counting a double-sided export's copies) no longer makes a visible fold. The same test covers the mesh's own pieces and other objects, so joints inside one mesh and between meshes are treated alike. Jambs, sills, lintels, reveals and outer corners keep their lines. Along the surface the search is loose (2.5 cm on a 20 m house), across it tight (2.5 mm), so a parallel face a little behind does not pass for a continuation. Unit test: a windowed wall built from overlapping pieces.

## 1.7.2

### Added
- `wall_seal`: every wall (its `wall_<id>_<n>` meshes together) is stretched by this much at each end, in model units, when the model loads, so a lamp's light no longer leaks through the hairline gap between two segments that do not quite meet. Along the length only, about the wall's centre: thickness, height and the frames set into the wall are unchanged; edge lines and shadows follow. Each wall gets its own geometry, so a box shared between walls, or a model shared between cards, is stretched once. Off without the option. Editor field under Light and shadows. `dev/harness/test_wall_seal.py`.

### Fixed
- `look`: the floor-contact and top faces of a wall are coplanar with the floor and the ceiling, and a Sweet Home 3D wall keeps its full footprint under a doorway, so the wall tint and the floor tint fought for the same pixels and a broken line crossed every opening in the themed views (and only there: the model's own materials gave both the same look). The themed material of a flat wall face now lowers it by a ten-thousandth of the model in the vertex shader, so the floor or ceiling wins; the mesh and its edge lines stay where they are. (A depth offset would not do: with the logarithmic depth buffer the fragment shader writes the depth itself.)
- `look.edge_skip`: `floors` missed the border between two rooms whose polygons overlap or stop short of each other by a few millimetres, which hand-drawn rooms commonly do; the joint tolerance is now 2.5 cm on a 20 m house (was 0.5 cm), and the search covers the neighbouring cells of the triangle grid.
- `look`: a card rebuilt on the same element (the editor's reload) kept the look of the first build, with its materials bound to the old scene and its edge lines never rebuilt, so a changed `edge_skip` showed only after a page reload. The look is now disposed and rebuilt with the scene.

## 1.7.1

### Fixed
- `look.edge_skip`: `seams` now also removes the joint between wall segments exported as closed boxes, where the two end faces are pressed together. A face whose centre lies on a coplanar face of another object counts as buried and no longer makes a crease; the side edge is then judged as an open edge and dropped where the next segment continues it. Corners keep their lines. `texts` keyword added for `type3d: text` rows (a readout on a screen is a text row, not an image row).

## 1.7.0

### Added
- `look.edge_skip`: what gets no edge line. `seams` removes the joint between two coplanar wall segments, `floors` the border between two rooms' floors with no wall between them, `coplanar` both for any objects, `images` / `texts` the objects of `type3d: image` / `text` rows, and any object id, `*` pattern or `<group>` removes the lines on those objects. Corners, openings and object contours stay: an open edge is dropped only where its midpoint lies on a coplanar face of another object, so rooms with different corner points and walls split at different places still match. Default: nothing skipped, so existing cards render as before. Editor field. `dev/harness/test_look_edges.py` (unit test of the rules on a hand-built scene, bundle in `dev/harness/unit`).

### Fixed
- `look`: on a double-sided export the open edge of a face and of its back copy now counts as a boundary of the surface and is drawn; it was read as an edge between two faces and dropped.

## 1.6.2

### Fixed
- Editor: the highlight box around a picked object is drawn in the object's own frame, so it hugs the object whatever its rotation. The previous world-axis box around a wall of a house drawn at an angle was a large rectangle whose diagonal was the wall, which looked displaced from the model.

## 1.6.1

### Fixed
- `transparent`: when a mesh is named by several rules (an "all walls" rule and a "this room's walls" rule, say), every rule is re-applied in order whenever any of them changes, so the later rule in the configuration always wins. Before, only the rule whose entity changed was applied, and the result depended on which changed last.

## 1.6.0

### Added
- `transparent`: walls (or any objects) drawn see-through, 0 solid to 100 invisible. A card-level list of `{objects, transparency}` rules for a fixed amount, and `type3d: transparent` rows for an amount that follows an entity: a switch (`transparency` in `state`, `transparency_off` otherwise) or a numeric entity whose value is the transparency itself (`invert` for 100 - value). Materials shared with objects outside the rules are cloned so those stay solid; 100 hides the mesh; 0 restores the material exactly. Works with `look` and colour conditions. Editor type. Off without the option. `dev/harness/test_transparent.py`.

## 1.5.1

### Fixed
- `look`: the edge lines of doors, windows, shades and rotating objects floated away from the house, offset by each object's hinge. Lines were built before the door setup re-centred the geometry on its pivot; they are now built after it.

## 1.5.0

### Added
- `look`: the NeonPlan 3D / NextFloor style on the loaded model. Themes `neon`, `blueprint`, `day`: dark stage, flat muted surfaces through a per-pixel shader patch (adapted from NextFloor, MIT), additive edge lines along mesh edges, signal colours kept, lit lamp objects glowing in their light colour, stage background following `daylight`. Off by default; every existing option works on top. Editor section. `dev/harness/test_look.py`.

## 1.4.1

### Fixed
- Black card with shadows on and many lights. Each shadow-casting light takes a GPU texture unit; past the GPU's limit the shaders fail and nothing is drawn. Shadows are now granted to at most the number of lights the GPU can take (the first N in config order, or with `extralightmode` the ones that are on), the rest shine without a shadow, and a console warning names them. `shadow_budget` overrides the computed limit. Ported from giosci1994/floor3d-card. `dev/harness/test_shadow_budget.py`, with a control that reproduces the failure past the limit.

## 1.4.0

### Added
- Visual editor built on Home Assistant's form components, adapted from giosci1994/floor3d-card: sections, sortable lists, per-type option pages, object menus from the model, pick-in-preview, highlight, use-current-view. Falls back to the previous editor without `ha-form`.
- Object ids with `*` expand to every matching object of the model.
- Short configuration forms: `true`/`false` switches and plain object ids in groups are accepted.
- `dev/harness/test_editor.py` covers the preview protocol, normalisation and the fallback.

### Not taken from that fork, on purpose
- three.js 0.186 and Lit 3: the move to physical light units would change every `lumens` and `daylight` value in existing configurations; kept at 0.130 / Lit 2 for now.
- Trackers, shower, info boxes, state colours and room maps, zoom menu and URL views: candidates for later releases.

## 1.3.10

### Changed
- `daylight` window beams are aimed along the sun's direction to the floor, so the pool travels across the room through the day instead of staying put.

## 1.3.9

### Fixed
- `daylight.time_entity` read only the hour of a time string, so an `input_datetime` at 06:40 behaved as 06:00. Hours and minutes, and `hour`/`minute` attributes, are now understood.

### Added
- `daylight.beam_full`: elevation at which window beams reach full strength; default 4° (was a fixed 8°).

## 1.3.8

### Changed
- `daylight` window spots sit just inside the pane, so the beam no longer paints a halo on the outside wall. Default 500 lumens.
- `daylight.exterior_sun`: a directional sun that lights only the `exterior` objects, so the facade facing the sun brightens as a whole.

## 1.3.7

### Added
- `daylight.sun_colors`: a separate day/dusk/dawn colour set for the window beams, so the room light can stay neutral while the sun changes colour. Omitted, the beams follow `colors` as before.

## 1.3.6

### Changed
- `daylight` colours now run along an explicit night → horizon → day gradient by sun elevation with configurable stops (`gradient: {night, dusk, day}`), so the low sun is fully the dusk colour and the transitions on both sides are smooth. `colors.dawn` gives the rising sun its own colour. Window sun spots default to 1000 lumens (was 3000).

## 1.3.5

### Added
- `daylight`: time-of-day lighting for a roofless plan from `sun.sun` and a selectable weather entity: ambient level and colour, hemisphere light, background colour, window sun spots that follow the sun round the house, a separate exterior ambient that goes dark at night, glass glow after dark, and a time override for tuning. `dev/harness/test_daylight.py`.

## 1.3.4

### Added
- `type3d: shade`: a roller or cellular shade whose fabric shrinks and grows with the cover position, with an optional second motor for the top edge (top-down/bottom-up shades) and `invert` for covers that report 100 as closed. Animated. `dev/harness/test_shade.py`.

## 1.3.3

### Added
- `image.url` accepts a map of state to URL (with `default`), so different states can use different files and file types: a video while on, a still while off.

## 1.3.2

### Added
- `type3d: image` on objects without texture coordinates: the card generates a flat mapping across the face, oriented from the face normal so the picture reads correctly from in front. Options `mirror` and `planar_uv`.

## 1.3.1

### Added
- `color_entity` on `type3d: light` and `type3d: color` entries: a second entity that supplies brightness and colour while `entity` supplies the state, for colour bulbs behind wall switches. Falls back to the configured colour and lumens while the bulb is unavailable.

## 1.3.0

### Added
- `type3d: color` conditions accept `color: entity` (the light's colour, darkened by its brightness) and `color: entity_color` (the light's colour at full strength). The object is re-coloured on any colour or brightness change. `dev/harness/test_entity_color.py`.

## 1.2.1

### Added
- `light.offset`: move a light away from its object's centre, so an object can be lit from in front and cast its own shadow on what is behind it.
- `light.shadow_map_size`: per-light shadow map resolution (default 512).

### Fixed
- `rotate.axis: y` never turned anything. The dashboard editor's YAML parser reads a bare `y` as the boolean `true` (YAML 1.1), and the animation loop's axis switch then matched nothing, silently. The card now accepts `true` as `y`, any case, defaults to `y`, and warns on anything else. `round_per_second` is parsed as a number with a default of 1. Present in floor3d-card and floor3dpro-card as well.

## 1.2.0

### Added
- `type3d: image`: a picture on a model object. Still images, animated GIFs (decoded in the card with gifuct-js, so they animate in every browser) and video files. The picture comes from `entity_picture`, another attribute, the state, or a URL with `{state}` and `{attr:name}` placeholders. Options `refresh`, `fit`, `background`, `aspect`, `rotate`, `max_size`. Editor section included.
- `dev/harness/test_image.py` and two small test assets.

## 1.1.0

### Added
- Option `light.follow_entity` (`yes`, `brightness`, `color`, `no`): what a virtual light takes from the Home Assistant entity while it is on. The default, `yes`, follows the entity's brightness and colour, which is what upstream intended.
- Colour temperature is read from `color_temp_kelvin` when Home Assistant does not also provide `rgb_color`.
- `dev/harness/test_follow_entity.py`.

### Fixed
- A light entity's colour and brightness were compared by reference and `color_mode` was assigned instead of compared, so every hass update re-lit the light and re-rendered the scene. Values are now compared by value and the scene only redraws when something changed.
- `rgb_color` values that are not integers no longer produce an invalid colour string.
- `dev/harness/test_lifecycle.py` waits longer between steps; it failed at random under a loaded software renderer.

## 1.0.1

### Fixed
- Draco models came out in a different object order on every load, because meshes are decoded by a pool of workers and were added to the scene as each one finished. three.js breaks depth ties between transparent objects by object id, and models with baked vertices (every node at the origin, as Sweet Home 3D exports them) tie constantly, so overlapping transparent surfaces swapped at random: a lamp shade made of two coincident glass meshes showed its colour on some loads and not on others. Objects are now put back in file order after decoding, which also makes a Draco model render the same as the uncompressed one. Uncompressed and Meshopt models were not affected.

### Added
- `dev/harness/test_load_order.py`, and a `cores=` parameter in the harness page to run the Draco decoder with several workers.

## 1.0.0

First release of the fork. Based on floor3dpro-card 1.5.3-Pro.Faz.2.1 (upstream commit e9ba665).

### Added
- Compressed glTF models: Draco, Meshopt with `KHR_mesh_quantization`, KTX2 textures, WebP textures. Decoders are set up only when a model declares them.
- Decoder discovery: `draco_path` / `basis_path`, then the card's own folder, then a `draco/` or `basis/` sub-folder, then jsDelivr. The decoders that match the bundled three.js ship in `dist/` and in each release.
- Options `pixel_ratio`, `antialias`, `anisotropy`.
- Option `light.light_object`: one light for a multi-part fixture while the whole group stays clickable.
- `.gltf` files are accepted.
- Build id in the console banner.
- `tools/`: model compression scripts that keep object names, order and identity transforms.
- `dev/harness/`: headless-browser test harness and a lifecycle regression test.

### Changed
- Own custom element names (`floor3dx-*`), so the card can be installed next to floor3dpro-card and floor3d-card.
- The canvas follows its container in every view type, not only panel and sidebar views.
- `pro_skill: mobile` lowers the pixel ratio only while the camera is dragged, and keeps antialiasing on screens with a device pixel ratio below 2.
- 8x anisotropic filtering by default.
- The card redraws when the device pixel ratio changes.

### Fixed
- Doors, windows, covers and rotating objects were displaced on every visit to a view after the first, because cached geometry shared between card instances was re-centred in place.
- A second card using a cached GLB skipped the GLB-specific handling.
- `Entity <undefined> not found` was logged for every gesture entry on every state update.
- Load errors left the card at "Loading: 100%".
- Progress showed `Infinity%` when the server compressed the response.
