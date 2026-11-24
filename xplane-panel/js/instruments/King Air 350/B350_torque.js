import { BaseInstrument } from '../base.js'

export const DEFAULTS = {
  l_torque_ndl: 'KA350/ianim/gauges/lEngTorque',
  r_torque_ndl: 'KA350/ianim/gauges/rEngTorque',
  l_torque_dig: 'KA350/instruments/engInstr/lEngTorqueDig',
  r_torque_dig: 'KA350/instruments/engInstr/rEngTorqueDig'
}

export class KingAirTorqueIndicator extends BaseInstrument {
  constructor(canvas, config = {}) {
    super(canvas, config)
    
    this._drefs = {
      l_ndl: config.dataref_l_ndl || DEFAULTS.l_torque_ndl,
      r_ndl: config.dataref_r_ndl || DEFAULTS.r_torque_ndl,
      l_dig: config.dataref_l_dig || DEFAULTS.l_torque_dig,
      r_dig: config.dataref_r_dig || DEFAULTS.r_torque_dig
    }

    this._tNdl1 = 0; this._tNdl2 = 0
    this._tDig1 = 0; this._tDig2 = 0
    this._disp1 = 0; this._disp2 = 0
    this._hasData = false
    this._hasPower = false

    this._limits = {
      min: 0,
      greenStart: 0,
      greenEnd: 100,
      redLine: 100,
      max: 120
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
    const dig1 = state[this._drefs.l_dig]
    const dig2 = state[this._drefs.r_dig]

    if (ndl1 == null || ndl2 == null) return
    this._hasData = true

    this._tNdl1 = Math.max(this._limits.min, Math.min(this._limits.max, ndl1 * 100))
    this._tNdl2 = Math.max(this._limits.min, Math.min(this._limits.max, ndl2 * 100))

    if (dig1 != null) {
      this._hasPower = (dig1 !== 0)
      this._tDig1 = Math.max(this._limits.min, Math.min(this._limits.max, parseFloat(dig1.toFixed(1))))
    }
    
    if (dig2 != null) {
      this._tDig2 = Math.max(this._limits.min, Math.min(this._limits.max, parseFloat(dig2.toFixed(1))))
    }

    this._dirty = true
  }

  _pctToRad(pct) {
    const CLOCK_START = 60
    const TOTAL_SWEEP = 240
    let ratio = (pct - this._limits.min) / (this._limits.max - this._limits.min)
    let clockDegrees = CLOCK_START + (ratio * TOTAL_SWEEP)
    let canvasDegrees = clockDegrees - 90
    return (canvasDegrees * Math.PI) / 180
  }
  // PHASE 1 LAYER: Renders dial plate background, glass box cutouts, and physical needles under darkness
  _render() {
    const { w, h, ctx } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._disp1 = this._lerp(this._disp1, this._tNdl1, 0.12)
    this._disp2 = this._lerp(this._disp2, this._tNdl2, 0.12)
    this._dirty = Math.abs(this._disp1 - this._tNdl1) > 0.02 || Math.abs(this._disp2 - this._tNdl2) > 0.02

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
    const boxH = R * 0.31
    const boxY = (cy - R * 0.94) + (boxH / 2) + 10

    // Draws housing boxes and needles under the dark environmental shadow mask
    this._drawDigitalBoxOnly(cx1, boxY, R)
    this._drawNeedle(cx1, cy, R, this._disp1)
    this._drawCentreCap(cx1, cy, R)

    this._drawDigitalBoxOnly(cx2, boxY, R)
    this._drawNeedle(cx2, cy, R, this._disp2)
    this._drawCentreCap(cx2, cy, R)
  }

  // PHASE 2 LAYER: Overlays purely your emissive neon digits over the top of the shadow mask
  _renderEmissive() {
    if (!this._hasData) return

    const { w, h } = this
    const midX = w / 2
    const cx1 = midX / 2
    const cx2 = midX + (midX / 2)
    const cy = h / 2
    const R  = Math.min(midX, h) * 0.44
    const boxH = R * 0.31
    const boxY = (cy - R * 0.94) + (boxH / 2) + 10

    // Direct isolated routing shortcut to your untouched segment rendering block
    this._drawDigitalDigitsOnly(cx1, boxY, R, this._tDig1, this._hasPower)
    this._drawDigitalDigitsOnly(cx2, boxY, R, this._tDig2, this._hasPower)
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
    ctx.arc(cx, cy, R * 0.94, this._pctToRad(this._limits.greenStart), this._pctToRad(this._limits.greenEnd))
    ctx.stroke()
    ctx.restore()
    ctx.save()
    const outerAnchor = R * 0.98
    for (let pct = 0; pct <= this._limits.max; pct += 2) {
      const angle = this._pctToRad(pct)
      const isRedLine = (pct === this._limits.redLine)
      const is20Mark = (pct % 20 === 0)
      const is10Mark = (pct % 10 === 0) && !is20Mark

      let tickLength = R * 0.07
      ctx.lineWidth = 1.0
      ctx.strokeStyle = '#ffffff'

      if (isRedLine) {
        tickLength = R * 0.18
        ctx.lineWidth = 3.5
        ctx.strokeStyle = t.alertColor
      } else if (is20Mark) {
        tickLength = R * 0.14
        ctx.lineWidth = 2.0
      } else if (is10Mark) {
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
    const textRadius = R * 0.68
    ctx.font = `bold ${Math.max(14, R * 0.11)}px sans-serif`
    for (let pct = 0; pct <= this._limits.max; pct += 20) {
      const angle = this._pctToRad(pct)
      ctx.fillText(String(pct), cx + Math.cos(angle) * textRadius, cy + Math.sin(angle) * textRadius)
    }

    ctx.font = `bold ${Math.max(14, R * 0.09)}px sans-serif`
    ctx.fillText('TORQUE', cx, cy - R * 0.33)
    ctx.font = `bold ${Math.max(14, R * 0.10)}px sans-serif`
    ctx.fillText('%', cx, cy + R * 0.30)
    ctx.restore()
  }

  // Extracts your container window geometry so it is masked accurately by phase 1 shadows
  _drawDigitalBoxOnly(cx, boxY, R) {
    const { ctx } = this
    const t = this._theme
    const boxW = R * 0.94
    const boxH = R * 0.31

    ctx.save()
    ctx.fillStyle = t.digitalBg
    ctx.strokeStyle = t.digitalBorder
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.rect(cx - boxW / 2, boxY - boxH / 2, boxW, boxH)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  // Your original digital text layout coordinator method mapping text sizing
  _drawDigitalDigitsOnly(cx, boxY, R, targetVal, isPowered) {
    const { ctx } = this
    const boxW = R * 0.94
    const boxH = R * 0.31

    if (!isPowered) return

    ctx.save()
    const str = targetVal.toFixed(1)
    const digW = boxH * 0.42
    const digH = boxH * 0.72
    const segT = Math.max(1.5, digW * 0.16)
    const gap = boxH * 0.10

    let totalW = 0
    for (let i = 0; i < str.length; i++) {
      totalW += (str[i] === '.') ? segT * 2 : digW
      if (i < str.length - 1) totalW += gap
    }
    let startX = cx + (boxW / 2) - (boxW * 0.06) - totalW
    let startY = boxY - (digH / 2)

    // Segment binary arrays mapping matching 7 layout coordinates precisely [A, B, C, D, E, F, G]
    const segmentMap = {
      '0': [1, 1, 1, 1, 1, 1, 0],
      '1': [0, 1, 1, 0, 0, 0, 0],
      '2': [1, 1, 0, 1, 1, 0, 1],
      '3': [1, 1, 1, 1, 0, 0, 1],
      '4': [0, 1, 1, 0, 0, 1, 1],
      '5': [1, 0, 1, 1, 0, 1, 1],
      '6': [1, 0, 1, 1, 1, 1, 1],
      '7': [1, 1, 1, 0, 0, 0, 0],
      '8': [1, 1, 1, 1, 1, 1, 1],
      '9': [1, 1, 1, 1, 0, 1, 1]
    }

    ctx.fillStyle = '#ffb300'

    for (let i = 0; i < str.length; i++) {
      const char = str[i]

      if (char === '.') {
        ctx.beginPath()
        ctx.arc(startX + segT, startY + digH - segT, segT, 0, Math.PI * 2)
        ctx.fill()
        startX += (segT * 2) + gap
        continue
      }

      const active = segmentMap[char] || [0, 0, 0, 0, 0, 0, 0]
      const hW = digW, hH = digH, th = segT

      const segs = [
        [th, 0, hW - th * 2, th],                // A
        [hW - th, th, th, hH / 2 - th],          // B
        [hW - th, hH / 2, th, hH / 2 - th],      // C
        [th, hH - th, hW - th * 2, th],          // D
        [0, hH / 2, th, hH / 2 - th],            // E
        [0, th, th, hH / 2 - th],                // F
        [th, hH / 2 - th / 2, hW - th * 2, th]   // G
      ]

      for (let s = 0; s < segs.length; s++) {
        if (active[s]) {
          ctx.fillRect(startX + segs[s][0], startY + segs[s][1], segs[s][2], segs[s][3])
        }
      }
      startX += hW + gap
    }
    ctx.restore()
  }

  _drawNeedle(cx, cy, R, val) {
    const { ctx } = this
    const angle = this._pctToRad(val)
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
      title: 'King Air Torque Indicator Row',
      slots: 2,
      datarefs: [
        { key: 'l_ndl', label: 'Left Needle Dataref', type: 'string', default: DEFAULTS.l_torque_ndl },
        { key: 'r_ndl', label: 'Right Needle Dataref', type: 'string', default: DEFAULTS.r_torque_ndl },
        { key: 'l_dig', label: 'Left Digital Dataref', type: 'string', default: DEFAULTS.l_torque_dig },
        { key: 'r_dig', label: 'Right Digital Dataref', type: 'string', default: DEFAULTS.r_torque_dig }
      ],
      settings: []
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_torque',
  label:    'King Air Torque',
  icon:     '⚙',
  order:    70,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
}
