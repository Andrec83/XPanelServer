import { BaseInstrument } from './base.js'
import { triggerCommand } from '../xplane-api.js'

export const DEFAULTS = {
  flap_handle: 'sim/cockpit2/controls/flap_handle_deploy_ratio',
  flap_actual: 'sim/flightmodel2/controls/flap1_deploy_ratio',
}

export class FlapsIndicator extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs       = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds
    this._handle  = 0
    this._actual  = 0
    this._dActual = 0
    this._hasData = false
    this._btnActive = null
    this._notches = config.notches || [0, 0.5, 1.0]
    this._setupControls()
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  setAircraftProfile(profile) { this.setNotches(profile.flapNotches) }

  setNotches(notches) {
    this._notches = notches
    this._dirty   = true
  }

  update(state) {
    const h = state[this._drefs.flap_handle]
    const a = state[this._drefs.flap_actual]
    if (h != null) { this._handle = h; this._hasData = true }
    if (a != null)   this._actual = a
    this._dirty = true
  }

  _setupControls() {
    const c = this.canvas
    let _hold = null, _rep = null
    const press = dir => {
      this._btnActive = dir > 0 ? 'dn' : 'up'
      this._step(dir)
      _hold = setTimeout(() => { _rep = setInterval(() => this._step(dir), 150) }, 400)
    }
    const release = () => {
      clearTimeout(_hold); clearInterval(_rep)
      this._btnActive = null; this._dirty = true
    }
    c.addEventListener('pointerdown', e => {
      const r = c.getBoundingClientRect()
      if (e.clientY - r.top < this.h * 0.85) return
      press((e.clientX - r.left) < this.w / 2 ? -1 : 1)
      c.setPointerCapture(e.pointerId)
    })
    c.addEventListener('pointerup',     release)
    c.addEventListener('pointercancel', release)
  }

  _step(dir) {
    const cmd = dir > 0
      ? 'sim/flight_controls/flaps_down'
      : 'sim/flight_controls/flaps_up'
    triggerCommand(cmd).catch(e => console.warn('[flaps]', e.message))
  }

  _render() {
    if (!this._hasData) { this._drawNoData(); return }
    this._dActual = this._lerp(this._dActual, this._actual, 0.08)
    this._dirty   = Math.abs(this._dActual - this._actual) > 0.001
    this._drawBezel()
    this._drawBar()
    this._drawControls()
  }

  _drawBar() {
    const { ctx, w, h } = this
    const t = this._theme
    const ah = h * 0.84
    const cx = w / 2

    ctx.fillStyle = t.labelDim
    ctx.font = `${Math.max(8, w * 0.08)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('FLAPS', cx, 4)

    const trackW = Math.max(16, w * 0.20)
    const tx  = cx - trackW / 2
    const ty  = ah * 0.12
    const tb  = ah * 0.86
    const th  = tb - ty
    const ry  = r => ty + r * th

    for (const [from, to, color] of [[0, 0.5, '#0c4'], [0.5, 0.75, '#fa0'], [0.75, 1.0, '#f33']]) {
      ctx.fillStyle = color + '22'
      ctx.fillRect(tx, ry(from), trackW, ry(to) - ry(from))
    }
    ctx.strokeStyle = t.dialRim; ctx.lineWidth = 1
    ctx.strokeRect(tx, ty, trackW, th)

    const fillY = ry(this._dActual)
    for (const [from, to, color] of [[0, 0.5, '#0c4'], [0.5, 0.75, '#fa0'], [0.75, 1.0, '#f33']]) {
      const y1 = ry(from), y2 = Math.min(ry(to), fillY)
      if (y2 <= y1) continue
      ctx.fillStyle = color
      ctx.fillRect(tx + 1, y1, trackW - 2, y2 - y1)
    }

    const fs = Math.max(8, Math.min(11, w * 0.09))
    ctx.font = `${fs}px sans-serif`
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillStyle = t.needle; ctx.strokeStyle = t.labelDim; ctx.lineWidth = 1
    for (let i = 0; i < this._notches.length; i++) {
      const y = ry(this._notches[i])
      ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx + trackW, y); ctx.stroke()
      ctx.fillText(this._label(i), tx - 5, y)
    }

    const hy = ry(this._handle)
    ctx.strokeStyle = t.bugColor; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(tx - 12, hy); ctx.lineTo(tx + trackW + 12, hy); ctx.stroke()
    ctx.fillStyle = t.bugColor
    for (const [ax, dir] of [[tx - 12, -1], [tx + trackW + 12, 1]]) {
      ctx.beginPath()
      ctx.moveTo(ax, hy)
      ctx.lineTo(ax + dir * 8, hy - 4)
      ctx.lineTo(ax + dir * 8, hy + 4)
      ctx.closePath(); ctx.fill()
    }

    const bx = cx, by = tb + (ah - tb) * 0.52
    const bw = w * 0.52, bh = Math.max(14, Math.min(22, (ah - tb) * 0.75))
    ctx.fillStyle = t.digitalBg; ctx.strokeStyle = t.digitalBorder; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(bx - bw/2, by - bh/2, bw, bh, 3) : ctx.rect(bx - bw/2, by - bh/2, bw, bh)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = t.accent
    ctx.font = `bold ${Math.max(9, bh * 0.62)}px monospace`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(Math.round(this._actual * 100) + '%', bx, by)
  }

  _label(i) {
    const r = this._notches[i]
    if (r < 0.01) return 'UP'
    if (r > 0.99) return 'FULL'
    return Math.round(r * 100) + '%'
  }

  _drawControls() {
    const { ctx, w, h } = this
    const t = this._theme
    const sh = Math.max(30, h * 0.14), sy = h - sh
    ctx.save()
    ctx.fillStyle = '#000a'; ctx.fillRect(0, sy, w, sh)
    ctx.strokeStyle = t.divider; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke()
    const mid = sy + sh * 0.5, fs = Math.max(13, sh * 0.54)
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = this._btnActive === 'up' ? t.accent + '33' : '#ffffff12'
    ctx.fillRect(1, sy + 1, w / 2 - 2, sh - 2)
    ctx.fillStyle = this._btnActive === 'up' ? t.accent : t.accentDim
    ctx.fillText('▲ UP', w * 0.25, mid)
    ctx.fillStyle = this._btnActive === 'dn' ? t.accent + '33' : '#ffffff12'
    ctx.fillRect(w / 2 + 1, sy + 1, w / 2 - 2, sh - 2)
    ctx.fillStyle = this._btnActive === 'dn' ? t.accent : t.accentDim
    ctx.fillText('DN ▼', w * 0.75, mid)
    ctx.restore()
  }
}
