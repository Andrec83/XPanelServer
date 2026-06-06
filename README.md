# X-Plane Cockpit Panels

Zero-build web app - live cockpit instruments streamed from **X-Plane 12's Web API**, viewable in any browser on the same PC or on LAN-connected devices (tablets, phones, Raspberry Pi, second monitor).

The **XPanelServer plugin** handles everything: static file serving, REST proxy, WebSocket hub, and panel config storage. No Python or separate server required.

---

## Requirements

| Requirement | Details |
|---|---|
| X-Plane 12.1.1+ | Must be running with network API enabled (see below) |
| XPanelServer plugin | Built and installed from `xplane-plugin/` - see [plugin README](xplane-plugin/README.md) |
| Browser | Any modern browser with ES module support; see [Browser Notes](#browser-notes) |

---

## X-Plane setup

1. Open X-Plane → **Settings → Network**
2. Under **"Other Computers can send data to this computer"**, enable **"Accept incoming connections"**
3. Leave the port at the default **8086**

---

## Quick start

With the XPanelServer plugin installed and X-Plane running, open:

```
http://<sim-pc-ip>:8088
```

in any browser on the same PC or on the LAN - you may need to open the port on Windows Firewall.
The plugin serves the app, proxies the REST API, and bridges the WebSocket - no further setup needed.

> **Port note:** 8088 is the default. You can change it via **Plugins → XPanel Server → Set Port** in X-Plane. Whatever port the plugin uses, the web app auto-detects it from the URL — no hardcoded values.


To find your sim PC's IP address: 
- on Windows, run `ipconfig` in a command prompt and look for the IPv4 address on your Wi-Fi or Ethernet adapter (e.g. `192.168.1.42`). 
- the plugin menu (**Plugins → XPanel Server → URL**) also shows it and can copy it to clipboard.

---

## Creating and opening a panel

1. Open the Panel Manager at `http://<sim-pc-ip>:8088`
2. Click **New Panel**, give it a name, choose grid size and background colour
3. Drag instruments from the left palette onto the grid
4. Click an instrument cell to resize it (col/row span) or configure it (e.g. select which radios to show)
5. **Save**, then click **Open** - this opens `panel.html` in a new tab with the live display

To show a panel on a dedicated device, open the panel URL on that device. The Panel Manager does not need to stay open.

---

## Multiple devices

Each device connects to `http://<sim-pc-ip>:8088` independently. The plugin maintains **one shared WebSocket connection to X-Plane** and broadcasts updates to all browsers simultaneously.

When a new device connects, it immediately receives a full snapshot of all current dataref values - instruments populate at once rather than waiting for each value to change. If X-Plane restarts mid-session, the plugin reconnects automatically and all connected browsers resume without reloading.

Example setup:
- Laptop: Panel Manager + PFD panel
- iPad: Engine gauges panel
- Raspberry Pi 7" touchscreen: AP + Radio panel

---

## Visual effects

All panels automatically respond to sim conditions in real time:

| Effect | How it works |
|---|---|
| **Night mode** | When you turn up the cockpit instrument lights (`instrument_brightness_ratio`), all instruments switch to an amber backlit palette - dark bezels, amber needles, amber digital readouts. Turn lights back down and they return to the day palette. |
| **Hypoxia** | If the pilot's felt pressure altitude (`pilot_felt_altitude_ft`) exceeds 12,500 ft, a progressively darker black overlay appears over all instruments, reaching near-blackout at 15,000 ft. Matches X-Plane 12's built-in hypoxia logic. |
| **Flood light** | When the aircraft flood lights are on, a warm amber-white wash from above overlays all instruments, simulating the glareshield/overhead lamp. (Aircraft-specific; has no effect if the aircraft doesn't have this light.) |

---

## Available instruments

| Instrument | Description |
|---|---|
| Airspeed | Airspeed indicator with colour-coded speed ranges (Vs0, Vfe, Vno, Vne) auto-detected from aircraft |
| Altimeter | Three-pointer altimeter with baro knob |
| Attitude | Artificial horizon with pitch ladder, roll arc, slip/skid ball |
| VSI | Vertical speed indicator, ±4000 FPM |
| Heading | Directional gyro with heading bug (tap buttons + SYNC) |
| Engine | Adaptive bar gauge - one column per engine. Automatically switches between **N1/N2** (jet), **NG/NP** (turboprop), and **RPM+MP** (piston) based on the loaded aircraft. Colour zones, redline, and digital readouts. |
| Flaps | Flap position with UP/DN buttons, notch labels auto-detected from aircraft |
| Gear | Gear position lights with UNSAFE warning and up/down buttons |
| EGT | EGT + fuel flow butterfly gauge. **Per-engine** - select engine when adding. Colour zones from aircraft limits arcs; fuel flow in gal/h (piston) or lb/h (jet/turboprop), auto-ranging. |
| CHT | Cylinder head temperature bars, per cylinder. **Per-engine** - select engine when adding. |
| Oil | Oil temp + pressure butterfly gauge. **Per-engine** - select engine when adding. Colour zones from aircraft limits arcs. |
| Fuel | Fuel quantity gauge - one horizontal bar per tank, all tanks in a single widget. Tank count and labels (LEFT/RIGHT/CTR/etc.) auto-detected from the loaded aircraft. Green/amber/red fill with percentage readout. |
| Transponder | 4-digit octal squawk code, mode selector, IDENT button |
| Lights | Aircraft lighting panel (landing, taxi, nav, beacon, strobe, logo, wing, formation) - auto-hides lights not present on the aircraft |
| Autopilot | Full AP control: AP master, FD, A/THR (hidden on GA aircraft), HDG/ALT/V/S/SPD knobs, mode buttons, mode annunciator |
| Radio | COM1/2, NAV1/2, ADF1/2 - active/standby freq, swap, tuning, per-radio RX audio toggle |
| EGT / Cylinders | Per-cylinder EGT bar chart. **Per-engine** — select engine when adding. One bar per active cylinder. Mirrors the CHT layout. |
| OBS / CDI | Course deviation indicator (HSI-style). **Per-NAV** — select NAV1 or NAV2 when adding. Shows OBS course, lateral deviation, glideslope needle, and flag. |

### Per-engine instruments (EGT, CHT, Oil, EGT / Cylinders)

When you **drag one of these onto the grid**, a popup immediately asks which engine to associate it with (ENG 1–4). For a twin-engine aircraft, add two EGT widgets side by side - one for each engine. You can change the engine assignment later by clicking the widget in the editor and adjusting the "Engine" dropdown in the config sidebar.

---

## Browser notes

### Desktop (sim PC or second monitor)

Any modern browser works: Chrome, Firefox, Edge, Safari.

### Fullscreen button

`panel.html` includes a small fullscreen button in the top-right corner (next to the status dot). Tap or click it to enter fullscreen; tap again to exit. The button is invisible on devices that don't support the Fullscreen API.

### Android tablet / phone - recommended: Opera Browser (kiosk mode)

**Opera Browser** for Android supports a free built-in **Fullscreen Mode** that hides all browser chrome and runs the page full-screen - ideal for a dedicated instrument panel display.

To enable it in Opera for Android:

1. Install **Opera Browser** from the Google Play Store
2. Navigate to the panel URL (e.g. `http://192.168.1.42:8088/panel.html?id=...`)
3. Tap the **Opera menu (O)** → **Settings** → **Fullscreen**
4. Enable fullscreen mode - the browser chrome disappears and the page fills the screen

Alternatively, use the fullscreen button built into `panel.html` (see above) - it works in any Android browser.

### iOS (iPhone / iPad)

The Fullscreen API is not supported on iOS - Apple requires all browsers on iOS to use WebKit, which does not implement `requestFullscreen()`. The fullscreen button is automatically hidden on iOS devices. There is no workaround short of a dedicated native app.

### Raspberry Pi / kiosk display

Run Chromium in kiosk mode for a fully locked-down display:

```bash
chromium-browser --kiosk --noerrdialogs --disable-infobars \
  "http://<sim-pc-ip>:8088/panel.html?id=<panelId>"
```

Add this to `/etc/xdg/autostart/` or your desktop session autostart to launch on boot.

---

## Files

```
xplane-panel/
├── index.html          Panel Manager (editor, settings, panel list)
├── panel.html          Live instrument display
├── serve.py            Legacy dev proxy (Python/aiohttp) - only needed for JS development
├── manifest.json       Home screen manifest (icon, name, standalone display)
├── favicon.ico
├── images/             App icons (icon-180.png for iOS, icon-192/512.png for Android)
└── js/
    ├── xplane-api.js       X-Plane WebSocket + REST abstraction
    ├── aircraft-profile.js Aircraft capability probe (engine type, limits, fuel tanks, speeds…)
    ├── panel.js            panel.html entry point - instantiates instruments
    ├── panel-store.js      Panel config CRUD (server + localStorage fallback)
    ├── dataref-registry.js DataRefs.txt loader + search
    └── instruments/
        ├── base.js         BaseInstrument class
        ├── airspeed.js
        ├── altimeter.js
        ├── attitude.js
        ├── vsi.js
        ├── heading.js
        ├── engine.js       Adaptive: jet / turboprop / piston mode
        ├── flaps.js
        ├── gear.js
        ├── egt.js          Per-engine; profile-driven zones; gal/h or lb/h fuel flow
        ├── cht.js          Per-engine
        ├── oil.js          Per-engine; profile-driven zones
        ├── fuel.js         All tanks in one widget; auto-detected from aircraft
        ├── transponder.js
        ├── lights.js
        ├── autopilot.js
        ├── radio.js
        ├── egtcyl.js       Per-cylinder EGT bar chart (per-engine)
        └── obs.js          OBS / CDI course deviation indicator (per-NAV)
```

---

## Troubleshooting

**Panel shows "Connecting…" and never connects**
- Check that the XPanelServer plugin is enabled (Plugins → XPanel Server → Enable Server)
- Verify X-Plane is running with "Accept incoming connections" enabled
- Check Windows Firewall isn't blocking the plugin port (default 8088; check **Plugins → XPanel Server → Set Port** if you changed it)

**Instruments load but values don't update**
- Open the browser console (F12) and look for WebSocket errors
- The status dot (top-right of `panel.html`) shows connection state and last update time

**Second device shows "no data" on some instruments after connecting**
- This should not happen - the plugin sends a full snapshot of all known values when the browser sends its subscription. If it does occur, check the browser console for errors during the initial dataref-fetch step.

**RX audio toggle has no effect**
- X-Plane controls which audio is mixed to the headset. The RX button writes the `audio_selection_*` datarefs - if the aircraft doesn't support independent COM monitoring, the sim may ignore these writes.

**Autopilot buttons do nothing**
- Not all aircraft support all AP modes. Check that the mode is available on the loaded aircraft.
- Some AP modes require the AP master to be on first.

**Frequencies show as 0.00**
- The radio datarefs are aircraft-specific. Some aircraft use custom avionics datarefs instead of the standard `sim/cockpit2/radios/actuators/*` path. For those aircraft, the standard radio panel will not work.

**All my panels look dark**
- In some airplanes, the instrument panels are backlit by default. The plugin reflects that. During the day, reduce/remove the backlight settings. 

---

**I welcome all testing, feedbacks, or contributions to the code**