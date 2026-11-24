import { BaseInstrument } from '../base.js'
import { writeDataref } from '../../xplane-api.js'

export const DEFAULTS = {
  EHSI_heading_deg:    'sim/cockpit2/gauges/indicators/heading_electric_deg_mag_pilot',
  EHSI_bug_deg:        'sim/cockpit/autopilot/heading_mag',
  EHSI_brightness:     'KA350/instruments/EADI/EADIdispOnX',
  EHSI_show_active_course: 'KA350/instruments/EHSI_Pilot/showActiveCourse',		// 0 none, 1 NAV1, 2 NAV2, 3 FMS1
  EHSI_show_pres_course: 'KA350/instruments/EHSI_Pilot/showPresCourse',			// 0 none, 1 NAV1, 2 NAV2, 3 FMS1
  EHSI_fms_type_flag: 'KA350/instruments/EHSI_Pilot/fmsTypeFlag',				// 0 FMS1 fail, 1 FMS1 green
  EHSI_nav1_type_flag: 'KA350/instruments/EHSI_Pilot/nav1TypeFlag',				// 0 VOR1 fail, 1 LOC1 fail, 2 VOR1 captured(green), 3 LOC1 green
  EHSI_nav2_type_flag: 'KA350/instruments/EHSI_Pilot/nav2TypeFlag',				// 0 VOR2 fail, 1 LOC2 fail, 2 VOR2 captured(green), 3 LOC2 green
  EHSI_course_nav1: 'sim/cockpit2/radios/actuators/nav1_obs_deg_mag_pilot', // Magnetic course (0-360 deg) drawn relative to compas roses north, independent of aircraft heading
  EHSI_course_nav2: 'sim/cockpit2/radios/actuators/nav2_obs_deg_mag_pilot', // Magnetic course (0-360 deg) drawn relative to compas roses north, independent of aircraft heading
  EHSI_course_fms:  'sim/cockpit/radios/gps_obs_degm',  // Magnetic course (0-360 deg) drawn relative to compas roses north for preselected FMS track
  EHSI_nav1_hdef:   'sim/cockpit/radios/nav1_hdef_dot', // full scale is 2.5 to -2.5
  EHSI_nav2_hdef: 'sim/cockpit/radios/nav2_hdef_dot', // full scale is 2.5 to -2.5
  EHSI_gps_hdef: 'sim/cockpit/radios/gps_hdef_dot', // full scale is 2.5 to -2.5
  EHSI_nav1_fromto:      'sim/cockpit/radios/nav1_fromto', // Active indicator mode for NAV1: 0 = OFF (hides flag), 1 = TO, 2 = FROM
  EHSI_nav2_fromto:      'sim/cockpit/radios/nav2_fromto', // Active indicator mode for NAV2: 0 = OFF (hides flag), 1 = TO, 2 = FROM
  EHSI_gps_fromto:       'sim/cockpit/radios/gps_fromto',   // Active indicator mode for FMS1/GPS: 0 = OFF (hides flag), 1 = TO, 2 = FROM
  EHSI_course_ctrl:      'KA350/instruments/EHSI_Pilot/CourseCTRL', // 0 = Active Course Focus, 1 = Preselect Course Focus
  EHSI_active_dme:       'sim/cockpit2/radios/indicators/hsi_dme_distance_nm_pilot', //show dme to current selected mode next waypoint
  EHSI_navid_gps:        'KA350/instruments/EHSI_Pilot/gpsNavId', // name of next waypoint
  EHSI_navid_nav1:       'sim/cockpit2/radios/indicators/nav1_nav_id',
  EHSI_navid_nav2:       'sim/cockpit2/radios/indicators/nav2_nav_id'
}




const DEG_TO_RAD = Math.PI / 180;

export class KingAirEHSI extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds
    this._ehsi_heading  = 0
    this._ehsi_bug      = 0
    this._ehsi_brightness = 1.0 
    this._dHeading = 0
    this._dBug     = 0
    this._hasData  = false
    this._btnActive = null
    this._syncFlash = 0
    
    // Navigation Flag & Mode State Tracking Variables
    this._activeCourseSource = 0 
    this._presCourseSource   = 0 
    this._fmsType            = 0 
    this._nav1Type           = 0 
    this._nav2Type           = 0 

    // Single-Source Course Values
    this._courseNav1         = 0
    this._courseNav2         = 0
    this._courseFms          = 0
    
    // Raw dot entries captured from simulator receivers
    this._nav1Hdef           = 0
    this._nav2Hdef           = 0
    this._gpsHdef            = 0

    // Hardware Signal Radio From-To Flag Status
    this._nav1FromTo         = 0
    this._nav2FromTo         = 0
    this._gpsFromTo          = 0
	
    this._courseCtrl         = 0
    
    // Top-Left Corner Readout State Variables
    this._roundedDme         = ""
    this._activeWaypointId   = ""

    // Bottom-Right Corner Readout State Variables
    this._roundedCrs         = ""
    this._crsColor           = "#00ff00"

    // Smoothed Deviation Tracking Variables
    this._dActiveDeviation   = 0
    this._dPresDeviation     = 0
    
    // Performance Cache: Offscreen canvas for the compass rose
    this._compassCache = null
    this._flagCache = null
    
    this._animFloor = config.animFloor || 0.04
    this._setupTouchButtons()
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (!state) return;
    
    // 1. CACHE CRITICAL FRAME ENTRIES
    const h = state[this._drefs.EHSI_heading_deg] 
    const b = state[this._drefs.EHSI_bug_deg]
    const br = state[this._drefs.EHSI_brightness] 
    const acSource = state[this._drefs.EHSI_show_active_course]
    const pcSource = state[this._drefs.EHSI_show_pres_course]
    const cCtrl    = state[this._drefs.EHSI_course_ctrl]
    
    let needsRedraw = false

    // 2. GLOBAL CONTROLLERS (Always evaluate and force redraw if changed)
    if (h != null && !isNaN(h) && h !== this._ehsi_heading) { this._ehsi_heading = h; this._hasData = true; needsRedraw = true } 
    if (b != null && !isNaN(b) && b !== this._ehsi_bug) { this._ehsi_bug = b; needsRedraw = true }
    if (br != null && !isNaN(br) && br !== this._ehsi_brightness) { this._ehsi_brightness = Math.max(0, Math.min(1, br)); needsRedraw = true }
    if (acSource != null && !isNaN(acSource) && acSource !== this._activeCourseSource) { this._activeCourseSource = acSource; needsRedraw = true }
    if (pcSource != null && !isNaN(pcSource) && pcSource !== this._presCourseSource) { this._presCourseSource = pcSource; needsRedraw = true }
    if (cCtrl != null && !isNaN(cCtrl) && cCtrl !== this._courseCtrl) { this._courseCtrl = cCtrl; needsRedraw = true }

    // 3. RESOURCE GATING (Evaluates data streams linked to active/preselect modes)
    const useNav1 = (this._activeCourseSource === 1 || this._presCourseSource === 1)
    const useNav2 = (this._activeCourseSource === 2 || this._presCourseSource === 2)
    const useFms  = (this._activeCourseSource === 3 || this._presCourseSource === 3)

    // --- NAV1 PIPELINE ---
    if (useNav1) {
      const n1T   = state[this._drefs.EHSI_nav1_type_flag]
      const cNav1 = state[this._drefs.EHSI_course_nav1]        
      const hNav1 = state[this._drefs.EHSI_nav1_hdef]
      const n1FT  = state[this._drefs.EHSI_nav1_fromto]
      
      if (n1T   != null && !isNaN(n1T)   && n1T   !== this._nav1Type)       { this._nav1Type = n1T;       needsRedraw = true }
      if (cNav1 != null && !isNaN(cNav1) && cNav1 !== this._courseNav1)     { this._courseNav1 = cNav1;   needsRedraw = true }
      if (hNav1 != null && !isNaN(hNav1) && hNav1 !== this._nav1Hdef)       { this._nav1Hdef = hNav1;     needsRedraw = true }
      if (n1FT  != null && !isNaN(n1FT)  && n1FT  !== this._nav1FromTo)     { this._nav1FromTo = n1FT;     needsRedraw = true }
    }

    // --- NAV2 PIPELINE ---
    if (useNav2) {
      const n2T   = state[this._drefs.EHSI_nav2_type_flag]
      const cNav2 = state[this._drefs.EHSI_course_nav2]        
      const hNav2 = state[this._drefs.EHSI_nav2_hdef]
      const n2FT  = state[this._drefs.EHSI_nav2_fromto]
      
      if (n2T   != null && !isNaN(n2T)   && n2T   !== this._nav2Type)       { this._nav2Type = n2T;       needsRedraw = true }
      if (cNav2 != null && !isNaN(cNav2) && cNav2 !== this._courseNav2)     { this._courseNav2 = cNav2;   needsRedraw = true }
      if (n2FT  != null && !isNaN(n2FT)  && n2FT  !== this._nav2FromTo)     { this._nav2FromTo = n2FT;     needsRedraw = true }
      
      if (hNav2 != null && !isNaN(hNav2)) {
        if (hNav2 !== this._nav2Hdef) {
          this._nav2Hdef = hNav2
          needsRedraw = true
        }
      }
    }

    // --- FMS / GPS PIPELINE ---
    if (useFms) {
      const fmsT  = state[this._drefs.EHSI_fms_type_flag]
      const cFms  = state[this._drefs.EHSI_course_fms]         
      const hGps  = state[this._drefs.EHSI_gps_hdef]
      const gFT   = state[this._drefs.EHSI_gps_fromto]
      
      if (fmsT  != null && !isNaN(fmsT)  && fmsT  !== this._fmsType)       { this._fmsType = fmsT;       needsRedraw = true }
      if (cFms  != null && !isNaN(cFms)  && cFms  !== this._courseFms)     { this._courseFms = cFms;     needsRedraw = true }
      if (hGps  != null && !isNaN(hGps)  && hGps  !== this._gpsHdef)       { this._gpsHdef = hGps;       needsRedraw = true }
      if (gFT   != null && !isNaN(gFT)   && gFT   !== this._gpsFromTo)      { this._gpsFromTo = gFT;      needsRedraw = true }
    }

    // --- TOP LEFT READOUTS PIPELINE ---
    let isActiveGreen = false
    if (this._activeCourseSource === 1 && this._nav1Type >= 2) isActiveGreen = true
    if (this._activeCourseSource === 2 && this._nav2Type >= 2) isActiveGreen = true
    if (this._activeCourseSource === 3 && this._fmsType === 1) isActiveGreen = true

    if (isActiveGreen) {
      const rawDme = state[this._drefs.EHSI_active_dme]
      if (rawDme != null && !isNaN(rawDme)) {
        const formattedDme = Number(rawDme).toFixed(1)
        if (formattedDme !== this._roundedDme) {
          this._roundedDme = formattedDme
          needsRedraw = true
        }
      }

      let rawWpData = null
      if (this._activeCourseSource === 1) rawWpData = state[this._drefs.EHSI_navid_nav1]
      else if (this._activeCourseSource === 2) rawWpData = state[this._drefs.EHSI_navid_nav2]
      else if (this._activeCourseSource === 3) rawWpData = state[this._drefs.EHSI_navid_gps]

      if (rawWpData != null) {
        let cleanedWpId = ""
        try {
          const rawStr = String(rawWpData).trim()
          const paddedB64 = rawStr.padEnd(rawStr.length + (4 - rawStr.length % 4) % 4, '=')
          const decodedStr = atob(paddedB64)
          cleanedWpId = decodedStr.split('\0')[0].trim()
        } catch (e) {
          cleanedWpId = String(rawWpData).split('\0')[0].trim()
        }

        if (cleanedWpId !== this._activeWaypointId) {
          this._activeWaypointId = cleanedWpId
          needsRedraw = true
        }
      }
    }

    // --- BOTTOM RIGHT READOUTS PIPELINE ---
    // Check which source channel is currently targeted by encoder focus state
    const targetSource = (this._courseCtrl === 0) ? this._activeCourseSource : this._presCourseSource
    
    // Visibility rule: must be a valid selected mode (> 0), regardless of red or green flag state
    if (targetSource > 0) {
      let rawCrs = 0
      if (targetSource === 1) rawCrs = this._courseNav1
      else if (targetSource === 2) rawCrs = this._courseNav2
      else if (targetSource === 3) rawCrs = this._courseFms

      // Round course to a full degree integer before checking dirty flag
      const formattedCrs = String(Math.round(((rawCrs % 360) + 360) % 360))
      if (formattedCrs !== this._roundedCrs) {
        this._roundedCrs = formattedCrs
        needsRedraw = true
      }

      // Assign coloring matching your layout requirements
      const targetColor = (this._courseCtrl === 0) ? "#00ff00" : "#007aff"
      if (targetColor !== this._crsColor) {
        this._crsColor = targetColor
        needsRedraw = true
      }
    }

    // 4. FINAL ASSIGNMENT
    if (needsRedraw) {
      this._dirty = true
    }
  }

  setResolvedIds(ids) { this._resolvedIds = ids }


  // On-screen controls (hidden when touch controls are switched off in the Panel Manager)
  _setupTouchButtons() {
    this.setTouchButtons([
      { id: 'hdg-', label: '− HDG', repeat: true, onPress: () => this._adjBug(-1) },
      { id: 'hdg+', label: 'HDG +', repeat: true, onPress: () => this._adjBug( 1) },
      { id: 'sync', label: 'SYNC',                onPress: () => this._syncGyro() },
      { id: 'crs-', label: '− CRS', repeat: true, onPress: () => this._adjCourse(-1) },
      { id: 'crs+', label: 'CRS +', repeat: true, onPress: () => this._adjCourse( 1) },
    ])
  }

  // Adjusts the course of the source the CRS knob currently controls (active or preselect).
  // A short-lived pending value lets hold-to-repeat step ahead of the sim echo.
  _adjCourse(delta) {
    const src = (this._courseCtrl === 0) ? this._activeCourseSource : this._presCourseSource
    const key = src === 1 ? 'EHSI_course_nav1' : src === 2 ? 'EHSI_course_nav2' : src === 3 ? 'EHSI_course_fms' : null
    if (!key) return
    const id = this._resolvedIds[this._drefs[key]]
    if (id == null) return
    const confirmed = src === 1 ? this._courseNav1 : src === 2 ? this._courseNav2 : this._courseFms
    const p = this._crsPending
    const base = (p && p.src === src && Date.now() - p.t < 400) ? p.val : confirmed
    const val = ((Math.round(base) + delta) % 360 + 360) % 360
    this._crsPending = { src, val, t: Date.now() }
    writeDataref(id, val).catch(() => {})
  }

  _adjBug(delta) {
    this._ehsi_bug = ((this._ehsi_bug + delta) % 360 + 360) % 360 
    this._dirty = true
    const id = this._resolvedIds[this._drefs.EHSI_bug_deg]
    if (id != null) writeDataref(id, this._ehsi_bug).catch(() => {})
  }

  _syncGyro() {
    const heading = this._ehsi_heading 
    this._ehsi_bug = heading
    const id = this._resolvedIds[this._drefs.EHSI_bug_deg]
    if (id != null) writeDataref(id, heading).catch(() => {})
    this._syncFlash = Date.now()
    this._dirty = true
  }
  
  _resolveActiveFlags() {
    // Safety check: if flag cache hasn't been compiled yet, let lazy loading handle it during draw
    if (!this._flagCache) {
      this._activeFlagImg = null
      this._presFlagImg = null
      return
    }

    // --- Resolve Active Flag ---
    if (this._activeCourseSource > 0 && this._flagCache[this._activeCourseSource]) {
      let isGreen = false
      if (this._activeCourseSource === 1)      isGreen = (this._nav1Type >= 2)
      else if (this._activeCourseSource === 2) isGreen = (this._nav2Type >= 2)
      else if (this._activeCourseSource === 3) isGreen = (this._fmsType === 1)

      const imgData = this._flagCache[this._activeCourseSource][isGreen ? 'green' : 'red']
      if (imgData) {
        this._activeFlagImg = imgData.canvas
        this._activeFlagW   = imgData.w / 2
        this._activeFlagH   = imgData.h / 2
      } else {
        this._activeFlagImg = null
      }
    } else {
      this._activeFlagImg = null
    }

    // --- Resolve Preselect Flag ---
    if (this._presCourseSource > 0 && this._flagCache[this._presCourseSource]) {
      let isGreen = false
      if (this._presCourseSource === 1)      isGreen = (this._nav1Type >= 2)
      else if (this._presCourseSource === 2) isGreen = (this._nav2Type >= 2)
      else if (this._presCourseSource === 3) isGreen = (this._fmsType === 1)

      const imgData = this._flagCache[this._presCourseSource][isGreen ? 'green' : 'red']
      if (imgData) {
        this._presFlagImg = imgData.canvas
        this._presFlagW   = imgData.w / 2
        this._presFlagH   = imgData.h / 2
      } else {
        this._presFlagImg = null
      }
    } else {
      this._presFlagImg = null
    }
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    ctx.clearRect(0, 0, w, h)
    if (this._ehsi_brightness <= 0) return
    if (!this._hasData) { this._drawNoData(); return }

    ctx.save()
    ctx.globalAlpha = this._ehsi_brightness
    this.cx = w / 2
    this.cy = h / 2
    this.R  = Math.min(w, h) * 0.37 || 1
    
    // Core pipeline state checks (Pre-populate default targets to avoid early loop breaks)
    const activeTargetDev = this._arrowState ? this._arrowState.active.deviation : 0
    const presTargetDev = this._arrowState ? this._arrowState.pres.deviation : 0

    // Update canvas dirty threshold logic to include needle movement vectors
    this._dirty    = Math.abs(this._dHeading - this._ehsi_heading) > 0.02
                  || Math.abs(this._dBug - this._ehsi_bug) > 0.02
                  || Math.abs(this._dActiveDeviation - activeTargetDev) > 0.005
                  || Math.abs(this._dPresDeviation - presTargetDev) > 0.005

    ctx.save()
    ctx.beginPath()
    const frameW = Math.min(w, h) * 0.94            
    const frameH = Math.min(w, h) * 0.84            
    const frameCornerRadius = Math.min(w, h) * 0.11 
    ctx.roundRect(this.cx - frameW / 2, this.cy - frameH / 2, frameW, frameH, frameCornerRadius)
    ctx.clip()
	
    this._drawBezelMarkings()
    ctx.restore() 

    this._drawBug()
    this._drawCompassCard()

    // =========================================================================
    // CORE PIPELINE PARSING (CONVERTS RAW REFILLING DOTS TO NORMALIZED FRACTIONS)
    // =========================================================================
    this._arrowState = {
      active: { heading: 0, isValid: false, fromTo: 0, deviation: 0 },
      pres:   { heading: 0, isValid: false, deviation: 0 }
    }

    // Resolve Active Channel Metrics
    if (this._activeCourseSource === 1) {
      this._arrowState.active.heading   = this._courseNav1
      this._arrowState.active.isValid   = (this._nav1Type >= 2)
      this._arrowState.active.fromTo    = this._nav1FromTo
      this._arrowState.active.deviation = this._nav1Hdef / 2.5  
    } else if (this._activeCourseSource === 2) {
      this._arrowState.active.heading   = this._courseNav2
      this._arrowState.active.isValid   = (this._nav2Type >= 2)
      this._arrowState.active.fromTo    = this._nav2FromTo
      this._arrowState.active.deviation = this._nav2Hdef / 2.5
    } else if (this._activeCourseSource === 3) {
      this._arrowState.active.heading   = this._courseFms
      this._arrowState.active.isValid   = (this._fmsType === 1)
      this._arrowState.active.fromTo    = this._gpsFromTo
      this._arrowState.active.deviation = this._gpsHdef / 2.5
    }

    // Resolve Preselect Channel Metrics
    if (this._presCourseSource === 1) {
      this._arrowState.pres.heading   = this._courseNav1
      this._arrowState.pres.isValid   = (this._nav1Type >= 2)
      this._arrowState.pres.deviation = this._nav1Hdef / 2.5
    } else if (this._presCourseSource === 2) {
      this._arrowState.pres.heading   = this._courseNav2
      this._arrowState.pres.isValid   = (this._nav2Type >= 2)
      this._arrowState.pres.deviation = this._nav2Hdef / 2.5
    } else if (this._presCourseSource === 3) {
      this._arrowState.pres.heading   = this._courseFms
      this._arrowState.pres.isValid   = (this._fmsType === 1)
      this._arrowState.pres.deviation = this._gpsHdef / 2.5
    }

    // Apply the exact same Linear Interpolation tracking logic to the needle positions
    if (isNaN(this._dActiveDeviation)) this._dActiveDeviation = 0
    if (isNaN(this._dPresDeviation)) this._dPresDeviation = 0

    this._dActiveDeviation += (this._arrowState.active.deviation - this._dActiveDeviation) * 0.08
    this._dPresDeviation   += (this._arrowState.pres.deviation - this._dPresDeviation) * 0.08
    // =========================================================================

    this._drawPreselectNeedle()
    this._drawDeviationScale()
    this._drawActiveCourseNeedle()
    this._drawAircraftSymbol()
    this._drawAnnunciators()
    
    ctx.restore() 
  }

  _drawBezelMarkings() {
    const { ctx, cx, cy, R } = this
    ctx.save()
    ctx.translate(cx, cy)

    const triangleTrack = R * 0.88    
    const lineTrack = R * 0.90        
    
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.75

    for (let deg = 0; deg < 360; deg += 45) {
      const angle = deg * DEG_TO_RAD - Math.PI / 2
      
      ctx.save()
      ctx.rotate(angle + Math.PI / 2)
      
      if (deg === 0 || deg % 90 !== 0) {
        const baseHalfW = R * 0.045
        const triHeight = R * 0.06
        
        ctx.beginPath()
        ctx.moveTo(0, -triangleTrack)                     
        ctx.lineTo(-baseHalfW, -triangleTrack - triHeight) 
        ctx.lineTo(baseHalfW, -triangleTrack - triHeight)  
        ctx.closePath()
        ctx.stroke()
      } else {
        ctx.lineWidth = 2.0
        ctx.beginPath()
        ctx.moveTo(0, -lineTrack)
        ctx.lineTo(0, -lineTrack - R * 0.08)
        ctx.stroke()
      }
      
      ctx.restore()
    }

    ctx.restore()
  }
  
  _drawBug() {
    const nextBug = this._lerpAngle(this._dBug, this._ehsi_bug, 0.08)
    this._dBug = ((nextBug % 360) + 360) % 360

    const { ctx, cx, cy, R } = this
    const relAngle = (this._dBug - this._dHeading) * DEG_TO_RAD
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(relAngle)
    
    ctx.strokeStyle = '#ff007f'
    ctx.lineWidth = 3
    
    const trackRadius = R * 0.88
    const boxW = R * 0.05
    const boxH = R * 0.05
    const gapHalfWidth = R * 0.012 
    
    ctx.strokeRect(-gapHalfWidth - boxW, -trackRadius, boxW, -boxH)
    ctx.strokeRect(gapHalfWidth, -trackRadius, boxW, -boxH)
    
    ctx.restore()
  }

  _generateCompassCache(R) {
    const size = Math.ceil(R * 2) + 20
    const cacheCanvas = document.createElement('canvas')
    cacheCanvas.width = size
    cacheCanvas.height = size
    
    const ctx = cacheCanvas.getContext('2d')
    const ccx = size / 2
    const ccy = size / 2

    ctx.save()
    ctx.translate(ccx, ccy)

    const fs = Math.max(9, R * 0.13)
    ctx.font = `${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const tickOuter = R * 0.86        
    const textRadius = R * 0.66       

    ctx.strokeStyle = '#ffffff'
    ctx.fillStyle = '#ffffff'

    // Minor ticks (5-degree increments)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let deg = 5; deg < 360; deg += 5) {
      if (deg % 10 === 0) continue
      const angle = deg * DEG_TO_RAD - Math.PI / 2
      ctx.moveTo(Math.cos(angle) * tickOuter, Math.sin(angle) * tickOuter)
      ctx.lineTo(Math.cos(angle) * (tickOuter - R * 0.04), Math.sin(angle) * (tickOuter - R * 0.04))
    }
    ctx.stroke()

    // Major ticks (10-degree increments)
    ctx.lineWidth = 2.0
    ctx.beginPath()
    for (let deg = 0; deg < 360; deg += 10) {
      const isMajor = deg % 30 === 0
      const len = isMajor ? R * 0.10 : R * 0.06
      const angle = deg * DEG_TO_RAD - Math.PI / 2
      
      ctx.moveTo(Math.cos(angle) * tickOuter, Math.sin(angle) * tickOuter)
      ctx.lineTo(Math.cos(angle) * (tickOuter - len), Math.sin(angle) * (tickOuter - len))
    }
    ctx.stroke()

    const cardinals = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }

    for (let deg = 0; deg < 360; deg += 30) {
      const angle = deg * DEG_TO_RAD - Math.PI / 2
      
      ctx.save()
      ctx.translate(Math.cos(angle) * textRadius, Math.sin(angle) * textRadius)
      ctx.rotate(angle + Math.PI / 2)
      ctx.fillStyle = '#ffffff'

      if (cardinals[deg] !== undefined) {
        ctx.fillText(cardinals[deg], 0, 0)
      } else {
        ctx.fillText(String(deg / 10), 0, 0)
      }
      ctx.restore()
    }

    ctx.restore()
    
    this._compassCache = {
      canvas: cacheCanvas,
      radius: R,
      size: size
    }
  }
  
  _drawCompassCard() {
    const nextHeading = this._lerpAngle(this._dHeading, this._ehsi_heading, 0.08)
    this._dHeading = ((nextHeading % 360) + 360) % 360

    if (!this._compassCache || this._compassCache.radius !== this.R) {
      this._generateCompassCache(this.R)
    }

    const { ctx, cx, cy, _compassCache: cache } = this
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-this._dHeading * DEG_TO_RAD)
    ctx.drawImage(cache.canvas, -cache.size / 2, -cache.size / 2)
    ctx.restore()
  }

  _drawPreselectNeedle() {
    if (!this._presCourseSource) return

    const { ctx, cx, cy, R } = this
    ctx.save()
    ctx.translate(cx, cy)
    
    const courseAngleRad = (this._arrowState.pres.heading - this._dHeading) * DEG_TO_RAD
    ctx.rotate(courseAngleRad)

    ctx.strokeStyle = '#007aff'
    ctx.fillStyle = '#007aff'
    ctx.lineWidth = 2.0

    const arrowTip        = R * 0.76
    const arrowBase       = R * 0.52   
    const fixedShaftTop   = R * 0.38   
    const fixedShaftBot   = R * 0.38   
    const sideW           = R * 0.05
    const railOffset      = R * 0.028

    // 1. DRAW ARROWHEAD 
    ctx.beginPath()
    ctx.moveTo(0, -arrowTip)
    ctx.lineTo(-sideW, -arrowBase)
    ctx.lineTo(0, -arrowBase) 
    ctx.lineTo(sideW, -arrowBase)
    ctx.closePath()
    ctx.stroke()

    // 2. DRAW DOUBLE UPPER SHAFT SECTIONS
    ctx.beginPath()
    ctx.moveTo(-railOffset, -arrowBase)
    ctx.lineTo(-railOffset, -fixedShaftTop)
    ctx.moveTo(railOffset, -arrowBase)
    ctx.lineTo(railOffset, -fixedShaftTop)
    ctx.stroke()

    // 4. DRAW STRIPED TRAILING TAIL 
    ctx.beginPath()
    ctx.moveTo(-railOffset, fixedShaftBot)
    ctx.lineTo(-railOffset, R * 0.525)
    ctx.moveTo(railOffset, fixedShaftBot)
    ctx.lineTo(railOffset, R * 0.525)

    ctx.moveTo(-railOffset, R * 0.545)
    ctx.lineTo(-railOffset, R * 0.69)
    ctx.moveTo(railOffset, R * 0.545)
    ctx.lineTo(railOffset, R * 0.69)
    ctx.stroke()

    // 5. DRAW DYNAMIC STRIPED CENTER DEVIATION BAR (Smoothed via Lerp)
    if (this._arrowState.pres.isValid) {
      ctx.save()
      
      // Slides right through the gap footprint based on the dampening parameter
      const lateralShiftX = this._dPresDeviation * (R * 0.44)
      ctx.translate(lateralShiftX, 0)

      ctx.beginPath()
      ctx.moveTo(-railOffset, -fixedShaftTop)
      ctx.lineTo(-railOffset, -R * 0.205)
      ctx.moveTo(railOffset, -fixedShaftTop)
      ctx.lineTo(railOffset, -R * 0.205)

      ctx.moveTo(-railOffset, -R * 0.185)
      ctx.lineTo(-railOffset, -R * 0.01)
      ctx.moveTo(railOffset, -R * 0.185)
      ctx.lineTo(railOffset, -R * 0.01)

      ctx.moveTo(-railOffset, R * 0.01)
      ctx.lineTo(-railOffset, R * 0.185)
      ctx.moveTo(railOffset, R * 0.01)
      ctx.lineTo(railOffset, R * 0.185)

      ctx.moveTo(-railOffset, R * 0.205)
      ctx.lineTo(-railOffset, fixedShaftBot)
      ctx.moveTo(railOffset, R * 0.205)
      ctx.lineTo(railOffset, fixedShaftBot)
      
      ctx.stroke()
      ctx.restore()
    }

    ctx.restore()
  }


  _drawDeviationScale() {
    if (!this._activeCourseSource) return

    const { ctx, cx, cy, R } = this
    ctx.save()

    ctx.translate(cx, cy)
    const courseAngleRad = (this._arrowState.active.heading - this._dHeading) * DEG_TO_RAD
    ctx.rotate(courseAngleRad)

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    
    // Your exact validated dot layout distance configuration
    const dotSpacing = R * 0.22
    const squareHalfSize = R * 0.0216 

    const drawDiamond = (offsetX) => {
      ctx.save()
      ctx.translate(offsetX, 0)
      ctx.rotate(Math.PI / 4) 
      ctx.strokeRect(-squareHalfSize, -squareHalfSize, squareHalfSize * 2, squareHalfSize * 2)
      ctx.restore()
    }

    drawDiamond(-dotSpacing * 2) 
    drawDiamond(-dotSpacing)     
    drawDiamond(dotSpacing)      
    drawDiamond(dotSpacing * 2)  

    ctx.restore()
  }


  _drawActiveCourseNeedle() {
    if (!this._activeCourseSource) return

    const { ctx, cx, cy, R } = this
    ctx.save()
    ctx.translate(cx, cy)
    
    const courseAngleRad = (this._arrowState.active.heading - this._dHeading) * DEG_TO_RAD
    ctx.rotate(courseAngleRad)

    ctx.strokeStyle = '#00ff00'
    ctx.fillStyle = '#00ff00'
    ctx.lineWidth = 2.0

    const arrowTip        = R * 0.76
    const arrowBase       = R * 0.52   
    const fixedShaftTop   = R * 0.38   
    const fixedShaftBot   = R * 0.38   
    const tailStart       = R * 0.62   
    const tailEnd         = R * 0.82
    const sideW           = R * 0.05
    
    // 1. DRAW ARROWHEAD
    ctx.beginPath()
    ctx.moveTo(0, -arrowTip)
    ctx.lineTo(-sideW, -arrowBase)
    ctx.lineTo(0, -arrowBase) 
    ctx.lineTo(sideW, -arrowBase)
    ctx.closePath()
    ctx.stroke()

    // 2. DRAW FIXED UPPER SHAFT SECTION
    ctx.beginPath()
    ctx.moveTo(0, -arrowBase)
    ctx.lineTo(0, -fixedShaftTop)
    ctx.stroke()

    // 3. DRAW ORIGINAL NEEDLE TRAILING TAIL
    ctx.beginPath()
    ctx.moveTo(0, tailStart)
    ctx.lineTo(0, tailEnd)
    ctx.stroke()

    // 4. DRAW FIXED LOWER SHAFT SECTION
    ctx.beginPath()
    ctx.moveTo(0, tailStart)
    ctx.lineTo(0, fixedShaftBot)
    ctx.stroke()

    // 5. DRAW THE HOLLOW TO/FROM FLAG TRIANGLE
    if (this._arrowState.active.isValid && this._arrowState.active.fromTo > 0) {
      const flagSize = R * 0.09 
      
      ctx.beginPath()
      if (this._arrowState.active.fromTo === 1) {
        const tipY = -fixedShaftTop
        ctx.moveTo(0, tipY)
        ctx.lineTo(-flagSize, tipY + flagSize * 2)
        ctx.lineTo(flagSize, tipY + flagSize * 2)
      } else if (this._arrowState.active.fromTo === 2) {
        const baseY = -fixedShaftTop
        ctx.moveTo(0, baseY + flagSize * 2)
        ctx.lineTo(-flagSize, baseY)
        ctx.lineTo(flagSize, baseY)
      }
      ctx.closePath()
      ctx.stroke() 
    }

    // 6. DRAW DYNAMIC CENTER DEVIATION BAR (Smoothed via Lerp)
    if (this._arrowState.active.isValid) {
      ctx.save()
      // Slides cleanly across the horizontal tracking footprint using the dampened parameter vector
      const lateralShiftX = this._dActiveDeviation * (R * 0.44)
      ctx.translate(lateralShiftX, 0)

      ctx.beginPath()
      ctx.moveTo(0, -fixedShaftTop)
      ctx.lineTo(0, fixedShaftBot)
      ctx.stroke()
      ctx.restore()
    }

    ctx.restore()
  }


  _drawAircraftSymbol() {
    const { ctx, cx, cy, R } = this
    ctx.save()
    ctx.translate(cx, cy)

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.75
    
    // Base unit calculated directly from your existing main wings half-width (2 units total)
    const crossSize = R * 0.16
    const unit = crossSize / 2

    // Relative Multipliers Applied Symmetrically:
    // Center Upwards: 1.5 units  -> unit * 1.5
    // Main Wings L/R: 2.0 units  -> unit * 2.0 (matches crossSize)
    // Fuselage Down:  2.5 units  -> unit * 2.5
    // Tail placement: 2.0 down   -> unit * 2.0
    // Tail wing L/R:  0.7 units  -> unit * 0.7
    const noseY       = unit * 1.5
    const wingX       = crossSize
    const fuselageY   = unit * 2.5
    const tailY       = unit * 1.9
    const tailWingX   = unit * 0.7

    // --- Main Wings & Fuselage ---
    ctx.beginPath()
    // Horizontal main wings line (Left to Right)
    ctx.moveTo(-wingX, 0)
    ctx.lineTo(wingX, 0)
    
    // Vertical fuselage line (Nose to Center)
    ctx.moveTo(0, -noseY)
    ctx.lineTo(0, 0)
    
    // Vertical fuselage line (Center to Tail base)
    ctx.moveTo(0, 0)
    ctx.lineTo(0, fuselageY) 
    ctx.stroke()

    // --- Tail Wings ---
    ctx.beginPath()
    // Horizontal tail wings line drawn symmetrically at the 2.0 unit aft mark
    ctx.moveTo(-tailWingX, tailY)
    ctx.lineTo(tailWingX, tailY)
    ctx.stroke()

    ctx.restore()
  }


  _generateFlagCache(R) {
    const fontSize = Math.max(9, R * 0.117)
    // Updated to match your EADI blue hex color selection (#007aff)
    const colors = { green: '#00ff00', red: '#ff0000', blue: '#007aff' }
    
    this._flagCache = {}

    // A flat array of all distinct labels required by the cockpit systems
    const labelsToCache = ['VOR1', 'LOC1', 'VOR2', 'LOC2', 'FMS1']

    for (const textStr of labelsToCache) {
      this._flagCache[textStr] = {}

      for (const [colorKey, colorHex] of Object.entries(colors)) {
        const cacheCanvas = document.createElement('canvas')
        const ctx = cacheCanvas.getContext('2d')

		ctx.font = `${fontSize}px "Noto Sans Display", "Liberation Sans", sans-serif-condensed, sans-serif`




        
        const charW = ctx.measureText('M').width
        const boxW = Math.ceil(charW + R * 0.05)
        const boxH = Math.ceil((fontSize * textStr.length) + R * 0.03)

        cacheCanvas.width = boxW + 4  
        cacheCanvas.height = boxH + 4

        ctx.save()
        ctx.translate(cacheCanvas.width / 2, cacheCanvas.height / 2)
        ctx.font = `${fontSize}px "Noto Sans Display", "Liberation Sans", sans-serif-condensed, sans-serif`



        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 1.5
        ctx.fillStyle = colorHex
        ctx.strokeStyle = colorHex

        // ONLY THE RED FLAGS GET A BOX AROUND
        if (colorKey === 'red') {
          ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH)
        }

        for (let i = 0; i < textStr.length; i++) {
          const charY = -boxH / 2 + (R * 0.015) + (i * fontSize) + (fontSize / 2)
          ctx.fillText(textStr[i], 0, charY)
        }

        ctx.restore()

        this._flagCache[textStr][colorKey] = {
          canvas: cacheCanvas,
          w: cacheCanvas.width,
          h: cacheCanvas.height
        }
      }
    }
  }


  _drawAnnunciators() {
    const { ctx, cx, cy, R, w, h } = this
    
    if (!this._flagCache || this._flagCache.radius !== R) {
      this._generateFlagCache(R)
      this._flagCache.radius = R
    }

    // =========================================================================
    // TOP LEFT CORNER READOUTS
    // =========================================================================
    let isActiveGreen = false
    if (this._activeCourseSource === 1 && this._nav1Type >= 2) isActiveGreen = true
    if (this._activeCourseSource === 2 && this._nav2Type >= 2) isActiveGreen = true
    if (this._activeCourseSource === 3 && this._fmsType === 1) isActiveGreen = true

    if (isActiveGreen) {
      ctx.save()
      
      const startX = cx - Math.min(w, h) * 0.44
      const startY = cy - Math.min(w, h) * 0.38
      
      const line1Spacing = Math.max(9, R * 0.11)
      const line2Spacing = Math.max(11, R * 0.15)
      
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#00ff00'

      // Line 1: DIST text marking
      const fsLine1 = Math.max(9, R * 0.11)
      ctx.font = `${fsLine1}px "Noto Sans Display", "Liberation Sans", sans-serif-condensed, sans-serif`
      ctx.fillText("DIST", startX, startY)

      // Line 2: Single-decimal Rounded DME Readout
      const fsLine2 = Math.max(12, R * 0.15)
      ctx.font = `${fsLine2}px "Noto Sans Display", "Liberation Sans", sans-serif-condensed, sans-serif`
      ctx.fillText(this._roundedDme, startX, startY + line1Spacing)

      // Line 3: Sanitized Waypoint Identifier String
      const fsLine3 = Math.max(9, R * 0.11)
      ctx.font = `${fsLine3}px "Noto Sans Display", "Liberation Sans", sans-serif-condensed, sans-serif`
      ctx.fillText(this._activeWaypointId, startX, startY + line1Spacing + line2Spacing)

      ctx.restore()
    }

    // =========================================================================
    // BOTTOM RIGHT CORNER READOUTS
    // =========================================================================
    const currentCrsSource = (this._courseCtrl === 0) ? this._activeCourseSource : this._presCourseSource
    
    if (currentCrsSource > 0) {
      ctx.save()
      
      // Calculate flush-right layout metrics within bezel boundaries
      const endX = cx + Math.min(w, h) * 0.44
      const startY = cy + Math.min(w, h) * 0.24 
      
      const crsLine1Spacing = Math.max(8, R * 0.10) // Tighter spacing for the smaller font
      
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillStyle = this._crsColor // Green (#00ff00) or Blue (#007aff)

      // Resolve dynamic label text based on encoder focus mode selection
      const labelText = (this._courseCtrl === 0) ? "CRS" : "PRE"

      // Line 1: Dynamic text marking (Shifted down exactly one font size step from top-left)
      const fsCrsLine1 = Math.max(8, R * 0.10)
      ctx.font = `${fsCrsLine1}px "Noto Sans Display", "Liberation Sans", sans-serif-condensed, sans-serif`
      ctx.fillText(labelText, endX, startY)

      // Line 2: Rounded Full-Degree Integer Course Value
      const fsCrsLine2 = Math.max(12, R * 0.15)
      ctx.font = `${fsCrsLine2}px "Noto Sans Display", "Liberation Sans", sans-serif-condensed, sans-serif`
      
      // Pads the course layout text with clean leading zeros (e.g. "045")
      const formattedCrsText = this._roundedCrs.padStart(3, '0')
      ctx.fillText(formattedCrsText, endX, startY + crsLine1Spacing)

      ctx.restore()
    }

    // =========================================================================
    // LOCATION 1: LEFT MODE COLUMN (Pre-rendered Active & Preselect Status Flags)
    // =========================================================================
    const activeFlagCenterY = cy - R * 0.27
    const presFlagCenterY   = cy + R * 0.27
    const flagCenterX       = cx - R * 1.08
    const indicatorGapX     = cx - R * 0.935
    
    let targetCircleY = null
    let circleColor   = '#00ff00'
    let currentFocusedSource = 0

    // --- Draw Active Flag ---
    if (this._activeCourseSource > 0) {
      let labelText = ''
      let isGreen = false

      if (this._activeCourseSource === 1) {
        labelText = (this._nav1Type === 1 || this._nav1Type === 3) ? 'LOC1' : 'VOR1'
        isGreen = (this._nav1Type >= 2)
      } else if (this._activeCourseSource === 2) {
        labelText = (this._nav2Type === 1 || this._nav2Type === 3) ? 'LOC2' : 'VOR2'
        isGreen = (this._nav2Type >= 2)
      } else if (this._activeCourseSource === 3) {
        labelText = 'FMS1'
        isGreen = (this._fmsType === 1)
      }

      const colorKey = isGreen ? 'green' : 'red'
      const imgData = this._flagCache[labelText]?.[colorKey]

      if (imgData) {
        ctx.save()
        ctx.drawImage(imgData.canvas, flagCenterX - imgData.w / 2, activeFlagCenterY - imgData.h / 2)
        ctx.restore()
        
        if (this._courseCtrl === 0) {
          targetCircleY = activeFlagCenterY
          circleColor   = '#00ff00'
          currentFocusedSource = this._activeCourseSource
        }
      }
    }

    // --- Draw Preselect Flag ---
    if (this._presCourseSource > 0) {
      let labelText = ''
      let isValid = false

      if (this._presCourseSource === 1) {
        labelText = (this._nav1Type === 1 || this._nav1Type === 3) ? 'LOC1' : 'VOR1'
        isValid = (this._nav1Type >= 2)
      } else if (this._presCourseSource === 2) {
        labelText = (this._nav2Type === 1 || this._nav2Type === 3) ? 'LOC2' : 'VOR2'
        isValid = (this._nav2Type >= 2)
      } else if (this._presCourseSource === 3) {
        labelText = 'FMS1'
        isValid = (this._fmsType === 1)
      }

      const colorKey = isValid ? 'blue' : 'red'
      const imgData = this._flagCache[labelText]?.[colorKey]

      if (imgData) {
        ctx.save()
        ctx.drawImage(imgData.canvas, flagCenterX - imgData.w / 2, presFlagCenterY - imgData.h / 2)
        ctx.restore()
        
        if (this._courseCtrl === 1) {
          targetCircleY = presFlagCenterY
          circleColor   = '#007aff'
          currentFocusedSource = this._presCourseSource
        }
      }
    }

    // =========================================================================
    // DYNAMIC ENCODER MODE SELECTION RING
    // =========================================================================
    if (targetCircleY !== null && currentFocusedSource !== 3) {
      ctx.save()
      ctx.strokeStyle = circleColor
      ctx.lineWidth = 1.75
      
      const indicatorRadius = R * 0.04
      
      ctx.beginPath()
      ctx.arc(indicatorGapX, targetCircleY, indicatorRadius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }


  _lerpAngle(current, target, factor) {
    if (isNaN(current)) current = 0;
    if (isNaN(target)) target = 0;
    let diff = target - current
    while (diff >  180) diff -= 360
    while (diff < -180) diff += 360
    return current + diff * factor
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_ehsi',
  label:    'King Air EHSI',
  icon:     '🧭',
  order:    40,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
  touchControls: true,
}
