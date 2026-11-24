import { BaseInstrument } from '../base.js'

export const DEFAULTS = {
  l_ff_ndl: 'KA350/ianim/gauges/lFuelFlow',
  r_ff_ndl: 'KA350/ianim/gauges/rFuelFlow'
}

export class KingAirFuelFlowIndicator extends BaseInstrument {
  constructor(canvas, config = {}) {
    super(canvas, config)
    
    this._drefs = {
      l_ndl: config.dataref_l_ndl || DEFAULTS.l_ff_ndl,
      r_ndl: config.dataref_r_ndl || DEFAULTS.r_ff_ndl
    }

    this._tNdl1 = 0; this._tNdl2 = 0
    this._disp1 = 0; this._disp2 = 0
    this._hasData = false

    // Real aircraft scale limits fixed back down to max 80 (800 PPH)
    this._limits = {
      min: 0,
      max: 80 
    }

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

    // Stripped completely down to raw input multiplied strictly by 100
    let targetValue1 = ndl1 * 100.0
    let targetValue2 = ndl2 * 100.0

    this._tNdl1 = Math.max(this._limits.min, Math.min(this._limits.max, targetValue1))
    this._tNdl2 = Math.max(this._limits.min, Math.min(this._limits.max, targetValue2))
    this._dirty = true
  }

  /**
   * Maps values cleanly into geometric canvas radians.
   * Clock Reference System:
   *  - 0 starts strictly at 4 o'clock (120 degrees clock position)
   *  - Sweeps CLOCKWISE through a total arc of 243 degrees
   */
  _gphToRad(val) {
    const CLOCK_START = 120;  
    const TOTAL_SWEEP = 243;  
    
    let ratio = (val - this._limits.min) / (this._limits.max - this._limits.min)
    let clockDegrees = CLOCK_START + (ratio * TOTAL_SWEEP)
    
    let canvasDegrees = clockDegrees - 90
    return (canvasDegrees * Math.PI) / 180
  }

  _render() {
    const { w, h, ctx } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._disp1 = this._lerp(this._disp1, this._tNdl1, 0.12)
    this._disp2 = this._lerp(this._disp2, this._tNdl2, 0.12)
    this._dirty = Math.abs(this._disp1 - this._tNdl1) > 0.05 || Math.abs(this._disp2 - this._tNdl2) > 0.05

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
    const outerAnchor = R * 0.98

    for (let g = this._limits.min; g <= this._limits.max; g += 1) {
      const angle = this._gphToRad(g)
      
      const is10Mark = (g % 10 === 0)
      const is5Mark  = (g % 5 === 0) && !is10Mark

      let tickLength = R * 0.06
      ctx.lineWidth = 0.75 
      ctx.strokeStyle = '#ffffff'

      if (is10Mark) {
        tickLength = R * 0.14
        ctx.lineWidth = 2.0
      } else if (is5Mark) {
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

    const textRadius = R * 0.71
    ctx.font = `bold ${Math.max(14, R * 0.11)}px sans-serif`
    
    for (let g = this._limits.min; g <= this._limits.max; g += 10) {
      const angle = this._gphToRad(g)
      ctx.fillText(String(g / 10), cx + Math.cos(angle) * textRadius, cy + Math.sin(angle) * textRadius)
    }

    ctx.font = `bold ${Math.max(13, R * 0.11)}px sans-serif`
    ctx.fillText('FUEL FLOW', cx, cy - R * 0.35)
    
    ctx.font = `bold ${Math.max(12, R * 0.10)}px sans-serif`
    ctx.fillText('PPH X 100', cx, cy + R * 0.35)
    ctx.restore()
  }

  _drawNeedle(cx, cy, R, val) {
    const { ctx } = this
    const angle = this._gphToRad(val)

    ctx.save()
    const thickness = R * 0.125
    ctx.fillStyle = '#ffffff'
    const tipRadius = (R * 0.94) - 5 

    ctx.translate(cx, cy)
    ctx.rotate(angle)

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
      title: 'King Air Fuel Flow Indicator Row',
      slots: 2,
      datarefs: [
        { key: 'l_ndl', label: 'Left Fuel Flow Dataref', type: 'string', default: DEFAULTS.l_ff_ndl },
        { key: 'r_ndl', label: 'Right Fuel Flow Dataref', type: 'string', default: DEFAULTS.r_ff_ndl }
      ],
      settings: []
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_fuel_flow',
  label:    'King Air Fuel Flow',
  icon:     '⛽',
  order:    110,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
}
