import { BaseInstrument } from '../base.js'

export const DEFAULTS = {
  egt: 'sim/flightmodel2/engines/ITT_deg_cel',
  ff:  'sim/cockpit2/engine/indicators/fuel_flow_kg_sec',
}

function _arcToAbsoluteZones(arc, min, max) {
  // if (!arc) return null
  // const pts = new Set([min, max])
  // for (const b of ['green', 'yellow', 'red']) {
  //   if (arc[b]) {
  //     pts.add(Math.max(min, arc[b]))
  //     pts.add(Math.min(max, arc[b]))
  //   }
  // }
  // const sorted = [...pts].sort((a, b) => a - b)
  // return sorted.slice(0, -1).map((lo, i) => {
  //   const hi  = sorted[i + 1]
  //   const mid = (lo + hi) / 2
  //   let color = '#555'
  //   if (arc.red    && mid >= arc.red    && mid <= arc.red)    color = '#f33'
  //   if (arc.yellow && mid >= arc.yellow && mid <= arc.yellow) color = '#fa0'
  //   if (arc.green  && mid >= arc.green  && mid <= arc.green)  color = '#0c4'
  //   return [lo, hi, color]
  // })
  return null
}

function _arcBoundMax(arc) {
  let max = 0
  // for (const b of ['green', 'yellow', 'red']) if (arc[b]) max = Math.max(max, arc[b])
  return max
}

function _scaleArc(arc, factor) {
  // if (!arc) return null
  // const s = (band) => band ? [band * factor, band * factor] : null
  // return { green: s(arc.green), yellow: s(arc.yellow), red: s(arc.red) }
  return null
}

export class PC6ITT extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs      = { ...DEFAULTS, ...datarefs }
    this._engineIdx  = config.engineIndex ?? 0
    this._egt        = 0;  this._dEgt = 0
    this._ff         = 0;  this._dFf  = 0
    this._hasData    = false
    this._egtDetected = false
    this._ffDetected  = false

    // Locked to 400-1200 PC-6 T.I.T. specifications
    this._egtMin = 400;  this._egtMax = 1200
    
    // Explicit static bands: Green 400-720, Red Line 740, Thin Red Line 1080
    // Color zones array layout: [from, to, color, isThickLine]
    this._egtZones = [
      [400,  720, '#0c4', true],  // Green zone
      [736,  744, '#f33', true],  // Thicker 740 redline
      [1077, 1083, '#f33', false] // Thin 1080 redline
    ]

    // Locked to 0-60 per instructions
    this._ffMin = 0;   this._ffMax = 60
    this._ffUnit = 'GAL/H'
    // FSE Unified Scale: (2.2046226 lb/kg * 3600 sec/hr) / 6.0 FSE lb/gal = 1322.77356
    this._ffScale = 1322.77356
    this._ffZones = [] 
    this._ffArcRaw   = null
    this._ffUnitSet  = true
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
    // Left completely bypassed to lock the 400-1200 T.I.T static ranges
    // const egtLim = profile.limits.egt
    // if (egtLim?.green || egtLim?.yellow || egtLim?.red) {
    //   const max = _arcBoundMax(egtLim)
    //   this._egtMax   = Math.ceil(max * 1.05 / 100) * 100
    //   this._egtZones = _arcToAbsoluteZones(egtLim, this._egtMin, this._egtMax) ?? this._egtZones
    //   this._egtDetected = true
    // }
    this._dirty = true
  }

  update(state) {
    const idx = this._engineIdx
    const egtRaw = state[this._drefs.egt]
    const ffRaw  = state[this._drefs.ff]

    if (egtRaw != null) {
      const v = Array.isArray(egtRaw) ? egtRaw[idx] : egtRaw
      this._egt = v
      this._hasData = true
    }

    if (ffRaw != null) {
      const v = Array.isArray(ffRaw) ? ffRaw[idx] : ffRaw
      this._ff = v * this._ffScale
      this._hasData = true
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

    // Layer 1: Operational color bands and specific limit lines
    for (const [from, to, color, isThick] of zones) {
      const a1 = this._va(from, minV, maxV, side)
      const a2 = this._va(to,   minV, maxV, side)
      ctx.lineWidth = isThick ? R * 0.22 : R * 0.10
      ctx.lineCap = 'butt'
      ctx.beginPath(); ctx.arc(px, py, R, a1, a2, ccw)
      ctx.strokeStyle = color; ctx.stroke()
    }

    const tickLen = R * 0.10
    const fsaTickR   = R * 0.88
    const fsaTickLen = tickLen * 0.7
    ctx.strokeStyle = t.needle; ctx.fillStyle = t.needle
    
    // Layer 2: Ticks and numerical markers pushed outward to the rim edge
    if (side === 'left') {
      ctx.font = `${Math.max(5, R * 0.11)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      
      for (let v = minV; v <= maxV; v += 50) {
        const isMajor = (v % 100 === 0)
        const a = this._va(v, minV, maxV, side)
        const currentTickLen = isMajor ? fsaTickLen : fsaTickLen * 0.5
        ctx.lineWidth = isMajor ? 1.5 : 1.0
        ctx.beginPath()
        ctx.moveTo(px + Math.cos(a) * fsaTickR,             py + Math.sin(a) * fsaTickR)
        ctx.lineTo(px + Math.cos(a) * (fsaTickR - currentTickLen), py + Math.sin(a) * (fsaTickR - currentTickLen))
        ctx.stroke()
        if (isMajor) {
          ctx.fillText(Math.round(v / 100), px + Math.cos(a) * (fsaTickR - currentTickLen - R * 0.10), py + Math.sin(a) * (fsaTickR - currentTickLen - R * 0.10))
        }
      }
    } else {
      ctx.font = `${Math.max(5, R * 0.11)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      
      for (let v = minV; v <= maxV; v += 5) {
        const isMajor = (v % 10 === 0)
        const a = this._va(v, minV, maxV, side)
        const currentTickLen = isMajor ? fsaTickLen : fsaTickLen * 0.5
        ctx.lineWidth = isMajor ? 1.5 : 1.0
        ctx.beginPath()
        ctx.moveTo(px + Math.cos(a) * fsaTickR,             py + Math.sin(a) * fsaTickR)
        ctx.lineTo(px + Math.cos(a) * (fsaTickR - currentTickLen), py + Math.sin(a) * (fsaTickR - currentTickLen))
        ctx.stroke()
        if (isMajor) {
          ctx.fillText(Math.round(v), px + Math.cos(a) * (fsaTickR - currentTickLen - R * 0.10), py + Math.sin(a) * (fsaTickR - currentTickLen - R * 0.10))
        }
      }
    }

    // Layer 3: Text positioning windows (0.68 mirrored coordinates)
    const lx      = side === 'left' ? cx - R * 0.68 : cx + R * 0.68
    const warn    = rawVal > minV + (maxV - minV) * 0.88
    const valColor = warn ? t.alertColor : t.accent
    const bw = R * 0.46, bh = R * 0.22

    if (side === 'left') {
      ctx.fillStyle = t.labelDim
      ctx.font = `bold ${Math.max(5, R * 0.105)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('T.I.T.', lx, cy - R * 0.08)
      ctx.font = `${Math.max(4.5, R * 0.09)}px sans-serif`
      ctx.fillText('°C x 100', lx, cy + R * 0.08)

      // ctx.fillStyle   = t.digitalBg
      // ctx.strokeStyle = warn ? t.alertColor : t.digitalBorder
      // ctx.lineWidth   = 1
      // ctx.beginPath()
      // ctx.roundRect
      //   ? ctx.roundRect(lx - bw / 2, cy - bh / 2, bw, bh, 3)
      //   : ctx.rect(lx - bw / 2, cy - bh / 2, bw, bh)
      // ctx.fill(); ctx.stroke()
      // ctx.fillStyle = valColor
      // ctx.font = `bold ${Math.max(8, R * 0.18)}px monospace`
      // ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      // ctx.fillText(Math.round(rawVal), lx, cy)
      // ctx.fillStyle = t.labelDim
      // ctx.font = `${Math.max(5, R * 0.10)}px sans-serif`
      // ctx.fillText(unit, lx, cy + bh / 2 + R * 0.08)
    }
    else {
      // Mirrors the exact layout coordinates of the left side window
      ctx.fillStyle = t.labelDim
      ctx.font = `bold ${Math.max(5, R * 0.105)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('GAL / H', lx, cy)
      
      // ctx.fillStyle   = t.digitalBg
      // ctx.strokeStyle = warn ? t.alertColor : t.digitalBorder
      // ctx.lineWidth   = 1
      // ctx.beginPath()
      // ctx.roundRect
      //   ? ctx.roundRect(lx - bw / 2, cy - bh / 2, bw, bh, 3)
      //   : ctx.rect(lx - bw / 2, cy - bh / 2, bw, bh)
      // ctx.fill(); ctx.stroke()
      // ctx.fillStyle = valColor
      // ctx.font = `bold ${Math.max(8, R * 0.18)}px monospace`
      // ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      // ctx.fillText(Math.round(rawVal), lx, cy)
      // ctx.fillStyle = t.labelDim
      // ctx.font = `${Math.max(5, R * 0.10)}px sans-serif`
      // ctx.fillText(unit, lx, cy + bh / 2 + R * 0.08)
    }

    // Layer 4: Mechanical pointers and needle cap details
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

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'pc6_egt',
  label:    'PC-6 ITT + Fuel Flow',
  icon:     '🌡',
  order:    70,
  datarefs: DEFAULTS,
  select: 'engine',
}
