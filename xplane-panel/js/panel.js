import * as api from './xplane-api.js'
import { probeAircraftProfile, watchAircraftChanges } from './aircraft-profile.js'
import { getPanel } from './panel-store.js'
import { loadInstruments } from './instrument-registry.js'

// Instruments are discovered at runtime from js/instruments/ — see instrument-registry.js.
let _registry = null

const params   = new URLSearchParams(location.search)
const panelId  = params.get('id')
const hostParam = params.get('host')

// Ambient datarefs broadcast to all instruments via setAmbient().
// hypoxia: verify 'sim/cockpit2/oxygen/pilot_hypoxia_time' in your XP12 dataref list —
// it may be absent; the system will gracefully ignore undefined values.
const AMBIENT_DREFS = {
  brightness: 'sim/cockpit2/switches/instrument_brightness_ratio',
  flood:      'sim/cockpit2/switches/panel_brightness_ratio',
  hypoxia:    'sim/cockpit2/oxygen/indicators/pilot_felt_altitude_ft',
  // Sun elevation above horizon in degrees. Positive = day, negative = below horizon.
  // Used to gate the backlight: instruments stay white in daylight even if the rheostat is on.
  sun_pitch:  'sim/graphics/scenery/sun_pitch_degrees',
}

const HYPOXIA_LO = 12500   // ft — symptoms begin
const HYPOXIA_HI = 15000   // ft — full blackout

let _state = {}         // { dataref_name: latest_value }
let _instruments = []   // { instrument, widget }
let _unsubscribe = null
let _stopProfileWatch = null
let _updateCount = 0
let _lastMsgTime = Date.now()
let _lastAmbient = { brightness: 0, flood: 0, hypoxia: 0, sunPitch: 90 }

async function boot() {
  const panel = await getPanel(panelId)
  if (!panel) {
    document.body.innerHTML = '<p style="color:#f64;padding:2rem">Panel not found. <a href="index.html" style="color:#4af">Back to manager</a></p>'
    return
  }

  document.title = panel.name
  document.getElementById('panel-title').textContent = panel.name

  const host = hostParam || localStorage.getItem('xplane_host') || location.hostname || 'localhost'

  try {
    _registry = await loadInstruments()
  } catch (err) {
    showOverlay(err.message)
    return
  }

  buildGrid(panel)
  showOverlay('Connecting to X-Plane…')

  await connectAndRun(panel, host)
}

function buildGrid(panel) {
  const grid = document.getElementById('panel-grid')
  grid.style.gridTemplateColumns = `repeat(${panel.columns}, 1fr)`
  grid.style.gridTemplateRows    = `repeat(${panel.rows}, 1fr)`
  grid.style.background          = panel.background || '#111'

  for (const widget of panel.widgets) {
    const cell = document.createElement('div')
    cell.className = 'grid-cell'
    cell.style.gridColumn = `${widget.col} / span ${widget.colSpan || 1}`
    cell.style.gridRow    = `${widget.row} / span ${widget.rowSpan || 1}`
    cell.dataset.widgetId = widget.id

    const canvas = document.createElement('canvas')
    canvas.style.width  = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    cell.appendChild(canvas)
    grid.appendChild(cell)
  }
}

async function connectAndRun(panel, host) {
  try {
    await api.connect(host)
    hideOverlay()

    const allDatarefs = await api.fetchAllDatarefs()
    // Collect all dataref names needed (instruments + ambient)
    const allNames = new Set()
    for (const widget of panel.widgets) {
      const defaults = getDefaults(widget.type)
      const merged   = { ...defaults, ...widget.datarefs }
      for (const name of Object.values(merged)) allNames.add(name)
    }
    for (const name of Object.values(AMBIENT_DREFS)) allNames.add(name)

    const resolved = await api.resolveNames([...allNames])
    updateStatusDot(true, api.getStatus().xpVersion)

    // DEBUG: show which names resolved and which didn't
    console.group('[panel] DataRef resolution')
    for (const name of allNames) {
      if (resolved[name]) console.log('  ✓', name, '→ id', resolved[name].id)
      else                console.warn('  ✗ NOT FOUND:', name)
    }
    console.groupEnd()

    // Instantiate instruments
    _instruments = []
    for (const widget of panel.widgets) {
      const cell   = document.querySelector(`[data-widget-id="${widget.id}"]`)
      const canvas = cell?.querySelector('canvas')
      if (!canvas) continue

      const Cls = _registry.byType.get(widget.type)?.cls
      if (!Cls) {
        console.warn(`[panel] unknown instrument type "${widget.type}" — is its file missing from js/instruments/?`)
        cell.textContent = `Unknown instrument: ${widget.type}`
        cell.classList.add('grid-cell-missing')
        continue
      }

      const merged = { ...getDefaults(widget.type), ...widget.datarefs }
      const idMap = {}
      for (const [key, name] of Object.entries(merged)) {
        if (resolved[name]) idMap[name] = resolved[name].id
      }

      // Touch controls: per-widget override (true/false) wins over the panel-wide switch.
      const showControls = widget.config?.showControls ?? panel.showControls ?? true
      const config = { ...(widget.config || {}), showControls }

      let inst
      try {
        inst = new Cls(canvas, config, widget.datarefs || {}, idMap)
      } catch (err) {
        console.error(`[panel] "${widget.type}" failed to start:`, err)
        continue
      }
      _instruments.push({ instrument: inst, widget })
    }

    // Probe all aircraft capabilities and apply to instruments; re-probe on aircraft change
    if (_stopProfileWatch) _stopProfileWatch()
    probeAircraftProfile()
      .then(profile => {
        _applyProfile(profile, _instruments)
        _stopProfileWatch = watchAircraftChanges(p => _applyProfile(p, _instruments))
      })
      .catch(err => console.warn('[panel] aircraft profile probe failed:', err))


    // Build subscription list
    const idFreqPairs = []
    for (const name of allNames) {
      if (resolved[name]) idFreqPairs.push({ id: resolved[name].id, frequency: 20 })
    }

    let firstMessage = true
    let _dbgMsgCount = 0
    _unsubscribe = api.subscribe(
      idFreqPairs,
      (delta) => {
        _updateCount++
        _lastMsgTime = Date.now()
        if (firstMessage) {
          _state = { ..._state, ...delta }
          firstMessage = false
          // DEBUG: log the full first snapshot
          console.group('[panel] First WS snapshot keys (' + Object.keys(delta).length + ')')
          for (const [k, v] of Object.entries(delta)) console.log(' ', k, '=', v)
          console.groupEnd()
        } else {
          Object.assign(_state, delta)
          // DEBUG: log first 5 delta messages
          if (_dbgMsgCount < 5) {
            console.log('[panel] delta #' + _dbgMsgCount, delta)
            _dbgMsgCount++
          }
        }
        for (const { instrument } of _instruments) {
          instrument.update(_state)
        }
        _broadcastAmbient(_state, _instruments)
      },
      (_err) => {
        updateStatusDot(false)
        showOverlay('Simulator offline — reconnecting…')
        // xplane-api auto-reconnects; we watch for status change
        const poll = setInterval(async () => {
          if (api.getStatus().connected) {
            clearInterval(poll)
            hideOverlay()
            updateStatusDot(true, api.getStatus().xpVersion)
            firstMessage = true
            // Aircraft may have changed during disconnect — re-probe immediately.
            // Stop the old watch first: its fingerprint is stale and would fire
            // a second re-probe seconds later, potentially overwriting this one.
            if (_stopProfileWatch) { _stopProfileWatch(); _stopProfileWatch = null }
            probeAircraftProfile()
              .then(profile => {
                _applyProfile(profile, _instruments)
                _stopProfileWatch = watchAircraftChanges(p => _applyProfile(p, _instruments))
              })
              .catch(err => console.warn('[panel] profile re-probe after reconnect failed:', err))
          }
        }, 500)
      }
    )

    startHUDUpdater()

  } catch (err) {
    showOverlay(`Cannot reach X-Plane at ${host}:${location.port || 8088}\n${err.message}`)
    updateStatusDot(false)
    api.disconnect()  // cancel auto-reconnect so only one retry path is active
    setTimeout(() => connectAndRun(panel, host), 5000)
  }
}

function getDefaults(type) {
  return _registry?.byType.get(type)?.meta.datarefs || {}
}

function showOverlay(msg) {
  const el = document.getElementById('overlay')
  el.style.display = 'flex'
  el.querySelector('.overlay-msg').textContent = msg
}

function hideOverlay() {
  document.getElementById('overlay').style.display = 'none'
}

function updateStatusDot(connected, version) {
  const dot = document.getElementById('status-dot')
  dot.className = 'status-dot ' + (connected ? 'ok' : 'err')
  dot.title = connected ? `X-Plane ${version || ''}` : 'Disconnected'
}

let _lastCountSnapshot = 0
let _lastCountTime = Date.now()

function startHUDUpdater() {
  setInterval(() => {
    const now = Date.now()
    const elapsed = (now - _lastCountTime) / 1000
    const rate = (_updateCount - _lastCountSnapshot) / elapsed
    _lastCountSnapshot = _updateCount
    _lastCountTime = now
    document.getElementById('hud-rate').textContent = rate.toFixed(1)
    document.getElementById('hud-latency').textContent = (now - _lastMsgTime).toFixed(0)
  }, 1000)
}

// ── aircraft profile dispatch ─────────────────────────────────────────────────

function _applyProfile(profile, instruments) {
  for (const { instrument } of instruments) {
    instrument.setAircraftProfile(profile)
  }
}

// ── ambient state dispatch ────────────────────────────────────────────────────
// Reads ambient datarefs from the flat state object and calls setAmbient() on
// all instruments whenever a value changes. Called on every WS delta.

// Sun pitch thresholds for the ambient light ramp.
// Above SUN_DAY → full daylight (ambientLight=1), below SUN_NIGHT → full dark (ambientLight=0).
const SUN_DAY   =  10   // degrees above horizon
const SUN_NIGHT =  -6   // civil twilight

function _broadcastAmbient(state, instruments) {
  const brightnessRaw = state[AMBIENT_DREFS.brightness]
  const floodRaw      = state[AMBIENT_DREFS.flood]
  const hypoxiaRaw    = state[AMBIENT_DREFS.hypoxia]
  const sunPitchRaw   = state[AMBIENT_DREFS.sun_pitch]

  // Log once on first call so you can confirm which drefs resolved
  if (!_broadcastAmbient._logged) {
    _broadcastAmbient._logged = true
    console.group('[ambient] dref resolution check')
    console.log('  brightness dref:', AMBIENT_DREFS.brightness, '→', brightnessRaw ?? 'NOT IN STATE')
    console.log('  flood dref:     ', AMBIENT_DREFS.flood,      '→', floodRaw      ?? 'NOT IN STATE')
    console.log('  hypoxia dref:   ', AMBIENT_DREFS.hypoxia,    '→', hypoxiaRaw    ?? 'NOT IN STATE')
    console.log('  sun_pitch dref: ', AMBIENT_DREFS.sun_pitch,  '→', sunPitchRaw   ?? 'NOT IN STATE')
    console.groupEnd()
  }

  // backlitLight: instrument panel rheostat, 0–1 (float[32], index 0 = main panel)
  const backlitLight = Array.isArray(brightnessRaw) ? (brightnessRaw[0] ?? 0) : (brightnessRaw ?? 0)
  // flood: panel_brightness_ratio float[n], index 0 = flood knob level 0–1
  const flood        = Math.max(0, Array.isArray(floodRaw) ? (floodRaw[0] ?? 0) : (floodRaw ?? 0))
  const feltAlt      = hypoxiaRaw ?? 0
  const hypoxia      = feltAlt <= HYPOXIA_LO ? 0
                     : Math.min(1, (feltAlt - HYPOXIA_LO) / (HYPOXIA_HI - HYPOXIA_LO))

  // ambientLight: how much natural daylight reaches the instruments (0=night, 1=full day).
  // Defaults to full day until the sun_pitch dataref is first received.
  const sunPitch    = sunPitchRaw ?? SUN_DAY
  const ambientLight = sunPitch >= SUN_DAY  ? 1
                     : sunPitch <= SUN_NIGHT ? 0
                     : (sunPitch - SUN_NIGHT) / (SUN_DAY - SUN_NIGHT)

  const a = _lastAmbient
  if (a.brightness === backlitLight && a.flood === flood && a.hypoxia === hypoxia && a.sunPitch === sunPitch) return

  _lastAmbient = { brightness: backlitLight, flood, hypoxia, sunPitch }
  console.log('[ambient] changed →', { ambientLight: ambientLight.toFixed(2), backlitLight: backlitLight.toFixed(2), flood, hypoxia: hypoxia.toFixed(3) })
  for (const { instrument } of instruments) {
    instrument.setAmbient({ ambientLight, backlitLight, flood, hypoxia })
  }
}

// ── status dot click → HUD overlay ────────────────────────────────────────────
document.getElementById('status-dot').addEventListener('click', () => {
  const hud = document.getElementById('hud-overlay')
  hud.style.display = hud.style.display === 'none' ? 'block' : 'none'
})
document.getElementById('hud-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('hud-overlay')) {
    document.getElementById('hud-overlay').style.display = 'none'
  }
})

boot()