import { BaseInstrument } from './base.js'

export const DEFAULTS = {
  fuel_qty: 'sim/cockpit2/fuel/fuel_quantity',
}

export class FuelGauge extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs   = { ...DEFAULTS, ...datarefs }
    this._tanks   = []
    this._qty     = []
    this._qtyMax  = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  setAircraftProfile(profile) {
    this._tanks  = profile.fuelTanks ?? []
    this._qtyMax = {}
    for (const t of this._tanks) {
      if (t.capacity_kg > 0) this._qtyMax[t.idx] = t.capacity_kg
    }
    this._dirty = true
  }

  update(state) {
    const raw = state[this._drefs.fuel_qty]
    if (!Array.isArray(raw)) return
    this._qty = raw
    for (const t of this._tanks) {
      const v = raw[t.idx] ?? 0
      if (v > (this._qtyMax[t.idx] ?? 0)) this._qtyMax[t.idx] = v
    }
    this._hasData = true
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    const th = this._theme
    const n = this._tanks.length

    if (!this._hasData || n === 0) {
      ctx.fillStyle = th.panelBg
      ctx.fillRect(0, 0, w, h)
      _border(ctx, 1, 1, w - 2, h - 2, 4, th.frameBorder, th.panelBg)
      ctx.fillStyle = th.labelDim
      ctx.font = `bold ${Math.max(9, w * 0.09)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('FUEL', w / 2, h / 2)
      return
    }

    ctx.fillStyle = th.panelBg
    ctx.fillRect(0, 0, w, h)
    _border(ctx, 1, 1, w - 2, h - 2, 4, th.frameBorder, null)

    const titleH = Math.max(16, h * 0.07)
    ctx.fillStyle = th.labelDim
    ctx.font = `bold ${Math.max(8, titleH * 0.58)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('FUEL', w / 2, 3 + titleH / 2)
    ctx.strokeStyle = th.divider; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(6, titleH + 3); ctx.lineTo(w - 6, titleH + 3); ctx.stroke()

    const contentTop = titleH + 5
    const contentH   = h - contentTop - 3
    const rowH       = contentH / n
    const hPad       = Math.max(6, w * 0.07)
    const bx         = hPad
    const bw         = w - hPad * 2

    for (let i = 0; i < n; i++) {
      const tank   = this._tanks[i]
      const rawQty = this._qty[tank.idx] ?? 0
      const cap    = this._qtyMax[tank.idx] ?? tank.capacity_kg ?? 1
      const frac   = cap > 0 ? Math.max(0, Math.min(1, rawQty / cap)) : 0

      const rowTop = contentTop + i * rowH

      if (i > 0) {
        ctx.strokeStyle = th.divider; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(6, rowTop); ctx.lineTo(w - 6, rowTop); ctx.stroke()
      }

      const tickTop = rowTop + rowH * 0.11
      const tickH   = rowH   * 0.20
      const barTop  = tickTop + tickH + rowH * 0.03
      const barH    = rowH   * 0.37
      const labelY  = barTop + barH + rowH * 0.14

      const isRed   = frac < 0.15
      const isAmber = !isRed && frac < 0.25
      const fillBg    = isRed ? '#6a0e0e' : isAmber ? '#6a4900' : '#0b4d22'
      const fillHi    = isRed ? '#c01818' : isAmber ? '#c07800' : '#1a9040'
      const edgeGlow  = isRed ? '#f33'    : isAmber ? '#fa0'    : '#2d4'
      const textColor = isRed ? '#f55'    : isAmber ? '#fb2'    : '#4e4'

      for (let t = 0; t <= 4; t++) {
        const tx       = bx + bw * (t / 4)
        const isMajor  = t === 0 || t === 4
        const tth      = isMajor ? tickH : tickH * 0.60
        const ty       = tickTop + (tickH - tth)
        ctx.strokeStyle = isMajor ? th.accentDim : th.divider
        ctx.lineWidth   = isMajor ? 1.5 : 1
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty + tth); ctx.stroke()
      }

      const labelFS = Math.max(6, tickH * 0.68)
      ctx.font = `${labelFS}px sans-serif`
      ctx.textBaseline = 'middle'
      ctx.fillStyle = th.labelDim
      ctx.textAlign = 'left';  ctx.fillText('E', bx + 2,      tickTop + tickH * 0.5)
      ctx.textAlign = 'right'; ctx.fillText('F', bx + bw - 2, tickTop + tickH * 0.5)
      ctx.fillStyle = th.divider
      ctx.textAlign = 'center'
      for (const [q, lbl] of [[1, '¼'], [2, '½'], [3, '¾']]) {
        ctx.fillText(lbl, bx + bw * (q / 4), tickTop + tickH * 0.5)
      }

      _rr(ctx, bx, barTop, bw, barH, 3)
      ctx.fillStyle = '#0d0d0d'; ctx.fill()
      ctx.strokeStyle = '#000';  ctx.lineWidth = 1
      ctx.stroke()
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(bx,      barTop + barH)
      ctx.lineTo(bx + bw, barTop + barH)
      ctx.stroke()

      if (frac > 0.003) {
        const fillW = Math.max(4, bw * frac - 2)

        _rr(ctx, bx + 1, barTop + 1, fillW, barH - 2, 2)
        ctx.fillStyle = fillBg; ctx.fill()

        ctx.fillStyle = fillHi
        _rr(ctx, bx + 1, barTop + 1, fillW, Math.max(2, (barH - 2) * 0.38), 2)
        ctx.fill()

        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        _rr(ctx, bx + 1, barTop + 1, fillW, barH - 2, 2)
        ctx.fill()

        ctx.strokeStyle = edgeGlow; ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.75
        ctx.beginPath()
        ctx.moveTo(bx + 1 + fillW, barTop + 3)
        ctx.lineTo(bx + 1 + fillW, barTop + barH - 3)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1
      for (let q = 1; q <= 3; q++) {
        const qx = bx + bw * (q / 4)
        ctx.beginPath(); ctx.moveTo(qx, barTop + 1); ctx.lineTo(qx, barTop + barH - 1); ctx.stroke()
      }

      const pct   = Math.round(frac * 100)
      const pctFS = Math.max(7, barH * 0.52)
      ctx.font = `bold ${pctFS}px monospace`
      ctx.fillStyle    = textColor
      ctx.textBaseline = 'middle'
      if (frac > 0.35) {
        ctx.textAlign = 'right'
        ctx.fillText(`${pct}%`, bx + bw * frac - 4, barTop + barH / 2)
      } else {
        ctx.textAlign = 'left'
        ctx.fillText(`${pct}%`, bx + bw * frac + 4, barTop + barH / 2)
      }

      const tankFS = Math.max(7, rowH * 0.115)
      ctx.font = `${tankFS}px sans-serif`
      ctx.fillStyle    = isRed ? '#f55' : th.accentDim
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(tank.label, bx + bw / 2, labelY)
    }
  }
}

function _rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r) }
  else {
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }
}

function _border(ctx, x, y, w, h, r, stroke, fill) {
  _rr(ctx, x, y, w, h, r)
  if (fill)   { ctx.fillStyle   = fill;   ctx.fill()   }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke() }
}
