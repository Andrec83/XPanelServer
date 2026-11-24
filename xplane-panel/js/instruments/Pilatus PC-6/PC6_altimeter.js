import { BaseInstrument } from '../base.js'
import { writeDataref } from '../../xplane-api.js'

export const DEFAULTS = {
  altitude_ft:  'sim/cockpit2/gauges/indicators/altitude_ft_pilot',
  baro_setting: 'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
}

const DEG_TO_RAD = Math.PI / 180;

export class PC6Altimeter extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds
    this._alt  = 0
    this._baro = 29.92
    this._displayAlt = 0
    this._hasData = false
    
    // Hardware Optimization Cache Assets for Raspberry Pi 5
    this._faceCacheCanvas = document.createElement('canvas')
    this._faceCacheCtx = this._faceCacheCanvas.getContext('2d')
    this._faceCacheDirty = true

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
    if (a != null && !isNaN(a)) { this._alt = a; this._hasData = true }
    if (b != null && !isNaN(b))   this._baro = b
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    const nextAlt = this._lerp(this._displayAlt, this._alt, 0.15)
    // Round to 1 decimal place before committing to minimize paint instability
    this._displayAlt = Math.round(nextAlt * 10) / 10

    this._dirty = Math.abs(this._displayAlt - this._alt) > 0.1

    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46 || 1

    if (this._faceCacheDirty || this._faceCacheCanvas.width !== w || this._faceCacheCanvas.height !== h) {
      this._faceCacheCanvas.width = w || 1
      this._faceCacheCanvas.height = h || 1
      this._drawFace(this._faceCacheCtx, cx, cy, R)
      this._faceCacheDirty = false
    }

    this._drawBezel()
    ctx.drawImage(this._faceCacheCanvas, 0, 0)

    this._drawBarberPoleLowAlt(cx, cy, R, this._displayAlt)
    this._drawKollsmanWindowText(cx, cy, R, this._baro)
    this._drawYellow10kPerimeterTriangle(cx, cy, R, this._displayAlt)
    this._drawNeedles(cx, cy, R, this._displayAlt)
    this._drawCentreCap(cx, cy, R)
    //this._drawBaroControls()
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

    // Clock face numbers (0 through 9)
    const fs = Math.max(14, R * 0.17)
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = t.needle

    const outer = R * 0.98

    // Pass 1: Major Dial Ticks pushed directly out to meet the bezel
    ctx.lineWidth = 2.5
    ctx.strokeStyle = t.needle
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
      const len = R * 0.13
      ctx.moveTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      ctx.lineTo(cx + Math.cos(angle) * (outer - len), cy + Math.sin(angle) * (outer - len))
    }
    ctx.stroke()

    // Pass 2: High-Density Intermediate Minor Ticks (20-foot graduation subdivisions)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let i = 0; i < 50; i++) {
      if (i % 5 === 0) continue
      const angle = (i / 50) * Math.PI * 2 - Math.PI / 2
      const len = R * 0.07
      ctx.moveTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      ctx.lineTo(cx + Math.cos(angle) * (outer - len), cy + Math.sin(angle) * (outer - len))
    }
    ctx.stroke()

    // Pass 3: Numerals shifted cleanly inside tick clusters
    const textRadius = outer - R * 0.25
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
      ctx.fillText(String(i), cx + Math.cos(angle) * textRadius, cy + Math.sin(angle) * textRadius)
    }

    // Static Altimeter markings matching Trintec layout profile
    ctx.fillStyle = t.labelDim
    ctx.font = `bold ${Math.max(6, R * 0.07)}px sans-serif`
    ctx.fillText('100', cx - R * 0.12, cy - R * 0.58)
    ctx.fillText('1000', cx - R * 0.12, cy - R * 0.49)
    ctx.fillText('10000', cx - R * 0.12, cy - R * 0.40)
    ctx.fillText('FEET', cx + R * 0.18, cy - R * 0.58)
    ctx.fillText('FEET', cx + R * 0.18, cy - R * 0.49)
    ctx.fillText('FEET', cx + R * 0.18, cy - R * 0.40)

    ctx.fillText('ALT', cx - R * 0.32, cy - R * 0.12)
    ctx.font = `${Math.max(4, R * 0.045)}px sans-serif`
    ctx.fillText('CALIBRATED TO', cx - R * 0.32, cy - R * 0.04)
    ctx.fillText('20,000 FEET', cx - R * 0.32, cy + R * 0.03)

    // Barometric Kollsman window scale box layout
    const kx = cx + R * 0.53, ky = cy
    const kw = R * 0.45, kh = R * 0.16
    ctx.strokeStyle = t.digitalBorder
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.rect(kx - kw / 2, ky - kh / 2, kw, kh)
    ctx.fillStyle = t.digitalBg 
    ctx.fill()
    ctx.stroke()

    // Curved crescent aperture window frame at the bottom 6 o'clock location
    ctx.lineWidth = 1.5
    ctx.strokeStyle = t.digitalBorder
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.52, 0.28 * Math.PI, 0.72 * Math.PI)
    ctx.arc(cx, cy, R * 0.22, 0.72 * Math.PI, 0.28 * Math.PI, true)
    ctx.closePath()
    ctx.stroke()

    ctx.restore()
  }

  _drawBarberPoleLowAlt(cx, cy, R, alt) {
    if (alt >= 20000) return 
    
    const { ctx } = this
    ctx.save()
    
    // 1. Establish the curved window aperture boundary clip
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.52, 0.28 * Math.PI, 0.72 * Math.PI)
    ctx.arc(cx, cy, R * 0.22, 0.72 * Math.PI, 0.28 * Math.PI, true)
    ctx.closePath()
    ctx.clip()

    // 2. Base layer: Render stripe sheet
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(cx - R, cy, R * 2, R)

    ctx.strokeStyle = '#e0e0e0' 
    ctx.lineWidth = R * 0.032
    
    ctx.save()
    ctx.translate(cx, cy + R * 0.35)
    // FIX: Flipped direction horizontally by reversing the vector grid rotation from 45 to -45 degrees
    ctx.rotate(-45 * DEG_TO_RAD)

    for (let i = -6; i <= 6; i++) {
      ctx.beginPath()
      ctx.moveTo(-R * 0.50, i * R * 0.075)
      ctx.lineTo(R * 0.50, i * R * 0.075)
      ctx.stroke()
    }
    ctx.restore()

    // 3. Shutter mask calculation
    const clampedAlt = Math.max(0, alt)
    const ratio = clampedAlt / 20000

    const startArcAngle = 0.28 * Math.PI
    const totalArcSpan = 0.44 * Math.PI
    const shutterProgressAngle = startArcAngle + (totalArcSpan * ratio)

    // 4. Draw the physical black mask sliding over from right to left
    ctx.fillStyle = '#0a0a0a'
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, R * 0.55, startArcAngle, shutterProgressAngle)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  _drawKollsmanWindowText(cx, cy, R, baro) {
    const { ctx } = this
    const kx = cx + R * 0.53, ky = cy
    ctx.save()
    ctx.fillStyle = this._theme.needle
    ctx.font = `bold ${Math.max(10, R * 0.14)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(baro.toFixed(2), kx, ky)
    ctx.restore()
  }

  _drawYellow10kPerimeterTriangle(cx, cy, R, alt) {
    const { ctx } = this
    
    const normalizedAlt = ((alt % 100000) + 100000) % 100000
    const ratio = normalizedAlt / 100000
    
    const rawAngle = ratio * Math.PI * 2
    const roundedAngle = parseFloat(rawAngle.toFixed(2))
    
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(roundedAngle)

    const outerBezelEdge = R * 0.98
    const triLength = R * 0.09
    const baseHalfWidth = R * 0.045

    ctx.fillStyle = '#ffcc00'
    ctx.beginPath()
    ctx.moveTo(-baseHalfWidth, -outerBezelEdge)
    ctx.lineTo(baseHalfWidth, -outerBezelEdge)
    ctx.lineTo(0, -(outerBezelEdge - triLength))
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  _drawNeedles(cx, cy, R, alt) {
    const { ctx } = this

    const norm100 = ((alt % 1000) + 1000) % 1000
    const norm1k  = ((alt % 10000) + 10000) % 10000

    const r100 = norm100 / 1000
    const r1k  = norm1k / 10000

    // 1. Long 100-Foot Needle Hand
    ctx.save()
    ctx.translate(cx, cy)
    const angle100 = r100 * Math.PI * 2 - Math.PI / 2
    ctx.rotate(parseFloat(angle100.toFixed(2)))
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(-R * 0.12, 0)
    ctx.lineTo(0, -R * 0.02)
    ctx.lineTo(R * 0.90, -R * 0.006)
    ctx.lineTo(R * 0.93, 0)
    ctx.lineTo(R * 0.90, R * 0.006)
    ctx.lineTo(0, R * 0.02)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // 2. Wide 1,000-Foot Needle Hand
    ctx.save()
    ctx.translate(cx, cy)
    const angle1k = r1k * Math.PI * 2 - Math.PI / 2
    ctx.rotate(parseFloat(angle1k.toFixed(2)))
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(-R * 0.08, 0)
    ctx.lineTo(0, -R * 0.045)
    ctx.lineTo(R * 0.52, -R * 0.04)
    ctx.lineTo(R * 0.64, 0)
    ctx.lineTo(R * 0.52, R * 0.04)
    ctx.lineTo(0, R * 0.045)
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
  type:     'pc6_altimeter',
  label:    'PC-6 Altimeter',
  icon:     '↕',
  order:    30,
  datarefs: DEFAULTS,
  touchControls: true,
}
