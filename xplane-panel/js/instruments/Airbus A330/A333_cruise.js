// A330 CRUISE (lower ECAM / SD page shown automatically in cruise), laid out as on the
// Laminar A330-300:
//   ENG — fuel used per engine and in total (1+2), oil quantity;
//   AIR — landing elevation, cabin differential pressure, cabin vertical speed and
//         altitude, cockpit / cabin zone temperatures and cargo temperatures;
//   and the permanent TAT / SAT / UTC / GW strip.
// Fuel, oil and pressurization use X-Plane's standard datarefs; the zone temperatures
// and landing elevation come from the Laminar A330 (optional).
//
// Not shown: VIB N1 / N2 / N3 — the Laminar A330 computes them internally and neither it
// nor X-Plane publishes vibration data. Oil quantity: X-Plane gives a ratio; 22 QT at
// full scale matches the Laminar A330.

import { BaseInstrument } from '../base.js'
import { ENGINE_DREFS, pick, num, at, engineCount, text } from '../_glass.js'
import { sdFooter, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN } from './_sd.js'

const L = 'laminar/A333/', P = 'sim/cockpit2/pressurization/indicators/'

const LAMINAR = {
  t_ckpt:   `${L}ckpt_temp`,
  t_fwd:    `${L}cabin_temp_fwd`,
  t_mid:    `${L}cabin_temp_mid`,
  t_aft:    `${L}cabin_temp_aft`,
  t_cargo:  `${L}cargo_temp`,
  t_bulk:   `${L}bulk_cargo_temp`,
  ldg_elev: `${L}PFD/landing_alt_capt_cal1`,
}

export const DEFAULTS = {
  num_engines: ENGINE_DREFS.num_engines,
  fuel_used:   'sim/cockpit2/fuel/fuel_totalizer_sum_engine_kg',
  oil_q:       ENGINE_DREFS.oil_q,
  delta_p:     `${P}pressure_diffential_psi`,
  cab_vs:      `${P}cabin_vvi_fpm`,
  cab_alt:     `${P}cabin_altitude_ft`,
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

export class A333Cruise extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._oilCap = Number(config.oil_capacity) > 0 ? Number(config.oil_capacity) : 22
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.fuel_used !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _underlined(s, x, y, size, align = 'left') {
    const { ctx } = this
    text(ctx, s, x, y, size, SD_WHITE, align)
    ctx.font = `${size.toFixed(1)}px Arial, sans-serif`
    const tw = ctx.measureText(s).width
    ctx.fillStyle = SD_WHITE
    ctx.fillRect(align === 'center' ? x - tw / 2 : x, y + size * 0.6, tw, Math.max(1, size * 0.08))
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'CRUISE DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, Math.min(h * 0.04, w * 0.04))
    const val = lab * 1.15
    const n = Math.min(2, engineCount(v.num_engines))
    const colX = i => i === 0 ? w * 0.3 : w * 0.72
    const dash = (x1, y) => { ctx.fillStyle = SD_WHITE; ctx.fillRect(x1, y, lab * 0.9, Math.max(1, lab * 0.1)) }

    this._underlined('CRUISE', w / 2, h * 0.055, lab * 1.3, 'center')

    // ── ENG ──
    this._underlined('ENG', w * 0.06, h * 0.12, lab * 1.05)
    const yF = h * 0.15
    text(ctx, 'F.USED', w / 2, yF, lab * 0.95, SD_WHITE)
    text(ctx, '1+2', w / 2, yF + lab * 1.0, lab * 0.8, SD_WHITE)
    let total = 0, ok = true
    for (let i = 0; i < n; i++) {
      const u = at(v.fuel_used, i, NaN)
      if (Number.isFinite(u)) total += u; else ok = false
      text(ctx, Number.isFinite(u) ? String(Math.round(u / 10) * 10) : 'XX', colX(i), yF, val, SD_GREEN)
      dash(i === 0 ? w * 0.36 : w * 0.585, yF)
    }
    text(ctx, ok ? String(Math.round(total / 10) * 10) : 'XX', w / 2, yF + lab * 2.1, val, SD_GREEN)
    text(ctx, 'KG', w / 2, yF + lab * 3.1, lab * 0.8, SD_CYAN)

    const yO = h * 0.37
    text(ctx, 'OIL', w / 2, yO - lab * 0.5, lab * 0.95, SD_WHITE)
    text(ctx, 'QT', w / 2, yO + lab * 0.5, lab * 0.85, SD_CYAN)
    for (let i = 0; i < n; i++) {
      const q = at(v.oil_q, i, NaN) * this._oilCap
      text(ctx, Number.isFinite(q) ? q.toFixed(1) : 'XX', colX(i), yO, val, SD_GREEN)
      dash(i === 0 ? w * 0.36 : w * 0.585, yO)
    }

    // ── AIR ──
    const yA = h * 0.53
    this._underlined('AIR', w * 0.06, yA, lab * 1.05)
    // landing elevation (AUTO: from the FMS)
    const le = f('ldg_elev')
    text(ctx, 'LDG ELEV', w * 0.48, yA + lab * 0.2, lab * 0.95, SD_WHITE)
    text(ctx, 'AUTO', w * 0.64, yA + lab * 0.2, lab * 0.95, SD_GREEN, 'left')
    text(ctx, Number.isFinite(le) ? String(Math.round(le / 10) * 10) : 'XX', w * 0.86, yA + lab * 0.2, val, SD_GREEN, 'right')
    text(ctx, 'FT', w * 0.88, yA + lab * 0.2, lab * 0.8, SD_CYAN, 'left')
    // cabin differential pressure
    const dp = f('delta_p'), yP = h * 0.6
    text(ctx, 'ΔP', w * 0.4, yP, lab, SD_WHITE, 'right')
    text(ctx, Number.isFinite(dp) ? dp.toFixed(1) : 'XX', w * 0.5, yP, val, SD_GREEN, 'right')
    text(ctx, 'PSI', w * 0.52, yP, lab * 0.8, SD_CYAN, 'left')
    // cabin V/S and altitude (right column)
    const vs = f('cab_vs'), ca = f('cab_alt')
    text(ctx, 'CAB V/S', w * 0.88, h * 0.645, lab * 0.95, SD_WHITE, 'center')
    text(ctx, Number.isFinite(vs) ? String(Math.round(vs / 50) * 50) : 'XX', w * 0.82, h * 0.645 + lab * 1.3, val, SD_GREEN, 'right')
    text(ctx, 'FT/MIN', w * 0.84, h * 0.645 + lab * 1.3, lab * 0.8, SD_CYAN, 'left')
    text(ctx, 'CAB ALT', w * 0.88, h * 0.745, lab * 0.95, SD_WHITE, 'center')
    text(ctx, Number.isFinite(ca) ? String(Math.round(ca / 10) * 10) : 'XX', w * 0.82, h * 0.745 + lab * 1.3, val, SD_GREEN, 'right')
    text(ctx, 'FT', w * 0.84, h * 0.745 + lab * 1.3, lab * 0.8, SD_CYAN, 'left')

    this._temps(lab, val)
    sdFooter(ctx, w, h, v, lab)
  }

  // cockpit + cabin zones (box), cargo temperatures under the forward and aft zones
  _temps(lab, val) {
    const { ctx, w, h } = this, f = k => num(this._v[k], NaN)
    if (this._v.t_ckpt === undefined) return
    const yL = h * 0.69, yV = yL + lab * 1.25
    const xs = { t_ckpt: w * 0.1, t_fwd: w * 0.27, t_mid: w * 0.4, t_aft: w * 0.55 }
    const t = k => Number.isFinite(f(k)) ? String(Math.round(f(k))) : 'XX'
    for (const [k, label] of [['t_ckpt', 'CKPT'], ['t_fwd', 'FWD'], ['t_mid', 'MID'], ['t_aft', 'AFT']]) {
      text(ctx, label, xs[k], yL, lab * 0.95, SD_WHITE)
      text(ctx, t(k), xs[k], yV, val, SD_GREEN)
    }
    text(ctx, '°C', w * 0.66, yV - lab * 0.6, lab * 0.85, SD_CYAN, 'left')
    // fuselage outline: open cabin from FWD to the tail curve, nose curve around CKPT,
    // zone dividers on the floor line
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, lab * 0.09)
    const top = yL - lab * 0.85, bot = yV + lab * 0.85
    ctx.beginPath()
    ctx.moveTo(w * 0.2, bot); ctx.lineTo(w * 0.2, top); ctx.lineTo(w * 0.6, top)
    ctx.quadraticCurveTo(w * 0.64, top, w * 0.655, yV - lab * 0.4)                // tail
    ctx.moveTo(w * 0.035, bot); ctx.quadraticCurveTo(w * 0.015, bot, w * 0.025, yV - lab * 0.2)   // nose
    ctx.moveTo(w * 0.035, bot); ctx.lineTo(w * 0.63, bot)                          // floor
    for (const x of [0.335, 0.475]) { ctx.moveTo(w * x, bot - lab * 0.5); ctx.lineTo(w * x, bot + lab * 0.5) }
    ctx.stroke()
    // cargo: forward under FWD, bulk (aft) under AFT, each in a bracket hanging from the floor
    const yC = bot + lab * 1.1
    for (const [k, x0, x1] of [['t_cargo', 0.2, 0.335], ['t_bulk', 0.475, 0.61]]) {
      ctx.beginPath()
      ctx.moveTo(w * x0, bot); ctx.lineTo(w * x0, yC + lab * 0.75); ctx.lineTo(w * x1, yC + lab * 0.75); ctx.lineTo(w * x1, yC - lab * 0.6)
      ctx.stroke()
      text(ctx, t(k), w * (x0 + x1) / 2, yC, val, SD_GREEN)
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_cruise',
  label:    'A330 CRUISE (SD page)',
  icon:     '☁',
  order:    23,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'delta_p', 'cab_vs', 'cab_alt', ...Object.keys(SD_FOOTER_DREFS)],
  options: [
    { key: 'oil_capacity', label: 'Oil quantity at full scale (QT)', type: 'number', default: 22,
      help: 'X-Plane gives oil quantity as a ratio; this is the quantity shown when the tank is full.' },
  ],
}
