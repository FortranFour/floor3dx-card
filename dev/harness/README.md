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

`test_wall_seal.py` checks `wall_seal` on the demo's walls (longer by the seal at each end, nothing else changed, own geometry per wall) and that a card rebuilt with another `look` rebuilds its edge lines.

## Reference renders across versions

```bash
python3 dev/harness/render_views.py dev/out/<label> [house|garage|all]
python3 dev/harness/compare_views.py dev/out/<before> dev/out/<after> [dev/out/<diff-dir>]
```

`render_views.py` renders fixed views (plain, lamps with shadows, daylight at a fixed sun, `look` day and neon, and the 2.0 `lights: physical` and `color_management: managed` opt-ins) of the private models in `dev/private/` with the built card, one PNG per view. `compare_views.py` prints, per view, the share of pixels that differ by more than 12 levels and the mean difference, and can write side-by-side images with an amplified diff. The 2.0 engine upgrade (three.js r130 → r186) was accepted at 0.00% changed pixels against the 1.9.12 build.
