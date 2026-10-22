# Test harness

A stand-in for a Home Assistant dashboard that runs the real built card in headless Chromium.

```bash
pip install playwright && playwright install chromium
npm run build
python3 dev/harness/test_lifecycle.py
```

`test_lifecycle.py` is the regression test for the door/window cache bug described in the main README.
It uses `demo/demo.glb`. Headless Chromium renders in software here, so timings from the harness are
only meaningful relative to each other.

`test_load_order.py <model.draco.glb>` checks that a Draco model comes out in the same object order on
every load, with one decode worker and with four. The file's docstring explains how to make a test model.

`test_look_edges.py` is different from the others: it bundles `src/look.ts` on its own with esbuild (output `unit/look-bundle.js`, not committed) and checks the edge-line rules on a hand-built scene of open quads, where the expected line counts are known exactly.

`test_touch.py` checks taps on phones: a `touchstart` (a TouchEvent has no offsetX/offsetY) runs no action, while a double-click on a camera's object opens its more-info and one elsewhere does not. In three.js r186 a ray cast from NaN coordinates reports every triangle of every object as hit (r130: none), so from 2.0 to 2.3.1 every tap anywhere on a card on iOS ran the default action of whatever object came first.

`test_wall_seal.py` checks `wall_seal` on the demo's walls (longer by the seal at each end, nothing else changed, own geometry per wall) and that a card rebuilt with another `look` rebuilds its edge lines.

## Reference renders across versions

```bash
python3 dev/harness/render_views.py dev/out/<label> [house|garage|all]
python3 dev/harness/compare_views.py dev/out/<before> dev/out/<after> [dev/out/<diff-dir>]
```

`render_views.py` renders fixed views (plain, lamps with shadows, daylight at a fixed sun, `look` day and neon, and the 2.0 `lights: physical` and `color_management: managed` opt-ins) of the private models in `dev/private/` with the built card, one PNG per view. `compare_views.py` prints, per view, the share of pixels that differ by more than 12 levels and the mean difference, and can write side-by-side images with an amplified diff. The 2.0 engine upgrade (three.js r130 → r186) was accepted at 0.00% changed pixels against the 1.9.12 build.

## Fake WebGL (`?fakegl=1`)

`fakegl.js` replaces the WebGL2 context with an object that does nothing but count (draw calls, programs, texture create/delete, uploads; `window.__fakegl`). three.js runs its whole pipeline against it, so a test gets `renderer.info` and those counts in a couple of seconds with no GPU. There are no pixels: a shader that renders garbage still passes here, so it complements the rendering tests. `test_budget.py` and `test_leaks.py` use it. The sampler uniforms of each program are read off the shader sources, so textures are bound and uploaded as they would be on a GPU.

## Unit tests

`npm test` (from the repository root) bundles `test/unit/*.test.ts` with esbuild and runs them with `node --test`: the logic that needs neither a browser nor three.js' renderer.
