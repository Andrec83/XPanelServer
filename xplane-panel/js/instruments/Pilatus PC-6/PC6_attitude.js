import { BaseInstrument } from '../base.js'

export const DEFAULTS = {
  pitch_deg: 'sim/cockpit2/gauges/indicators/pitch_vacuum_deg_pilot',
  roll_deg:  'sim/cockpit2/gauges/indicators/roll_vacuum_deg_pilot',
}

export class PC6Attitude extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._pitch = 0
    this._roll = 0
    this._dPitch = 0
    this._dRoll = 0
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (!state) return;
    const p = state[this._drefs.pitch_deg]
    const r = state[this._drefs.roll_deg]
    if (p != null && !isNaN(p)) { this._pitch = p; this._hasData = true }
    if (r != null && !isNaN(r))   this._roll  = r
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._displayVvi = this._lerp(this._displayVvi, this._vvi, 0.04)
    this._dPitch = this._lerp(this._dPitch, this._pitch, 0.08)
    this._dRoll  = this._lerp(this._dRoll,  this._roll,  0.08)
    
    this._dirty  = Math.abs(this._dPitch - this._pitch) > 0.02
                || Math.abs(this._dRoll  - this._roll)  > 0.02

    const cx = w / 2, cy = h / 2
    const R  = Math.min(w, h) * 0.46 || 1
    
    // NEW SCALE FACTOR: Calibrated so that 30 degrees maps cleanly to the exact edge radius 'R'
    const PX = R / 30.0 

    this._drawBezel()

    // Moving Horizon Sphere (Clipped to instrument face)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.clip()

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-this._dRoll * Math.PI / 180)

    // Nose UP (+ pitch) means the horizon moves DOWN on the canvas (+ Y direction)
    const horizonY = this._getPitchY(this._dPitch, PX)

    // Sky/Earth Background blocks
    ctx.fillStyle = this._theme.sky
    ctx.fillRect(-w, -h, w * 2, h + horizonY)
    ctx.fillStyle = this._theme.earth
    ctx.fillRect(-w, horizonY, w * 2, h)

    // White center horizon line
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(1.5, R * 0.025)
    ctx.beginPath()
    ctx.moveTo(-w, horizonY)
    ctx.lineTo( w, horizonY)
    ctx.stroke()

    // Moving Pitch Graduation Grid
    ctx.save()
    ctx.translate(0, horizonY)
    this._drawPitchLadder(R, PX)
    ctx.restore()

    ctx.restore() // End background roll transformation

    // Static Dial Overlays & Ticks
    this._drawRollArc(cx, cy, R)
    this._drawRollPointer(cx, cy, R, this._dRoll)

    ctx.restore() // End inner clipping mask group

    // Static Bank Pointer Index
    this._drawBankPointer(cx, cy, R)

    // Foreground Miniature Aircraft Symbol
    this._drawFixedAircraftWings(cx, cy, R)
  }

  // FIXED: All mechanical piece-wise compression formulas completely dropped. 
  // 1 degree now perfectly equals 1 PX offset unit everywhere across the scale.
  _getPitchY(deg, PX) {
    return deg * PX
  }
  _drawPitchLadder(R, PX) {
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = '#ffffff'
    ctx.fillStyle   = '#ffffff'
    
    const fs = Math.max(9, R * 0.10)
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textBaseline = 'middle'

    // Real-world GA Bush Layout: 5, 10, 15, 20, 25, 30 steps. Clean, spaced, and instant to read.
    const bars = new Array(5, 10, 15, 20, 25, 30)
    
    bars.forEach(deg => {
      new Array(-1, 1).forEach(side => {
        // Linear tracking using our updated parent class method
        const y = -this._getPitchY(deg * side, PX)
        
        const isMajor = deg % 10 === 0
        const barWidth = isMajor ? R * 0.24 : R * 0.14
        
        ctx.lineWidth = isMajor ? 2.5 : 1.5

        ctx.beginPath()
        ctx.moveTo(-barWidth, y)
        ctx.lineTo(barWidth, y)
        ctx.stroke()

        // Structural vertical side-tabs are drawn ONLY on major 10-degree lines now
        if (isMajor) {
          const tabDirection = side > 0 ? R * 0.035 : -R * 0.035
          ctx.beginPath()
          ctx.moveTo(-barWidth, y); ctx.lineTo(-barWidth, y + tabDirection)
          ctx.moveTo(barWidth, y);  ctx.lineTo(barWidth, y + tabDirection)
          ctx.lineWidth = 1.2
          ctx.stroke()

          // Numerals written strictly on the sides of major lines
          ctx.textAlign = 'right'
          ctx.fillText(String(deg), -barWidth - R * 0.04, y)
          ctx.textAlign = 'left'
          ctx.fillText(String(deg), barWidth + R * 0.04, y)
        }
      })
    })

    ctx.restore()
  }

  _drawRollArc(cx, cy, R) {
    const { ctx } = this
    const arcR = R * 0.92
    ctx.save()
    ctx.translate(cx, cy)
    ctx.strokeStyle = '#ffffff'
    
    const majorTicks = new Array(30, 60)
    const ticks = new Array(10, 20, 30, 60)

    ticks.forEach(deg => {
      new Array(-1, 1).forEach(side => {
        const angle = (deg * side - 90) * Math.PI / 180
        const isMajor = majorTicks.includes(deg)
        const len = isMajor ? R * 0.12 : R * 0.08
        ctx.lineWidth = isMajor ? 2.5 : 1.5

        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * arcR,         Math.sin(angle) * arcR)
        ctx.lineTo(Math.cos(angle) * (arcR - len), Math.sin(angle) * (arcR - len))
        ctx.stroke()
      })
    })

    // Draw the 45-degree dot indicators matching the reference precisely
    ctx.fillStyle = '#ffffff'
    new Array(-1, 1).forEach(side => {
      const dotAngle = (45 * side - 90) * Math.PI / 180
      ctx.beginPath()
      ctx.arc(Math.cos(dotAngle) * arcR, Math.sin(dotAngle) * arcR, R * 0.016, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.restore()
  }

  _drawRollPointer(cx, cy, R, roll) {
    const { ctx } = this
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-roll * Math.PI / 180)
    
    // Yellow bold triangle roll pointer matching the reference photo precisely
    const base = -R * 0.96
    const triHeight = R * 0.11
    const baseHalfWidth = R * 0.06

    ctx.strokeStyle = '#ffcc00'
    ctx.lineWidth = 3.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(0, base)
    ctx.lineTo(-baseHalfWidth, base + triHeight)
    ctx.lineTo(baseHalfWidth, base + triHeight)
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }

  _drawBankPointer(cx, cy, R) {
    const { ctx } = this
    const top = -R * 0.96
    ctx.save()
    ctx.translate(cx, cy)
    ctx.beginPath()
    ctx.moveTo(0,           top)
    ctx.lineTo(-R * 0.04,  top + R * 0.08)
    ctx.lineTo( R * 0.04,  top + R * 0.08)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.restore()
  }

  _drawFixedAircraftWings(cx, cy, R) {
    const { ctx } = this
    ctx.save()
    ctx.translate(cx, cy)

    ctx.fillStyle = '#ffcc00'
    ctx.strokeStyle = '#111111' 
    ctx.lineWidth = 1.2

    const wingSpan = R * 0.58
    const wingThickness = R * 0.042

    // Left Wing Bar horizontal block
    ctx.beginPath()
    ctx.rect(-wingSpan, -wingThickness / 2, wingSpan - R * 0.14, wingThickness)
    ctx.fill(); ctx.stroke()

    // Right Wing Bar horizontal block
    ctx.beginPath()
    ctx.rect(R * 0.14, -wingThickness / 2, wingSpan - R * 0.14, wingThickness)
    ctx.fill(); ctx.stroke()

    // Independent central mechanical stabilization dot index 
    ctx.beginPath()
    ctx.arc(0, 0, R * 0.022, 0, Math.PI * 2)
    ctx.fillStyle = '#ffcc00'
    ctx.fill()
    ctx.lineWidth = 1.0
    ctx.stroke()

    ctx.restore()
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'pc6_attitude',
  label:    'PC-6 Attitude (vacuum)',
  icon:     '✈',
  order:    20,
  datarefs: DEFAULTS,
}
