// A330 WHEEL (lower ECAM / SD page) — ground spoilers, landing gear position, brake
// temperatures for the eight main wheels with the hottest-brake arc and anti-skid
// release indication, autobrake mode, braking / L/G CTL / anti-skid status, and the
// permanent TAT / SAT / UTC / GW strip.
// Gear positions use X-Plane's standard gear datarefs (also work on other aircraft); the
// spoiler states, brake temperatures and statuses come from the Laminar A330.

import { BaseInstrument } from '../base.js'
import { pick, num, at, text } from '../_glass.js'
import { sdTitle, sdFooter, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER, SD_RED } from './_sd.js'

const W = 'laminar/A333/ecam/wheel/', AB = 'laminar/A333/annun/auto_brake/', FC = 'laminar/A333/flight_controls/'

const LAMINAR = {
  lg_ctl:     `${W}l_g_ctl_status`,
  norm_brk:   `${W}norm_brake_status`,
  anti_skid:  `${W}anti_skid_status`,
  temp_exceed:`${W}brake_temp_exceed`,
  rel_left:   `${W}brake_release_left`,
  rel_right:  `${W}brake_release_right`,
  ab_lo:      `${AB}lo_on`,
  ab_med:     `${AB}med_on`,
  ab_max:     `${AB}max_on`,
  ab_lo_dec:  `${AB}lo_decel`,
  ab_med_dec: `${AB}med_decel`,
  ab_max_dec: `${AB}max_decel`,
}
for (let i = 1; i <= 8; i++) {
  LAMINAR[`bt${i}`]  = `${W}brake_temp_${i}`
  LAMINAR[`arc${i}`] = `${W}brake_temp_arc_${i}`
}
for (let i = 1; i <= 6; i++) {
  LAMINAR[`spl${i}`] = `${FC}spoiler${i}_L_enum`
  LAMINAR[`spr${i}`] = `${FC}spoiler${i}_R_enum`
}

export const DEFAULTS = {
  gear:        'sim/flightmodel2/gear/deploy_ratio',
  speedbrake:  'sim/flightmodel2/controls/speedbrake_ratio',
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

export class A333Wheel extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.gear !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'WHEEL DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v
    const lab = Math.max(7, Math.min(h * 0.04, w * 0.04))

    sdTitle(ctx, 'WHEEL', w, h, lab)
    this._spoilers(lab)

    // landing gear: nose centre, mains left / right
    this._gear(w * 0.5, h * 0.25, at(v.gear, 0, NaN), lab, 'nose')
    this._gear(w * 0.2, h * 0.4, at(v.gear, 1, NaN), lab, 'left')
    this._gear(w * 0.8, h * 0.4, at(v.gear, 2, NaN), lab, 'right')

    // brakes: left main 1 2 / 5 6, right main 3 4 / 7 8
    this._brakes(w * 0.2, h * 0.6, [1, 2], 'left', lab)
    this._brakes(w * 0.2, h * 0.75, [5, 6], 'left', lab)
    this._brakes(w * 0.8, h * 0.6, [3, 4], 'right', lab)
    this._brakes(w * 0.8, h * 0.75, [7, 8], 'right', lab)

    // centre: autobrake and system status
    const s = k => num(v[k], 0) > 0
    const ab = s('ab_max') ? 'MAX' : s('ab_med') ? 'MED' : s('ab_lo') ? 'LO' : ''
    if (ab) {
      text(ctx, 'AUTO BRK', w / 2, h * 0.58, lab, SD_GREEN)
      text(ctx, ab, w / 2, h * 0.58 + lab * 1.3, lab, SD_GREEN)
      if (s('ab_max_dec') || s('ab_med_dec') || s('ab_lo_dec')) text(ctx, 'DECEL', w / 2, h * 0.58 + lab * 2.6, lab, SD_GREEN)
    }
    const msgs = [['lg_ctl', 'L/G CTL'], ['norm_brk', 'NORM BRK'], ['anti_skid', 'ANTI SKID']].filter(([k]) => s(k))
    msgs.forEach(([, m], i) => text(ctx, m, w / 2, h * 0.36 + i * lab * 1.4, lab, SD_AMBER))

    sdFooter(ctx, w, h, v, lab)
  }

  // ground spoilers: 6 per wing along the top, green dash retracted, green triangle extended
  _spoilers(lab) {
    const { ctx, w, h } = this, v = this._v
    const sb = num(v.speedbrake, 0)
    for (const [side, dir] of [['l', -1], ['r', 1]]) {
      for (let i = 1; i <= 6; i++) {
        const e = v[`sp${side}${i}`]
        const st = e === undefined ? (sb > 0.05 ? 2 : 1) : Math.round(num(e, 1))
        const x = w / 2 + dir * (w * 0.06 + (i - 1) * w * 0.065)
        const y = h * 0.12 + (i - 1) * (i - 1) * h * 0.0025          // slight droop towards the tips
        ctx.fillStyle = st === 0 ? SD_AMBER : SD_GREEN; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1.5, lab * 0.15)
        if (st >= 2) {
          ctx.beginPath(); ctx.moveTo(x - lab * 0.4, y); ctx.lineTo(x + lab * 0.4, y); ctx.lineTo(x, y - lab * 0.8); ctx.closePath(); ctx.fill()
        } else {
          ctx.beginPath(); ctx.moveTo(x - lab * 0.4, y); ctx.lineTo(x + lab * 0.4, y); ctx.stroke()
        }
      }
    }
  }

  // gear: door line with hinge circles and one hatched triangle below it.
  //   up-locked: doors closed (green), no triangle; down-locked: doors closed, green triangle;
  //   in transit: doors drawn open (amber, hanging from their hinges), red triangle.
  // X-Plane has no gear-door dataref, so the doors are open while the gear is moving.
  // kind: 'nose' (two doors) or 'left' / 'right' main (one inboard door)
  _gear(cx, cy, ratio, lab, kind) {
    const { ctx } = this
    const s = lab * 0.95, y0 = cy - s * 0.9
    const transit = Number.isFinite(ratio) && ratio > 0.01 && ratio < 0.99
    const thin = Math.max(1, lab * 0.1), thick = Math.max(1.5, lab * 0.16)
    const hinge = x => { ctx.strokeStyle = SD_WHITE; ctx.lineWidth = thin; ctx.beginPath(); ctx.arc(x, y0, lab * 0.18, 0, Math.PI * 2); ctx.stroke() }
    if (!transit) {
      sdLine(ctx, [[cx - s * 2.6, y0], [cx + s * 2.6, y0]], SD_WHITE, thin)
      const hs = kind === 'nose' ? [-s * 2.0, s * 2.0] : [-s * 2.0, s * 1.6]
      hs.forEach(dx => hinge(cx + dx))
      sdLine(ctx, [[cx - s * 1.6, y0], [cx + s * 1.2, y0]], SD_GREEN, thick)
    } else {
      const door = (hx, dir) => {                        // hinge + door hanging down and outwards
        hinge(hx)
        sdLine(ctx, [[hx, y0 + lab * 0.18], [hx + dir * s * 0.35, y0 + s * 1.6]], SD_AMBER, thick)
      }
      if (kind === 'nose') { door(cx - s * 2.0, -1); door(cx + s * 2.0, 1) }
      else {
        const inboard = kind === 'left' ? 1 : -1
        door(cx + inboard * s * 2.0, inboard)
        sdLine(ctx, [[cx - inboard * s * 2.0, y0], [cx - inboard * s * 2.6, y0]], SD_WHITE, thin)   // outboard stub
      }
    }
    if (kind === 'nose') {                               // nose wheel arcs
      ctx.strokeStyle = SD_WHITE; ctx.lineWidth = thin
      for (const dx of [-s * 1.2, s * 1.2]) { ctx.beginPath(); ctx.arc(cx + dx, y0 + s * 1.6, s * 1.0, Math.PI * 0.3, Math.PI * 0.7); ctx.stroke() }
    }
    if (!Number.isFinite(ratio) || ratio < 0.01) return
    const col = ratio > 0.99 ? SD_GREEN : SD_RED
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, lab * 0.14)
    ctx.beginPath(); ctx.moveTo(cx - s, y0 + s * 0.15); ctx.lineTo(cx + s, y0 + s * 0.15); ctx.lineTo(cx, y0 + s * 1.5); ctx.closePath(); ctx.stroke()
    ctx.save(); ctx.clip()                               // hatched: down-locked (green) and in transit (red)
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(cx + k * s * 0.28, y0); ctx.lineTo(cx + k * s * 0.28, y0 + s * 1.6); ctx.stroke() }
    ctx.restore()
  }

  // one pair of wheels: arc above, temperature (°C), wheel number with release marks
  // ("R" between the pair), arc below. The top arc turns green on the hottest brake.
  _brakes(cx, y, [a, b], side, lab) {
    const { ctx, w } = this, v = this._v
    const dx = w * 0.08
    const hot = num(v.temp_exceed, 0) > 0
    text(ctx, '°C', cx, y + lab * 0.3, lab * 0.85, SD_CYAN)
    text(ctx, 'R', cx, y + lab * 1.45, lab * 0.8, SD_WHITE)
    // Laminar: 0 = brakes released (marks shown), as on the cockpit page
    const relKey = side === 'left' ? 'rel_left' : 'rel_right'
    // the cockpit page hides them while the gear is in transit
    const moving = [0, 1, 2].some(i => { const r = at(v.gear, i, 0); return r > 0.01 && r < 0.99 })
    const released = !moving && v[relKey] !== undefined && num(v[relKey], 1) === 0
    for (const [n, x] of [[a, cx - dx], [b, cx + dx]]) {
      const t = num(v[`bt${n}`], NaN), hi = num(v[`arc${n}`], 0) > 0
      const tcol = hot && t > 300 ? SD_AMBER : SD_GREEN
      ctx.lineWidth = Math.max(1.2, lab * (hi ? 0.15 : 0.1))
      ctx.strokeStyle = hi ? tcol : SD_WHITE
      ctx.beginPath(); ctx.arc(x, y + lab * 1.0, lab * 1.7, Math.PI * 1.3, Math.PI * 1.7); ctx.stroke()
      ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1.2, lab * 0.1)
      ctx.beginPath(); ctx.arc(x, y + lab * 1.0, lab * 1.7, Math.PI * 0.3, Math.PI * 0.7); ctx.stroke()
      text(ctx, Number.isFinite(t) ? String(Math.round(t / 5) * 5) : 'XX', x, y, lab * 1.05, tcol)
      text(ctx, String(n), x, y + lab * 1.45, lab * 0.9, SD_WHITE)
      if (released) {
        ctx.fillStyle = SD_GREEN
        for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) ctx.fillRect(x + sx * (lab * 0.55 + k * lab * 0.2) - lab * 0.05, y + lab * 0.95, lab * 0.1, lab)
      }
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_wheel',
  label:    'A330 WHEEL (SD page)',
  icon:     '◍',
  order:    21,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'speedbrake', ...Object.keys(SD_FOOTER_DREFS)],
}
