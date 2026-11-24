// A330 PFD — Airbus primary flight display, laid out as on the Laminar A330-300:
//   five-column FMA (thrust / vertical / lateral / approach capability / AP-FD-A/THR),
//   attitude with green FD bars and yellow aircraft symbol, Airbus speed tape (no
//   readout: yellow index, VMAX barber pole, next-flap VFE, speed trend, target
//   triangle), altitude tape with the yellow window and 20 ft drum, vertical speed,
//   linear heading tape with selected heading and track diamond, LS deviation and the
//   ILS ident / frequency / DME, radio altitude, baro setting.
// Flight values and autopilot modes come from X-Plane's standard datarefs (so it also
// works on other aircraft); the Laminar A330 adds the manual thrust modes, VMAX / VFE,
// mode-change boxes, approach capability and AP/FD engagement (optional).

import { BaseInstrument } from '../base.js'
import { FLIGHT_DREFS, pick, num, attitude, text, dataText, wrap360, angDiff, SANS } from '../_glass.js'

const A = 'sim/cockpit2/autopilot/', R = 'sim/cockpit2/radios/', P = 'laminar/A333/PFD/', F = 'laminar/A333/PFD/FMAs/'

const LAMINAR = {
  vmax:         `${P}airspeed_ind/vmo_mmo`,
  vfe_next:     `${P}airspeed_ind/next_flap_speed`,
  ls_mode:      `${P}capt_ils_mode`,
  fd_lat_vis:   `${P}flight_director_vis_lat_status_capt`,
  fd_vrt_vis:   `${P}flight_director_vis_vrt_status_capt`,
  vs_color:     `${P}vertical_speed_color_capt`,
  ra_color:     `${P}radio_altimeter_color_capt`,
  ap12:         `${F}autopilot_12_status`,
  fd12:         `${F}flight_dir_12_status`,
  climb_desc:   `${F}climb_descend`,
  alt_star:     `${F}alt_star_status`,
  gs_star:      `${F}gs_star_status`,
  loc_star:     `${F}loc_star_status`,
  man_toga:     `${F}man_toga_status`,
  man_mct:      `${F}man_mct_status`,
  man_flex:     `${F}man_flex_status`,
  man_thr:      `${F}man_thrust_status`,
  thr_mct:      `${F}thr_mct_status`,
  thr_clb:      `${F}thr_clb_status`,
  thr_lvr:      `${F}thr_lvr_status`,
  lvr_clb:      `${F}lvr_clb_status`,
  lvr_mct:      `${F}lvr_mct_status`,
  lvr_asym:     `${F}lvr_assym_status`,
  alt_arm:      `${F}alt_arm_status`,
  land_cat:     `${F}landing_cat_enum`,
  land_sd:      `${F}landing_single_dual`,
  baro_hpa:     'laminar/A333/barometer/capt_inHg_hPa_pos',
  box1:         'laminar/A333/FMAs/column1_box',
  box2:         'laminar/A333/FMAs/column2_box',
  box3:         'laminar/A333/FMAs/column3_box',
  box23:        'laminar/A333/FMAs/column2_3_box',
}

export const DEFAULTS = {
  ...FLIGHT_DREFS,
  sel_speed:   `${A}airspeed_dial_kts_mach`,
  sel_is_mach: `${A}airspeed_is_mach`,
  sel_alt:     `${A}altitude_dial_ft`,
  sel_hdg:     `${A}heading_dial_deg_mag_pilot`,
  trk_fpa:     `${A}trk_fpa`,
  fd_mode:     `${A}flight_director_mode`,
  fd_pitch:    `${A}flight_director_pitch_deg`,
  fd_roll:     `${A}flight_director_roll_deg`,
  ap_on:       `${A}autopilot_on`,
  at_on:       `${A}autothrottle_on`,
  at_arm:      `${A}autothrottle_arm`,
  st_speed:    `${A}speed_status`,
  st_vnav_spd: `${A}vnav_speed_status`,
  st_hdg:      `${A}heading_status`,
  st_trk:      `${A}track_status`,
  st_nav:      `${A}nav_status`,
  st_gpss:     `${A}gpss_status`,
  st_alt:      `${A}altitude_hold_status`,
  st_vs:       `${A}vvi_status`,
  st_fpa:      `${A}fpa_status`,
  st_vnav:     `${A}vnav_status`,
  st_gs:       `${A}glideslope_status`,
  st_flare:    `${A}flare_status`,
  st_rollout:  `${A}rollout_status`,
  st_toga:     `${A}TOGA_status`,
  st_toga_lat: `${A}TOGA_lateral_status`,
  st_rwy:      `${A}runway_status`,
  loc_dots:    `${R}indicators/nav1_hdef_dots_pilot`,
  gs_dots:     `${R}indicators/nav1_vdef_dots_pilot`,
  loc_show:    `${R}indicators/nav1_display_horizontal`,
  gs_show:     `${R}indicators/nav1_display_vertical`,
  nav1_id:     `${R}indicators/nav1_nav_id`,
  nav1_freq:   `${R}actuators/nav1_frequency_hz`,
  nav1_dme:    `${R}indicators/nav1_dme_distance_nm`,
  nav1_has_dme:`${R}indicators/nav1_has_dme`,
  nav1_crs:    `${R}actuators/nav1_course_deg_mag_pilot`,
  vne:         'sim/aircraft/view/acf_Vne',
  baro_std:    'sim/cockpit2/gauges/actuators/barometer_setting_is_std_pilot',
  ...LAMINAR,
}

const WHITE = '#f2f2f2', GREEN = '#3dff6a', CYAN = '#4fd8ff', AMBER = '#ffa526', YELLOW = '#ffee00', MAGENTA = '#ff5cff', RED = '#ff3030'
const TAPE = '#5b5f66'

export class A333PFD extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._baroUnits = config.baro || 'auto'
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

  _f(k) { return num(this._v[k], NaN) }
  _has(k) { return this._v[k] !== undefined }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'ATT', w / 2, h / 2, Math.max(10, h * 0.06), RED, 'center', SANS, true); return }
    const f = k => this._f(k)
    const lab = Math.max(7, Math.min(h * 0.034, w * 0.034))

    this._fma(0, 0, w, h * 0.135, lab)

    // ── attitude ──
    const adi = { x: w * 0.24, y: h * 0.2, w: w * 0.47, h: h * 0.56 }
    const fdLat = this._has('fd_lat_vis') ? f('fd_lat_vis') > 0 : true
    const fdVrt = this._has('fd_vrt_vis') ? f('fd_vrt_vis') > 0 : true
    attitude(ctx, { ...adi, shape: 'barrel', pitch: f('pitch'), roll: f('roll'), slip: f('slip'), degSpan: 40,
      fd: f('fd_mode') > 0 && (fdLat || fdVrt) ? { pitch: f('fd_pitch'), roll: f('fd_roll'), showRoll: fdLat, showPitch: fdVrt } : null,
      colors: { fd: GREEN, symbol: YELLOW, symbolFill: '#000' }, symbolWeight: 0.55, symbolGap: 0.25, wingLen: 0.2 })
    const acx = adi.x + adi.w / 2, acy = adi.y + adi.h / 2

    // LS deviation (when the LS pushbutton is on and the receiver has a signal)
    const lsOn = this._has('ls_mode') ? f('ls_mode') >= 0 : true
    if (lsOn && f('loc_show') > 0) this._devScale(acx, adi.y + adi.h + h * 0.03, adi.w * 0.09, f('loc_dots'), true)
    if (lsOn && f('gs_show') > 0) this._devScale(adi.x + adi.w + w * 0.025, acy, adi.h * 0.09, f('gs_dots'), false)
    if (lsOn) this._ilsInfo(w * 0.02, h * 0.9, lab)

    // radio altitude
    const ra = f('radio_alt')
    if (Number.isFinite(ra) && ra < 2500) {
      const step = ra > 50 ? 10 : ra > 10 ? 5 : 1
      text(ctx, String(Math.max(0, Math.round(ra / step) * step)), acx, adi.y + adi.h * 0.9, lab * 1.4,
        f('ra_color') > 0 ? AMBER : GREEN, 'center', SANS, true)
    }

    this._speedTape(w * 0.04, h * 0.2, w * 0.13, h * 0.56, lab)
    this._altTape(w * 0.78, h * 0.2, w * 0.1, h * 0.56, lab)
    this._vsi(w * 0.9, h * 0.22, w * 0.09, h * 0.52, lab)
    this._headingTape(adi.x, h * 0.86, adi.w, h * 0.075, lab, lsOn && num(this._v.nav1_freq, 0) > 0 ? f('nav1_crs') : NaN)
  }

  // ── FMA ──────────────────────────────────────────────────────────────────────
  _fmaModes() {
    const v = this._v, s = k => num(v[k], 0), on = k => s(k) === 2, arm = k => s(k) === 1
    const ra = this._f('radio_alt')
    // column 1: thrust
    let thr = '', thrRow2 = '', thrColor = GREEN
    if (s('man_toga') > 0) { thr = 'MAN'; thrRow2 = 'TOGA'; thrColor = WHITE }
    else if (s('man_flex') > 0) { thr = 'MAN'; thrRow2 = 'FLX'; thrColor = WHITE }
    else if (s('man_mct') > 0) { thr = 'MAN'; thrRow2 = 'MCT'; thrColor = WHITE }
    else if (s('man_thr') > 0) { thr = 'MAN'; thrRow2 = 'THR'; thrColor = WHITE }
    else if (s('at_on') > 0) {
      if (s('thr_lvr') > 0) thr = 'THR LVR'
      else if (s('thr_mct') > 0) thr = 'THR MCT'
      else if (s('thr_clb') > 0 || (on('st_speed') && s('climb_desc') > 0)) thr = 'THR CLB'
      else if (on('st_speed') || (on('st_vnav') && s('climb_desc') <= 0)) thr = 'THR IDLE'
      else thr = s('sel_is_mach') > 0 ? 'MACH' : 'SPEED'
    }
    // thrust lever messages (row 2, under the thrust mode)
    let lvr = '', lvrColor = WHITE
    if (!thrRow2) {
      if (s('lvr_asym') > 0) { lvr = 'LVR ASYM'; lvrColor = AMBER }
      else if (s('lvr_clb') > 0) lvr = 'LVR CLB'
      else if (s('lvr_mct') > 0) lvr = 'LVR MCT'
    }
    // columns 4–5 of the landing modes span 2–3
    const land = on('st_rollout') ? 'ROLL OUT' : on('st_flare') ? 'FLARE'
      : (on('st_gs') && on('st_nav') && Number.isFinite(ra) && ra < 400) ? 'LAND' : ''
    // column 2: vertical
    let vert = '', vertArm = []
    const climb = s('climb_desc') > 0
    if (on('st_toga')) vert = 'SRS'
    else if (on('st_gs')) vert = s('gs_star') > 0 ? 'G/S*' : 'G/S'
    else if (on('st_alt')) vert = s('alt_star') > 0 ? 'ALT*' : 'ALT'
    else if (on('st_vs')) vert = 'V/S'
    else if (on('st_fpa')) vert = 'FPA'
    else if (on('st_vnav')) vert = climb ? 'CLB' : 'DES'
    else if (on('st_speed')) vert = climb ? 'OP CLB' : 'OP DES'
    if (arm('st_gs')) vertArm.push(['G/S', CYAN])
    // managed climb / descent armed (Laminar alt_arm_status, e.g. CLB under ALT), or X-Plane VNAV armed
    if (arm('st_vnav') || s('alt_arm') > 0) vertArm.push([climb ? 'CLB' : 'DES', CYAN])
    else if (!on('st_alt') && arm('st_alt')) vertArm.push(['ALT', CYAN])
    // column 3: lateral
    let lat = '', latArm = []
    if (on('st_toga_lat')) lat = 'GA TRK'
    else if (on('st_rwy')) lat = 'RWY'
    else if (on('st_nav')) lat = s('loc_star') > 0 ? 'LOC*' : 'LOC'
    else if (on('st_gpss')) lat = 'NAV'
    else if (on('st_hdg')) lat = 'HDG'
    else if (on('st_trk')) lat = 'TRK'
    if (arm('st_gpss')) latArm.push(['NAV', CYAN])
    if (arm('st_nav')) latArm.push(['LOC', CYAN])
    // column 4: approach capability
    const cat = Math.round(s('land_cat'))
    const cap = cat > 0 ? [['', 'CAT 1', 'CAT 2', 'CAT 3'][cat] || '', ['', 'SINGLE', 'DUAL'][Math.round(s('land_sd'))] || ''] : ['', '']
    // column 5: engagement
    const ap = this._has('ap12') ? ['', 'AP1', 'AP2', 'AP1+2'][Math.round(s('ap12'))] || '' : (s('ap_on') > 0 ? 'AP1' : '')
    const fdN = this._has('fd12') ? Math.round(s('fd12')) : (s('fd_mode') > 0 ? 3 : 0)
    const fd = fdN > 0 ? `${fdN & 1 ? '1' : '-'} FD ${fdN & 2 ? '2' : '-'}` : ''
    const athr = s('at_on') > 0 ? ['A/THR', WHITE] : s('at_arm') > 0 ? ['A/THR', CYAN] : ['', WHITE]
    return { thr, thrRow2, thrColor, lvr, lvrColor, vert, vertArm, lat, latArm, land, cap, ap, fd, athr }
  }

  _fma(x, y, w, h, lab) {
    const { ctx } = this, v = this._v, m = this._fmaModes()
    const cols = [0.2, 0.2, 0.2, 0.2, 0.2].map(c => c * w)
    const cx = []; let acc = x
    for (const c of cols) { cx.push(acc + c / 2); acc += c }
    const rowY = k => y + h * (0.2 + k * 0.3)
    const size = lab * 1.05
    ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 1
    let xx = x
    cols.forEach((c, i) => {
      if (i > 0 && !(m.land && i === 2)) { ctx.beginPath(); ctx.moveTo(xx, y + h * 0.05); ctx.lineTo(xx, y + h * 0.95); ctx.stroke() }
      xx += c
    })
    const box = (key, cxx, cy, wd) => {
      if (num(v[key], 0) > 0) { ctx.strokeStyle = WHITE; ctx.lineWidth = 1; ctx.strokeRect(cxx - wd / 2, cy - size * 0.65, wd, size * 1.3) }
    }
    // col 1
    if (m.thr) { text(ctx, m.thr, cx[0], rowY(0), size, m.thrColor); box('box1', cx[0], rowY(0), cols[0] * 0.9) }
    if (m.thrRow2) text(ctx, m.thrRow2, cx[0], rowY(1), size, WHITE)
    else if (m.lvr) text(ctx, m.lvr, cx[0], rowY(1), size, m.lvrColor)
    // cols 2–3 (or the landing mode spanning both)
    if (m.land) { text(ctx, m.land, (cx[1] + cx[2]) / 2, rowY(0), size, GREEN); box('box23', (cx[1] + cx[2]) / 2, rowY(0), cols[1] * 1.2) }
    else {
      if (m.vert) { text(ctx, m.vert, cx[1], rowY(0), size, GREEN); box('box2', cx[1], rowY(0), cols[1] * 0.9) }
      if (m.lat)  { text(ctx, m.lat,  cx[2], rowY(0), size, GREEN); box('box3', cx[2], rowY(0), cols[2] * 0.9) }
    }
    const armed = (list, cxx) => {
      if (list.length === 1) text(ctx, list[0][0], cxx, rowY(1), size, list[0][1])
      else if (list.length > 1) list.forEach(([t, c], k) => text(ctx, t, cxx + (k - 0.5) * cols[1] * 0.45, rowY(1), size * 0.95, c))
    }
    armed(m.vertArm, cx[1]); armed(m.latArm, cx[2])
    // col 4
    if (m.cap[0]) text(ctx, m.cap[0], cx[3], rowY(0), size, WHITE)
    if (m.cap[1]) text(ctx, m.cap[1], cx[3], rowY(1), size, WHITE)
    // col 5
    if (m.ap) text(ctx, m.ap, cx[4], rowY(0), size, WHITE)
    if (m.fd) text(ctx, m.fd, cx[4], rowY(1), size, WHITE)
    if (m.athr[0]) text(ctx, m.athr[0], cx[4], rowY(2), size, m.athr[1])
  }

  // ── speed tape ───────────────────────────────────────────────────────────────
  _speedTape(x, y, w, h, lab) {
    const { ctx } = this, f = k => this._f(k)
    const ias = Math.max(30, Number.isFinite(f('ias')) ? f('ias') : 30)
    const span = 84, ppk = h / span, cy = y + h / 2
    const yOf = s => cy - (s - ias) * ppk
    ctx.save()
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
    ctx.fillStyle = TAPE; ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.lineWidth = Math.max(1, h * 0.004)
    ctx.font = `${(lab * 1.1).toFixed(1)}px ${SANS}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let s = Math.floor((ias - span / 2) / 10) * 10; s <= ias + span / 2 + 10; s += 10) {
      if (s < 30) continue
      const yy = yOf(s)
      ctx.beginPath(); ctx.moveTo(x + w, yy); ctx.lineTo(x + w * (s % 20 === 0 ? 0.8 : 0.86), yy); ctx.stroke()
      if (s % 20 === 0) ctx.fillText(String(s).padStart(3, '0'), x + w * 0.72, yy)
    }
    // VMAX red/black barber pole
    const vmax = f('vmax') > 0 ? f('vmax') : f('vne')
    if (vmax > 0 && yOf(vmax) > y) {
      const bx = x + w * 0.86, bw = w * 0.14, seg = bw * 0.9
      for (let yy = Math.min(yOf(vmax), y + h); yy > y - seg * 2; yy -= seg * 2) {
        ctx.fillStyle = RED; ctx.fillRect(bx, yy - seg, bw, seg)
        ctx.fillStyle = '#000'; ctx.fillRect(bx, yy - seg * 2, bw, seg)
      }
    }
    // next flap VFE: amber "="
    const vfe = f('vfe_next')
    if (vfe > 30 && Math.abs(vfe - ias) < span / 2) {
      ctx.strokeStyle = AMBER; ctx.lineWidth = Math.max(1.5, h * 0.006)
      for (const d of [-lab * 0.18, lab * 0.18]) { ctx.beginPath(); ctx.moveTo(x + w * 0.82, yOf(vfe) + d); ctx.lineTo(x + w * 0.98, yOf(vfe) + d); ctx.stroke() }
    }
    ctx.restore()
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke()

    // speed trend (10 s), yellow arrow
    const trend = f('ias_trend') * 10
    if (Math.abs(trend) > 2) {
      const tx = x + w * 0.93, y2 = Math.max(y, Math.min(y + h, yOf(ias + trend)))
      ctx.strokeStyle = YELLOW; ctx.fillStyle = YELLOW; ctx.lineWidth = Math.max(1.5, w * 0.025)
      ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(tx, y2); ctx.stroke()
      const d = Math.sign(trend) * lab * 0.5
      ctx.beginPath(); ctx.moveTo(tx - lab * 0.3, y2 + d); ctx.lineTo(tx, y2); ctx.lineTo(tx + lab * 0.3, y2 + d); ctx.stroke()
    }
    // speed target: cyan (selected) / magenta (managed) triangle, or digits when off scale
    const sel = f('sel_speed'), isMach = f('sel_is_mach') > 0
    const managed = num(this._v.st_vnav_spd, 0) === 2
    const tcol = managed ? MAGENTA : CYAN
    if (Number.isFinite(sel) && !isMach) {
      const yy = yOf(sel)
      if (yy < y || yy > y + h) {
        text(ctx, String(Math.round(sel)), x + w * 0.5, yy < y ? y - lab * 0.7 : y + h + lab * 0.7, lab * 1.1, tcol)
      } else {
        ctx.fillStyle = tcol
        ctx.beginPath(); ctx.moveTo(x + w, yy); ctx.lineTo(x + w + lab * 0.7, yy - lab * 0.45); ctx.lineTo(x + w + lab * 0.7, yy + lab * 0.45); ctx.closePath(); ctx.fill()
      }
    } else if (isMach && Number.isFinite(sel)) {
      text(ctx, `.${String(Math.round(sel * 1000)).padStart(3, '0')}`.replace(/^\.0*(\d{2})\d?$/, '.$1'), x + w * 0.5, y - lab * 0.7, lab * 1.1, tcol)
    }
    // yellow speed index: line across the tape and a pointer
    ctx.strokeStyle = YELLOW; ctx.fillStyle = YELLOW; ctx.lineWidth = Math.max(2, h * 0.008)
    ctx.beginPath(); ctx.moveTo(x - w * 0.05, cy); ctx.lineTo(x + w * 0.75, cy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + w * 0.78, cy); ctx.lineTo(x + w * 1.05, cy - lab * 0.45); ctx.lineTo(x + w * 1.05, cy + lab * 0.45); ctx.closePath(); ctx.fill()
    // Mach below the tape
    const mach = f('mach')
    if (mach >= 0.5) text(ctx, `.${String(Math.round(mach * 1000)).padStart(3, '0')}`.slice(0, 3), x + w * 0.5, y + h + lab * 1.9, lab * 1.2, GREEN)
  }

  // ── altitude tape ────────────────────────────────────────────────────────────
  _altTape(x, y, w, h, lab) {
    const { ctx } = this, f = k => this._f(k)
    const alt = Number.isFinite(f('alt')) ? f('alt') : 0
    const span = 1000, ppf = h / span, cy = y + h / 2
    const yOf = a => cy - (a - alt) * ppf
    ctx.save()
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
    ctx.fillStyle = TAPE; ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.lineWidth = Math.max(1, h * 0.004)
    ctx.font = `${(lab * 1.1).toFixed(1)}px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    for (let a = Math.floor((alt - span / 2) / 100) * 100; a <= alt + span / 2 + 100; a += 100) {
      const yy = yOf(a)
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w * 0.14, yy); ctx.stroke()
      if (a % 500 === 0) ctx.fillText(String(Math.round(a / 100)).padStart(3, '0'), x + w * 0.22, yy)
    }
    ctx.restore()
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke()

    // selected altitude: cyan digits when off scale, cyan bracket on the tape otherwise
    const sel = f('sel_alt')
    if (Number.isFinite(sel)) {
      const yy = yOf(sel)
      if (yy < y || yy > y + h) text(ctx, String(Math.round(sel)), x + w * 0.5, yy < y ? y - lab * 0.7 : y + h + lab * 0.7, lab * 1.1, CYAN)
      else {
        ctx.strokeStyle = CYAN; ctx.lineWidth = Math.max(1.5, h * 0.006)
        ctx.strokeRect(x + w * 0.02, yy - lab * 0.9, w * 0.5, lab * 1.8)
        text(ctx, String(Math.round(sel / 100)).padStart(3, '0'), x + w * 0.27, yy, lab, CYAN)
      }
    }
    // current altitude window: yellow outline, hundreds big + 20 ft drum
    const bw = w * 1.02, bh = lab * 2.2, bx = x - w * 0.02
    ctx.fillStyle = '#000'; ctx.strokeStyle = YELLOW; ctx.lineWidth = Math.max(1.5, lab * 0.12)
    ctx.beginPath()
    ctx.moveTo(bx - lab * 0.4, cy); ctx.lineTo(bx, cy - bh / 2); ctx.lineTo(bx + bw * 0.62, cy - bh / 2); ctx.lineTo(bx + bw * 0.62, cy - bh * 0.85)
    ctx.lineTo(bx + bw, cy - bh * 0.85); ctx.lineTo(bx + bw, cy + bh * 0.85); ctx.lineTo(bx + bw * 0.62, cy + bh * 0.85)
    ctx.lineTo(bx + bw * 0.62, cy + bh / 2); ctx.lineTo(bx, cy + bh / 2); ctx.closePath()
    ctx.fill(); ctx.stroke()
    const neg = alt < 0, a = Math.abs(alt)
    // hundreds: switch over in the last 20 ft, as the drum rolls past 80 → 00
    const hh = Math.floor((a + 10) / 100)
    text(ctx, `${neg ? '-' : ''}${hh}`, bx + bw * 0.6, cy, lab * 1.45, GREEN, 'right', SANS, true)
    // 20 ft drum: three stacked values rolling continuously
    const rowH = bh * 0.56, p = (a % 100) / 20
    ctx.save()
    ctx.beginPath(); ctx.rect(bx + bw * 0.62, cy - bh * 0.85, bw * 0.38, bh * 1.7); ctx.clip()
    for (let k = Math.floor(p) - 2; k <= Math.floor(p) + 3; k++) {
      const val = (((k % 5) + 5) % 5) * 20
      text(ctx, String(val).padStart(2, '0'), bx + bw * 0.81, cy - (k - p) * rowH, lab * 1.0, GREEN, 'center', SANS, true)
    }
    ctx.restore()

    // baro setting below
    const baro = f('baro')
    if (Number.isFinite(baro)) {
      const std = this._has('baro_std') ? f('baro_std') > 0 : Math.abs(baro - 29.92) < 0.005
      const hpa = this._baroUnits === 'auto' ? f('baro_hpa') > 0 : this._baroUnits === 'hpa'
      if (std) {
        text(ctx, 'STD', x + w * 0.5, y + h + lab * 2.2, lab * 1.2, CYAN)
        ctx.strokeStyle = YELLOW; ctx.lineWidth = 1; ctx.strokeRect(x + w * 0.5 - lab * 1.6, y + h + lab * 1.5, lab * 3.2, lab * 1.4)
      } else {
        text(ctx, 'QNH', x - w * 0.05, y + h + lab * 2.2, lab, WHITE, 'right')
        text(ctx, hpa ? String(Math.round(baro * 33.8639)) : baro.toFixed(2), x + w * 0.05, y + h + lab * 2.2, lab * 1.2, CYAN, 'left')
      }
    }
  }

  // ── vertical speed ───────────────────────────────────────────────────────────
  _vsi(x, y, w, h, lab) {
    const { ctx } = this, vs = this._f('vs')
    ctx.fillStyle = TAPE
    ctx.beginPath()
    ctx.moveTo(x, y); ctx.lineTo(x + w * 0.45, y); ctx.lineTo(x + w * 0.8, y + h * 0.3); ctx.lineTo(x + w * 0.8, y + h * 0.7)
    ctx.lineTo(x + w * 0.45, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill()
    const cy = y + h / 2
    const pos = fpm => {                       // ±1000 → 0.25, ±2000 → 0.36, ±6000 → 0.47 of the height
      const a = Math.abs(fpm), s = a <= 1000 ? a / 1000 * 0.25 : a <= 2000 ? 0.25 + (a - 1000) / 1000 * 0.11 : 0.36 + Math.min(1, (a - 2000) / 4000) * 0.11
      return cy - Math.sign(fpm) * s * h
    }
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.lineWidth = 1
    ctx.font = `${(lab * 0.85).toFixed(1)}px ${SANS}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (const t of [-6000, -2000, -1500, -1000, -500, 500, 1000, 1500, 2000, 6000]) {
      const yy = pos(t), big = Math.abs(t) % 1000 === 0
      ctx.beginPath(); ctx.moveTo(x + w * 0.3, yy); ctx.lineTo(x + w * (big ? 0.44 : 0.38), yy); ctx.stroke()
      if (big) ctx.fillText(String(Math.abs(t) / 1000), x + w * 0.26, yy)
    }
    ctx.strokeStyle = YELLOW; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x + w * 0.22, cy); ctx.lineTo(x + w * 0.44, cy); ctx.stroke()
    if (!Number.isFinite(vs)) return
    const col = num(this._v.vs_color, 0) > 0 ? AMBER : GREEN
    const yy = pos(vs)
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, w * 0.05)
    ctx.beginPath(); ctx.moveTo(x + w * 0.3, yy); ctx.lineTo(x + w * 1.4, cy); ctx.stroke()
    if (Math.abs(vs) >= 200) {
      const t = String(Math.round(Math.abs(vs) / 100)).padStart(2, '0')
      const ty = Math.max(y + lab * 0.6, Math.min(y + h - lab * 0.6, yy + (vs > 0 ? -lab * 0.8 : lab * 0.8)))
      ctx.fillStyle = '#000'; ctx.fillRect(x + w * 0.4, ty - lab * 0.6, w * 0.5, lab * 1.2)
      text(ctx, t, x + w * 0.65, ty, lab, col, 'center', SANS, true)
    }
  }

  // ── heading tape ─────────────────────────────────────────────────────────────
  _headingTape(x, y, w, h, lab, ilsCrs) {
    const { ctx } = this, f = k => this._f(k)
    const hdg = Number.isFinite(f('heading')) ? f('heading') : 0
    const span = 36, ppd = w / span, cx = x + w / 2
    const xOf = d => cx + angDiff(d, hdg) * ppd
    ctx.save()
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
    ctx.fillStyle = TAPE; ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1
    for (let d = Math.floor((hdg - span / 2) / 5) * 5; d <= hdg + span / 2 + 5; d += 5) {
      const xx = cx + (d - hdg) * ppd
      ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + h * (d % 10 === 0 ? 0.3 : 0.18)); ctx.stroke()
      if (d % 10 === 0) {
        const n = wrap360(d) / 10
        text(ctx, String(n), xx, y + h * 0.62, (n % 3 === 0 ? 1.15 : 0.9) * lab, WHITE)
      }
    }
    // track diamond (green, bottom edge)
    const trk = f('track')
    if (Number.isFinite(trk) && Math.abs(angDiff(trk, hdg)) < span / 2) {
      const tx = xOf(trk), s = lab * 0.4
      ctx.strokeStyle = GREEN; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(tx, y + h - s * 2); ctx.lineTo(tx + s, y + h - s); ctx.lineTo(tx, y + h); ctx.lineTo(tx - s, y + h - s); ctx.closePath(); ctx.stroke()
    }
    ctx.restore()
    // ILS course: magenta marker on the tape, boxed digits at the end when off scale
    if (Number.isFinite(ilsCrs)) {
      const d = angDiff(ilsCrs, hdg)
      ctx.strokeStyle = MAGENTA; ctx.lineWidth = Math.max(1.5, lab * 0.15)
      if (Math.abs(d) < span / 2) {
        const ix = cx + d * ppd
        ctx.beginPath(); ctx.moveTo(ix, y); ctx.lineTo(ix, y + h); ctx.moveTo(ix - lab * 0.4, y + h * 0.35); ctx.lineTo(ix + lab * 0.4, y + h * 0.35); ctx.stroke()
      } else {
        const t = String(Math.round(wrap360(ilsCrs)) || 360).padStart(3, '0')
        const bw = lab * 2.2, bx = d > 0 ? x + w - bw - lab * 0.15 : x + lab * 0.15
        ctx.fillStyle = '#000'; ctx.fillRect(bx, y + h * 0.18, bw, h * 0.64)
        ctx.strokeRect(bx, y + h * 0.18, bw, h * 0.64)
        text(ctx, t, bx + bw / 2, y + h * 0.5, lab * 0.95, MAGENTA)
      }
    }
    // yellow reference line
    ctx.strokeStyle = YELLOW; ctx.lineWidth = Math.max(2, lab * 0.18)
    ctx.beginPath(); ctx.moveTo(cx, y - lab * 0.4); ctx.lineTo(cx, y + h * 0.5); ctx.stroke()
    // selected heading: cyan triangle above the tape, digits at the side when off scale
    const sel = f('sel_hdg')
    if (Number.isFinite(sel)) {
      const d = angDiff(sel, hdg)
      if (Math.abs(d) < span / 2) {
        const sx = cx + d * ppd
        ctx.fillStyle = CYAN
        ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx - lab * 0.45, y - lab * 0.7); ctx.lineTo(sx + lab * 0.45, y - lab * 0.7); ctx.closePath(); ctx.fill()
      } else {
        text(ctx, String(Math.round(wrap360(sel))).padStart(3, '0'), d < 0 ? x + lab * 1.5 : x + w - lab * 1.5, y - lab * 0.6, lab, CYAN)
      }
    }
  }

  // ── LS deviation and ILS info ────────────────────────────────────────────────
  _devScale(x, y, sp, dots, horizontal) {
    const { ctx } = this
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2
    for (const d of [-2, -1, 1, 2]) {
      ctx.beginPath()
      ctx.arc(horizontal ? x + d * sp : x, horizontal ? y : y + d * sp, sp * 0.14, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.strokeStyle = YELLOW; ctx.lineWidth = 2
    ctx.beginPath()
    if (horizontal) { ctx.moveTo(x, y - sp * 0.4); ctx.lineTo(x, y + sp * 0.4) } else { ctx.moveTo(x - sp * 0.4, y); ctx.lineTo(x + sp * 0.4, y) }
    ctx.stroke()
    if (!Number.isFinite(dots)) return
    // positive vdef = aircraft below the glideslope → diamond above centre
    const off = Math.max(-2.3, Math.min(2.3, dots)) * sp
    const px = horizontal ? x + off : x, py = horizontal ? y : y - off, s = sp * 0.32
    ctx.strokeStyle = MAGENTA; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s * 0.7, py); ctx.lineTo(px, py + s); ctx.lineTo(px - s * 0.7, py); ctx.closePath()
    ctx.stroke()
  }

  _ilsInfo(x, y, lab) {
    const v = this._v, id = dataText(v.nav1_id).trim()
    const fq = num(v.nav1_freq, 0), dme = num(v.nav1_dme, NaN)
    if (!(fq > 0)) return
    if (id) text(this.ctx, id, x, y - lab * 1.2, lab, MAGENTA, 'left')
    text(this.ctx, (fq / 100).toFixed(2), x, y, lab, MAGENTA, 'left')
    // as on the Laminar A330: the distance shows once the localizer is received, 00.0 until then
    const received = num(v.loc_show, 0) > 0 && (v.nav1_has_dme === undefined || num(v.nav1_has_dme, 0) > 0)
    const ok = received && Number.isFinite(dme) && dme > 0 && dme < 300
    text(this.ctx, ok ? (dme < 20 ? dme.toFixed(1) : String(Math.round(dme))) : '00.0', x, y + lab * 1.2, lab, MAGENTA, 'left')
    text(this.ctx, 'NM', x + lab * 2.6, y + lab * 1.2, lab * 0.8, CYAN, 'left')
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_pfd',
  label:    'A330 PFD',
  icon:     '✈',
  order:    1,
  datarefs: DEFAULTS,
  optionalDatarefs: [...Object.keys(LAMINAR), 'ias_trend', 'st_fpa', 'st_vnav_spd', 'st_toga_lat', 'st_rwy', 'nav1_id', 'nav1_dme', 'nav1_has_dme', 'nav1_crs', 'trk_fpa', 'baro_std'],
  options: [
    { key: 'baro', label: 'QNH units', type: 'select', default: 'auto',
      choices: [{ value: 'auto', label: 'As set in the cockpit (Laminar A330)' }, { value: 'inhg', label: 'inHg' }, { value: 'hpa', label: 'hPa' }] },
  ],
}
