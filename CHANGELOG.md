# Changelog

## v2.0.0

A major release that makes the panel **open to third-party instruments**: an instrument is now one self-contained file that you drop into a folder. No more editing `index.html` or `panel.js`. It also adds the first two contributed aircraft packs (King Air 350 and Pilatus PC-6, by [Pascalander](https://forums.x-plane.org/profile/665121-pascalander/)), on-screen touch buttons, and a Panel Manager that tells you when an instrument can't work with the loaded aircraft.

> **Upgrade note:** install the plugin and the web files **together** (the release zip contains both). The new Panel Manager needs the plugin's new `/instruments` endpoint, so with an older plugin the palette stays empty. Your saved panels (`panels.json`) keep working as they are.

### New

**Drop-in instruments and palette sections**
- Instruments are discovered at runtime. Each file in `js/instruments/` exports its class and a `META` object with its type, label, icon, datarefs and options. The Panel Manager and live panels pick it up on reload.
- Each sub-folder of `js/instruments/` becomes a **collapsible palette section**, named after the folder (e.g. *King Air 350*). The open/closed state is remembered per browser.
- The widget sidebar is generated from `META`: engine/NAV selectors, dataref overrides, and option fields (select, multi-choice, checkbox, number, text, with placeholder and help text). Long dataref lists are folded away.
- Files that fail to load are listed in the palette with their error, instead of breaking the page.
- A saved widget whose instrument file is missing shows an "Unknown instrument" placeholder instead of breaking the panel.

**Red instruments: dataref availability check**
- With X-Plane running, the Panel Manager checks every instrument's datarefs (defaults plus your overrides) against what X-Plane currently publishes.
- An instrument that can't work with the loaded aircraft is shown **red** in the palette and on the grid. Hovering it explains which datarefs are missing and what it needs.
- In the sidebar, the missing dataref fields are outlined in red. Type an existing dataref and the instrument turns normal straight away.
- It re-checks when you return to the page (e.g. after switching aircraft), on **Recheck**, and whenever you edit an override.
- Instrument authors describe requirements in `META` with no special code: `requires`, `optionalDatarefs`, and `datarefCheck: 'any'` (for instruments that support alternative add-ons).

**Touch controls**
- Instruments can declare on-screen buttons. The base class draws them, handles taps and hold-to-repeat, and keeps them readable at night.
- A **Touch controls** switch in the editor's top bar shows or hides the buttons for the whole panel. Each widget can override it (Panel default / Show / Hide), which is handy for display-only screens.

**King Air 350 pack** (contributed by [Pascalander](https://forums.x-plane.org/profile/665121-pascalander/), 13 instruments)
- EADI, EHSI, altimeter, airspeed, VSI, standby attitude, torque, ITT, turbine RPM (N1), prop RPM, fuel flow, oil temp/pressure, and the annunciator panel.
- Touch buttons:
  - EHSI: HDG −/+, SYNC, CRS −/+
  - Altimeter: BARO −/+, 29.92
  - EADI: DH −/+
- Most read the King Air 350 add-on's own `KA350/…` datarefs, so they need that aircraft loaded. With other aircraft they are shown red.

**Pilatus PC-6 pack** (contributed by [Pascalander](https://forums.x-plane.org/profile/665121-pascalander/), 7 instruments)
- Airspeed, VSI, attitude (vacuum), altimeter, heading, OBS/CDI, and ITT + fuel flow.
- Touch buttons:
  - Altimeter: BARO −/+, 29.92
  - Heading: HDG −/+, SYNC
  - OBS/CDI: OBS −/+
- They use standard datarefs, so they also work on other light aircraft.

**Boeing 737 pack** (6 instruments)
- 737 PFD: attitude with flight director, speed and altitude tapes with selected values, trend vector, Vmo barber pole, vertical speed, heading arc, ILS deviation, radio altitude and flight-mode annunciations.
- 737 ND (Map): expanded map with compass arc, heading bug, range rings following the cockpit range knob, GS / TAS / wind and the active waypoint and leg.
- 737 Standby (ISFD): standby attitude, airspeed, altitude and baro, with BARO −/+ and STD touch buttons.
- 737 Upper Engine Display: TAT, N1 and EGT dials with digital readouts, redlines, REV indication and the N1-limit bug, fuel flow and the FUEL QTY box.
- 737 Lower Engine Display: N2, fuel flow, oil pressure / temperature / quantity.
- 737 Fuel: TANK 1 / CTR / TANK 2 with LOW alerts, total, fuel used and fuel flow.
- Laid out like the Laminar 737-800's display units, in LBS by default (KG selectable).

**Airbus A330 pack** (21 instruments)
- A330 ELEC DC (SD page).
- A330 SD (selected page): follows the ECAM control panel selection, with the automatic page when none is selected.
- A330 ECAM control panel: page pushbuttons and lights, ALL, T.O CONFIG, EMER CANC, CLR, STS, RCL.
- A330 C/B and STATUS (SD pages); the SD (selected page) shows STATUS while STS is lit.
- A330 BLEED, CAB PRESS, ELEC AC, HYD, COND, DOOR/OXY, APU and F/CTL (SD pages), laid out as on the Laminar A330, with the permanent data strip.
- A330 WHEEL (SD page): spoilers, gear, brake temperatures with hottest-brake arc and release marks, autobrake, braking / anti-skid status, permanent data strip.
- A330 ENGINE (SD page): N2, fuel used per engine, oil quantity / pressure / temperature, nacelle temperature dials, ignition, permanent data strip.
- A330 CRUISE (SD page): fuel used, oil quantity, landing elevation, cabin pressure / V/S / altitude, zone and cargo temperatures, permanent data strip.
- A330 Standby (ISIS): attitude, speed and altitude tapes, baro hPa / inHg or STD, LS deviation, ATT alignment flag; touch buttons LS, ATT RST, BARO −/+, STD (Laminar A330 ISIS commands).
- A330 ND: heading-up Airbus navigation display following the EFIS mode knob (ROSE LS / VOR / NAV, ARC, PLAN) and range selector; GS / TAS / wind, active waypoint and leg with ETA, ILS / VOR course and deviation, G/S scale, VOR / ADF bearing pointers and info boxes.
- A330 PFD: Airbus layout with the five-column FMA (X-Plane autopilot modes plus the Laminar A330's manual thrust modes, mode-change boxes and approach capability), attitude with FD bars, Airbus speed tape (VMAX, VFE next, trend, target), altitude tape with drum and selected altitude, V/S, heading tape, LS deviation, ILS info, radio altitude and QNH / STD.
- A330 Engine / Warning Display (E/WD), laid out as on the Laminar A330: EPR, EGT and N1 dials (Rolls-Royce Trent; N1 mode for other engines), fuel flow and N3 digits, thrust limit mode and EPR limit, fuel on board, slat/flap indication, and the ECAM memo / warning messages in their colours (Laminar A330 datarefs, optional).
- A330 FUEL (SD page), laid out as on the Laminar A330: fuel used, LP / crossfeed valves, pumps, wing tanks with collector and temperatures, APU feed, trim tank, F.FLOW, FOB.

Both packs use X-Plane's standard engine and fuel datarefs, so they also work on other jets, and identify fuel tanks from their position rather than assuming tank numbers.

**New general instruments**
- **FMS CDU**: the screen and keypad of X-Plane's built-in FMS, so it works with every aircraft that uses it (Laminar A330, 737-800, MD-82 and others).
  - Shows colours, large/small characters, reverse video, flashing and the EXEC light.
  - Airbus MCDU or Boeing CDU keypad, chosen automatically from the aircraft type; CDU 1 or 2.
  - With touch controls switched off it becomes a screen-only display.
- **Turn Coordinator**: turn rate and slip ball.
- **Blank Tile**: an empty filler for spacing out layouts.

**Light Switches: generic light buttons**
- X-Plane 12 has no dedicated logo, wing, formation or ice light datarefs. Each aircraft wires these to its own numbered *generic lights*.
- Add them per widget under **Generic light buttons**, e.g. `LOGO=3, WING=5` (slots 1–128). Each entry becomes an ON/OFF button that reads and controls that slot.

### Changed

- **Light Switches:** the fixed LOGO, WING and FORM buttons are removed. They pointed at datarefs and commands that don't exist in X-Plane 12 and never did anything. Use generic light buttons instead.
- **Fewer simultaneous requests:** the number of concurrent API calls is limited, so the server isn't overwhelmed when many instruments start at once.
- **Contributor guide:** the documentation now covers writing instruments: [ARCHITECTURE.md → Adding a new instrument](ARCHITECTURE.md#adding-a-new-instrument) and [CONTRIBUTING.md](CONTRIBUTING.md).

### Fixed

- **Plugin stability:** the plugin no longer calls the X-Plane SDK from its background threads, which the SDK doesn't allow. Logging and the `/acf` aircraft probe now go through X-Plane's main thread. This removes a possible rare crash or freeze, especially during aircraft loading.
- **OBS / CDI:** the glideslope flag never worked, because its datarefs don't exist in X-Plane 12. It now uses `sim/cockpit2/radios/indicators/navN_flag_glideslope`.
- **Light Switches:** NAV now uses the correct `sim/lights/nav_lights_on/off` commands. It previously only worked through a fallback.
- **Stale files after an update:** the plugin let browsers reuse cached web files for up to an hour, so updated or newly added instruments didn't appear on a normal reload. Files are now revalidated on every load; unchanged files still come from the browser cache.
- **serve.py (dev server):** `GET /panels` and the other API routes were being caught by the static-file route.

### For instrument authors

- New plugin endpoint: `GET /instruments` lists the instrument files and their sections. `serve.py` has the same endpoint.
- Required export: `META` (only `type` is mandatory). Optional fields:
  - `label`, `icon`, `order`, `datarefs`
  - `select` (`'engine'` or `'nav'`), `options`, `touchControls`, `hidden`, `component`
  - `requires`, `optionalDatarefs`, `datarefCheck`
- New `BaseInstrument` APIs:
  - `setTouchButtons()`, `controlsVisible`, `touchStripHeight`
  - `_renderEmissive()`, for self-lit content drawn above the night overlay
- `writeDataref(id, value, index)` can now write a single element of an array dataref.
- Panels made with Pascalander's modified copy of the stock instruments need their widget types renamed to the new pack types (`b350_*`, `pc6_*`).
