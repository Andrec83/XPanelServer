import { BaseInstrument } from './base.js'

export const DEFAULTS = {
  kias: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
}

export class AirspeedIndicator extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._kias = 0
    this._displayKias = 0
    this._hasData = false
    this._limits = {
      vs0: 60, vfe: 110, vs1: 110, vno: 175, vne: 220, maxKts: 300,
    }
  }

  setAircraftProfile(profile) {
    if (Object.keys(profile.speeds).length > 0) this.setSpeedLimits(profile.speeds)
  }

  setSpeedLimits(limits) {
    this._limits = { ...this._limits, ...limits }
    this._dirty  = true
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    const v = state[this._drefs.kias]
    if (v == null) return
    this._hasData = true
    this._kias = Math.max(0, Math.min(this._limits.maxKts, v))
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._displayKias = this._lerp(this._displayKias, this._kias, 0.08)
    this._dirty = Math.abs(this._displayKias - this._kias) > 0.05

    const cx = w / 2, cy = h / 2
    const R  = Math.min(w, h) * 0.44

    this._drawBezel()
    this._drawDial(cx, cy, R)
    this._drawNeedle(cx, cy, R, this._displayKias)
    this._drawDigital(cx, cy, R, this._kias)
    this._drawCentreCap(cx, cy, R)
  }

  _drawDial(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = t.dialFace
    ctx.fill()
    ctx.strokeStyle = t.dialRim
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()

    const { vs0, vfe, vs1, vno, vne, maxKts } = this._limits
    const START_DEG = 135
    const SWEEP     = 270
    const ktsToRad  = kts => ((START_DEG + (kts / maxKts) * SWEEP) * Math.PI) / 180

    ctx.save()
    ctx.lineCap = 'butt'
    ctx.lineWidth = R * 0.06
    for (const [r, from, to, color] of [
      [0.92, 0,   vs0, '#f33'],
      [0.92, vs0, vfe, '#fff'],
      [0.83, vs1, vno, '#0c4'],
      [0.83, vno, vne, '#fa0'],
    ]) {
      ctx.beginPath()
      ctx.arc(cx, cy, R * r, ktsToRad(from), ktsToRad(to))
      ctx.strokeStyle = color
      ctx.stroke()
    }
    ctx.restore()

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.83, ktsToRad(vne - 1), ktsToRad(vne + 1))
    ctx.strokeStyle = '#f00'
    ctx.lineWidth   = R * 0.07
    ctx.stroke()
    ctx.restore()

    const limitLabels = [
      { kts: vs0, label: 'Vs0', color: '#f77' },
      { kts: vfe, label: 'Vfe', color: '#ccc' },
      { kts: vs1, label: 'Vs1', color: '#4d8' },
      { kts: vno, label: 'Vno', color: '#fc6' },
      { kts: vne, label: 'Vne', color: '#f44' },
    ]
    ctx.save()
    ctx.font = `bold ${Math.max(6, R * 0.095)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const { kts, label, color } of limitLabels) {
      const angle = ktsToRad(kts)
      ctx.fillStyle = color
      ctx.fillText(label, cx + Math.cos(angle) * R * 0.68, cy + Math.sin(angle) * R * 0.68)
    }
    ctx.restore()

    ctx.save()
    ctx.strokeStyle = t.needle
    ctx.fillStyle   = t.needle
    const labelStep = maxKts <= 200 ? 20 : maxKts <= 400 ? 50 : 100
    const tickStep  = maxKts <= 200 ? 5  : 10
    ctx.font = `${Math.max(8, R * 0.13)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let kts = 0; kts <= maxKts; kts += tickStep) {
      const angle   = (START_DEG + (kts / maxKts) * SWEEP) * Math.PI / 180
      const isMajor = kts % labelStep === 0
      const inner   = R * 0.78
      const len     = isMajor ? R * 0.14 : R * 0.08
      ctx.lineWidth = isMajor ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * inner,          cy + Math.sin(angle) * inner)
      ctx.lineTo(cx + Math.cos(angle) * (inner - len),  cy + Math.sin(angle) * (inner - len))
      ctx.stroke()
      if (isMajor && kts > 0) {
        const lr = inner - len - R * 0.1
        ctx.fillText(String(kts), cx + Math.cos(angle) * lr, cy + Math.sin(angle) * lr)
      }
    }
    ctx.restore()
  }

  _drawNeedle(cx, cy, R, ktas) {
    const { ctx } = this
    const START_DEG = 135, SWEEP = 270
    const angle = (START_DEG + (ktas / this._limits.maxKts) * SWEEP) * Math.PI / 180

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(-R * 0.08, 0)
    ctx.lineTo(R * 0.65, -R * 0.025)
    ctx.lineTo(R * 0.7,  0)
    ctx.lineTo(R * 0.65,  R * 0.025)
    ctx.closePath()
    ctx.fillStyle = this._theme.needle
    ctx.fill()
    ctx.restore()
  }

  _drawDigital(cx, cy, R, ktas) {
    const { ctx } = this
    const t = this._theme
    const bx = cx, by = cy + R * 0.55
    const bw = R * 0.55, bh = R * 0.22
    ctx.save()
    ctx.fillStyle = t.digitalBg
    ctx.strokeStyle = t.digitalBorder
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect
      ? ctx.roundRect(bx - bw/2, by - bh/2, bw, bh, 3)
      : ctx.rect(bx - bw/2, by - bh/2, bw, bh)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = t.accent
    ctx.font = `bold ${Math.max(10, R * 0.2)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(Math.round(ktas).toString().padStart(3, ' '), bx, by)
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
}
