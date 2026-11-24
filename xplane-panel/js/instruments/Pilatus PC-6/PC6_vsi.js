import { BaseInstrument } from '../base.js'

export const DEFAULTS = {
  vvi_fpm: 'sim/cockpit2/gauges/indicators/vvi_fpm_pilot',
}

const DEG_TO_RAD = Math.PI / 180;

// Mechanical gear-linkage scaling mapping exactly to your 170-degree direct measurement:
// 0 to 500 FPM (0 to 5): Wide open movement (~55 degrees)
// 500 to 1000 FPM (5 to 10): Takes up ~45 degrees (Hitting exactly 100 degrees at '10')
// 1000 to 1500 FPM (10 to 15): Takes up ~40 degrees (hitting 140 degrees total at '15')
// 1500 to 2000 FPM (15 to 20): Standard compression (~30 degrees, landing dead-on your measured 170 degrees at '20')
// 2000 to 2200 FPM (Overshoot): Sweeps into the blank gap up to 176 degrees maximum right before the peg stop
function fpmToAngle(fpm) {
  if (isNaN(fpm)) return 0;
  
  const structuralLimit = Math.max(-2200, Math.min(2200, fpm));
  const sign = structuralLimit < 0 ? -1 : 1;
  const absFpm = Math.abs(structuralLimit);
  
  let angleDeg = 0;
  
  if (absFpm <= 500) {
    angleDeg = (absFpm / 500) * 55;
  } else if (absFpm <= 1000) {
    angleDeg = 55 + ((absFpm - 500) / 500) * 45;
  } else if (absFpm <= 1500) {
    angleDeg = 100 + ((absFpm - 1000) / 500) * 40;
  } else if (absFpm <= 2000) {
    angleDeg = 140 + ((absFpm - 1500) / 500) * 30;
  } else {
    angleDeg = 170 + ((absFpm - 2000) / 200) * 6;
  }
  
  return sign * angleDeg * DEG_TO_RAD;
}

export class PC6VSI extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._vvi = 0
    this._displayVvi = 0
    this._hasData = false

    // Hardware Optimization Cache Assets for Raspberry Pi 5
    this._faceCacheCanvas = document.createElement('canvas')
    this._faceCacheCtx = this._faceCacheCanvas.getContext('2d')
    this._faceCacheDirty = true

    // Force background cache invalidation whenever ResizeObserver fires in base.js
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

    // 1. Manage Offscreen Static Background Texture Caching
    if (this._faceCacheDirty || this._faceCacheCanvas.width !== w || this._faceCacheCanvas.height !== h) {
      this._faceCacheCanvas.width = w;
      this._faceCacheCanvas.height = h;
      
      // Render complex dial face elements onto hidden layer once
      this._drawFace(this._faceCacheCtx, cx, cy, R);
      this._faceCacheDirty = false;
    }

    // 2. High-Performance Screen Compilation Pass
    this._drawBezel()
    
    // Stamp the pre-rendered dial face image straight down into memory (Virtually zero CPU hit)
    ctx.drawImage(this._faceCacheCanvas, 0, 0)
    
    // Animate moving mechanics dynamically on top
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

    // Authentic face labels mapping straight to 500, 1000, 1500, 2000 FPM scaling
    const majorLabels = [
      { fpm:  2000, label: '20' },
      { fpm:  1500, label: '15' },
      { fpm:  1000, label: '10' },
      { fpm:   500, label: '5' },
      { fpm:     0, label: '0' },
      { fpm:  -500, label: '5' },
      { fpm: -1000, label: '10' },
      { fpm: -1500, label: '15' },
      { fpm: -2000, label: '20' },
    ]

    const fs = Math.max(10, R * 0.15)
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = t.needle
    ctx.strokeStyle = t.needle

    const outer = R * 0.98

    // Pass 1: Major Ticks aligned to outward dial bounds
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (const { fpm } of majorLabels) {
      const angle = Math.PI + fpmToAngle(fpm)
      const len = fpm === 0 ? R * 0.20 : (Math.abs(fpm) === 2000 ? R * 0.18 : R * 0.14)
      ctx.moveTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      ctx.lineTo(cx + Math.cos(angle) * (outer - len), cy + Math.sin(angle) * (outer - len))
    }
    ctx.stroke()

    // Pass 2: High-Density Intermediate Minor Ticks (100 FPM increments)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    
    const minors = [];
    for (let i = 100; i < 2000; i += 100) {
      if (i % 500 === 0) continue;
      minors.push(i, -i);
    }

    for (const fpm of minors) {
      const angle = Math.PI + fpmToAngle(fpm)
      const len = R * 0.07
      ctx.moveTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      ctx.lineTo(cx + Math.cos(angle) * (outer - len), cy + Math.sin(angle) * (outer - len))
    }
    ctx.stroke()

    // Pass 3: Text Label Multi-Quadrant Placement
    const textRadius = outer - R * 0.26
    for (const { fpm, label } of majorLabels) {
      const angle = Math.PI + fpmToAngle(fpm)
      
      if (fpm === 0) {
        // Zero sits flat on the left horizontal bound
        ctx.fillText(label, cx - (textRadius - R * 0.05), cy)
      } else {
        ctx.fillText(label, cx + Math.cos(angle) * textRadius, cy + Math.sin(angle) * textRadius)
      }
    }

    // Pass 4: Static Instrument Arrow Vectors & Labels
    ctx.fillStyle = t.needle
    ctx.font = `bold ${Math.max(6, R * 0.09)}px sans-serif`
    
    // UP Indicator Assembly
    const upAngle = Math.PI + fpmToAngle(400)
    const upX = cx + Math.cos(upAngle) * (outer - R * 0.35)
    const upY = cy + Math.sin(upAngle) * (outer - R * 0.35)
    ctx.fillText('   UP', upX + R * 0.08, upY)
    ctx.beginPath()
    ctx.moveTo(upX, upY + R * 0.04); ctx.lineTo(upX, upY - R * 0.02)
    ctx.lineTo(upX - R * 0.018, upY - R * 0.005); ctx.moveTo(upX, upY - R * 0.02)
    ctx.lineTo(upX + R * 0.018, upY - R * 0.005)
    ctx.lineWidth = 1.5; ctx.stroke()

    // DN Indicator Assembly
    const dnAngle = Math.PI + fpmToAngle(-400)
    const dnX = cx + Math.cos(dnAngle) * (outer - R * 0.35)
    const dnY = cy + Math.sin(dnAngle) * (outer - R * 0.35)
    ctx.fillText('   DN', dnX + R * 0.08, dnY)
    ctx.beginPath()
    ctx.moveTo(dnX, dnY - R * 0.04); ctx.lineTo(dnX, dnY + R * 0.02)
    ctx.lineTo(dnX - R * 0.018, dnY + R * 0.005); ctx.moveTo(dnX, dnY + R * 0.02)
    ctx.lineTo(dnX + R * 0.018, dnY + R * 0.005)
    ctx.stroke()

    // Technical Typography Overlay Labels
    ctx.fillStyle = t.labelDim
    ctx.textAlign = 'center'
    ctx.font = `bold ${Math.max(7, R * 0.10)}px sans-serif`
    ctx.fillText('VERTICAL SPEED', cx, cy - R * 0.22)
    ctx.fillText('100 FEET PER MIN', cx, cy + R * 0.24)
    
    ctx.restore()
  }

  _drawNeedle(cx, cy, R, vvi) {
    const { ctx } = this
    const angle = Math.PI + fpmToAngle(vvi)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    
    // Balanced rear counterweight base plate
    ctx.fillStyle = '#111111'
    ctx.beginPath()
    ctx.moveTo(-R * 0.15, -R * 0.04)
    ctx.lineTo(0, -R * 0.04)
    ctx.lineTo(0, R * 0.04)
    ctx.lineTo(-R * 0.15, R * 0.04)
    ctx.closePath()
    ctx.fill()

    // High visibility aviation wedge pointer blade
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(0, -R * 0.024)
    ctx.lineTo(R * 0.72, -R * 0.024)
    ctx.lineTo(R * 0.85, 0)
    ctx.lineTo(R * 0.72, R * 0.024)
    ctx.lineTo(0, R * 0.024)
    ctx.closePath()
    ctx.fill()
    
    ctx.restore()
  }

  _drawCentreCap(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.08, 0, Math.PI * 2)
    ctx.fillStyle = t.capFill
    ctx.fill()
    ctx.strokeStyle = t.capStroke
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'pc6_vsi',
  label:    'PC-6 VSI',
  icon:     '↕',
  order:    50,
  datarefs: DEFAULTS,
}
