import { BaseInstrument } from '../base.js'
import { writeDataref } from '../../xplane-api.js'

const DEFAULTS = {
  heading_deg: 'sim/cockpit2/gauges/indicators/heading_electric_deg_mag_pilot',
  bug_deg:     'sim/cockpit/autopilot/heading_mag',
}

const DEG_TO_RAD = Math.PI / 180;
const CARDINALS = ['N','NE','E','SE','S','SW','W','NW'];

export class PC6Heading extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds
    this._heading  = 0
    this._bug      = 0
    this._dHeading = 0
    this._dBug     = 0
    this._hasData  = false
    this._btnActive = null
    this._syncFlash = 0
    this._setupTouchButtons()
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (!state) return;
    const h = state[this._drefs.heading_deg]
    const b = state[this._drefs.bug_deg]
    if (h != null && !isNaN(h)) { this._heading = h; this._hasData = true }
    if (b != null && !isNaN(b))   this._bug    = b
    this._dirty = true
  }

  setResolvedIds(ids) { this._resolvedIds = ids }

  // On-screen controls (hidden when touch controls are switched off in the Panel Manager)
  _setupTouchButtons() {
    this.setTouchButtons([
      { id: 'hdg-', label: '− HDG', repeat: true, onPress: () => this._adjBug(-1) },
      { id: 'hdg+', label: 'HDG +', repeat: true, onPress: () => this._adjBug( 1) },
      { id: 'sync', label: 'SYNC',                onPress: () => this._syncGyro() },
    ])
  }

  _adjBug(delta) {
    this._bug = ((this._bug + delta) % 360 + 360) % 360
    this._dirty = true
    const id = this._resolvedIds[this._drefs.bug_deg]
    if (id != null) writeDataref(id, this._bug).catch(() => {})
  }

  _syncGyro() {
    const heading = this._heading
    this._bug = heading
    const id = this._resolvedIds[this._drefs.bug_deg]
    if (id != null) writeDataref(id, heading).catch(() => {})
    this._syncFlash = Date.now()
    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    const nextHeading = this._lerpAngle(this._dHeading, this._heading, 0.08)
    this._dHeading     = ((nextHeading % 360) + 360) % 360
    
    this._dBug     = this._lerpAngle(this._dBug, this._bug, 0.08)
    this._dirty    = Math.abs(this._dHeading - this._heading) > 0.02
                  || Math.abs(this._dBug - this._bug) > 0.02

    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46 || 1
    this._drawBezel()
    this._drawCompassCard(cx, cy, R, this._dHeading)
    this._drawBug(cx, cy, R, this._dBug, this._dHeading)
    this._drawStaticOverlays(cx, cy, R)
    this._drawCentreCap(cx, cy, R)
  }
  _drawCompassCard(cx, cy, R, heading) {
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

    ctx.translate(cx, cy)
    ctx.rotate(-heading * DEG_TO_RAD)

    const fs = Math.max(9, R * 0.14)
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const outer = R * 0.98
    const textRadius = outer - R * 0.23

    ctx.strokeStyle = t.needle
    
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let deg = 5; deg < 360; deg += 5) {
      if (deg % 10 === 0) continue
      const angle = deg * DEG_TO_RAD - Math.PI / 2
      ctx.moveTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
      ctx.lineTo(Math.cos(angle) * (outer - R * 0.05), Math.sin(angle) * (outer - R * 0.05))
    }
    ctx.stroke()

    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let deg = 0; deg < 360; deg += 10) {
      const isMajor = deg % 30 === 0
      const len = isMajor ? R * 0.13 : R * 0.09
      const angle = deg * DEG_TO_RAD - Math.PI / 2
      
      ctx.moveTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
      ctx.lineTo(Math.cos(angle) * (outer - len), Math.sin(angle) * (outer - len))
    }
    ctx.stroke()

    for (let deg = 0; deg < 360; deg += 30) {
      const angle = deg * DEG_TO_RAD - Math.PI / 2
      const idx = deg / 45
      
      ctx.save()
      ctx.translate(Math.cos(angle) * textRadius, Math.sin(angle) * textRadius)
      ctx.rotate(angle + Math.PI / 2)

      if (Number.isInteger(idx) && CARDINALS[idx]) {
        ctx.fillStyle = deg === 0 ? '#ff4444' : t.needle
        ctx.fillText(CARDINALS[idx], 0, 0)
      } else {
        ctx.fillStyle = t.needle
        ctx.fillText(String(deg / 10), 0, 0)
      }
      ctx.restore()
    }

    ctx.restore()
  }

  _drawBug(cx, cy, R, bug, heading) {
    const { ctx } = this
    const relAngle = (bug - heading) * DEG_TO_RAD
    ctx.save()
    ctx.translate(cx, cy)
    const br = R * 0.98
    ctx.rotate(relAngle)
    ctx.beginPath()
    ctx.moveTo(0, -br)
    ctx.lineTo(-R * 0.06, -(br - R * 0.10))
    ctx.lineTo(-R * 0.06, -(br - R * 0.18))
    ctx.lineTo( R * 0.06, -(br - R * 0.18))
    ctx.lineTo( R * 0.06, -(br - R * 0.10))
    ctx.closePath()
    ctx.fillStyle = this._theme.bugColor
    ctx.fill()
    ctx.restore()
  }

  _drawStaticOverlays(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.translate(cx, cy)

    const outer = R * 0.98

    // 1. Bezel Triangles (90, 180, 270) pointing INWARD toward center (Base touches bezel edge)
    ctx.fillStyle = t.lubberColor
    const baseHalfWidth = R * 0.035
    const triLength = R * 0.07
    const angles = [Math.PI / 2, Math.PI, 3 * Math.PI / 2]

    angles.forEach(angle => {
      ctx.save()
      ctx.rotate(angle)
      ctx.beginPath()
      // Base width layout flat against outer bezel edge, point apex down toward origin
      ctx.moveTo(-baseHalfWidth, -outer)
      ctx.lineTo(baseHalfWidth, -outer)
      ctx.lineTo(0, -(outer - triLength))
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    })

    // 2. Fixed Aircraft Silhouette
    ctx.strokeStyle = t.bugColor
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    ctx.beginPath()
    ctx.moveTo(0, -R * 0.32) // Nose tip pulled down slightly to clear space for heavy top needle
    ctx.lineTo(0, R * 0.35)  // Tail end location
    
    ctx.moveTo(0, -R * 0.10)
    ctx.lineTo(-R * 0.40, R * 0.10)
    ctx.lineTo(-R * 0.40, R * 0.16)
    ctx.lineTo(0, R * 0.05)
    ctx.lineTo(R * 0.40, R * 0.16)
    ctx.lineTo(R * 0.40, R * 0.10)
    ctx.closePath()
    
    ctx.moveTo(0, R * 0.25)
    ctx.lineTo(-R * 0.12, R * 0.35)
    ctx.lineTo(-R * 0.12, R * 0.40)
    ctx.lineTo(0, R * 0.35)
    ctx.lineTo(R * 0.12, R * 0.40)
    ctx.lineTo(R * 0.12, R * 0.35)
    ctx.closePath()
    ctx.stroke()

    // 3. Heavy-Gauge Tapered Top Lubber Needle (Thick base, double-thick red tip terminal)
    const topStemStart = -R * 0.45
    const topTipTransition = -R * 0.76
    const topNeedleEnd = -R * 0.96

    // Tapered White Main Stem
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(-R * 0.018, topStemStart)
    ctx.lineTo(-R * 0.008, topTipTransition)
    ctx.lineTo(R * 0.008, topTipTransition)
    ctx.lineTo(R * 0.018, topStemStart)
    ctx.closePath()
    ctx.fill()

    // Extra Heavy Red Pointer Tip
    ctx.fillStyle = '#ff3333'
    ctx.beginPath()
    ctx.moveTo(-R * 0.024, topTipTransition)
    ctx.lineTo(-R * 0.024, topNeedleEnd)
    ctx.lineTo(R * 0.024, topNeedleEnd)
    ctx.lineTo(R * 0.024, topTipTransition)
    ctx.closePath()
    ctx.fill()

    // 4. Fine White Bottom Line (Fixed straight line tracking from tail end down to marking tips)
    const bottomLineStart = R * 0.45
    const bottomLineEnd = R * 0.85
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, bottomLineStart)
    ctx.lineTo(0, bottomLineEnd)
    ctx.stroke()

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

  _lerpAngle(current, target, factor) {
    if (isNaN(current)) current = 0;
    if (isNaN(target)) target = 0;
    let diff = target - current
    while (diff >  180) diff -= 360
    while (diff < -180) diff += 360
    return current + diff * factor
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'pc6_heading',
  label:    'PC-6 Heading',
  icon:     '🧭',
  order:    40,
  datarefs: DEFAULTS,
  touchControls: true,
}
