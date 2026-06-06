"""
serve.py  —  X-Plane Panel proxy server
========================================
Runs on the sim PC. Exposes three things on a single port (8080):

  http://0.0.0.0:8080/         → static files (your panel HTML/JS)
  http://0.0.0.0:8080/api/...  → REST proxy   → http://127.0.0.1:8086/api/...
  ws://0.0.0.0:8080/ws         → WS proxy     → ws://127.0.0.1:8086/api/v3

Single port = no CORS, no LNA issues, no port juggling in the frontend.
LAN devices open http://koko-fx.lan:8080 and set host = koko-fx.lan.

Usage:
    pip install aiohttp
    python serve.py
"""

import asyncio
import logging
import os
import json
from pathlib import Path

import aiohttp
from aiohttp import web

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("proxy")

XPLANE_REST = "http://127.0.0.1:8086"
XPLANE_WS   = "ws://127.0.0.1:8086/api/v3"
STATIC_DIR  = Path(__file__).parent          # serve files from same folder
LISTEN_PORT = 8080
PANELS_FILE = Path(__file__).parent / "panels.json"

# ── WebSocket proxy ───────────────────────────────────────────────────────────
# Uses aiohttp's built-in WS client — no handshake header fussiness.

async def ws_proxy(request: web.Request) -> web.WebSocketResponse:
    # Open server-side WS to the browser
    browser_ws = web.WebSocketResponse()
    await browser_ws.prepare(request)
    log.info("WS client connected")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(XPLANE_WS) as xplane_ws:
                log.info("WS connected to X-Plane")

                async def browser_to_xplane():
                    async for msg in browser_ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            await xplane_ws.send_str(msg.data)
                        elif msg.type == aiohttp.WSMsgType.BINARY:
                            await xplane_ws.send_bytes(msg.data)
                        elif msg.type in (aiohttp.WSMsgType.CLOSE,
                                          aiohttp.WSMsgType.ERROR):
                            break

                async def xplane_to_browser():
                    async for msg in xplane_ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            await browser_ws.send_str(msg.data)
                        elif msg.type == aiohttp.WSMsgType.BINARY:
                            await browser_ws.send_bytes(msg.data)
                        elif msg.type in (aiohttp.WSMsgType.CLOSE,
                                          aiohttp.WSMsgType.ERROR):
                            break

                await asyncio.gather(
                    browser_to_xplane(),
                    xplane_to_browser(),
                    return_exceptions=True,
                )

    except aiohttp.ClientConnectorError:
        log.warning("Cannot reach X-Plane at %s — is it running?", XPLANE_WS)
    except Exception as e:
        log.warning("WS proxy error: %s", e)
    finally:
        log.info("WS client disconnected")

    return browser_ws


# ── REST proxy ────────────────────────────────────────────────────────────────

async def rest_proxy(request: web.Request) -> web.Response:
    # Strip the leading /api prefix and forward to X-Plane
    path    = request.match_info["path"]
    url     = f"{XPLANE_REST}/api/{path}"
    body    = await request.read()

    # Forward original headers except host/origin (would confuse X-Plane)
    forward_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ("host", "origin", "referer")
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.request(
                request.method, url,
                data=body or None,
                headers=forward_headers,
                allow_redirects=False,
            ) as resp:
                body_out     = await resp.read()
                content_type = resp.headers.get("Content-Type", "application/json")
                return web.Response(
                    status=resp.status,
                    body=body_out,
                    headers={
                        "Content-Type":                 content_type,
                        "Access-Control-Allow-Origin":  "*",
                    },
                )
    except aiohttp.ClientConnectorError:
        return web.Response(
            status=502,
            text='{"error":"X-Plane not reachable"}',
            content_type="application/json",
        )


async def rest_options(request: web.Request) -> web.Response:
    return web.Response(
        status=204,
        headers={
            "Access-Control-Allow-Origin":  "*",
            "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Accept",
        },
    )

# ── Panels configuration storage and serve ─────────────────────────────────────

def _read_panels():
    try:
        return json.loads(PANELS_FILE.read_text()) if PANELS_FILE.exists() else []
    except Exception:
        return []

def _write_panels(panels):
    PANELS_FILE.write_text(json.dumps(panels, indent=2))

async def panels_list(request):
    return web.json_response(_read_panels())

async def panels_save(request):
    panel = await request.json()
    panels = _read_panels()
    idx = next((i for i, p in enumerate(panels) if p["id"] == panel.get("id")), -1)
    if idx == -1:
        panels.append(panel)
    else:
        panels[idx] = panel
    _write_panels(panels)
    return web.json_response(panel)

async def panels_delete(request):
    panel_id = request.match_info["id"]
    _write_panels([p for p in _read_panels() if p["id"] != panel_id])
    return web.json_response({"deleted": panel_id})


# ── Static files ──────────────────────────────────────────────────────────────

async def static_index(request: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


# ── App factory ───────────────────────────────────────────────────────────────

def make_app() -> web.Application:
    app = web.Application()

    # WebSocket proxy  — browser connects to ws://<host>:8080/ws
    app.router.add_get("/ws", ws_proxy)

    # REST proxy  — /api/... forwarded to X-Plane :8086
    app.router.add_options("/api/{path:.*}", rest_options)
    app.router.add_route("*", "/api/{path:.*}", rest_proxy)

    # Static files (index.html catchall + everything else)
    app.router.add_get("/", static_index)
    app.router.add_static("/", STATIC_DIR, show_index=False)

    app.router.add_get("/panels", panels_list)
    app.router.add_post("/panels", panels_save)
    app.router.add_delete("/panels/{id}", panels_delete)

    return app


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import socket
    # Best-effort LAN hostname for the startup message
    try:
        lan_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        lan_ip = "?.?.?.?"

    print(f"""
  ┌─────────────────────────────────────────────────────┐
  │  X-Plane Panel Proxy                                │
  │                                                     │
  │  Static + REST + WS  →  http://0.0.0.0:{LISTEN_PORT}       │
  │                                                     │
  │  On this machine : http://localhost:{LISTEN_PORT}           │
  │  On LAN devices  : http://{lan_ip}:{LISTEN_PORT}      │
  │                                                     │
  │  In the app, set X-Plane host to:                  │
  │    localhost        (this PC, direct)               │
  │    {lan_ip}   (LAN devices, via proxy)       │
  │                                                     │
  │  WS endpoint used by frontend:                      │
  │    ws://<host>:{LISTEN_PORT}/ws                             │
  └─────────────────────────────────────────────────────┘
""")

    web.run_app(make_app(), host="0.0.0.0", port=LISTEN_PORT, print=None)