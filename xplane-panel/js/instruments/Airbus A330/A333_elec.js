// A330 ELEC AC (lower ECAM / SD page), laid out as on the Laminar A330-300: AC 1 / AC 2
// and AC ESS buses with their feeds, generators 1 / 2 (load, volts, frequency) and IDG
// temperatures, APU GEN, TR 1 / TR 2 / ESS TR / APU TR, EMER GEN and STAT INV, bus tie
// lines, and the permanent TAT / SAT / UTC / GW strip.
// Data from the Laminar A330; generator load is X-Plane's generator current against the
// A330's 115 kVA rating (about 333 A per phase).

import { BaseInstrument } from '../base.js'
import { pick, num, at, text } from '../_glass.js'
import { sdTitle, sdFooter, sdTri, sdBus, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER } from './_sd.js'

const E = 'laminar/A333/ecam/', EL = 'laminar/A333/elec/'
const AMPS_FULL_LOAD = 115000 / (3 * 115)

const LAMINAR = {
  gen1_status: `${E}elec/gen1_status`,  gen2_status: `${E}elec/gen2_status`,
  gen1_v: `${E}gen1_volts`, gen1_hz: `${E}gen1_hz`, gen2_v: `${E}gen2_volts`, gen2_hz: `${E}gen2_hz`,
  idg1: `${E}elec/idg1_temp`, idg2: `${E}elec/idg2_temp`,
  apu_gen: `${E}elec/apu_gen_status`, apu_v: `${E}apu_volts`, apu_hz: `${E}apu_hz`,
  emer_gen: `${E}elec/emer_gen_status`, stat_inv: `${E}elec/stat_inv_status`,
  tr1: `${E}elec/tr1_status`, tr2: `${E}elec/tr2_status`, ess_tr: `${E}elec/ess_tr_status`, apu_tr: `${E}elec/apu_tr_status`,
  bar1: `${E}elec/synoptic_cross_bar1`, bar2: `${E}elec/synoptic_cross_bar2`, bar3: `${E}elec/synoptic_cross_bar3`,
  apu_bar: `${E}elec/apu_gen_bar`,
  loss_ac1: `${EL}loss_of_bus_ac1`, loss_ac2: `${EL}loss_of_bus_ac2`,
  gen1_cntor: `${EL}gen1_line_cntor`, gen2_cntor: `${EL}gen2_line_cntor`,
  ess_feed1: `${EL}ess_feed_line_contactor1`, ess_feed2: `${EL}ess_feed_line_contactor2`,
}

export const DEFAULTS = {
  gen_amps: 'sim/cockpit2/electrical/generator_amps',
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

export class A333Elec extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.gen1_v !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'ELEC DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v, f = k => num(v[k], NaN), on = k => num(v[k], 0) > 0
    const lab = Math.max(7, Math.min(h * 0.038, w * 0.038))
    const lw = Math.max(1.5, lab * 0.15)
    const tri = lab * 0.45

    sdTitle(ctx, 'ELEC AC', w, h, lab)

    const ac1 = !on('loss_ac1'), ac2 = !on('loss_ac2')
    const xAC1 = w * 0.25, xAC2 = w * 0.78, xESS = w * 0.5
    const yESS = h * 0.26, yAC1 = h * 0.36, yAC2 = h * 0.42

    // ESS TR, EMER GEN, STAT INV (top)
    text(ctx, 'ESS TR', xESS, h * 0.06, lab * 0.95, SD_WHITE)
    sdTri(ctx, xESS, h * 0.1, tri, 'up', on('ess_tr') ? SD_WHITE : SD_AMBER)
    text(ctx, 'EMER GEN', w * 0.37, h * 0.115, lab * 0.9, SD_WHITE, 'right')
    sdTri(ctx, w * 0.395, h * 0.115, tri, 'right', on('emer_gen') ? SD_GREEN : SD_WHITE)
    sdTri(ctx, w * 0.61, h * 0.135, tri, 'left', on('stat_inv') ? SD_GREEN : SD_WHITE)
    text(ctx, 'STAT INV', w * 0.63, h * 0.135, lab * 0.9, SD_WHITE, 'left')

    // AC ESS bus, fed from AC 1 (or AC 2)
    const feed1 = on('ess_feed1'), feed2 = on('ess_feed2')
    const essPowered = (feed1 && ac1) || (feed2 && ac2)
    sdLine(ctx, [[xESS, h * 0.12], [xESS, yESS - lab * 0.7]], SD_GREEN, lw)
    if (feed1) sdLine(ctx, [[xESS, h * 0.19], [xAC1 - w * 0.06, h * 0.19], [xAC1 - w * 0.06, yAC1 - lab * 0.7]], SD_GREEN, lw)
    if (feed2) sdLine(ctx, [[xESS, h * 0.19], [xAC2, h * 0.19], [xAC2, yAC2 - lab * 0.7]], SD_GREEN, lw)
    sdBus(ctx, xESS, yESS, w * 0.18, lab * 1.4, 'AC ESS', essPowered, lab)

    // AC 1 / AC 2 buses with their TRs
    sdBus(ctx, xAC1, yAC1, w * 0.26, lab * 1.4, 'AC 1', ac1, lab)
    text(ctx, 'TR1', xAC1 - w * 0.02, yAC1 - lab * 2.3, lab * 0.9, SD_WHITE)
    sdTri(ctx, xAC1 - w * 0.02, yAC1 - lab * 1.3, tri, 'up', on('tr1') ? SD_WHITE : SD_AMBER)
    sdBus(ctx, xAC2, yAC2, w * 0.26, lab * 1.4, 'AC 2', ac2, lab)
    text(ctx, 'TR2', xAC2 - w * 0.04, yAC2 - lab * 2.3, lab * 0.9, SD_WHITE)
    sdTri(ctx, xAC2 - w * 0.04, yAC2 - lab * 1.3, tri, 'up', on('tr2') ? SD_WHITE : SD_AMBER)
    text(ctx, 'APU', xAC2 + w * 0.09, yAC2 - lab * 3.3, lab * 0.9, SD_WHITE)
    text(ctx, 'TR', xAC2 + w * 0.09, yAC2 - lab * 2.3, lab * 0.9, SD_WHITE)
    sdTri(ctx, xAC2 + w * 0.09, yAC2 - lab * 1.3, tri, 'up', on('apu_tr') ? SD_WHITE : SD_AMBER)

    // bus ties (drawn when the cross bars are shown)
    if (on('bar1') || on('bar2') || on('bar3')) sdLine(ctx, [[xAC1 + w * 0.13, yAC1], [xESS, yAC1], [xESS, yAC2], [xAC2 - w * 0.13, yAC2]], SD_GREEN, lw)

    // APU GEN (centre)
    text(ctx, 'APU GEN', xESS, h * 0.5, lab * 0.9, SD_WHITE)
    sdTri(ctx, xESS, h * 0.46, tri, 'up', on('apu_gen') ? SD_GREEN : SD_WHITE)
    if (on('apu_bar')) sdLine(ctx, [[xESS, h * 0.45], [xESS, yAC1]], SD_GREEN, lw)

    // generators and IDGs
    this._gen(w * 0.17, h * 0.47, 1, yAC1 + lab * 0.7, lab)
    this._gen(w * 0.8, h * 0.53, 2, yAC2 + lab * 0.7, lab)

    sdFooter(ctx, w, h, v, lab)
  }

  // generator box (load %, volts, Hz), arrow up to its bus, IDG temperature below
  _gen(x, y, n, busY, lab) {
    const { ctx } = this, v = this._v, f = k => num(v[k], NaN)
    const ok = num(v[`gen${n}_status`], 1) > 0
    const bw = lab * 4.2, bh = lab * 4.8
    ctx.strokeStyle = ok ? SD_WHITE : SD_AMBER; ctx.lineWidth = Math.max(1, lab * 0.1)
    ctx.strokeRect(x - bw / 2, y, bw, bh)
    text(ctx, `GEN ${n}`, x, y + lab * 0.8, lab * 0.95, ok ? SD_WHITE : SD_AMBER)
    const load = at(v.gen_amps, n - 1, NaN) / AMPS_FULL_LOAD * 100
    const rows = [[load, '%', x => String(Math.round(x))], [f(`gen${n}_v`), 'V', x => String(Math.round(x))], [f(`gen${n}_hz`), 'HZ', x => String(Math.round(x))]]
    rows.forEach(([val, unit, fmt], k) => {
      const yy = y + lab * (2.0 + k * 1.15)
      text(ctx, Number.isFinite(val) ? fmt(val) : 'XX', x + lab * 0.5, yy, lab * 1.05, SD_GREEN, 'right')
      text(ctx, unit, x + lab * 0.7, yy, lab * 0.8, SD_CYAN, 'left')
    })
    // arrow from the generator to its bus while the line contactor is closed
    if (num(v[`gen${n}_cntor`], 0) > 0) {
      sdLine(ctx, [[x, y], [x, busY + lab * 0.3]], SD_GREEN, Math.max(1.5, lab * 0.15))
      sdTri(ctx, x, busY + lab * 0.35, lab * 0.4, 'up', SD_GREEN)
    }
    text(ctx, `IDG ${n}`, x - lab * 0.6, y + bh + lab * 0.9, lab * 0.95, SD_WHITE)
    const t = f(`idg${n}`)
    text(ctx, Number.isFinite(t) ? String(Math.round(t)) : 'XX', x + lab * 0.3, y + bh + lab * 2.1, lab * 1.05, SD_GREEN, 'right')
    text(ctx, '°C', x + lab * 0.5, y + bh + lab * 2.1, lab * 0.8, SD_CYAN, 'left')
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_elec',
  label:    'A330 ELEC AC (SD page)',
  icon:     '⚡',
  order:    26,
  datarefs: DEFAULTS,
  requires: 'the Laminar A330 (publishes the laminar/A333/ecam/elec datarefs)',
  optionalDatarefs: [...Object.keys(SD_FOOTER_DREFS), 'apu_v', 'apu_hz', 'bar1', 'bar2', 'bar3', 'apu_bar'],
}
