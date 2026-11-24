// A330 DOOR/OXY (lower ECAM / SD page), laid out as on the Laminar A330-300: fuselage
// outline with the eight passenger doors (SLIDE when armed), avionics and cargo doors,
// crew oxygen pressure, cabin vertical speed, and the permanent TAT / SAT / UTC / GW strip.
// Door positions use X-Plane's door datarefs (indices 0–7 passenger doors L1 R1 L2 R2
// L3 R3 L4 R4, 8–10 forward cargo / aft cargo / bulk — an assumption, see the notes);
// slide arming and oxygen status come from the Laminar A330 (optional).

import { BaseInstrument } from '../base.js'
import { pick, num, at, text } from '../_glass.js'
import { sdFooter, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER } from './_sd.js'

const LAMINAR = { oxy_ok: 'laminar/A333/ECAM/door/ckpt_oxy_status' }
for (let i = 1; i <= 8; i++) LAMINAR[`slide${i}`] = `laminar/A333/ECAM/doors/slide${i}`

export const DEFAULTS = {
  doors:  'sim/flightmodel2/misc/door_open_ratio',
  oxy:    'sim/cockpit2/oxygen/indicators/o2_bottle_pressure_psi',
  cab_vs: 'sim/cockpit2/pressurization/indicators/cabin_vvi_fpm',
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

export class A333Door extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.doors !== undefined || this._v.slide1 !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'DOOR DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, Math.min(h * 0.04, w * 0.04))
    const lw = Math.max(1.2, lab * 0.12)

    text(ctx, 'DOOR/OXY', w * 0.5, h * 0.045, lab * 1.3, SD_WHITE)
    ctx.fillStyle = SD_WHITE; ctx.fillRect(w * 0.5 - lab * 3.4, h * 0.045 + lab * 0.8, lab * 6.8, Math.max(1, lab * 0.1))

    // crew oxygen
    const oxy = f('oxy'), oxyOk = v.oxy_ok === undefined || num(v.oxy_ok, 1) > 0
    text(ctx, 'CKPT OXY', w * 0.86, h * 0.05, lab * 0.95, SD_WHITE)
    text(ctx, Number.isFinite(oxy) ? String(Math.round(oxy / 10) * 10) : 'XX', w * 0.83, h * 0.05 + lab * 1.2, lab * 1.1, oxyOk ? SD_GREEN : SD_AMBER, 'right')
    text(ctx, 'PSI', w * 0.85, h * 0.05 + lab * 1.2, lab * 0.85, SD_CYAN, 'left')

    // fuselage outline (nose up) and wings
    const cx = w * 0.5, half = w * 0.06, top = h * 0.12, bot = h * 0.82
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(cx - half, bot); ctx.lineTo(cx - half, top + h * 0.12)
    ctx.quadraticCurveTo(cx - half, top + h * 0.02, cx, top)
    ctx.quadraticCurveTo(cx + half, top + h * 0.02, cx + half, top + h * 0.12)
    ctx.lineTo(cx + half, bot)
    ctx.moveTo(cx - half, h * 0.43); ctx.lineTo(cx - w * 0.19, h * 0.47)
    ctx.moveTo(cx + half, h * 0.43); ctx.lineTo(cx + w * 0.19, h * 0.47)
    ctx.stroke()

    // door symbol: green outline closed, amber filled open
    const door = (x, y, dw, dh, open) => {
      ctx.lineWidth = Math.max(1.2, lab * 0.12)
      if (open) { ctx.fillStyle = SD_AMBER; ctx.fillRect(x - dw / 2, y - dh / 2, dw, dh) }
      ctx.strokeStyle = open ? SD_AMBER : SD_GREEN
      ctx.strokeRect(x - dw / 2, y - dh / 2, dw, dh)
    }
    const doorOpen = i => at(v.doors, i, 0) > 0.05
    // passenger doors: four pairs, SLIDE labels while armed
    const rows = [h * 0.27, h * 0.38, h * 0.57, h * 0.76]
    rows.forEach((y, k) => {
      for (const side of [0, 1]) {
        const idx = k * 2 + side, x = side ? cx + half * 0.65 : cx - half * 0.65
        const open = doorOpen(idx)
        door(x, y, lab * 0.5, lab * 0.9, open)
        const slide = v[`slide${idx + 1}`]
        if (slide === undefined || num(slide, 0) > 0)
          text(ctx, 'SLIDE', side ? x + lab * 0.6 : x - lab * 0.6, y, lab * 0.85, SD_WHITE, side ? 'left' : 'right')
        if (open) text(ctx, 'CABIN', side ? x + lab * 4 : x - lab * 4, y, lab * 0.85, SD_AMBER, side ? 'left' : 'right')
      }
    })
    // avionics (nose), forward cargo, aft cargo, bulk
    door(cx, h * 0.22, lab * 0.45, lab * 0.6, false)
    const cargo = [[8, h * 0.32, lab * 0.8, 'CARGO'], [9, h * 0.68, lab * 0.8, 'CARGO'], [10, h * 0.73, lab * 0.5, 'BULK']]
    for (const [i, y, dh, name] of cargo) {
      door(cx + half * 0.55, y, lab * 0.7, dh, doorOpen(i))
      if (doorOpen(i)) text(ctx, name, cx + half + lab * 0.5, y, lab * 0.85, SD_AMBER, 'left')
    }

    // cabin vertical speed
    const vs = f('cab_vs')
    text(ctx, 'V/S', w * 0.05, h * 0.86, lab, SD_WHITE, 'left')
    text(ctx, Number.isFinite(vs) ? String(Math.round(vs)) : 'XX', w * 0.42, h * 0.86, lab * 1.05, SD_GREEN, 'right')
    text(ctx, 'FT/MIN', w * 0.44, h * 0.86, lab * 0.85, SD_CYAN, 'left')

    sdFooter(ctx, w, h, v, lab)
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_door',
  label:    'A330 DOOR/OXY (SD page)',
  icon:     '🚪',
  order:    29,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'oxy', 'cab_vs', ...Object.keys(SD_FOOTER_DREFS)],
}
