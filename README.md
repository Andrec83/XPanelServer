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
2. At the bottom of the page enable **"Accept incoming connections"**

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
3. Drag instruments from the left palette onto the grid. The palette is grouped into collapsible sections — **General** plus one per aircraft pack (e.g. **King Air 350**)
4. Click an instrument cell to resize it (col/row span) or configure it (e.g. select which radios to show)
5. **Red instruments** — with X-Plane running, the Panel Manager checks every instrument's datarefs against what the loaded aircraft publishes. An instrument that can't work (typically an aircraft-specific one, e.g. a King Air gauge while flying the Baron) is shown red in the palette and on the grid; hover it to see what's missing. In its sidebar the missing dataref fields are outlined in red — point them to existing datarefs and the instrument turns normal again. Switching aircraft re-checks automatically when you come back to the page (or click **Recheck**)
6. **Touch controls** (top bar) shows or hides the on-screen buttons of instruments that have them, for the whole panel. Each widget can override this in its sidebar (Panel default / Show / Hide) — handy for display-only screens where a stray tap shouldn't change anything
7. **Save**, then click **Open** - this opens `panel.html` in a new tab with the live display

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
| Lights | Aircraft lighting panel (landing, taxi, nav, beacon, strobe) - auto-hides lights not present on the aircraft. Logo, wing, ice and other lights are wired to X-Plane's *generic lights* differently on every aircraft, so you add them per widget under **Generic light buttons**, e.g. `LOGO=3, WING=5` (slot numbers from the aircraft's docs or DataRefTool) |
| Autopilot | Full AP control: AP master, FD, A/THR (hidden on GA aircraft), HDG/ALT/V/S/SPD knobs, mode buttons, mode annunciator |
| Radio | COM1/2, NAV1/2, ADF1/2 - active/standby freq, swap, tuning, per-radio RX audio toggle |
| EGT / Cylinders | Per-cylinder EGT bar chart. **Per-engine** — select engine when adding. One bar per active cylinder. Mirrors the CHT layout. |
| OBS / CDI | Course deviation indicator (HSI-style). **Per-NAV** — select NAV1 or NAV2 when adding. Shows OBS course, lateral deviation, glideslope needle, and flag. |
| Turn Coordinator | Turn rate + slip ball |
| Blank Tile | Empty filler tile for spacing out a panel layout |
| FMS CDU | Screen and keypad of X-Plane's built-in FMS — works with every aircraft that uses it (Laminar A330, 737-800, MD-82…). Airbus MCDU or Boeing CDU keypad (auto-selected from the aircraft ICAO), CDU 1 or 2. Switch touch controls off for a screen-only display |

### King Air 350 pack

Aircraft-specific replicas for the King Air 350, contributed by [Pascalander](https://forums.x-plane.org/profile/665121-pascalander/). Most read the add-on's own `KA350/...` datarefs, so they only work with that aircraft loaded — with any other aircraft they show no data and appear **red** in the Panel Manager. The engine gauges and the annunciator panel use only `KA350/...` datarefs; the EADI, EHSI and steam gauges partly use standard datarefs, so they move with other aircraft but are incomplete.

| Instrument | Description |
|---|---|
| King Air EADI | Electronic attitude display with FD/nav deviation, radio altitude and DH — touch buttons: DH −/+ |
| King Air EHSI | Electronic HSI with active/preselect course, DME, waypoint ID — touch buttons: HDG −/+, SYNC, CRS −/+ |
| King Air Altimeter | Drum-pointer altimeter with baro window — touch buttons: BARO −/+, 29.92 |
| King Air Airspeed / VSI / Standby Attitude | Steam gauges calibrated to King Air markings |
| King Air Torque / ITT / Turbine RPM / Prop RPM / Fuel Flow / Oil | Dual-needle twin-engine gauges |
| King Air Annunciator Panel | Caution/advisory annunciator panel |

### Pilatus PC-6 pack

Steam gauges styled and calibrated for the PC-6 Porter, contributed by [Pascalander](https://forums.x-plane.org/profile/665121-pascalander/). They use standard X-Plane datarefs, so they also work on other light aircraft, but the airspeed and VSI markings are PC-6 specific.

| Instrument | Description |
|---|---|
| PC-6 Airspeed / VSI | Airspeed with PC-6 arcs; VSI with the PC-6 non-linear scale |
| PC-6 Attitude (vacuum) | Attitude indicator driven by the vacuum gyro datarefs |
| PC-6 Altimeter | Three-pointer altimeter — touch buttons: BARO −/+, 29.92 |
| PC-6 Heading | Directional gyro — touch buttons: HDG bug −/+, SYNC |
| PC-6 OBS / CDI | Per-NAV CDI — touch buttons: OBS −/+ |
| PC-6 ITT + Fuel Flow | Per-engine turbine ITT + fuel flow butterfly gauge |

### Boeing 737 pack

Glass flight, navigation, engine and fuel displays laid out like the Laminar 737-800's display units. They read X-Plane's standard engine and fuel datarefs, so they also work with other twin jets; tanks are identified from their position, not their index. The engine and fuel displays have a **Units** option (LBS, the Laminar 737 default, or KG).

| Instrument | Description |
|---|---|
| 737 PFD | Attitude with flight director, speed tape (selected speed, trend vector, Vmo barber pole, Mach), altitude tape (selected altitude, baro), vertical speed, heading arc with heading bug and track, ILS deviation, radio altitude, flight-mode annunciations (from X-Plane's generic autopilot status) |
| 737 ND (Map) | Expanded MAP mode: compass arc, track and heading, heading bug, range rings (follow the cockpit EFIS range knob), GS / TAS / wind, active waypoint with distance and time-to-go. X-Plane doesn't publish the flight plan, so only the active leg is drawn |
| 737 Standby (ISFD) | Standby attitude, airspeed and altitude from the standby instruments — touch buttons: BARO −/+, STD |
| 737 Upper Engine Display | TAT, N1 and EGT dials with digital readouts and redlines, REV indication, N1-limit bug (Laminar 737), fuel flow, FUEL QTY box with total |
| 737 Lower Engine Display | N2 dials, fuel flow, oil pressure and temperature (digital + small scale), oil quantity. No VIB — X-Plane doesn't publish engine vibration |
| 737 Fuel | TANK 1 / CTR / TANK 2 dials with LOW alert, total, fuel used, total fuel flow (× 1000) |

### Airbus A330 pack

ECAM-style displays (green values, cyan units). Also based on standard datarefs, so they work with the Laminar A330-300 and other jets.

| Instrument | Description |
|---|---|
| A330 PFD | Airbus PFD: five-column FMA (thrust, vertical, lateral, approach capability, AP / FD / A/THR) with mode-change boxes, attitude with FD bars, speed tape with VMAX, next-flap VFE, trend and target, altitude tape with the 20 ft drum and selected altitude, V/S, heading tape with selected heading and track, LS deviation and ILS info, radio altitude, QNH / STD. "QNH units" option: inHg or hPa |
| A330 ND | Airbus navigation display, heading up, following the cockpit EFIS knob (ROSE LS / VOR / NAV, ARC, PLAN) and range: compass with selected heading and track, range rings, GS / TAS / wind, active waypoint with bearing, distance and ETA, ILS / VOR course and deviation, G/S scale, VOR / ADF pointers and info when selected. Only the active leg is drawn (X-Plane doesn't publish the flight plan) |
| A330 Standby (ISIS) | Attitude, Airbus speed and altitude tapes, baro in hPa / inHg or STD, LS deviation. Touch buttons LS, ATT RST, BARO −/+ and STD operate the cockpit ISIS on the Laminar A330 |
| A330 Engine / Warning Display (E/WD) | EPR, EGT and N1 dials, fuel flow and N3 digits, thrust limit (CLB / MCT / FLX / TOGA + EPR), fuel on board, slats/flaps, ECAM memo and warnings. "Primary parameter" switches EPR (Trent) ↔ N1 |
| A330 WHEEL (SD page) | Ground spoilers, gear position, brake temperatures for the eight main wheels with hottest-brake arc and release indication, autobrake mode, L/G CTL / NORM BRK / ANTI SKID status, TAT / SAT / UTC / GW strip |
| A330 ENGINE (SD page) | N2 (Trent intermediate spool), fuel used per engine, oil quantity / pressure / temperature, nacelle temperature dials, ignition, TAT / SAT / UTC / GW strip. No VIB (not published by X-Plane or the Laminar A330) |
| A330 CRUISE (SD page) | Fuel used per engine and total, oil quantity, landing elevation, cabin ΔP / V/S / altitude, cockpit, cabin zone and cargo temperatures, TAT / SAT / UTC / GW strip |
| A330 BLEED (SD page) | Packs (outlet / compressor temperatures, C/H and flow needles), pack, ram air, crossbleed, IP and HP valves, precooler pressure and temperature. Needs the Laminar A330 |
| A330 CAB PRESS (SD page) | Landing elevation, ΔP / V/S / cabin altitude dials, vent extract, outflow and safety valves, packs |
| A330 ELEC AC (SD page) | AC 1 / AC 2 / AC ESS buses and feeds, generators (load, volts, Hz), IDG temperatures, TRs, APU GEN, EMER GEN, STAT INV. Needs the Laminar A330 |
| A330 HYD (SD page) | Green / blue / yellow pressure, electric pumps, fire valves, engine pumps, RAT with RPM, reservoir quantity |
| A330 COND (SD page) | Cockpit and six cabin zone temperatures, duct temperatures and trim valves, hot air manifold and valves, forward and bulk cargo. Needs the Laminar A330 |
| A330 DOOR/OXY (SD page) | Passenger doors with SLIDE armed state, avionics and cargo doors, crew oxygen pressure, cabin V/S |
| A330 APU (SD page) | APU GEN (load, volts, Hz), AVAIL, bleed valve and pressure, N and EGT dials, FLAP OPEN |
| A330 F/CTL (SD page) | Spoilers / speed brakes, inner and outer ailerons, PRIM / SEC computers, pitch trim, elevators, rudder and rudder trim, G B Y hydraulic supply per surface |
| A330 STATUS (SD page) | Status text (limitations, procedures, inoperative systems) in the aircraft colours, or NORMAL. Needs the Laminar A330 |
| A330 C/B (SD page) | Circuit breaker page — always NORMAL (not simulated by the Laminar A330) |
| A330 SD (selected page) | One lower ECAM display that follows the cockpit ECAM control panel: shows the selected system page, or the automatic page (CRUISE / WHEEL in flight, ENG / WHEEL / DOOR on the ground). Needs the Laminar A330 |
| A330 ECAM control panel | Page pushbuttons with their lights, ALL, T.O CONFIG, EMER CANC, CLR, STS, RCL — operate the cockpit ECAM. Needs the Laminar A330 |
| A330 ELEC DC (SD page) | DC BAT / DC 1 / DC 2 / DC ESS / DC APU buses and links, batteries (volts, amps), TRs (volts, amps, AC source), STAT INV. Needs the Laminar A330 |
| A330 FUEL (SD page) | Laminar layout: fuel used per engine and total, LP and crossfeed valves, wing and centre pumps, wing outline with outer / inner / collector / centre quantities and tank temperatures, APU feed, trim tank, F.FLOW (kg/min), FOB |

### Per-engine instruments (EGT, CHT, Oil, EGT / Cylinders)

When you **drag one of these onto the grid**, a popup immediately asks which engine to associate it with (ENG 1–4). For a twin-engine aircraft, add two EGT widgets side by side - one for each engine. You can change the engine assignment later by clicking the widget in the editor and adjusting the "Engine" dropdown in the config sidebar.

---

## Credits

- **King Air 350** and **Pilatus PC-6** instrument packs: [Pascalander](https://forums.x-plane.org/profile/665121-pascalander/) — the first aircraft packs contributed to the project. Thank you!

Want to add your own instruments or an aircraft pack? See [CONTRIBUTING.md](CONTRIBUTING.md).

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
    ├── instrument-registry.js  Discovers instruments at runtime (GET /instruments + META exports)
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
        ├── obs.js          OBS / CDI course deviation indicator (per-NAV)
        ├── fmsCdu.js       FMS CDU (X-Plane built-in FMS screen + keypad)
        ├── …               turnCoordinator.js, blank.js
        ├── _glass.js       Shared drawing helpers for the airliner displays ("_" files are not listed as instruments)
        ├── King Air 350/   One sub-folder per palette section — drop files in, no registration needed
        ├── Pilatus PC-6/
        ├── Boeing 737/
        └── Airbus A330/
```

---

## Troubleshooting

**Panel shows "Connecting…" and never connects**
- Check that the XPanelServer plugin is enabled (Plugins → XPanel Server → Enable Server)
- Verify X-Plane is running with "Accept incoming connections" enabled
- Check Windows Firewall isn't blocking the plugin port (default 8088; check **Plugins → XPanel Server → Set Port** if you changed it)

**An instrument is red in the Panel Manager, or shows nothing on the panel**
- Its datarefs don't exist in X-Plane right now. Hover it in the Panel Manager to see which ones and what it needs (e.g. *"Needs: the King Air 350 add-on"*). Aircraft-specific instruments only work with that aircraft loaded.
- If the aircraft is right, the dataref may have a different name in your version/add-on: select the widget and type the correct name into the field outlined in red (autocomplete lists what X-Plane publishes).
- Nothing is marked red while X-Plane is unreachable — the sidebar then says *"X-Plane not reachable — datarefs not checked."*

**Logo / wing / ice light buttons are missing from Light Switches**
- X-Plane 12 has no dedicated datarefs for these; each aircraft wires them to a numbered *generic light*. Select the Light Switches widget and fill **Generic light buttons**, e.g. `LOGO=3, WING=5` — the slot numbers come from the aircraft's documentation, or watch `sim/cockpit2/switches/generic_lights_switch` in DataRefTool while flipping the switch in the cockpit.

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