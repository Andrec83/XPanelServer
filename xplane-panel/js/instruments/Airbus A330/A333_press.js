// A330 CAB PRESS (lower ECAM / SD page), laid out as on the Laminar A330-300: landing
// elevation, ΔP / cabin V/S / cabin altitude dials with digital values, the fuselage
// outline with vent extract, forward and aft outflow valves, safety valve and packs, and
// the permanent TAT / SAT / UTC / GW strip.
// Pressures and cabin values use X-Plane's standard pressurization datarefs; the valve
// positions and landing elevation come from the Laminar A330 (optional).

import { BaseInstrument } from '../base.js'
import { pick, num, text } from '../_glass.js'
import { sdTitle, sdFooter, sdTri, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER, SD_RED } from './_sd.js'

const P = 'sim/cockpit2/pressurization/indicators/', C = 'laminar/A333/ecam/cab_press/'

const LAMINAR = {
  ofv_fwd:  `${C}outflow_valve_fwd`,
  ofv_aft:  `${C}outflow_valve_aft`,
  vent_ext: `${C}vent_extract_pos`,
  ldg_elev: 'laminar/A333/PFD/landing_alt_capt_cal1',
}

export const DEFAULTS = {
  delta_p:  `${P}pressure_diffential_psi`,
  cab_vs:   `${P}cabin_vvi_fpm`,
  cab_alt:  `${P}cabin_altitude_ft`,
  outflow:  `${P}outflow_valve`,
  pack_l:   'sim/cockpit2/bleedair/actuators/pack_left',
  pack_r:   'sim/cockpit2/bleedair/actuators/pack_right',
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

const rad = d => d * Math.PI / 180

export class A333Press extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.delta_p !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'PRESS DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, Math.min(h * 0.04, w * 0.04))
    const val = lab * 1.2

    sdTitle(ctx, 'CAB PRESS', w, h, lab)

    // landing elevation
    const le = f('ldg_elev'), yL = h * 0.1
    text(ctx, 'LDG ELEV', w * 0.56, yL, lab * 0.95, SD_WHITE, 'right')
    text(ctx, 'AUTO', w * 0.58, yL, lab * 0.95, SD_GREEN, 'left')
    text(ctx, Number.isFinite(le) ? String(Math.round(le / 10) * 10) : 'XX', w * 0.86, yL, val, SD_GREEN, 'right')
    text(ctx, 'FT', w * 0.88, yL, lab * 0.8, SD_CYAN, 'left')

    // three dials
    const yD = h * 0.33, r = Math.min(w * 0.09, h * 0.09)
    // ΔP: −1 … 10 psi, amber from 8.6, red below −0.7
    const dp = f('delta_p')
    text(ctx, 'ΔP', w * 0.2, h * 0.17, lab, SD_WHITE)
    text(ctx, 'PSI', w * 0.2, h * 0.17 + lab * 1.0, lab * 0.8, SD_CYAN)
    this._dial(w * 0.2, yD, r, dp, -1, 10, 190, 335, [[0, '0'], [10, '10']], [[8.6, 10, SD_AMBER], [-1, -0.7, SD_RED]], lab)
    text(ctx, Number.isFinite(dp) ? dp.toFixed(1) : 'XX', w * 0.33, yD + r * 0.35, val, SD_GREEN, 'right')
    // V/S: ±2 (×1000 ft/min) on a half dial facing left
    const vs = f('cab_vs')
    text(ctx, 'V/S', w * 0.5, h * 0.19, lab, SD_WHITE)
    text(ctx, 'FT/MIN', w * 0.5, h * 0.19 + lab * 1.0, lab * 0.8, SD_CYAN)
    this._dial(w * 0.48, yD, r, vs / 1000, -2.4, 2.4, 108, 252, [[2, '2'], [0, '0'], [-2, '2']], [], lab)   // climb up, descent down
    text(ctx, Number.isFinite(vs) ? String(Math.round(vs / 50) * 50) : 'XX', w * 0.65, yD + r * 0.1, val, SD_GREEN, 'right')
    // CAB ALT: 0 … 10 (×1000 ft), red from 9.55
    const ca = f('cab_alt')
    text(ctx, 'CAB ALT', w * 0.78, h * 0.17, lab, SD_WHITE)
    text(ctx, 'FT', w * 0.78, h * 0.17 + lab * 1.0, lab * 0.8, SD_CYAN)
    this._dial(w * 0.76, yD, r, ca / 1000, -0.6, 10.5, 150, 320, [[0, '0'], [10, '10']], [[9.55, 10.5, SD_RED]], lab)
    text(ctx, Number.isFinite(ca) ? String(Math.round(ca / 50) * 50) : 'XX', w * 0.95, yD + r * 0.6, val * 1.05, SD_GREEN, 'right')

    this._fuselage(lab)
    sdFooter(ctx, w, h, v, lab)
  }

  // dial from angle a0 to a1 (degrees, canvas convention); ccw for the V/S half dial
  _dial(cx, cy, r, value, min, max, a0, a1, labels, bands, lab, ccw = false) {
    const { ctx } = this
    const sweep = ccw ? -(a0 - a1) : (a1 - a0)
    const ang = x => rad(a0 + sweep * Math.max(0, Math.min(1, (x - min) / (max - min))))
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1.2, lab * 0.12)
    ctx.beginPath(); ctx.arc(cx, cy, r, rad(Math.min(a0, a0 + sweep)), rad(Math.max(a0, a0 + sweep))); ctx.stroke()
    for (const [b0, b1, col] of bands) {
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, lab * 0.18)
      const s = ang(b0), e = ang(b1)
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.min(s, e), Math.max(s, e)); ctx.stroke()
    }
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, lab * 0.1)
    for (const [x, t] of labels) {
      const a = ang(x)
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); ctx.stroke()
      text(ctx, t, cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, lab * 0.85, SD_WHITE)
    }
    if (!Number.isFinite(value)) return
    const a = ang(value)
    ctx.strokeStyle = SD_GREEN; ctx.lineWidth = Math.max(2, lab * 0.18)
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * r * 0.15, cy - Math.sin(a) * r * 0.15); ctx.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); ctx.stroke()
  }

  // fuselage outline with the system label, vent extract, outflow valves, safety valve, packs
  _fuselage(lab) {
    const { ctx, w, h } = this, v = this._v, f = k => num(v[k], NaN)
    const top = h * 0.5, bot = h * 0.72, left = w * 0.17, right = w * 0.83
    const lw = Math.max(1, lab * 0.1)
    sdLine(ctx, [[left, bot], [left, top], [right, top], [right, top + lab * 1.6]], SD_WHITE, lw)
    text(ctx, 'SYS 1', w * 0.4, top + lab * 1.1, lab, SD_GREEN)

    // vent extract (small valve on the bottom line, green while closed)
    const vx = w * 0.3
    text(ctx, 'VENT', vx + lab * 0.6, bot - lab * 2.7, lab * 0.9, SD_WHITE)
    text(ctx, 'EXTRACT', vx + lab * 0.6, bot - lab * 1.6, lab * 0.9, SD_WHITE)
    sdLine(ctx, [[left, bot - lab * 0.2], [vx - lab * 0.15, bot - lab * 0.2]], SD_WHITE, lw)
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = lw
    ctx.beginPath(); ctx.arc(vx, bot - lab * 0.2, lab * 0.15, 0, Math.PI * 2); ctx.stroke()
    const ve = f('vent_ext') > 0.5
    // closed: straight green segment along the outline; open: lifted from the pivot
    sdLine(ctx, ve ? [[vx, bot - lab * 0.2], [vx + lab * 0.6, bot - lab * 0.8]] : [[vx + lab * 0.15, bot - lab * 0.2], [vx + lab * 1.7, bot - lab * 0.2]], SD_GREEN, Math.max(1.5, lab * 0.14))
    sdLine(ctx, [[vx + lab * 1.7, bot - lab * 0.2], [w * 0.47, bot - lab * 0.2]], SD_WHITE, lw)

    // outflow valves: arc from closed (horizontal) to open (vertical), green needle
    const ofv = (x, ratio, name) => {
      const R = lab * 2.1, py = bot
      text(ctx, name, x - R * 0.4, py - R - lab * 1.1, lab * 0.95, SD_WHITE)
      ctx.strokeStyle = SD_WHITE; ctx.lineWidth = lw
      ctx.beginPath(); ctx.arc(x, py, R, Math.PI * 1.08, Math.PI * 1.5); ctx.stroke()
      for (const t of [0.15, 0.4, 0.65, 0.9]) {
        const a = Math.PI * (1 + 0.5 * t)
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R, py + Math.sin(a) * R); ctx.lineTo(x + Math.cos(a) * R * 1.12, py + Math.sin(a) * R * 1.12); ctx.stroke()
      }
      ctx.beginPath(); ctx.arc(x, py, lab * 0.15, 0, Math.PI * 2); ctx.stroke()
      sdLine(ctx, [[x + lab * 0.15, py], [x + R * 0.9, py]], SD_WHITE, lw)
      if (Number.isFinite(ratio)) {
        const a = Math.PI * (1 + 0.5 * Math.max(0, Math.min(1, ratio)))
        sdLine(ctx, [[x, py], [x + Math.cos(a) * R, py + Math.sin(a) * R]], SD_GREEN, Math.max(1.5, lab * 0.16))
      }
    }
    const fwd = v.ofv_fwd !== undefined ? f('ofv_fwd') : f('outflow')
    const aft = v.ofv_aft !== undefined ? f('ofv_aft') : f('outflow')
    ofv(w * 0.56, fwd, 'FWD')
    ofv(w * 0.71, aft, 'AFT')

    // safety valve (closed: green bar along the outline)
    text(ctx, 'SAFETY', right - lab * 0.3, top + lab * 2.4, lab * 0.95, SD_WHITE)
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = lw
    ctx.beginPath(); ctx.arc(right, top + lab * 3.4, lab * 0.15, 0, Math.PI * 2); ctx.stroke()
    sdLine(ctx, [[right, top + lab * 3.5], [right, top + lab * 4.6]], SD_GREEN, Math.max(1.5, lab * 0.16))
    sdLine(ctx, [[right, top + lab * 4.6], [right - lab * 0.2, top + lab * 4.6], [right - lab * 0.2, bot], [w * 0.71 + lab * 0.15, bot]], SD_WHITE, lw)

    // packs
    const pk = (x, y, on, name) => {
      sdTri(ctx, x, y, lab * 0.5, 'up', on ? SD_GREEN : SD_AMBER)
      text(ctx, name, x, y + lab * 1.3, lab * 0.95, SD_WHITE)
    }
    pk(left, bot + lab * 1.0, num(v.pack_l, 1) > 0, 'PACK 1')                 // both on the same level
    pk(right - lab * 0.4, bot + lab * 1.0, num(v.pack_r, 1) > 0, 'PACK 2')
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_press',
  label:    'A330 CAB PRESS (SD page)',
  icon:     '◒',
  order:    25,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'outflow', 'pack_l', 'pack_r', ...Object.keys(SD_FOOTER_DREFS)],
}
