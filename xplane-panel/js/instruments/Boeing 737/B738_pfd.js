// 737 PFD — primary flight display: attitude with flight director, speed tape with
// selected speed, trend vector and Vmo barber pole, altitude tape with selected altitude
// and baro setting, vertical speed, heading arc with heading bug and track, ILS
// deviation, radio altitude and flight-mode annunciations.
// Uses X-Plane's standard flight / autopilot datarefs, so it also works on other aircraft.
// The mode annunciations come from X-Plane's generic autopilot status, which may differ
// from an add-on's own autopilot logic.

import { BaseInstrument } from '../base.js'
import { FLIGHT_DREFS, pick, num, attitude, tape, text, wrap360, angDiff, SANS } from '../_glass.js'

const A = 'sim/cockpit2/autopilot/', R = 'sim/cockpit2/radios/indicators/'
export const DEFAULTS = {
  ...FLIGHT_DREFS,
  vmo:        'sim/aircraft/view/acf_Vne',
  sel_speed:  `${A}airspeed_dial_kts_mach`,
  sel_is_mach:`${A}airspeed_is_mach`,
  sel_alt:    `${A}altitude_dial_ft`,
  sel_hdg:    `${A}heading_dial_deg_mag_pilot`,
  fd_mode:    `${A}flight_director_mode`,
  fd_pitch:   `${A}flight_director_pitch_deg`,
  fd_roll:    `${A}flight_director_roll_deg`,
  ap_on:      `${A}autopilot_on`,
  at_on:      `${A}autothrottle_on`,
  st_speed:   `${A}speed_status`,
  st_hdg:     `${A}heading_status`,
  st_nav:     `${A}nav_status`,
  st_gpss:    `${A}gpss_status`,
  st_alt:     `${A}altitude_hold_status`,
  st_vs:      `${A}vvi_status`,
  st_gs:      `${A}glideslope_status`,
  loc_dots:   `${R}nav1_hdef_dots_pilot`,
  gs_dots:    `${R}nav1_vdef_dots_pilot`,
  loc_show:   `${R}nav1_display_horizontal`,
  gs_show:    `${R}nav1_display_vertical`,
  ra_mins:    'sim/cockpit2/gauges/actuators/radio_altimeter_bug_ft_pilot',
  baro_std:   'sim/cockpit2/gauges/actuators/barometer_setting_is_std_pilot',
}

const WHITE = '#f2f2f2', MAGENTA = '#ff40ff', GREEN = '#2bff4a', CYAN = '#4fd8ff', AMBER = '#ffb000'

export class B738PFD extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.pitch !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'ATT  —  NO DATA', w / 2, h / 2, Math.max(10, h * 0.04), AMBER); return }
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, h * 0.036)

    // ── attitude ──
    const adi = { x: w * 0.25, y: h * 0.15, w: w * 0.45, h: h * 0.56 }
    const fdOn = f('fd_mode') > 0
    attitude(ctx, { ...adi, pitch: f('pitch'), roll: f('roll'), slip: f('slip'),
      fd: fdOn ? { pitch: f('fd_pitch'), roll: f('fd_roll') } : null })
    const acx = adi.x + adi.w / 2, acy = adi.y + adi.h / 2

    // ILS deviation
    if (f('loc_show') > 0) {
      const sp = adi.w * 0.09, y = adi.y + adi.h + h * 0.025
      this._devScale(acx, y, sp, f('loc_dots'), true)
    }
    if (f('gs_show') > 0) {
      const sp = adi.h * 0.09, x = adi.x + adi.w + w * 0.02
      this._devScale(x, acy, sp, f('gs_dots'), false)
    }

    // radio altitude + minimums
    const ra = f('radio_alt'), mins = f('ra_mins')
    if (Number.isFinite(ra) && ra < 2500) {
      text(ctx, String(Math.max(0, Math.round(ra / (ra > 100 ? 10 : 2)) * (ra > 100 ? 10 : 2))), acx, adi.y + adi.h * 0.88, lab * 1.4,
        mins > 0 && ra < mins ? AMBER : WHITE, 'center', SANS, true)
    }
    if (mins > 0) {
      text(ctx, 'RADIO', adi.x + adi.w * 0.98, adi.y - lab * 0.1, lab * 0.8, GREEN, 'right')
      text(ctx, String(Math.round(mins)), adi.x + adi.w * 0.98, adi.y + lab * 0.9, lab, GREEN, 'right')
    }

    // ── flight-mode annunciations ──
    this._fma(w * 0.22, 0, w * 0.56, h * 0.09, lab)
    const apText = f('ap_on') > 0 ? 'CMD' : fdOn ? 'FD' : ''
    if (apText) text(ctx, apText, acx, adi.y + lab * 0.9, lab * 1.4, GREEN, 'center', SANS, true)

    // ── speed tape ──
    const ias = f('ias'), sp = { x: w * 0.04, y: h * 0.15, w: w * 0.15, h: h * 0.6 }
    const selSpd = f('sel_speed'), isMach = f('sel_is_mach') > 0
    const trend = f('ias_trend') * 10
    tape(ctx, { ...sp, value: Math.max(ias, 0), span: 120, step: 10, labelStep: 20, min: 0, fmt: x => String(x), side: 'right',
      bug: isMach ? undefined : selSpd, redAbove: f('vmo') || undefined, trend: Math.abs(trend) > 2 ? trend : 0,
      readoutText: Number.isFinite(ias) ? String(Math.max(0, Math.round(ias))) : '---' })
    text(ctx, isMach ? `.${Math.round(selSpd * 1000)}` : (Number.isFinite(selSpd) ? String(Math.round(selSpd)) : ''), sp.x + sp.w / 2, h * 0.115, lab * 1.25, MAGENTA)
    const mach = f('mach')
    if (mach >= 0.4) text(ctx, `.${String(Math.round(mach * 1000)).padStart(3, '0')}`, sp.x + sp.w / 2, h * 0.8, lab * 1.25, WHITE)

    // ── altitude tape + VSI ──
    const alt = f('alt'), at = { x: w * 0.76, y: h * 0.15, w: w * 0.14, h: h * 0.6 }
    const selAlt = f('sel_alt')
    tape(ctx, { ...at, value: alt, span: 900, step: 100, labelStep: 200, fmt: x => String(x), side: 'left', bug: selAlt,
      readoutText: Number.isFinite(alt) ? String(Math.round(alt / 20) * 20) : '-----' })
    text(ctx, Number.isFinite(selAlt) ? String(Math.round(selAlt)) : '', at.x + at.w / 2, h * 0.115, lab * 1.25, MAGENTA)
    const baro = f('baro')
    if (Number.isFinite(baro)) {
      const std = v.baro_std !== undefined ? f('baro_std') > 0 : Math.abs(baro - 29.92) < 0.005
      text(ctx, std ? 'STD' : baro.toFixed(2), at.x + at.w * 0.62, h * 0.8, lab * 1.25, GREEN, 'right')
      if (!std) text(ctx, 'IN.', at.x + at.w * 0.68, h * 0.8, lab * 0.85, GREEN, 'left')
    }
    this._vsi(w * 0.91, h * 0.2, w * 0.075, h * 0.5, f('vs'), lab)

    // ── heading arc ──
    this._heading(acx, h, adi.w, f('heading'), f('track'), f('sel_hdg'), lab)
  }

  _devScale(x, y, sp, dots, horizontal) {
    const { ctx } = this
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2
    for (const d of [-2, -1, 1, 2]) {
      ctx.beginPath()
      ctx.arc(horizontal ? x + d * sp : x, horizontal ? y : y + d * sp, sp * 0.13, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (!Number.isFinite(dots)) return
    const off = Math.max(-2.5, Math.min(2.5, dots)) * sp
    const px = horizontal ? x + off : x, py = horizontal ? y : y - off, s = sp * 0.3
    ctx.fillStyle = MAGENTA
    ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s * 0.7, py); ctx.lineTo(px, py + s); ctx.lineTo(px - s * 0.7, py); ctx.closePath()
    Math.abs(dots) < 2.5 ? ctx.fill() : (ctx.strokeStyle = MAGENTA, ctx.stroke())
  }

  _vsi(x, y, w, h, vs, lab) {
    const { ctx } = this
    ctx.fillStyle = '#4a4a4a'
    ctx.beginPath()
    ctx.moveTo(x, y + h * 0.08); ctx.lineTo(x + w * 0.55, y); ctx.lineTo(x + w * 0.55, y + h); ctx.lineTo(x, y + h * 0.92); ctx.closePath(); ctx.fill()
    const cy = y + h / 2
    const pos = fpm => {                                    // non-linear: ±1000 → 0.25, ±2000 → 0.37, ±6000 → 0.48
      const a = Math.abs(fpm), s = a <= 1000 ? a / 1000 * 0.25 : a <= 2000 ? 0.25 + (a - 1000) / 1000 * 0.12 : 0.37 + Math.min(1, (a - 2000) / 4000) * 0.11
      return cy - Math.sign(fpm) * s * h
    }
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.lineWidth = 1
    ctx.font = `${Math.max(6, lab * 0.8).toFixed(1)}px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    for (const t of [-6000, -2000, -1000, 1000, 2000, 6000]) {
      const yy = pos(t)
      ctx.beginPath(); ctx.moveTo(x + w * 0.05, yy); ctx.lineTo(x + w * 0.18, yy); ctx.stroke()
      ctx.fillText(String(Math.abs(t) / 1000), x + w * 0.2, yy)
    }
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + w * 0.2, cy); ctx.stroke()
    if (Number.isFinite(vs)) {
      ctx.strokeStyle = WHITE; ctx.lineWidth = Math.max(1.5, w * 0.05)
      ctx.beginPath(); ctx.moveTo(x + w * 0.05, pos(vs)); ctx.lineTo(x + w * 1.0, cy); ctx.stroke()
      if (Math.abs(vs) >= 400) text(ctx, String(Math.round(Math.abs(vs) / 50) * 50), x + w * 0.3, vs > 0 ? y - lab * 0.8 : y + h + lab * 0.8, lab, WHITE)
    }
  }

  _heading(cx, H, adiW, hdg, trk, sel, lab) {
    const { ctx } = this
    const R = adiW * 0.62, cy = H * 0.84 + R            // only the top of the rose is visible
    const top = cy - R
    ctx.save()
    ctx.beginPath(); ctx.rect(cx - R * 1.2, top - lab, R * 2.4, H - top + lab); ctx.clip()
    ctx.fillStyle = '#4a4a4a'
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()
    const h0 = Number.isFinite(hdg) ? hdg : 0
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.lineWidth = 1.2
    ctx.font = `${Math.max(7, lab * 0.95).toFixed(1)}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let d = Math.floor((h0 - 40) / 5) * 5; d <= h0 + 40; d += 5) {
      const a = (d - h0 - 90) * Math.PI / 180, l = d % 10 === 0 ? R * 0.09 : R * 0.05
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l)); ctx.stroke()
      if (d % 30 === 0) {                                // labels every 30°, as on the 737 PFD
        const lbl = String(wrap360(d) / 10)
        ctx.save(); ctx.translate(cx + Math.cos(a) * (R - l - lab * 0.8), cy + Math.sin(a) * (R - l - lab * 0.8)); ctx.rotate(a + Math.PI / 2)
        ctx.fillText(lbl === '36' ? '0' : lbl, 0, 0); ctx.restore()
      }
    }
    if (Number.isFinite(trk)) {                            // track line
      const a = (angDiff(trk, h0) - 90) * Math.PI / 180
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * R * 0.75, cy + Math.sin(a) * R * 0.75); ctx.stroke()
    }
    if (Number.isFinite(sel)) {                            // heading bug
      const a = (Math.max(-45, Math.min(45, angDiff(sel, h0))) - 90) * Math.PI / 180
      ctx.save(); ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.rotate(a + Math.PI / 2)
      ctx.strokeStyle = MAGENTA; ctx.lineWidth = 2; ctx.strokeRect(-R * 0.05, 0, R * 0.1, R * 0.06); ctx.restore()
    }
    ctx.restore()
    // pointer + readout
    ctx.fillStyle = WHITE
    ctx.beginPath(); ctx.moveTo(cx, top + 2); ctx.lineTo(cx - lab * 0.4, top - lab * 0.4); ctx.lineTo(cx + lab * 0.4, top - lab * 0.4); ctx.closePath(); ctx.fill()
    text(ctx, Number.isFinite(sel) ? `${String(Math.round(wrap360(sel))).padStart(3, '0')} H` : '', cx - R * 0.95, H * 0.95, lab, MAGENTA, 'left')
    text(ctx, 'MAG', cx + R * 0.95, H * 0.95, lab * 0.9, GREEN, 'right')
  }

  _fma(x, y, w, h, lab) {
    const { ctx } = this, v = this._v, s = k => num(v[k], 0)
    const thrust = s('at_on') > 0 ? (s('st_speed') === 2 ? 'MCP SPD' : 'ARM') : ''
    const roll = s('st_gpss') === 2 ? 'LNAV' : s('st_nav') === 2 ? 'VOR/LOC' : s('st_hdg') === 2 ? 'HDG SEL' : ''
    const rollArm = s('st_gpss') === 1 ? 'LNAV' : s('st_nav') === 1 ? 'VOR/LOC' : ''
    const pitch = s('st_gs') === 2 ? 'G/S' : s('st_alt') === 2 ? 'ALT HOLD' : s('st_vs') === 2 ? 'V/S' : (s('st_speed') === 2 && s('at_on') <= 0) ? 'MCP SPD' : ''
    const pitchArm = s('st_gs') === 1 ? 'G/S' : s('st_alt') === 1 ? 'ALT' : ''
    const cols = [[thrust, ''], [roll, rollArm], [pitch, pitchArm]]
    const cw = w / 3
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1
    cols.forEach(([act, arm], i) => {
      if (i > 0) { ctx.beginPath(); ctx.moveTo(x + cw * i, y + h * 0.1); ctx.lineTo(x + cw * i, y + h * 0.95); ctx.stroke() }
      if (act) text(ctx, act, x + cw * (i + 0.5), y + h * 0.38, lab * 1.05, GREEN)
      if (arm) text(ctx, arm, x + cw * (i + 0.5), y + h * 0.8, lab * 0.85, WHITE)
    })
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b738_pfd',
  label:    '737 PFD',
  icon:     '✈',
  order:    1,
  datarefs: DEFAULTS,
  optionalDatarefs: ['ias_trend', 'ra_mins', 'st_gpss', 'baro_std'],
}
