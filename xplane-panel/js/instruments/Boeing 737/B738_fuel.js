// 737 Fuel — tank quantities (TANK 1 / CTR / TANK 2) with LOW alerts, total fuel,
// fuel used and fuel flow, in the style of the 737NG fuel indication.
// Tanks are identified from X-Plane's tank geometry datarefs (left / centre / right),
// so it adapts to the loaded aircraft instead of assuming tank indices.

import { BaseInstrument } from '../base.js'
import { FUEL_DREFS, pick, at, num, engineCount, fuelTanks, dial, readout, text,
         unitFactor, thousands, UNITS_OPTION } from '../_glass.js'

export const DEFAULTS = { ...FUEL_DREFS }

const WHITE = '#f2f2f2', AMBER = '#ffb000', CYAN = '#4fd8ff'
const LOW_MAIN_KG = 453          // 737NG "LOW" alert: main tank below 1000 lb (compared in kg)

export class B738Fuel extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._k = unitFactor(config.units)
    this._unit = config.units === 'kg' ? 'KGS' : 'LBS'
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.fuel_qty !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'FUEL DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v
    const tanks = fuelTanks(v)
    if (!tanks.length) { text(ctx, 'NO FUEL TANKS', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }

    // name main tanks 1, 2 … left to right; centre / trim keep their role
    let mainNo = 0
    const names = tanks.map(t => t.side === 'C' ? 'CTR' : t.side === 'T' ? 'TRIM' : `TANK ${++mainNo}`)

    text(ctx, 'FUEL', w / 2, h * 0.07, Math.max(8, h * 0.06), CYAN)
    text(ctx, `${this._unit} X 1000`, w * 0.97, h * 0.07, Math.max(7, h * 0.045), CYAN, 'right')

    const cols = tanks.length
    const colW = w / cols
    const r = Math.max(8, Math.min(colW * 0.34, h * 0.2))
    const cy = h * 0.38
    tanks.forEach((t, i) => {
      const cx = colW * (i + 0.5)
      const low = t.side !== 'C' && t.side !== 'T' && t.kg < LOW_MAIN_KG
      dial(ctx, { cx, cy, r, value: t.kg, min: 0, max: t.cap || Math.max(t.kg, 1), start: 150, sweep: 240, fill: true,
        ticks: [0, (t.cap || 1) / 2, t.cap || 1], colors: { needle: low ? AMBER : WHITE } })
      readout(ctx, { x: cx - r * 0.75, y: cy + r * 0.62, w: r * 1.5, h: r * 0.42, text: thousands(t.kg * this._k / 1000),
        color: low ? AMBER : WHITE, border: low ? AMBER : WHITE, align: 'center' })
      text(ctx, names[i], cx, cy + r * 1.35, Math.max(7, r * 0.27), CYAN)
      if (low) text(ctx, 'LOW', cx, cy - r * 0.35, Math.max(7, r * 0.3), AMBER, 'center', undefined, true)
    })

    // bottom: TOTAL, FUEL USED, FUEL FLOW
    const n = engineCount(v.num_engines)
    let ffSum = 0
    for (let i = 0; i < n; i++) ffSum += at(v.ff, i, 0)
    const total = num(v.fuel_total, tanks.reduce((s, t) => s + t.kg, 0))
    const items = [
      ['TOTAL', thousands(total * this._k / 1000)],
      ['USED', thousands(num(v.fuel_used, 0) * this._k / 1000)],
      ['FF /H', thousands(ffSum * 3.6 * this._k)],
    ]
    const by = h * 0.86, bw = w / items.length
    items.forEach(([label, val], i) => {
      const x = bw * i
      text(ctx, label, x + bw / 2, by - h * 0.07, Math.max(7, h * 0.042), CYAN)
      readout(ctx, { x: x + bw * 0.12, y: by - h * 0.035, w: bw * 0.76, h: h * 0.085, text: val, color: WHITE, border: WHITE, align: 'center' })
    })
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b738_fuel',
  label:    '737 Fuel',
  icon:     '⛽',
  order:    30,
  datarefs: DEFAULTS,
  options: [UNITS_OPTION],
}
