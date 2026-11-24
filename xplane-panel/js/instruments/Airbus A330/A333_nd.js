// A330 ND — Airbus navigation display, heading up, following the cockpit EFIS mode knob
// (ROSE LS / ROSE VOR / ROSE NAV / ARC / PLAN) and range selector:
//   compass with yellow lubber line and aircraft symbol, cyan selected heading, green
//   track diamond, range rings, GS / TAS / wind, active waypoint (bearing, distance,
//   ETA) with the active leg, ILS / VOR course pointer and deviation in ROSE LS / VOR,
//   glideslope scale in ROSE LS, VOR / ADF bearing pointers and their info boxes when
//   selected on the EFIS panel.
// Uses X-Plane's standard datarefs; the Laminar A330 EFIS knob position is optional
// (X-Plane's map mode is used otherwise).
//
// X-Plane doesn't publish the flight plan through datarefs, so only the active leg
// (aircraft → active waypoint) is drawn, not the whole route.

import { BaseInstrument } from '../base.js'
import { pick, num, text, dataText, wrap360, angDiff, SANS } from '../_glass.js'

const G = 'sim/cockpit2/gauges/indicators/', R = 'sim/cockpit2/radios/', E = 'sim/cockpit2/EFIS/'
export const DEFAULTS = {
  heading:   `${G}heading_AHARS_deg_mag_pilot`,
  track:     `${G}ground_track_mag_pilot`,
  gs:        `${G}ground_speed_kt`,
  tas_ms:    'sim/flightmodel/position/true_airspeed',     // m/s, the value the Laminar ND shows
  wind_dir:  `${G}wind_heading_deg_mag`,
  wind_spd:  `${G}wind_speed_kts`,
  sel_hdg:   'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
  wpt_id:    `${R}indicators/gps_nav_id`,
  wpt_dist:  `${R}indicators/gps_dme_distance_nm`,
  wpt_brg:   `${R}indicators/gps_bearing_deg_mag`,
  wpt_time:  `${R}indicators/gps_dme_time_min`,
  xtk:       `${R}indicators/gps_xtk`,                // cross-track error, NM (positive = left of the leg)
  zulu:      'sim/time/zulu_time_sec',
  range_nm:  `${E}map_range_nm`,
  map_mode:  `${E}map_mode`,
  map_hsi:   `${E}map_mode_is_HSI`,
  efis_knob: 'laminar/A333/knobs/EFIS_mode_pos_capt',
  sel1:      `${E}EFIS_1_selection_pilot`,
  sel2:      `${E}EFIS_2_selection_pilot`,
  nav1_freq: `${R}actuators/nav1_frequency_hz`,
  nav1_id:   `${R}indicators/nav1_nav_id`,
  nav1_crs:  `${R}actuators/nav1_course_deg_mag_pilot`,
  nav1_hdef: `${R}indicators/nav1_hdef_dots_pilot`,
  nav1_vdef: `${R}indicators/nav1_vdef_dots_pilot`,
  nav1_loc:  `${R}indicators/nav1_display_horizontal`,
  nav1_gs:   `${R}indicators/nav1_display_vertical`,
  nav1_brg:  `${R}indicators/nav1_bearing_deg_mag`,
  nav1_dme:  `${R}indicators/nav1_dme_distance_nm`,
  nav2_freq: `${R}actuators/nav2_frequency_hz`,
  nav2_id:   `${R}indicators/nav2_nav_id`,
  nav2_brg:  `${R}indicators/nav2_bearing_deg_mag`,
  nav2_dme:  `${R}indicators/nav2_dme_distance_nm`,
  adf1_freq: `${R}actuators/adf1_frequency_hz`,
  adf1_id:   `${R}indicators/adf1_nav_id`,
  adf1_brg:  `${R}indicators/adf1_bearing_deg_mag`,
  adf2_freq: `${R}actuators/adf2_frequency_hz`,
  adf2_id:   `${R}indicators/adf2_nav_id`,
  adf2_brg:  `${R}indicators/adf2_bearing_deg_mag`,
}

const WHITE = '#f2f2f2', GREEN = '#3dff6a', CYAN = '#4fd8ff', YELLOW = '#ffee00', MAGENTA = '#ff5cff', AMBER = '#ffa526'
const MODES = ['LS', 'VOR', 'NAV', 'ARC', 'PLAN', 'ARC']           // Laminar knob positions (ENG → ARC)
const rad = d => d * Math.PI / 180

export class A333ND extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
    this._held = { t: -Infinity }                             // GS / TAS / wind digits refresh once a second
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.heading !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _f(k) { return num(this._v[k], NaN) }

  _mode() {
    const v = this._v
    if (v.efis_knob !== undefined) return MODES[Math.round(num(v.efis_knob, 3))] || 'ARC'
    const m = Math.round(num(v.map_mode, 2)), hsi = num(v.map_hsi, 0) > 0
    return m === 4 ? 'PLAN' : m === 0 ? 'LS' : m === 1 ? 'VOR' : hsi ? 'NAV' : 'ARC'
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'HDG', w / 2, h / 2, Math.max(10, h * 0.06), '#ff3030', 'center', SANS, true); return }
    const f = k => this._f(k)
    const lab = Math.max(7, Math.min(h * 0.034, w * 0.034))
    const mode = this._mode()
    const hdg = Number.isFinite(f('heading')) ? f('heading') : 0
    const range = f('range_nm') > 0 ? f('range_nm') : 40

    // geometry: ARC — aircraft low, large arc; ROSE / PLAN — centred circle
    const arc = mode === 'ARC'
    const cx = w / 2, cy = arc ? h * 0.8 : h * 0.54
    const Rc = arc ? Math.min(h * 0.6, w * 0.58) : Math.min(h * 0.36, w * 0.4)
    const rangeR = arc ? range : range / 2             // NM at the compass circle
    const ppn = Rc / rangeR
    const up = mode === 'PLAN' ? 0 : hdg               // PLAN is north up
    const scr = (brg, dist) => {                       // bearing / distance → screen point
      const a = rad(brg - up - 90)
      return [cx + Math.cos(a) * dist * ppn, cy + Math.sin(a) * dist * ppn]
    }

    ctx.save()
    // clip below the top info lines so long legs don't run into the text
    ctx.beginPath(); ctx.rect(0, h * 0.11, w, h * 0.78); ctx.clip()
    this._rings(cx, cy, Rc, rangeR, arc, mode, lab)
    if (mode === 'NAV' || mode === 'ARC' || mode === 'PLAN') this._activeLeg(scr, cx, cy, lab)
    if (mode !== 'PLAN') this._needles(cx, cy, Rc, hdg)
    if (mode === 'LS' || mode === 'VOR') this._coursePointer(cx, cy, Rc, hdg, mode, lab)
    ctx.restore()

    if (mode === 'PLAN') this._planRose(cx, cy, Rc, lab)
    else this._compass(cx, cy, Rc, hdg, arc, lab)
    this._aircraft(cx, cy, lab, mode === 'PLAN' ? hdg : 0)
    if (mode === 'ARC' || mode === 'NAV') this._xtk(cx, cy, lab)
    if (mode === 'LS' && num(this._v.nav1_gs, 0) > 0) this._gsScale(w * 0.95, cy, Rc * 0.14, f('nav1_vdef'))

    this._topLeft(lab, hdg)
    if (mode === 'LS' || mode === 'VOR') this._navInfo(mode, lab)
    else this._wptInfo(lab)
    this._bottomInfo(lab)
  }

  // ── compass ──────────────────────────────────────────────────────────────────
  _compass(cx, cy, R, hdg, arc, lab) {
    const { ctx } = this, f = k => this._f(k)
    ctx.save()
    if (arc) { ctx.beginPath(); ctx.rect(0, this.h * 0.06, this.w, cy - this.h * 0.06 + R * 0.15); ctx.clip() }
    ctx.strokeStyle = WHITE; ctx.lineWidth = Math.max(1.2, lab * 0.1)
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
    ctx.font = `${(lab * 1.0).toFixed(1)}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const out = arc ? 1 : -1                            // ARC: ticks and numbers outside the arc; ROSE: inside
    for (let d = 0; d < 360; d += 5) {
      const a = rad(d - hdg - 90), l = d % 10 === 0 ? R * 0.04 : R * 0.022
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * (R + out * l), cy + Math.sin(a) * (R + out * l)); ctx.stroke()
      if (d % 10 === 0) {
        const big = d % 30 === 0
        const lr = R + out * (R * 0.04 + lab * (big ? 0.75 : 0.6))
        ctx.save()
        ctx.translate(cx + Math.cos(a) * lr, cy + Math.sin(a) * lr); ctx.rotate(a + Math.PI / 2)
        ctx.fillStyle = WHITE
        ctx.font = `${(lab * (big ? 1.15 : 0.85)).toFixed(1)}px ${SANS}`
        ctx.fillText(String(d / 10), 0, 0)
        ctx.restore()
      }
    }
    // track: green line from the aircraft to the compass, diamond on the compass
    const trk = f('track'), gs = f('gs')
    if (Number.isFinite(trk) && gs > 3) {
      const a = rad(trk - hdg - 90), s = lab * 0.4
      ctx.strokeStyle = GREEN; ctx.lineWidth = Math.max(1.2, lab * 0.1)
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (R - s), cy + Math.sin(a) * (R - s)); ctx.stroke()
      const px = cx + Math.cos(a) * (R - s * 1.2), py = cy + Math.sin(a) * (R - s * 1.2)
      ctx.save(); ctx.translate(px, py); ctx.rotate(a + Math.PI / 2)
      ctx.strokeStyle = GREEN; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0); ctx.closePath(); ctx.stroke()
      ctx.restore()
    }
    // selected heading (cyan triangle outside the compass)
    const sel = f('sel_hdg')
    if (Number.isFinite(sel)) {
      const a = rad(sel - hdg - 90), s = lab * 0.5
      ctx.save(); ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.rotate(a + Math.PI / 2)
      ctx.fillStyle = CYAN
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s, -s * 1.4); ctx.lineTo(s, -s * 1.4); ctx.closePath(); ctx.fill()
      ctx.restore()
    }
    ctx.restore()
    // yellow lubber line (fixed, at the top)
    ctx.strokeStyle = YELLOW; ctx.lineWidth = Math.max(2, lab * 0.2)
    ctx.beginPath(); ctx.moveTo(cx, cy - R - lab * 0.9); ctx.lineTo(cx, cy - R + lab * 0.6); ctx.stroke()
  }

  _planRose(cx, cy, R, lab) {
    const { ctx } = this
    ctx.strokeStyle = WHITE; ctx.lineWidth = Math.max(1.2, lab * 0.1)
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
    for (const [d, t] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      const a = rad(d - 90)
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.94, cy + Math.sin(a) * R * 0.94); ctx.lineTo(cx + Math.cos(a) * R * 1.04, cy + Math.sin(a) * R * 1.04); ctx.stroke()
      text(ctx, t, cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12, lab * 1.1, WHITE)
    }
  }

  _rings(cx, cy, R, rangeR, arc, mode, lab) {
    const { ctx } = this
    const fracs = arc ? [0.25, 0.5, 0.75] : [0.5]
    ctx.save()
    if (arc) { ctx.beginPath(); ctx.rect(0, 0, this.w, cy + lab * 0.5); ctx.clip() }   // ARC: rings stop at the aircraft
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1; ctx.setLineDash([lab * 0.35, lab * 0.5])
    for (const fr of fracs) { ctx.beginPath(); ctx.arc(cx, cy, R * fr, 0, Math.PI * 2); ctx.stroke() }
    ctx.setLineDash([])
    ctx.restore()
    // range labels (cyan): ARC — both sides of the 1/2 and 3/4 rings, just inside; ROSE — lower left
    const fmt = nm => nm >= 10 ? String(Math.round(nm)) : String(+nm.toFixed(1))
    if (arc) {
      for (const fr of [0.5, 0.75]) for (const deg of [208, 332]) {
        const a = rad(deg), r = R * fr - lab * 1.1
        text(ctx, fmt(rangeR * fr), cx + Math.cos(a) * r, cy + Math.sin(a) * r, lab * 0.95, CYAN)
      }
    } else {
      const a = rad(225)
      text(ctx, fmt(rangeR * 0.5), cx + Math.cos(a) * R * 0.5 - lab * 0.6, cy + Math.sin(a) * R * 0.5, lab * 0.95, CYAN, 'right')
    }
    if (!arc) {                                         // ROSE / PLAN: label the outer circle too
      const a = rad(225)
      text(ctx, String(Math.round(rangeR)), cx + Math.cos(a) * R - lab * 0.6, cy + Math.sin(a) * R, lab * 0.95, CYAN, 'right')
    }
  }

  // ── navigation elements ──────────────────────────────────────────────────────
  _activeLeg(scr, cx, cy, lab) {
    const { ctx } = this, v = this._v, f = k => this._f(k)
    const dist = f('wpt_dist'), brg = f('wpt_brg')
    if (!(dist > 0) || !Number.isFinite(brg)) return
    const [x, y] = scr(brg, dist)
    ctx.strokeStyle = GREEN; ctx.lineWidth = Math.max(1.5, lab * 0.14)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke()
    // waypoint: four-point star, white (TO waypoint)
    const s = lab * 0.55
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, r = k % 2 === 0 ? s : s * 0.35
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
      k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    }
    ctx.closePath(); ctx.stroke()
    const id = dataText(v.wpt_id).trim()
    if (id) text(ctx, id, x + s * 1.2, y - s * 0.9, lab, WHITE, 'left')
  }

  // VOR (white) / ADF (green) bearing pointers: 1 = single line, 2 = double line
  _needles(cx, cy, R, hdg) {
    const v = this._v
    for (const n of [1, 2]) {
      const sel = Math.round(num(v[`sel${n}`], 1))      // 0 ADF, 1 off, 2 VOR
      if (sel === 1) continue
      const adf = sel === 0
      const brg = this._f(adf ? `adf${n}_brg` : `nav${n}_brg`)
      const freq = num(v[adf ? `adf${n}_freq` : `nav${n}_freq`], 0)
      if (!Number.isFinite(brg) || !(freq > 0)) continue
      this._pointer(cx, cy, R, rad(brg - hdg - 90), adf ? GREEN : WHITE, n === 2)
    }
  }

  _pointer(cx, cy, R, a, color, double) {
    const { ctx } = this
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a + Math.PI / 2)
    ctx.strokeStyle = color; ctx.lineWidth = 1.6
    const L = R * 0.96, gap = R * 0.04
    const xs = double ? [-gap, gap] : [0]
    for (const x of xs) {
      ctx.beginPath(); ctx.moveTo(x, -L); ctx.lineTo(x, -R * 0.45); ctx.moveTo(x, R * 0.45); ctx.lineTo(x, L); ctx.stroke()
    }
    ctx.beginPath(); ctx.moveTo(-R * 0.06, -L + R * 0.1); ctx.lineTo(0, -L); ctx.lineTo(R * 0.06, -L + R * 0.1); ctx.stroke()
    ctx.restore()
  }

  // ROSE LS (magenta, ILS) / ROSE VOR (cyan) course pointer with deviation bar
  _coursePointer(cx, cy, R, hdg, mode, lab) {
    const { ctx } = this, v = this._v, f = k => this._f(k)
    const crs = f('nav1_crs')
    if (!Number.isFinite(crs) || !(num(v.nav1_freq, 0) > 0)) return
    const col = mode === 'LS' ? MAGENTA : CYAN
    const dot = R * 0.16
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rad(crs - hdg))
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2
    for (const d of [-2, -1, 1, 2]) { ctx.beginPath(); ctx.arc(d * dot, 0, dot * 0.14, 0, Math.PI * 2); ctx.stroke() }
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, lab * 0.18)
    ctx.beginPath(); ctx.moveTo(0, -R * 0.92); ctx.lineTo(0, -R * 0.5); ctx.moveTo(-R * 0.08, -R * 0.75); ctx.lineTo(R * 0.08, -R * 0.75); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, R * 0.5); ctx.lineTo(0, R * 0.92); ctx.stroke()
    const received = mode === 'LS' ? num(v.nav1_loc, 0) > 0 : true
    if (received) {
      const dev = Math.max(-2.4, Math.min(2.4, num(v.nav1_hdef, 0))) * dot
      ctx.beginPath(); ctx.moveTo(dev, -R * 0.45); ctx.lineTo(dev, R * 0.45); ctx.stroke()
    }
    ctx.restore()
  }

  _gsScale(x, cy, sp, dots) {
    const { ctx } = this
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2
    for (const d of [-2, -1, 1, 2]) { ctx.beginPath(); ctx.arc(x, cy + d * sp, sp * 0.15, 0, Math.PI * 2); ctx.stroke() }
    ctx.strokeStyle = YELLOW; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - sp * 0.5, cy); ctx.lineTo(x + sp * 0.5, cy); ctx.stroke()
    if (!Number.isFinite(dots)) return
    const py = cy - Math.max(-2.3, Math.min(2.3, dots)) * sp, s = sp * 0.35   // below the glideslope → above centre
    ctx.strokeStyle = MAGENTA
    ctx.beginPath(); ctx.moveTo(x, py - s); ctx.lineTo(x + s * 0.7, py); ctx.lineTo(x, py + s); ctx.lineTo(x - s * 0.7, py); ctx.closePath(); ctx.stroke()
  }

  _aircraft(cx, cy, lab, rot) {
    const { ctx } = this, s = lab * 1.3
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rad(rot))
    ctx.strokeStyle = YELLOW; ctx.lineWidth = Math.max(2, lab * 0.22); ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, -s * 0.9); ctx.lineTo(0, s * 1.2)          // fuselage
    ctx.moveTo(-s, -s * 0.2); ctx.lineTo(s, -s * 0.2)         // wings
    ctx.moveTo(-s * 0.4, s * 1.0); ctx.lineTo(s * 0.4, s * 1.0) // tail
    ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.restore()
  }

  // cross-track error next to the aircraft symbol, e.g. "1.1L" (hidden when on track)
  _xtk(cx, cy, lab) {
    const xtk = this._f('xtk')
    if (!Number.isFinite(xtk) || Math.abs(xtk) < 0.05 || !(this._f('wpt_dist') > 0)) return
    const a = Math.abs(xtk)
    text(this.ctx, `${a < 10 ? a.toFixed(1) : Math.round(a)}${xtk > 0 ? 'L' : 'R'}`, cx + lab * 1.8, cy, lab * 1.05, GREEN, 'left')
  }

  // ── text areas ───────────────────────────────────────────────────────────────
  _topLeft(lab, hdg) {
    const { ctx, w, h } = this, f = k => this._f(k)
    const now = performance.now()
    if (now - this._held.t > 1000) {
      this._held = { t: now, gs: f('gs'), tas: f('tas_ms') * 1.94384, wd: f('wind_dir'), ws: f('wind_spd') }
      clearTimeout(this._heldTimer)                     // redraw when the next refresh is due
      this._heldTimer = setTimeout(() => { this._dirty = true }, 1050)
    }
    const { gs, tas } = this._held
    let x = w * 0.02
    const y = h * 0.035
    text(ctx, 'GS', x, y, lab * 0.9, WHITE, 'left')
    text(ctx, Number.isFinite(gs) ? String(Math.round(gs)) : '---', x + lab * 1.7, y, lab * 1.1, GREEN, 'left')
    text(ctx, 'TAS', x + lab * 4.6, y, lab * 0.9, WHITE, 'left')
    text(ctx, Number.isFinite(tas) && tas > 60 ? String(Math.round(tas)) : '---', x + lab * 6.9, y, lab * 1.1, GREEN, 'left')
    const { wd, ws } = this._held
    if (Number.isFinite(wd) && Number.isFinite(ws) && tas > 60) {
      const y2 = y + lab * 1.4
      text(ctx, `${String(Math.round(wrap360(wd)) || 360).padStart(3, '0')}/${Math.round(ws)}`, x, y2, lab * 1.1, GREEN, 'left')
      if (ws >= 2) {                                    // arrow pointing downwind, relative to heading
        const ax = x + lab * 1.2, ay = y2 + lab * 1.7, L = lab * 0.9
        const a = rad(wd + 180 - hdg - 90)
        ctx.strokeStyle = GREEN; ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(ax - Math.cos(a) * L, ay - Math.sin(a) * L); ctx.lineTo(ax + Math.cos(a) * L, ay + Math.sin(a) * L)
        const hx = ax + Math.cos(a) * L, hy = ay + Math.sin(a) * L
        ctx.moveTo(hx - Math.cos(a - 0.5) * L * 0.5, hy - Math.sin(a - 0.5) * L * 0.5); ctx.lineTo(hx, hy)
        ctx.lineTo(hx - Math.cos(a + 0.5) * L * 0.5, hy - Math.sin(a + 0.5) * L * 0.5)
        ctx.stroke()
      }
    }
  }

  _wptInfo(lab) {
    const { w, h } = this, v = this._v, f = k => this._f(k)
    const dist = f('wpt_dist'), brg = f('wpt_brg')
    if (!(dist > 0) || !Number.isFinite(brg)) return
    const x = w * 0.98, y = h * 0.035, ctx = this.ctx
    const id = dataText(v.wpt_id).trim()
    if (id) text(ctx, id, x - lab * 3.6, y, lab * 1.1, WHITE, 'right')
    text(ctx, `${String(Math.round(wrap360(brg)) || 360).padStart(3, '0')}°`, x, y, lab * 1.1, GREEN, 'right')
    text(ctx, 'NM', x, y + lab * 1.4, lab * 0.85, CYAN, 'right')
    text(ctx, dist < 20 ? dist.toFixed(1) : String(Math.round(dist)), x - lab * 1.8, y + lab * 1.4, lab * 1.1, GREEN, 'right')
    const tmin = f('wpt_time'), z = f('zulu')
    if (tmin > 0 && tmin < 1440 && Number.isFinite(z)) {
      const eta = (z / 60 + tmin) % 1440
      text(ctx, `${String(Math.floor(eta / 60)).padStart(2, '0')}:${String(Math.floor(eta % 60)).padStart(2, '0')}`, x, y + lab * 2.8, lab * 1.1, GREEN, 'right')
    }
  }

  // ROSE LS / VOR: receiver, frequency, course and ident top right
  _navInfo(mode, lab) {
    const { ctx, w, h } = this, v = this._v, f = k => this._f(k)
    const x = w * 0.98, y = h * 0.035
    const col = mode === 'LS' ? MAGENTA : WHITE
    const fq = num(v.nav1_freq, 0)
    text(ctx, mode === 'LS' ? 'ILS1' : 'VOR1', x - lab * 4.6, y, lab, WHITE, 'right')
    text(ctx, fq > 0 ? (fq / 100).toFixed(2) : '---.--', x, y, lab * 1.1, col, 'right')
    const crs = f('nav1_crs')
    text(ctx, 'CRS', x - lab * 3.2, y + lab * 1.4, lab, WHITE, 'right')
    text(ctx, Number.isFinite(crs) ? `${String(Math.round(wrap360(crs)) || 360).padStart(3, '0')}°` : '---°', x, y + lab * 1.4, lab * 1.1, mode === 'LS' ? MAGENTA : CYAN, 'right')
    const id = dataText(v.nav1_id).trim()
    if (id) text(ctx, id, x, y + lab * 2.8, lab * 1.1, col, 'right')
  }

  // bottom corners: VOR / ADF 1 (left) and 2 (right) when selected on the EFIS panel
  _bottomInfo(lab) {
    const { ctx, w, h } = this, v = this._v
    for (const n of [1, 2]) {
      const sel = Math.round(num(v[`sel${n}`], 1))
      if (sel === 1) continue
      const adf = sel === 0
      const left = n === 1, x = left ? w * 0.02 : w * 0.98, align = left ? 'left' : 'right'
      const col = adf ? GREEN : WHITE
      const y = h * 0.9
      text(ctx, `${adf ? 'ADF' : 'VOR'}${n}`, x, y, lab, col, align)
      const id = dataText(v[adf ? `adf${n}_id` : `nav${n}_id`]).trim()
      const fq = num(v[adf ? `adf${n}_freq` : `nav${n}_freq`], 0)
      text(ctx, id || (fq > 0 ? (adf ? String(fq) : (fq / 100).toFixed(2)) : ''), x, y + lab * 1.3, lab * 1.1, col, align)
      if (!adf) {
        const dme = this._f(`nav${n}_dme`)
        const t = Number.isFinite(dme) && dme > 0 && dme < 300 ? (dme < 20 ? dme.toFixed(1) : String(Math.round(dme))) : '---'
        text(ctx, `${t}`, left ? x : x - lab * 2.2, y + lab * 2.6, lab * 1.1, GREEN, align)
        text(ctx, 'NM', left ? x + lab * 2.8 : x, y + lab * 2.6, lab * 0.85, CYAN, align)
      }
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_nd',
  label:    'A330 ND',
  icon:     '◎',
  order:    2,
  datarefs: DEFAULTS,
  optionalDatarefs: ['efis_knob', 'tas_ms', 'xtk', 'wind_dir', 'wind_spd', 'wpt_id', 'wpt_time', 'zulu', 'nav1_id', 'nav2_id', 'adf1_id', 'adf2_id',
    'nav2_freq', 'nav2_brg', 'nav2_dme', 'adf1_freq', 'adf1_brg', 'adf2_freq', 'adf2_brg', 'sel1', 'sel2'],
}
