// 737 ND — navigation display, expanded MAP mode (track up): compass arc, heading
// pointer and heading bug, range rings, ground speed / true airspeed / wind, and the
// active waypoint with distance and time-to-go, drawn at its real bearing and distance.
// The range follows the cockpit EFIS range selector (sim/cockpit2/EFIS/map_range_nm).
//
// X-Plane doesn't publish the full flight plan through datarefs, so only the active leg
// (aircraft → active waypoint) is drawn, not the whole route.

import { BaseInstrument } from '../base.js'
import { pick, num, text, wrap360, angDiff, SANS } from '../_glass.js'

const G = 'sim/cockpit2/gauges/indicators/', R = 'sim/cockpit2/radios/indicators/'
export const DEFAULTS = {
  heading:   `${G}heading_AHARS_deg_mag_pilot`,
  track:     `${G}ground_track_mag_pilot`,
  gs:        `${G}ground_speed_kt`,
  tas:       `${G}true_airspeed_kts_pilot`,
  wind_dir:  `${G}wind_heading_deg_mag`,
  wind_spd:  `${G}wind_speed_kts`,
  sel_hdg:   'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
  wpt_id:    `${R}gps_nav_id`,
  wpt_dist:  `${R}gps_dme_distance_nm`,
  wpt_brg:   `${R}gps_bearing_deg_mag`,
  range_nm:  'sim/cockpit2/EFIS/map_range_nm',
}

const WHITE = '#f2f2f2', MAGENTA = '#ff40ff', GREEN = '#2bff4a', CYAN = '#4fd8ff'

function _str(v) {                                       // base64 'data' dataref → text
  if (v == null) return ''
  try { const s = String(v); return atob(s.padEnd(s.length + (4 - s.length % 4) % 4, '=')).split('\0')[0].trim() } catch { return String(v) }
}

export class B738ND extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.heading !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) { text(ctx, 'MAP — NO DATA', w / 2, h / 2, Math.max(10, h * 0.04), '#ffb000'); return }
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, h * 0.036)
    const hdg = f('heading'), gs = f('gs')
    const trk = gs > 3 && Number.isFinite(f('track')) ? f('track') : hdg     // track up (heading when stopped)

    const cx = w / 2, cy = h * 0.86, Rr = Math.min(w * 0.47, h * 0.72)
    const range = f('range_nm') > 0 ? f('range_nm') : 40

    // compass arc (±60°)
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.lineWidth = Math.max(1, h * 0.003)
    ctx.beginPath(); ctx.arc(cx, cy, Rr, (-90 - 62) * Math.PI / 180, (-90 + 62) * Math.PI / 180); ctx.stroke()
    ctx.font = `${Math.max(7, lab).toFixed(1)}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let d = Math.ceil((trk - 60) / 5) * 5; d <= trk + 60; d += 5) {
      const a = (d - trk - 90) * Math.PI / 180, l = d % 10 === 0 ? Rr * 0.045 : Rr * 0.025
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr); ctx.lineTo(cx + Math.cos(a) * (Rr - l), cy + Math.sin(a) * (Rr - l)); ctx.stroke()
      if (d % 30 === 0) {
        const lbl = String(wrap360(d) / 10)
        ctx.save(); ctx.translate(cx + Math.cos(a) * (Rr - lab * 1.6), cy + Math.sin(a) * (Rr - lab * 1.6)); ctx.rotate(a + Math.PI / 2)
        ctx.fillText(lbl === '36' ? '0' : lbl, 0, 0); ctx.restore()
      }
    }
    // track line + half-range ring
    ctx.beginPath(); ctx.moveTo(cx, cy - Rr * 0.12); ctx.lineTo(cx, cy - Rr); ctx.stroke()
    ctx.setLineDash([Rr * 0.02, Rr * 0.03])
    ctx.beginPath(); ctx.arc(cx, cy, Rr / 2, (-90 - 62) * Math.PI / 180, (-90 + 62) * Math.PI / 180); ctx.stroke()
    ctx.setLineDash([])
    text(ctx, String(+(range / 2).toFixed(1)), cx - Rr * 0.47 * Math.sin(62 * Math.PI / 180) - lab, cy - Rr * 0.5 * Math.cos(62 * Math.PI / 180), lab * 0.9, WHITE)

    // heading pointer (heading relative to track) and heading bug
    if (Number.isFinite(hdg)) {
      const a = (angDiff(hdg, trk) - 90) * Math.PI / 180, s = lab * 0.5
      ctx.save(); ctx.translate(cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr); ctx.rotate(a + Math.PI / 2)
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s, -s * 1.6); ctx.lineTo(s, -s * 1.6); ctx.closePath(); ctx.stroke(); ctx.restore()
    }
    const sel = f('sel_hdg')
    if (Number.isFinite(sel)) {
      const a = (Math.max(-62, Math.min(62, angDiff(sel, trk))) - 90) * Math.PI / 180
      ctx.save(); ctx.translate(cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr); ctx.rotate(a + Math.PI / 2)
      ctx.strokeStyle = MAGENTA; ctx.lineWidth = 2; ctx.strokeRect(-lab * 0.45, 0, lab * 0.9, lab * 0.5); ctx.restore()
    }

    // active waypoint at its bearing / distance, with the active leg
    const id = _str(v.wpt_id), dist = f('wpt_dist'), brg = f('wpt_brg')
    if (id && Number.isFinite(dist) && Number.isFinite(brg)) {
      const rel = angDiff(brg, trk) * Math.PI / 180
      const rpx = Math.min(dist / range, 1.6) * Rr
      const px = cx + Math.sin(rel) * rpx, py = cy - Math.cos(rel) * rpx
      ctx.save()
      ctx.beginPath(); ctx.rect(0, 0, w, cy + lab); ctx.clip()
      ctx.strokeStyle = MAGENTA; ctx.lineWidth = Math.max(1.5, h * 0.004)
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke()
      if (dist <= range * 1.25) {                         // waypoint star + name
        const s = lab * 0.6
        ctx.beginPath()
        for (let k = 0; k < 8; k++) { const rr = k % 2 ? s * 0.35 : s, a = k * Math.PI / 4; ctx.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr) }
        ctx.closePath(); ctx.stroke()
        text(ctx, id, px + s * 1.4, py, lab, MAGENTA, 'left')
      }
      ctx.restore()
      text(ctx, id, w * 0.97, h * 0.045, lab * 1.15, MAGENTA, 'right')
      text(ctx, `${dist < 100 ? dist.toFixed(1) : Math.round(dist)} NM`, w * 0.97, h * 0.1, lab, WHITE, 'right')
      if (gs > 30) {
        const min = dist / gs * 60, hh = Math.floor(min / 60), mm = Math.round(min % 60)
        text(ctx, `${hh}:${String(mm).padStart(2, '0')}`, w * 0.97, h * 0.15, lab, WHITE, 'right')
      }
    }

    // top: GS / TAS, wind; track readout
    const tas = f('tas'), x0 = w * 0.03
    text(ctx, 'GS', x0, h * 0.045, lab * 0.8, WHITE, 'left')
    text(ctx, Number.isFinite(gs) ? String(Math.round(gs)) : '---', x0 + lab * 1.3, h * 0.045, lab * 1.05, WHITE, 'left')
    text(ctx, 'TAS', x0 + lab * 3.4, h * 0.045, lab * 0.8, WHITE, 'left')
    text(ctx, tas > 100 ? String(Math.round(tas)) : '---', x0 + lab * 5.2, h * 0.045, lab * 1.05, WHITE, 'left')
    const wd = f('wind_dir'), ws = f('wind_spd')
    if (ws > 1) {
      text(ctx, `${String(Math.round(wrap360(wd))).padStart(3, '0')}°/${Math.round(ws)}`, w * 0.03, h * 0.1, lab * 1.05, WHITE, 'left')
      const a = (angDiff(wd, trk) + 180 - 90) * Math.PI / 180, ax = w * 0.03 + lab * 1.5, ay = h * 0.17, L = lab * 1.2
      ctx.strokeStyle = WHITE; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(ax - Math.cos(a) * L, ay - Math.sin(a) * L); ctx.lineTo(ax + Math.cos(a) * L, ay + Math.sin(a) * L); ctx.stroke()
      ctx.beginPath(); ctx.arc(ax + Math.cos(a) * L, ay + Math.sin(a) * L, 2.5, 0, Math.PI * 2); ctx.fill()
    } else {
      text(ctx, '---°/---', w * 0.03, h * 0.1, lab * 1.05, WHITE, 'left')
    }
    text(ctx, 'TRK', cx - lab * 3.2, h * 0.045, lab * 0.95, GREEN, 'right')
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5
    ctx.strokeRect(cx - lab * 2.6, h * 0.045 - lab * 0.8, lab * 5.2, lab * 1.6)
    text(ctx, String(Math.round(wrap360(trk))).padStart(3, '0'), cx, h * 0.045, lab * 1.35, WHITE)
    text(ctx, 'MAG', cx + lab * 3.2, h * 0.045, lab * 0.95, GREEN, 'left')

    // aircraft symbol
    ctx.strokeStyle = WHITE; ctx.lineWidth = 2
    const s = lab * 0.9
    ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx - s * 0.6, cy + s * 0.6); ctx.lineTo(cx + s * 0.6, cy + s * 0.6); ctx.closePath(); ctx.stroke()
    text(ctx, `${range} NM`, w * 0.97, h * 0.96, lab * 0.85, CYAN, 'right')
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b738_nd',
  label:    '737 ND (Map)',
  icon:     '🧭',
  order:    2,
  datarefs: DEFAULTS,
  optionalDatarefs: ['range_nm', 'wind_dir', 'wind_spd', 'tas'],
}
