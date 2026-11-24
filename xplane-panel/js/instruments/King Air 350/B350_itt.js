import { BaseInstrument } from '../base.js'

export const DEFAULTS = {
  l_itt_ndl: 'KA350/ianim/gauges/lEngITT',
  r_itt_ndl: 'KA350/ianim/gauges/rEngITT'
}

export class KingAirITTIndicator extends BaseInstrument {
  constructor(canvas, config = {}) {
    super(canvas, config)
    
    this._drefs = {
      l_ndl: config.dataref_l_ndl || DEFAULTS.l_itt_ndl,
      r_ndl: config.dataref_r_ndl || DEFAULTS.r_itt_ndl
    }

    this._tNdl1 = 200; this._tNdl2 = 200 
    this._disp1 = 200; this._disp2 = 200
    this._hasData = false

    this._limits = {
      min: 200,
      greenStart: 400,
      greenEnd: 815,
      redLine1: 820,
      redLine2: 1000,
      max: 1200
    }

    // 1000x multiplier mapping raw float ratios safely to absolute ITT degrees
    this._ittScaleFactor = 1000

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

    // Math.round() locks the targets directly to whole integers to eliminate pointer jitter
    let itt1 = Math.round(ndl1 * this._ittScaleFactor)
    let itt2 = Math.round(ndl2 * this._ittScaleFactor)

    this._tNdl1 = Math.max(this._limits.min, Math.min(this._limits.max, itt1))
    this._tNdl2 = Math.max(this._limits.min, Math.min(this._limits.max, itt2))
    this._dirty = true
  }

  /**
   * Translates a raw Celsius temperature input into accurate visual radians.
   * Compression Profile:
   *  - 200°C sits squarely at 3 o'clock (0° canvas radians)
   *  - 400°C sits squarely at 4 o'clock (30° canvas radians) -> Compressed (30° total visual area)
   *  - 600°C sits squarely at 6 o'clock (90° canvas radians) -> Semi-compressed (60° total area)
   *  - 1000°C sits squarely at 12 o'clock (270° canvas radians) -> Base uncompressed (180° total area)
   *  - 1200°C sits squarely at 1 o'clock (300° canvas radians) -> Compressed (30° terminal window)
   */
  _celsiusToRad(celsius) {
    let canvasDegrees = 0
    
    if (celsius <= 200) {
      canvasDegrees = 0
    } else if (celsius <= 400) {
      canvasDegrees = ((celsius - 200) / 200) * 30
    } else if (celsius <= 600) {
      canvasDegrees = 30 + ((celsius - 400) / 200) * 60
    } else if (celsius <= 1000) {
      canvasDegrees = 90 + ((celsius - 600) / 400) * 180
    } else {
      canvasDegrees = 270 + ((celsius - 1000) / 200) * 30
    }
    
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
    ctx.arc(cx, cy, R * 0.94, this._celsiusToRad(this._limits.greenStart), this._celsiusToRad(this._limits.greenEnd))
    ctx.stroke()
    ctx.restore()

    ctx.save()
    const outerAnchor = R * 0.98

    for (let c = this._limits.min; c <= this._limits.max; c += 20) {
      const angle = this._celsiusToRad(c)
      
      const isRed1 = (c === this._limits.redLine1)
      const isRed2 = (c === this._limits.redLine2)
      const isMajorMark = (c === 200 || c === 400 || c === 600 || c === 800 || c === 1000 || c === 1200)
      const is100Mark = (c % 100 === 0) && !isMajorMark

      let tickLength = R * 0.07
      ctx.lineWidth = 1.0
      ctx.strokeStyle = '#ffffff'

      if (isRed1 || isRed2) {
        tickLength = isRed1 ? R * 0.18 : R * 0.12
        ctx.lineWidth = isRed1 ? 3.5 : 2.5
        ctx.strokeStyle = t.alertColor
      } else if (isMajorMark) {
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
    ctx.restore()

    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const textRadius = R * 0.70
    ctx.font = `bold ${Math.max(14, R * 0.11)}px sans-serif`
    //ctx.font = `bold ${Math.max(9, R * 0.11)}px sans-serif`
    
    const markings = [200, 400, 500, 600, 700, 800, 900, 1000, 1200]
    markings.forEach(c => {
      const angle = this._celsiusToRad(c)
      const displayLabel = String(c / 100)
      ctx.fillText(displayLabel, cx + Math.cos(angle) * textRadius, cy + Math.sin(angle) * textRadius)
    })

    ctx.font = `bold ${Math.max(14, R * 0.11)}px sans-serif`
    ctx.fillText('ITT', cx, cy - R * 0.35)
    
    ctx.font = `bold ${Math.max(13, R * 0.10)}px sans-serif`
    ctx.fillText('°C X 100', cx, cy + R * 0.35)
    ctx.restore()
  }

  _drawNeedle(cx, cy, R, val) {
    const { ctx } = this
    const angle = this._celsiusToRad(val)

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
      title: 'King Air ITT Indicator Row',
      slots: 2,
      datarefs: [
        { key: 'l_ndl', label: 'Left ITT Dataref', type: 'string', default: DEFAULTS.l_itt_ndl },
        { key: 'r_ndl', label: 'Right ITT Dataref', type: 'string', default: DEFAULTS.r_itt_ndl }
      ],
      settings: []
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_itt',
  label:    'King Air ITT',
  icon:     '🌡',
  order:    80,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
}
