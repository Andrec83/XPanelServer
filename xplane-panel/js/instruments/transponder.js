import { BaseInstrument } from './base.js'
import { writeDataref, triggerCommand } from '../xplane-api.js'

export const DEFAULTS = {
  code:  'sim/cockpit/radios/transponder_code',
  mode:  'sim/cockpit/radios/transponder_mode',
  ident: 'sim/cockpit/radios/transponder_id',
}

const MODES = [
  { v: 0, label: 'OFF',  color: '#555' },
  { v: 1, label: 'STBY', color: '#4af' },
  { v: 2, label: 'ON',   color: '#4af' },
  { v: 3, label: 'ALT',  color: '#4f8' },
  { v: 4, label: 'TEST', color: '#fa0' },
]

export class Transponder extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs       = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds
    this._code        = 1200
    this._mode        = 1
    this._ident       = 0
    this._hasData     = false
    this._identFlash  = 0
    this._setupControls()
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    const c = state[this._drefs.code]
    const m = state[this._drefs.mode]
    const i = state[this._drefs.ident]
    if (c != null) { this._code = c; this._hasData = true }
    if (m != null)   this._mode  = m
    if (i != null)   this._ident = i
    this._dirty = true
  }

  _digits() {
    const c = Math.max(0, Math.min(7777, this._code))
    return [
      Math.floor(c / 1000) % 10,
      Math.floor(c / 100)  % 10,
      Math.floor(c / 10)   % 10,
      c % 10,
    ]
  }

  _adjustDigit(idx, delta) {
    const d = this._digits()
    d[idx] = (d[idx] + delta + 8) % 8
    this._code = d[0]*1000 + d[1]*100 + d[2]*10 + d[3]
    this._dirty = true
    const id = this._resolvedIds[this._drefs.code]
    if (id != null) writeDataref(id, this._code).catch(() => {})
  }

  _setMode(modeVal) {
    this._mode  = modeVal
    this._dirty = true
    const id = this._resolvedIds[this._drefs.mode]
    if (id != null) writeDataref(id, modeVal).catch(() => {})
  }

  _triggerIdent() {
    triggerCommand('sim/transponder/transponder_ident')
      .catch(() => triggerCommand('sim/radios/transponder_ident').catch(() => {}))
    this._identFlash = Date.now()
    this._dirty = true
  }

  _setupControls() {
    const c = this.canvas
    c.addEventListener('pointerdown', e => {
      const r  = c.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top
      const w  = this.w, h = this.h

      const digitIdx = Math.min(3, Math.floor(px / (w / 4)))

      if (py >= h * 0.10 && py < h * 0.34) {
        this._adjustDigit(digitIdx, +1)
      } else if (py >= h * 0.58 && py < h * 0.76) {
        this._adjustDigit(digitIdx, -1)
      } else if (py >= h * 0.76 && py < h * 0.88) {
        const mi = Math.min(MODES.length - 1, Math.floor(px / (w / MODES.length)))
        this._setMode(MODES[mi].v)
      } else if (py >= h * 0.88) {
        this._triggerIdent()
      }
    })
  }

  _render() {
    if (!this._hasData) { this._drawNoData(); return }
    const { ctx, w, h } = this
    const t = this._theme

    const identActive = this._ident === 1
    const identFlashing = (Date.now() - this._identFlash) < 2000
    if (identActive || identFlashing) this._dirty = true

    ctx.fillStyle = t.panelBg
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = t.divider; ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

    this._drawHeader(identActive || identFlashing)
    this._drawDigits()
    this._drawModeRow()
    this._drawIdentBtn(identActive || identFlashing)
  }

  _drawHeader(identActive) {
    const { ctx, w, h } = this
    const t = this._theme
    const fs = Math.max(8, h * 0.07)
    ctx.font = `${fs}px sans-serif`
    ctx.textBaseline = 'top'

    ctx.fillStyle = t.labelDim
    ctx.textAlign = 'left'
    ctx.fillText('XPNDR', w * 0.04, h * 0.02)

    const mDef  = MODES.find(m => m.v === this._mode)
    const label = mDef?.label ?? `M${this._mode}`
    const color = mDef?.color ?? t.accent
    ctx.fillStyle = identActive ? '#fa0' : color
    ctx.textAlign = 'right'
    ctx.fillText(label, w * 0.96, h * 0.02)
  }

  _drawDigits() {
    const { ctx, w, h } = this
    const t = this._theme
    const digits = this._digits()
    const dw = w / 4

    for (let i = 0; i < 4; i++) {
      const cx = dw * i + dw / 2

      ctx.fillStyle = '#ffffff0a'
      ctx.fillRect(dw * i + 1, h * 0.10, dw - 2, h * 0.24)
      ctx.fillStyle = t.accentDim
      ctx.font = `${Math.max(10, h * 0.11)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('▲', cx, h * 0.22)

      ctx.fillStyle = '#3d3'
      ctx.font = `bold ${Math.max(20, h * 0.27)}px monospace`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(digits[i]), cx, h * 0.455)

      ctx.fillStyle = '#ffffff0a'
      ctx.fillRect(dw * i + 1, h * 0.58, dw - 2, h * 0.18)
      ctx.fillStyle = t.accentDim
      ctx.font = `${Math.max(10, h * 0.11)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('▼', cx, h * 0.67)
    }

    ctx.strokeStyle = t.divider; ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(dw * i, h * 0.08)
      ctx.lineTo(dw * i, h * 0.76)
      ctx.stroke()
    }
  }

  _drawModeRow() {
    const { ctx, w, h } = this
    const mw = w / MODES.length
    const sy = h * 0.76, sh = h * 0.12
    const fs = Math.max(7, sh * 0.52)

    ctx.font = `${fs}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    for (let i = 0; i < MODES.length; i++) {
      const m  = MODES[i]
      const mx = mw * i
      const active = this._mode === m.v

      ctx.fillStyle = active ? m.color + '33' : '#ffffff0a'
      ctx.fillRect(mx + 1, sy + 1, mw - 2, sh - 2)
      ctx.fillStyle = active ? m.color : '#444'
      ctx.fillText(m.label, mx + mw / 2, sy + sh / 2)

      if (active) {
        ctx.fillStyle = m.color
        ctx.fillRect(mx + 2, sy + sh - 2, mw - 4, 2)
      }
    }
  }

  _drawIdentBtn(active) {
    const { ctx, w, h } = this
    const sy = h * 0.88, sh = h - sy
    const bx = w * 0.15, bw = w * 0.70

    ctx.fillStyle = active ? '#f904' : '#ffffff0a'
    ctx.fillRect(bx, sy + 1, bw, sh - 2)
    ctx.strokeStyle = active ? '#f90' : this._theme.divider
    ctx.lineWidth = 1
    ctx.strokeRect(bx, sy + 1, bw, sh - 2)

    ctx.fillStyle = active ? '#fa0' : this._theme.labelDim
    ctx.font = `bold ${Math.max(9, sh * 0.55)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(active ? '● IDENT' : 'IDENT', w / 2, sy + sh / 2)
  }
}
