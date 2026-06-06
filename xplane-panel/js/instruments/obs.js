import { BaseInstrument } from './base.js'
import { writeDataref } from '../xplane-api.js'

const NAV_DREFS = [
  {
    obs:     'sim/cockpit2/radios/actuators/nav1_obs_deg_mag_pilot',
    hdef:    'sim/cockpit/radios/nav1_hdef_dot',
    fromto:  'sim/cockpit/radios/nav1_fromto',
    gs_flag: 'sim/cockpit/radios/nav1_flag_glideslope',
    vdef:    'sim/cockpit/radios/nav1_vdef_dot',
  },
  {
    obs:     'sim/cockpit2/radios/actuators/nav2_obs_deg_mag_pilot',
    hdef:    'sim/cockpit/radios/nav2_hdef_dot',
    fromto:  'sim/cockpit/radios/nav2_fromto',
    gs_flag: 'sim/cockpit/radios/nav2_flag_glideslope',
    vdef:    'sim/cockpit/radios/nav2_vdef_dot',
  },
]

export const DEFAULTS = {
  nav1_obs:     NAV_DREFS[0].obs,
  nav1_hdef:    NAV_DREFS[0].hdef,
  nav1_fromto:  NAV_DREFS[0].fromto,
  nav1_gs_flag: NAV_DREFS[0].gs_flag,
  nav1_vdef:    NAV_DREFS[0].vdef,
  nav2_obs:     NAV_DREFS[1].obs,
  nav2_hdef:    NAV_DREFS[1].hdef,
  nav2_fromto:  NAV_DREFS[1].fromto,
  nav2_gs_flag: NAV_DREFS[1].gs_flag,
  nav2_vdef:    NAV_DREFS[1].vdef,
}

const COMPASS_LABELS = ['N','3','6','E','12','15','S','21','24','W','30','33']

export class OBSGauge extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._resolvedIds = resolvedIds
    this._navIdx  = config.navIndex ?? 0
    const pfx     = this._navIdx === 0 ? 'nav1' : 'nav2'
    this._drefs   = { ...DEFAULTS, ...datarefs }
    this._k = {
      obs:    `${pfx}_obs`,
      hdef:   `${pfx}_hdef`,
      fromto: `${pfx}_fromto`,
      gsFlag: `${pfx}_gs_flag`,
      vdef:   `${pfx}_vdef`,
    }
    this._obs    = 0
    this._hdef   = 0
    this._vdef   = 0
    this._fromto = 0    // 0=off, 1=TO, 2=FROM
    this._gsFlag = 1    // 0=GS valid, 1=no GS
    this._hasData   = false
    this._dObs   = 0
    this._dHdef  = 0
    this._dVdef  = 0
    this._btnActive = null
    this._setupKnob()
  }

  setResolvedIds(ids) { this._resolvedIds = ids }
  requiredDatarefs() { return Object.values(this._drefs) }

  _setupKnob() {
    const c = this.canvas
    let _hold = null, _repeat = null

    const press = (dir) => {
      this._btnActive = dir > 0 ? 'inc' : 'dec'
      this._adjOBS(dir)
      _hold = setTimeout(() => {
        _repeat = setInterval(() => this._adjOBS(dir), 80)
      }, 400)
    }
    const release = () => {
      clearTimeout(_hold); clearInterval(_repeat)
      _hold = _repeat = null
      this._btnActive = null
      this._dirty = true
    }
    const zone = (px, py) => {
      if (py < this.h * 0.86) return 0
      return px < this.w * 0.33 ? -1 : px > this.w * 0.67 ? 1 : 0
    }

    c.addEventListener('pointerdown', e => {
      const r = c.getBoundingClientRect()
      const z = zone(e.clientX - r.left, e.clientY - r.top)
      if (z !== 0) { press(z); c.setPointerCapture(e.pointerId) }
    })
    c.addEventListener('pointerup',     release)
    c.addEventListener('pointercancel', release)
  }

  _adjOBS(delta) {
    this._obs = ((this._obs + delta) % 360 + 360) % 360
    this._dirty = true
    const id = this._resolvedIds[this._drefs[this._k.obs]]
    if (id != null) writeDataref(id, this._obs).catch(() => {})
  }

  update(state) {
    const obs    = state[this._drefs[this._k.obs]]
    const hdef   = state[this._drefs[this._k.hdef]]
    const fromto = state[this._drefs[this._k.fromto]]
    const gsFlag = state[this._drefs[this._k.gsFlag]]
    const vdef   = state[this._drefs[this._k.vdef]]

    if (obs    != null) { this._obs    = obs;    this._hasData = true }
    if (hdef   != null)   this._hdef   = hdef
    if (fromto != null)   this._fromto = fromto
    if (gsFlag != null)   this._gsFlag = gsFlag
    if (vdef   != null)   this._vdef   = vdef
    this._dirty = true
  }

  _render() {
    if (!this._hasData) { this._drawNoData(); return }

    this._dObs  = this._lerpAngle(this._dObs,  this._obs,  0.14)
    this._dHdef = this._lerp(this._dHdef, this._hdef, 0.10)
    this._dVdef = this._lerp(this._dVdef, this._vdef, 0.10)
    this._dirty = Math.abs(this._dObs - this._obs) > 0.05
              || Math.abs(this._dHdef - this._hdef) > 0.01
              || Math.abs(this._dVdef - this._vdef) > 0.01

    const { w, h } = this
    const cx = w / 2, cy = h / 2
    const R  = Math.min(w, h) * 0.44

    this._drawBezel()
    this._drawCompassFace(cx, cy, R)
    this._drawCDI(cx, cy, R)
    this._drawToFrom(cx, cy, R)
    this._drawGS(cx, cy, R)
    this._drawNavLabel(cx, cy, R)
    this._drawCap(cx, cy, R)
    this._drawControls()
  }

  _drawCompassFace(cx, cy, R) {
    const { ctx } = this
    const t = this._theme

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = t.dialFace
    ctx.fill()
    ctx.strokeStyle = t.dialRim
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.clip()

    // Rotating compass ring — selected OBS course rises to 12 o'clock
    ctx.translate(cx, cy)
    ctx.rotate(-this._dObs * Math.PI / 180)

    const fs    = Math.max(7, R * 0.11)
    const inner = R * 0.79
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < 12; i++) {
      const deg   = i * 30
      const angle = deg * Math.PI / 180 - Math.PI / 2
      const len   = R * 0.11
      ctx.strokeStyle = t.needle
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * inner,        Math.sin(angle) * inner)
      ctx.lineTo(Math.cos(angle) * (inner - len), Math.sin(angle) * (inner - len))
      ctx.stroke()
      const lr = inner + len * 0.82
      ctx.fillStyle = deg === 0 ? '#f44' : t.needle
      ctx.fillText(COMPASS_LABELS[i], Math.cos(angle) * lr, Math.sin(angle) * lr)
    }
    for (let deg = 0; deg < 360; deg += 10) {
      if (deg % 30 === 0) continue
      const angle = deg * Math.PI / 180 - Math.PI / 2
      ctx.strokeStyle = t.needle
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * inner,             Math.sin(angle) * inner)
      ctx.lineTo(Math.cos(angle) * (inner - R * 0.06), Math.sin(angle) * (inner - R * 0.06))
      ctx.stroke()
    }

    ctx.restore()

    // Fixed course pointer at 12 o'clock (does not rotate)
    ctx.save()
    ctx.translate(cx, cy)
    const pr = R * 0.79
    ctx.beginPath()
    ctx.moveTo(0,            -pr)
    ctx.lineTo(-R * 0.055,  -(pr - R * 0.13))
    ctx.lineTo( R * 0.055,  -(pr - R * 0.13))
    ctx.closePath()
    ctx.fillStyle = t.lubberColor
    ctx.fill()

    // Reciprocal pointer at 6 o'clock (open triangle)
    ctx.beginPath()
    ctx.moveTo(0,             pr)
    ctx.lineTo(-R * 0.055,   pr - R * 0.13)
    ctx.lineTo( R * 0.055,   pr - R * 0.13)
    ctx.closePath()
    ctx.strokeStyle = t.lubberColor
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }

  _drawCDI(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    const noSignal = this._fromto === 0
    const dotPx    = R * 0.13          // pixels per CDI dot
    const trackTop = cy - R * 0.55
    const trackBot = cy + R * 0.55

    ctx.save()

    // Center reference line (dashed, faint)
    ctx.strokeStyle = t.divider
    ctx.lineWidth = 1
    ctx.setLineDash([R * 0.04, R * 0.04])
    ctx.beginPath()
    ctx.moveTo(cx, trackTop); ctx.lineTo(cx, trackBot)
    ctx.stroke()
    ctx.setLineDash([])

    // Horizontal reference bar at center (aircraft position reference)
    ctx.strokeStyle = t.needle
    ctx.lineWidth = Math.max(1.5, R * 0.020)
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.06, cy); ctx.lineTo(cx + R * 0.06, cy)
    ctx.stroke()

    // Dot marks at ±1 and ±2 dots (circles on either side of center line)
    const dotR = R * 0.025
    for (const side of [-1, 1]) {
      for (const dots of [1, 2]) {
        ctx.beginPath()
        ctx.arc(cx + side * dots * dotPx, cy, dotR, 0, Math.PI * 2)
        ctx.fillStyle = t.needle
        ctx.fill()
      }
    }

    // CDI needle — pivots from top center, tip swings left/right at bottom
    const tipX = noSignal ? cx : cx + Math.max(-2.5, Math.min(2.5, this._dHdef)) * dotPx
    ctx.strokeStyle = noSignal ? t.alertColor : t.lubberColor
    ctx.lineWidth = Math.max(2, R * 0.030)
    ctx.lineCap = 'round'
    if (noSignal) ctx.setLineDash([R * 0.06, R * 0.06])
    ctx.beginPath()
    ctx.moveTo(cx, trackTop); ctx.lineTo(tipX, trackBot)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineCap = 'butt'

    ctx.restore()
  }

  _drawToFrom(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    const text  = this._fromto === 1 ? 'TO' : this._fromto === 2 ? 'FROM' : 'OFF'
    const color = this._fromto === 1 ? '#0c4' : this._fromto === 2 ? '#fa0' : t.alertColor

    const bw = R * 0.44, bh = R * 0.22
    const by = cy + R * 0.20

    ctx.save()
    ctx.fillStyle = t.digitalBg
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(cx - bw / 2, by, bw, bh, 3)
    else ctx.rect(cx - bw / 2, by, bw, bh)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = color
    ctx.font = `bold ${Math.max(8, R * 0.18)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cx, by + bh / 2)
    ctx.restore()
  }

  _drawGS(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    const gsValid = this._gsFlag === 0

    const gx     = cx + R * 0.63
    const dotPx  = R * 0.13
    const gsTop  = cy - dotPx * 2
    const gsBot  = cy + dotPx * 2

    ctx.save()

    // Scale track — always shown, 50% opacity
    ctx.globalAlpha = 0.50
    ctx.strokeStyle = t.needle
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(gx, gsTop); ctx.lineTo(gx, gsBot)
    ctx.stroke()

    // Dot marks at ±1 and ±2
    const dotR = R * 0.032
    for (const side of [-1, 1]) {
      for (const dots of [1, 2]) {
        ctx.beginPath()
        ctx.arc(gx, cy + side * dots * dotPx, dotR, 0, Math.PI * 2)
        ctx.fillStyle = t.needle
        ctx.fill()
      }
    }

    // GS needle — always tracks vdef; gsValid only changes color
    ctx.globalAlpha = 1
    const needleY = cy + Math.max(-2.5, Math.min(2.5, this._dVdef)) * dotPx
    const hw = R * 0.22
    ctx.strokeStyle = gsValid ? '#0c4' : t.needle
    ctx.lineWidth = Math.max(3, R * 0.040)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(gx - hw, needleY); ctx.lineTo(gx + hw, needleY)
    ctx.stroke()
    ctx.lineCap = 'butt'

    ctx.fillStyle = t.labelDim
    ctx.font = `${Math.max(6, R * 0.10)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('GS', gx, gsBot + R * 0.04)

    ctx.restore()
  }

  _drawNavLabel(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.fillStyle = t.labelDim
    ctx.font = `${Math.max(7, R * 0.12)}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`NAV ${this._navIdx + 1}`, cx - R + R * 0.08, cy - R + R * 0.10)
    ctx.restore()
  }

  _drawCap(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.045, 0, Math.PI * 2)
    ctx.fillStyle = t.capFill
    ctx.fill()
    ctx.strokeStyle = t.capStroke
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  _drawControls() {
    const { ctx, w, h } = this
    const t  = this._theme
    const sh = Math.max(30, h * 0.14)
    const sy = h - sh

    ctx.save()
    ctx.fillStyle = '#000a'
    ctx.fillRect(0, sy, w, sh)
    ctx.strokeStyle = t.divider
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke()

    const mid = sy + sh * 0.5
    const fs  = Math.max(13, sh * 0.56)

    ctx.fillStyle = this._btnActive === 'dec' ? t.accent + '33' : '#ffffff12'
    ctx.fillRect(1, sy + 1, w * 0.33 - 2, sh - 2)
    ctx.fillStyle = this._btnActive === 'dec' ? t.accent : t.accentDim
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('◄', w * 0.165, mid)

    ctx.fillStyle = this._btnActive === 'inc' ? t.accent + '33' : '#ffffff12'
    ctx.fillRect(w * 0.67 + 1, sy + 1, w * 0.33 - 2, sh - 2)
    ctx.fillStyle = this._btnActive === 'inc' ? t.accent : t.accentDim
    ctx.fillText('►', w * 0.835, mid)

    const obs = Math.round(((this._obs % 360) + 360) % 360)
    ctx.fillStyle = t.accent
    ctx.font = `${Math.max(9, sh * 0.40)}px monospace`
    ctx.fillText(`OBS ${String(obs).padStart(3, '0')}°`, w * 0.5, mid)
    ctx.restore()
  }

  _lerpAngle(current, target, factor) {
    let diff = target - current
    while (diff >  180) diff -= 360
    while (diff < -180) diff += 360
    return current + diff * factor
  }
}
