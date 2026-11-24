// A330 HYD (lower ECAM / SD page), laid out as on the Laminar A330-300: GREEN / BLUE /
// YELLOW systems with pressure, electric pump arrows, fire shut-off valves, engine-driven
// pumps (green on both engines; square, LO when failed), RAT with RPM, reservoir
// quantity, and the permanent TAT / SAT / UTC / GW strip.
// Pressures and reservoir quantities use X-Plane's standard hydraulic datarefs (systems
// 1 / 2 / 3 = green / yellow / blue on the Laminar A330, checked with pump failures); pump faults, electric pumps and the RAT come from
// the Laminar A330 (optional).

import { BaseInstrument } from '../base.js'
import { pick, num, text } from '../_glass.js'
import { sdFooter, sdTri, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER } from './_sd.js'

const HI = 'sim/cockpit2/hydraulics/indicators/', L = 'laminar/A333/'

const LAMINAR = {
  rat_rpm:    `${L}ecam/hyd/ram_air_turbine_RPM`,
  rat_status: `${L}ecam/hyd/rat_status`,
}
for (const s of ['green', 'blue', 'yellow']) Object.assign(LAMINAR, {
  [`elec_${s}`]:     `${L}ecam/hyd/elec_${s}_status`,
  [`elec_${s}_flt`]: `${L}hyd/elec_${s}_pump_fault`,
  [`rsvr_${s}_lo`]:  `${L}hyd/${s}_rsvr_lo_lvl`,
})
Object.assign(LAMINAR, {
  eng1_green_flt:  `${L}hyd/eng1_green_pump_fault`,
  eng1_blue_flt:   `${L}hyd/eng1_blue_pump_fault`,
  eng2_green_flt:  `${L}hyd/eng2_green_pump_fault`,
  eng2_yellow_flt: `${L}hyd/eng2_yellow_pump_fault`,
  fire1:           `${L}fire/hydraulic_fire_valve1_pos`,
  fire2:           `${L}fire/hydraulic_fire_valve2_pos`,
})

export const DEFAULTS = {
  p_green:  `${HI}hydraulic_pressure_1`,
  p_yellow: `${HI}hydraulic_pressure_2`,
  p_blue:   `${HI}hydraulic_pressure_3`,
  q_green:  `${HI}hydraulic_fluid_ratio_1`,
  q_yellow: `${HI}hydraulic_fluid_ratio_2`,
  q_blue:   `${HI}hydraulic_fluid_ratio_3`,
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

const LOW_PSI = 1450

export class A333Hyd extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.p_green !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'HYD DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v, f = k => num(v[k], NaN), on = k => num(v[k], 0) > 0
    const lab = Math.max(7, Math.min(h * 0.04, w * 0.04))
    const lw = Math.max(1.5, lab * 0.15)

    // centred, underlined title
    text(ctx, 'HYD', w / 2, h * 0.045, lab * 1.3, SD_WHITE)
    ctx.fillStyle = SD_WHITE; ctx.fillRect(w / 2 - lab * 1.5, h * 0.045 + lab * 0.8, lab * 3, Math.max(1, lab * 0.1))

    const sys = [['green', 'GREEN', w * 0.24], ['blue', 'BLUE', w * 0.42], ['yellow', 'YELLOW', w * 0.6]]
    const yTri = h * 0.13, yName = h * 0.18, yP = h * 0.235, yElec = h * 0.33, yFire = h * 0.42, yPump = h * 0.53, yRes = h * 0.6, yResB = h * 0.79
    text(ctx, 'PSI', w * 0.51, yP, lab * 0.85, SD_CYAN)

    for (const [key, name, x] of sys) {
      const p = f(`p_${key}`), press = p >= LOW_PSI
      const col = press ? SD_GREEN : SD_AMBER
      const eng = key === 'yellow' ? 2 : 1
      const pf = on(`eng${eng}_${key}_flt`)
      // label and triangle amber when the system is low or all its engine pumps have failed
      // (green has a pump on each engine)
      const allPumpsOut = key === 'green' ? pf && on('eng2_green_flt') : pf
      const sysCol = press && !allPumpsOut ? SD_GREEN : SD_AMBER
      sdTri(ctx, x, yTri, lab * 0.5, 'up', sysCol)
      text(ctx, name, x, yName, lab * 1.0, sysCol === SD_GREEN ? SD_WHITE : SD_AMBER)
      text(ctx, Number.isFinite(p) ? String(Math.round(p / 10) * 10) : 'XX', x, yP, lab * 1.1, col)
      // system → pump: amber when the pump is failed or the system has no pressure; below: green
      sdLine(ctx, [[x, yP + lab * 0.7], [x, yFire]], pf || !press ? SD_AMBER : SD_GREEN, lw)
      sdLine(ctx, [[x, yFire], [x, yRes]], SD_GREEN, lw)
      // electric pump: arrow, green while running, amber on fault
      const ef = on(`elec_${key}_flt`)
      text(ctx, 'ELEC', x - lab * 1.3, yElec, lab * 0.9, SD_WHITE, 'right')
      sdTri(ctx, x - lab * 0.8, yElec, lab * 0.4, 'right', ef ? SD_AMBER : on(`elec_${key}`) ? SD_GREEN : SD_WHITE, on(`elec_${key}`))
      // engine-driven pump (square, LO when failed) and fire shut-off valve (circle)
      this._enginePump(x, yFire, lab, !pf, lw)
      this._fireValve(x, yPump, lab * 0.85, !on(`fire${eng}`), lw)       // Laminar: 0 = open
      this._reservoir(x, yRes, yResB, f(`q_${key}`), on(`rsvr_${key}_lo`), lab)
    }
    // green system: branch at the top and from engine 1 towards the engine 2 side
    sdLine(ctx, [[w * 0.24 + lab * 2.1, yP], [w * 0.24 + lab * 2.8, yP], [w * 0.24 + lab * 3.1, yP - lab * 0.4]], SD_GREEN, lw)
    sdLine(ctx, [[w * 0.24, yPump + lab * 1.4], [w * 0.33, yPump + lab * 1.4], [w * 0.33 + lab * 0.4, yPump + lab * 1.0]], SD_GREEN, lw)
    text(ctx, '1', w * 0.32, h * 0.47, lab * 1.2, SD_WHITE)
    text(ctx, '2', w * 0.7, h * 0.48, lab * 1.2, SD_WHITE)

    // green system, engine 2 side: RAT, fire valve, pump
    const xg = w * 0.8, pg = f('p_green') >= LOW_PSI
    text(ctx, 'GREEN', xg, yName, lab * 1.0, SD_WHITE)
    sdLine(ctx, [[xg - lab * 2.9, yP + lab * 0.4], [xg - lab * 2.6, yP], [xg, yP], [xg, yPump + lab * 0.85]], SD_GREEN, lw)
    sdLine(ctx, [[xg, yPump + lab * 0.85], [xg, yPump + lab * 1.4], [xg - lab * 2.6, yPump + lab * 1.4], [xg - lab * 2.9, yPump + lab * 1.8]], SD_GREEN, lw)
    this._enginePump(xg, yFire, lab, !on('eng2_green_flt'), lw)
    this._fireValve(xg, yPump, lab * 0.85, !on('fire2'), lw)
    const rpm = f('rat_rpm')
    if (on('rat_status') || rpm > 0) {
      sdTri(ctx, xg + lab * 0.55, h * 0.31, lab * 0.4, 'left', SD_GREEN, true)
      text(ctx, 'RAT', xg + lab * 1.2, h * 0.31, lab * 0.95, SD_WHITE, 'left')
      text(ctx, Number.isFinite(rpm) ? String(Math.round(rpm / 100) * 100) : 'XX', xg + lab * 1.2, h * 0.31 + lab * 1.2, lab, SD_GREEN, 'left')
      text(ctx, 'RPM', xg + lab * 1.2, h * 0.31 + lab * 2.3, lab * 0.9, SD_GREEN, 'left')
    } else if (!pg) {
      text(ctx, 'RAT', xg + lab * 1.2, h * 0.31, lab * 0.95, SD_WHITE, 'left')
    }

    sdFooter(ctx, w, h, v, lab)
  }

  // engine-driven pump: green square running, amber square with "LO" when failed
  _enginePump(x, y, lab, ok, lw) {
    const { ctx } = this, s = lab * 0.75
    ctx.fillStyle = '#000'; ctx.fillRect(x - s, y - s, s * 2, s * 2)
    ctx.strokeStyle = ok ? SD_GREEN : SD_AMBER; ctx.lineWidth = lw
    ctx.strokeRect(x - s, y - s, s * 2, s * 2)
    if (!ok) text(ctx, 'LO', x, y, lab * 0.85, SD_AMBER)
    else { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke() }      // line runs through
  }

  // fire shut-off valve: green circle open, amber circle with a bar when closed
  _fireValve(x, y, r, open, lw) {
    const { ctx } = this
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = open ? SD_GREEN : SD_AMBER; ctx.lineWidth = lw
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath()
    if (open) { ctx.moveTo(x, y - r); ctx.lineTo(x, y + r) } else { ctx.moveTo(x - r, y); ctx.lineTo(x + r, y) }   // in line = open
    ctx.stroke()
  }

  // reservoir: green outline, white quantity line, amber low-level zone at the bottom
  _reservoir(x, top, bot, ratio, low, lab) {
    const { ctx } = this
    const hgt = bot - top, wd = lab * 0.7
    ctx.strokeStyle = low ? SD_AMBER : SD_GREEN; ctx.lineWidth = Math.max(1.5, lab * 0.14)
    ctx.beginPath(); ctx.moveTo(x - wd * 0.2, top + lab * 0.4); ctx.lineTo(x - wd, top + lab * 0.4); ctx.lineTo(x - wd, bot); ctx.lineTo(x + wd * 0.6, bot); ctx.lineTo(x + wd * 0.6, bot - hgt * 0.75); ctx.stroke()
    ctx.fillStyle = SD_AMBER; ctx.fillRect(x + wd * 0.1, bot - hgt * 0.12, wd * 0.45, hgt * 0.12)
    ctx.strokeStyle = SD_AMBER; ctx.lineWidth = 1; ctx.strokeRect(x + wd * 0.1, bot - hgt * 0.12, wd * 0.45, hgt * 0.12)
    if (!Number.isFinite(ratio)) return
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1.5, lab * 0.12)
    const lvl = bot - hgt * Math.max(0, Math.min(1, ratio))
    ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, lvl); ctx.stroke()
    ctx.strokeStyle = SD_GREEN; ctx.lineWidth = Math.max(1.5, lab * 0.14)
    ctx.beginPath(); ctx.moveTo(x - wd * 0.6, lvl); ctx.lineTo(x, lvl - lab * 0.3); ctx.stroke()
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_hyd',
  label:    'A330 HYD (SD page)',
  icon:     '💧',
  order:    27,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), ...Object.keys(SD_FOOTER_DREFS)],
}
