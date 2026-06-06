import { BaseInstrument } from './base.js'
import { writeDataref } from '../xplane-api.js'

export const DEFAULTS = {
  heading_deg: 'sim/cockpit2/gauges/indicators/heading_electric_deg_mag_pilot',
  bug_deg:     'sim/cockpit/autopilot/heading_mag',
}

export class HeadingIndicator extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds
    this._heading  = 0
    this._bug      = 0
    this._dHeading = 0
    this._dBug     = 0
    this._hasData  = false
    this._btnActive = null
    this._syncFlash = 0
    this._setupPointer()
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    const h = state[this._drefs.heading_deg]
    const b = state[this._drefs.bug_deg]
    if (h != null) { this._heading = h; this._hasData = true }
    if (b != null)   this._bug    = b
    this._dirty = true
  }

  setResolvedIds(ids) { this._resolvedIds = ids }

  _setupPointer() {
    const c = this.canvas
    let _hold = null, _repeat = null

    const releaseBtn = () => {
      clearTimeout(_hold); clearInterval(_repeat)
      _hold = _repeat = null
      this._btnActive = null
      this._dirty = true
    }

    const pressBtn = (zone) => {
      this._btnActive = zone
      if      (zone === 'dec')  this._adjBug(-1)
      else if (zone === 'inc')  this._adjBug( 1)
      else if (zone === 'sync') this._syncGyro()
      if (zone === 'dec' || zone === 'inc') {
        const dir = zone === 'dec' ? -1 : 1
        _hold = setTimeout(() => {
          _repeat = setInterval(() => this._adjBug(dir), 80)
        }, 400)
      }
      this._dirty = true
    }

    const btnZone = (px, py, ch, cw) => {
      if (py < ch * 0.85) return null
      const q = cw / 4
      if (px < q)       return 'dec'
      if (px < q * 2)   return null
      if (px < q * 3)   return 'inc'
      return 'sync'
    }

    c.addEventListener('pointerdown', e => {
      const r = c.getBoundingClientRect()
      const z = btnZone(e.clientX - r.left, e.clientY - r.top, r.height, r.width)
      if (z !== null) {
        pressBtn(z)
        c.setPointerCapture(e.pointerId)
      }
    })

    c.addEventListener('pointerup',     () => releaseBtn())
    c.addEventListener('pointercancel', () => releaseBtn())
  }

  _adjBug(delta) {
    this._bug = ((this._bug + delta) % 360 + 360) % 360
    this._dirty = true
    const id = this._resolvedIds[this._drefs.bug_deg]
    if (id != null) writeDataref(id, this._bug).catch(() => {})
  }

  _syncGyro() {
    const heading = this._heading
    this._bug = heading
    const id = this._resolvedIds[this._drefs.bug_deg]
    if (id != null) writeDataref(id, heading).catch(() => {})
    this._syncFlash = Date.now()
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._dHeading = this._lerp(this._dHeading, this._heading, 0.08)
    this._dBug     = this._lerpAngle(this._dBug, this._bug, 0.08)
    this._dirty    = Math.abs(this._dHeading - this._heading) > 0.02
                  || Math.abs(this._dBug - this._bug) > 0.02

    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44
    this._drawBezel()
    this._drawCompassCard(cx, cy, R, this._dHeading)
    this._drawBug(cx, cy, R, this._dBug, this._dHeading)
    this._drawLubberLine(cx, cy, R)
    this._drawDigital(cx, cy, R, this._heading)
    this._drawCentreCap(cx, cy, R)
    this._drawBugControls()
  }

  _drawBugControls() {
    const { ctx, w, h } = this
    const t = this._theme
    const sy = h * 0.85
    const sh = h - sy

    ctx.save()
    ctx.fillStyle = '#000a'
    ctx.fillRect(0, sy, w, sh)
    ctx.strokeStyle = t.divider
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke()

    const qw  = w / 4
    const mid = sy + sh * 0.5
    const fs  = Math.max(13, sh * 0.54)

    ctx.fillStyle = this._btnActive === 'dec' ? t.accent + '33' : '#ffffff12'
    ctx.fillRect(1, sy + 1, qw - 2, sh - 2)
    ctx.fillStyle = this._btnActive === 'dec' ? t.accent : t.accentDim
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('◄', qw * 0.5, mid)

    ctx.fillStyle = t.accent
    ctx.font = `${Math.max(8, sh * 0.38)}px monospace`
    ctx.fillText('BUG ' + String(Math.round(((this._bug % 360) + 360) % 360)).padStart(3,'0') + '°', qw * 1.5, mid)

    ctx.fillStyle = this._btnActive === 'inc' ? t.accent + '33' : '#ffffff12'
    ctx.fillRect(qw * 2 + 1, sy + 1, qw - 2, sh - 2)
    ctx.fillStyle = this._btnActive === 'inc' ? t.accent : t.accentDim
    ctx.font = `bold ${fs}px sans-serif`
    ctx.fillText('►', qw * 2.5, mid)

    const synced = this._syncFlash && (Date.now() - this._syncFlash) < 600
    ctx.fillStyle = (this._btnActive === 'sync' || synced) ? t.accent + '33' : '#ffffff12'
    ctx.fillRect(qw * 3 + 1, sy + 1, qw - 2, sh - 2)
    ctx.fillStyle = (this._btnActive === 'sync' || synced) ? t.accent : t.labelDim
    ctx.font = `${Math.max(9, sh * 0.38)}px sans-serif`
    ctx.fillText('⟳ SYNC', qw * 3.5, mid)

    if (synced) this._dirty = true
    ctx.restore()
  }

  _drawCompassCard(cx, cy, R, heading) {
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

    ctx.translate(cx, cy)
    ctx.rotate(-heading * Math.PI / 180)

    const CARDINALS = ['N','NE','E','SE','S','SW','W','NW']
    const fs = Math.max(7, R * 0.13)
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let deg = 0; deg < 360; deg += 5) {
      const angle = deg * Math.PI / 180 - Math.PI / 2
      const isMajor = deg % 30 === 0
      const is10    = deg % 10 === 0
      const len = isMajor ? R * 0.14 : is10 ? R * 0.1 : R * 0.06
      ctx.strokeStyle = t.needle
      ctx.lineWidth = isMajor ? 2 : 1
      const inner = R * 0.82
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * inner,        Math.sin(angle) * inner)
      ctx.lineTo(Math.cos(angle) * (inner - len), Math.sin(angle) * (inner - len))
      ctx.stroke()

      if (isMajor) {
        const lr = inner - len - R * 0.11
        const idx = deg / 45
        if (Number.isInteger(idx) && CARDINALS[idx]) {
          ctx.fillStyle = deg === 0 ? '#f44' : t.needle
          ctx.fillText(CARDINALS[idx], Math.cos(angle) * lr, Math.sin(angle) * lr)
        } else {
          ctx.fillStyle = t.needle
          ctx.fillText(String(deg / 10), Math.cos(angle) * lr, Math.sin(angle) * lr)
        }
      }
    }
    ctx.restore()
  }

  _drawBug(cx, cy, R, bug, heading) {
    const { ctx } = this
    const relAngle = (bug - heading) * Math.PI / 180
    ctx.save()
    ctx.translate(cx, cy)
    const br = R * 0.82
    ctx.rotate(relAngle)
    ctx.beginPath()
    ctx.moveTo(0, -br)
    ctx.lineTo(-R * 0.06, -(br - R * 0.12))
    ctx.lineTo(-R * 0.06, -(br - R * 0.22))
    ctx.lineTo( R * 0.06, -(br - R * 0.22))
    ctx.lineTo( R * 0.06, -(br - R * 0.12))
    ctx.closePath()
    ctx.fillStyle = this._theme.bugColor
    ctx.fill()
    ctx.restore()
  }

  _drawLubberLine(cx, cy, R) {
    const { ctx } = this
    ctx.save()
    ctx.translate(cx, cy)
    ctx.beginPath()
    ctx.moveTo(0, -R * 0.78)
    ctx.lineTo(-R * 0.05, -R * 0.88)
    ctx.lineTo( R * 0.05, -R * 0.88)
    ctx.closePath()
    ctx.fillStyle = this._theme.lubberColor
    ctx.fill()
    ctx.restore()
  }

  _drawDigital(cx, cy, R, heading) {
    const { ctx } = this
    const t = this._theme
    const bx = cx, by = cy + R * 0.25
    const bw = R * 0.55, bh = R * 0.22
    ctx.save()
    ctx.fillStyle = t.digitalBg
    ctx.strokeStyle = t.digitalBorder
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect
      ? ctx.roundRect(bx - bw/2, by - bh/2, bw, bh, 3)
      : ctx.rect(bx - bw/2, by - bh/2, bw, bh)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = t.accent
    ctx.font = `${Math.max(6, R * 0.2)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(Math.round(((heading % 360) + 360) % 360)).padStart(3, '0'), bx, by)
    ctx.restore()
  }

  _drawCentreCap(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.06, 0, Math.PI * 2)
    ctx.fillStyle = t.capFill
    ctx.fill()
    ctx.strokeStyle = t.capStroke
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  _lerpAngle(current, target, factor) {
    let diff = target - current
    while (diff >  180) diff -= 360
    while (diff < -180) diff += 360
    return current + diff * factor
  }
}
