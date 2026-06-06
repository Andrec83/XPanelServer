import { BaseInstrument } from './base.js'

export const DEFAULTS = {
  egt: 'sim/cockpit2/engine/indicators/EGT_deg_C',
  ff:  'sim/cockpit2/engine/indicators/fuel_flow_kg_sec',
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

function _scaleArc(arc, factor) {
  if (!arc) return null
  const s = (band) => band ? [band[0] * factor, band[1] * factor] : null
  return { green: s(arc.green), yellow: s(arc.yellow), red: s(arc.red) }
}

export class EGTGauge extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs      = { ...DEFAULTS, ...datarefs }
    this._engineIdx  = config.engineIndex ?? 0
    this._egt        = 0;  this._dEgt = 0
    this._ff         = 0;  this._dFf  = 0
    this._hasData    = false
    this._egtDetected = false
    this._ffDetected  = false

    this._egtMin = 0;  this._egtMax = 2000
    this._egtZones = this._buildZones(0, 2000, 0.70, 0.87)

    this._ffMin = 0;   this._ffMax = 50
    this._ffUnit = 'lb/h'
    this._ffScale = 1
    this._ffZones = this._buildZones(0, 50, 0.60, 0.85)
    this._ffArcRaw   = null
    this._ffUnitSet  = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  _buildZones(mn, mx, greenEnd, yellowEnd) {
    const r = mx - mn
    return [
      [mn,          mn + r * 0.20,      '#fa0'],
      [mn + r*0.20, mn + r * greenEnd,  '#0c4'],
      [mn + r*greenEnd, mn + r*yellowEnd,'#fa0'],
      [mn + r*yellowEnd, mx,            '#f33'],
    ]
  }

  setAircraftProfile(profile) {
    const egtLim = profile.limits.egt
    if (egtLim?.green || egtLim?.yellow || egtLim?.red) {
      const max = _arcBoundMax(egtLim)
      this._egtMax   = Math.ceil(max * 1.05 / 100) * 100
      this._egtZones = _arcToAbsoluteZones(egtLim, this._egtMin, this._egtMax) ?? this._egtZones
      this._egtDetected = true
    }
    if (profile.engineType.isPiston) {
      this._ffScale   = 7936.6 / 6.0
      this._ffUnit    = 'gal/h'
    } else {
      this._ffScale   = 7936.6
      this._ffUnit    = 'lb/h'
    }
    this._ffUnitSet = true

    const ffLim = profile.limits.ff
    if (ffLim?.green || ffLim?.yellow || ffLim?.red) {
      this._ffArcRaw = ffLim
    }
    this._dirty = true
  }

  update(state) {
    const idx = this._engineIdx
    const egtRaw = state[this._drefs.egt]
    const ffRaw  = state[this._drefs.ff]

    if (egtRaw != null) {
      const v = Array.isArray(egtRaw) ? egtRaw[idx] : egtRaw
      if (!this._egtDetected && v > 0) {
        this._egtDetected = true
        this._egtMax = Math.ceil(v * 1.30 / 500) * 500
        this._egtZones = this._buildZones(this._egtMin, this._egtMax, 0.70, 0.87)
        console.log(`[EGT] first=${Math.round(v)}, range 0–${this._egtMax}`)
      }
      this._egt = v; this._hasData = true
    }

    if (ffRaw != null) {
      const v = Array.isArray(ffRaw) ? ffRaw[idx] : ffRaw
      if (!this._ffDetected && v > 0) {
        this._ffDetected = true
        if (!this._ffUnitSet) {
          if      (v < 0.5) { this._ffScale = 7936.6; this._ffUnit = 'lb/h' }
          else if (v < 10)  { this._ffScale = 1;       this._ffUnit = 'kg/h' }
          else               { this._ffScale = 1;       this._ffUnit = 'lb/h' }
        }
        const disp = v * this._ffScale
        if (this._ffArcRaw) {
          const scaled = _scaleArc(this._ffArcRaw, this._ffScale)
          const arcMax = _arcBoundMax(scaled)
          this._ffMax   = Math.ceil(Math.max(disp * 1.50, arcMax * 1.05) / 10) * 10
          this._ffZones = _arcToAbsoluteZones(scaled, 0, this._ffMax) ?? this._ffZones
          console.log(`[FF] arc zones, unit=${this._ffUnit}, max=${this._ffMax}`)
        } else {
          this._ffMax   = Math.ceil(disp * 1.50 / 10) * 10
          this._ffZones = this._buildZones(0, this._ffMax, 0.60, 0.85)
          console.log(`[FF] auto-range, unit=${this._ffUnit}, max=${this._ffMax}`)
        }
      }
      this._ff = v * this._ffScale
      if (this._ff > this._ffMax) {
        this._ffMax = Math.ceil(this._ff * 1.25 / 10) * 10
        if (this._ffArcRaw) {
          const scaled = _scaleArc(this._ffArcRaw, this._ffScale)
          this._ffZones = _arcToAbsoluteZones(scaled, 0, this._ffMax) ?? this._ffZones
        } else {
          this._ffZones = this._buildZones(0, this._ffMax, 0.60, 0.85)
        }
      }
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

    this._dEgt = this._lerp(this._dEgt, this._egt, 0.08)
    this._dFf  = this._lerp(this._dFf,  this._ff,  0.08)
    this._dirty = Math.abs(this._dEgt - this._egt) > 0.5
              || Math.abs(this._dFf  - this._ff)  > 0.1

    const cx = w / 2, cy = h / 2
    const R  = Math.min(w, h) * 0.44

    this._drawBezel()

    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip()
    ctx.fillStyle = this._theme.dialFace; ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, cx, h); ctx.clip()
    this._drawHalf(cx, cy, R, 'left',  this._dEgt, this._egt, this._egtMin, this._egtMax, this._egtZones, '°')
    ctx.restore()

    ctx.save()
    ctx.beginPath(); ctx.rect(cx, 0, w, h); ctx.clip()
    this._drawHalf(cx, cy, R, 'right', this._dFf,  this._ff,  this._ffMin,  this._ffMax,  this._ffZones,  this._ffUnit)
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
    ctx.fillText('EGT', 0, 0)
    ctx.restore()

    ctx.save()
    ctx.translate(cx + R + fs * 0.75, cy)
    ctx.rotate(Math.PI / 2)
    ctx.fillText('FUEL FLOW', 0, 0)
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

    const tickR  = R * 0.80, tickLen = R * 0.10, labelR = tickR - tickLen - R * 0.13
    ctx.strokeStyle = t.needle; ctx.fillStyle = t.needle
    ctx.font = `${Math.max(6, R * 0.14)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i <= 4; i++) {
      const v = minV + (maxV - minV) * i / 4
      const a = this._va(v, minV, maxV, side)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px + Math.cos(a) * tickR,             py + Math.sin(a) * tickR)
      ctx.lineTo(px + Math.cos(a) * (tickR - tickLen), py + Math.sin(a) * (tickR - tickLen))
      ctx.stroke()
      ctx.fillText(Math.round(v), px + Math.cos(a) * labelR, py + Math.sin(a) * labelR)
    }

    const lx      = side === 'left' ? cx - R * 0.75 : cx + R * 0.75
    const warn    = rawVal > minV + (maxV - minV) * 0.88
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
    ctx.font = `bold ${Math.max(8, R * 0.18)}px monospace`
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
