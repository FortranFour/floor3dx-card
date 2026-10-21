# Changelog

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
