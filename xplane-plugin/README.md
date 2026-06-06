# XPanelServer — X-Plane 12 Plugin

Serves the XPlane Network Panels web app **from inside X-Plane** so no separate Python process is needed. All devices on the LAN connect to a single port on the sim PC.

| Path | What it does |
|---|---|
| `http://<ip>:8088/` | Web app static files |
| `http://<ip>:8088/api/*` | Proxied to X-Plane REST API at `localhost:8086/api/*` |
| `ws://<ip>:8088/ws` | WebSocket hub — one shared connection to X-Plane, broadcast to all browsers |
| `http://<ip>:8088/panels` | Panel config CRUD (local `panels.json`) |
| `http://<ip>:8088/acf` | Aircraft `.acf` file probe (cylinder count etc.) |

Port default: **8088** — configurable via Plugins → XPanel Server → Port.

---

## How the hub works

The plugin maintains **one** persistent WebSocket connection to X-Plane (`ws://127.0.0.1:8086/api/v3`), shared by all connected browsers. This avoids hitting X-Plane's concurrent-connection limit.

```
Browser 1 (tablet) ─┐
Browser 2 (phone)  ─┤── /ws ── XPanelServer.xpl ── ws://127.0.0.1:8086/api/v3 ── X-Plane 12
Browser 3 (laptop) ─┘
```

**Dataref value cache** — every `dataref_update_values` message from X-Plane is stored in memory (keyed by dataref ID). When a new browser connects and sends its subscription, the plugin immediately replays the full cached snapshot so all instruments populate at once — no waiting for each slow-changing dataref to update naturally.

**Subscription replay** — if X-Plane restarts mid-session, the hub reconnects automatically and replays every connected browser's last subscription message to X-Plane. Browsers stay connected and instruments resume from their last known values without any user action.

---

## Prerequisites

| Tool | Where to get |
|---|---|
| Visual Studio 2022 (C compiler) | https://visualstudio.microsoft.com/ (Community is free) — install "Desktop development with C++" workload |
| CMake 3.15+ | https://cmake.org/download/ |
| Git | https://git-scm.com/ (needed for FetchContent) |
| X-Plane Plugin SDK 4.x | https://developer.x-plane.com/sdk/plugin-sdk/ |

---

## Build (Windows x64)

### 1. Get the X-Plane SDK

Download the SDK from [developer.x-plane.com](https://developer.x-plane.com/sdk/plugin-sdk/) and extract it so the structure is:

```
xplane-plugin/
└── sdk/
    ├── CHeaders/
    │   ├── XPLM/
    │   │   ├── XPLMPlugin.h
    │   │   ├── XPLMMenus.h
    │   │   └── ...
    │   └── Widgets/
    │       ├── XPWidgets.h
    │       └── ...
    └── Libraries/
        └── Win/
            ├── XPLM_64.lib
            └── XPWidgets_64.lib
```

### 2. Configure and build

Open a **Developer Command Prompt for VS 2022** (x64) and run:

```cmd
cd xplane-plugin
cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config RelWithDebInfo
```

Or with Ninja (faster):

```cmd
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build
```

The first build fetches civetweb and cJSON automatically via CMake FetchContent (requires internet access).

### 3. Install

After building, the plugin is assembled in:

```
build/dist/XPanelServer/
├── win_x64/
│   └── XPanelServer.xpl       ← the plugin DLL
└── Resources/
    ├── web/                   ← web app static files
    │   ├── index.html
    │   ├── panel.html
    │   └── js/
    ├── panels.json            ← created automatically
    └── config.json            ← port setting
```

Copy the entire `XPanelServer/` folder to:

```
<X-Plane 12 installation>/Resources/plugins/
```

---

## Development workflow

For quick JS iteration, the Python dev server in `xplane-panel/` still works alongside the plugin:

```cmd
cd xplane-panel
python serve.py          # port 8080 — dev server with live files
```

The plugin runs on port 8088. Both can coexist. Once you're happy with changes, rebuild the plugin (the CMake `POST_BUILD` step copies web files automatically) and reinstall it.

---

## Plugin menu

Once X-Plane is running with the plugin installed:

**Plugins → XPanel Server**

| Menu item | Action |
|---|---|
| Enable / Disable Server | Toggle HTTP server on/off |
| URL: http://192.168.x.x:8088 (click to copy) | Copies the LAN URL to clipboard |
| Port: 8088 (click to change) | Opens port dialog |

The port dialog lets you change the port without restarting X-Plane. The new port is saved to `Resources/config.json` and the server restarts automatically.

---

## Troubleshooting

**Plugin doesn't appear in Plugins menu**
- Check `<X-Plane>/Log.txt` for `[XPanelServer]` entries
- Verify the folder is at `Resources/plugins/XPanelServer/win_x64/XPanelServer.xpl`

**"X-Plane unreachable" errors in the browser console**
- X-Plane must have "Accept incoming connections" enabled (Settings → Network)
- The REST API must be running on port 8086

**LAN devices can open the page but WebSocket fails**
- Check Windows Firewall — port 8088 (or whichever port you configured) must be open for inbound TCP
- Verify the status dot on `panel.html` turns green; if it stays red, open the browser console (F12) and look for WebSocket errors

**Instruments show "no data" on a second device**
- The cache snapshot is sent when the browser sends its subscription (after `fetchAllDatarefs` completes). If it still shows no data, check the browser console for errors during the dataref-fetch step.

**Port conflict**
- Use Plugins → XPanel Server → Port to change to a free port
- Common conflicts: 8080 (Python dev server), 8086 (X-Plane), 8088 (plugin default)

**Web files not found (blank page)**
- Ensure `Resources/web/index.html` exists inside the plugin folder
- Rebuild and re-copy if you updated the web app
