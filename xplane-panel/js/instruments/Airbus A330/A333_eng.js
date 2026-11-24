// A330 ENGINE (lower ECAM / SD page), laid out as on the Laminar A330-300 — N2, fuel
// used, oil quantity, oil pressure and oil temperature per engine, nacelle temperature
// dials (Trent) and ignition, plus the permanent TAT / SAT / UTC / GW strip.
// Oil and ignition use X-Plane's standard engine datarefs (also work on other twins); the
// nacelle temperatures come from the Laminar A330 (optional).
//
// Not shown: engine vibration (neither X-Plane nor the Laminar A330 publishes it).
// Oil quantity: X-Plane gives a ratio; 22 QT at full scale matches the Laminar A330.

import { BaseInstrument } from '../base.js'
import { ENGINE_DREFS, pick, num, at, engineCount, text } from '../_glass.js'
import { sdTitle, sdFooter, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER, SD_RED } from './_sd.js'

const LAMINAR = {
  ip1:  'laminar/A333/trent700/n2_eng1',     // Trent intermediate-pressure spool (SD "N2")
  ip2:  'laminar/A333/trent700/n2_eng2',
  nac1: 'laminar/A333/trent700/nacelle_temp1',
  nac2: 'laminar/A333/trent700/nacelle_temp2',
}

export const DEFAULTS = {
  num_engines: ENGINE_DREFS.num_engines,
  n2:          ENGINE_DREFS.n2,
  oil_p:       ENGINE_DREFS.oil_p,
  oil_t:       ENGINE_DREFS.oil_t,
  oil_q:       ENGINE_DREFS.oil_q,
  oilp_red_lo: ENGINE_DREFS.oilp_red_lo,
  oilp_red_hi: ENGINE_DREFS.oilp_red_hi,
  oilt_red:    ENGINE_DREFS.oilt_red,
  fuel_used:   'sim/cockpit2/fuel/fuel_totalizer_sum_engine_kg',   // per engine
  ign_on:      'sim/cockpit2/engine/actuators/igniter_on',
  ign_spark:   'sim/cockpit2/engine/indicators/igniter_sparking',
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

export class A333Eng extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._oilCap = Number(config.oil_capacity) > 0 ? Number(config.oil_capacity) : 22
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.oil_p !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'ENGINE DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v
    const lab = Math.max(7, Math.min(h * 0.04, w * 0.04))
    const n = Math.min(2, engineCount(v.num_engines))
    const colX = i => n === 1 ? w / 2 : (i === 0 ? w * 0.3 : w * 0.72)
    const val = lab * 1.15
    const dash = y => { ctx.fillStyle = SD_WHITE; for (const x of [w * 0.38, w * 0.58]) ctx.fillRect(x, y, lab * 0.9, Math.max(1, lab * 0.1)) }
    const row = (y, label, unit, get, fmt, color = () => SD_GREEN) => {
      if (label) text(ctx, label, w / 2, y - lab * 0.45, lab * 0.95, SD_WHITE)
      if (unit) text(ctx, unit, w / 2, label ? y + lab * 0.55 : y - lab * 0.45, lab * 0.85, SD_CYAN)   // unit alone: on the value line
      dash(y - lab * 0.45)
      for (let i = 0; i < n; i++) {
        const x = get(i)
        text(ctx, Number.isFinite(x) ? fmt(x) : 'XX', colX(i), y - lab * 0.45, val, color(x))
      }
    }

    sdTitle(ctx, 'ENGINE', w, h, lab)

    // N2 (Trent intermediate spool, Laminar) — X-Plane's N2 otherwise
    const trent = v.ip1 !== undefined
    row(h * 0.07, 'N2', '%', i => trent ? num(v[`ip${i + 1}`], NaN) : at(v.n2, i, NaN), x => x.toFixed(1))
    // fuel used per engine
    row(h * 0.165, 'F.USED', 'KG', i => at(v.fuel_used, i, NaN), x => String(Math.round(x / 10) * 10))

    // OIL: quantity and pressure arcs
    text(ctx, 'OIL', w / 2, h * 0.245, lab * 0.95, SD_WHITE)
    const r = Math.min(w * 0.1, h * 0.075)
    const yQ = h * 0.33, yP = h * 0.44
    text(ctx, 'QT', w / 2, yQ - r * 0.1, lab * 0.85, SD_CYAN)
    text(ctx, 'PSI', w / 2, yP - r * 0.1, lab * 0.85, SD_CYAN)
    const pLo = num(v.oilp_red_lo, 0), pHi = num(v.oilp_red_hi, 0)
    const pMax = Math.max(100, Math.ceil((pHi > 0 ? pHi : Math.max(...[0, 1].map(i => at(v.oil_p, i, 0))) * 1.3) / 50) * 50)
    for (let i = 0; i < n; i++) {
      const q = at(v.oil_q, i, NaN) * this._oilCap
      this._arc(colX(i), yQ, r, q / this._oilCap, 0, lab)
      text(ctx, Number.isFinite(q) ? q.toFixed(1) : 'XX', colX(i), yQ - r * 0.1, val, SD_GREEN)
      const p = at(v.oil_p, i, NaN), low = pLo > 0 && p < pLo
      this._arc(colX(i), yP, r, p / pMax, pLo > 0 ? pLo / pMax : 0, lab, low ? SD_RED : SD_GREEN)
      text(ctx, Number.isFinite(p) ? String(Math.round(p)) : 'XX', colX(i), yP - r * 0.1, val, low ? SD_RED : SD_GREEN)
    }

    // OIL temperature
    const tRed = num(v.oilt_red, 0)
    row(h * 0.535, '', '°C', i => at(v.oil_t, i, NaN), x => String(Math.round(x)), x => tRed > 0 && x > tRed ? SD_AMBER : SD_GREEN)

    // ignition (while the igniters are on) — in the space the real page uses for VIB
    if ([0, 1].some(i => at(v.ign_on, i, 0) > 0 || at(v.ign_spark, i, 0) > 0)) {
      const yI = h * 0.62
      text(ctx, 'IGN', w / 2, yI, lab, SD_WHITE)
      for (let i = 0; i < n; i++) if (at(v.ign_on, i, 0) > 0 || at(v.ign_spark, i, 0) > 0) text(ctx, 'A B', colX(i), yI, val, SD_GREEN)
    }

    // NAC temperature dials (Trent), 0–350 °C
    if (v.nac1 !== undefined) {
      const yN = h * 0.78, rn = r * 0.75
      text(ctx, 'NAC', w / 2, h * 0.7, lab * 0.95, SD_WHITE)
      text(ctx, '°C', w / 2, h * 0.7 + lab * 1.0, lab * 0.8, SD_CYAN)
      for (let i = 0; i < n; i++) {
        const t = num(v[`nac${i + 1}`], NaN), cx = colX(i)
        ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1.5, lab * 0.12)
        ctx.beginPath(); ctx.arc(cx, yN, rn, Math.PI, Math.PI * 2); ctx.stroke()
        if (Number.isFinite(t)) {
          const a = Math.PI + Math.PI * Math.max(0, Math.min(1, t / 350))
          ctx.strokeStyle = SD_GREEN; ctx.lineWidth = Math.max(1.5, lab * 0.15)
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rn * 0.35, yN + Math.sin(a) * rn * 0.35); ctx.lineTo(cx + Math.cos(a) * rn * 1.1, yN + Math.sin(a) * rn * 1.1); ctx.stroke()
        }
        if (i === 0) text(ctx, '0', cx - rn, yN + lab * 0.8, lab * 0.85, SD_WHITE)
        if (i === n - 1) text(ctx, '350', cx + rn, yN + lab * 0.8, lab * 0.85, SD_WHITE)
      }
    }

    sdFooter(ctx, w, h, v, lab)
  }

  // Airbus SD arc gauge: white arc, optional red sector from the start, value shown as a
  // short green mark across the arc
  _arc(cx, cy, r, frac, redFrac, lab, color = SD_GREEN) {
    const { ctx } = this
    const a0 = Math.PI * 0.95, sweep = Math.PI * 1.1
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1.5, lab * 0.12)
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + sweep); ctx.stroke()
    if (redFrac > 0) {
      ctx.strokeStyle = SD_RED; ctx.lineWidth = Math.max(2.5, lab * 0.25)
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + sweep * Math.min(1, redFrac)); ctx.stroke()
    }
    if (!Number.isFinite(frac)) return
    const a = a0 + sweep * Math.max(0, Math.min(1, frac))
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, lab * 0.18)
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75); ctx.lineTo(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2); ctx.stroke()
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_eng',
  label:    'A330 ENGINE (SD page)',
  icon:     '⚙',
  order:    22,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'oilp_red_lo', 'oilp_red_hi', 'oilt_red', 'ign_on', 'ign_spark', ...Object.keys(SD_FOOTER_DREFS)],
  options: [
    { key: 'oil_capacity', label: 'Oil quantity at full scale (QT)', type: 'number', default: 22,
      help: 'X-Plane gives oil quantity as a ratio; this is the quantity shown when the tank is full.' },
  ],
}
