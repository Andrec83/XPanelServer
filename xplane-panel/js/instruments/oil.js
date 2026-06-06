import { BaseInstrument } from './base.js'

export const DEFAULTS = {
  oil_temp:  'sim/cockpit2/engine/indicators/oil_temperature_deg_C',
  oil_press: 'sim/cockpit2/engine/indicators/oil_pressure_psi',
}

function _arcToAbsoluteZones(arc, min, max) {
  if (!arc) return null
  const pts = new Set([min, max])
  for (const b of ['green', 'yellow', 'red']) {
    if (arc[b]) {
      pts.add(Math.max(min, arc[b][0]))
      pts.add(Math.min(max, arc[b][1]))
    }
  }
  const sorted = [...pts].sort((a, b) => a - b)
  return sorted.slice(0, -1).map((lo, i) => {
    const hi  = sorted[i + 1]
    const mid = (lo + hi) / 2
    let color = '#555'
    if (arc.red    && mid >= arc.red[0]    && mid <= arc.red[1])    color = '#f33'
    if (arc.yellow && mid >= arc.yellow[0] && mid <= arc.yellow[1]) color = '#fa0'
    if (arc.green  && mid >= arc.green[0]  && mid <= arc.green[1])  color = '#0c4'
    return [lo, hi, color]
  })
}

function _arcBoundMax(arc) {
  let max = 0
  for (const b of ['green', 'yellow', 'red']) if (arc[b]) max = Math.max(max, arc[b][1])
  return max
}

export class OilGauge extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs      = { ...DEFAULTS, ...datarefs }
    this._engineIdx  = config.engineIndex ?? 0
    this._temp       = 0;  this._dTemp  = 0
    this._press      = 0;  this._dPress = 0
    this._hasData    = false
    this._tDetected  = false
    this._pDetected  = false

    this._tMin = 0;  this._tMax = 160
    this._tZones = this._buildZones(0, 160)

    this._pMin = 0;  this._pMax = 120
    this._pZones = [[0,10,'#f33'],[10,25,'#fa0'],[25,90,'#0c4'],[90,110,'#fa0'],[110,120,'#f33']]
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  _buildZones(mn, mx) {
    const r = mx - mn
    return [
      [mn,          mn+r*0.20, '#fa0'],
      [mn+r*0.20,   mn+r*0.78, '#0c4'],
      [mn+r*0.78,   mn+r*0.90, '#fa0'],
      [mn+r*0.90,   mx,        '#f33'],
    ]
  }

  setAircraftProfile(profile) {
    const et  = profile.engineType
    const lim = profile.limits

    if (lim.oilT?.green || lim.oilT?.yellow || lim.oilT?.red) {
      const max = et.maxOilT > 0 ? et.maxOilT : _arcBoundMax(lim.oilT)
      if (max > 0) {
        this._tMax     = Math.ceil(max * 1.05 / 10) * 10
        this._tZones   = _arcToAbsoluteZones(lim.oilT, this._tMin, this._tMax) ?? this._tZones
        this._tDetected = true
      }
    }

    if (lim.oilP?.green || lim.oilP?.yellow || lim.oilP?.red) {
      const max = et.maxOilP > 0 ? et.maxOilP : _arcBoundMax(lim.oilP)
      if (max > 0) {
        this._pMax     = Math.ceil(max * 1.05 / 10) * 10
        this._pZones   = _arcToAbsoluteZones(lim.oilP, this._pMin, this._pMax) ?? this._pZones
        this._pDetected = true
      }
    }

    this._dirty = true
  }

  update(state) {
    const idx = this._engineIdx
    const t = state[this._drefs.oil_temp]
    const p = state[this._drefs.oil_press]

    if (t != null) {
      const v = Array.isArray(t) ? t[idx] : t
      if (!this._tDetected && v > 0) {
        this._tDetected = true
        if (v > 200) {
          this._tMin = Math.floor(v * 0.55 / 10) * 10
          this._tMax = Math.ceil (v * 1.50 / 50) * 50
          console.log(`[Oil Temp] Kelvin (first=${Math.round(v)}) range ${this._tMin}–${this._tMax}`)
        } else {
          this._tMax = Math.max(150, Math.ceil(v * 1.50 / 50) * 50)
          console.log(`[Oil Temp] Celsius (first=${Math.round(v)}) range 0–${this._tMax}`)
        }
        this._tZones = this._buildZones(this._tMin, this._tMax)
      }
      this._temp = v; this._hasData = true
    }

    if (p != null) {
      const v = Array.isArray(p) ? p[idx] : p
      if (!this._pDetected && v > 0) {
        this._pDetected = true
        if (v > 200) {
          this._pMax = Math.ceil(v * 1.3 / 100) * 100
          console.log(`[Oil Press] high units (first=${Math.round(v)}) max=${this._pMax}`)
        }
      }
      this._press = v
    }
    this._dirty = true
  }

  _va(val, minV, maxV, side) {
    const t = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)))
    return side === 'left'
      ?  Math.PI / 3 - t * 2 * Math.PI / 3
      :  2 * Math.PI / 3 + t * 2 * Math.PI / 3
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._dTemp  = this._lerp(this._dTemp,  this._temp,  0.1)
    this._dPress = this._lerp(this._dPress, this._press, 0.1)
    this._dirty  = Math.abs(this._dTemp  - this._temp)  > 0.1
               || Math.abs(this._dPress - this._press) > 0.1

    const cx = w / 2, cy = h / 2
    const R  = Math.min(w, h) * 0.44

    this._drawBezel()

    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip()
    ctx.fillStyle = this._theme.dialFace; ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, cx, h); ctx.clip()
    this._drawHalf(cx, cy, R, 'left',  this._dTemp,  this._temp,  this._tMin, this._tMax, this._tZones, '°')
    ctx.restore()

    ctx.save()
    ctx.beginPath(); ctx.rect(cx, 0, w, h); ctx.clip()
    this._drawHalf(cx, cy, R, 'right', this._dPress, this._press, this._pMin, this._pMax, this._pZones, 'PSI')
    ctx.restore()

    ctx.strokeStyle = this._theme.dialRim; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke()

    ctx.restore()

    const fs = Math.max(7, Math.min(13, R * 0.12))
    ctx.font = `${fs}px sans-serif`
    ctx.fillStyle = this._theme.needle
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    ctx.save()
    ctx.translate(cx - R - fs * 0.75, cy)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('OIL TEMP', 0, 0)
    ctx.restore()

    ctx.save()
    ctx.translate(cx + R + fs * 0.75, cy)
    ctx.rotate(Math.PI / 2)
    ctx.fillText('OIL PRESS', 0, 0)
    ctx.restore()
  }

  _drawHalf(cx, cy, R, side, dVal, rawVal, minV, maxV, zones, unit) {
    const { ctx }  = this
    const t        = this._theme
    const px       = side === 'left' ? cx - R : cx + R
    const py       = cy
    const ccw      = side === 'left'
    const startA   = side === 'left' ?  Math.PI / 3 : 2 * Math.PI / 3
    const endA     = side === 'left' ? -Math.PI / 3 : 4 * Math.PI / 3

    ctx.save()

    ctx.beginPath(); ctx.arc(px, py, R, startA, endA, ccw)
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = R * 0.22; ctx.lineCap = 'butt'; ctx.stroke()

    ctx.lineWidth = R * 0.17; ctx.lineCap = 'butt'
    for (const [from, to, color] of zones) {
      const a1 = this._va(from, minV, maxV, side)
      const a2 = this._va(to,   minV, maxV, side)
      ctx.beginPath(); ctx.arc(px, py, R, a1, a2, ccw)
      ctx.strokeStyle = color; ctx.stroke()
    }

    const tickR  = R * 0.80, tickLen = R * 0.10
    const labelR = tickR - tickLen - R * 0.13
    ctx.strokeStyle = t.needle; ctx.fillStyle = t.needle
    ctx.font = `${Math.max(6, R * 0.14)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i <= 4; i++) {
      const v     = minV + (maxV - minV) * i / 4
      const angle = this._va(v, minV, maxV, side)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px + Math.cos(angle) * tickR,             py + Math.sin(angle) * tickR)
      ctx.lineTo(px + Math.cos(angle) * (tickR - tickLen), py + Math.sin(angle) * (tickR - tickLen))
      ctx.stroke()
      ctx.fillText(Math.round(v), px + Math.cos(angle) * labelR, py + Math.sin(angle) * labelR)
    }

    const lx      = side === 'left' ? cx - R * 0.75 : cx + R * 0.75
    const warn    = rawVal < minV + (maxV - minV) * 0.12 || rawVal > minV + (maxV - minV) * 0.90
    const valColor = warn ? t.alertColor : t.accent
    const bw = R * 0.46, bh = R * 0.22
    ctx.fillStyle   = t.digitalBg
    ctx.strokeStyle = warn ? t.alertColor : t.digitalBorder
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.roundRect
      ? ctx.roundRect(lx - bw / 2, cy - bh / 2, bw, bh, 3)
      : ctx.rect(lx - bw / 2, cy - bh / 2, bw, bh)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = valColor
    ctx.font = `bold ${Math.max(6, R * 0.15)}px monospace`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(Math.round(rawVal), lx, cy)
    ctx.fillStyle = t.labelDim
    ctx.font = `${Math.max(5, R * 0.10)}px sans-serif`
    ctx.fillText(unit, lx, cy + bh / 2 + R * 0.08)

    const na = this._va(Math.max(minV, Math.min(maxV, dVal)), minV, maxV, side)
    ctx.save()
    ctx.translate(px, py); ctx.rotate(na)
    ctx.beginPath(); ctx.moveTo(R * 0.06, 0); ctx.lineTo(R * 0.76, 0)
    ctx.strokeStyle = t.needle; ctx.lineWidth = Math.max(1.5, R * 0.025); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(R * 0.76, 0); ctx.lineTo(R * 0.70, -R * 0.03); ctx.lineTo(R * 0.70, R * 0.03)
    ctx.closePath(); ctx.fillStyle = t.needle; ctx.fill()
    ctx.restore()

    ctx.beginPath(); ctx.arc(px, py, R * 0.055, 0, Math.PI * 2)
    ctx.fillStyle = t.capFill; ctx.fill()
    ctx.strokeStyle = t.capStroke; ctx.lineWidth = 1; ctx.stroke()

    ctx.restore()
  }
}
