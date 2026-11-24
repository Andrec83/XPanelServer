import { BaseInstrument } from '../base.js'

export const DEFAULTS = {
  l_oil_temp: 'KA350/ianim/gauges/lEngOilTemp',
  r_oil_temp: 'KA350/ianim/gauges/rEngOilTemp',
  l_oil_pres: 'KA350/ianim/gauges/lEngOilPress',
  r_oil_pres: 'KA350/ianim/gauges/rEngOilPress'
}

export class KingAirOilIndicator extends BaseInstrument {
  constructor(canvas, config = {}) {
    super(canvas, config)
    
    this._drefs = {
      l_temp: config.dataref_l_temp || DEFAULTS.l_oil_temp,
      r_temp: config.dataref_r_temp || DEFAULTS.r_oil_temp,
      l_pres: config.dataref_l_pres || DEFAULTS.l_oil_pres,
      r_pres: config.dataref_r_pres || DEFAULTS.r_oil_pres
    }

    this._tTemp1 = -20; this._tTemp2 = -20
    this._tPres1 = 0;   this._tPres2 = 0
    
    this._dispTemp1 = -20; this._dispTemp2 = -20
    this._dispPres1 = 0;   this._dispPres2 = 0
    
    this._hasData = false

    this._limits = {
      tempMin: -20, tempMax: 140,
      tempGreenStart: 0, tempGreenEnd: 95,
      tempYellowStart: 96, tempYellowEnd: 105,
      tempRedLine: 110,

      presMin: 0, presMax: 200,
      presYellowStart: 60, presYellowEnd: 89,
      presGreenStart: 90, presGreenEnd: 135,
      presRedLine: 136
    }

    this._cachedFaceCanvas = document.createElement('canvas')
    this._cachedFaceCtx = null
    this._faceCacheValid = false
  }

  requiredDatarefs() {
    return Object.values(this._drefs)
  }

  update(state) {
    const t1 = state[this._drefs.l_temp]
    const t2 = state[this._drefs.r_temp]
    const p1 = state[this._drefs.l_pres]
    const p2 = state[this._drefs.r_pres]

    if (t1 == null || t2 == null || p1 == null || p2 == null) return
    this._hasData = true

    let tempVal1 = (t1 <= 1.5 && t1 >= -0.5) ? (t1 * 100) : t1
    let tempVal2 = (t2 <= 1.5 && t2 >= -0.5) ? (t2 * 100) : t2
    
    let presVal1 = (p1 < 5.0) ? (p1 * 100) : p1
    let presVal2 = (p2 < 5.0) ? (p2 * 100) : p2

    this._tTemp1 = Math.max(this._limits.tempMin, Math.min(this._limits.tempMax, Math.round(tempVal1)))
    this._tTemp2 = Math.max(this._limits.tempMin, Math.min(this._limits.tempMax, Math.round(tempVal2)))
    this._tPres1 = Math.max(this._limits.presMin, Math.min(this._limits.presMax, Math.round(presVal1)))
    this._tPres2 = Math.max(this._limits.presMin, Math.min(this._limits.presMax, Math.round(presVal2)))

    this._dirty = true
  }

  _tempToRad(celsius) {
    let clockDegrees = 210
    if (celsius <= -20) {
      clockDegrees = 210
    } else if (celsius <= 100) {
      clockDegrees = 210 + ((celsius - (-20)) / 120) * 90
    } else {
      clockDegrees = 300 + ((celsius - 100) / 40) * 30
    }
    return ((clockDegrees - 90) * Math.PI) / 180
  }

  _presToRad(psi) {
    const CLOCK_START = 150
    const TOTAL_SWEEP = -120 
    let ratio = (psi - this._limits.presMin) / 200
    let clockDegrees = CLOCK_START + (ratio * TOTAL_SWEEP)
    return ((clockDegrees - 90) * Math.PI) / 180
  }

  _render() {
    const { w, h, ctx } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._dispTemp1 = this._lerp(this._dispTemp1, this._tTemp1, 0.12)
    this._dispTemp2 = this._lerp(this._dispTemp2, this._tTemp2, 0.12)
    this._dispPres1 = this._lerp(this._dispPres1, this._tPres1, 0.12)
    this._dispPres2 = this._lerp(this._dispPres2, this._tPres2, 0.12)

    this._dirty = Math.abs(this._dispTemp1 - this._tTemp1) > 0.5 || Math.abs(this._dispPres1 - this._tPres1) > 0.5 ||
                  Math.abs(this._dispTemp2 - this._tTemp2) > 0.5 || Math.abs(this._dispPres2 - this._tPres2) > 0.5

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
      
      // Draw solid bounding fill onto the backing cache texture layer before building circle components
      this._cachedFaceCtx.fillStyle = this._theme.digitalBg || '#121212'
      this._cachedFaceCtx.fillRect(0, 0, w, h)

      this._buildCachedDialFace(cx1, cy, R)
      this._buildCachedDialFace(cx2, cy, R)
      this._faceCacheValid = true
    }

    ctx.drawImage(this._cachedFaceCanvas, 0, 0)

    this._drawNeedle(cx1, cy, R, this._tempToRad(this._dispTemp1))
    this._drawNeedle(cx1, cy, R, this._presToRad(this._dispPres1))
    this._drawCentreCap(cx1, cy, R)

    this._drawNeedle(cx2, cy, R, this._tempToRad(this._dispTemp2))
    this._drawNeedle(cx2, cy, R, this._presToRad(this._dispPres2))
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
    ctx.lineWidth = R * 0.03
    ctx.lineCap = 'butt'
    const arcRadius = R * 0.98

    // Temperature Operational Arcs (Left hemisphere)
    ctx.strokeStyle = '#2d8a4e'
    ctx.beginPath()
    ctx.arc(cx, cy, arcRadius - (R * 0.015), this._tempToRad(this._limits.tempGreenStart), this._tempToRad(this._limits.tempGreenEnd))
    ctx.stroke()

    ctx.strokeStyle = '#d49a17'
    ctx.beginPath()
    ctx.arc(cx, cy, arcRadius - (R * 0.015), this._tempToRad(this._limits.tempYellowStart), this._tempToRad(this._limits.tempYellowEnd))
    ctx.stroke()

    ctx.strokeStyle = t.alertColor
    ctx.lineWidth = R * 0.075
    ctx.beginPath()
    const tRedRad = this._tempToRad(this._limits.tempRedLine)
    ctx.arc(cx, cy, arcRadius - (R * 0.0375), tRedRad - 0.02, tRedRad + 0.02)
    ctx.stroke()

    // Pressure Operational Arcs (Right hemisphere)
    ctx.lineWidth = R * 0.03
    ctx.strokeStyle = '#d49a17'
    ctx.beginPath()
    ctx.arc(cx, cy, arcRadius - (R * 0.015), this._presToRad(this._limits.presYellowEnd), this._presToRad(this._limits.presYellowStart))
    ctx.stroke()

    ctx.strokeStyle = '#2d8a4e'
    ctx.beginPath()
    ctx.arc(cx, cy, arcRadius - (R * 0.015), this._presToRad(this._limits.presGreenEnd), this._presToRad(this._limits.presGreenStart))
    ctx.stroke()

    ctx.strokeStyle = t.alertColor
    ctx.lineWidth = R * 0.075
    ctx.beginPath()
    const pRedRad = this._presToRad(this._limits.presRedLine)
    ctx.arc(cx, cy, arcRadius - (R * 0.0375), pRedRad - 0.02, pRedRad + 0.02)
    ctx.stroke()
    ctx.restore()

    ctx.save()

    // Left Quadrant Ticks (Temperature)
    for (let temp = this._limits.tempMin; temp <= this._limits.tempMax; temp += 10) {
      const angle = this._tempToRad(temp)
      const isMajorMark = (temp === -20 || temp === 0 || temp === 20 || temp === 60 || temp === 100 || temp === 140)
      const hasArcPresent = (temp >= this._limits.tempGreenStart && temp <= this._limits.tempYellowEnd) || (temp === this._limits.tempRedLine)
      
      let startAnchor = hasArcPresent ? (arcRadius - R * 0.03) : arcRadius
      let tickLength = isMajorMark ? R * 0.12 : R * 0.06
      
      if (temp === this._limits.tempRedLine) {
        startAnchor = arcRadius
        tickLength = R * 0.18
        ctx.lineWidth = 3.5
        ctx.strokeStyle = t.alertColor
      } else {
        ctx.lineWidth = isMajorMark ? 2.0 : 0.75
        ctx.strokeStyle = '#ffffff'
      }

      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * startAnchor, cy + Math.sin(angle) * startAnchor)
      ctx.lineTo(cx + Math.cos(angle) * (startAnchor - tickLength), cy + Math.sin(angle) * (startAnchor - tickLength))
      ctx.stroke()
    }

    // Right Quadrant Ticks (Pressure)
    for (let pres = this._limits.presMin; pres <= this._limits.presMax; pres += 10) {
      const angle = this._presToRad(pres)
      const isMajorMark = (pres % 50 === 0)
      const hasArcPresent = (pres >= this._limits.presYellowStart)
      
      let startAnchor = hasArcPresent ? (arcRadius - R * 0.03) : arcRadius
      let tickLength = isMajorMark ? R * 0.12 : R * 0.06
      
      if (pres === this._limits.presRedLine || pres === 140) { 
        startAnchor = arcRadius
        tickLength = R * 0.18
        ctx.lineWidth = 3.5
        ctx.strokeStyle = t.alertColor
      } else {
        ctx.lineWidth = isMajorMark ? 2.0 : 0.75
        ctx.strokeStyle = '#ffffff'
      }

      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * startAnchor, cy + Math.sin(angle) * startAnchor)
      ctx.lineTo(cx + Math.cos(angle) * (startAnchor - tickLength), cy + Math.sin(angle) * (startAnchor - tickLength))
      ctx.stroke()
    }
    ctx.restore()

    // LAYER 4: Static Value Marks & Typography Layout
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const textRadius = R * 0.67
    ctx.font = `bold ${Math.max(12, R * 0.11)}px sans-serif`

    const tempLabels = [-20, 0, 20, 60, 100, 140]
    tempLabels.forEach(temp => {
      ctx.fillText(String(temp), cx + Math.cos(this._tempToRad(temp)) * textRadius, cy + Math.sin(this._tempToRad(temp)) * textRadius)
    })

    const presLabels = [0, 50, 100, 150, 200]
    presLabels.forEach(pres => {
      ctx.fillText(String(pres), cx + Math.cos(this._presToRad(pres)) * textRadius, cy + Math.sin(this._presToRad(pres)) * textRadius)
    })

    // OIL branding heading aligned cleanly at the top layout track
    ctx.font = `bold ${Math.max(14, R * 0.13)}px sans-serif`
    ctx.fillText('OIL', cx, cy - R * 0.80)
    
    // °C and PSI units placed down near the 6 o'clock dead spaces
    ctx.font = `bold ${Math.max(11, R * 0.11)}px sans-serif`
    ctx.fillText('°C', cx - R * 0.22, cy + R * 0.80)
    ctx.fillText('PSI', cx + R * 0.22, cy + R * 0.80)
    ctx.restore()
  }

  _drawNeedle(cx, cy, R, angle) {
    const { ctx } = this
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)

    const baseThickness = R * 0.13
    const tipRadius = R * 0.81

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(R * 0.30, -baseThickness / 2) 
    ctx.lineTo(tipRadius, 0)
    ctx.lineTo(R * 0.30, baseThickness / 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  _drawCentreCap(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.30, 0, Math.PI * 2) 
    ctx.fillStyle = t.capFill
    ctx.fill()
    ctx.strokeStyle = t.capStroke
    ctx.lineWidth = 2.0
    ctx.stroke()
    ctx.restore()
  }

  static getConfigurationSchema() {
    return {
      title: 'King Air Dual Oil Temp/Press Indicator Row',
      slots: 2,
      datarefs: [
        { key: 'l_temp', label: 'Left Engine Oil Temp', type: 'string', default: DEFAULTS.l_oil_temp },
        { key: 'r_temp', label: 'Right Engine Oil Temp', type: 'string', default: DEFAULTS.r_oil_temp },
        { key: 'l_pres', label: 'Left Engine Oil Press', type: 'string', default: DEFAULTS.l_oil_pres },
        { key: 'r_pres', label: 'Right Engine Oil Press', type: 'string', default: DEFAULTS.r_oil_pres }
      ],
      settings: []
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_oil',
  label:    'King Air Oil Temp + Press',
  icon:     '🛢',
  order:    120,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
}
