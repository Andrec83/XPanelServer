// A330 COND (lower ECAM / SD page), laid out as on the Laminar A330-300: cabin outline
// with the cockpit and six cabin zone temperatures, duct temperatures and trim air
// valves, hot air manifold with hot air valves 1 / 2 and crossfeed, forward and bulk
// cargo compartments (temperature, duct temperature, trim valve, cold air valve), and the
// permanent TAT / SAT / UTC / GW strip.
// Data from the Laminar A330.

import { BaseInstrument } from '../base.js'
import { pick, num, text } from '../_glass.js'
import { sdTitle, sdFooter, sdValve, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER } from './_sd.js'

const L = 'laminar/A333/', C = 'laminar/A333/ecam/COND/'
const ZONES = ['ckpt_temp', 'cabin_temp_fwd', 'cabin_temp_fwd_mid', 'cabin_temp_mid_fwd', 'cabin_temp_mid', 'cabin_temp_mid_aft', 'cabin_temp_aft']

const LAMINAR = {
  t_cargo: `${L}cargo_temp`, t_bulk: `${L}bulk_cargo_temp`,
  duct_cargo: `${C}cargo_duct_temp`, duct_bulk: `${C}bulk_duct_temp`,
  needle_cargo: `${C}cargo_needle`, needle_bulk: `${C}bulk_needle`,
  hot1: `${C}hot_air_valve1`, hot2: `${C}hot_air_valve2`, hot_x: `${C}hot_air_x_valve`,
  cold_air: `${C}cold_air_valve`,
}
ZONES.forEach((z, i) => {
  LAMINAR[`t${i + 1}`] = `${L}${z}`
  LAMINAR[`duct${i + 1}`] = `${C}zone${i + 1}_duct_temp`
  LAMINAR[`needle${i + 1}`] = `${C}zone${i + 1}_needle`
})

export const DEFAULTS = { ...SD_FOOTER_DREFS, ...LAMINAR }

const XS = [0.21, 0.32, 0.41, 0.505, 0.605, 0.705, 0.805]   // zone columns (fraction of width)

export class A333Cond extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.t1 !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'COND DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, Math.min(h * 0.037, w * 0.037))
    const lw = Math.max(1.5, lab * 0.15), thin = Math.max(1, lab * 0.1)
    const t = k => Number.isFinite(f(k)) ? String(Math.round(f(k))) : 'XX'

    sdTitle(ctx, 'COND', w, h, lab)
    text(ctx, 'TEMP :', w * 0.9, h * 0.045, lab * 0.95, SD_WHITE, 'right')
    text(ctx, '°C', w * 0.91, h * 0.045, lab * 0.85, SD_CYAN, 'left')

    // cabin outline: nose, roof, floor with zone dividers
    const yTop = h * 0.16, yFloor = h * 0.27
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = thin
    ctx.beginPath()
    ctx.moveTo(w * 0.87, yTop + lab * 0.6); ctx.lineTo(w * 0.87, yTop); ctx.lineTo(w * 0.17, yTop)
    ctx.quadraticCurveTo(w * 0.1, yTop + lab * 0.3, w * 0.12, (yTop + yFloor) / 2)
    ctx.quadraticCurveTo(w * 0.14, yFloor - lab * 0.1, w * 0.2, yFloor - lab * 0.1)
    ctx.moveTo(w * 0.265, yTop); ctx.lineTo(w * 0.265, yFloor)
    ctx.moveTo(w * 0.265, yFloor); ctx.lineTo(w * 0.87, yFloor); ctx.lineTo(w * 0.87, yFloor - lab * 0.6)
    for (const fx of [0.365, 0.455, 0.555, 0.655, 0.755]) { ctx.moveTo(w * fx, yFloor); ctx.lineTo(w * fx, yFloor - lab * 0.7) }
    ctx.stroke()

    // zone temperatures, duct temperatures, trim valves
    const yGauge = h * 0.36
    XS.forEach((fx, i) => {
      const x = w * fx
      text(ctx, t(`t${i + 1}`), x, h * 0.215, lab * 1.05, SD_GREEN)
      text(ctx, t(`duct${i + 1}`), x, h * 0.305, lab * 0.95, SD_GREEN)
      this._trim(x, yGauge, f(`needle${i + 1}`), lab)
    })
    text(ctx, 'C', w * XS[0] - lab * 1.4, yGauge, lab * 0.85, SD_WHITE)
    text(ctx, 'H', w * XS[6] + lab * 1.4, yGauge, lab * 0.85, SD_WHITE)

    // hot air manifold
    const yMain = h * 0.53, yBar = h * 0.42, g = (x, y) => [w * x, y]
    const stem = i => sdLine(ctx, [[w * XS[i], yGauge + lab * 0.2], [w * XS[i], (i === 1 || i === 4 || i === 6) ? yMain : i === 0 ? yBar : yBar]], SD_GREEN, lw)
    for (let i = 0; i < 7; i++) stem(i)
    sdLine(ctx, [g(XS[0], yBar), g(0.3, yBar)], SD_GREEN, lw)                       // cockpit stub
    sdLine(ctx, [g(0.36, yBar), g(0.59, yBar)], SD_GREEN, lw)                       // zones 3–4
    sdLine(ctx, [g(0.65, yBar), g(0.77, yBar)], SD_GREEN, lw)                       // zone 6
    sdLine(ctx, [g(0.14, yMain), g(XS[6], yMain)], SD_GREEN, lw)                    // main manifold
    // crossfeed valve between the zone 3–4 bar and the manifold
    sdValve(ctx, w * 0.49, h * 0.475, lab * 0.8, num(v.hot_x, 0) > 0.5, 'v')
    // hot air valves 1 / 2
    const hot1 = num(v.hot1, 1) > 0.5, hot2 = num(v.hot2, 1) > 0.5
    sdLine(ctx, [g(0.14, yMain), g(0.14, h * 0.575)], SD_GREEN, lw)
    sdValve(ctx, w * 0.14, h * 0.6, lab * 0.85, hot1, 'v', hot1 ? SD_GREEN : SD_AMBER)
    text(ctx, 'HOT', w * 0.14, h * 0.67, lab * 0.95, SD_GREEN); text(ctx, 'AIR', w * 0.14, h * 0.67 + lab * 1.1, lab * 0.95, SD_GREEN); text(ctx, '1', w * 0.14, h * 0.67 + lab * 2.2, lab * 0.95, SD_GREEN)
    sdLine(ctx, [g(0.85, h * 0.445), g(0.89, h * 0.445), g(0.89, h * 0.6 - lab * 0.85)], SD_GREEN, lw)
    sdValve(ctx, w * 0.89, h * 0.6, lab * 0.85, hot2, 'v', hot2 ? SD_GREEN : SD_AMBER)
    text(ctx, 'HOT', w * 0.89, h * 0.67, lab * 0.95, SD_GREEN); text(ctx, 'AIR', w * 0.89, h * 0.67 + lab * 1.1, lab * 0.95, SD_GREEN); text(ctx, '2', w * 0.89, h * 0.67 + lab * 2.2, lab * 0.95, SD_GREEN)

    // forward cargo: box, duct temperature, trim valve fed from the manifold, cold air valve
    const box = (x0, x1, y, name, key) => {
      ctx.strokeStyle = SD_WHITE; ctx.lineWidth = thin
      // closed box with an opening in the middle of the bottom edge, facing the duct temperature
      const xm = w * (x0 + x1) / 2, gap = lab * 0.9, top = y - lab * 0.9, bot = y + lab * 0.9
      ctx.beginPath()
      ctx.moveTo(xm - gap, bot); ctx.lineTo(w * x0, bot); ctx.lineTo(w * x0, top); ctx.lineTo(w * x1, top); ctx.lineTo(w * x1, bot); ctx.lineTo(xm + gap, bot)
      ctx.stroke()
      text(ctx, name, w * x0 + lab * 0.4, y, lab * 0.95, SD_WHITE, 'left')
      text(ctx, t(key), w * x1 - lab * 0.6, y, lab * 1.05, SD_GREEN, 'right')
    }
    const yBox = h * 0.6, yDuct = h * 0.665, yCG = h * 0.72
    box(0.28, 0.47, yBox, 'FWD', 't_cargo')
    text(ctx, t('duct_cargo'), w * 0.38, yDuct, lab * 0.95, SD_GREEN)
    this._trim(w * 0.38, yCG, f('needle_cargo'), lab, true)
    sdLine(ctx, [g(0.22, yMain), g(0.22, h * 0.79), g(0.38, h * 0.79), g(0.38, yCG + lab * 0.2)], SD_GREEN, lw)
    sdLine(ctx, [g(0.38, yCG - lab * 0.3), g(0.38, yCG - lab * 0.5), g(0.45, yCG - lab * 0.5)], SD_GREEN, lw)
    const cold = Math.round(num(v.cold_air, 0))
    const cx = w * 0.48, cy = yCG - lab * 0.5, cr = lab * 0.8
    if (cold === 1 || cold === 0) sdValve(ctx, cx, cy, cr, cold === 1, 'h')
    else {                                               // in transit / disagree: amber with a slash
      ctx.strokeStyle = SD_AMBER; ctx.lineWidth = lw
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.moveTo(cx - cr * 0.7, cy + cr * 0.7); ctx.lineTo(cx + cr * 0.7, cy - cr * 0.7); ctx.stroke()
    }
    sdLine(ctx, [[cx + cr, cy], [w * 0.54, cy], [w * 0.54, h * 0.76]], SD_GREEN, lw)          // from the circle's edge
    text(ctx, 'COLD', w * 0.55, h * 0.785, lab * 0.95, SD_WHITE); text(ctx, 'AIR', w * 0.55, h * 0.785 + lab * 1.1, lab * 0.95, SD_WHITE)

    // bulk cargo
    box(0.6, 0.8, yBox, 'BULK', 't_bulk')
    text(ctx, t('duct_bulk'), w * 0.69, yDuct, lab * 0.95, SD_GREEN)
    this._trim(w * 0.69, yCG, f('needle_bulk'), lab, true)
    sdLine(ctx, [g(0.64, yCG - lab * 0.6), g(0.64, yCG + lab * 1.1), g(0.74, yCG + lab * 1.1), g(0.74, yCG - lab * 0.6)], SD_WHITE, thin)

    sdFooter(ctx, w, h, v, lab)
  }

  // trim air valve: small C/H arc with a green arrow from below; needle −1 (cold) … +1 (hot)
  _trim(x, y, needle, lab, labels = false) {
    const { ctx } = this, r = lab * 0.8
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, lab * 0.1)
    ctx.beginPath(); ctx.arc(x, y + r * 0.6, r, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke()
    if (labels) { text(ctx, 'C', x - r * 1.8, y, lab * 0.85, SD_WHITE); text(ctx, 'H', x + r * 1.8, y, lab * 0.85, SD_WHITE) }
    const a = Math.PI * 1.5 + Math.max(-1, Math.min(1, Number.isFinite(needle) ? needle : 0)) * Math.PI * 0.3
    const tx = x + Math.cos(a) * r * 1.1, ty = y + r * 0.6 + Math.sin(a) * r * 1.1
    ctx.strokeStyle = SD_GREEN; ctx.fillStyle = SD_GREEN; ctx.lineWidth = Math.max(1.5, lab * 0.14)
    ctx.beginPath(); ctx.moveTo(x, y + r * 0.6); ctx.lineTo(tx, ty); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - lab * 0.25, ty + lab * 0.35); ctx.lineTo(tx + lab * 0.25, ty + lab * 0.35); ctx.closePath(); ctx.fill()
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_cond',
  label:    'A330 COND (SD page)',
  icon:     '❄',
  order:    30,
  datarefs: DEFAULTS,
  requires: 'the Laminar A330 (publishes the laminar/A333/ecam/COND datarefs)',
  optionalDatarefs: [...Object.keys(SD_FOOTER_DREFS)],
}
