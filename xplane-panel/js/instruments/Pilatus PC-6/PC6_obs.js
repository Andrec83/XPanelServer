import { BaseInstrument } from '../base.js'
import { writeDataref } from '../../xplane-api.js'

const NAV_DREFS = [
  {
    obs:        'sim/cockpit2/radios/actuators/nav1_obs_deg_mag_pilot',

    fromto:     'sim/cockpit/radios/nav1_fromto',
    gs_flag:    'sim/cockpit2/radios/indicators/nav1_flag_glideslope_mech', 

    hsi_source: 'sim/cockpit2/radios/actuators/HSI_source_select_pilot',
    hdef:       'sim/cockpit/radios/nav1_hdef_dot',
    vdef:       'sim/cockpit/radios/nav1_vdef_dot',
    gps_hdef:   'sim/cockpit/radios/gps_hdef_dot',
    gps_vdef:   'sim/cockpit/radios/gps_vdef_dot' 
  },
  {
    obs:        'sim/cockpit2/radios/actuators/nav2_obs_deg_mag_pilot',
    hdef:       'sim/cockpit2/radios/indicators/nav2_hdef_dots_pilot',
    fromto:     'sim/cockpit2/radios/indicators/nav2_flag_from_to_pilot',
    gs_flag:    'sim/cockpit2/radios/indicators/nav2_flag_glideslope_mech', 
    vdef:       'sim/cockpit2/radios/indicators/nav2_vdef_dots_pilot',
    hsi_source: 'sim/cockpit2/radios/actuators/HSI_source_select_copilot',
    gps_hdef:   'sim/cockpit/radios/gps2_hdef_dot2', // Unified key name!
    gps_vdef:   'sim/cockpit/radios/gps2_vdef_dot2'  // Unified key name!
  },
]

export const DEFAULTS = {
  nav1_obs:        NAV_DREFS[0].obs,
  nav1_hdef:       NAV_DREFS[0].hdef,
  nav1_fromto:     NAV_DREFS[0].fromto,
  nav1_gs_flag:    NAV_DREFS[0].gs_flag,
  nav1_vdef:       NAV_DREFS[0].vdef,
  nav1_hsi_source: NAV_DREFS[0].hsi_source,
  nav1_gps_hdef:   NAV_DREFS[0].gps_hdef,
  nav1_gps_vdef:   NAV_DREFS[0].gps_vdef,

  nav2_obs:        NAV_DREFS[1].obs,
  nav2_hdef:       NAV_DREFS[1].hdef,
  nav2_fromto:     NAV_DREFS[1].fromto,
  nav2_gs_flag:    NAV_DREFS[1].gs_flag,
  nav2_vdef:       NAV_DREFS[1].vdef,
  nav2_hsi_source: NAV_DREFS[1].hsi_source,
  nav2_gps_hdef:   NAV_DREFS[1].gps_hdef, // Clean prefix matching
  nav2_gps_vdef:   NAV_DREFS[1].gps_vdef, // Clean prefix matching
}



const COMPASS_LABELS = ['N','3','6','E','12','15','S','21','24','W','30','33']

export class PC6OBS extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._resolvedIds = resolvedIds
    this._navIdx  = config.navIndex ?? 0
    const pfx     = this._navIdx === 0 ? 'nav1' : 'nav2'
    this._drefs   = { ...DEFAULTS, ...datarefs }
    this._k = {
      obs:        `${pfx}_obs`,
      hdef:       `${pfx}_hdef`,
      fromto:     `${pfx}_fromto`,
      gs_flag:    `${pfx}_gs_flag`,
      vdef:       `${pfx}_vdef`,
      hsi_source: `${pfx}_hsi_source`,
      gps_hdef:   `${pfx}_gps_hdef`,
      gps_vdef:   `${pfx}_gps_vdef`,
    }
    this._obs    = 0
    this._hdef   = 0
    this._vdef   = 0
    this._fromto = 0    
    this._gsFlag = 1    
    this._hasData   = false
    this._dObs   = 0
    this._dHdef  = 0
    this._dVdef  = 0
    this._hsiSource = 0 
    this._btnActive = null
    this._setupTouchButtons()
  }



  setResolvedIds(ids) { this._resolvedIds = ids }
  requiredDatarefs() { return Object.values(this._drefs) }
  
  // On-screen controls (hidden when touch controls are switched off in the Panel Manager)
  _setupTouchButtons() {
    this.setTouchButtons([
      { id: 'obs-', label: '− OBS', repeat: true, onPress: () => this._adjOBS(-1) },
      { id: 'obs+', label: 'OBS +', repeat: true, onPress: () => this._adjOBS( 1) },
    ])
  }

  _adjOBS(delta) {
    this._obs = ((this._obs + delta) % 360 + 360) % 360
    this._dirty = true
    const id = this._resolvedIds[this._drefs[this._k.obs]]
    if (id != null) writeDataref(id, this._obs).catch(() => {})
  }

  update(state) {
    const obs    = state[this._drefs[this._k.obs]]
    const hdef   = state[this._drefs[this._k.hdef]]
    const fromto = state[this._drefs[this._k.fromto]]
    const gs_flag = state[this._drefs[this._k.gs_flag]]
    const vdef   = state[this._drefs[this._k.vdef]]
    const hsi_source = state[this._drefs[this._k.hsi_source]]
    const gps_hdef = state[this._drefs[this._k.gps_hdef]] // <- Grab raw GPS horizontal data
    const gps_vdef = state[this._drefs[this._k.gps_vdef]] // <- Grab raw GPS vertical data

    if (obs    != null) { this._obs    = obs;    this._hasData = true }
    if (fromto != null)   this._fromto = fromto
    if (gs_flag != null)  this._gsFlag = gs_flag  
    if (hsi_source != null) this._hsiSource = hsi_source

    // Evaluate HSI source condition (0,1 = NAV mode || 2,3 = GPS mode)
    const isGpsSourced = (parseInt(this._hsiSource, 10) || 0) >= 2

    // Dynamically assign deflections based on active pilot source
    const targetHdef = isGpsSourced ? gps_hdef : hdef
    const targetVdef = isGpsSourced ? gps_vdef : vdef

    if (targetHdef != null) this._hdef = targetHdef
    if (targetVdef != null) this._vdef = targetVdef

    this._dirty = true
  }

  get _isGpsSourced() {
    return (parseInt(this._hsiSource, 10) || 0) >= 2
  }

  _render() {
    if (!this._hasData) { this._drawNoData(); return }

    this._dObs  = this._lerpAngle(this._dObs,  this._obs,  0.14)
    this._dHdef = this._lerp(this._dHdef, this._hdef, 0.10)
    this._dVdef = this._lerp(this._dVdef, this._vdef, 0.10)
    
    // FIXED: Keeps the instrument dirty if it was forced by update() OR if needles are moving
    this._dirty = this._dirty 
              || Math.abs(this._dObs - this._obs) > 0.01
              || Math.abs(this._dHdef - this._hdef) > 0.005
              || Math.abs(this._dVdef - this._vdef) > 0.005

    const { ctx, w, h } = this
    const cx = w / 2, cy = h / 2
    const R  = Math.min(w, h) * 0.44

    this._drawBezel()

    // 1. Open and establish the outer clipping boundary context
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = this._theme.dialFace
    ctx.fill()
    ctx.strokeStyle = this._theme.dialRim
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.clip() 
    
    // 2. Pass A: Static instrument elements
    ctx.save()
    this._drawStationaryFace(cx, cy, R)
    this._drawToFrom(cx, cy, R)
    this._drawNavLabel(cx, cy, R)
    this._drawCap(cx, cy, R)
    ctx.restore()

    // 3. Pass B: Dynamic data lines inside the center mask
    ctx.save()
    this._CDIMask(cx, cy, R) 
    this._drawCDI(cx, cy, R) 
    this._drawGS(cx, cy, R)
    ctx.restore()

    // 4. Pass C: Rotating heading dial
    ctx.save()
    this._drawCompassFace(cx, cy, R)
    ctx.restore()

    // 5. Safely close out the main instrument clipping context
    ctx.restore() 
  }


  _CDIMask(cx, cy, R) {
    const { ctx } = this
    const tickStartRadius = R * 0.72
    ctx.beginPath()
    ctx.arc(cx, cy, tickStartRadius, 0, Math.PI * 2)
    ctx.clip()
  }


  _drawStationaryFace(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    const tickStartRadius = R * 0.72 

    ctx.save()
    ctx.translate(cx, cy) // Center coordinates on the physical center spindle axis

    // Re-proportioning standard equilateral triangle parameters
    const triSide = R * 0.08
    const triHeight = triSide * (Math.sqrt(3) / 2)
    ctx.fillStyle = '#ffcc00'

    // 1. Top Fixed Reference Triangle: Tip sits flush on inner circle edge pointing directly DOWN
    ctx.beginPath()
    ctx.moveTo(0, -tickStartRadius)
    ctx.lineTo(-triSide / 2, -(tickStartRadius - triHeight))
    ctx.lineTo(triSide / 2,  -(tickStartRadius - triHeight)) 
    ctx.closePath()
    ctx.fill()

    // 2. Bottom Fixed Reference Triangle: Tip sits flush on inner circle edge pointing directly UP
    ctx.beginPath()
    ctx.moveTo(0, tickStartRadius)
    ctx.lineTo(-triSide / 2, tickStartRadius - triHeight)
    ctx.lineTo(triSide / 2,  tickStartRadius - triHeight)
    ctx.closePath()
    ctx.fill()

    // 3. FIXED 5-DOT HORIZONTAL SCALE: 5 tracking dots spaced safely within the inner circle limits
    // Uses 5.5 divisions to guarantee the 5th dot has structural breathing room away from the outer ring
    const hDotSpacing = tickStartRadius / 5.5 
    const innerDotR = R * 0.02
    ctx.fillStyle = '#ffffff'

    // Left tracking scale dots (-1 to -5)
    ctx.beginPath(); ctx.arc(-1 * hDotSpacing, 0, innerDotR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(-2 * hDotSpacing, 0, innerDotR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(-3 * hDotSpacing, 0, innerDotR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(-4 * hDotSpacing, 0, innerDotR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(-5 * hDotSpacing, 0, innerDotR, 0, Math.PI * 2); ctx.fill()

    // Right tracking scale dots (+1 to +5)
    ctx.beginPath(); ctx.arc(1 * hDotSpacing, 0, innerDotR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(2 * hDotSpacing, 0, innerDotR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(3 * hDotSpacing, 0, innerDotR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(4 * hDotSpacing, 0, innerDotR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(5 * hDotSpacing, 0, innerDotR, 0, Math.PI * 2); ctx.fill()

    // 4. Stationary Vertical Scale: 5 clean horizontal glideslope hash lines sticking out
    const vHashSpacing = tickStartRadius / 5.5
    const hashHalfWidth = R * 0.04
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5

    // Top vertical scale hashes (above center axis)
    for (let i = 1; i <= 5; i++) {
      const y = -i * vHashSpacing
      ctx.beginPath(); ctx.moveTo(-hashHalfWidth, y); ctx.lineTo(hashHalfWidth, y); ctx.stroke()
    }
    // Bottom vertical scale hashes (below center axis)
    for (let i = 1; i <= 5; i++) {
      const y = i * vHashSpacing
      ctx.beginPath(); ctx.moveTo(-hashHalfWidth, y); ctx.lineTo(hashHalfWidth, y); ctx.stroke()
    }

    ctx.restore()
  }

  _drawCDI(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    
    const tickStartRadius = R * 0.72
    const hDotSpacing = tickStartRadius / 5.5
    const trackTop = cy - R * 0.55
    const trackBot = cy + R * 0.55

    ctx.save()

    // Center vertical reference line (dashed faint background guide)
    ctx.strokeStyle = t.divider
    ctx.lineWidth = 1
    ctx.setLineDash([R * 0.04, R * 0.04])
    ctx.beginPath()
    ctx.moveTo(cx, trackTop); ctx.lineTo(cx, trackBot)
    ctx.stroke()
    ctx.setLineDash([])

    // Center static horizontal miniature target reference bar
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(1.5, R * 0.020)
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.06, cy); ctx.lineTo(cx + R * 0.06, cy)
    ctx.stroke()

    // ALWAYS track the smoothed memory variable (_dHdef) so it cannot snap
    const offsetX = Math.max(-5.0, Math.min(5.0, this._dHdef / 0.5)) * hDotSpacing
    const needleX = cx + offsetX

    ctx.strokeStyle = '#ffffff' 
    ctx.lineWidth = Math.max(2, R * 0.025)
    ctx.lineCap = 'round'
    
    ctx.beginPath()
    ctx.moveTo(needleX, trackTop)
    ctx.lineTo(needleX, trackBot)
    ctx.stroke()
    ctx.lineCap = 'butt'

    ctx.restore()
  }

  _drawCompassFace(cx, cy, R) {
    const { ctx } = this
    const t = this._theme

    ctx.save()
    // Rotating compass ring — selected OBS course rises to 12 o'clock
    ctx.translate(cx, cy)
    ctx.rotate(-this._dObs * Math.PI / 180)

    const fs    = Math.max(10, R * 0.15)
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const textRadius = R * 0.90      // Text labels sit right against the outer bezel wall
    const tickStartRadius = R * 0.72 // Base inner circle where all rotating ticks align flush

    // Pass 1: Draw ONLY the 12 Major Headings that have text labels (Short & Thick)
    for (let i = 0; i < 12; i++) {
      const deg   = i * 30
      const angle = deg * Math.PI / 180 - Math.PI / 2
      const len   = R * 0.04 
      ctx.strokeStyle = t.needle
      ctx.lineWidth = 3.2
      
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * tickStartRadius, Math.sin(angle) * tickStartRadius)
      ctx.lineTo(Math.cos(angle) * (tickStartRadius + len), Math.sin(angle) * (tickStartRadius + len))
      ctx.stroke()
      
      ctx.save()
      ctx.translate(Math.cos(angle) * textRadius, Math.sin(angle) * textRadius)
      ctx.rotate(angle + Math.PI / 2) 
      ctx.fillStyle = deg === 0 ? '#f44444' : t.needle
      ctx.fillText(COMPASS_LABELS[i], 0, 0)
      ctx.restore()
    }

    // Pass 2: Draw all remaining blank 10-degree lines (Long & Medium-Thick)
    for (let deg = 10; deg < 360; deg += 10) {
      if (deg % 30 === 0) continue 
      const angle = deg * Math.PI / 180 - Math.PI / 2
      const len = R * 0.12 
      ctx.strokeStyle = t.needle
      ctx.lineWidth = 1.8
      
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * tickStartRadius, Math.sin(angle) * tickStartRadius)
      ctx.lineTo(Math.cos(angle) * (tickStartRadius + len), Math.sin(angle) * (tickStartRadius + len))
      ctx.stroke()
    }

    // Pass 3: Draw all intermediate 5-degree lines (Half-length of the long lines & Thin)
    for (let deg = 5; deg < 360; deg += 10) {
      const angle = deg * Math.PI / 180 - Math.PI / 2
      const len = R * 0.08 
      ctx.strokeStyle = t.needle
      ctx.lineWidth = 1.2
      
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * tickStartRadius, Math.sin(angle) * tickStartRadius)
      ctx.lineTo(Math.cos(angle) * (tickStartRadius + len), Math.sin(angle) * (tickStartRadius + len))
      ctx.stroke()
    }

    ctx.restore() // End rotating compass face translations safely
  }


  _drawToFrom(cx, cy, R) {
    const { ctx } = this
    ctx.save()

    // 1. Position calculation (Raised to clear the bottom triangle)
    const tickStartRadius = R * 0.72
    const fw = R * 0.24
    const fh = R * 0.11
    const wx = cx - fw / 2
    const wy = cy + tickStartRadius - fh - (R * 0.14) 

    // 2. Draw mechanical window cutout backdrop block (CRISP RECTANGLE)
    ctx.fillStyle = '#0f0f0f' 
    ctx.fillRect(wx, wy, fw, fh)
    
    // Clip drawing operations strictly inside this rectangular window boundary
    ctx.beginPath()
    ctx.rect(wx, wy, fw, fh)
    ctx.clip()

    if (this._fromto === 0) {
      // --- OFF STATE: Red/White Striped Flag with "NAV" ---
      ctx.strokeStyle = '#d93838' 
      ctx.lineWidth = R * 0.025

      for (let i = -4; i <= 8; i++) {
        ctx.beginPath()
        ctx.moveTo(wx + i * R * 0.05, wy - R * 0.02)
        ctx.lineTo(wx + i * R * 0.05 - R * 0.10, wy + fh + R * 0.02)
        ctx.stroke()
      }

      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${Math.max(7, R * 0.08)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('NAV', wx + fw / 2, wy + fh / 2)

    } else {
      // --- SIGNAL ACTIVE: Full-width Arrows with Flat Cut-off Points ---
      ctx.fillStyle = '#ffffff'
      
      // Control how wide the flat cut-off tips are
      const flatTipWidth = fw * 0.22 

      if (this._fromto === 1) {
        // TO State: Arrow pointing UP (Flat top, wide base clipped at the window sides)
        ctx.beginPath()
        ctx.moveTo(wx + fw / 2 - flatTipWidth / 2, wy)          // Top-Left of the flat tip
        ctx.lineTo(wx + fw / 2 + flatTipWidth / 2, wy)          // Top-Right of the flat tip
        ctx.lineTo(wx + fw,                        wy + fh)      // Bottom-Right corner
        ctx.lineTo(wx,                             wy + fh)      // Bottom-Left corner
        ctx.closePath()
        ctx.fill()
      } else if (this._fromto === 2) {
        // FROM State: Arrow pointing DOWN (Flat bottom, wide base clipped at the window sides)
        ctx.beginPath()
        ctx.moveTo(wx,                             wy)          // Top-Left corner
        ctx.lineTo(wx + fw,                        wy)          // Top-Right corner
        ctx.lineTo(wx + fw / 2 + flatTipWidth / 2, wy + fh)      // Bottom-Right of the flat tip
        ctx.lineTo(wx + fw / 2 - flatTipWidth / 2, wy + fh)      // Bottom-Left of the flat tip
        ctx.closePath()
        ctx.fill()
      }
    }

    ctx.restore()
  }



  _drawNavLabel(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    
    ctx.translate(cx, cy)

    const fw = R * 0.24
    const fh = R * 0.11
    const lx = -R * 0.22 - fw 
    const ly = -R * 0.44      

    ctx.fillStyle = '#0f0f0f'
    ctx.fillRect(lx, ly, fw, fh)

    ctx.beginPath()
    ctx.rect(lx, ly, fw, fh)
    ctx.clip()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(8, R * 0.095)}px sans-serif`

    const textX = lx + fw / 2
    const textY = ly + fh / 2 + 0.5

    if (this._isGpsSourced) {
      ctx.fillStyle = '#00ff44' // Neon green
      ctx.fillText('GPS', textX, textY)
    } else {
      ctx.fillStyle = '#ff6600' // Vintage aviation orange
      ctx.fillText('NAV', textX, textY)
    }

    ctx.restore()
  }


  _drawGS(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    const gsWarningActive = Number(this._gsFlag) > 0

    const tickStartRadius = R * 0.72
    const vHashSpacing = tickStartRadius / 5.5
    
    const needleLeftBound = cx - R * 0.50
    const needleRightBound = cx + R * 0.50

    ctx.save()
    
    // ALWAYS track the smoothed vertical memory variable (_dVdef) so it cannot snap
    const offsetY = Math.max(-5.0, Math.min(5.0, this._dVdef / 0.5)) * vHashSpacing
    const needleY = cy + offsetY

    ctx.strokeStyle = '#ffffff' 
    ctx.lineWidth = Math.max(2.0, R * 0.022)
    ctx.lineCap = 'round'
    
    ctx.beginPath()
    ctx.moveTo(needleLeftBound, needleY)
    ctx.lineTo(needleRightBound, needleY)
    ctx.stroke()
    ctx.restore()
    ctx.lineCap = 'butt'

    if (gsWarningActive) {
      ctx.save()
      const fx = cx + R * 0.22, fy = cy - R * 0.16 
      const fw = R * 0.24,  fh = R * 0.11

      ctx.fillStyle = '#111111'
      ctx.fillRect(fx, fy, fw, fh)

      ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip()
      ctx.strokeStyle = '#d93838'
      ctx.lineWidth = R * 0.025

      for (let i = -4; i <= 8; i++) {
        ctx.beginPath()
        ctx.moveTo(fx + i * R * 0.05, fy - R * 0.02)
        ctx.lineTo(fx + i * R * 0.05 - R * 0.10, fy + fh + R * 0.02)
        ctx.stroke()
      }

      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${Math.max(7, R * 0.08)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('GS', fx + fw / 2, fy + fh / 2)
      ctx.restore()
    }
  }

  _drawCap(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.045, 0, Math.PI * 2)
    ctx.fillStyle = t.capFill
    ctx.fill()
    ctx.strokeStyle = t.capStroke
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  _lerpAngle(current, target, factor) {
    let diff = target - current
    while (diff >  180) diff -= 360
    while (diff < -180) diff += 360
    return current + diff * factor
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'pc6_obs',
  label:    'PC-6 OBS / CDI',
  icon:     '🧭',
  order:    60,
  datarefs: DEFAULTS,
  select: 'nav',
  touchControls: true,
}
