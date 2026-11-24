import { BaseInstrument } from '../base.js'
import { writeDataref } from '../../xplane-api.js'

export const DEFAULTS = {
  altitude_ft:  'sim/cockpit2/gauges/indicators/altitude_ft_pilot',
  baro_setting: 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
  alt_flag:     'KA350/ianim/gauges/p/alt/altFlag', // 1 = hidden, 0 = show shutter card
}

export class KingAirAltimeter extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds
    this._alt  = 0
    this._baro = 29.92
    this._flag = 1 
    this._displayAlt = 0
    this._hasData = false
    
    // Exact tracking variable structure from your smooth EHSI layout
    this._dAlt = 0
    this._animFloor = config.animFloor || 0.04

    // =========================================================================
    // CENTRALIZED BAROMETER OFFSET AXIS:
    // Change this value here to shift the cutout and drums up or down together.
    // =========================================================================
    this._baroOffsetY = 0.40; 
    // =========================================================================

    // Environment Check: Safe fallback strategy for main-thread vs background systems
    const createBufferCanvas = () => {
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1)
      if (typeof document !== 'undefined' && document.createElement) return document.createElement('canvas')
      throw new Error("No canvas support available in this execution space.")
    }

    // Pi 5 Hardware Performance Optimization Cache allocations
    this._faceCacheCanvas = createBufferCanvas()
    this._faceCacheCtx = this._faceCacheCanvas.getContext('2d')
    this._faceCacheDirty = true

    this._drumCacheCanvas = createBufferCanvas()
    this._drumCacheCtx = this._drumCacheCanvas.getContext('2d')
    this._drumCacheBuilt = false

    this._setupTouchButtons()
  }


  setResolvedIds(ids) { this._resolvedIds = ids }


  // On-screen controls (hidden when touch controls are switched off in the Panel Manager)
  _setupTouchButtons() {
    this.setTouchButtons([
      { id: 'baro-', label: '− BARO', repeat: true, onPress: () => this._adjustBaro(-0.01) },
      { id: 'std',   label: '29.92',                onPress: () => this._adjustBaro(29.92 - this._baro) },
      { id: 'baro+', label: 'BARO +', repeat: true, onPress: () => this._adjustBaro( 0.01) },
    ])
  }

  _adjustBaro(delta) {
    this._baro = Math.max(27.00, Math.min(31.50, this._baro + delta))
    this._baro = Math.round(this._baro * 100) / 100
    this._writeBaro()
    this._faceCacheDirty = true 
    this._dirty = true
  }

  _writeBaro() {
    const id = this._resolvedIds[this._drefs.baro_setting]
    if (id != null) writeDataref(id, this._baro).catch(() => {})
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (!state) return;
    const a = state[this._drefs.altitude_ft]
    const b = state[this._drefs.baro_setting]
    const f = state[this._drefs.alt_flag]
    
    if (a != null && !isNaN(a)) { this._alt = a; this._hasData = true }
    if (b != null && !isNaN(b))   this._baro = b
    if (f != null && !isNaN(f))   this._flag = f
    this._dirty = true
  }
  
  _buildDrumCache(stepH) {
    const singleW = stepH * 1.25 
    const digitW = stepH * 0.72
    const halfDigitGap = stepH * 0.18
    
    // Wheel 3 total width recalculation matching the tighter spacing footprint
    const wideW = (digitW * 3) + (halfDigitGap * 2) + (halfDigitGap * 2)
    
    // Dedicated Barometer 80% size track width
    this._baroSingleW = singleW * 0.80

    this._drumCacheCanvas.width = (singleW * 2) + wideW + this._baroSingleW
    this._drumCacheCanvas.height = stepH * 20 
    const ctx = this._drumCacheCtx

    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, this._drumCacheCanvas.width, this._drumCacheCanvas.height)
    ctx.textBaseline = 'middle'

    const drumFontSize = stepH * 1.23
    const textOffsetY = stepH * 0.06; 

    // Isolated 80% sizing for Lane 4 numbers
    const baroFontSize = drumFontSize * 0.80
    const baroTextOffsetY = textOffsetY * 0.80

    for (let i = 0; i < 20; i++) {
      const y = i * stepH + stepH / 2
      ctx.fillStyle = '#ffffff'
      ctx.font = `${drumFontSize}px sans-serif`
      
      const displayDigit = (10 - (i % 10)) % 10

      // --- LANE 1 ---
      if (i === 0 || i === 10) {
        ctx.save()
        const poleH = stepH * 0.85 
        ctx.beginPath()
        ctx.rect(0, i * stepH, singleW, poleH)
        ctx.clip()
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, i * stepH, singleW, poleH)
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = stepH * 0.09
        ctx.beginPath()
        for (let offset = -stepH; offset < singleW + stepH; offset += stepH * 0.25) {
          ctx.moveTo(offset, (i + 1) * stepH)
          ctx.lineTo(offset + stepH, i * stepH)
        }
        ctx.stroke()
        ctx.restore()
      }

      if (i !== 0 && i !== 10 && displayDigit > 0) {
        ctx.textAlign = 'center'
        ctx.fillText(String(displayDigit), singleW / 2, y + textOffsetY)
      }
      
      // --- LANE 2 ---
      ctx.textAlign = 'center'
      ctx.fillText(String(displayDigit), singleW + singleW / 2, y + textOffsetY)

      // --- LANE 3 ---
      ctx.textAlign = 'left'
      const startX = (singleW * 2) + halfDigitGap 
      const charHund = String(displayDigit)
      const charTens = '0'
      const charOnes = '0'
      ctx.fillText(charHund, startX, y + textOffsetY)
      ctx.fillText(charTens, startX + digitW + halfDigitGap, y + textOffsetY)
      ctx.fillText(charOnes, startX + (digitW * 2) + (halfDigitGap * 2), y + textOffsetY)

      // --- LANE 4: BAROMETER SINGLE-DIGIT DRUM (80% SIZED) ---
      ctx.save()
      ctx.font = `${baroFontSize}px sans-serif`
      ctx.textAlign = 'center'
      
      const baroStartX = (singleW * 2) + wideW
      const baroX = baroStartX + this._baroSingleW / 2
      
      // Kept exactly on the same shared vertical grid line to secure perfect value matching
      ctx.fillText(String(displayDigit), baroX, y + baroTextOffsetY)
      ctx.restore()
    }
    this._drumCacheBuilt = true
  }



  _render() {
    if (!this._hasData) { this._drawNoData(); return }

    const { ctx, w, h } = this
    
    // Exact translation layout tracking from your smooth EHSI template script
    let diff = this._alt - this._dAlt
    
    if (Math.abs(diff) > this._animFloor) {
      // Use the exact 0.08 progression factor you specified
      this._dAlt += diff * 0.08
      this._dirty = true // Keep loop alive for the next frame render pass
    } else {
      // Snap to target exactly when dropping below the floor limit
      this._dAlt = this._alt
    }
    
    // Assign the tracked tracking data downstream to the elements
    this._displayAlt = this._dAlt

    const cx = w / 2, cy = h / 2
    const R = Math.min(w, h) * 0.46 || 1
    const stepH = R * 0.224

    const drumCenterY = cy - R * 0.30

    if (!this._drumCacheBuilt || this._drumCacheCanvas.height !== stepH * 20) {
      this._buildDrumCache(stepH)
    }

    if (this._faceCacheDirty || this._faceCacheCanvas.width !== w || this._faceCacheCanvas.height !== h) {
      this._faceCacheCanvas.width = w || 1
      this._faceCacheCanvas.height = h || 1
      this._cacheFaceplate(this._faceCacheCtx, cx, cy, R, stepH, drumCenterY)
      this._faceCacheDirty = false
    }

    // --- Strict 7-Layer Rendering Execution Stack ---
    this._drawBezel()                                  // Layer 0 Base: Trim Frame (Runs from base.js)
    this._drawAltitudeDrums(cx, R, stepH, drumCenterY)   // Layer 1a Background: Dynamic Wheels Spinning Seamlessly
    this._drawBaroDrums(cx, cy, R)                     // Layer 1b Background: Isolated Font Data (Prepared for conversion)
    this._drawOffFlag(cx, R, stepH, drumCenterY)       // Layer 2: Shutter Card Interrupt Mask
    this._drawFaceplate()                              // Layer 3: Blit pre-cached faceplate overlay and markings
    this._drawNeedle(cx, cy, R)                        // Layer 4: Needle Pointer Layout
    this._drawCentreCap(cx, cy, R)                     // Layer 5: Center Cap Assembly
  }


  // ==========================================
  // LAYER 1a BACKGROUND: Altitude Wheels Layer
  // ==========================================
  _drawAltitudeDrums(cx, R, stepH, drumCenterY) {
    const { ctx } = this
    const alt = this._displayAlt

    const srcSingleW = stepH * 1.25
    
    // Linked tightly to the updated 0.18 layout dimensions
    const digitW = stepH * 0.72
    const halfDigitGap = stepH * 0.18
    const srcWideW = (digitW * 3) + (halfDigitGap * 2) + (halfDigitGap * 2)
    
    const activeTopY = drumCenterY - (stepH * 0.5)

    // =========================================================================
    // DYNAMIC WIDTH ENGINES:
    // Replaced hardcoded '35' with a responsive multiplier tied directly to stepH.
    // =========================================================================
    const wCol = stepH * 1.12; // Scaled column width matching original proportions
    const w10k = wCol
    const w1k  = wCol
    const w100 = srcWideW
    // =========================================================================

    // =========================================================================
    // ADJUST HORIZONTAL POSITIONS DIRECTLY HERE:
    // Horizontal tracks updated to maintain balanced spacing relative to wCol
    // =========================================================================
    const x10k = cx - (wCol * 2.7);   // Moves Wheel 1 (10,000s drum) left or right
    const x1k  = cx - (wCol * 1.3);   // Moves Wheel 2 (1,000s drum) left or right
    const x100 = cx + (wCol * 0.15);  // Moves Wheel 3 (100s master drum) left or right
    // =========================================================================

    // Mathematically safe modulo handler for negative ranges
    const safeMod = (val, max) => ((val % max) + max) % max

    // Odometer value calculations
    const rem100 = safeMod(alt, 1000)
    const rem1k  = safeMod(alt, 10000)

    const creep1k = rem100 >= 900 ? (rem100 - 900) / 100 : 0
    const creep10k = (rem1k >= 9900 && rem100 >= 900) ? (safeMod(alt, 10000) - 9900) / 100 : 0

    const d100k = Math.floor(alt / 10000) + creep10k
    const d1k   = Math.floor(alt / 1000) + creep1k
    const d100  = rem100 / 100 

    ctx.save()

    // WHEEL 1: 10,000s DRUM
    const current10kIdx = safeMod(10 - Math.floor(d100k), 10)
    const scrollY10k = ((current10kIdx - 1) * stepH) - safeMod(d100k, 1) * stepH
    ctx.drawImage(
      this._drumCacheCanvas, 
      0, safeMod(scrollY10k, stepH * 10), srcSingleW, stepH * 3, 
      x10k, activeTopY - stepH, w10k, stepH * 3
    )

    // WHEEL 2: 1,000s DRUM
    const current1kIdx = safeMod(10 - Math.floor(d1k), 10)
    const scrollY1k = ((current1kIdx - 1) * stepH) - safeMod(d1k, 1) * stepH
    ctx.drawImage(
      this._drumCacheCanvas, 
      srcSingleW, safeMod(scrollY1k, stepH * 10), srcSingleW, stepH * 3, 
      x1k, activeTopY - stepH, w1k, stepH * 3
    )

    // WHEEL 3: 100s MASTER DRUM
    const current100Idx = safeMod(10 - Math.floor(d100), 10)
    const scrollY100 = ((current100Idx - 1) * stepH) - safeMod(d100, 1) * stepH
    ctx.drawImage(
      this._drumCacheCanvas, 
      srcSingleW * 2, safeMod(scrollY100, stepH * 10), srcWideW, stepH * 3, 
      x100, activeTopY - stepH, w100, stepH * 3
    )

    ctx.restore()
  }


  // ==========================================
  // LAYER 1b BACKGROUND: Barometric Drumroll Display Layer
  // ==========================================
  _drawBaroDrums(cx, cy, R) {
    const { ctx } = this
    
    const baroY = cy + R * this._baroOffsetY
    
    // Baseline metrics matching your original cache scale structure
    const baseStepH = R * 0.224
    const origSingleW = baseStepH * 1.25
    const origDigitW = baseStepH * 0.72
    const origHalfDigitGap = baseStepH * 0.18
    const origWideW = (origDigitW * 3) + (origHalfDigitGap * 4)

    // Accurate lookups into Lane 4 of the cache canvas
    const srcX = (origSingleW * 2) + origWideW
    const srcW = origSingleW * 0.80

    // NEW: Destination rendering dimensions scaled down to 80%
    const destStepH = baseStepH * 0.80
    const activeTopY = baroY - (destStepH * 0.5)

    // Target widths and gap layouts scaled 80% down to match new dimensions
    const targetW = baseStepH * 1.12 * 0.80
    const gap = baseStepH * 0.032 * 0.80

    // Snug alignment offsets relative to the center seam
    const bxOnes = cx - targetW - (gap / 2)
    const bxTens = bxOnes - targetW - gap
    
    const bxTent = cx + (gap / 2)
    const bxHund = bxTent + targetW + gap

    const baroVal = Math.max(27.00, Math.min(31.50, this._baro))
    const safeMod = (val, max) => ((val % max) + max) % max

    // Target tracking values mapped exactly to your original odometer logic
    const vHund   = baroVal * 100
    const vTenths = baroVal * 10
    const vOnes   = baroVal
    const vTens   = baroVal / 10

    const remHund   = safeMod(vHund, 10)
    const remTenths = safeMod(vTenths, 10)
    const remOnes   = safeMod(vOnes, 10)

    const creepTenths = remHund >= 9 ? (remHund - 9) : 0
    const creepOnes   = (remTenths >= 9 && remHund >= 9) ? (safeMod(vTenths, 10) - 9) : 0
    const creepTens   = (remOnes >= 9 && remTenths >= 9 && remHund >= 9) ? (safeMod(vOnes, 10) - 9) : 0

    const dHund   = vHund
    const dTenths = Math.floor(vTenths) + creepTenths
    const dOnes   = Math.floor(vOnes) + creepOnes
    const dTens   = Math.floor(vTens) + creepTens

    ctx.save()

    // --- DRUM 1: TENS POSITION ---
    const currentTensIdx = safeMod(10 - Math.floor(dTens), 10)
    const scrollYTens = ((currentTensIdx - 1) * baseStepH) - safeMod(dTens, 1) * baseStepH
    ctx.drawImage(this._drumCacheCanvas, srcX, safeMod(scrollYTens, baseStepH * 10), srcW, baseStepH * 3, bxTens, activeTopY - destStepH, targetW, destStepH * 3)

    // --- DRUM 2: ONES POSITION ---
    const currentOnesIdx = safeMod(10 - Math.floor(dOnes), 10)
    const scrollYOnes = ((currentOnesIdx - 1) * baseStepH) - safeMod(dOnes, 1) * baseStepH
    ctx.drawImage(this._drumCacheCanvas, srcX, safeMod(scrollYOnes, baseStepH * 10), srcW, baseStepH * 3, bxOnes, activeTopY - destStepH, targetW, destStepH * 3)

    // --- DRUM 3: TENTHS POSITION ---
    const currentTenthsIdx = safeMod(10 - Math.floor(dTenths), 10)
    const scrollYTenths = ((currentTenthsIdx - 1) * baseStepH) - safeMod(dTenths, 1) * baseStepH
    ctx.drawImage(this._drumCacheCanvas, srcX, safeMod(scrollYTenths, baseStepH * 10), srcW, baseStepH * 3, bxTent, activeTopY - destStepH, targetW, destStepH * 3)

    // --- DRUM 4: HUNDREDTHS POSITION ---
    const currentHundIdx = safeMod(10 - Math.floor(dHund), 10)
    const scrollYHund = ((currentHundIdx - 1) * baseStepH) - safeMod(dHund, 1) * baseStepH
    ctx.drawImage(this._drumCacheCanvas, srcX, safeMod(scrollYHund, baseStepH * 10), srcW, baseStepH * 3, bxHund, activeTopY - destStepH, targetW, destStepH * 3)

    ctx.restore()
  }



  // ==========================================
  // LAYER 2: OFF Flag (Status Shutter Card)
  // ==========================================
  _drawOffFlag(cx, R, stepH, drumCenterY) {
    if (this._flag === 1) return

    const drumX = cx - R * 0.68
    const flagH = stepH * 0.5
    const flagY = drumCenterY - (flagH / 2)

    const { ctx } = this
    ctx.save()
    ctx.fillStyle = '#ba1a1a'
    ctx.strokeStyle = '#4a0808'
    ctx.lineWidth = R * 0.008
    ctx.beginPath()
    ctx.rect(drumX, flagY, stepH * 3, flagH)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  // ==========================================
  // HARDWARE PERFORMANCE CACHE: Faceplate and Stencil Compiler (LAYER 3)
  // ==========================================
  _cacheFaceplate(targetCtx, cx, cy, R, stepH, drumCenterY) {
    const ctx = targetCtx
    const t = this._theme
    
    // =========================================================================
    // VERTICAL CENTERLINE & HEIGHT VARIABLES:
    // Centering both display windows cleanly around their shared component axes.
    // =========================================================================
    const altH  = R * 0.36        // Total vertical height of the standard altitude slot
    const altHw = R * 0.56        // Total vertical height of the wide altitude slot
    
    const baroY = cy + R * this._baroOffsetY // Reads directly from the centralized instance property
    const baroW = R * 0.78        // Total width of the barometer cutout slot
    const baroH = R * 0.22        // Total vertical height of the barometer cutout slot
    // =========================================================================

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2, false)

    // Horizontal positions and right-edge layout paths left completely as original
    const drumX = cx - R * 0.68
    const rightEdgeX = drumX + R * 1.36
    
    const transitionEndX = rightEdgeX - R * 0.52
    const transitionStartX = transitionEndX - R * 0.08
    
    // Vertical paths now follow the centerline axis symmetrically
    const stdTopY  = drumCenterY - altH / 2
    const stdBtmY  = drumCenterY + altH / 2
    const wideTopY = drumCenterY - altHw / 2
    const wideBtmY = drumCenterY + altHw / 2

    ctx.moveTo(drumX, stdTopY)
    ctx.lineTo(drumX, stdBtmY)
    ctx.lineTo(transitionStartX, stdBtmY)
    ctx.lineTo(transitionEndX, wideBtmY)
    ctx.lineTo(rightEdgeX, wideBtmY)
    ctx.lineTo(rightEdgeX, wideTopY)
    ctx.lineTo(transitionEndX, wideTopY)
    ctx.lineTo(transitionStartX, stdTopY)
    ctx.closePath()

    // Perfectly centered right-to-left rect loop anchored directly onto our baroY axis line
    ctx.rect(cx + baroW / 2, baroY - baroH / 2, -baroW, baroH)

    ctx.fillStyle = t.dialFace
    ctx.fill('evenodd')

    ctx.strokeStyle = '#323232'
    ctx.lineWidth = R * 0.012
    
    ctx.beginPath()
    ctx.arc(drumX + R * 0.048, stdTopY + R * 0.048, R * 0.048, Math.PI, Math.PI * 1.5)
    ctx.lineTo(transitionStartX, stdTopY)
    ctx.lineTo(transitionEndX, wideTopY)
    ctx.arc(rightEdgeX - R * 0.048, wideTopY + R * 0.048, R * 0.048, Math.PI * 1.5, 0)
    ctx.lineTo(rightEdgeX, wideBtmY - R * 0.048)
    ctx.arc(rightEdgeX - R * 0.048, wideBtmY - R * 0.048, R * 0.048, 0, Math.PI * 0.5)
    ctx.lineTo(transitionEndX, wideBtmY)
    ctx.lineTo(transitionStartX, stdBtmY)
    ctx.arc(drumX + R * 0.048, stdBtmY - R * 0.048, R * 0.048, Math.PI * 0.5, Math.PI)
    ctx.closePath()
    ctx.stroke()

    // Cleaned up outer framing border ring tracking our exact barometer centerline bounds
    ctx.strokeStyle = t.digitalBorder
    ctx.strokeRect(cx - baroW / 2, baroY - baroH / 2, baroW, baroH)

    ctx.font = `bold ${Math.max(10, R * 0.096)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = t.needle

    ctx.lineWidth = R * 0.032
    ctx.strokeStyle = t.needle
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
      ctx.moveTo(cx + Math.cos(angle) * (R - R * 0.016), cy + Math.sin(angle) * (R - R * 0.016))
      ctx.lineTo(cx + Math.cos(angle) * (R - R * 0.12), cy + Math.sin(angle) * (R - R * 0.12))
    }
    ctx.stroke()

    ctx.lineWidth = R * 0.02
    ctx.beginPath()
    for (let i = 0; i < 40; i++) {
      if (i % 4 === 0) continue
      const angle = (i / 40) * Math.PI * 2 - Math.PI / 2
      ctx.moveTo(cx + Math.cos(angle) * (R - R * 0.016), cy + Math.sin(angle) * (R - R * 0.016))
      ctx.lineTo(cx + Math.cos(angle) * (R - R * 0.088), cy + Math.sin(angle) * (R - R * 0.088))
    }
    ctx.stroke()

    const textRadius = R - R * 0.184
    for (let i = 0; i < 10; i++) {
      if (i === 1) continue 
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
      ctx.fillText(String(i), cx + Math.cos(angle) * textRadius, cy + Math.sin(angle) * textRadius)
    }

    ctx.restore()
  }



  // ==========================================
  // LAYER 3: Faceplate Stencil Blit Render Pass
  // ==========================================
  _drawFaceplate() {
    this.ctx.drawImage(this._faceCacheCanvas, 0, 0)
  }

  // ==========================================
  // LAYER 4: Single Needle Pointer
  // ==========================================
  _drawNeedle(cx, cy, R) {
    const { ctx } = this
    const norm100 = ((this._displayAlt % 1000) + 1000) % 1000
    const ratio = norm100 / 1000

    ctx.save()
    ctx.translate(cx, cy)
    const angle = ratio * Math.PI * 2 - Math.PI / 2
    
    ctx.rotate(angle)

    ctx.fillStyle = '#0a0a0a'
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = R * 0.008
    ctx.beginPath()
    ctx.moveTo(-R * 0.12, 0)
    ctx.lineTo(-R * 0.024, -R * 0.016)
    ctx.lineTo(R * 0.56, -R * 0.0064)
    ctx.lineTo(R * 0.56, R * 0.0064)
    ctx.lineTo(-R * 0.024, R * 0.016)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ffb300'
    ctx.beginPath()
    ctx.moveTo(R * 0.56, -R * 0.024)
    ctx.lineTo(R * 0.96, 0)
    ctx.lineTo(R * 0.56, R * 0.024)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  // ==========================================
  // LAYER 5: Needle Centre Cap
  // ==========================================
  _drawCentreCap(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.104, 0, Math.PI * 2)
    ctx.fillStyle = t.capFill
    ctx.fill()
    ctx.strokeStyle = t.capStroke
    ctx.lineWidth = R * 0.012
    ctx.stroke()
    ctx.restore()
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_altimeter',
  label:    'King Air Altimeter',
  icon:     '↕',
  order:    30,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
  touchControls: true,
}
