// A330 BLEED (lower ECAM / SD page), laid out as on the Laminar A330-300: bleed users
// line, packs (outlet and compressor outlet temperature, C/H and LO/HI flow needles),
// pack valves, ram air valve, crossbleed valve, precooler pressure and temperature,
// engine IP / HP bleed valves, and the permanent TAT / SAT / UTC / GW strip.
// Data from the Laminar A330 (engine bleed valves from X-Plane's standard datarefs).
//
// Bleed pressure: the Laminar A330 publishes precooler pressure as a ratio; the PSI shown
// is 27.6 × ratio − 3, fitted to three cockpit readings (2 PSI engine off, 28 and 34 PSI).
// With an engine stopped its IP / HP valves, lines and number are shown closed and amber.

import { BaseInstrument } from '../base.js'
import { pick, num, at, text } from '../_glass.js'
import { sdTitle, sdFooter, sdValve, sdTri, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER } from './_sd.js'

const B = 'laminar/A333/ecam/bleed/'
const PSI_PER_RATIO = 27.6, PSI_OFFSET = -3     // fitted to the cockpit: 2, 28 and 34 PSI
const LOW_PSI = 4

const LAMINAR = { ram_air: 'laminar/A333/ecam/BLEED/ram_air_status', xbleed: `${B}crossbleed_valve_pos` }
for (const n of [1, 2]) Object.assign(LAMINAR, {
  [`pack${n}_out`]:  `${B}pack${n}_outlet_temp`,
  [`pack${n}_comp`]: `${B}pack${n}_compressor_outlet_temp`,
  [`pack${n}_ch`]:   `${B}pack${n}_CH`,
  [`pack${n}_flow`]: `${B}pack${n}_flow`,
  [`pack${n}_vlv`]:  `${B}pack${n}_valve_pos`,
  [`pc${n}_temp`]:   `${B}precooler${n}_temp`,
  [`pc${n}_psi`]:    `${B}precooler${n}_psi`,
  [`pc${n}_tst`]:    `${B}precooler${n}_temp_status`,
  [`hp${n}`]:        `${B}eng${n}_hp_bleed_valve_pos`,
})

export const DEFAULTS = {
  eng_bleed: 'sim/cockpit2/bleedair/actuators/engine_bleed_sov',
  running:   'sim/flightmodel/engine/ENGN_running',
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

export class A333Bleed extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.pack1_out !== undefined || this._v.eng_bleed !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'BLEED DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, Math.min(h * 0.04, w * 0.04))
    const lw = Math.max(1.5, lab * 0.15)
    const vr = lab * 0.9                                 // valve radius

    sdTitle(ctx, 'BLEED', w, h, lab)

    const xs = [w * 0.27, w * 0.73]
    const yTop = h * 0.13, yPack = h * 0.25, yPV = h * 0.43, yBox = h * 0.57, yIP = h * 0.7, yEnd = h * 0.83
    // users line across the top with the four user triangles
    sdLine(ctx, [[xs[0], yPack - lab * 2.6], [xs[0], yTop], [xs[1], yTop], [xs[1], yPack - lab * 2.6]], SD_GREEN, lw)
    for (const fx of [0.38, 0.48, 0.58, 0.68]) sdTri(ctx, w * fx, yTop - lab * 0.6, lab * 0.45, 'up', SD_GREEN)

    // ram air valve
    // open: connected up to the users line; closed: short stub below, not connected
    const yRam = h * 0.2, ramOpen = f('ram_air') > 0
    sdValve(ctx, w * 0.5, yRam, vr, ramOpen, 'v')
    if (ramOpen) sdLine(ctx, [[w * 0.5, yTop], [w * 0.5, yRam - vr]], SD_GREEN, lw)
    sdLine(ctx, [[w * 0.5, yRam + vr], [w * 0.5, yRam + vr * 1.6]], SD_GREEN, lw)
    text(ctx, 'RAM', w * 0.5, yRam + vr * 2.6, lab * 0.9, SD_WHITE)
    text(ctx, 'AIR', w * 0.5, yRam + vr * 3.7, lab * 0.9, SD_WHITE)

    // crossbleed valve (flow horizontal), stubs only
    const xbOpen = f('xbleed') > 0.5
    sdValve(ctx, w * 0.5, h * 0.5, vr, xbOpen, 'h')
    sdLine(ctx, [[w * 0.5 - vr * 1.6, h * 0.5], [w * 0.5 - vr, h * 0.5]], SD_GREEN, lw)
    sdLine(ctx, [[w * 0.5 + vr, h * 0.5], [w * 0.5 + vr * 1.6, h * 0.5]], SD_GREEN, lw)
    if (xbOpen) sdLine(ctx, [[xs[0], h * 0.5], [w * 0.5 - vr * 1.6, h * 0.5], [w * 0.5 + vr * 1.6, h * 0.5], [xs[1], h * 0.5]], SD_GREEN, lw)

    for (const i of [0, 1]) {
      const n = i + 1, x = xs[i], right = i === 1
      this._pack(x, yPack, n, lab)
      // engine state: with the engine stopped its bleed is shown closed and amber, as in the cockpit
      const running = v.running === undefined || at(v.running, i, 1) > 0
      const psi = Math.max(0, f(`pc${n}_psi`) * PSI_PER_RATIO + PSI_OFFSET), t = f(`pc${n}_temp`)
      const psiLow = Number.isFinite(psi) && psi < LOW_PSI
      const tLow = v[`pc${n}_tst`] !== undefined && num(v[`pc${n}_tst`], 1) < 0.5
      const below = running && !psiLow ? SD_GREEN : SD_AMBER        // lines under the pack valve
      // pack valve
      const pv = f(`pack${n}_vlv`) > 0.5
      sdLine(ctx, [[x, yPack + lab * 2.8], [x, yPV - vr]], SD_GREEN, lw)
      sdValve(ctx, x, yPV, vr, pv, 'v', pv ? SD_GREEN : SD_AMBER)
      sdLine(ctx, [[x, yPV + vr], [x, yBox - lab * 1.3]], below, lw)
      // precooler pressure / temperature box
      ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, lab * 0.1)
      ctx.strokeRect(x - lab * 1.6, yBox - lab * 1.3, lab * 3.2, lab * 2.6)
      text(ctx, Number.isFinite(psi) ? String(Math.round(psi)) : 'XX', x, yBox - lab * 0.6, lab * 1.1, psiLow ? SD_AMBER : SD_GREEN)
      text(ctx, Number.isFinite(t) ? String(Math.round(t)) : 'XX', x, yBox + lab * 0.65, lab * 1.1, tLow ? SD_AMBER : SD_GREEN)
      const ux = right ? x - lab * 2.2 : x + lab * 2.2, ua = right ? 'right' : 'left'
      text(ctx, 'PSI', ux, yBox - lab * 0.6, lab * 0.85, SD_CYAN, ua)
      text(ctx, '°C', ux, yBox + lab * 0.65, lab * 0.85, SD_CYAN, ua)
      // engine IP bleed valve (closed while the engine is stopped), engine number, HP valve
      const ip = running && at(v.eng_bleed, i, 0) > 0.5
      sdLine(ctx, [[x, yBox + lab * 1.3], [x, yIP - vr]], below, lw)
      sdValve(ctx, x, yIP, vr, ip, 'v', ip ? SD_GREEN : SD_AMBER)
      sdLine(ctx, [[x, yIP + vr], [x, yEnd - lab * 0.8]], running ? SD_GREEN : SD_AMBER, lw)
      text(ctx, 'IP', x, yEnd, lab * 0.9, SD_WHITE)
      text(ctx, String(n), right ? x + lab * 2.4 : x - lab * 2.4, yIP, lab * 1.2, running ? SD_WHITE : SD_AMBER)
      const hx = right ? x - lab * 2.6 : x + lab * 2.6, hy = yIP + lab * 1.9, hp = running && f(`hp${n}`) > 0.5
      const hpCol = running ? SD_GREEN : SD_AMBER
      sdValve(ctx, hx, hy, vr, hp, 'h', hpCol)
      const hpEnd = right ? hx - lab * 2.2 : hx + lab * 2.2
      sdLine(ctx, [[right ? hx - vr : hx + vr, hy], [hpEnd, hy], [hpEnd, hy + lab * 0.9]], hpCol, lw)
      text(ctx, 'HP', hpEnd, hy + lab * 1.6, lab * 0.9, SD_WHITE)
    }

    sdFooter(ctx, w, h, v, lab)
  }

  // pack: outline with outlet temperature, C/H needle, compressor outlet temperature, LO/HI needle
  _pack(x, y, n, lab) {
    const { ctx } = this, f = k => num(this._v[k], NaN)
    const bw = lab * 4.4, top = y - lab * 2.7, bot = y + lab * 2.8
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, lab * 0.1)
    ctx.beginPath()
    ctx.moveTo(x - bw / 2, top + lab * 0.4); ctx.lineTo(x - bw / 2, bot)
    ctx.moveTo(x - bw / 2, top + lab * 0.4); ctx.lineTo(x - lab * 0.3, top); ctx.lineTo(x + bw / 2, top + lab * 0.4); ctx.lineTo(x + bw / 2, bot)
    ctx.stroke()
    const t = (k, yy) => {
      const val = f(k)
      text(ctx, Number.isFinite(val) ? String(Math.round(val)) : 'XX', x + lab * 0.3, yy, lab * 1.05, SD_GREEN, 'right')
      text(ctx, '°C', x + lab * 0.5, yy, lab * 0.8, SD_CYAN, 'left')
    }
    t(`pack${n}_out`, top + lab * 1.05)
    t(`pack${n}_comp`, y + lab * 0.85)
    // C/H arc and needle (0 = cold … 1 = hot), LO/HI arc and needle (flow 0.5 … 1.5)
    const arc = (cy, frac, l, r) => {             // cy = top of the arc
      ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, lab * 0.1)
      ctx.beginPath(); ctx.arc(x, cy + lab * 2.2, lab * 2.2, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke()
      text(ctx, l, x - bw / 2 - lab * 0.5, cy + lab * 0.2, lab * 0.85, SD_WHITE, 'right')
      text(ctx, r, x + bw / 2 + lab * 0.5, cy + lab * 0.2, lab * 0.85, SD_WHITE, 'left')
      if (!Number.isFinite(frac)) return
      const a = Math.PI * (1.25 + 0.5 * Math.max(0, Math.min(1, frac)))
      ctx.strokeStyle = SD_GREEN; ctx.lineWidth = Math.max(1.5, lab * 0.14)
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(a) * lab * 1.2, cy + lab * 2.2 + Math.sin(a) * lab * 1.2)
      ctx.lineTo(x + Math.cos(a) * lab * 2.5, cy + lab * 2.2 + Math.sin(a) * lab * 2.5)
      ctx.stroke()
    }
    arc(top + lab * 2.0, f(`pack${n}_ch`), 'C', 'H')
    arc(y + lab * 1.75, f(`pack${n}_flow`) - 0.5, 'LO', 'HI')
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_bleed',
  label:    'A330 BLEED (SD page)',
  icon:     '⇅',
  order:    24,
  datarefs: DEFAULTS,
  requires: 'the Laminar A330 (publishes the laminar/A333/ecam/bleed datarefs)',
  optionalDatarefs: [...Object.keys(SD_FOOTER_DREFS), 'eng_bleed', 'running', 'pc1_tst', 'pc2_tst'],
}
