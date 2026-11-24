import { BaseInstrument } from '../base.js'

export const DEFAULTS = {
  l_rpm_ndl: 'KA350/ianim/gauges/lPropRPM',
  r_rpm_ndl: 'KA350/ianim/gauges/rPropRPM'
}

export class KingAirPropRpmIndicator extends BaseInstrument {
  constructor(canvas, config = {}) {
    super(canvas, config)
    
    this._drefs = {
      l_ndl: config.dataref_l_ndl || DEFAULTS.l_rpm_ndl,
      r_ndl: config.dataref_r_ndl || DEFAULTS.r_rpm_ndl
    }

    this._tNdl1 = 0; this._tNdl2 = 0
    this._disp1 = 0; this._disp2 = 0
    this._hasData = false

    this._limits = {
      min: 0,
      greenStart: 1050,
      greenEnd: 1700,
      redLine: 1700,
      compressionBreak: 1300,
      max: 2000
    }

    this._rpmScaleFactor = 1000

    this._cachedFaceCanvas = document.createElement('canvas')
    this._cachedFaceCtx = null
    this._faceCacheValid = false
  }

  requiredDatarefs() {
    return Object.values(this._drefs)
  }

  update(state) {
    const ndl1 = state[this._drefs.l_ndl]
    const ndl2 = state[this._drefs.r_ndl]

    if (ndl1 == null || ndl2 == null) return
    this._hasData = true

    // Math.round() locks the targets directly to whole integers to eliminate microscopic needle jitter
    let rpm1 = Math.round(ndl1 * this._rpmScaleFactor)
    let rpm2 = Math.round(ndl2 * this._rpmScaleFactor)

    this._tNdl1 = Math.max(this._limits.min, Math.min(this._limits.max, rpm1))
    this._tNdl2 = Math.max(this._limits.min, Math.min(this._limits.max, rpm2))
    this._dirty = true
  }

  /**
   * Translates RPM into exact geometric canvas radians.
   * Clock System Reference: 12 o'clock is 0° clock, rotating clockwise (30° per hour).
   *  - 0 RPM starts strictly at 12 o'clock (0° clock position)
   *  - 1300 RPM hits exactly 130° clock position -> Compressed zone (130° total sweep)
   *  - 2000 RPM hits exactly 10 o'clock (300° clock position) -> Normal zone (170° total sweep)
   */
  _rpmToRad(rpm) {
    let clockDegrees = 0
    
    if (rpm <= 0) {
      clockDegrees = 0
    } else if (rpm <= this._limits.compressionBreak) {
      clockDegrees = (rpm / this._limits.compressionBreak) * 130
    } else {
      const normalProgress = (rpm - this._limits.compressionBreak) / (this._limits.max - this._limits.compressionBreak)
      clockDegrees = 130 + (normalProgress * 170)
    }
    
    let canvasDegrees = clockDegrees - 90
    return (canvasDegrees * Math.PI) / 180
  }

  _render() {
    const { w, h, ctx } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._disp1 = this._lerp(this._disp1, this._tNdl1, 0.12)
    this._disp2 = this._lerp(this._disp2, this._tNdl2, 0.12)
    this._dirty = Math.abs(this._disp1 - this._tNdl1) > 0.5 || Math.abs(this._disp2 - this._tNdl2) > 0.5

    this._drawBezel()

    const midX = w / 2
    const cx1 = midX / 2
    const cx2 = midX + (midX / 2)
    const cy = h / 2
    const R  = Math.min(midX, h) * 0.44

    if (!this._faceCacheValid || this._cachedFaceCanvas.width !== w || this._cachedFaceCanvas.height !== h) {
      this._cachedFaceCanvas.width = w
      this._cachedFaceCanvas.height = h
      this._cachedFaceCtx = this._cachedFaceCanvas.getContext('2d')
      
      // SOLID BACKDROP OVERRIDE MASK
      this._cachedFaceCtx.fillStyle = this._theme.digitalBg || '#121212'
      this._cachedFaceCtx.fillRect(0, 0, w, h)

      this._buildCachedDialFace(cx1, cy, R)
      this._buildCachedDialFace(cx2, cy, R)
      this._faceCacheValid = true
    }

    ctx.drawImage(this._cachedFaceCanvas, 0, 0)

    this._drawNeedle(cx1, cy, R, this._disp1)
    this._drawCentreCap(cx1, cy, R)

    this._drawNeedle(cx2, cy, R, this._disp2)
    this._drawCentreCap(cx2, cy, R)
  }


  _buildCachedDialFace(cx, cy, R) {
    const ctx = this._cachedFaceCtx
    const t = this._theme

    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = t.dialFace
    ctx.fill()

    ctx.save()
    ctx.lineWidth = R * 0.06
    ctx.lineCap = 'butt'
    ctx.strokeStyle = '#2d8a4e'
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.94, this._rpmToRad(this._limits.greenStart), this._rpmToRad(this._limits.greenEnd))
    ctx.stroke()
    ctx.restore()

    ctx.save()
    const outerAnchor = R * 0.98

    for (let r = 0; r <= this._limits.compressionBreak; r += 50) {
      const angle = this._rpmToRad(r)
      const isMajorMark = (r === 500 || r === 1000 || r === 1300)
      const is100Mark = (r % 100 === 0) && !isMajorMark

      let tickLength = R * 0.07
      ctx.lineWidth = 0.75
      ctx.strokeStyle = '#ffffff'

      if (isMajorMark) {
        tickLength = R * 0.14
        ctx.lineWidth = 2.0
      } else if (is100Mark) {
        tickLength = R * 0.10
        ctx.lineWidth = 1.5
      }

      const innerAnchor = outerAnchor - tickLength
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * outerAnchor, cy + Math.sin(angle) * outerAnchor)
      ctx.lineTo(cx + Math.cos(angle) * innerAnchor, cy + Math.sin(angle) * innerAnchor)
      ctx.stroke()
    }

    for (let r = 1350; r <= this._limits.max; r += 50) {
      const angle = this._rpmToRad(r)
      const isRedLine = (r === this._limits.redLine)
      const is100Mark = (r % 100 === 0)

      let tickLength = R * 0.07
      ctx.lineWidth = 0.75
      ctx.strokeStyle = '#ffffff'

      if (isRedLine) {
        tickLength = R * 0.18
        ctx.lineWidth = 3.5
        ctx.strokeStyle = t.alertColor
      } else if (is100Mark) {
        tickLength = R * 0.14
        ctx.lineWidth = 2.0
      } else {
        tickLength = R * 0.10
        ctx.lineWidth = 0.75
      }

      const innerAnchor = outerAnchor - tickLength
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * outerAnchor, cy + Math.sin(angle) * outerAnchor)
      ctx.lineTo(cx + Math.cos(angle) * innerAnchor, cy + Math.sin(angle) * innerAnchor)
      ctx.stroke()
    }
    ctx.restore()

    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const textRadius = R * 0.70
    ctx.font = `bold ${Math.max(14, R * 0.11)}px sans-serif`
    
    const markings = [500, 1000, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000]
    markings.forEach(r => {
      const angle = this._rpmToRad(r)
      const displayLabel = String(r / 100)
      ctx.fillText(displayLabel, cx + Math.cos(angle) * textRadius, cy + Math.sin(angle) * textRadius)
    })

    ctx.font = `bold ${Math.max(14, R * 0.11)}px sans-serif`
    ctx.fillText('PROP', cx, cy - R * 0.35)
    
    ctx.font = `bold ${Math.max(11, R * 0.10)}px sans-serif`
    ctx.fillText('RPM X 100', cx, cy + R * 0.35)
    ctx.restore()
  }

  _drawNeedle(cx, cy, R, val) {
    const { ctx } = this
    const angle = this._rpmToRad(val)

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)

    const thickness = R * 0.125
    ctx.fillStyle = '#ffffff'
    const tipRadius = (R * 0.94) - 5 

    ctx.beginPath()
    ctx.moveTo(R * 0.15, -thickness / 2)
    ctx.lineTo(R * 0.50, -thickness / 2)
    
    ctx.lineTo(tipRadius - 8, -R * 0.015)
    ctx.lineTo(tipRadius, 0)
    ctx.lineTo(tipRadius - 8, R * 0.015)
    
    ctx.lineTo(R * 0.50, thickness / 2)
    ctx.lineTo(R * 0.15, thickness / 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  _drawCentreCap(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.15, 0, Math.PI * 2)
    ctx.fillStyle = t.capFill
    ctx.fill()
    ctx.strokeStyle = t.capStroke
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }

  static getConfigurationSchema() {
    return {
      title: 'King Air Propeller RPM Indicator Row',
      slots: 2,
      datarefs: [
        { key: 'l_ndl', label: 'Left Prop RPM Dataref', type: 'string', default: DEFAULTS.l_rpm_ndl },
        { key: 'r_ndl', label: 'Right Prop RPM Dataref', type: 'string', default: DEFAULTS.r_rpm_ndl }
      ],
      settings: []
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_rpm',
  label:    'King Air Prop RPM',
  icon:     '⚙',
  order:    100,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
}
