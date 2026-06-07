import * as api from './xplane-api.js'
import { probeAircraftProfile, watchAircraftChanges } from './aircraft-profile.js'
import { getPanel } from './panel-store.js'
import { AirspeedIndicator } from './instruments/airspeed.js'
import { Altimeter }         from './instruments/altimeter.js'
import { AttitudeIndicator } from './instruments/attitude.js'
import { VSI }               from './instruments/vsi.js'
import { HeadingIndicator }  from './instruments/heading.js'
import { EngineGauge }       from './instruments/engine.js'
import { FlapsIndicator }    from './instruments/flaps.js'
import { GearIndicator }     from './instruments/gear.js'
import { EGTGauge }          from './instruments/egt.js'
import { CHTGauge }          from './instruments/cht.js'
import { EGTCylGauge }       from './instruments/egtcyl.js'
import { OBSGauge }          from './instruments/obs.js'
import { OilGauge }          from './instruments/oil.js'
import { Transponder }       from './instruments/transponder.js'
import { LightSwitches }     from './instruments/lights.js'
import { AutopilotPanel }    from './instruments/autopilot.js'
import { RadioPanel }        from './instruments/radio.js'
import { FuelGauge }         from './instruments/fuel.js'

const INSTRUMENT_MAP = {
  airspeed: AirspeedIndicator,
  altimeter: Altimeter,
  attitude: AttitudeIndicator,
  vsi: VSI,
  heading: HeadingIndicator,
  engine: EngineGauge,
  flaps: FlapsIndicator,
  gear: GearIndicator,
  egt: EGTGauge,
  cht: CHTGauge,
  egtcyl: EGTCylGauge,
  obs:    OBSGauge,
  oil: OilGauge,
  transponder: Transponder,
  lights: LightSwitches,
  autopilot: AutopilotPanel,
  radio: RadioPanel,
  fuel:     FuelGauge,
}

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

      const Cls = INSTRUMENT_MAP[widget.type]
      if (!Cls) continue

      const merged = { ...getDefaults(widget.type), ...widget.datarefs }
      const idMap = {}
      for (const [key, name] of Object.entries(merged)) {
        if (resolved[name]) idMap[name] = resolved[name].id
      }

      const inst = new Cls(canvas, widget.config || {}, widget.datarefs || {}, idMap)
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
    showOverlay(`Cannot reach X-Plane at ${host}:8080\n${err.message}`)
    updateStatusDot(false)
    setTimeout(() => connectAndRun(panel, host), 5000)
  }
}

function getDefaults(type) {
  const map = {
    airspeed:  { kias: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot' },
    altimeter: { altitude_ft: 'sim/cockpit2/gauges/indicators/altitude_ft_pilot', baro_setting: 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot' },
    attitude:  { pitch_deg: 'sim/flightmodel/position/theta', roll_deg: 'sim/flightmodel/position/phi', slip_deg: 'sim/cockpit2/gauges/indicators/slip_deg' },
    vsi:       { vvi_fpm: 'sim/cockpit2/gauges/indicators/vvi_fpm_pilot' },
    heading:   { heading_deg: 'sim/cockpit2/gauges/indicators/heading_electric_deg_mag_pilot',
                 bug_deg: 'sim/cockpit/autopilot/heading_mag' },
    engine:    { n1_array: 'sim/flightmodel/engine/ENGN_N1_', n2_array: 'sim/flightmodel/engine/ENGN_N2_',
                 rpm_array: 'sim/cockpit2/engine/indicators/prop_speed_rpm', mp_array: 'sim/cockpit2/engine/indicators/MPR_in_hg' },
    flaps:     { flap_handle: 'sim/cockpit2/controls/flap_handle_deploy_ratio', flap_actual: 'sim/flightmodel2/controls/flap1_deploy_ratio' },
    gear:      { gear_handle: 'sim/cockpit/switches/gear_handle_status', gear_deploy: 'sim/flightmodel2/gear/deploy_ratio' },
    egt:       { egt: 'sim/cockpit2/engine/indicators/EGT_deg_C', ff: 'sim/cockpit2/engine/indicators/fuel_flow_kg_sec' },
    cht:       { cht: 'sim/cockpit2/engine/indicators/CHT_CYL_deg_C', cht_avg: 'sim/cockpit2/engine/indicators/CHT_deg_C', egt: 'sim/cockpit2/engine/indicators/EGT_deg_C' },
    egtcyl:    { egt: 'sim/cockpit2/engine/indicators/EGT_CYL_deg_C', egt_avg: 'sim/cockpit2/engine/indicators/EGT_deg_C' },
    obs: {
      nav1_obs: 'sim/cockpit2/radios/actuators/nav1_obs_deg_mag_pilot', nav1_hdef: 'sim/cockpit/radios/nav1_hdef_dot',
      nav1_fromto: 'sim/cockpit/radios/nav1_fromto', nav1_gs_flag: 'sim/cockpit/radios/nav1_flag_glideslope', nav1_vdef: 'sim/cockpit/radios/nav1_vdef_dot',
      nav2_obs: 'sim/cockpit2/radios/actuators/nav2_obs_deg_mag_pilot', nav2_hdef: 'sim/cockpit/radios/nav2_hdef_dot',
      nav2_fromto: 'sim/cockpit/radios/nav2_fromto', nav2_gs_flag: 'sim/cockpit/radios/nav2_flag_glideslope', nav2_vdef: 'sim/cockpit/radios/nav2_vdef_dot',
    },
    oil:         { oil_temp: 'sim/cockpit2/engine/indicators/oil_temperature_deg_C', oil_press: 'sim/cockpit2/engine/indicators/oil_pressure_psi' },
    transponder: { code: 'sim/cockpit/radios/transponder_code', mode: 'sim/cockpit/radios/transponder_mode', ident: 'sim/cockpit/radios/transponder_id' },
    lights: {
      landing:   'sim/cockpit2/switches/landing_lights_on',
      taxi:      'sim/cockpit2/switches/taxi_light_on',
      nav:       'sim/cockpit2/switches/navigation_lights_on',
      beacon:    'sim/cockpit2/switches/beacon_on',
      strobe:    'sim/cockpit2/switches/strobe_lights_on',
      logo:      'sim/cockpit2/switches/logo_lights_on',
      wing:      'sim/cockpit2/switches/wing_lights_on',
      formation: 'sim/cockpit2/switches/formation_lights_on',
    },
    autopilot: {
      ap_on:          'sim/cockpit2/autopilot/autopilot_on',
      fd_mode:        'sim/cockpit2/autopilot/flight_director_mode',
      heading_dial:   'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
      altitude_dial:  'sim/cockpit2/autopilot/altitude_dial_ft',
      vvi_dial:       'sim/cockpit2/autopilot/vvi_dial_fpm',
      airspeed_dial:  'sim/cockpit2/autopilot/airspeed_dial_kts',
      heading_mode:   'sim/cockpit2/autopilot/heading_mode',
      altitude_mode:  'sim/cockpit2/autopilot/altitude_mode',
      athr_on:        'sim/cockpit2/autopilot/autothrottle_on',
      athr_arm:       'sim/cockpit2/autopilot/autothrottle_arm',
      hnav_armed:     'sim/cockpit2/autopilot/hnav_armed',
      glideslope_armed: 'sim/cockpit2/autopilot/glideslope_armed',
      alt_hold_armed: 'sim/cockpit2/autopilot/altitude_hold_armed',
      bkcrse_on:      'sim/cockpit2/autopilot/backcourse_on',
      heading_status: 'sim/cockpit2/autopilot/heading_status',
      nav_status:     'sim/cockpit2/autopilot/nav_status',
      alt_hold_status:'sim/cockpit2/autopilot/altitude_hold_status',
      vvi_status:     'sim/cockpit2/autopilot/vvi_status',
      speed_status:   'sim/cockpit2/autopilot/speed_status',
      gls_status:     'sim/cockpit2/autopilot/glideslope_status',
      TOGA_status:    'sim/cockpit2/autopilot/TOGA_status',
    },
    radio: {
      com1_mhz:     'sim/cockpit2/radios/actuators/com1_frequency_Mhz',
      com1_khz:     'sim/cockpit2/radios/actuators/com1_frequency_khz',
      com1_sby_mhz: 'sim/cockpit2/radios/actuators/com1_standby_frequency_Mhz',
      com1_sby_khz: 'sim/cockpit2/radios/actuators/com1_standby_frequency_khz',
      com1_rx:      'sim/cockpit2/radios/actuators/audio_selection_com1',
      com2_mhz:     'sim/cockpit2/radios/actuators/com2_frequency_Mhz',
      com2_khz:     'sim/cockpit2/radios/actuators/com2_frequency_khz',
      com2_sby_mhz: 'sim/cockpit2/radios/actuators/com2_standby_frequency_Mhz',
      com2_sby_khz: 'sim/cockpit2/radios/actuators/com2_standby_frequency_khz',
      com2_rx:      'sim/cockpit2/radios/actuators/audio_selection_com2',
      nav1_mhz:     'sim/cockpit2/radios/actuators/nav1_frequency_Mhz',
      nav1_khz:     'sim/cockpit2/radios/actuators/nav1_frequency_khz',
      nav1_sby_mhz: 'sim/cockpit2/radios/actuators/nav1_standby_frequency_Mhz',
      nav1_sby_khz: 'sim/cockpit2/radios/actuators/nav1_standby_frequency_khz',
      nav1_rx:      'sim/cockpit2/radios/actuators/audio_selection_nav1',
      nav2_mhz:     'sim/cockpit2/radios/actuators/nav2_frequency_Mhz',
      nav2_khz:     'sim/cockpit2/radios/actuators/nav2_frequency_khz',
      nav2_sby_mhz: 'sim/cockpit2/radios/actuators/nav2_standby_frequency_Mhz',
      nav2_sby_khz: 'sim/cockpit2/radios/actuators/nav2_standby_frequency_khz',
      nav2_rx:      'sim/cockpit2/radios/actuators/audio_selection_nav2',
      adf1_hz:      'sim/cockpit2/radios/actuators/adf1_frequency_hz',
      adf1_sby_hz:  'sim/cockpit2/radios/actuators/adf1_standby_frequency_hz',
      adf1_rx:      'sim/cockpit2/radios/actuators/audio_selection_adf1',
      adf2_hz:      'sim/cockpit2/radios/actuators/adf2_frequency_hz',
      adf2_sby_hz:  'sim/cockpit2/radios/actuators/adf2_standby_frequency_hz',
      adf2_rx:      'sim/cockpit2/radios/actuators/audio_selection_adf2',
    },
    fuel: { fuel_qty: 'sim/cockpit2/fuel/fuel_quantity' },
    g1000pfd: {
      kias:         'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
      kias_accel:   'sim/cockpit2/gauges/indicators/airspeed_acceleration_kts_sec_pilot',
      tas:          'sim/cockpit2/gauges/indicators/true_airspeed_kts_pilot',
      gs:           'sim/cockpit2/gauges/indicators/ground_speed_kt',
      spd_bugs:     'sim/cockpit2/gauges/actuators/airspeed_bugs',
      acf_vso:      'sim/aircraft/view/acf_Vso',
      acf_vs:       'sim/aircraft/view/acf_Vs',
      acf_vfe:      'sim/aircraft/view/acf_Vfe',
      acf_vno:      'sim/aircraft/view/acf_Vno',
      acf_vne:      'sim/aircraft/view/acf_Vne',
      altitude:     'sim/cockpit2/gauges/indicators/altitude_ft_pilot',
      baro_hg:      'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
      alt_bug:      'sim/cockpit2/gauges/actuators/baro_altimeter_bug_ft_pilot',
      alt_alert:    'sim/cockpit2/gauges/indicators/baro_altimeter_alert_lit_pilot',
      ra_height:    'sim/cockpit2/gauges/indicators/radio_altimeter_height_ft_pilot',
      ra_dh:        'sim/cockpit2/gauges/indicators/radio_altimeter_dh_lit_pilot',
      vnav_alt:     'sim/cockpit2/autopilot/altitude_vnav_ft',
      vnav_status:  'sim/cockpit2/autopilot/vnav_status',
      pitch:        'sim/cockpit2/gauges/indicators/pitch_AHARS_deg_pilot',
      roll:         'sim/cockpit2/gauges/indicators/roll_AHARS_deg_pilot',
      slip:         'sim/cockpit2/gauges/indicators/slip_deg',
      fd_on:        'sim/cockpit2/autopilot/flight_director_command_bars_pilot',
      fd_pitch:     'sim/cockpit2/autopilot/flight_director_pitch_pilot',
      fd_roll:      'sim/cockpit2/autopilot/flight_director_roll_pilot',
      vvi:          'sim/cockpit2/gauges/indicators/vvi_fpm_pilot',
      ap_on:        'sim/cockpit2/autopilot/autopilot_on',
      fd_mode:      'sim/cockpit2/autopilot/flight_director_mode',
      lat_mode:     'sim/cockpit2/autopilot/heading_mode',
      vert_mode:    'sim/cockpit2/autopilot/altitude_mode',
      hnav_armed:   'sim/cockpit2/autopilot/hnav_armed',
      gs_armed:     'sim/cockpit2/autopilot/glideslope_armed',
      vnav_armed:   'sim/cockpit2/autopilot/vnav_armed',
      hdg_mag:      'sim/cockpit2/gauges/indicators/heading_AHARS_deg_mag_pilot',
      hdg_bug:      'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
      hsi_src:      'sim/cockpit2/radios/actuators/HSI_source_select_pilot',
      efis1_sel:    'sim/cockpit2/radios/actuators/EFIS_1_selection_pilot',
      nav1_hdef:    'sim/cockpit2/radios/indicators/nav1_hdef_dots_pilot',
      nav2_hdef:    'sim/cockpit2/radios/indicators/nav2_hdef_dots_pilot',
      gps_hdef:     'sim/cockpit/radios/gps_hdef_dot',
      nav1_fromto:  'sim/cockpit2/radios/indicators/nav1_flag_from_to_pilot',
      nav1_gs_flag: 'sim/cockpit2/radios/indicators/nav1_flag_glideslope',
      nav2_gs_flag: 'sim/cockpit2/radios/indicators/nav2_flag_glideslope',
      nav1_bearing: 'sim/cockpit2/radios/indicators/nav1_bearing_deg_mag',
      adf1_bearing: 'sim/cockpit2/radios/indicators/adf1_bearing_deg_mag',
      gps_bearing:  'sim/cockpit/radios/gps_bearing_deg_mag',
      gps_dme:      'sim/cockpit/radios/gps_dme_dist_m',
      xpdr_code:    'sim/cockpit2/radios/actuators/transponder_code',
      xpdr_mode:    'sim/cockpit2/radios/actuators/transponder_mode',
      xpdr_id:      'sim/cockpit2/radios/indicators/transponder_id',
      wind_hdg:     'sim/cockpit2/gauges/indicators/wind_heading_deg_mag',
      wind_kts:     'sim/cockpit2/gauges/indicators/wind_speed_kts',
      com1_act_mhz: 'sim/cockpit2/radios/actuators/com1_frequency_Mhz',
      com1_act_khz: 'sim/cockpit2/radios/actuators/com1_frequency_khz',
      com1_sby_mhz: 'sim/cockpit2/radios/actuators/com1_standby_frequency_Mhz',
      com1_sby_khz: 'sim/cockpit2/radios/actuators/com1_standby_frequency_khz',
      com2_act_mhz: 'sim/cockpit2/radios/actuators/com2_frequency_Mhz',
      com2_act_khz: 'sim/cockpit2/radios/actuators/com2_frequency_khz',
      com2_sby_mhz: 'sim/cockpit2/radios/actuators/com2_standby_frequency_Mhz',
      com2_sby_khz: 'sim/cockpit2/radios/actuators/com2_standby_frequency_khz',
      nav1_act_mhz: 'sim/cockpit2/radios/actuators/nav1_frequency_Mhz',
      nav1_act_khz: 'sim/cockpit2/radios/actuators/nav1_frequency_khz',
      nav1_sby_mhz: 'sim/cockpit2/radios/actuators/nav1_standby_frequency_Mhz',
      nav1_sby_khz: 'sim/cockpit2/radios/actuators/nav1_standby_frequency_khz',
      nav2_act_mhz: 'sim/cockpit2/radios/actuators/nav2_frequency_Mhz',
      nav2_act_khz: 'sim/cockpit2/radios/actuators/nav2_frequency_khz',
      nav2_sby_mhz: 'sim/cockpit2/radios/actuators/nav2_standby_frequency_Mhz',
      nav2_sby_khz: 'sim/cockpit2/radios/actuators/nav2_standby_frequency_khz',
    },
  }
  return map[type] || {}
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