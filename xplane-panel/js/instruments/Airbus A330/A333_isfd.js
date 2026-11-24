// A330 Standby (ISIS) — integrated standby instrument: attitude, Airbus speed and
// altitude tapes (same drawing as the A330 PFD), baro setting in hPa / inHg or STD, and
// LS deviation when the ISIS LS button is on. Driven by X-Plane's standby datarefs.
// Touch buttons: LS, ATT RST, BARO −/+ and STD. With the Laminar A330 they operate the
// cockpit ISIS itself (its LS / RST / STD buttons); BARO −/+ uses X-Plane's standby baro
// commands, so they also work on other aircraft.

import { pressCommand } from '../../xplane-api.js'
import { pick, num, attitude, text, SANS } from '../_glass.js'
import { A333PFD } from './A333_pfd.js'

const G = 'sim/cockpit2/gauges/indicators/', R = 'sim/cockpit2/radios/indicators/', S = 'laminar/A333/'

const LAMINAR = {
  ls_state:   `${S}status/standby/ls_state`,
  std_state:  `${S}status/standby/baro_standard`,
  disp_state: `${S}standby/display_state`,
  align:      `${S}timers/standby/att_reset_align_timer`,
}

export const DEFAULTS = {
  ias:      `${G}airspeed_kts_stby`,
  alt:      `${G}altitude_ft_stby`,
  pitch:    `${G}pitch_electric_deg_pilot`,
  roll:     `${G}roll_electric_deg_pilot`,
  slip:     `${G}slip_deg`,
  sbaro:    'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_stby',
  loc_dots: `${R}nav1_hdef_dots_pilot`,
  gs_dots:  `${R}nav1_vdef_dots_pilot`,
  loc_show: `${R}nav1_display_horizontal`,
  gs_show:  `${R}nav1_display_vertical`,
  ...LAMINAR,
}

const WHITE = '#f2f2f2', CYAN = '#4fd8ff', YELLOW = '#ffee00', RED = '#ff3030'

const CMD = {
  ls:    `${S}buttons/standby_ls_toggle`,
  rst:   `${S}buttons/standby_rst_toggle`,
  std:   `${S}buttons/standby_standard_toggle`,
  down:  'sim/instruments/barometer_stby_down',
  up:    'sim/instruments/barometer_stby_up',
}

export class A333ISFD extends A333PFD {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config, datarefs)
    this._drefs = { ...DEFAULTS, ...datarefs }       // standby datarefs instead of the PFD's
    this._lsLocal = false                            // LS state when the aircraft doesn't publish it
    const cmd = name => pressCommand(name).catch(() => {})
    this.setTouchButtons([
      { id: 'ls',  label: 'LS', lit: () => this._lsOn(),
        onPress: () => { if (this._v.ls_state === undefined) { this._lsLocal = !this._lsLocal; this._dirty = true } else cmd(CMD.ls) } },
      { id: 'rst', label: 'ATT RST', onPress: () => cmd(CMD.rst) },
      { id: 'dn',  label: '− BARO', repeat: true, onPress: () => cmd(CMD.down) },
      { id: 'std', label: 'STD', lit: () => this._std(), onPress: () => cmd(CMD.std) },
      { id: 'up',  label: 'BARO +', repeat: true, onPress: () => cmd(CMD.up) },
    ])
  }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.pitch !== undefined; this._dirty = true }
  }

  _lsOn() { return this._v.ls_state === undefined ? this._lsLocal : num(this._v.ls_state, 0) > 0 }
  _std() {
    if (this._v.std_state !== undefined) return num(this._v.std_state, 0) > 0
    return Math.abs(num(this._v.sbaro, 0) - 29.92) < 0.005
  }

  _renderEmissive() {
    const { ctx, w } = this
    const h = this.h - this.touchStripHeight
    if (this._v.disp_state !== undefined && num(this._v.disp_state, 3) === 0) return     // ISIS off
    if (!this._hasData) { text(ctx, 'ATT', w / 2, h / 2, Math.max(10, h * 0.08), RED, 'center', SANS, true); return }
    const f = k => this._f(k)
    const lab = Math.max(7, Math.min(h * 0.045, w * 0.045))

    // attitude over the whole screen, or the ATT flag while aligning after ATT RST
    const adi = { x: 0, y: 0, w, h }
    const align = f('align')
    if (align > 0) {
      text(ctx, 'ATT', w / 2, h * 0.42, lab * 1.6, RED, 'center', SANS, true)
      text(ctx, `${Math.ceil(align)}s`, w / 2, h * 0.55, lab * 1.3, WHITE)
    } else {
      attitude(ctx, { ...adi, radius: w * 0.03, pitch: f('pitch'), roll: f('roll'), slip: f('slip'), degSpan: 60,
        compact: true, colors: { symbol: YELLOW, symbolFill: '#000' }, symbolWeight: 0.7, symbolGap: 0.07, wingLen: 0.13, ladderScale: 0.5 })
    }

    // tapes, reusing the A330 PFD drawing
    this._speedTape(w * 0.02, h * 0.12, w * 0.19, h * 0.72, lab)
    this._altTape(w * 0.77, h * 0.12, w * 0.15, h * 0.72, lab)

    // LS deviation
    if (this._lsOn()) {
      if (f('loc_show') > 0) this._devScale(w / 2, h * 0.84, w * 0.08, f('loc_dots'), true)
      if (f('gs_show') > 0) this._devScale(w * 0.71, h * 0.48, h * 0.08, f('gs_dots'), false)
    }

    // baro: hPa / inHg, or STD
    const baro = f('sbaro')
    if (Number.isFinite(baro)) {
      const y = h * 0.955
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(w * 0.3, y - lab * 0.75, w * 0.4, lab * 1.5)
      if (this._std()) text(ctx, 'STD', w / 2, y, lab * 1.2, CYAN, 'center', SANS, true)
      else text(ctx, `${Math.round(baro * 33.8639)}/${baro.toFixed(2)}`, w / 2, y, lab * 1.1, CYAN, 'center', SANS, true)
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_isfd',
  label:    'A330 Standby (ISIS)',
  icon:     '◎',
  order:    3,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'loc_dots', 'gs_dots', 'loc_show', 'gs_show'],
  touchControls: true,
}
