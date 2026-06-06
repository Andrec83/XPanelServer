# X-Plane Panel — Project Overview

## Purpose

xplane-panel is a **zero-build web application** that renders live cockpit instruments in a browser using data streamed from **X-Plane 12's Web API**. Users can compose panels of multiple instruments, arrange them in a grid, and view them on the same PC as the simulator or on LAN-connected tablets and Raspberry Pis.

### Core workflow

1. X-Plane 12.1.1+ is running with **"Accept incoming connections"** enabled (Settings → Network → IPv4 port 8086).
2. The **XPanelServer plugin** (built from `xplane-plugin/`) is installed in X-Plane and enabled. It serves the web app on a configurable port (default 8088) and handles all browser communication — no separate Python process is needed.
3. Users open `http://<sim-pc-ip>:8088` (Panel Manager) or `panel.html` (live display) in a browser on any device.
4. The Panel Manager connects to X-Plane, discovers available datarefs, and lets the user build/configure panels.
5. `panel.html` opens instrument views that subscribe to a live WebSocket stream of dataref values at ~20 Hz.

---

## Architecture

```
┌─────────────┐    REST + WebSocket    ┌──────────────────────┐    REST + WS    ┌─────────────┐
│  Browser    │ ◄───────────────────►  │  XPanelServer.xpl    │ ◄─────────────► │  X-Plane 12 │
│  (any LAN   │    <sim-pc-ip>:8088    │  (inside X-Plane     │  localhost:8086 │  Web API    │
│   device)   │                        │   process, civetweb) │                 │             │
└─────────────┘                        └──────────────────────┘                 └─────────────┘
```

### Single-port hub

`XPanelServer.xpl` runs **one port** (default 8088), exposing:

| Path      | Description                                                                      |
| --------- | -------------------------------------------------------------------------------- |
| `/`       | Static file serving (HTML, JS, images, manifest)                                 |
| `/api/*`  | REST API proxy — forwarded to X-Plane's REST API on `localhost:8086`             |
| `/ws`     | WebSocket **hub** — one shared X-Plane connection, broadcast to all browsers     |
| `/panels` | Panel configuration CRUD — persisted in plugin `Resources/panels.json`           |
| `/acf`    | Aircraft `.acf` file probe — exposes data not available via datarefs (e.g. cylinder count) |

**WebSocket hub model:** the plugin maintains one persistent WS connection to X-Plane (`ws://127.0.0.1:8086/api/v3`) and broadcasts every incoming message to all connected browsers. Each browser's subscription message is forwarded to X-Plane and stored; if X-Plane restarts, the hub reconnects and replays all stored subscriptions automatically.

**Dataref value cache:** every `dataref_update_values` message is stored in memory (keyed by dataref ID). When a new browser sends its subscription, the plugin immediately replies with a full snapshot so all instruments populate at once — no waiting for slow-changing values to update naturally.

This **avoids CORS issues** that would occur if the browser tried to talk directly to X-Plane on port 8086 from a remote device. On `localhost`, the frontend still bypasses the plugin and talks directly to X-Plane for lower latency (see `xplane-api.js`).

---

## File Map

| Path                                      | Role                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `xplane-plugin/`                          | C plugin source — builds `XPanelServer.xpl` (civetweb + cJSON, Windows x64)                        |
| `xplane-panel/README.md`                  | Quick-start guide                                                                                   |
| `xplane-panel/index.html`                 | Panel Manager SPA: panel list, editor grid, settings (connection, dataref search)                   |
| `xplane-panel/panel.html`                 | Live instrument display — opens one per panel, reads grid layout from panel data                    |
| `xplane-panel/js/xplane-api.js`           | Single module that handles X-Plane WebSocket connection + REST API abstraction                      |
| `xplane-panel/js/aircraft-profile.js`     | Probes all `sim/aircraft/*` datarefs at boot, builds a structured capability profile, re-probes on aircraft change |
| `xplane-panel/js/panel-store.js`          | CRUD for panel configs — tries server (`/panels`), transparently falls back to `localStorage`       |
| `xplane-panel/js/dataref-registry.js`     | Loads/parses/caches `DataRefs.txt` from the XPlane2Blender repo; provides search                    |
| `xplane-panel/js/panel.js`                | `panel.html`'s entry point — instantiates instruments, manages WS subscription lifecycle            |
| `xplane-panel/js/instruments/base.js`     | `BaseInstrument` class: canvas resize handling, render loop, shared drawing utilities, theme system, ambient overlay effects |
| `xplane-panel/js/instruments/airspeed.js` | Airspeed indicator with colour-coded speed limits (`V<sub>S0</sub>`, `V<sub>FE</sub>`, `V<sub>NE</sub>`…)         |
| `xplane-panel/js/instruments/altimeter.js`| Three-pointer altimeter with barometric pressure knob and Kollsman window                           |
| `xplane-panel/js/instruments/attitude.js` | Artificial horizon: pitch ladder, roll arc, slip/skid ball                                          |
| `xplane-panel/js/instruments/vsi.js`      | Vertical speed indicator with logarithmic-feel needle, ±4000 FPM range                              |
| `xplane-panel/js/instruments/heading.js`  | Directional gyro: rotating compass card, heading bug (draggable + tap buttons), gyro sync           |
| `xplane-panel/js/instruments/engine.js`   | Adaptive engine bar gauge — one column per engine; automatically renders as jet (N1/N2), turboprop (NG/NP), or piston (RPM+MP); proportional layout with inset tracks, zone notches, redline, and digital readout boxes |
| `xplane-panel/js/instruments/flaps.js`    | Flap position indicator with UP/DN command buttons; notch positions auto-detected from aircraft      |
| `xplane-panel/js/instruments/gear.js`     | Gear position lights with aircraft-aware layout (nose/main/tail labelling), UNSAFE warning, up/down  |
| `xplane-panel/js/instruments/egt.js`      | EGT + Fuel Flow combined split-circle gauge, **per-engine** (`config.engineIndex`); colour zones from aircraft limits arcs; fuel flow in gal/h (piston) or lb/h (jet/turboprop); dynamic range expansion; digital readout boxes |
| `xplane-panel/js/instruments/cht.js`      | Cylinder head temperature bar chart — per-cylinder display, auto-detects active cylinders; **per-engine** (`config.engineIndex`) |
| `xplane-panel/js/instruments/oil.js`      | Oil temperature + pressure combined split-circle gauge, **per-engine** (`config.engineIndex`); colour zones from aircraft limits arcs; digital readout boxes |
| `xplane-panel/js/instruments/fuel.js`     | Fuel tank quantity gauge — vertical stack of horizontal bars, one per active tank; tank count and labels auto-detected from aircraft profile; green/amber/red fill with percentage readout; auto-ranging capacity |
| `xplane-panel/js/instruments/transponder.js` | Transponder panel: 4-digit octal code (tap ▲/▼ per digit), mode selector, IDENT button               |
| `xplane-panel/js/instruments/lights.js`   | Aircraft lighting panel: landing, taxi, nav, beacon, strobe, logo, wing, formation — auto-hides lights not present on the aircraft |
| `xplane-panel/js/instruments/autopilot.js`| Full autopilot control panel: AP master, FD, A/THR (hidden on GA aircraft), HDG/ALT/V/S/SPD knobs with hold-to-repeat, lighted mode buttons, mode annunciator |
| `xplane-panel/js/instruments/radio.js`    | Radio management panel: COM1/2, NAV1/2, ADF1/2 with active/standby freq display, swap, MHz/kHz tuning (hold-to-repeat), per-radio RX audio toggle |
| `xplane-panel/js/instruments/egtcyl.js`   | EGT per-cylinder bar chart — mirrors CHT layout but for EGT values; **per-engine** (`config.engineIndex`) |
| `xplane-panel/js/instruments/obs.js`      | OBS / CDI instrument — HSI-style course deviation indicator; **per-NAV** (`config.navIndex`)         |
| `xplane-panel/serve.py`                    | Legacy Python dev proxy (aiohttp) — superseded by the plugin for production; still useful for quick JS iteration without rebuilding |
| `xplane-panel/manifest.json`              | Minimal home-screen manifest — provides app name and icons for Android "Add to Home Screen"; no service worker |
| `xplane-panel/favicon.ico`                | Favicon                                                                                             |
| `xplane-panel/images/`                    | App icons: `icon-180.png` (iOS), `icon-192.png`, `icon-512.png` (Android)                           |

---

## Frontend Architecture

### Panel Manager (`index.html`)

A **single-page app** with three views controlled by a top nav:

| View     | Description                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------- |
| Home     | Lists all saved panels with Open / Edit / Delete buttons; nav bar shows live X-Plane connection status |
| Editor   | Grid editor with a drag-and-drop palette of instrument types, column/row/background config; widget sidebar has inline dataref autocomplete |
| Settings | X-Plane host configuration + connection test (also runs automatically on startup); DataRefs.txt loader + search |

#### Engine-index modal

Instruments that are **per-engine** (EGT, CHT, Oil) show a modal dialog the moment they are dropped onto the grid, asking which engine (ENG 1–4) to associate them. This prevents silent misconfiguration. The engine index is stored in `widget.config.engineIndex` and can also be changed in the sidebar after placement. The set of per-engine instrument types is defined in the `ENGINE_INDEX_TYPES` constant in `index.html`.

#### Panel data model

```js
{
  id:          string,     // UUID
  name:        string,
  columns:     number,     // grid columns
  rows:        number,     // grid rows
  background:  string,     // CSS colour (e.g. '#111')
  widgets: [
    {
      id:        string,   // UUID
      type:      string,   // one of 12 instrument types
      col:       number,   // grid column (1-based)
      row:       number,   // grid row (1-based)
      colSpan:   number,   // default 1
      rowSpan:   number,   // default 1
      datarefs:  object,   // optional user overrides for default dataref names
      config:    object,   // instrument-specific options (e.g. engineCount)
    }
  ]
}
```

Panels are persisted server-side by the plugin in `panels.json`. `panel-store.js` provides a unified API that transparently falls back to `localStorage` when the server is unreachable.

Widgets map to instrument classes via the `INSTRUMENT_MAP` constant in `panel.js` and `index.html`.

### Live Panel Display (`panel.html`)

- Reads `?id=<panelId>&host=<xplane-host>` from the URL.
- Builds a CSS Grid matching the panel definition.
- Instantiates one canvas per widget.
- Connects to X-Plane via `xplane-api.js`, resolves all required dataref IDs, subscribes at 20 Hz.
- Each instrument's `update(state)` method receives a flat `{dataref_name: value}` object on every WebSocket delta message.
- A status dot (green/red), a fullscreen button, and a HUD overlay show connection state, update rate, and latency. The fullscreen button uses the browser Fullscreen API and hides itself automatically on iOS (not supported).

### Instrument Base Class (`instruments/base.js`)

All instruments extend `BaseInstrument`:

| Lifecycle method          | Purpose                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `constructor(canvas, config, datarefs, resolvedIds)` | Store canvas + config; set up resize observer and `requestAnimationFrame` loop; initialise `_theme` and `_ambient` |
| `update(state)`           | Called on every WS delta; reads values from flat state object, sets `_dirty = true`        |
| `_render()`               | Called when dirty; draws the full instrument frame using Canvas2D                         |
| `_drawAmbientOverlays()`  | Called automatically after every `_render()`; draws hypoxia and flood-light overlays on top |
| `onPointerDown/Move/Up()` | For interactive instruments (heading bug, flaps, gear, transponder, altimeter baro)       |
| `requiredDatarefs()`      | Returns the list of dataref names this instrument needs                                   |
| `setAircraftProfile(profile)` | No-op default; instruments override to consume the aircraft profile                   |
| `setTheme(overrides)`     | Merge partial overrides into the active theme and mark dirty                              |
| `setNightMode(level)`     | 0 = day (`DEFAULT_THEME`), >0.35 = night backlit (`NIGHT_THEME`)                         |
| `setAmbient({night, hypoxia, flood})` | Single call for all ambient sim state; calls `setNightMode()` internally     |
| `destroy()`               | Tears down resize observer + loop                                                         |

Instruments use **manual interpolation** (`this._lerp`/`this._lerpAngle`) driven by the render loop to smooth visual transitions, rather than relying on the 20 Hz data rate directly.

---

## Theme and Visual Effects System

### Theme Object

`base.js` exports two ready-made theme objects:

| Export | Use |
|---|---|
| `DEFAULT_THEME` | Day palette — dark bezels, white needles, cyan accents |
| `NIGHT_THEME` | Night backlit palette — near-black bezels, amber needles, amber accents |

Every `BaseInstrument` instance holds `this._theme`, initialised from `DEFAULT_THEME` merged with any `config.theme` overrides passed at construction.

**All instrument drawing code reads colours from `this._theme.*` — never hardcoded hex.** The full slot list:

| Slot | Day value | Night value | Used for |
|---|---|---|---|
| `bezelBg` | `#1a1a1a` | `#0d0a06` | outer bezel fill |
| `dialFace` | `#1e1e1e` | `#0f0a05` | circular dial face |
| `dialRim` | `#555` | `#3d2800` | dial face border stroke |
| `panelBg` | `#1a1a1a` | `#0d0a06` | flat panel instruments (engine, transponder, etc.) |
| `frameBorder` | `#444` | `#3d2800` | outer frame/border |
| `divider` | `#333` | `#2a1a00` | separator lines |
| `needle` | `#e8e8e8` | `#cc6600` | needles, tick marks, scale text |
| `sky` | `#1a3a6a` | `#0a1a3a` | attitude indicator sky |
| `earth` | `#5a3010` | `#3a1e08` | attitude indicator earth |
| `accent` | `#4af` | `#ff8800` | digital readouts, active buttons, knob values |
| `accentDim` | `#999` | `#663300` | inactive/secondary button labels |
| `labelDim` | `#666` | `#4d2a00` | secondary labels, unit text |
| `digitalBg` | `#000` | `#050300` | readout box background |
| `digitalBorder` | `#444` | `#3d1a00` | readout box border |
| `capFill` | `#333` | `#1a0d00` | centre cap fill on circular instruments |
| `capStroke` | `#666` | `#3d1a00` | centre cap stroke |
| `bugColor` | `#0cf` | `#cc6600` | heading bug, flap handle indicator |
| `lubberColor` | `#fa0` | `#cc6600` | lubber line, bank pointer, reference lines |
| `warnColor` | `#fa0` | `#fa0` | armed mode text, caution |
| `alertColor` | `#f44` | `#f44` | red alert (warning zones, unsafe) |

Aviation zone arc colours (`#0c4` green, `#fa0` yellow, `#f33` red) are **not** in the theme — they are safety-critical and always constant.

### Switching themes

```js
instrument.setNightMode(0)        // day
instrument.setNightMode(1)        // full night
instrument.setTheme({ accent: '#0f0' })  // custom override on top of DEFAULT_THEME
```

`panel.js` drives night mode via `setAmbient()` — instruments never need to call `setNightMode()` themselves.

### Adding a new theme slot

1. Add the slot to `DEFAULT_THEME` and `NIGHT_THEME` in `base.js`.
2. Use `this._theme.mySlot` anywhere in instrument drawing code.
3. Done — all existing instruments pick up the new slot automatically; custom per-instrument overrides still work via `config.theme`.

---

## Ambient Effects System

Three ambient conditions are broadcast from `panel.js` to all instruments via `instrument.setAmbient()`. They are driven by real-time datarefs subscribed in addition to each instrument's own datarefs.

### Ambient datarefs (`panel.js` — `AMBIENT_DREFS`)

| Key | Dataref | Notes |
|---|---|---|
| `brightness` | `sim/cockpit2/switches/instrument_brightness_ratio` | `float[32]`; index 0 is the main instrument panel rheostat (0–1). |
| `flood` | `sim/cockpit/electrical/flood_lights_on` | Boolean; aircraft-specific — resolves to `0` gracefully if not present. |
| `hypoxia` | `sim/cockpit2/oxygen/indicators/pilot_felt_altitude_ft` | Felt pressure altitude in feet. Ramps 0→1 between `HYPOXIA_LO` (12,500 ft) and `HYPOXIA_HI` (15,000 ft). |
| `sun_pitch` | `sim/graphics/scenery/sun_pitch_degrees` | Sun elevation above horizon in degrees. Used to compute a `darkness` factor (0 = full day, 1 = full night) that gates the backlight rheostat. Instruments stay white in daylight even if the rheostat is turned up — matching X-Plane's own rendering behaviour. |

### Hypoxia constants (tunable in `panel.js`)

```js
const HYPOXIA_LO = 12500   // ft — effect starts
const HYPOXIA_HI = 15000   // ft — full blackout (97% opacity)
```

### Overlay rendering (`base.js` — `_drawAmbientOverlays()`)

Called automatically by `_startLoop` **after** every `_render()` — subclasses never need to call it.

| Effect | Implementation | Notes |
|---|---|---|
| **Hypoxia** | Flat `rgba(0,0,0, hypoxia)` rect over the full canvas | Simple uniform darkening; looks like a blanket over the whole panel since all instruments darken equally |
| **Flood light** | Warm linear gradient from top (amber-white) fading to transparent at 75% height | Simulates glareshield/overhead flood lamp; intensity from `flood` (0–1) |

### Broadcast flow

```
WS delta → instrument.update(_state) × N
         → _broadcastAmbient(_state, _instruments)
               reads brightness[0], flood, hypoxia_felt_alt, sun_pitch
               darkness  = ramp(sun_pitch, SUN_DAY=10°, SUN_NIGHT=-6°)  → 0..1
               night     = brightness[0] × darkness
               hypoxia   = ramp(felt_alt, 12500ft, 15000ft)              → 0..1
               if any changed → instrument.setAmbient({night, flood, hypoxia}) × N
                                    → setNightMode(night)   [replaces _theme]
                                    → _ambient = {night, flood, hypoxia}
                                    → _dirty = true
```

`_broadcastAmbient` is change-gated (`_lastAmbient` comparison) so it only dispatches when a value actually changes — no per-frame overhead when all four inputs are stable.

---

## Data Flow

### Connection lifecycle (`xplane-api.js`)

```
connect(host)
  ├── _openWS() — opens WebSocket:
  │     │   localhost  → ws://localhost:8086/api/v3           (direct to X-Plane)
  │     │   LAN IP     → ws://<ip>:${PROXY_PORT}/ws          (via plugin hub)
  │     ├── onopen → fetch capabilities → store xpVersion
  │     ├── onmessage
  │     │   ├── 'dataref_update_values' → dispatch delta to all subscribers
  │     │   └── 'result' → resolve pending ACK
  │     └── onclose → schedule reconnect with exponential backoff (1s → 30s max)
  └── fetchAllDatarefs() — GET /v3/datarefs?limit=10000, build name→id maps
```

When connecting via the plugin hub, the browser sends its `dataref_subscribe_values` message after `fetchAllDatarefs` completes. The plugin detects this message, stores it for reconnect replay, and immediately replies with a full snapshot of all cached dataref values so instruments populate instantly.

### Subscription model

`subscribe(idFrequencyPairs, onUpdate, onError)` returns an `unsubscribe` function. Each subscriber gets an incrementing `req_id` assigned. On WebSocket reconnect, all active subscriptions are automatically re-sent.

Writes (`writeDataref(id, value)`) use REST `PATCH /v3/datarefs/{id}/value`. Commands (`triggerCommand(name)`) use WebSocket `command_set_is_active` with `duration:0` for momentary activation (e.g. flaps up/down, gear toggle). Command IDs are lazily loaded from `/v3/commands` and cached.

---

## Selection of Instrument Types

| Type          | Class               | Key datarefs                                                       | Interactive?              |
| ------------- | ------------------- | ------------------------------------------------------------------ | ------------------------- |
| `airspeed`    | `AirspeedIndicator` | `airspeed_kts_pilot`                                               | No                        |
| `altimeter`   | `Altimeter`         | `altitude_ft_pilot`, `barometer_setting_in_hg_pilot`               | Baro knob (tap −/+)       |
| `attitude`    | `AttitudeIndicator` | `theta`, `phi`, `slip_deg`                                         | No                        |
| `vsi`         | `VSI`               | `vvi_fpm_pilot`                                                    | No                        |
| `heading`     | `HeadingIndicator`  | `heading_electric_deg_mag_pilot`, `heading_mag`, `mag_psi`, etc.   | Bug drag + ◄► + SYNC      |
| `engine`      | `EngineGauge`       | `ENGN_N1_`, `ENGN_N2_`, `prop_speed_rpm`, `MPR_in_hg` (arrays)    | No — adaptive: jet (N1/N2), turboprop (NG/NP), piston (RPM+MP); count auto-detected |
| `flaps`       | `FlapsIndicator`    | `flap_handle_deploy_ratio`, `flap1_deploy_ratio`                   | ▲UP / DN▼                 |
| `gear`        | `GearIndicator`     | `gear_handle_status`, `gear/deploy_ratio` (array)                  | ↑UP / DN↓                 |
| `egt`         | `EGTGauge`          | `EGT_deg_C`, `fuel_flow_kg_sec` — per-engine via `config.engineIndex` | No — zones from profile arcs; fuel flow gal/h or lb/h by engine type |
| `cht`         | `CHTGauge`          | `cylinder_head_temp_deg_C` — per-engine via `config.engineIndex`   | No                        |
| `oil`         | `OilGauge`          | `oil_temperature_deg_C`, `oil_pressure_psi` — per-engine via `config.engineIndex` | No — zones from profile arcs |
| `fuel`        | `FuelGauge`         | `fuel_quantity` (array)                                            | No — all tanks in one widget; tank list from `profile.fuelTanks` |
| `transponder` | `Transponder`       | `transponder_code`, `transponder_mode`, `transponder_id`           | Digit ▲/▼ + MODE + IDENT  |
| `lights`      | `LightsPanel`       | `sim/cockpit2/switches/*_on` per light type                        | ON/OFF toggle per light   |
| `autopilot`   | `AutopilotPanel`    | AP on/off, HDG/ALT/V/S/SPD dials, mode statuses, FD, A/THR        | Knobs (hold-to-repeat), AP/FD/THR buttons, mode buttons |
| `radio`       | `RadioPanel`        | COM1/2, NAV1/2, ADF1/2 active+standby freqs + audio selection      | Swap, MHz/kHz tune (hold-to-repeat), RX audio toggle   |
| `egtcyl`      | `EGTCylGauge`       | `cylinder_EGT_deg_C` — per-engine via `config.engineIndex`          | No — vertical bar chart, one bar per cylinder; mirrors CHT layout |
| `obs`         | `OBSIndicator`      | OBS course, CDI deflection, GS deflection, flag — per-NAV via `config.navIndex` | No — HSI-style course deviation indicator |

---

## Design Decisions and Standards

### Vanilla ES Modules — No Build Step

The project is **deliberately build-free**. JavaScript is authored as plain ES modules loaded natively by browsers via `<script type="module">`. There are no bundlers, transpilers, CSS preprocessors, or npm dependencies in production code.

**Why:** This maximises simplicity, deployability (just serve the folder), and hackability — users can edit source files directly and reload the browser.

### Canvas2D for Rendering

All instrument visuals are drawn using the **2D Canvas API** (no SVG, no WebGL, no third-party graphics libraries). Each instrument is responsible for its own `_render()` method called from a `requestAnimationFrame` loop.

**Why:** Canvas2D gives full control over anti-aliased vector graphics without DOM overhead, and works identically on low-power ARM devices (Raspberry Pi) that often don't have GPU acceleration.

### Home Screen Icon Support

The app includes a minimal `manifest.json` and icon assets in `images/`, allowing it to be **"Added to Home Screen"** on Android and iOS. There is no service worker — the app always loads fresh from the plugin server, which is intentional (instrument panels must always show live data).

### Panel Persistence Strategy

`panel-store.js` implements a **dual-write** strategy: panels are saved to the server (`panels.json` via the plugin), with `localStorage` as a transparent fallback when the server is unreachable. This means the Panel Manager editor works even if you open `index.html` directly from disk (`file://`), though the plugin is needed for live data.

### Auto-detection of Aircraft Configuration

At boot, `panel.js` calls `probeAircraftProfile()` from `aircraft-profile.js`, which reads all `sim/aircraft/*` datarefs in parallel and returns a structured profile object. The profile is passed to every instrument via `setAircraftProfile(profile)` (defined as a no-op default on `BaseInstrument`; each instrument overrides it as needed). A 30-second polling loop re-probes and re-dispatches if the aircraft changes mid-session.

The profile contains:

| Field | Source datarefs | Used by |
|---|---|---|
| `numEngines` | `acf_num_engines` | engine gauge column count |
| `speeds` — Vs0/1, Vfe, Vno, Vne, Mmo | `acf_Vso/Vs/Vfe/Vno/Vne/Mmo` | airspeed colour arcs, max scale |
| `autopilot` — type, singleAxis, hasAutothrottle, vviStep, altStep | `preconfigured_ap_type`, `single_axis_autopilot`, `vvi_step_ft`, `alt_step_ft` | autopilot panel feature visibility and knob increments |
| `flapNotches` | `acf_flap0`–`acf_flap9` | flap indicator detent labels |
| `gear` | `acf_gear_type`, `acf_gear_xnodef/znodef` | gear indicator light layout (N, L, R, T labels) |
| `engineType` — isJet / isTurboprop / isPiston, RPM redline/green arc, maxMP, maxEGT/CHT/OilP/OilT, unit flags | `acf_spooltime_*`, `acf_face_jet`, `acf_RSC_*`, `acf_mpmax`, `acf_max_*`, `acf_*_is_C` | engine.js mode selection; EGT/Oil zone thresholds; fuel flow unit (gal/h vs lb/h) |
| `limits` — per-gauge green/yellow/red arcs for EGT, CHT, ITT, oilT, oilP, MP, TRQ, EPR, FF | `sim/aircraft/limits/*_lo/hi_*` | EGT and Oil butterfly gauges (zone colors); engine.js MP zones; fuel flow arc zones |
| `fuelTanks` — `[{ idx, capacity_kg, label }]` active fuel tank slots | `sim/cockpit2/fuel/fuel_quantity` (live, for slot detection) + `sim/aircraft/weight/acf_m_fuel_tot` (total capacity) + `sim/aircraft/overflow/acf_m_fuel_tab` (per-tank, if exposed) | fuel.js horizontal bar gauge |
| `electrical` — numBatteries, numGenerators, numInverters | `acf_electrical/*` | future electrical/bus panel |
| `cockpitType`, `hasFD` | `acf_cockpit_type`, `acf_has_SC_fd` | future glass-cockpit detection |

### Instrument Arc Zones (Profile-Driven)

EGT and Oil gauges read their colour zones from `profile.limits.*` (Plane Maker arc data: green/yellow/red lo/hi bands from `sim/aircraft/limits/`). The arc priority is **red → yellow → green**: green always wins over overlapping red bands, which is how X-Plane layers arcs in 3D panel rendering.

If the profile provides no arc data (aircraft didn't define them), gauges fall back to auto-ranging heuristics on first live value.

### Auto-ranging Gauges

When profile arc data is not available:
- **EGT** — auto-ranges on the first non-zero reading (`value × 1.30`, rounded to nearest 500).
- **Oil** — auto-detects Kelvin vs Celsius by magnitude; auto-ranges if profile data absent.
- **Fuel Flow** — dynamic range expansion: `_ffMax` starts from the first reading and grows whenever a higher value is seen. It never shrinks, so the scale is always valid regardless of power setting at boot.

Fuel flow **display units** are set by engine type (not magnitude detection): piston → gal/h (kg/s × 1322.8), jet/turboprop → lb/h (kg/s × 7936.6). This is determined in `setAircraftProfile` before any live data arrives.

### Engine Gauge Adaptive Modes

`engine.js` reads `profile.engineType` (with arc-presence fallback) to select one of three render modes:

| Mode | Bars shown | Data sources |
|---|---|---|
| `jet` | N1 % + N2 % | `ENGN_N1_`, `ENGN_N2_` |
| `turboprop` | NG % + NP RPM | `ENGN_N1_` for NG; `prop_speed_rpm` for NP |
| `piston` | RPM + MP inHg | `prop_speed_rpm`, `MPR_in_hg` |

Engine count is auto-detected from `profile.numEngines`. The layout uses strictly proportional row fractions (ENG label 8%, bar area 56%, readout box 11%, unit 7%, name 11%, margin 6%) so nothing overflows regardless of canvas height.

### WebSocket Reconnection

`xplane-api.js` implements **exponential backoff** (1s → 30s) with automatic re-subscription of all active subscribers on reconnect. The live panel overlay shows "Simulator offline — reconnecting…" during disconnection and polls every 500ms for reconnection.

### Command Execution

Interactive instruments (flaps, gear, transponder) use X-Plane **commands** rather than direct dataref writes where appropriate, because many sim controls require momentary activation. Commands are sent via WebSocket `command_set_is_active` with `duration:0`.

---

## Development Approach

### What you need

| Requirement      | Details                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------- |
| X-Plane 12.1.1+  | Running with network API enabled on port 8086                                            |
| XPanelServer plugin | Built and installed from `xplane-plugin/` — see the plugin README                   |
| Browser          | Any modern browser with ES module support + Canvas2D; tested on Chrome/Firefox/Safari    |
| Optional: Python 3.9+ + aiohttp | For `serve.py` dev server only (`pip install aiohttp`)              |

### How to run (development)

**With the plugin (recommended):** install it in X-Plane, enable it, and open `http://localhost:8088`.

**With the Python dev server** (for quick JS iteration without rebuilding the plugin):

```bash
cd xplane-panel
pip install aiohttp   # once
python serve.py       # serves static + proxy on :8080
```

Then open `http://localhost:8080` in a browser. The frontend auto-detects `localhost` and connects directly to X-Plane on port 8086.

### Coding conventions

- **No build tools** — edit `.js` files directly, refresh browser.
- **ES modules** with explicit `import`/`export` — no global namespace pollution, but also no bundler-assisted tree-shaking.
- **Classes** for instruments (extend `BaseInstrument`), **functions-as-modules** for APIs (`xplane-api.js`, `panel-store.js`, `dataref-registry.js`).
- **No TypeScript** — JSDoc comments are occasionally used but there is no type-checking build step.
- **Inline CSS** in `<style>` blocks within each HTML file — no separate `.css` files.
- **Canvas rendering** is re-entrant: instruments can live at any resolution, handle their own resize via `ResizeObserver`.
- Each instrument file exports a `DEFAULTS` map for dataref names and a named class.

### Adding a new instrument

1. Create `js/instruments/<name>.js` exporting a class extending `BaseInstrument` and a `DEFAULTS` object for dataref names.
2. Implement `requiredDatarefs()`, `update(state)`, and `_render()`.
3. **Use `this._theme.*` for all colours** — never hardcode hex strings. See the theme slot table above. Ambient overlays (hypoxia, flood) are applied automatically after `_render()` with no extra code.
4. Register the instrument in both `index.html` (add to `ICONS`, `DATAREF_DEFAULTS`, and the palette markup) and `panel.js` (add to `INSTRUMENT_MAP` and `getDefaults()`).
5. If interactive, implement `onPointerDown/Move/Up` or use canvas `pointerdown` listeners in `_setupControls()`.
6. If it needs aircraft-specific configuration, override `setAircraftProfile(profile)` — the profile is automatically delivered at boot and on every aircraft change. No changes to `panel.js` are needed. The full profile shape is documented in `aircraft-profile.js`.
7. If the instrument is **per-engine**, add its type key to `ENGINE_INDEX_TYPES` in `index.html`. This causes a modal to pop up on drop asking the user to select an engine, and exposes an "Engine" dropdown in the sidebar.

---

## Deployment Scenarios

### Same PC (simplest)

Open `http://localhost:8088` in a browser on the sim PC. `xplane-api.js` detects `localhost` and connects directly to X-Plane on port 8086, bypassing the plugin hub for lower latency.

### LAN devices (tablet, phone, Raspberry Pi)

1. Install and enable the XPanelServer plugin in X-Plane.
2. On the LAN device, open `http://<sim-pc-ip>:8088`.
3. The plugin serves the web app, proxies REST, and bridges the WebSocket — no additional setup.

### Multiple displays

Open `panel.html?id=<panelId>` in separate browser windows/tabs on any device — all share one WebSocket connection to X-Plane via the plugin hub. Each browser gets its own subscription and a full snapshot of current values on connect. The Panel Manager remains open for editing.

---

## Key Limitations and Notes

- **X-Plane version requirement:** 12.1.1+ (the Web API was introduced in this version).
- **Plugin required for LAN:** The XPanelServer plugin must be built and installed in X-Plane. `serve.py` still works for local development but does not support the hub or cache features.
- **No service worker:** There is no service worker. The app always loads fresh from the plugin server. Home-screen install (manifest + icons) works for icon/name only — it does not enable offline use.
- **Dataref resolution at boot only:** If a dataref is not found during initial panel load, the instrument won't request it — it won't appear later if dynamically created.
- **X-Plane restart resilience:** The plugin hub reconnects automatically and replays browser subscriptions. Browsers stay connected and resume from cached values — no page reload needed.
- **Single X-Plane instance:** The plugin forwards to `localhost:8086` and assumes one X-Plane instance on the same machine.
- **Canvas-only rendering** means rendering quality depends on device pixel ratio; instruments use the canvas's actual pixel dimensions from `ResizeObserver`.
- **No user accounts or authentication** — the plugin and panel manager are intended for trusted LAN environments.

---

## Interactive Instrument Patterns

### Knob / increment controls — Hold-to-Repeat

Instruments with ▲/▼ increment buttons (autopilot knobs, transponder digits, radio tuning) use a two-phase timer:

1. `pointerdown` fires the first action immediately.
2. A `setTimeout` (350 ms) starts the repeat phase.
3. `setInterval` (100–120 ms) repeats the action until `pointerup`/`pointercancel`.

Both timers are cleared on pointer release. This provides a natural "tap for one, hold for continuous" feel without any library.

### Write-then-confirm display (no optimistic updates)

**Rule:** Never update a displayed value locally when the user presses a button. Instead:

1. Compute the desired new value.
2. Write it to X-Plane via `writeDataref(id, value)`.
3. Wait for X-Plane to echo it back through the WebSocket subscription.
4. Only update the display when the confirmed value arrives in `update(state)`.

**Why this matters:** X-Plane may clip, quantise, or reject a value. Optimistic updates cause the display to show a value the sim never accepted. This was discovered with V/S FPM: clicking +100 FPM optimistically displayed "100" but lerp animation was still in-flight, showing "91" when the sim confirmed "100". Fix: direct snap assignment in `_render()` and no local update on write.

### Lerp animation — when to use and when NOT to

Smooth needle lerp (`_lerp`) is appropriate for **read-only gauges** (attitude, airspeed, altimeter) where the display is purely driven by incoming sensor data and a small visual lag is acceptable.

It is **wrong for interactive controls** (autopilot dials, transponder digits): if you lerp display toward the sim-confirmed value, the screen shows mid-animation values (e.g. 91 instead of 100) when the user interacts again.

### Lighted pushbutton visual pattern

AP/FD/THR mode buttons in the autopilot panel are drawn as lighted pushbuttons:

- Outer rounded-rect bezel (dark grey)
- Top ~30% of button: "LED lens" — lit in mode colour when active, near-black when off, with a gloss highlight arc
- Bottom separator line
- Label text in the lower portion

This pattern gives an authentic avionics appearance and makes state immediately readable at a glance.

---

## Dataref Registration — Critical Pattern

Every dataref that an instrument needs to **write** (not just read) must be registered in **three places**:

| Location | Purpose |
|---|---|
| `DEFAULTS` object in the instrument `.js` file | Maps short key → full dataref name; used by the instrument internally |
| `getDefaults('type')` in `panel.js` | Tells the panel engine which datarefs to resolve to integer IDs at boot |
| `DATAREF_DEFAULTS.type` in `index.html` | Tells the Panel Manager editor which datarefs to subscribe to for the live preview |

**If a dataref is only in `DEFAULTS` but not in `getDefaults()` / `DATAREF_DEFAULTS`, its ID will resolve to `undefined` and all writes will silently do nothing.** This was the root cause of the RX audio toggle failing: the `audio_selection_com1/com2/nav1/nav2/adf1/adf2` datarefs were in `DEFAULTS` but missing from the other two locations.

---

## Command Name Pitfalls

X-Plane command names are **case-sensitive** and must match exactly. Common mistakes:

| Wrong | Correct |
|---|---|
| `sim/autopilot/hdg` | `sim/autopilot/heading` |
| `sim/autopilot/nav` | `sim/autopilot/NAV` |

Use `searchCommands('pattern')` (exported from `xplane-api.js`) in the browser console to discover the exact names available in a session:

```js
import { searchCommands } from './js/xplane-api.js'
searchCommands('autopilot')   // returns sorted array of matching command names
```

Commands are lazy-loaded from `/v3/commands` on first use and cached; `searchCommands` only works after the first command trigger.

---

## Radio Panel Notes

### Frequency dataref strategy

COM and NAV radios use **two separate writable integer datarefs** per frequency:
- `*_frequency_Mhz` — integer MHz part (e.g. 118 for 118.300)
- `*_frequency_khz` — integer kHz×10 part (e.g. 300 for 118.300)

Writing them separately avoids floating-point precision issues. kHz tuning wraps at the band limit and carries over to MHz.

ADF radios use a **single `*_frequency_hz` dataref** that stores the frequency in kHz directly (e.g. 320 for 320 kHz).

### Audio monitoring (RX)

`sim/cockpit2/radios/actuators/audio_selection_com1` (and `_com2`, `_nav1`, `_nav2`, `_adf1`, `_adf2`) are boolean (0/1) datarefs. Writing 1 enables that radio's audio in the sim. Multiple radios can be active simultaneously — they mix in the sim's audio output.

### Radio count auto-detection

X-Plane has no reliable `acf_com_cnt`-style datarefs. Radio panel visibility is instead controlled by `config.radios` (an array of radio IDs set in the Panel Editor via checkboxes). Defaulting to `['com1','com2','nav1','nav2']`. ADF1/ADF2 must be explicitly enabled in the editor.