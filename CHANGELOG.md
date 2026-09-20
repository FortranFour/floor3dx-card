# Changelog

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
