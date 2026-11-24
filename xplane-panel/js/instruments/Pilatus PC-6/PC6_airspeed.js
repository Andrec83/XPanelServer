import { BaseInstrument } from '../base.js'

// ── CUSTOM AIRCRAFT CALIBRATION ──────────────────────────────────────────
// Modify these hardcoded values directly when swapping aircraft configurations.
const AIRCRAFT_SPEEDS = {
  vs0:    52,  // White arc start (Stall Speed Full Flaps)
  vfe:    95,  // White arc end (Max Flaps Extended Speed)
  vs1:    56,  // Green arc start (Stall Speed Clean)
  vno:   119,  // Green arc end / Yellow start (Max Structural Cruise)
  vne:   151,  // Red line location (Never Exceed Speed)
  maxKts: 180  // Dial Faceplate Limit (Total layout ceiling)
}

export const DEFAULTS = {
  kias: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
}

export class PC6Airspeed extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._kias = 0
    this._displayKias = 0
    this._hasData = false
    this._limits = { ...AIRCRAFT_SPEEDS }
  }

  // Deactivated to ensure changes are driven exclusively by the constants at the top
  setAircraftProfile(profile) {}
  setSpeedLimits(limits) {}

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    const v = state[this._drefs.kias]
    if (v == null) return
    this._hasData = true
    this._kias = Math.max(0, Math.min(this._limits.maxKts, v))
    this._dirty = true
  }

  _ktsToRad(kts) {
    const ZERO_KTS_ANGLE = -90 
    let degreesOffset = 0

    if (kts <= 40) {
      degreesOffset = (kts / 40) * 30
    } else if (kts <= 120) {
      degreesOffset = 30 + ((kts - 40) / 80) * 210
    } else {
      const remainingKts = this._limits.maxKts - 120
      degreesOffset = 240 + ((kts - 120) / remainingKts) * 105
    }

    return ((ZERO_KTS_ANGLE + degreesOffset) * Math.PI) / 180
  }

  _render() {
    const { w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._displayKias = this._lerp(this._displayKias, this._kias, 0.08)
    this._dirty = Math.abs(this._displayKias - this._kias) > 0.05

    const cx = w / 2, cy = h / 2
    const R  = Math.min(w, h) * 0.44

    this._drawBezel()
    this._drawDial(cx, cy, R)
    this._drawNeedle(cx, cy, R, this._displayKias)
    this._drawCentreCap(cx, cy, R)
  }

  _drawDial(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    
    // Protect the parent global canvas context from property bleeding
    ctx.save()

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = t.dialFace
    ctx.fill()
    ctx.strokeStyle = t.dialRim
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()

    const { vs0, vfe, vs1, vno, vne } = this._limits

    // ── Upper Text Titles ───────────────────────────────────────────────────
    ctx.save()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    ctx.font = `${Math.max(5, R * 0.065)}px sans-serif`
    ctx.fillText('AIRSPEED', cx, cy - R * 0.35)
    
    ctx.font = `bold ${Math.max(9, R * 0.135)}px sans-serif`
    ctx.fillText('KNOTS', cx, cy - R * 0.18)

    // ── Lower Text Version Tracking (Bumped to v1.9) ────────────────────────
    //ctx.fillStyle = this._theme.labelDim || '#666'
    //ctx.font = `${Math.max(5, R * 0.075)}px sans-serif`
    //ctx.fillText('v1.9', cx, cy + R * 0.35)
    ctx.restore()

    // ── Layer 1: Outer Color Arcs (Green & Yellow with separation gap) ─────
    ctx.save()
    ctx.lineCap = 'butt'

    // Green Operating Arc
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.92, this._ktsToRad(vs1), this._ktsToRad(vno))
    ctx.strokeStyle = '#0c4'
    ctx.lineWidth = R * 0.06
    ctx.stroke()

    // Yellow Caution Arc (Starts 2.5 degrees later to provide a clean safety gap)
    const gapRad = (2.5 * Math.PI) / 180
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.92, this._ktsToRad(vno) + gapRad, this._ktsToRad(vne))
    ctx.strokeStyle = '#fa0'
    ctx.lineWidth = R * 0.06
    ctx.stroke()
    ctx.restore()

    // ── Layer 2: Marking Ticks ────────────────────────────────────────────
    ctx.save()
    ctx.strokeStyle = t.needle
    ctx.lineWidth = 1

    for (let kts = 20; kts <= this._limits.maxKts; kts += 5) {
      if (kts > 120 && kts % 10 !== 0) continue 
      
      const angle = this._ktsToRad(kts)
      const is10Kt = kts % 10 === 0
      
      const outerAnchor = R * 0.89 
      const tickLength = is10Kt ? R * 0.11 : R * 0.06
      const innerAnchor = outerAnchor - tickLength
      
      ctx.lineWidth = is10Kt ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * outerAnchor, cy + Math.sin(angle) * outerAnchor)
      ctx.lineTo(cx + Math.cos(angle) * innerAnchor, cy + Math.sin(angle) * innerAnchor)
      ctx.stroke()
    }
    ctx.restore()

    // ── Layer 3: White Flaps Arc (Inward Layer) ───────────────────────────
    ctx.save()
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.77, this._ktsToRad(vs0), this._ktsToRad(vfe))
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = R * 0.04
    ctx.stroke()
    ctx.restore()

    // ── Layer 4: High Priority Vne Overwriting Redline (Tamed and Thinned) ──
    ctx.save()
    ctx.lineCap = 'square'
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.88, this._ktsToRad(vne - 0.4), this._ktsToRad(vne + 0.4))
    ctx.strokeStyle = '#f00'
    ctx.lineWidth = R * 0.065
    ctx.stroke()
    ctx.restore()

    // ── Layer 5: Most Inward Written Speeds ────────────────────────────────
    ctx.save()
    ctx.fillStyle = t.needle
    ctx.font = `${Math.max(8, R * 0.11)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let kts = 20; kts <= this._limits.maxKts; kts += 5) {
      const isMajorText = kts % 20 === 0 || kts === 40 || kts === 100 || kts === 140 || kts === this._limits.maxKts
      if (!isMajorText) continue

      const angle = this._ktsToRad(kts)
      const textRadius = R * 0.63 
      ctx.fillText(String(kts), cx + Math.cos(angle) * textRadius, cy + Math.sin(angle) * textRadius)
    }
    ctx.restore()
    
    // Clean escape ensuring context properties are reset
    ctx.restore()
  }

  _drawNeedle(cx, cy, R, kias) {
    const { ctx } = this
    const angle = this._ktsToRad(kias)

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    
    const thickness = R * 0.025
    ctx.beginPath()
    ctx.moveTo(-R * 0.08, -thickness)
    ctx.lineTo(R * 0.68,  -thickness) // UPDATED: Pushed out from 0.62 to 0.68
    ctx.lineTo(R * 0.79,  0)          // UPDATED: Needle tip pushed out from 0.72 to 0.79 (10% longer)
    ctx.lineTo(R * 0.68,   thickness)  // UPDATED: Pushed out from 0.62 to 0.68
    ctx.lineTo(-R * 0.08,  thickness)
    ctx.closePath()
    
    ctx.fillStyle = this._theme.needle
    ctx.fill()
    ctx.restore()
  }


  _drawCentreCap(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.06, 0, Math.PI * 2)
    ctx.fillStyle = t.capFill
    ctx.fill()
    ctx.strokeStyle = t.capStroke
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  static getConfigurationSchema() {
    return {
      title: 'Airspeed Indicator',
      slots: 2, 
      datarefs: [
        { key: 'kias', label: 'Airspeed Dataref', type: 'string', default: DEFAULTS.kias }
      ],
      settings: []
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'pc6_airspeed',
  label:    'PC-6 Airspeed',
  icon:     '⏱',
  order:    10,
  datarefs: DEFAULTS,
}
