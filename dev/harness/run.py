"""Headless-Chromium harness for floor3dx-card.

Serves the repository root on 127.0.0.1:8765, mounts the real built card (dist/floor3dx-card.js) in
index.html, and lets a test drive it. Requires:  pip install playwright && playwright install chromium

    python3 dev/harness/test_lifecycle.py            # regression test for the door/window cache bug
"""
import functools, http.server, os, socketserver, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8765


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


socketserver.ThreadingTCPServer.allow_reuse_address = True
_server = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), functools.partial(_Quiet, directory=ROOT))
threading.Thread(target=_server.serve_forever, daemon=True).start()


def run(query='', after=None, dpr=1, timeout_ms=120000):
    """Open the harness page, wait for the first card's model, run `after(page)`, return results."""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = browser.new_context(viewport={'width': 900, 'height': 600}, device_scale_factor=dpr).new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(f'http://127.0.0.1:{PORT}/dev/harness/index.html?{query}')
        page.wait_for_function('window.card && window.card._modelready === true', timeout=timeout_ms)
        result = after(page) if after else None
        browser.close()
        return result, errors
