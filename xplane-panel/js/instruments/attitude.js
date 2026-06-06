import { BaseInstrument } from './base.js'

export const DEFAULTS = {
  pitch_deg: 'sim/flightmodel/position/theta',
  roll_deg:  'sim/flightmodel/position/phi',
  slip_deg:  'sim/cockpit2/gauges/indicators/slip_deg',
}

export class AttitudeIndicator extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._pitch = 0; this._roll = 0; this._slip = 0
    this._dPitch = 0; this._dRoll = 0; this._dSlip = 0
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    const p = state[this._drefs.pitch_deg]
    const r = state[this._drefs.roll_deg]
    const s = state[this._drefs.slip_deg]
    if (p != null) { this._pitch = p; this._hasData = true }
    if (r != null)   this._roll  = r
    if (s != null)   this._slip  = s
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._dPitch = this._lerp(this._dPitch, this._pitch, 0.08)
    this._dRoll  = this._lerp(this._dRoll,  this._roll,  0.08)
    this._dSlip  = this._lerp(this._dSlip,  this._slip,  0.08)
    this._dirty  = Math.abs(this._dPitch - this._pitch) > 0.02
                || Math.abs(this._dRoll  - this._roll)  > 0.02

    const cx = w / 2, cy = h / 2
    const R  = Math.min(w, h) * 0.44
    const PX = R / 25
    const horizonY = this._dPitch * PX

    this._drawBezel()

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.clip()

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-this._dRoll * Math.PI / 180)

    ctx.fillStyle = this._theme.sky
    ctx.fillRect(-w, -h, w * 2, h + horizonY)
    ctx.fillStyle = this._theme.earth
    ctx.fillRect(-w, horizonY, w * 2, h)

    ctx.strokeStyle = this._theme.needle
    ctx.lineWidth = Math.max(1, R * 0.025)
    ctx.beginPath()
    ctx.moveTo(-w, horizonY)
    ctx.lineTo( w, horizonY)
    ctx.stroke()

    ctx.save()
    ctx.translate(0, horizonY)
    this._drawPitchLadder(R, PX)
    ctx.restore()

    ctx.restore()

    this._drawRollArc(cx, cy, R)
    this._drawRollPointer(cx, cy, R, this._dRoll)

    ctx.restore()

    this._drawSlipBall(cx, cy, R, this._dSlip)
    this._drawBankPointer(cx, cy, R)

    ctx.save()
    ctx.strokeStyle = this._theme.lubberColor
    ctx.lineWidth = Math.max(1, R * 0.025)
    const refW = R * 0.35
    ctx.beginPath()
    ctx.moveTo(cx - refW * 1.0, cy)
    ctx.lineTo(cx - refW * 0.45, cy)
    ctx.moveTo(cx + refW * 0.45, cy)
    ctx.lineTo(cx + refW * 1.0, cy)
    ctx.stroke()
    ctx.restore()
  }

  _drawPitchLadder(R, PX = R / 25) {
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = this._theme.needle
    ctx.fillStyle   = this._theme.needle
    const fs = Math.max(7, R * 0.1)
    ctx.font = `${fs}px sans-serif`
    ctx.textBaseline = 'middle'

    for (let deg = -80; deg <= 80; deg += 5) {
      if (deg === 0) continue
      const y = -deg * PX
      const isMajor = deg % 10 === 0
      const lw = isMajor ? R * 0.3 : R * 0.18
      ctx.lineWidth = isMajor ? 2 : 1

      ctx.beginPath()
      ctx.moveTo(-lw, y)
      ctx.lineTo( lw, y)
      const tickDir = deg > 0 ? R * 0.06 : -R * 0.06
      ctx.moveTo(-lw, y); ctx.lineTo(-lw, y + tickDir)
      ctx.moveTo( lw, y); ctx.lineTo( lw, y + tickDir)
      ctx.stroke()

      if (isMajor) {
        ctx.textAlign = 'right'
        ctx.fillText(String(Math.abs(deg)), -lw - R * 0.05, y)
        ctx.textAlign = 'left'
        ctx.fillText(String(Math.abs(deg)),  lw + R * 0.05, y)
      }
    }
    ctx.restore()
  }

  _drawRollArc(cx, cy, R) {
    const { ctx } = this
    const arcR = R * 0.92
    ctx.save()
    ctx.translate(cx, cy)
    ctx.strokeStyle = this._theme.needle
    ctx.lineWidth = 1
    for (const deg of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const angle = (deg - 90) * Math.PI / 180
      const len   = [0, 30, 60].includes(Math.abs(deg)) ? R * 0.1 : R * 0.06
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * arcR,         Math.sin(angle) * arcR)
      ctx.lineTo(Math.cos(angle) * (arcR - len), Math.sin(angle) * (arcR - len))
      ctx.stroke()
    }
    ctx.restore()
  }

  _drawRollPointer(cx, cy, R, roll) {
    const { ctx } = this
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-roll * Math.PI / 180)
    const base = -R * 0.82
    ctx.beginPath()
    ctx.moveTo(0,           base)
    ctx.lineTo(-R * 0.05,  base - R * 0.1)
    ctx.lineTo( R * 0.05,  base - R * 0.1)
    ctx.closePath()
    ctx.fillStyle = this._theme.needle
    ctx.fill()
    ctx.restore()
  }

  _drawBankPointer(cx, cy, R) {
    const { ctx } = this
    ctx.save()
    ctx.translate(cx, cy)
    const top = -R * 0.82
    ctx.beginPath()
    ctx.moveTo(0,           top)
    ctx.lineTo(-R * 0.05,  top + R * 0.1)
    ctx.lineTo( R * 0.05,  top + R * 0.1)
    ctx.closePath()
    ctx.fillStyle = this._theme.lubberColor
    ctx.fill()
    ctx.restore()
  }

  _drawSlipBall(cx, cy, R, slip) {
    const { ctx } = this
    const t = this._theme
    const ballR = R * 0.055
    const trackY = cy + R * 0.82
    const maxSlip = 20
    const slipClamped = Math.max(-maxSlip, Math.min(maxSlip, slip))
    const bx = cx - (slipClamped / maxSlip) * R * 0.25

    ctx.save()
    ctx.strokeStyle = t.needle
    ctx.lineWidth = ballR * 2.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - R * 0.25, trackY)
    ctx.lineTo(cx + R * 0.25, trackY)
    ctx.stroke()

    ctx.strokeStyle = t.dialFace
    ctx.lineWidth = 1
    for (const dx of [-ballR * 1.2, ballR * 1.2]) {
      ctx.beginPath()
      ctx.moveTo(cx + dx, trackY - ballR * 1.2)
      ctx.lineTo(cx + dx, trackY + ballR * 1.2)
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.arc(bx, trackY, ballR, 0, Math.PI * 2)
    ctx.fillStyle = t.panelBg
    ctx.fill()
    ctx.strokeStyle = t.needle
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }
}
