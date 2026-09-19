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
