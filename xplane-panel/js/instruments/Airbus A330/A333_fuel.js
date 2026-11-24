// A330 FUEL (lower ECAM / SD page), laid out as on the Laminar A330-300: fuel used per
// engine and in total, engine LP valves, crossfeed valve, wing and centre tank pumps, the
// wing outline with outer / inner / collector / centre quantities and tank temperatures,
// APU feed, trim tank line valve and quantity, total fuel flow, FOB, and the permanent
// TAT / SAT / UTC / GW strip.
// Tanks are identified from X-Plane's tank geometry datarefs (lateral position; a centred
// tank far aft is the trim tank), so nothing depends on tank indices. Pumps, crossfeed,
// transfers and total flow come from the Laminar A330 (optional).
//
// Collector cells: X-Plane doesn't model them; the value shown is 1200 kg while the inner
// tank holds at least that much (as on the cockpit page), otherwise the inner tank content.

import { BaseInstrument } from '../base.js'
import { FUEL_DREFS, pick, num, at, fuelTanks, text } from '../_glass.js'
import { sdTitle, sdFooter, sdValve, sdLine, sdTri, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER } from './_sd.js'

const F = 'laminar/A333/ecam/fuel/', FB = 'laminar/A333/fuel/buttons/'
const COLLECTOR_KG = 1200

const LAMINAR = {
  xfeed: 'laminar/A333/fuel/crossfeed_valve_pos',
  burn:  `${F}total_kg_min_burn`,
  trim_xfer: `${F}trim_xfer_enum`,
  pump_L1: `${F}pump_L1_enum`, pump_L2: `${F}pump_L2_enum`, pump_Lstby: `${F}pump_Lstby_enum`,
  pump_R1: `${F}pump_R1_enum`, pump_R2: `${F}pump_R2_enum`, pump_Rstby: `${F}pump_Rstby_enum`,
  pump_CL: `${F}pump_CL_enum`, pump_CR: `${F}pump_CR_enum`,
  // pushbuttons (1 = on): a pump switched off shows amber, as on the cockpit page
  btn_L1: `${FB}left1_pump_pos`, btn_L2: `${FB}left2_pump_pos`, btn_Lstby: `${FB}left_stby_pump_pos`,
  btn_R1: `${FB}right1_pump_pos`, btn_R2: `${FB}right2_pump_pos`, btn_Rstby: `${FB}right_stby_pump_pos`,
  btn_CL: `${FB}center_left_pump_pos`, btn_CR: `${FB}center_right_pump_pos`,
  master1: 'laminar/A333/switches/engine1_start_pos', master2: 'laminar/A333/switches/engine2_start_pos',
}

export const DEFAULTS = {
  ...FUEL_DREFS,
  used_eng:  'sim/cockpit2/fuel/fuel_totalizer_sum_engine_kg',
  tank_temp: 'sim/cockpit2/fuel/fuel_temp_at_fuel_tank',
  lp_closed_l: 'sim/cockpit2/fuel/firewall_closed_left',
  lp_closed_r: 'sim/cockpit2/fuel/firewall_closed_right',
  apu_running: 'sim/cockpit2/electrical/APU_running',
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

export class A333Fuel extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
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
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, Math.min(h * 0.038, w * 0.038))
    const lw = Math.max(1.5, lab * 0.15), thin = Math.max(1, lab * 0.1)
    const kg = x => Number.isFinite(x) ? String(Math.round(x / 10) * 10) : 'XX'

    sdTitle(ctx, 'FUEL', w, h, lab)

    // ── fuel used: engine 1 — F.USED 1+2 — engine 2 ──
    text(ctx, '1', w * 0.27, h * 0.045, lab * 1.15, SD_WHITE)
    text(ctx, '2', w * 0.73, h * 0.055, lab * 1.15, SD_WHITE)
    sdLine(ctx, [[w * 0.32, h * 0.045], [w * 0.4, h * 0.045]], SD_WHITE, thin)
    sdLine(ctx, [[w * 0.6, h * 0.05], [w * 0.68, h * 0.055]], SD_WHITE, thin)
    text(ctx, 'F.USED', w * 0.5, h * 0.045, lab * 0.85, SD_WHITE)
    text(ctx, '1+2', w * 0.5, h * 0.075, lab * 0.75, SD_WHITE)
    const u1 = at(v.used_eng, 0, NaN), u2 = at(v.used_eng, 1, NaN)
    text(ctx, kg(u1), w * 0.27, h * 0.09, lab * 1.05, SD_GREEN)
    text(ctx, kg(u2), w * 0.73, h * 0.1, lab * 1.05, SD_GREEN)
    text(ctx, kg(Number.isFinite(u1) && Number.isFinite(u2) ? u1 + u2 : f('fuel_used')), w * 0.5, h * 0.115, lab * 1.05, SD_GREEN)
    text(ctx, 'KG', w * 0.5, h * 0.15, lab * 0.8, SD_CYAN)

    // ── engine LP valves, feed manifolds, crossfeed ──
    const yLP = h * 0.19, yMan = h * 0.255, yPump = h * 0.32, vr = lab * 0.85
    // LP valve: open while the engine master is ON and the fire shut-off isn't closed
    const lpOpen = n => num(v[n === 1 ? 'lp_closed_l' : 'lp_closed_r'], 0) < 0.5 && (v[`master${n}`] === undefined || num(v[`master${n}`], 1) > 0)
    const lp = [[w * 0.27, lpOpen(1)], [w * 0.73, lpOpen(2)]]
    for (const [x, open] of lp) {
      sdLine(ctx, [[x, h * 0.12], [x, yLP - vr]], SD_GREEN, lw)
      sdValve(ctx, x, yLP, vr, open, 'v', open ? SD_GREEN : SD_AMBER)
      sdLine(ctx, [[x, yLP + vr], [x, yMan]], SD_GREEN, lw)
    }
    const pumpsL = [['pump_Lstby', 0.19], ['pump_L1', 0.29], ['pump_L2', 0.35]]
    const pumpsR = [['pump_R1', 0.65], ['pump_R2', 0.71], ['pump_Rstby', 0.81]]
    for (const pumps of [pumpsL, pumpsR]) {
      sdLine(ctx, [[w * pumps[0][1], yMan], [w * pumps[2][1], yMan]], SD_GREEN, lw)
      for (const [k, fx] of pumps) {
        sdLine(ctx, [[w * fx, yMan], [w * fx, yPump - lab * 0.65]], SD_GREEN, lw)
        this._pump(w * fx, yPump, lab, v[k], v[k.replace('pump_', 'btn_')])
      }
    }
    const xOpen = num(v.xfeed, 0) > 0.5
    sdValve(ctx, w * 0.5, h * 0.22, vr, xOpen, 'h')
    sdLine(ctx, [[w * 0.5 - vr * 1.7, h * 0.22], [w * 0.5 - vr, h * 0.22]], SD_GREEN, lw)
    sdLine(ctx, [[w * 0.5 + vr, h * 0.22], [w * 0.5 + vr * 1.7, h * 0.22]], SD_GREEN, lw)
    if (xOpen) {
      sdLine(ctx, [[w * 0.35, yMan], [w * 0.4, yMan], [w * 0.4, h * 0.22], [w * 0.5 - vr * 1.7, h * 0.22]], SD_GREEN, lw)
      sdLine(ctx, [[w * 0.5 + vr * 1.7, h * 0.22], [w * 0.6, h * 0.22], [w * 0.6, yMan], [w * 0.65, yMan]], SD_GREEN, lw)
    }

    // ── wing outline and tanks ──
    this._wing(thin)
    for (const [k, fx] of [['pump_CL', 0.46], ['pump_CR', 0.54]]) this._pump(w * fx, h * 0.355, lab, v[k], v[k.replace('pump_', 'btn_')])

    const tanks = fuelTanks(v)
    const left = tanks.filter(t => t.side === 'L'), right = tanks.filter(t => t.side === 'R')   // left: outer → inner; right: inner → outer
    const ctr = tanks.filter(t => t.side === 'C'), trim = tanks.filter(t => t.side === 'T')
    const sum = list => list.reduce((s, t) => s + t.kg, 0)
    const lOuter = left.length > 1 ? left[0] : null, lInner = left[left.length - 1]
    const rInner = right[0], rOuter = right.length > 1 ? right[right.length - 1] : null
    const big = lab * 1.05, small = lab * 0.95
    if (lOuter) text(ctx, kg(lOuter.kg), w * 0.105, h * 0.39, big, SD_GREEN)
    if (rOuter) text(ctx, kg(rOuter.kg), w * 0.895, h * 0.39, big, SD_GREEN)
    for (const [t, xc, xm] of [[lInner, 0.335, 0.29], [rInner, 0.665, 0.71]]) {
      if (!t) continue
      text(ctx, kg(Math.min(t.kg, COLLECTOR_KG)), w * xc, h * 0.385, small, SD_GREEN)
      text(ctx, kg(t.kg), w * xm, h * 0.44, big, SD_GREEN)
    }
    text(ctx, kg(sum(ctr)), w * 0.55, h * 0.455, big, SD_GREEN)

    // tank temperatures: left outer and inner, right inner
    const temp = t => t ? at(v.tank_temp, t.idx, NaN) : NaN
    const tStr = x => Number.isFinite(x) ? String(Math.round(x)) : ''
    if (lOuter && tStr(temp(lOuter))) { text(ctx, tStr(temp(lOuter)), w * 0.1, h * 0.535, lab * 0.9, SD_GREEN, 'right'); text(ctx, '°C', w * 0.11, h * 0.535, lab * 0.8, SD_CYAN, 'left') }
    if (lInner) text(ctx, tStr(temp(lInner)), w * 0.23, h * 0.535, lab * 0.9, SD_GREEN)
    if (rInner && tStr(temp(rInner))) { text(ctx, tStr(temp(rInner)), w * 0.8, h * 0.555, lab * 0.9, SD_GREEN, 'right'); text(ctx, '°C', w * 0.81, h * 0.555, lab * 0.8, SD_CYAN, 'left') }

    // ── APU feed and trim tank ──
    sdLine(ctx, [[w * 0.27, h * 0.62], [w * 0.73, h * 0.64]], SD_WHITE, thin)
    text(ctx, 'APU', w * 0.42, h * 0.655, lab * 0.85, SD_WHITE, 'right')
    sdTri(ctx, w * 0.45, h * 0.655, lab * 0.4, 'down', num(v.apu_running, 0) > 0 ? SD_GREEN : SD_WHITE)
    const trimOk = Math.round(num(v.trim_xfer, 0)) < 2
    sdLine(ctx, [[w * 0.53, h * 0.633], [w * 0.53, h * 0.67 - vr]], SD_GREEN, lw)
    sdValve(ctx, w * 0.53, h * 0.67, vr, true, 'v', trimOk ? SD_GREEN : SD_AMBER)
    sdLine(ctx, [[w * 0.53, h * 0.67 + vr], [w * 0.53, h * 0.725]], SD_GREEN, lw)
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = thin
    ctx.strokeRect(w * 0.46, h * 0.725, w * 0.14, h * 0.05)
    const trimKg = sum(trim)
    text(ctx, trim.length ? kg(trimKg) : 'XX', w * 0.59, h * 0.75, big, SD_GREEN, 'right')
    const trimT = trim.length && trimKg > 0 ? temp(trim[0]) : NaN
    if (Number.isFinite(trimT)) text(ctx, tStr(trimT), w * 0.64, h * 0.75, lab * 0.9, SD_GREEN, 'left')
    text(ctx, '°C', w * 0.7, h * 0.755, lab * 0.8, SD_CYAN, 'left')

    // ── F.FLOW and FOB ──
    text(ctx, 'F.FLOW', w * 0.03, h * 0.635, lab * 0.8, SD_WHITE, 'left')
    text(ctx, '1+2', w * 0.04, h * 0.665, lab * 0.7, SD_WHITE, 'left')
    text(ctx, ':', w * 0.17, h * 0.65, lab * 0.9, SD_WHITE)
    const ffKgMin = Number.isFinite(f('burn')) ? f('burn') : [0, 1].reduce((s, i) => s + at(v.ff, i, 0), 0) * 60
    text(ctx, String(Math.round(ffKgMin)), w * 0.29, h * 0.7, big, SD_GREEN, 'right')
    text(ctx, 'KG/MIN', w * 0.305, h * 0.705, lab * 0.8, SD_CYAN, 'left')
    text(ctx, 'FOB', w * 0.03, h * 0.765, lab, SD_WHITE, 'left')
    text(ctx, ':', w * 0.17, h * 0.765, lab * 0.9, SD_WHITE)
    const fob = num(v.fuel_total, sum(tanks))
    text(ctx, kg(fob), w * 0.33, h * 0.78, big, SD_GREEN, 'right')
    text(ctx, 'KG', w * 0.345, h * 0.785, lab * 0.8, SD_CYAN, 'left')

    sdFooter(ctx, w, h, v, lab)
  }

  // pump: bar in line (vertical) running, across (horizontal) not running; green normally,
  // amber when switched off at its pushbutton or in an unknown / fault state
  _pump(x, y, lab, state, button) {
    const { ctx } = this, s = lab * 0.62
    const st = state === undefined ? 1 : Math.round(num(state, 0))
    const switchedOff = button !== undefined && num(button, 1) < 0.5
    const col = !switchedOff && (st === 0 || st === 1) ? SD_GREEN : SD_AMBER
    ctx.fillStyle = '#000'; ctx.fillRect(x - s, y - s, s * 2, s * 2)
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, lab * 0.14)
    ctx.strokeRect(x - s, y - s, s * 2, s * 2)
    ctx.beginPath()
    if (st === 1) { ctx.moveTo(x, y - s); ctx.lineTo(x, y + s) } else { ctx.moveTo(x - s * 0.7, y); ctx.lineTo(x + s * 0.7, y) }
    ctx.stroke()
  }

  // wing outline: outer / inner / centre / inner / outer tanks with collector partitions
  _wing(thin) {
    const { ctx, w, h } = this
    const P = (x, y) => [w * x, h * y]
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = thin
    ctx.beginPath()
    const outline = [[0.05, 0.345], [0.16, 0.33], [0.42, 0.3], [0.58, 0.3], [0.84, 0.33], [0.95, 0.345],
      [0.95, 0.46], [0.84, 0.475], [0.58, 0.5], [0.42, 0.5], [0.16, 0.475], [0.05, 0.46]]
    outline.forEach(([x, y], i) => i ? ctx.lineTo(...P(x, y)) : ctx.moveTo(...P(x, y)))
    ctx.closePath()
    for (const [x0, y0, x1, y1] of [[0.16, 0.33, 0.16, 0.475], [0.42, 0.3, 0.415, 0.5], [0.58, 0.3, 0.585, 0.5], [0.84, 0.33, 0.84, 0.475],
      [0.235, 0.32, 0.235, 0.37], [0.765, 0.32, 0.765, 0.37]]) {
      ctx.moveTo(...P(x0, y0)); ctx.lineTo(...P(x1, y1))
    }
    ctx.stroke()
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_fuel',
  label:    'A330 FUEL (SD page)',
  icon:     '⛽',
  order:    20,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'used_eng', 'tank_temp', 'lp_closed_l', 'lp_closed_r', 'apu_running', ...Object.keys(SD_FOOTER_DREFS)],
}
