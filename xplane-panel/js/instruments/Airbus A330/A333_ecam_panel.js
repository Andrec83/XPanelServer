// A330 ECAM control panel — the system page pushbuttons (ENG, BLEED, PRESS, EL/AC, EL/DC,
// HYD, C/B, APU, COND, DOOR, WHEEL, F/CTL, FUEL, ALL), T.O CONFIG, EMER CANC, CLR, STS
// and RCL, laid out as on the Laminar A330-300. Each button triggers the aircraft's own
// command, and the page / CLR / STS lights follow the cockpit.
// Needs the Laminar A330 (laminar/A333/button/ecam/* commands).

import { BaseInstrument } from '../base.js'
import { pressCommand } from '../../xplane-api.js'
import { pick, num, text, SANS } from '../_glass.js'

const CMD = 'laminar/A333/button/ecam/', ANN = 'laminar/A333/annun/'

// [id, label, command, light dataref key, column, row]  — columns 0–5 page grid, 6 = right column
const BUTTONS = [
  ['eng', 'ENG', 'eng_mode', 'eng', 0, 1], ['bleed', 'BLEED', 'bleed_mode', 'bleed', 1, 1], ['press', 'PRESS', 'press_mode', 'press', 2, 1],
  ['el_ac', 'EL/AC', 'el_ac_mode', 'el_ac', 3, 1], ['el_dc', 'EL/DC', 'el_dc_mode', 'el_dc', 4, 1], ['hyd', 'HYD', 'hyd_mode', 'hyd', 5, 1],
  ['c_b', 'C/B', 'cbs_mode', 'c_b', 6, 1],
  ['apu', 'APU', 'apu_mode', 'apu', 0, 2], ['cond', 'COND', 'cond_mode', 'cond', 1, 2], ['door', 'DOOR', 'door_mode', 'door', 2, 2],
  ['wheel', 'WHEEL', 'wheel_mode', 'wheel', 3, 2], ['f_ctl', 'F/CTL', 'f_ctl_mode', 'f_ctl', 4, 2], ['fuel', 'FUEL', 'fuel_mode', 'fuel', 5, 2],
  ['all', 'ALL', 'all_mode', null, 6, 2],
  ['to_config', 'T.O CONFIG', 'to_config_test', null, 0.6, 0],
  ['emer', 'EMER CANC', 'emer_cancel', null, 4.4, 0],
  ['clr1', 'CLR', 'clr_capt', 'clr', -0.6, 3], ['sts', 'STS', 'sts_mode', 'sts', 2, 3], ['rcl', 'RCL', 'rcl_mode', null, 3, 3], ['clr2', 'CLR', 'clr_fo', 'clr', 5.1, 3],
]

export const DEFAULTS = {
  clr: `${ANN}ecp_clr`,
  sts: `${ANN}ecp_sts`,
}
for (const [, , , light] of BUTTONS) if (light && !DEFAULTS[light]) DEFAULTS[light] = `${ANN}ecam_mode_${light}`

export class A333EcamPanel extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this.setTouchButtons(BUTTONS.map(([id, label, cmd, light, col, row]) => ({
      id, label, col, row,
      lit: () => !!light && num(this._v[light], 0) > 0,
      onPress: () => pressCommand(CMD + cmd).catch(() => {}),
    })))
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) this._dirty = true
  }

  // the whole panel is buttons: lay them out like the real panel instead of a bottom strip
  get touchStripHeight() { return 0 }

  _geom() {
    const { w, h } = this
    const x0 = w * 0.17, colW = (w * 0.98 - x0) / 7.3
    const bw = colW * 0.82, bh = Math.min(h * 0.17, bw * 0.55)
    const rowY = [h * 0.14, h * 0.4, h * 0.62, h * 0.86]
    return { x0, colW, bw, bh, rowY }
  }

  // taps only while touch controls are on; the buttons are always drawn
  _touchLayout() { return this.controlsVisible ? this._layoutAll() : [] }

  _layoutAll() {
    const { x0, colW, bw, bh, rowY } = this._geom()
    return this._touchButtons.map(b => {
      const big = b.id === 'to_config' || b.id === 'emer'
      const wide = b.id.startsWith('clr') || b.id === 'sts'
      const cx = x0 + colW * (b.col + (b.col === 6 ? 0.3 : 0) + 0.5)
      const bwi = big ? bw * 1.05 : wide ? bw * 1.1 : bw
      const bhi = big ? bh * 1.15 : wide ? bh * 1.2 : bh
      return { btn: b, x: cx - bwi / 2, y: rowY[b.row] - bhi / 2, w: bwi, h: bhi }
    })
  }

  _render() {
    const { ctx, w, h } = this
    ctx.fillStyle = '#7d8a9a'; ctx.fillRect(0, 0, w, h)                  // panel grey-blue
    ctx.fillStyle = '#6c7888'; ctx.fillRect(0, 0, w, h * 0.04); ctx.fillRect(0, h * 0.96, w, h * 0.04)
    const lab = Math.max(7, Math.min(h * 0.07, w * 0.022))
    text(ctx, 'ECAM', w * 0.085, h * 0.12, lab * 1.1, '#f2f2f2', 'center', SANS, true)
    text(ctx, 'UPPER / LOWER', w * 0.085, h * 0.25, lab * 0.75, '#f2f2f2')
    text(ctx, 'DISPLAY', w * 0.085, h * 0.34, lab * 0.75, '#f2f2f2')
  }

  _drawTouchButtons() {
    const { ctx } = this
    for (const { btn, x, y, w, h } of this._layoutAll()) {
      const pressed = this._touchPressed === btn.id
      const emer = btn.id === 'emer'
      ctx.fillStyle = emer ? '#7a1a1a' : pressed ? '#2a2a2a' : '#111'
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = emer ? '#cfd8e0' : '#3a3a3a'; ctx.lineWidth = Math.max(1, h * 0.05)
      ctx.strokeRect(x, y, w, h)
      // light bar at the top: white when lit, dark otherwise
      if (!emer) {
        ctx.fillStyle = btn.lit?.() ? '#fff4d8' : '#333'
        ctx.fillRect(x + w * 0.3, y + h * 0.1, w * 0.4, Math.max(2, h * 0.09))
      }
      const lines = btn.label.split(' ')
      const size = Math.min(h * 0.32, w / (Math.max(...lines.map(l => l.length)) * 0.62))
      lines.forEach((l, i) => text(ctx, l, x + w / 2, y + h * (lines.length === 1 ? 0.6 : 0.42 + i * 0.33), size, emer ? '#ffb0a0' : '#f2f2f2'))
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_ecam_panel',
  label:    'A330 ECAM control panel',
  icon:     '▦',
  order:    40,
  datarefs: DEFAULTS,
  requires: 'the Laminar A330 (laminar/A333/button/ecam/* commands)',
  touchControls: true,
}
