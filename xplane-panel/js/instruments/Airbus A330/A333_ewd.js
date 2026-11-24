// A330 Engine / Warning Display (upper ECAM), laid out as on the Laminar A330-300:
//   EPR, EGT and N1 dials per engine, fuel flow and N3 digits outside them, thrust limit
//   mode + EPR limit top right, FOB and slat/flap indication, and the ECAM memo / warning
//   area (left and right columns) at the bottom.
// The engine part uses X-Plane's standard engine datarefs, so it also works on other
// twins. The thrust limit and memo come from the Laminar A330 (optional: left blank
// on other aircraft). Switch "Primary" to N1 for CFM / GE style engines.
//
// X-Plane models two spools, so the high-pressure spool is X-Plane's N2; on the Trent
// (EPR mode) it is labelled N3, as on the real display.

import { BaseInstrument } from '../base.js'
import { ENGINE_DREFS, pick, at, num, engineCount, dial, readout, text, dataText, SANS, MONO } from '../_glass.js'

const L = 'laminar/A333/'
const MEMO_LINES = 7, ACTION_LINES = 6

const memoDrefs = {}
for (let i = 1; i <= MEMO_LINES; i++) {
  const nn = String(i).padStart(2, '0')
  memoDrefs[`memo_l${i}`] = `${L}ecam/ewd_text_msg_L_${nn}`
  memoDrefs[`memo_r${i}`] = `${L}ecam/ewd_text_msg_R_${nn}`
}
for (let i = 1; i <= ACTION_LINES; i++) memoDrefs[`action_l${i}`] = `${L}ecam/ewd_text_cfgAction_L_${String(i).padStart(2, '0')}`

const LAMINAR = {
  thr_limit:   `${L}ecam/thrust_limit_epr`,
  epr_lim_to:  `${L}engine/epr_limit_to`,
  epr_lim_flx: `${L}engine/epr_limit_flex`,
  epr_lim_mct: `${L}engine/epr_limit_mc`,
  epr_lim_ga:  `${L}engine/epr_limit_ga`,
  egt_limit:   `${L}ecam/egt1_limit`,
  memo_color_l:   `${L}ecam/ewd_text_color_L`,
  memo_color_r:   `${L}ecam/ewd_text_color_R`,
  action_color_l: `${L}ecam/ewd_text_cfgAction_color_L`,
  show_sts:      `${L}ecam/annun/ewd_show_sts`,
  show_overflow: `${L}ecam/annun/ewd_show_msg_overflow`,
  ...memoDrefs,
}

export const DEFAULTS = {
  num_engines: ENGINE_DREFS.num_engines,
  epr:       ENGINE_DREFS.epr,
  n1:        ENGINE_DREFS.n1,
  n2:        ENGINE_DREFS.n2,
  egt:       ENGINE_DREFS.egt,
  ff:        ENGINE_DREFS.ff,
  reverser:  ENGINE_DREFS.reverser,
  n1_red:    ENGINE_DREFS.n1_red,
  egt_red:   ENGINE_DREFS.egt_red,
  epr_red:   ENGINE_DREFS.epr_red,
  fuel_total:'sim/flightmodel/weight/m_fuel_total',
  slat:      'sim/flightmodel2/controls/slat1_deploy_ratio',
  flap:      'sim/flightmodel2/controls/flap1_deploy_ratio',
  flap_handle:  'sim/cockpit2/controls/flap_handle_deploy_ratio',
  flap_detents: 'sim/aircraft/controls/acf_flap_detents',
  ...LAMINAR,
}

const GREEN = '#3dff6a', WHITE = '#f2f2f2', CYAN = '#4fd8ff', AMBER = '#ffa526', RED = '#ff3030', MAGENTA = '#ff6cff'
// Laminar ECAM colour codes (ewd_text_color_*): 0 red, 1 amber, 2 green, 3 white, 4 cyan
const MEMO_COLORS = [RED, AMBER, GREEN, WHITE, CYAN, MAGENTA]

export class A333EWD extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._primary = config.primary === 'n1' ? 'n1' : 'epr'
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.n1 !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'ENGINE DATA —', w / 2, h / 2, Math.max(10, h * 0.04), '#666'); return }
    const v = this._v
    const n = engineCount(v.num_engines)
    const epr = this._primary === 'epr'
    const lab = Math.max(7, Math.min(h * 0.03, w * 0.032))

    // engine columns; with two engines the labels sit in the middle and FF / N3 outside
    const twin = n === 2
    const side = twin ? w * 0.17 : w * 0.1
    const colW = (w - side * 2) / n
    const colX = i => side + colW * (i + 0.5)
    const r = Math.max(8, Math.min(colW * 0.32, h * 0.088))
    const big = Math.max(8, r * 0.44)
    const rows = [h * 0.11, h * 0.29, h * 0.47]

    this._thrustLimit(lab)
    this._engineDials(n, colX, rows, r, big, lab, twin ? w / 2 : w * 0.05, epr)
    this._outerDigits(n, colX, rows, r, big, lab, twin, side, epr)

    // FOB and slats / flaps
    const yLow = h * 0.6
    const fob = num(v.fuel_total, NaN)
    text(ctx, 'FOB :', w * 0.03, yLow, lab * 1.1, WHITE, 'left')
    text(ctx, Number.isFinite(fob) ? String(Math.round(fob / 100) * 100) : '--', w * 0.33, yLow, lab * 1.25, GREEN, 'right')
    text(ctx, 'KG', w * 0.35, yLow, lab, CYAN, 'left')
    this._slatsFlaps(w * 0.72, h * 0.585, lab)

    this._memo(h * 0.665, lab)
  }

  // top right: thrust limit mode (cyan) and EPR limit (green)
  _thrustLimit(lab) {
    const { ctx, w, h } = this, v = this._v
    const lim = num(v.thr_limit, NaN)
    if (!(lim > 0.5)) return
    const near = x => { const e = num(x, NaN); return Number.isFinite(e) && e > 0.5 && Math.abs(e - lim) < 0.003 }
    const mode = near(v.epr_lim_to) ? 'TOGA' : near(v.epr_lim_flx) ? 'FLX' : near(v.epr_lim_mct) ? 'MCT' : near(v.epr_lim_ga) ? 'GA' : 'CLB'
    text(ctx, mode, w * 0.97, h * 0.04, lab * 1.15, CYAN, 'right')
    text(ctx, lim.toFixed(3), w * 0.97, h * 0.04 + lab * 1.35, lab * 1.15, GREEN, 'right')
  }

  _engineDials(n, colX, rows, r, big, lab, labelX, epr) {
    const ctx = this.ctx, v = this._v
    const n1Red  = num(v.n1_red, 100) || 100
    const egtRed = num(v.egt_limit, 0) || num(v.egt_red, 900) || 900
    const egtMax = Math.ceil(egtRed * 1.1 / 100) * 100
    const eprRedRaw = num(v.epr_red, 0)
    const eprToga = num(v.epr_lim_to, 0)
    const eprMark = eprToga > 1 && eprToga < 2 ? eprToga : eprRedRaw > 1 && eprRedRaw < 1.9 ? eprRedRaw : 0
    const eprMax = Math.max(1.8, eprMark ? Math.ceil(eprMark * 10 + 1) / 10 : 1.8)

    // row labels in the middle
    const labels = epr ? [['EPR', ''], ['EGT', '°C'], ['N1', '%']] : [['N1', '%'], ['EGT', '°C'], ['N2', '%']]
    labels.forEach(([name, unit], k) => {
      text(ctx, name, labelX, rows[k] - lab * 0.3, lab * 1.15, WHITE)
      if (unit) text(ctx, unit, labelX, rows[k] + lab * 0.9, lab * 0.9, CYAN)
    })

    const common = { start: 150, sweep: 200, colors: { needle: GREEN, red: RED, amber: AMBER } }
    const n1Dial = (cx, cy, val) => {
      dial(ctx, { ...common, cx, cy, r, value: val, min: 20, max: 110, red: n1Red,
        ticks: [20, 50, 100], labels: [[50, '5'], [100, '10']] })
      text(ctx, Number.isFinite(val) ? val.toFixed(1) : 'XX', cx + r * 0.95, cy + r * 0.5, big, val > n1Red ? RED : GREEN, 'right')
    }

    for (let i = 0; i < n; i++) {
      const cx = colX(i)
      const rev = at(v.reverser, i, 0)
      if (epr) {
        const e = at(v.epr, i, NaN)
        const shown = Number.isFinite(e) && e > 0.5
        dial(ctx, { ...common, cx, cy: rows[0], r, value: shown ? e : NaN, min: 1.0, max: eprMax,
          red: eprMark || undefined, colors: { ...common.colors, red: AMBER },
          ticks: [1.0, 1.2, 1.4, 1.6, 1.8].filter(t => t <= eprMax), labels: [[1.0, '1'], [1.4, '1.4'], [1.8, '1.8']].filter(l => l[0] <= eprMax) })
        readout(ctx, { x: cx - r * 0.45, y: rows[0] + r * 0.12, w: r * 1.35, h: big * 1.15, size: big,
          text: shown ? e.toFixed(3) : 'XX', color: shown ? GREEN : AMBER, border: '#9a9a9a' })
        n1Dial(cx, rows[2], at(v.n1, i, NaN))
      } else {
        n1Dial(cx, rows[0], at(v.n1, i, NaN))
        const n2 = at(v.n2, i, NaN)
        dial(ctx, { ...common, cx, cy: rows[2], r, value: n2, min: 20, max: 110, ticks: [20, 50, 100], labels: [[50, '5'], [100, '10']] })
        text(ctx, Number.isFinite(n2) ? n2.toFixed(1) : 'XX', cx + r * 0.95, rows[2] + r * 0.5, big, GREEN, 'right')
      }
      if (rev > 0.05) text(ctx, 'REV', cx, rows[0] - r * 0.35, big * 0.85, rev > 0.9 ? GREEN : AMBER, 'center', SANS, true)

      const egt = at(v.egt, i, NaN)
      dial(ctx, { ...common, cx, cy: rows[1], r, value: egt, min: 0, max: egtMax, red: egtRed, ticks: [0, egtMax / 2] })
      text(ctx, Number.isFinite(egt) ? String(Math.round(egt)) : 'XX', cx + r * 0.6, rows[1] + r * 0.45, big, egt > egtRed ? RED : GREEN, 'right')
    }
  }

  // fuel flow (EGT row) and N3 / N2 (bottom row) outside the dials; under them for 3–4 engines
  _outerDigits(n, colX, rows, r, big, lab, twin, side, epr) {
    const { ctx, w } = this, v = this._v
    const hp = epr ? 'N3' : 'N2'
    const items = [
      { y: rows[1], label: 'FF', unit: 'KG/H', get: i => at(v.ff, i, NaN) * 3600, fmt: x => String(Math.round(x / 10) * 10) },
      ...(epr ? [{ y: rows[2], label: hp, unit: '%', get: i => at(v.n2, i, NaN), fmt: x => x.toFixed(1) }] : []),
    ]
    for (const it of items) {
      if (twin) {
        for (const [i, x, align] of [[0, w * 0.02, 'left'], [1, w * 0.98, 'right']]) {
          // reads "FF KG/H" on both sides
          const unitW = (ctx.font = `${(lab * 0.8).toFixed(1)}px ${SANS}`, ctx.measureText(it.unit).width)
          const lx = align === 'left' ? x : x - unitW - lab * 0.4
          text(ctx, it.label, lx, it.y - lab * 0.6, lab, WHITE, align)
          text(ctx, it.unit, align === 'left' ? x + lab * 1.8 : x, it.y - lab * 0.6, lab * 0.8, CYAN, align)
          const val = it.get(i)
          text(ctx, Number.isFinite(val) ? it.fmt(val) : 'XX', align === 'left' ? x + side * 0.8 : x, it.y + lab * 0.7, big * 0.95, GREEN, 'right')
        }
      } else {
        text(ctx, it.label, w * 0.05, it.y + r * 0.95, lab * 0.9, WHITE)
        for (let i = 0; i < n; i++) {
          const val = it.get(i)
          text(ctx, Number.isFinite(val) ? it.fmt(val) : 'XX', colX(i), it.y + r * 0.95, big * 0.85, GREEN)
        }
      }
    }
  }

  // slat / flap indication: S and F tracks with the current position, configuration below
  _slatsFlaps(cx, cy, lab) {
    const { ctx, w } = this, v = this._v
    const slat = num(v.slat, NaN), flap = num(v.flap, NaN)
    if (!Number.isFinite(slat) && !Number.isFinite(flap)) return
    const span = w * 0.13, drop = lab * 1.2
    const handle = num(v.flap_handle, 0), detents = Math.max(1, Math.round(num(v.flap_detents, 4)) || 4)
    const pos = Math.round(handle * detents)
    const clean = pos === 0 && !(slat > 0.02) && !(flap > 0.02)
    // wing reference shape
    ctx.fillStyle = WHITE
    ctx.beginPath()
    ctx.moveTo(cx - lab * 0.9, cy - lab * 0.35); ctx.lineTo(cx + lab * 0.9, cy - lab * 0.35)
    ctx.lineTo(cx + lab * 0.6, cy + lab * 0.25); ctx.lineTo(cx - lab * 0.6, cy + lab * 0.25); ctx.closePath()
    ctx.lineWidth = Math.max(1, lab * 0.12); ctx.strokeStyle = WHITE; ctx.stroke()
    if (clean) return
    const moving = Math.abs(handle - (pos / detents)) > 0.01 ||
      (pos > 0 && Number.isFinite(flap) && Math.abs(flap - handle) > 0.03)
    const ptr = (sx, ratio, dir) => {           // dir −1 = slats (left), +1 = flaps (right)
      const t = Math.max(0, Math.min(1, ratio || 0))
      const x = cx + dir * (lab * 1.1 + span * t), y = cy + drop * t
      ctx.strokeStyle = GREEN; ctx.lineWidth = Math.max(1.5, lab * 0.2)
      ctx.beginPath(); ctx.moveTo(cx + dir * lab * 1.0, cy); ctx.lineTo(x, y); ctx.stroke()
      ctx.fillStyle = GREEN; ctx.fillRect(x - lab * 0.3, y - lab * 0.15, lab * 0.6, lab * 0.3)
    }
    ptr(cx, slat, -1); ptr(cx, flap, +1)
    text(ctx, 'S', cx - span * 0.6, cy - lab * 0.9, lab * 0.9, WHITE)
    text(ctx, 'F', cx + span * 0.6, cy - lab * 0.9, lab * 0.9, WHITE)
    const names = ['0', flap > 0.02 ? '1+F' : '1', '2', '3', 'FULL']
    const conf = detents === 4 ? names[pos] : String(pos)
    text(ctx, conf, cx, cy + drop + lab * 0.3, lab * 1.05, moving ? CYAN : GREEN)
  }

  // ECAM memo / warnings: left and right columns below the separator line
  _memo(top, lab) {
    const { ctx, w, h } = this, v = this._v
    ctx.strokeStyle = WHITE; ctx.lineWidth = Math.max(1, h * 0.003)
    ctx.beginPath(); ctx.moveTo(w * 0.02, top); ctx.lineTo(w * 0.98, top); ctx.stroke()
    const splitX = w * 0.645
    ctx.beginPath(); ctx.moveTo(splitX, top + h * 0.015); ctx.lineTo(splitX, h * 0.96); ctx.stroke()

    const lineH = (h * 0.97 - top) / (MEMO_LINES + 0.6)
    const size = Math.min(lineH * 0.82, (splitX - w * 0.04) / (24 * 0.6))   // 24 columns, monospace
    const color = (arr, i) => MEMO_COLORS[Math.round(at(arr, i, 2))] || GREEN
    for (let i = 0; i < MEMO_LINES; i++) {
      const y = top + lineH * (i + 0.9)
      const l = dataText(v[`memo_l${i + 1}`]).replace(/\s+$/, '')
      const r = dataText(v[`memo_r${i + 1}`]).replace(/\s+$/, '')
      if (l) text(ctx, l, w * 0.03, y, size, color(v.memo_color_l, i), 'left', MONO)
      if (r) text(ctx, r, splitX + w * 0.02, y, size, color(v.memo_color_r, i), 'left', MONO)
      // T.O / LDG memo actions are overlaid on the same columns in their own colour
      if (i < ACTION_LINES) {
        const a = dataText(v[`action_l${i + 1}`])
        if (a.trim()) text(ctx, a, w * 0.03, y, size, color(v.action_color_l, i), 'left', MONO)
      }
    }
    if (num(v.show_overflow, 0) > 0.5) {         // more messages: green arrow at the bottom
      const x = splitX - w * 0.04, y = h * 0.955
      ctx.fillStyle = GREEN
      ctx.beginPath(); ctx.moveTo(x - lab * 0.4, y - lab * 0.6); ctx.lineTo(x + lab * 0.4, y - lab * 0.6); ctx.lineTo(x, y); ctx.closePath(); ctx.fill()
    }
    if (num(v.show_sts, 0) > 0.5) {
      text(ctx, 'STS', w * 0.82, h * 0.95, size, WHITE, 'center', MONO)
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1
      ctx.strokeRect(w * 0.82 - size * 1.1, h * 0.95 - size * 0.6, size * 2.2, size * 1.2)
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_ewd',
  label:    'A330 Engine / Warning Display (E/WD)',
  icon:     '◔',
  order:    10,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'slat', 'flap', 'flap_handle', 'flap_detents'],
  options: [
    { key: 'primary', label: 'Primary parameter', type: 'select', default: 'epr',
      choices: [{ value: 'epr', label: 'EPR (Rolls-Royce Trent)' }, { value: 'n1', label: 'N1 (GE / Pratt & Whitney)' }] },
  ],
}
