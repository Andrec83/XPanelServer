// A330 ELEC DC (lower ECAM / SD page), laid out as on the Laminar A330-300: DC BAT, DC 1,
// DC 2, DC ESS and DC APU buses with their links, BAT 1 / BAT 2 / APU BAT (volts, amps),
// TR 1 / ESS TR / TR 2 / APU TR (volts, amps, AC source), STAT INV, and the permanent
// TAT / SAT / UTC / GW strip.
// Data from the Laminar A330 (battery volts / amps from X-Plane's battery datarefs). A bus
// is shown powered while its voltage is up.

import { BaseInstrument } from '../base.js'
import { pick, num, at, text } from '../_glass.js'
import { sdTitle, sdFooter, sdTri, sdBus, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER } from './_sd.js'

const EL = 'laminar/A333/elec/', EC = 'laminar/A333/ecam/elec/'

const LAMINAR = {
  v_dc1: `${EL}dc_bus1_volts`, v_dc2: `${EL}dc_bus2_volts`, v_ess: `${EL}dc_ess_bus_volts`,
  v_bat: `${EL}dc_bat_bus_volts`, v_apu: `${EL}dc_apu_bat_bus_volts`,
  tr1_v: `${EC}tr1_volts`, tr2_v: `${EC}tr2_volts`, ess_v: `${EC}ess_tr_volts`, apu_v: `${EC}apu_tr_volts`,
  tr1_a: `${EL}tr1_amps`, tr2_a: `${EL}tr2_amps`, ess_a: `${EL}ess_tr_amps`, apu_a: `${EL}apu_tr_amps`,
  tr1_ok: `${EC}tr1_status`, tr2_ok: `${EC}tr2_status`, ess_ok: `${EC}ess_tr_status`, apu_ok: `${EC}apu_tr_status`,
  ess_src: `${EC}ess_tr_source`, stat_inv: `${EC}stat_inv_status`,
  dc1_bat: `${EC}dc1_dcbat_syn_status`, dc2_bat: `${EC}dc2_dcbat_syn_status`, bat_ess: `${EC}dcbat_dcess_syn_status`,
  bat1_link: `${EC}bat1_dc_bat_status`, bat2_link: `${EC}bat2_dc_bat_status`, apubat_link: `${EC}apu_bat_dc_apu_status`,
  tr1_c: `${EL}tr1_line_contactor`, tr2_c: `${EL}tr2_line_contactor`, ess_c: `${EL}ess_tr_line_contactor`, apu_c: `${EL}apu_tr_line_contactor`,
}

export const DEFAULTS = {
  bat_v: 'sim/cockpit2/electrical/battery_voltage_actual_volts',
  bat_a: 'sim/cockpit2/electrical/battery_amps',
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

export class A333ElecDC extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.tr1_v !== undefined; this._dirty = true }
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
    const lw = Math.max(1.5, lab * 0.15), bh = lab * 1.4
    const pw = k => f(k) > 20                                   // bus powered

    sdTitle(ctx, 'ELEC DC', w, h, lab)

    const yTop = h * 0.13, yBat = h * 0.3, yBus = h * 0.47, yTR = h * 0.685
    const xDC1 = w * 0.13, xESS = w * 0.37, xDC2 = w * 0.6, xAPU = w * 0.85, xBAT = w * 0.38

    // links (drawn first, under the bus bars and boxes)
    if (on('dc1_bat')) sdLine(ctx, [[xBAT - w * 0.11, yTop], [xDC1, yTop], [xDC1, yBus]], SD_GREEN, lw)
    if (on('dc2_bat')) sdLine(ctx, [[xBAT + w * 0.11, yTop], [xDC2, yTop], [xDC2, yBus]], SD_GREEN, lw)
    if (on('bat_ess')) sdLine(ctx, [[xESS, yTop], [xESS, yBus]], SD_GREEN, lw)
    if (on('bat1_link')) sdLine(ctx, [[w * 0.22, yTop], [w * 0.22, yBat - lab * 2]], SD_GREEN, lw)
    if (on('bat2_link')) sdLine(ctx, [[w * 0.46, yTop], [w * 0.46, yBat - lab * 2]], SD_GREEN, lw)
    if (on('apubat_link')) sdLine(ctx, [[w * 0.72, yTop], [w * 0.72, yBat - lab * 2]], SD_GREEN, lw)
    if (on('apu_c')) sdLine(ctx, [[xAPU, yTop], [xAPU, yTR - lab * 2.2]], SD_GREEN, lw)
    if (on('tr1_c')) sdLine(ctx, [[xDC1, yBus], [xDC1, yTR - lab * 2.2]], SD_GREEN, lw)
    if (on('ess_c')) sdLine(ctx, [[xESS, yBus], [xESS, yTR - lab * 2.2]], SD_GREEN, lw)
    if (on('tr2_c')) sdLine(ctx, [[xDC2, yBus], [xDC2, yTR - lab * 2.2]], SD_GREEN, lw)

    // buses
    sdBus(ctx, xBAT, yTop, w * 0.22, bh, 'DC BAT', pw('v_bat'), lab)
    sdBus(ctx, xAPU, yTop, w * 0.14, bh, 'DC APU', pw('v_apu'), lab)
    sdBus(ctx, xDC1, yBus - lab * 0.1, w * 0.14, bh, 'DC 1', pw('v_dc1'), lab)
    sdBus(ctx, xESS, yBus - lab * 0.1, w * 0.2, bh, 'DC ESS', pw('v_ess'), lab)
    sdBus(ctx, xDC2, yBus + lab * 0.1, w * 0.14, bh, 'DC 2', pw('v_dc2'), lab)

    // batteries
    this._box(w * 0.22, yBat, 'BAT 1', at(v.bat_v, 0, NaN), at(v.bat_a, 0, 0), true, lab)
    this._box(w * 0.46, yBat, 'BAT 2', at(v.bat_v, 1, NaN), at(v.bat_a, 1, 0), true, lab)
    this._box(w * 0.72, yBat, 'APU BAT', at(v.bat_v, 2, NaN), at(v.bat_a, 2, 0), true, lab)

    // STAT INV under DC ESS
    sdTri(ctx, w * 0.49, yBus + lab * 0.9, lab * 0.4, 'down', on('stat_inv') ? SD_GREEN : SD_WHITE)
    text(ctx, 'STAT', w * 0.49, yBus + lab * 1.8, lab * 0.8, SD_WHITE)
    text(ctx, 'INV', w * 0.49, yBus + lab * 2.7, lab * 0.8, SD_WHITE)

    // transformer rectifiers with their AC source
    const trs = [[xDC1, 'TR 1', 'tr1', 'AC1'], [xESS, 'ESS TR', 'ess', num(v.ess_src, 0) > 0 ? 'EMER GEN' : 'AC1'], [xDC2, 'TR 2', 'tr2', 'AC2'], [xAPU, 'APU TR', 'apu', 'AC2']]
    for (const [x, name, k, src] of trs) {
      this._box(x, yTR, name, f(`${k}_v`), f(`${k}_a`), v[`${k}_ok`] === undefined || on(`${k}_ok`), lab)
      sdTri(ctx, x, yTR + lab * 2.7, lab * 0.35, 'up', SD_WHITE)
      text(ctx, src, x, yTR + lab * 3.6, lab * 0.85, SD_WHITE)
    }

    sdFooter(ctx, w, h, v, lab)
  }

  // box with a name, volts and amps; values amber outside 25–31 V, name amber on fault
  _box(x, y, name, volts, amps, ok, lab) {
    const { ctx } = this
    const bw = lab * 4.6, bh = lab * 4.2
    ctx.fillStyle = '#000'; ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh)
    ctx.strokeStyle = ok ? SD_WHITE : SD_AMBER; ctx.lineWidth = Math.max(1, lab * 0.1)
    ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh)
    text(ctx, name, x, y - bh / 2 + lab * 0.8, lab * 0.9, ok ? SD_WHITE : SD_AMBER)
    const vOk = volts >= 25 && volts <= 31
    text(ctx, Number.isFinite(volts) ? String(Math.round(volts)) : 'XX', x + lab * 0.6, y + lab * 0.25, lab * 1.05, vOk ? SD_GREEN : SD_AMBER, 'right')
    text(ctx, 'V', x + lab * 0.9, y + lab * 0.25, lab * 0.85, SD_CYAN, 'left')
    text(ctx, Number.isFinite(amps) ? String(Math.round(Math.abs(amps))) : 'XX', x + lab * 0.6, y + lab * 1.4, lab * 1.05, SD_GREEN, 'right')
    text(ctx, 'A', x + lab * 0.9, y + lab * 1.4, lab * 0.85, SD_CYAN, 'left')
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_elec_dc',
  label:    'A330 ELEC DC (SD page)',
  icon:     '⎓',
  order:    26.5,
  datarefs: DEFAULTS,
  requires: 'the Laminar A330 (publishes the laminar/A333/elec datarefs)',
  optionalDatarefs: [...Object.keys(SD_FOOTER_DREFS), 'bat_a', 'stat_inv', 'ess_src'],
}
