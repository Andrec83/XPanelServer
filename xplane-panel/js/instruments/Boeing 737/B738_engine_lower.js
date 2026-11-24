// 737 Lower Engine Display — laid out like the Laminar 737-800's lower display unit:
// N2 dials, fuel flow, oil pressure and oil temperature (digital with a small vertical
// scale), oil quantity. Uses X-Plane's standard engine datarefs, so it also works on
// other jets. (No VIB: X-Plane doesn't publish engine vibration.)

import { BaseInstrument } from '../base.js'
import { ENGINE_DREFS, pick, at, num, engineCount, dial, readout, text, vtape,
         unitFactor, thousands, UNITS_OPTION } from '../_glass.js'
import { EGT_DIAL } from './B738_engine_upper.js'

export const DEFAULTS = {
  num_engines: ENGINE_DREFS.num_engines,
  n2:          ENGINE_DREFS.n2,
  ff:          ENGINE_DREFS.ff,
  oil_p:       ENGINE_DREFS.oil_p,
  oil_t:       ENGINE_DREFS.oil_t,
  oil_q:       ENGINE_DREFS.oil_q,
  n2_red:      ENGINE_DREFS.n2_red,
  oilp_red_lo: ENGINE_DREFS.oilp_red_lo,
  oilp_red_hi: ENGINE_DREFS.oilp_red_hi,
  oilt_red:    ENGINE_DREFS.oilt_red,
}

const WHITE = '#f2f2f2', RED = '#ff2b2b', AMBER = '#ffb000', CYAN = '#4fd8ff'
const FILL  = 'rgba(160,150,205,0.75)'
const OIL_QTY_FULL = 20          // the 737 shows oil quantity in quarts (X-Plane gives a 0–1 ratio)

export class B738EngineLower extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._k = unitFactor(config.units)
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.n2 !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'ENGINE DATA —', w / 2, h / 2, Math.max(10, h * 0.04), '#666'); return }
    const v = this._v
    const n = engineCount(v.num_engines)
    const n2Red = num(v.n2_red, 105) || 105
    const pLo = num(v.oilp_red_lo, 13), pHi = num(v.oilp_red_hi, 100) || 100
    const tHi = num(v.oilt_red, 165) || 165

    const mid  = n === 2
    const gap  = mid ? w * 0.16 : 0
    const left = mid ? 0 : w * 0.12
    const colW = (w - gap - left) / n
    const colX = i => left + colW * (i + 0.5) + (mid && i >= 1 ? gap : 0)
    const labelX = mid ? w / 2 : w * 0.06
    const lab = Math.max(7, h * 0.034)
    const r  = Math.max(8, Math.min(colW * 0.3, h * 0.12))
    const bw = Math.min(colW * 0.32, r * 1.2), bh = Math.max(12, h * 0.06)

    const yN2 = h * 0.18, yFF = h * 0.4, yOP = h * 0.56, yOT = h * 0.73, yOQ = h * 0.88
    text(ctx, 'N2', labelX, yN2 + r * 0.75, lab, CYAN)
    text(ctx, 'FF', labelX, yFF, lab, CYAN)
    text(ctx, 'OIL', labelX, yOP - lab * 0.55, lab * 0.9, CYAN); text(ctx, 'PRESS', labelX, yOP + lab * 0.55, lab * 0.9, CYAN)
    text(ctx, 'OIL', labelX, yOT - lab * 0.55, lab * 0.9, CYAN); text(ctx, 'TEMP', labelX, yOT + lab * 0.55, lab * 0.9, CYAN)
    text(ctx, 'OIL QTY', labelX, yOQ, lab * 0.9, CYAN)

    for (let i = 0; i < n; i++) {
      const cx = colX(i)
      // engine 1 (left of the labels) shows box → scale; engine 2 mirrors it: scale → box
      const mirror = mid && i === 1
      const boxX  = mirror ? cx + colW * 0.06 : cx - colW * 0.06 - bw
      const tapeX = mirror ? cx - colW * 0.02 : cx + colW * 0.02
      const side  = mirror ? 'right' : 'left'

      const n2 = at(v.n2, i, NaN)
      dial(ctx, { cx, cy: yN2, r, value: n2, min: 0, max: n2Red * 1.04, ...EGT_DIAL, fill: true, red: n2Red, colors: { fill: FILL } })
      readout(ctx, { x: cx - r * 0.05, y: yN2 - r * 1.0, w: r * 1.2, h: r * 0.48, text: Number.isFinite(n2) ? n2.toFixed(1) : '--',
        color: n2 > n2Red ? RED : WHITE, border: WHITE })

      const ff = at(v.ff, i, NaN) * 3.6 * this._k
      readout(ctx, { x: boxX, y: yFF - bh / 2, w: bw, h: bh, text: thousands(ff), color: WHITE, border: WHITE, align: 'center' })

      const p = at(v.oil_p, i, NaN), pBad = p < pLo || p > pHi
      readout(ctx, { x: boxX, y: yOP - bh / 2, w: bw, h: bh, text: Number.isFinite(p) ? String(Math.round(p)) : '--', color: pBad ? RED : WHITE, border: pBad ? RED : WHITE, align: 'center' })
      vtape(ctx, { x: tapeX, y: yOP - h * 0.06, h: h * 0.12, value: p, min: 0, max: Math.max(100, pHi), redHi: pHi, redLo: pLo, side, color: pBad ? RED : WHITE })

      const t = at(v.oil_t, i, NaN), tBad = t > tHi
      readout(ctx, { x: boxX, y: yOT - bh / 2, w: bw, h: bh, text: Number.isFinite(t) ? String(Math.round(t)) : '--', color: tBad ? RED : WHITE, border: tBad ? RED : WHITE, align: 'center' })
      vtape(ctx, { x: tapeX, y: yOT - h * 0.06, h: h * 0.12, value: t, min: 0, max: tHi * 1.05, redHi: tHi, side, color: tBad ? RED : WHITE })

      const q = at(v.oil_q, i, NaN) * OIL_QTY_FULL
      readout(ctx, { x: boxX, y: yOQ - bh / 2, w: bw, h: bh, text: Number.isFinite(q) ? String(Math.round(q)) : '--', color: q < 4 ? AMBER : WHITE, border: WHITE, align: 'center' })
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b738_engine_lower',
  label:    '737 Lower Engine Display',
  icon:     '◑',
  order:    20,
  datarefs: DEFAULTS,
  options: [UNITS_OPTION],
}
