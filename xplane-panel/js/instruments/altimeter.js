import { BaseInstrument } from './base.js'
import { writeDataref } from '../xplane-api.js'

export const DEFAULTS = {
  altitude_ft:  'sim/cockpit2/gauges/indicators/altitude_ft_pilot',
  baro_setting: 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
}

export class Altimeter extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds
    this._alt  = 0
    this._baro = 29.92
    this._displayAlt = 0
    this._hasData = false
    this._setupBaroKnob()
  }

  setResolvedIds(ids) { this._resolvedIds = ids }

  _setupBaroKnob() {
    const c = this.canvas
    this._baroActive = null
    let _hold = null, _repeat = null

    const press = (dir) => {
      this._baroActive = dir > 0 ? 'inc' : 'dec'
      this._adjustBaro(dir * 0.01)
      _hold = setTimeout(() => {
        _repeat = setInterval(() => this._adjustBaro(dir * 0.01), 80)
      }, 400)
    }
    const release = () => {
      clearTimeout(_hold); clearInterval(_repeat)
      _hold = _repeat = null
      this._baroActive = null
      this._dirty = true
    }
    const zone = (px, py) => {
      if (py < this.h * 0.85) return 0
      if (px < this.w * 0.33) return -1
      if (px > this.w * 0.67) return  1
      return 0
    }

    c.addEventListener('pointerdown', e => {
      const r = c.getBoundingClientRect()
      const z = zone(e.clientX - r.left, e.clientY - r.top)
      if (z !== 0) { press(z); c.setPointerCapture(e.pointerId) }
    })
    c.addEventListener('pointerup',     release)
    c.addEventListener('pointercancel', release)
  }

  _adjustBaro(delta) {
    this._baro = Math.max(27.00, Math.min(31.50, this._baro + delta))
    this._baro = Math.round(this._baro * 100) / 100
    this._writeBaro()
    this._dirty = true
  }

  _writeBaro() {
    const id = this._resolvedIds[this._drefs.baro_setting]
    if (id != null) writeDataref(id, this._baro).catch(() => {})
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    const a = state[this._drefs.altitude_ft]
    const b = state[this._drefs.baro_setting]
    if (a != null) { this._alt = a; this._hasData = true }
    if (b != null)   this._baro = b
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }
    this._displayAlt = this._lerp(this._displayAlt, this._alt, 0.08)
    this._dirty = Math.abs(this._displayAlt - this._alt) > 0.5
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44
    this._drawBezel()
    this._drawFace(cx, cy, R)
    this._drawKollsman(cx, cy, R)
    this._drawNeedles(cx, cy, R, this._displayAlt)
    this._drawCentreCap(cx, cy, R)
    this._drawBaroControls()
  }

  _drawBaroControls() {
    const { ctx, w, h } = this
    const t = this._theme
    const sh = Math.max(30, h * 0.14)
    const sy = h - sh

    ctx.save()
    ctx.fillStyle = '#000a'
    ctx.fillRect(0, sy, w, sh)
    ctx.strokeStyle = t.divider
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke()

    const mid = sy + sh * 0.5
    const fs  = Math.max(14, sh * 0.56)

    ctx.fillStyle = this._baroActive === 'dec' ? t.accent + '33' : '#ffffff12'
    ctx.fillRect(1, sy + 1, w * 0.33 - 2, sh - 2)
    ctx.fillStyle = this._baroActive === 'dec' ? t.accent : t.accentDim
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('−', w * 0.165, mid)

    ctx.fillStyle = this._baroActive === 'inc' ? t.accent + '33' : '#ffffff12'
    ctx.fillRect(w * 0.67 + 1, sy + 1, w * 0.33 - 2, sh - 2)
    ctx.fillStyle = this._baroActive === 'inc' ? t.accent : t.accentDim
    ctx.fillText('+', w * 0.835, mid)

    ctx.fillStyle = t.accent
    ctx.font = `${Math.max(9, sh * 0.40)}px monospace`
    ctx.fillText(this._baro.toFixed(2) + ' inHg', w * 0.5, mid)
    ctx.restore()
  }

  _drawFace(cx, cy, R) {
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

    ctx.strokeStyle = t.needle
    ctx.fillStyle   = t.needle
    const fs = Math.max(8, R * 0.13)
    ctx.font = `${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
      ctx.lineWidth = 2
      ctx.beginPath()
      const inner = R * 0.78
      const len   = R * 0.12
      ctx.moveTo(cx + Math.cos(angle) * inner,        cy + Math.sin(angle) * inner)
      ctx.lineTo(cx + Math.cos(angle) * (inner - len), cy + Math.sin(angle) * (inner - len))
      ctx.stroke()
      for (let j = 1; j < 5; j++) {
        const sa = ((i + j / 5) / 10) * Math.PI * 2 - Math.PI / 2
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(sa) * inner,             cy + Math.sin(sa) * inner)
        ctx.lineTo(cx + Math.cos(sa) * (inner - R * 0.07), cy + Math.sin(sa) * (inner - R * 0.07))
        ctx.stroke()
      }
      const lr = inner - len - R * 0.1
      ctx.fillText(String(i), cx + Math.cos(angle) * lr, cy + Math.sin(angle) * lr)
    }
    ctx.restore()
  }

  _drawKollsman(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    const wx = cx + R * 0.35, wy = cy
    const ww = R * 0.45, wh = R * 0.22
    ctx.save()
    ctx.fillStyle = t.digitalBg
    ctx.strokeStyle = t.digitalBorder
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect
      ? ctx.roundRect(wx - ww/2, wy - wh/2, ww, wh, 3)
      : ctx.rect(wx - ww/2, wy - wh/2, ww, wh)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = t.accent
    ctx.font = `${Math.max(8, R * 0.14)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this._baro.toFixed(2), wx, wy)
    ctx.fillStyle = t.labelDim
    ctx.font = `${Math.max(6, R * 0.1)}px sans-serif`
    ctx.fillText('inHg', wx, wy + R * 0.13)
    ctx.restore()
  }

  _drawNeedles(cx, cy, R, alt) {
    const { ctx } = this
    const t = this._theme

    const a10k = (alt / 100000 % 1)                    * Math.PI * 2 - Math.PI / 2
    const a1k  = (alt /  10000 % 1)                    * Math.PI * 2 - Math.PI / 2
    const a100 = (((alt % 1000) + 1000) % 1000 / 1000) * Math.PI * 2 - Math.PI / 2

    ctx.save()
    ctx.translate(cx, cy); ctx.rotate(a10k)
    ctx.fillStyle = t.needle
    ctx.beginPath()
    ctx.moveTo(-R * 0.10, -R * 0.012)
    ctx.lineTo( R * 0.62, -R * 0.012)
    ctx.lineTo( R * 0.62,  R * 0.012)
    ctx.lineTo(-R * 0.10,  R * 0.012)
    ctx.closePath(); ctx.fill()
    ctx.beginPath()
    ctx.moveTo(R * 0.58,  0)
    ctx.lineTo(R * 0.72, -R * 0.030)
    ctx.lineTo(R * 0.72,  R * 0.030)
    ctx.closePath(); ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.translate(cx, cy); ctx.rotate(a1k)
    ctx.beginPath()
    ctx.moveTo(-R * 0.10, 0)
    ctx.lineTo(R * 0.52, -R * 0.045)
    ctx.lineTo(R * 0.57,  0)
    ctx.lineTo(R * 0.52,  R * 0.045)
    ctx.closePath()
    ctx.fillStyle = t.accentDim; ctx.fill()
    ctx.beginPath()
    ctx.moveTo(R * 0.42, -R * 0.038)
    ctx.lineTo(R * 0.52, -R * 0.045)
    ctx.lineTo(R * 0.57,  0)
    ctx.lineTo(R * 0.52,  R * 0.045)
    ctx.lineTo(R * 0.42,  R * 0.038)
    ctx.closePath()
    ctx.fillStyle = '#fa0'; ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.translate(cx, cy); ctx.rotate(a100)
    ctx.beginPath()
    ctx.moveTo(-R * 0.12,  0)
    ctx.lineTo( R * 0.68, -R * 0.045)
    ctx.lineTo( R * 0.73,  0)
    ctx.lineTo( R * 0.68,  R * 0.045)
    ctx.closePath()
    ctx.fillStyle = t.needle; ctx.fill()
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
}
