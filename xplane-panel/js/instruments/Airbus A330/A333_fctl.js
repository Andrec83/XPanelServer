// A330 F/CTL (lower ECAM / SD page), laid out as on the Laminar A330-300: spoilers /
// speed brakes, inner and outer aileron positions, PRIM 1-3 / SEC 1-2 computers, pitch
// trim, elevator positions, rudder with rudder trim, the hydraulic systems (G B Y) that
// power each surface, and the permanent TAT / SAT / UTC / GW strip.
// Surface positions use X-Plane's flight model deflections (degrees against their travel);
// spoiler states, computers, surface status and hydraulic availability come from the
// Laminar A330 (optional).
//
// Pitch trim: the A330 stabilizer range (2° DN … 14° UP) mapped onto X-Plane's elevator
// trim ratio (−1 … +1): trim° = 6 + 8 × ratio. Checked against the cockpit page at six
// readings (level, turns both ways, two speeds) — all match to 0.1°.

import { BaseInstrument } from '../base.js'
import { pick, num, text } from '../_glass.js'
import { sdTitle, sdFooter, sdTri, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER } from './_sd.js'

const FC = 'sim/flightmodel/controls/', L = 'laminar/A333/'
const TRIM_CENTRE_DEG = 6, TRIM_DEG_PER_RATIO = 8     // ratio −1 → 2° DN, 0 → 6° UP, +1 → 14° UP

const LAMINAR = {
  sys_g: `${L}flight_controls/green_status`, sys_b: `${L}flight_controls/blue_status`, sys_y: `${L}flight_controls/yellow_status`,
  st_ail_lo: `${L}ecam/fctl_outer_ail_L_status`, st_ail_li: `${L}ecam/fctl_inner_ail_L_status`,
  st_ail_ri: `${L}ecam/fctl_inner_ail_R_status`, st_ail_ro: `${L}ecam/fctl_outer_ail_R_status`,
  st_elev_l: `${L}ecam/fctl_L_elev_status`, st_elev_r: `${L}ecam/fctl_R_elev_status`,
  st_rud: `${L}ecam/fctl_rudder_hyd_status`, st_pitch: `${L}ecam/fctl_pitch_hyd_status`,
  rud_trim_ind: `${L}ecam/FCTL/rudder_trim_ind`,
  prim1: `${L}fcc/prim1_status`, prim2: `${L}fcc/prim2_status`, prim3: `${L}fcc/prim3_status`,
  sec1: `${L}fcc/sec1_status`, sec2: `${L}fcc/sec2_status`,
}
for (let i = 1; i <= 6; i++) { LAMINAR[`spl${i}`] = `${L}flight_controls/spoiler${i}_L_enum`; LAMINAR[`spr${i}`] = `${L}flight_controls/spoiler${i}_R_enum` }

export const DEFAULTS = {
  ail_li: `${FC}lail1def`, ail_lo: `${FC}lail2def`, ail_ri: `${FC}rail1def`, ail_ro: `${FC}rail2def`,
  elev_l: `${FC}hstab1_elv1def`, elev_r: `${FC}hstab2_elv1def`,
  rudder: `${FC}ldruddef`,
  elev_trim: 'sim/cockpit2/controls/elevator_trim',
  rud_trim:  'sim/cockpit2/controls/rudder_trim',
  speedbrake:'sim/flightmodel2/controls/speedbrake_ratio',
  ail_travel: 'sim/aircraft/controls/acf_ail1_up',
  elev_up:   'sim/aircraft/controls/acf_elev_up',
  elev_dn:   'sim/aircraft/controls/acf_elev_dn',
  rud_travel:'sim/aircraft/controls/acf_rudd_lr',
  ...SD_FOOTER_DREFS,
  ...LAMINAR,
}

export class A333Fctl extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.elev_l !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'F/CTL DATA —', w / 2, h / 2, Math.max(10, h * 0.05), '#666'); return }
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, Math.min(h * 0.037, w * 0.037))
    const thin = Math.max(1, lab * 0.1)
    const ok = k => v[k] === undefined || num(v[k], 1) > 0

    sdTitle(ctx, 'F/CTL', w, h, lab)

    // positions measured on the Laminar A330 cockpit page (fractions of the display)
    // ── spoilers / speed brakes ──
    this._hyd(w * 0.5, h * 0.055, 'GBY', lab)
    this._spoilers(lab, thin)
    text(ctx, 'SPD BRK', w * 0.5, h * 0.185, lab * 0.95, SD_WHITE)

    // ── ailerons: outer pointer on the outboard side of the scale, inner on the inboard side ──
    const ailT = f('ail_travel') > 0 ? f('ail_travel') : 25
    const ail = k => -f(k) / ailT                                   // X-Plane + = trailing edge up → up the scale
    text(ctx, 'L', w * 0.07, h * 0.285, lab * 0.95, SD_WHITE); text(ctx, 'AIL', w * 0.07, h * 0.285 + lab * 1.1, lab * 0.95, SD_WHITE)
    this._scale(w * 0.14, h * 0.255, h * 0.2, [[ail('ail_lo'), ok('st_ail_lo'), 'left'], [ail('ail_li'), ok('st_ail_li'), 'right']], lab)
    this._hyd(w * 0.07, h * 0.43, 'YG', lab); this._hyd(w * 0.215, h * 0.43, 'GB', lab)
    text(ctx, 'R', w * 0.935, h * 0.285, lab * 0.95, SD_WHITE); text(ctx, 'AIL', w * 0.935, h * 0.285 + lab * 1.1, lab * 0.95, SD_WHITE)
    this._scale(w * 0.865, h * 0.255, h * 0.2, [[ail('ail_ro'), ok('st_ail_ro'), 'right'], [ail('ail_ri'), ok('st_ail_ri'), 'left']], lab)
    this._hyd(w * 0.79, h * 0.43, 'GB', lab); this._hyd(w * 0.935, h * 0.43, 'YG', lab)

    // ── flight control computers ──
    this._computers(lab, thin)

    // ── pitch trim ──
    const trim = TRIM_CENTRE_DEG + f('elev_trim') * TRIM_DEG_PER_RATIO   // + = UP
    text(ctx, 'PITCH TRIM', w * 0.49, h * 0.468, lab * 0.95, ok('st_pitch') ? SD_WHITE : SD_AMBER)
    this._hyd(w * 0.67, h * 0.468, 'BY', lab)
    if (Number.isFinite(trim)) {
      text(ctx, Math.abs(trim).toFixed(1), w * 0.485, h * 0.506, lab * 1.05, SD_GREEN, 'right')
      text(ctx, '°', w * 0.5, h * 0.5, lab * 0.9, SD_CYAN)
      text(ctx, trim >= 0 ? 'UP' : 'DN', w * 0.515, h * 0.508, lab * 0.95, SD_GREEN, 'left')
    }

    // ── elevators ──
    const eUp = f('elev_up') > 0 ? f('elev_up') : 30, eDn = f('elev_dn') > 0 ? f('elev_dn') : 15
    // X-Plane: + = trailing edge down (checked in the cockpit) → down the scale, against the down travel
    const elev = k => { const d = f(k); return Number.isFinite(d) ? (d >= 0 ? d / eDn : d / eUp) : NaN }
    text(ctx, 'L', w * 0.235, h * 0.52, lab * 0.95, SD_WHITE); text(ctx, 'ELEV', w * 0.235, h * 0.52 + lab * 1.1, lab * 0.95, SD_WHITE)
    this._scale(w * 0.308, h * 0.563, h * 0.182, [[elev('elev_l'), ok('st_elev_l'), 'right']], lab)
    this._hyd(w * 0.24, h * 0.687, 'BG', lab)
    text(ctx, 'R', w * 0.768, h * 0.52, lab * 0.95, SD_WHITE); text(ctx, 'ELEV', w * 0.768, h * 0.52 + lab * 1.1, lab * 0.95, SD_WHITE)
    this._scale(w * 0.692, h * 0.563, h * 0.182, [[elev('elev_r'), ok('st_elev_r'), 'left']], lab)
    this._hyd(w * 0.768, h * 0.687, 'GY', lab)

    // ── rudder: outline brackets either side of the label ──
    sdLine(ctx, [[w * 0.447, h * 0.586], [w * 0.357, h * 0.586], [w * 0.357, h * 0.549], [w * 0.41, h * 0.527]], SD_WHITE, thin)
    sdLine(ctx, [[w * 0.557, h * 0.586], [w * 0.646, h * 0.586], [w * 0.646, h * 0.549], [w * 0.595, h * 0.527]], SD_WHITE, thin)
    text(ctx, 'RUD', w * 0.5, h * 0.578, lab * 0.95, ok('st_rud') ? SD_WHITE : SD_AMBER)
    this._hyd(w * 0.5, h * 0.623, 'GBY', lab)
    this._rudder(lab, thin)

    sdFooter(ctx, w, h, v, lab)
  }

  // hydraulic system box: grey box, letters green when the system is available, amber when lost
  _hyd(x, y, systems, lab) {
    const { ctx } = this, v = this._v
    const cw = lab * 0.85, bw = cw * systems.length + lab * 0.4, bh = lab * 1.3
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh)
    ;[...systems].forEach((s, i) => {
      const key = { G: 'sys_g', B: 'sys_b', Y: 'sys_y' }[s]
      const okSys = v[key] === undefined || num(v[key], 1) > 0
      text(ctx, s, x - bw / 2 + lab * 0.2 + cw * (i + 0.5), y, lab * 0.9, okSys ? SD_GREEN : SD_AMBER)
    })
  }

  // vertical surface scale; pointers [frac, ok, side]: frac −1 (top) … +1 (bottom), side
  // 'left' / 'right' of the scale (the triangle points at the scale)
  _scale(x, top, len, pointers, lab) {
    const { ctx } = this
    const mid = top + len / 2
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, lab * 0.1)
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + len); ctx.stroke()
    for (const y of [top, top + len]) ctx.strokeRect(x - lab * 0.15, y - lab * 0.15, lab * 0.3, lab * 0.3)
    ctx.beginPath(); ctx.moveTo(x - lab * 0.25, mid); ctx.lineTo(x + lab * 0.25, mid); ctx.stroke()
    for (const [frac, okSurf, side] of pointers) {
      if (!Number.isFinite(frac)) continue
      const y = mid + Math.max(-1, Math.min(1, frac)) * len / 2
      const dir = side === 'right' ? 1 : -1
      sdTri(ctx, x + dir * lab * 0.55, y, lab * 0.42, side === 'right' ? 'left' : 'right', okSurf ? SD_GREEN : SD_AMBER)
    }
  }

  // spoilers: left wing outboard (6) → inboard (1), right wing inboard → outboard;
  // green dash retracted, green triangle extended, amber on fault
  _spoilers(lab, thin) {
    const { ctx, w, h } = this, v = this._v
    const sb = num(v.speedbrake, 0)
    const P = (x, y) => [w * x, h * y]
    // [side, reference line, base line, first dash, last dash]
    const wings = [
      ['l', [[0.122, 0.135], [0.122, 0.121], [0.395, 0.069], [0.395, 0.083]], [[0.122, 0.165], [0.122, 0.179], [0.466, 0.145], [0.466, 0.131]], [0.146, 0.163], [0.44, 0.124]],
      ['r', [[0.597, 0.083], [0.597, 0.069], [0.873, 0.121], [0.873, 0.135]], [[0.532, 0.131], [0.532, 0.145], [0.873, 0.182], [0.873, 0.168]], [0.557, 0.124], [0.851, 0.17]],
    ]
    for (const [side, ref, base, d0, d1] of wings) {
      sdLine(ctx, ref.map(p => P(...p)), SD_WHITE, thin)
      sdLine(ctx, base.map(p => P(...p)), SD_WHITE, thin)
      for (let k = 0; k < 6; k++) {
        const n = side === 'l' ? 6 - k : k + 1                    // spoilers numbered 1 (inboard) … 6 (outboard)
        const e = v[`sp${side}${n}`]
        const st = e === undefined ? (sb > 0.05 ? 2 : 1) : Math.round(num(e, 1))
        const t = k / 5
        const x = w * (d0[0] + (d1[0] - d0[0]) * t), y = h * (d0[1] + (d1[1] - d0[1]) * t)
        const col = st === 0 ? SD_AMBER : SD_GREEN
        if (st >= 2) sdTri(ctx, x, y - lab * 0.35, lab * 0.45, 'up', col)
        else sdLine(ctx, [[x - lab * 0.45, y], [x + lab * 0.45, y]], col, Math.max(1.5, lab * 0.18))
      }
    }
  }

  // PRIM 1 2 3 and SEC 1 2 as stepped boxes; number green when the computer is on, amber when off
  _computers(lab, thin) {
    const { ctx, w, h } = this, v = this._v
    const draw = (label, keys, x, y) => {
      text(ctx, label, x, y, lab * 0.9, SD_WHITE, 'left')
      keys.forEach((k, i) => {
        const nx = x + lab * (3.4 + i * 1.6), ny = y + i * lab * 0.95
        const on = v[k] === undefined || num(v[k], 1) > 0
        text(ctx, String(i + 1), nx, ny, lab, on ? SD_GREEN : SD_AMBER)
        sdLine(ctx, [[nx - lab * (i === 0 ? 3.4 : 1.5), ny + lab * 0.6], [nx + lab * 0.5, ny + lab * 0.6], [nx + lab * 0.5, ny - lab * 0.55], [nx + lab * 0.3, ny - lab * 0.55]], SD_WHITE, thin)
      })
    }
    draw('PRIM', ['prim1', 'prim2', 'prim3'], w * 0.289, h * 0.297)
    draw('SEC', ['sec1', 'sec2'], w * 0.525, h * 0.297)
  }

  // rudder: travel arc with end stops and green limit marks, green rudder shape, cyan trim index
  _rudder(lab, thin) {
    const { ctx, w, h } = this, f = k => num(this._v[k], NaN)
    const cx = w * 0.5, bot = h * 0.807, endY = h * 0.763, half = w * 0.108
    // circle through both arc ends and the bottom point
    const R = (half * half + (bot - endY) ** 2) / (2 * (bot - endY)), cy = bot - R
    const aL = Math.atan2(endY - cy, -half), aR = Math.atan2(endY - cy, half)
    ctx.strokeStyle = SD_WHITE; ctx.lineWidth = thin
    ctx.beginPath(); ctx.arc(cx, cy, R, aR, aL); ctx.stroke()
    for (const a of [aL, aR]) {                                     // end stops
      ctx.save(); ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.rotate(a - Math.PI / 2)
      ctx.strokeRect(-lab * 0.28, -lab * 0.16, lab * 0.56, lab * 0.32); ctx.restore()
    }
    const travel = f('rud_travel') > 0 ? f('rud_travel') : 35
    const span = (aL - aR) / 2                                      // angle from the centre to an end
    for (const dir of [-1, 1]) {                                    // green travel-limit marks inside the stops
      const a = Math.PI / 2 - dir * span * 0.82
      sdLine(ctx, [[cx + Math.cos(a) * R * 0.97, cy + Math.sin(a) * R * 0.97], [cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88 - lab * 0.3]], SD_GREEN, Math.max(1.5, lab * 0.14))
    }
    const frac = Math.max(-1, Math.min(1, (Number.isFinite(f('rudder')) ? f('rudder') : 0) / travel))
    const a = Math.PI / 2 - frac * span                             // positive deflection → tip moves right on the page
    const tipX = cx + Math.cos(a) * R, tipY = cy + Math.sin(a) * R
    // rudder: narrow loop from the hinge down to the arc
    const hx = cx, hy = h * 0.72
    const nx = -(tipY - hy), ny = tipX - hx, nl = Math.hypot(nx, ny) || 1, wd = lab * 0.38
    ctx.strokeStyle = SD_GREEN; ctx.lineWidth = Math.max(1.5, lab * 0.15)
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.bezierCurveTo(hx + nx / nl * wd, hy + ny / nl * wd + (tipY - hy) * 0.55, hx + nx / nl * wd, hy, hx, hy)
    ctx.bezierCurveTo(hx - nx / nl * wd, hy, hx - nx / nl * wd, hy - ny / nl * wd + (tipY - hy) * 0.55, tipX, tipY)
    ctx.stroke()
    // rudder trim: cyan index at the bottom of the arc
    const tr = this._v.rud_trim_ind !== undefined && Number.isFinite(f('rud_trim_ind')) ? f('rud_trim_ind') / travel : f('rud_trim')
    const ta = Math.PI / 2 - Math.max(-1, Math.min(1, Number.isFinite(tr) ? tr : 0)) * span
    ctx.fillStyle = SD_CYAN
    ctx.fillRect(cx + Math.cos(ta) * R - lab * 0.17, cy + Math.sin(ta) * R - lab * 0.1, lab * 0.34, lab * 0.6)
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_fctl',
  label:    'A330 F/CTL (SD page)',
  icon:     '✣',
  order:    31,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'speedbrake', 'ail_travel', 'elev_up', 'elev_dn', 'rud_travel', 'rud_trim', ...Object.keys(SD_FOOTER_DREFS)],
}
