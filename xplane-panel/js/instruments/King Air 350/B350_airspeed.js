// KA350 Airspeed gauge 
// Makes use of cached rendering, still need to insert as a custom King Air Gauge.




import { BaseInstrument } from '../base.js'

// ── CUSTOM AIRCRAFT CALIBRATION ──────────────────────────────────────────
const AIRCRAFT_SPEEDS = {
  vs0:    81,     
  v_vs1:  96,     
  vfe:    158,    
  vfe_app:202,    
  vno:    184,    
  maxKts: 300,    
  vmca:   94,     
  vyse:   125     
}

export const DEFAULTS = {
  kias: 'sim/cockpit2/gauges/indicators/airspeed_kts_pilot',
  vne: 'KA350/systems/maxAirSpeed',
}

export class KingAirAirspeed extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._kias = 0
    this._displayKias = 0
    this._hasData = false
    this._limits = { ...AIRCRAFT_SPEEDS }
    
    // Performance Caching Buffers
    this._cachedDialCanvas = null
    this._lastCachedR = 0
  }

  setAircraftProfile(profile) {}
  setSpeedLimits(limits) {}

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    const v = state[this._drefs.kias]
    if (v == null) return
    this._hasData = true
    
    this._limits.vne = state[this._drefs.vne]
    this._kias = Math.max(0, Math.min(this._limits.maxKts, v))
    this._dirty = true
  }

  _ktsToRad(kts) {
    const CANVAS_UP_ANGLE = -90; 
    let degreesOffset = 0;

    const maxSpeed = this._limits.maxKts;
    if (kts < 0) kts = 0;
    if (kts > maxSpeed) kts = maxSpeed;

    if (kts <= 40) {
      degreesOffset = (kts / 40) * 15;
    } else if (kts <= 160) {
      degreesOffset = 15 + ((kts - 40) / 120) * (175 - 15);
    } else {
      degreesOffset = 175 + ((kts - 160) / 140) * (330 - 175);
    }

    return ((CANVAS_UP_ANGLE + degreesOffset) * Math.PI) / 180;
  }

  _render() {
    const { w, h, ctx } = this
    if (!this._hasData) { this._drawNoData(); return }

    this._displayKias = this._lerp(this._displayKias, this._kias, 0.08)
    this._dirty = Math.abs(this._displayKias - this._kias) > 0.05

    const cx = w / 2, cy = h / 2
    const R  = Math.min(w, h) * 0.44

    this._drawBezel()
    
    ctx.save()
    ctx.translate(cx, cy)
    
    // PERFORMANCE WIN: Blit the static pre-cached dial image straight out of GPU memory
    this._drawDialCached(ctx, R)
    
    // Dynamic overlays are drawn raw on top per frame update
    this._drawBarberPole(0, 0, R, this._limits.vne)
    this._drawNeedle(0, 0, R, this._displayKias)
    this._drawCentreCap(0, 0, R)
    
    ctx.restore() 
  }
  /**
   * Performance Layer: Evaluates if a pre-cached GPU memory texture matches 
   * current tool scale dimensions and blits it straight onto the instrument surface.
   */
  _drawDialCached(mainCtx, R) {
    // If the cache doesn't exist, or if the user resized the simulator panel window, bake a new image
    if (!this._cachedDialCanvas || this._lastCachedR !== R) {
      this._lastCachedR = R;
      
      // Create a completely detached, headless offscreen scratchpad canvas
      this._cachedDialCanvas = document.createElement('canvas');
      // Ensure the square bounds cleanly envelope the entire dial radius footprint
      const size = Math.ceil(R * 2) + 10;
      this._cachedDialCanvas.width = size;
      this._cachedDialCanvas.height = size;
      
      const cacheCtx = this._cachedDialCanvas.getContext('2d');
      const cc = size / 2;
      
      // Render the intensive geometry layout directly into the isolated memory buffer canvas once
      this._drawDialRaw(cacheCtx, cc, cc, R);
    }
    
    // BLIT ACTION: Draw the static buffer directly onto the screen. This runs instantly.
    const halfSize = this._cachedDialCanvas.width / 2;
    mainCtx.drawImage(this._cachedDialCanvas, -halfSize, -halfSize);
  }

  /**
   * The actual layout generator. This is pulled out and now runs EXACTLY ONCE
   * instead of eating your framing time loops 60 times a second.
   */
  _drawDialRaw(ctx, cx, cy, R) {
    const t = this._theme
    
    // ── EXACT MATHEMATICAL BEZEL ROTATION ──────────────────────────────────
    const ONE_KNOT_DEG_OFFSET = 1.660714;
    const BEZEL_OFFSET_RAD = (ONE_KNOT_DEG_OFFSET * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(BEZEL_OFFSET_RAD);
    const lcx = 0, lcy = 0;

    // ── Dial Face Plate Background ──────────────────────────────────────────
    ctx.save()
    ctx.beginPath()
    ctx.arc(lcx, lcy, R, 0, Math.PI * 2)
    ctx.fillStyle = t.dialFace
    ctx.fill()
    ctx.strokeStyle = t.dialRim
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()

    const { vs0, v_vs1, vfe, vfe_app, vmca, vyse } = this._limits

    // ── Upper Text Titles ───────────────────────────────────────────────────
    ctx.save()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(14, R * 0.135)}px sans-serif`
    ctx.fillText('KNOTS', lcx, lcy - R * 0.35)
    ctx.restore()

    // ── Layer 1: Unified Ticks System (Doubled Size & Outer Anchored) ────────
    ctx.save()
    ctx.strokeStyle = t.needle

    for (let kts = 40; kts <= this._limits.maxKts; kts += 5) {
      const angle = this._ktsToRad(kts)
      const is20Kt = (kts % 20 === 0)
      const is10Kt = (kts % 10 === 0) && !is20Kt

      const outerAnchor = R * 1.0 
      let tickLength = 0
      
      if (is20Kt) {
        ctx.lineWidth = 5.0; 
        tickLength = (kts === 200) ? R * 0.08 : R * 0.24; 
      } else if (is10Kt) {
        ctx.lineWidth = 3.0; 
        tickLength = R * 0.16; 
      } else {
        ctx.lineWidth = 2.0; 
        tickLength = R * 0.08; 
      }

      const innerAnchor = outerAnchor - tickLength
      ctx.beginPath()
      ctx.moveTo(lcx + Math.cos(angle) * outerAnchor, lcy + Math.sin(angle) * outerAnchor)
      ctx.lineTo(lcx + Math.cos(angle) * innerAnchor, lcy + Math.sin(angle) * innerAnchor)
      ctx.stroke()
    }
    ctx.restore()

    // ── Layer 2: White Flaps Arc (Stepped Realignment to Outer Ring) ─────────
    ctx.save()
    ctx.lineCap = 'butt'
    ctx.strokeStyle = '#fff'

    const thickWidth = R * 0.07
    const thinWidth = R * 0.035

    for (let kts = vs0; kts < vfe; kts++) {
      if (kts % 5 === 0 || (kts + 1) % 5 === 0) continue

      const startRad = this._ktsToRad(kts)
      const endRad = this._ktsToRad(kts + 1)
      
      ctx.beginPath()
      if (kts < v_vs1) {
        ctx.lineWidth = thickWidth
        const thickRadius = R - (thickWidth / 2)
        ctx.arc(lcx, lcy, thickRadius, startRad, endRad)
      } else {
        ctx.lineWidth = thinWidth
        const thinRadius = R - thickWidth + (thinWidth / 2)
        ctx.arc(lcx, lcy, thinRadius, startRad, endRad)
      }
      ctx.stroke()
    }
    ctx.restore()

    // ── Layer 3: Approach Flaps Triangle (Symmetrical & 50% Bigger) ─────────
    ctx.save()
    const vfeApproachAngle = this._ktsToRad(vfe_app)
    ctx.rotate(vfeApproachAngle)
    
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    
    const triBaseWidth = R * 0.0675
    const triApexHeight = R * 0.0675
    const outerEdgeAnchor = R * 0.88
    
    ctx.moveTo(outerEdgeAnchor, 0)                  
    ctx.lineTo(outerEdgeAnchor - triApexHeight, -triBaseWidth / 2)       
    ctx.lineTo(outerEdgeAnchor - triApexHeight, triBaseWidth / 2)        
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // ── Layer 4: Multi-Engine Radial Safety Blades (3.0 Thickness OVER Face) ──
    ctx.save()
    ctx.lineWidth = 3.0 
    const absoluteOuterRadius = R * 1.0 

    const vmcaAngle = this._ktsToRad(vmca)
    ctx.strokeStyle = '#f00'
    ctx.beginPath()
    ctx.moveTo(lcx + Math.cos(vmcaAngle) * absoluteOuterRadius, lcy + Math.sin(vmcaAngle) * absoluteOuterRadius)
    ctx.lineTo(lcx + Math.cos(vmcaAngle) * (R * 0.5), lcy + Math.sin(vmcaAngle) * (R * 0.5))
    ctx.stroke()

    const vyseAngle = this._ktsToRad(vyse)
    ctx.strokeStyle = '#02f'
    ctx.beginPath()
    ctx.moveTo(lcx + Math.cos(vyseAngle) * absoluteOuterRadius, lcy + Math.sin(vyseAngle) * absoluteOuterRadius)
    ctx.lineTo(lcx + Math.cos(vyseAngle) * (R * 0.5), lcy + Math.sin(vyseAngle) * (R * 0.5))
    ctx.stroke()
    ctx.restore()

    // ── Layer 5: Speed Numbers (Your locked-in 0.65 outward sweep layout) ──
    ctx.save()
    ctx.fillStyle = t.needle
    const fontSize = Math.round(Math.max(10, R * 0.125));
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let kts = 40; kts <= this._limits.maxKts; kts += 20) {
      const angle = this._ktsToRad(kts)
      const textRadius = R * 0.64; // <── Hardcoded directly to your settled specification
      ctx.fillText(String(kts), lcx + Math.cos(angle) * textRadius, lcy + Math.sin(angle) * textRadius)
    }
    ctx.restore()

    // ── Layer 6: Beechcraft Logo (20% Closer to Center Pin) ─────────────────
    ctx.save()
    ctx.font = `italic bold ${Math.max(7, R * 0.135)}px serif`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    const logoY = lcy + R * 0.30
    ctx.fillText('Beechcraft®', lcx, logoY)
    ctx.restore()
    
    ctx.restore() 
  }
  
  // ── Layer 7: Barber Pole Needle (Alternating Square Painted Blocks - Red Tip) ──
  _drawBarberPole(cx, cy, R, vne) {
    const { ctx } = this
    const vneAngle = this._ktsToRad(vne);
    
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(vneAngle)

    const poleThickness = R * 0.0266
    const slantCutLength = (poleThickness * 2) * Math.tan(60 * Math.PI / 180)
    const outerReach = R * 0.80
    
    // The straight arm length begins where the center cap ends, and stops where the tip slant starts
    const innerBound = R * 0.12; 
    const straightEnd = outerReach - slantCutLength;
    const straightLength = straightEnd - innerBound;
    
    // Total of 12 blocks (6 white + 6 red), ending on red against the center cap
    const totalBlocks = 12;
    const blockLength = straightLength / totalBlocks;

    // 1. Draw the 12 Alternating Blocks along the straight shaft
    // Moving inward from the slant start down to the center cap boundary
    for (let i = 0; i < totalBlocks; i++) {
      const blockStart = straightEnd - (i * blockLength);
      const blockEnd = blockStart - blockLength;
      
      // i = 0 is the block touching the tip slant -> must be White
      // Alternates down to i = 11 which touches the center cap -> ends in Red
      ctx.fillStyle = (i % 2 === 0) ? '#fff' : '#f00';
      
      ctx.beginPath();
      ctx.moveTo(blockStart, -poleThickness);
      ctx.lineTo(blockEnd, -poleThickness);
      ctx.lineTo(blockEnd, poleThickness);
      ctx.lineTo(blockStart, poleThickness);
      ctx.closePath();
      ctx.fill();
    }

    // 2. Draw the Solid Red Asymmetric Tip Section
    // This covers the entire narrowing wedge zone cleanly down to the right tip vertex
    ctx.fillStyle = '#f00';
    ctx.beginPath();
    ctx.moveTo(straightEnd, -poleThickness);
    ctx.lineTo(outerReach - slantCutLength, -poleThickness);
    ctx.lineTo(outerReach, poleThickness);
    ctx.lineTo(straightEnd, poleThickness);
    ctx.closePath();
    ctx.fill();

    ctx.restore()
  }

  // ── Layer 8: Primary Airspeed Needle (Asymmetric 30° Wedge - Sweeps on Top) ──
  _drawNeedle(cx, cy, R, kias) {
    const { ctx } = this
    const angle = this._ktsToRad(kias);

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    
    const thickness = R * 0.0319
    const slantCutLength = (thickness * 2) * Math.tan(60 * Math.PI / 180)
    const outerReach = R * 0.88

    ctx.beginPath()
    ctx.moveTo(-R * 0.08, -thickness)
    ctx.lineTo(outerReach - slantCutLength, -thickness) 
    ctx.lineTo(outerReach,  thickness)          
    ctx.lineTo(-R * 0.08,  thickness)
    ctx.closePath()
    
    ctx.fillStyle = this._theme.needle
    ctx.fill()
    ctx.restore()
  }

  // ── Layer 9: Structural Center Spindle Hub Cap ───────────────────────────
  _drawCentreCap(cx, cy, R) {
    const { ctx } = this
    const t = this._theme
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2)
    ctx.fillStyle = t.capFill
    ctx.fill()
    ctx.strokeStyle = t.capStroke
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  static getConfigurationSchema() {
    return {
      title: 'Airspeed Indicator',
      slots: 2, 
      datarefs: [
        { key: 'kias', label: 'Airspeed Dataref', type: 'string', default: DEFAULTS.kias },
        { key: 'vne', label: 'Barber Pole Dataref', type: 'string', default: DEFAULTS.vne }
      ],
      settings: []
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_airspeed',
  label:    'King Air Airspeed',
  icon:     '⏱',
  order:    10,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
}
