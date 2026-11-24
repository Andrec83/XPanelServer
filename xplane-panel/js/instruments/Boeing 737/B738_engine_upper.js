// 737 Upper Engine Display — laid out like the Laminar 737-800's upper display unit:
// TAT, N1 dials (scale starts under the digital box and runs clockwise), EGT dials,
// fuel flow, and the FUEL QTY box. Uses X-Plane's standard engine/fuel datarefs (so it
// also works on other jets); only the N1-limit bug reads Laminar 737 datarefs (optional).

import { BaseInstrument } from '../base.js'
import { ENGINE_DREFS, FUEL_DREFS, pick, at, num, engineCount, fuelTanks, dial, readout, text,
         unitFactor, thousands, UNITS_OPTION } from '../_glass.js'

export const DEFAULTS = {
  num_engines: ENGINE_DREFS.num_engines,
  n1:        ENGINE_DREFS.n1,
  egt:       ENGINE_DREFS.egt,
  ff:        ENGINE_DREFS.ff,
  reverser:  ENGINE_DREFS.reverser,
  n1_red:    ENGINE_DREFS.n1_red,
  egt_red:   ENGINE_DREFS.egt_red,
  tat:       'sim/cockpit2/gauges/indicators/TAT_pilot',
  fuel_qty:  FUEL_DREFS.fuel_qty,
  tank_rat:  FUEL_DREFS.tank_rat,
  tank_x:    FUEL_DREFS.tank_x,
  tank_z:    FUEL_DREFS.tank_z,
  fuel_cap:  FUEL_DREFS.fuel_cap,
  fuel_total:FUEL_DREFS.fuel_total,
  n1_limit1: 'laminar/B738/EICAS/disp/n1_limit_eng1',
  n1_limit2: 'laminar/B738/EICAS/disp/n1_limit_eng2',
}

const WHITE = '#f2f2f2', RED = '#ff2b2b', AMBER = '#ffb000', GREEN = '#2bff4a', CYAN = '#4fd8ff'
const FILL  = 'rgba(160,150,205,0.75)'          // the lavender "filled sector" of the 737 dials

// N1: 0 just below the digital box (~1:30), clockwise round the bottom, 110 % at ~10 o'clock
export const N1_DIAL  = { start: -45, sweep: 255 }
// EGT / N2: starts at 3 o'clock, clockwise, redline at ~10:30
export const EGT_DIAL = { start: 0, sweep: 220 }

export class B738EngineUpper extends BaseInstrument {
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
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.n1 !== undefined; this._dirty = true }
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
    const n1Red  = num(v.n1_red, 100) || 100
    const egtRed = num(v.egt_red, 950) || 950

    // engines use the left ~62 % (as on the real display); fuel box bottom right
    const engW = w * 0.62
    const lab  = Math.max(7, h * 0.035)
    text(ctx, 'TAT', w * 0.03, h * 0.05, lab, CYAN, 'left')
    const tat = num(v.tat, NaN)
    text(ctx, Number.isFinite(tat) ? `${tat >= 0 ? '+' : ''}${Math.round(tat)}c` : '---', w * 0.03 + lab * 2.4, h * 0.05, lab * 1.15, WHITE, 'left')

    const mid  = n === 2
    const gap  = mid ? engW * 0.1 : 0
    const left = mid ? 0 : engW * 0.08
    const colW = (engW - gap - left) / n
    const colX = i => left + colW * (i + 0.42) + (mid && i >= 1 ? gap : 0)
    const labelX = mid ? engW / 2 : engW * 0.04
    const r = Math.max(8, Math.min(colW * 0.36, h * 0.135))
    const box = (cx, cy, txt, color, dy) => readout(ctx, { x: cx - r * 0.05, y: cy - r * dy, w: r * 1.2, h: r * 0.48, text: txt, color, border: WHITE })

    const yN1 = h * 0.24, yEGT = h * 0.53, yFF = h * 0.76
    text(ctx, 'N1', labelX, yN1 + r * 0.5, lab, CYAN)
    text(ctx, 'EGT', labelX, yEGT + r * 0.75, lab, CYAN)
    text(ctx, 'FF', labelX, yFF, lab, CYAN)

    for (let i = 0; i < n; i++) {
      const cx = colX(i)
      // N1
      const n1 = at(v.n1, i, NaN)
      const lim = i < 2 ? num(i === 0 ? v.n1_limit1 : v.n1_limit2, 0) : 0
      dial(ctx, { cx, cy: yN1, r, value: n1, min: 0, max: 110, ...N1_DIAL, fill: true, red: n1Red,
        bug: lim > 0 ? lim : 0, colors: { fill: FILL, bug: GREEN },
        ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], labels: [[20, '2'], [40, '4'], [60, '6'], [80, '8'], [100, '10']] })
      box(cx, yN1, Number.isFinite(n1) ? n1.toFixed(1) : '--', n1 > n1Red ? RED : WHITE, 1.22)
      const rev = at(v.reverser, i, 0)
      if (rev > 0.05) text(ctx, 'REV', cx + r * 0.55, yN1 - r * 1.45, r * 0.32, rev > 0.9 ? GREEN : AMBER, 'center', undefined, true)
      // EGT
      const egt = at(v.egt, i, NaN)
      dial(ctx, { cx, cy: yEGT, r, value: egt, min: 0, max: egtRed * 1.04, ...EGT_DIAL, fill: true, red: egtRed,
        colors: { fill: FILL } })
      box(cx, yEGT, Number.isFinite(egt) ? String(Math.round(egt)) : '--', egt > egtRed ? RED : WHITE, 1.0)
      // FF (thousands per hour)
      const ff = at(v.ff, i, NaN) * 3.6 * this._k
      readout(ctx, { x: cx - r * 0.55, y: yFF - r * 0.28, w: r * 1.15, h: r * 0.56, text: thousands(ff), color: WHITE, border: WHITE, align: 'center' })
    }

    // FUEL QTY box (thousands)
    const tanks = fuelTanks(v)
    if (tanks.length) {
      const bx = w * 0.64, bw = w * 0.34, by = h * 0.8, bh = h * 0.09
      ctx.strokeStyle = CYAN; ctx.lineWidth = Math.max(1, h * 0.004)
      ctx.strokeRect(bx, by, bw, bh)
      ctx.fillStyle = '#000'
      const title = `FUEL QTY - ${this._unit} X 1000`
      const ts = Math.min(lab * 0.75, bw / (title.length * 0.62))
      ctx.font = `${ts.toFixed(1)}px Arial`
      const tw = ctx.measureText(title).width
      ctx.fillRect(bx + bw / 2 - tw / 2 - 3, by - ts * 0.6, tw + 6, ts * 1.2)
      text(ctx, title, bx + bw / 2, by, ts, CYAN)
      const vals = tanks.map(t => thousands(t.kg * this._k / 1000)).join('  ')
      text(ctx, vals, bx + bw / 2, by + bh * 0.58, Math.min(bh * 0.55, bw / (vals.length * 0.6)), WHITE)
      const total = num(v.fuel_total, tanks.reduce((s, t) => s + t.kg, 0)) * this._k / 1000
      text(ctx, 'TOTAL', bx + bw * 0.05, by + bh * 1.5, lab * 0.8, CYAN, 'left')
      text(ctx, thousands(total), bx + bw * 0.05 + lab * 3.4, by + bh * 1.5, lab * 1.3, WHITE, 'left')
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b738_engine_upper',
  label:    '737 Upper Engine Display',
  icon:     '◔',
  order:    10,
  datarefs: DEFAULTS,
  optionalDatarefs: ['n1_limit1', 'n1_limit2'],   // Laminar 737 only — the N1-limit bug
  options: [UNITS_OPTION],
}
