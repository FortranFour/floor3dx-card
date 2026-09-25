# Changelog

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
