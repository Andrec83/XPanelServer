import { BaseInstrument } from './base.js'

export const DEFAULTS = {
  turn_rate: 'sim/cockpit2/gauges/indicators/turn_rate_roll_deg_pilot',
  slip_deg:  'sim/cockpit2/gauges/indicators/slip_deg',
}

export class TurnCoordinator extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._turnRate = 0; this._slip = 0; this._dTurnRate = 0; this._dSlip = 0
    this._hasData = false
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    const t = state[this._drefs.turn_rate], s = state[this._drefs.slip_deg]
    if (t != null) { this._turnRate = t; this._hasData = true }
    if (s != null) { this._slip = s }
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._dTurnRate = this._lerp(this._dTurnRate, this._turnRate, 0.08)
    this._dSlip     = this._lerp(this._dSlip,     this._slip,     0.08)
    this._dirty     = Math.abs(this._dTurnRate - this._turnRate) > 0.02 || Math.abs(this._dSlip - this._slip) > 0.02

    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44
    this._drawBezel()

    // LAYER 1: Deep Inner Panel Background
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = "#121315"; ctx.fill()
    ctx.restore()

    // LAYER 2: Liquid Glass Tube Assembly (Masked cleanly behind the outer frame)
    this._drawInclinometerBall(cx, cy, R, this._dSlip)

    // LAYER 3: Solid Outer Ring Mask (Thin outer ring leaving a wide center opening at R * 0.82)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R + 10, 0, Math.PI * 2, false)
    ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2, true)
    ctx.fillStyle = "#1e1f22"; ctx.fill('evenodd')
    
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)"; ctx.lineWidth = Math.max(1, R * 0.006); ctx.stroke()
    ctx.restore()

    // LAYER 4: Static Markings & Text Labels
    this._drawStaticMarkings(cx, cy, R)

    // LAYER 5: Animating Miniature Aircraft (Sits perfectly centered over the deep inner window)
    this._drawMiniatureAircraft(cx, cy, R, Math.max(-70, Math.min(70, this._dTurnRate)))
  }

  _drawStaticMarkings(cx, cy, R) {
    const { ctx } = this
    ctx.save(); ctx.translate(cx, cy)
    ctx.strokeStyle = "#ffffff"; ctx.fillStyle = "#ffffff"
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    // CACHE WATERMARK V2.2
    //ctx.font = `bold ${Math.max(16, R * 0.16)}px monospace`
    //ctx.fillStyle = "rgba(255, 160, 0, 0.55)"
    //ctx.fillText("V2.2", 0, -R * 0.42)
    //ctx.fillStyle = "#ffffff"

    const fontLarge = Math.max(8, R * 0.09), fontSmall = Math.max(6, R * 0.06)
    
    // Upper Ring Face Labels
    ctx.font = `${fontSmall}px sans-serif`
    ctx.fillText("D.C.", 0, -R * 0.98)    
    ctx.fillText("ELEC.", 0, -R * 0.88)   
    
    ctx.font = `${fontSmall * 0.72}px sans-serif`; ctx.fillText("TURN COORDINATOR", 0, R * 0.22)
    
    // Lower Ring Face Labels
    ctx.font = `${fontLarge}px sans-serif`; ctx.fillText("2 MIN.", 0, R * 0.65)
    ctx.font = `bold ${fontLarge * 1.3}px sans-serif`; ctx.fillText("L", -R * 0.90, R * 0.40); ctx.fillText("R", R * 0.90, R * 0.40)

    // Index markings layout lines
    ctx.lineWidth = Math.max(4, R * 0.045); ctx.lineCap = "butt"
    ctx.beginPath(); ctx.moveTo(-R * 0.96, 0); ctx.lineTo(-R * 0.82, 0); ctx.moveTo(R * 0.82, 0); ctx.lineTo(R * 0.96, 0); ctx.stroke()

    for (const sign of [-1, 1]) {
      ctx.save(); ctx.rotate(sign * 20 * Math.PI / 180); ctx.beginPath()
      ctx.moveTo(sign * R * 0.82, 0); ctx.lineTo(sign * R * 0.96, 0); ctx.stroke(); ctx.restore()
    }
    ctx.restore()
  }

  _drawMiniatureAircraft(cx, cy, R, bankAngle) {
    const { ctx } = this
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(bankAngle * Math.PI / 180)
    
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#121315"; ctx.lineWidth = Math.max(1, R * 0.008)
    ctx.lineJoin = "round"; ctx.lineCap = "round"

    const wingW = R * 0.815 
    
    // STEP 1: Main Wing Structure
    ctx.beginPath()
    ctx.moveTo(wingW, 0)
    ctx.lineTo(-wingW, 0)            
    ctx.lineTo(-wingW, R * 0.035)    
    ctx.lineTo(-R * 0.12, R * 0.055) 
    ctx.lineTo(R * 0.12, R * 0.055)  
    ctx.lineTo(wingW, R * 0.035)     
    ctx.closePath(); ctx.fill(); ctx.stroke()

    // STEP 2: Central Fuselage Ball
    const fuselageRadius = R * 0.115
    ctx.beginPath()
    ctx.arc(0, 0, fuselageRadius, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()

    // STEP 3: Geometric Upside-down T-Tail (⊥ Symbol)
    const stabilizerW = R * 0.38
    const stabilizerThick = R * 0.024
    const finH = R * 0.18
    const finW = R * 0.024
    const tailBaseY = -fuselageRadius + R * 0.025

    ctx.beginPath()
    ctx.moveTo(-stabilizerW / 2, tailBaseY)                                  
    ctx.lineTo(-stabilizerW / 2, tailBaseY - stabilizerThick)                
    ctx.lineTo(-finW / 2, tailBaseY - stabilizerThick)                       
    ctx.lineTo(-finW / 2, tailBaseY - stabilizerThick - finH)                
    ctx.lineTo(finW / 2, tailBaseY - stabilizerThick - finH)                 
    ctx.lineTo(finW / 2, tailBaseY - stabilizerThick)                        
    ctx.lineTo(stabilizerW / 2, tailBaseY - stabilizerThick)                 
    ctx.lineTo(stabilizerW / 2, tailBaseY)                                   
    ctx.closePath(); ctx.fill(); ctx.stroke()

    ctx.restore()
  }

  _drawInclinometerBall(cx, cy, R, slip) {
    const { ctx } = this
    const tubeCenterY = cy + R * 0.42, tubeWidth = R * 0.18, ballRadius = tubeWidth * 0.44
    const arcRadius = R * 1.6, arcCenterX = cx, arcCenterY = tubeCenterY - arcRadius
    const baseAngle = Math.PI / 2, spanAngle = 27 * Math.PI / 180

    ctx.save()
    ctx.beginPath(); ctx.arc(arcCenterX, arcCenterY, arcRadius, baseAngle - spanAngle, baseAngle + spanAngle)
    ctx.lineWidth = tubeWidth; ctx.lineCap = 'round'

    const glassGradient = ctx.createLinearGradient(cx, tubeCenterY - tubeWidth/2, cx, tubeCenterY + tubeWidth/2)
    glassGradient.addColorStop(0, "rgba(232, 226, 185, 0.90)")   
    glassGradient.addColorStop(0.3, "rgba(253, 249, 210, 0.97)") 
    glassGradient.addColorStop(1, "rgba(206, 198, 155, 0.93)")   
    ctx.strokeStyle = glassGradient; ctx.stroke()

    ctx.lineWidth = Math.max(1, R * 0.005); ctx.strokeStyle = "rgba(255, 255, 255, 0.22)"; ctx.stroke()

    // FIXED ALIGNMENT COLUMNS
    ctx.strokeStyle = "#121315"; ctx.lineWidth = Math.max(2.5, R * 0.018)
    const spacingFromCenter = ballRadius * 1.05, lineHalfHeight = tubeWidth * 0.55
    for (const sign of [-1, 1]) {
      const lineX = cx + (sign * spacingFromCenter)
      ctx.beginPath(); ctx.moveTo(lineX, tubeCenterY - lineHalfHeight); ctx.lineTo(lineX, tubeCenterY + lineHalfHeight); ctx.stroke()
    }

    // --- DATA SCALE SENSITIVITY CALIBRATION ---
    // Tweak this value to scale how far the ball moves relative to your simulator data.
    // 1.00 is direct scaling. 0.85 makes it less sensitive. 1.25 makes it react more aggressively.
    const slipSensitivity = 0.75

    const scaledSlip = slip * slipSensitivity
    const maximumSlipAngleRange = 14
    const clampedSlip = Math.max(-maximumSlipAngleRange, Math.min(maximumSlipAngleRange, scaledSlip))
    
    // Physical tube tracking envelope (Kept wide open so ball can hit the absolute edge)
    const maxOffsetAngle = spanAngle * 1.65 
    const currentBallAngle = baseAngle + (clampedSlip / maximumSlipAngleRange) * maxOffsetAngle

    const ballX = arcCenterX + arcRadius * Math.cos(currentBallAngle)
    const ballY = arcCenterY + arcRadius * Math.sin(currentBallAngle)

    ctx.beginPath(); ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2)
    ctx.fillStyle = "#090a0b"; ctx.fill()
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(0.5, R * 0.005); ctx.stroke()
    ctx.restore()
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'turn_coordinator',
  label:    'Turn Coordinator',
  icon:     '✈',
  order:    35,
  datarefs: DEFAULTS,
}
