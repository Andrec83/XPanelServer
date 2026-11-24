import { BaseInstrument } from '../base.js'

export const DEFAULTS = {
  vvi_fpm: 'sim/cockpit2/gauges/indicators/vvi_fpm_pilot',
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Clean Unified Clock Face Transformation Matrix for King Air 3000 FPM Scale:
 * Zero sits flat at 9 o'clock. Positive rates climb clockwise.
 *  - 0 to 1000 FPM: Uniform linear sweep of 60° (landing exactly at 11 o'clock)
 *  - 1000 to 2000 FPM: Uniform linear sweep of 60° (landing exactly at 1 o'clock)
 *  - 2000 to 3000 FPM: Uniform compressed sweep of 30° (landing exactly at 2 o'clock)
 */
function fpmToAngle(fpm) {
  if (isNaN(fpm)) return 0;
  
  const structuralLimit = Math.max(-3200, Math.min(3200, fpm));
  const sign = structuralLimit < 0 ? -1 : 1;
  const absFpm = Math.abs(structuralLimit);
  
  let angleDeg = 0;
  
  if (absFpm <= 1000) {
    // 0 to 1000 FPM even linear sweep straight up to 60 degrees
    angleDeg = (absFpm / 1000) * 60;
  } else if (absFpm <= 2000) {
    // 1000 to 2000 FPM even linear sweep straight up to 120 degrees
    angleDeg = 60 + ((absFpm - 1000) / 1000) * 60;
  } else {
    // 2000 to 3000 FPM even compressed sweep straight up to 150 degrees
    angleDeg = 120 + ((absFpm - 2000) / 1000) * 30;
  }
  
  return sign * angleDeg * DEG_TO_RAD;
}

export class KingAirVSI extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._vvi = 0
    this._displayVvi = 0
    this._hasData = false

    this._faceCacheCanvas = document.createElement('canvas')
    this._faceCacheCtx = this._faceCacheCanvas.getContext('2d')
    this._faceCacheDirty = true

    const originalSetup = this._setupResizeObserver;
    if (originalSetup) {
      this._setupResizeObserver = () => {
        originalSetup.call(this);
        this._faceCacheDirty = true;
      };
    }
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (!state) return;
    const v = state[this._drefs.vvi_fpm]
    if (v == null || isNaN(v)) return
    this._hasData = true
    this._vvi = v
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._displayVvi = this._lerp(this._displayVvi, this._vvi, 0.05)
    this._dirty = Math.abs(this._displayVvi - this._vvi) > 0.5

    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46 || 1

    if (this._faceCacheDirty || this._faceCacheCanvas.width !== w || this._faceCacheCanvas.height !== h) {
      this._faceCacheCanvas.width = w;
      this._faceCacheCanvas.height = h;
      
      this._faceCacheCtx.fillStyle = this._theme.digitalBg || '#121212'
      this._faceCacheCtx.fillRect(0, 0, w, h)

      this._drawFace(this._faceCacheCtx, cx, cy, R);
      this._faceCacheDirty = false;
    }

    this._drawBezel()
    ctx.drawImage(this._faceCacheCanvas, 0, 0)
    
    this._drawNeedle(cx, cy, R, this._displayVvi)
    this._drawCentreCap(cx, cy, R)
  }
  
  _drawFace(targetCtx, cx, cy, R) {
    const ctx = targetCtx
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = t.dialFace
    ctx.fill()
    ctx.strokeStyle = t.dialRim
    ctx.lineWidth = 2
    ctx.stroke()

    // King Air Major Label Track Configuration (1500 has a mark, but NO text label)
    const majorLabels = [
      { fpm:  3000, label: '3', isFive: false, hasText: true,  isThick: true,  isZero: false },
      { fpm:  2000, label: '2', isFive: false, hasText: true,  isThick: true,  isZero: false },
      { fpm:  1500, label: '',  isFive: false, hasText: false, isThick: false, isZero: false }, 
      { fpm:  1000, label: '1', isFive: false, hasText: true,  isThick: true,  isZero: false },
      { fpm:   500, label: '5', isFive: true,  hasText: true,  isThick: false, isZero: false },
      { fpm:     0, label: '0', isFive: false, hasText: true,  isThick: false, isZero: true  }, // The 0 Baseline
      { fpm:  -500, label: '5', isFive: true,  hasText: true,  isThick: false, isZero: false },
      { fpm: -1000, label: '1', isFive: false, hasText: true,  isThick: true,  isZero: false },
      { fpm: -1500, label: '',  isFive: false, hasText: false, isThick: false, isZero: false }, 
      { fpm: -2000, label: '2', isFive: false, hasText: true,  isThick: true,  isZero: false },
      { fpm: -3000, label: '3', isFive: false, hasText: true,  isThick: true,  isZero: false },
    ]

    const stdFs = Math.max(10, R * 0.14)
    const fiveFs = stdFs * 0.85 
    
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#ffffff'

    const outer = R * 0.98

    // Pass 1: Major Ticks aligned to linear parameters
    for (const { fpm, isThick, isZero } of majorLabels) {
      // 0 line gets an extra heavy 6.0 width. 1,2,3 get 4.0. The rest get 2.0.
      ctx.lineWidth = isZero ? 6.0 : (isThick ? 4.0 : 2.0) 
      ctx.beginPath()
      const angle = Math.PI + fpmToAngle(fpm)
      const isTerminalMark = (Math.abs(fpm) === 3000)
      const len = fpm === 0 ? R * 0.20 : (isTerminalMark ? R * 0.18 : R * 0.14)
      ctx.moveTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      ctx.lineTo(cx + Math.cos(angle) * (outer - len), cy + Math.sin(angle) * (outer - len))
      ctx.stroke()
    }

    // Pass 2: Minor Ticks Configuration
    // Sized up the baseline smallest marks line weight here from 1.2 to 2.2
    ctx.lineWidth = 2.2
    ctx.beginPath()
    
    const minors = [
      1100, -1100, 1200, -1200, 1300, -1300, 1400, -1400,
      1600, -1600, 1700, -1700, 1800, -1800, 1900, -1900,
      2500, -2500
    ];
    
    for (let i = 100; i < 1000; i += 100) {
      if (i % 500 === 0) continue
      minors.push(i, -i)
    }

    for (const fpm of minors) {
      const angle = Math.PI + fpmToAngle(fpm)
      const len = R * 0.07
      ctx.moveTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      ctx.lineTo(cx + Math.cos(angle) * (outer - len), cy + Math.sin(angle) * (outer - len))
    }
    ctx.stroke()

    // Pass 3: Text Label Placement
    const textRadius = outer - R * 0.25
    for (const { fpm, label, isFive, hasText } of majorLabels) {
      if (!hasText) continue
      
      const angle = Math.PI + fpmToAngle(fpm)
      ctx.font = `bold ${isFive ? fiveFs : stdFs}px sans-serif`
      
      if (fpm === 0) {
        ctx.fillText(label, cx - (textRadius - R * 0.05), cy)
      } else {
        ctx.fillText(label, cx + Math.cos(angle) * textRadius, cy + Math.sin(angle) * textRadius)
      }
    }

    // =========================================================================
    // PASS 4: ADJUSTED RADIAL SWEEP ARROWS (UP & DN)
    // Sits 5-pixels out from the '0' label text margins with half-length shafts
    // =========================================================================
    ctx.strokeStyle = '#ffffff'
    ctx.fillStyle = '#ffffff'
    ctx.lineWidth = R * 0.016
    
    const arrowRadius = outer - R * 0.31

    const upStartAngle = Math.PI - 0.13 
    const upEndAngle   = Math.PI - 0.34  

    const dnStartAngle = Math.PI + 0.13 
    const dnEndAngle   = Math.PI + 0.34  

    const headLength = R * 0.08
    const headHalfWidth = R * 0.035

    // --- CURVED UPWARD ARROW ---
    ctx.beginPath()
    ctx.arc(cx, cy, arrowRadius, upStartAngle, upEndAngle, true)
    ctx.stroke()
    
    const upTipX = cx + Math.cos(upEndAngle) * arrowRadius
    const upTipY = cy + Math.sin(upEndAngle) * arrowRadius
    
    const upBackAngle = upEndAngle + (headLength / arrowRadius)
    const upBackLeftX  = cx + Math.cos(upBackAngle) * (arrowRadius - headHalfWidth)
    const upBackLeftY  = cy + Math.sin(upBackAngle) * (arrowRadius - headHalfWidth)
    const upBackRightX = cx + Math.cos(upBackAngle) * (arrowRadius + headHalfWidth)
    const upBackRightY = cy + Math.sin(upBackAngle) * (arrowRadius + headHalfWidth)

    ctx.beginPath()
    ctx.moveTo(upTipX, upTipY)
    ctx.lineTo(upBackLeftX, upBackLeftY)
    ctx.lineTo(upBackRightX, upBackRightY)
    ctx.closePath()
    ctx.fill()

    // --- CURVED DOWNWARD ARROW ---
    ctx.beginPath()
    ctx.arc(cx, cy, arrowRadius, dnStartAngle, dnEndAngle, false)
    ctx.stroke()
    
    const dnTipX = cx + Math.cos(dnEndAngle) * arrowRadius
    const dnTipY = cy + Math.sin(dnEndAngle) * arrowRadius
    
    const dnBackAngle = dnEndAngle - (headLength / arrowRadius)
    const dnBackLeftX  = cx + Math.cos(dnBackAngle) * (arrowRadius - headHalfWidth)
    const dnBackLeftY  = cy + Math.sin(dnBackAngle) * (arrowRadius - headHalfWidth)
    const dnBackRightX = cx + Math.cos(dnBackAngle) * (arrowRadius + headHalfWidth)
    const dnBackRightY = cy + Math.sin(dnBackAngle) * (arrowRadius + headHalfWidth)

    ctx.beginPath()
    ctx.moveTo(dnTipX, dnTipY)
    ctx.lineTo(dnBackLeftX, dnBackLeftY)
    ctx.lineTo(dnBackRightX, dnBackRightY)
    ctx.closePath()
    ctx.fill()

    // =========================================================================
    // BAKED KING AIR SPECIFIC TYPOGRAPHY OVERLAY LAYOUT
    // =========================================================================
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    
    const topBlockBaseY = cy - R * 0.54

    const line2Size = Math.max(8, R * 0.09)
    const secondarySize = line2Size * 1.10
    
    ctx.font = `bold ${secondarySize}px sans-serif`
    ctx.fillText('INSTANTANEOUS', cx, topBlockBaseY)
    
    ctx.font = `bold ${line2Size}px sans-serif`
    ctx.fillText('VERTICAL SPEED', cx, topBlockBaseY + R * 0.085)
    
    ctx.font = `bold ${secondarySize}px sans-serif`
    ctx.fillText('THOUSANDS', cx, topBlockBaseY + R * 0.195)
    
    ctx.font = `bold ${secondarySize}px sans-serif`
    ctx.fillText('ft per min', cx, topBlockBaseY + R * 0.285)

    // --- BOTTOM HALF: BRANDED BEECHCRAFT LOGO ASSEMBLY ---
    ctx.font = `italic bold ${Math.max(7, R * 0.135)}px serif`
    const logoY = cy + R * 0.35
    ctx.fillText('Beechcraft', cx, logoY)
    
    ctx.restore()
  }





  // ==========================================
  // FIXED HIGH-VISIBILITY STRAIGHT-LINE NEEDLE
  // ==========================================
  _drawNeedle(cx, cy, R, vvi) {
    const { ctx } = this
    const angle = Math.PI + fpmToAngle(vvi)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    
    // Perfect straight line extension touching the outer tick marker line track
    const tipLength = R * 0.78 

    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 1.5

    ctx.beginPath()
    ctx.moveTo(0, -R * 0.075)         // Clean wide structural base anchor width
    ctx.lineTo(tipLength, -R * 0.008)  // Taper straight out to a clean top edge point
    ctx.lineTo(tipLength, R * 0.008)   // Tip thickness definition
    ctx.lineTo(0, R * 0.075)          // Symmetrical lower base width corner
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    
    ctx.restore()
  }

  // ==========================================
  // LAYER 5: OPTIMIZED NEEDLE CENTER CAP
  // ==========================================
  _drawCentreCap(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.115, 0, Math.PI * 2)
    ctx.fillStyle = t.capFill || '#222222'
    ctx.fill()
    ctx.strokeStyle = t.capStroke || '#ffffff'
    ctx.lineWidth = 2.0
    ctx.stroke()
    ctx.restore()
  }


}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_vsi',
  label:    'King Air VSI',
  icon:     '↕',
  order:    50,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
}
