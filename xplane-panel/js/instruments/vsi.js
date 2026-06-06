import { BaseInstrument } from './base.js'

export const DEFAULTS = {
  vvi_fpm: 'sim/cockpit2/gauges/indicators/vvi_fpm_pilot',
}

function fpmToAngle(fpm) {
  const clamped = Math.max(-4000, Math.min(4000, fpm))
  const sign = clamped < 0 ? -1 : 1
  const ratio = Math.pow(Math.abs(clamped) / 4000, 0.75)
  return sign * ratio * 135 * Math.PI / 180
}

export class VSI extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._vvi = 0
    this._displayVvi = 0
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    const v = state[this._drefs.vvi_fpm]
    if (v == null) return
    this._hasData = true
    this._vvi = v
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._displayVvi = this._lerp(this._displayVvi, this._vvi, 0.04)
    this._dirty = Math.abs(this._displayVvi - this._vvi) > 0.5

    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44
    this._drawBezel()
    this._drawFace(cx, cy, R)
    this._drawNeedle(cx, cy, R, this._displayVvi)
    this._drawDigital(cx, cy, R, this._vvi)
    this._drawCentreCap(cx, cy, R)
  }

  _drawFace(cx, cy, R) {
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

    const labels = [
      { fpm:  4000, label: '4' },
      { fpm:  2000, label: '2' },
      { fpm:  1000, label: '1' },
      { fpm:   500, label: '½' },
      { fpm:     0, label: '0' },
      { fpm:  -500, label: '½' },
      { fpm: -1000, label: '1' },
      { fpm: -2000, label: '2' },
      { fpm: -4000, label: '4' },
    ]

    const fs = Math.max(7, R * 0.12)
    ctx.font = `${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = t.needle
    ctx.strokeStyle = t.needle

    for (const { fpm, label } of labels) {
      const angle = Math.PI + fpmToAngle(fpm)
      const inner = R * 0.78
      const len   = R * 0.12
      ctx.lineWidth = Math.abs(fpm) % 1000 === 0 ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * inner,        cy + Math.sin(angle) * inner)
      ctx.lineTo(cx + Math.cos(angle) * (inner - len), cy + Math.sin(angle) * (inner - len))
      ctx.stroke()
      const lr = inner - len - R * 0.1
      ctx.fillText(label, cx + Math.cos(angle) * lr, cy + Math.sin(angle) * lr)
    }

    const minors = [100, 200, 300, 400, 600, 700, 800, 900]
    for (const fpm of [...minors, ...minors.map(v => -v)]) {
      const angle = Math.PI + fpmToAngle(fpm)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * R * 0.78,              cy + Math.sin(angle) * R * 0.78)
      ctx.lineTo(cx + Math.cos(angle) * (R * 0.78 - R * 0.07), cy + Math.sin(angle) * (R * 0.78 - R * 0.07))
      ctx.stroke()
    }

    ctx.fillStyle = t.labelDim
    ctx.font = `${Math.max(6, R * 0.1)}px sans-serif`
    ctx.fillText('UP', cx + R * 0.12, cy - R * 0.52)
    ctx.fillText('DN', cx + R * 0.12, cy + R * 0.52)
    ctx.restore()
  }

  _drawNeedle(cx, cy, R, vvi) {
    const { ctx } = this
    const angle = Math.PI + fpmToAngle(vvi)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(-R * 0.1, 0)
    ctx.lineTo(R * 0.65, -R * 0.02)
    ctx.lineTo(R * 0.72,  0)
    ctx.lineTo(R * 0.65,  R * 0.02)
    ctx.closePath()
    ctx.fillStyle = this._theme.needle
    ctx.fill()
    ctx.restore()
  }

  _drawDigital(cx, cy, R, vvi) {
    const { ctx } = this
    const t = this._theme
    const bx = cx + R * 0.5, by = cy
    const bw = R * 0.7, bh = R * 0.22
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
    const sign = vvi >= 0 ? '+' : ''
    ctx.fillStyle = t.accent
    ctx.font = `bold ${Math.max(9, R * 0.18)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${sign}${Math.round(vvi)}`, bx, by)
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
