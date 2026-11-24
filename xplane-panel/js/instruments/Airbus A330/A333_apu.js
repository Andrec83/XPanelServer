// A330 APU (lower ECAM / SD page), laid out as on the Laminar A330-300: APU GEN box
// (load, volts, frequency), AVAIL, APU bleed valve and pressure, N and EGT dials, air
// intake FLAP OPEN, and the permanent TAT / SAT / UTC / GW strip. Values are amber "XX"
// while the APU is off, as on the cockpit page.
// N, EGT, flap and generator load use X-Plane's standard APU datarefs; volts, frequency,
// bleed pressure and display state come from the Laminar A330 (optional).

import { BaseInstrument } from '../base.js'
import { pick, num, text } from '../_glass.js'
import { sdFooter, sdTri, sdValve, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER, SD_RED } from './_sd.js'

const EL = 'sim/cockpit2/electrical/', E = 'laminar/A333/ecam/'
const AMPS_FULL_LOAD = 115000 / (3 * 115)

const LAMINAR = {
  shown:    `${E}apu_needle_vis`,
  gen_v:    `${E}apu_volts`,
  gen_hz:   `${E}apu_hz`,
  bleed_psi:`${E}apu_psi`,
}

export const DEFAULTS = {
  n:        `${EL}APU_N1_percent`,
  egt:      `${EL}APU_EGT_c`,
  flap:     `${EL}APU_door`,
  running:  `${EL}APU_running`,
  gen_amps: `${EL}APU_generator_amps`,
  gen_on:   `${EL}APU_generator_on`,
  bleed:    'sim/cockpit2/bleedair/actuators/apu_bleed',
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

const rad = d => d * Math.PI / 180

export class A333Apu extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.n !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'APU DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, Math.min(h * 0.04, w * 0.04))
    const lw = Math.max(1.5, lab * 0.15)
    // APU active: Laminar's display flag, or N above a few percent
    const active = v.shown !== undefined ? num(v.shown, 0) > 0 : f('n') > 3

    text(ctx, 'APU', w / 2, h * 0.045, lab * 1.3, SD_WHITE)
    ctx.fillStyle = SD_WHITE; ctx.fillRect(w / 2 - lab * 1.5, h * 0.045 + lab * 0.8, lab * 3, Math.max(1, lab * 0.1))

    // APU GEN (box with values while the APU is active)
    const gx = w * 0.22, gy = h * 0.13
    sdTri(ctx, gx, gy, lab * 0.4, 'up', SD_WHITE)
    if (active) {
      const volts = f('gen_v'), ok = volts > 100
      ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, lab * 0.1)
      ctx.strokeRect(gx - lab * 2.2, gy + lab * 0.7, lab * 4.4, lab * 4.6)
      text(ctx, 'APU GEN', gx, gy + lab * 1.5, lab * 0.9, ok ? SD_WHITE : SD_AMBER)
      const load = f('gen_amps') / AMPS_FULL_LOAD * 100
      const rows = [[load, '%', true], [volts, 'V', ok], [f('gen_hz'), 'HZ', f('gen_hz') > 380]]
      rows.forEach(([x, u, good], k) => {
        const yy = gy + lab * (2.7 + k * 1.1)
        text(ctx, Number.isFinite(x) ? String(Math.round(x)) : 'XX', gx + lab * 0.6, yy, lab * 1.05, good ? SD_GREEN : SD_AMBER, 'right')
        text(ctx, u, gx + lab * 0.8, yy, lab * 0.8, SD_CYAN, 'left')
      })
    } else {
      text(ctx, 'APU GEN', gx, gy + lab * 1.2, lab * 0.9, SD_WHITE)
    }
    if (num(v.running, 0) > 0) text(ctx, 'AVAIL', w * 0.48, h * 0.15, lab * 1.3, SD_GREEN)

    // APU bleed: valve above a box with the pressure
    const bx = w * 0.78, by = h * 0.21, open = num(v.bleed, 0) > 0
    sdValve(ctx, bx, h * 0.12, lab * 0.8, open, 'v')
    sdLine(ctx, [[bx, h * 0.12 + lab * 0.8], [bx, by - lab * 1.2]], SD_GREEN, lw)
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, lab * 0.1)
    ctx.strokeRect(bx - lab * 2.4, by - lab * 1.2, lab * 4.8, lab * 2.6)
    text(ctx, 'BLEED', bx, by - lab * 0.4, lab * 0.9, SD_WHITE)
    const psi = f('bleed_psi')
    text(ctx, active && Number.isFinite(psi) ? String(Math.round(psi)) : 'XX', bx - lab * 0.4, by + lab * 0.75, lab * 1.05, active ? SD_GREEN : SD_AMBER, 'right')
    text(ctx, 'PSI', bx - lab * 0.1, by + lab * 0.75, lab * 0.85, SD_CYAN, 'left')

    // bracket over the dials
    sdLine(ctx, [[w * 0.1, h * 0.43], [w * 0.1, h * 0.38], [w * 0.88, h * 0.38], [w * 0.88, h * 0.43]], SD_WHITE, Math.max(1, lab * 0.1))

    // N dial: 0 … 10 (×10 %), red from 102 %
    const r = Math.min(w * 0.11, h * 0.095)
    const n = f('n')
    this._dial(w * 0.3, h * 0.53, r, active ? n / 10 : NaN, x => 200 + (x / 10.5) * 135,
      [[0, '0'], [10, '10']], [[10.2, 10.5]], lab)
    text(ctx, active && Number.isFinite(n) ? n.toFixed(1) : 'XX', w * 0.36, h * 0.53 + r * 0.6, lab * 1.05, active ? SD_GREEN : SD_AMBER)
    text(ctx, 'N', w * 0.5, h * 0.5, lab * 0.95, SD_WHITE)
    text(ctx, '%', w * 0.5, h * 0.5 + lab * 1.1, lab * 0.85, SD_CYAN)
    // EGT dial: 300 … 1100 °C, compressed above 700 as on the cockpit page; red from 1000
    const egt = f('egt')
    const egtAng = x => { const c = x / 100; return c <= 7 ? 200 + (c - 3) * 21.25 : 285 + (c - 7) * 12.5 }
    this._dial(w * 0.3, h * 0.72, r, active ? Math.max(3, egt / 100) * 100 : NaN, egtAng,
      [[300, '3'], [500, '5'], [700, '7'], [1100, '11']], [[1000, 1100]], lab)
    text(ctx, active && Number.isFinite(egt) ? String(Math.round(egt)) : 'XX', w * 0.36, h * 0.72 + r * 0.6, lab * 1.05, active ? SD_GREEN : SD_AMBER)
    text(ctx, 'EGT', w * 0.5, h * 0.69, lab * 0.95, SD_WHITE)
    text(ctx, '°C', w * 0.5, h * 0.69 + lab * 1.1, lab * 0.85, SD_CYAN)

    if (num(v.flap, 0) > 0.05) text(ctx, 'FLAP OPEN', w * 0.68, h * 0.62, lab * 1.1, SD_GREEN)

    sdFooter(ctx, w, h, v, lab)
  }

  // angFn maps a value to degrees (canvas convention); labels [[value, text]]; red bands
  _dial(cx, cy, r, value, angFn, labels, reds, lab) {
    const { ctx } = this
    const vals = labels.map(l => l[0])
    const a0 = angFn(Math.min(...vals)), a1 = angFn(Math.max(...vals, ...reds.map(b => b[1])))
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1.2, lab * 0.12)
    ctx.beginPath(); ctx.arc(cx, cy, r, rad(a0), rad(a1)); ctx.stroke()
    for (const [b0, b1] of reds) {
      ctx.strokeStyle = SD_RED; ctx.lineWidth = Math.max(2, lab * 0.2)
      ctx.beginPath(); ctx.arc(cx, cy, r, rad(angFn(b0)), rad(angFn(b1))); ctx.stroke()
    }
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, lab * 0.1)
    for (const [x, t] of labels) {
      const a = rad(angFn(x))
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); ctx.stroke()
      text(ctx, t, cx + Math.cos(a) * r * 0.65, cy + Math.sin(a) * r * 0.65, lab * 0.85, SD_WHITE)
    }
    if (!Number.isFinite(value)) return
    const a = rad(angFn(value))
    ctx.strokeStyle = SD_GREEN; ctx.lineWidth = Math.max(2, lab * 0.18)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); ctx.stroke()
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_apu',
  label:    'A330 APU (SD page)',
  icon:     '◴',
  order:    28,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'gen_amps', 'gen_on', 'bleed', ...Object.keys(SD_FOOTER_DREFS)],
}
