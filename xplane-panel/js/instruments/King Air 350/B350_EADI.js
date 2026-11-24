/**
 * ⚡ ANTI-REGRESSION & HIGH-PERFORMANCE CANVAS CACHING BLUEPRINT
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE REFACTORING OR CREATING ANY NEW GAUGE DISPLAY LAYERS.
 * This guide outlines the mandatory architecture for updating or migrating 
 * legacy, raw vector-drawn instruments to high-performance cached variants.
 *
 * 🚨 THE ABSOLUTE RULES OF OPTIMIZATION (WHAT TO DO & WHAT NOT TO DO)
 *
 * 🟩 [DO] 1. MAP AND INDENTIFY EXISTING LAYERS BEFORE TOUCHING CODE
 *          Before changing any rendering code, read the existing loop to identify 
 *          every single discrete layout layer. Instruments range from simple glass 
 *          cutouts to multi-needle mechanical stacks where indicators must cross 
 *          over or under each other. Map out the exact visual hierarchy first.
 *
 * 🟩 [DO] 2. RESPECT AND MAINTAIN THE ESTABLISHED DEPTH ORDER
 *          When refactoring, ensure your code structures execute in the exact same 
 *          sequential order as the working original gauge. Deviating from the baseline 
 *          render order will cause moving backplates, clipping masks, or background 
 *          elements to overwrite your indicators, making them invisible or drawing 
 *          them behind structural plates.
 *          👉 BASE SEQUENCE ALWAYS: Background Elements -> Bottom Mask/Clip Layers 
 *             -> Low-Depth Indicators -> Mid-Depth Moving Elements -> Top-Depth Overlays.
 *
 * 🟩 [DO] 3. CACHE ALL STATIC VECTOR TRACES TO OFFSCREEN CANVAS CONTEXTS
 *          Compile static shapes, geometric layout lines, fonts, and ticks ONCE 
 *          inside an isolated generation engine (like `_ensureViewCache`). Draw them 
 *          onto standalone, invisible offscreen document canvas instances.
 *
 * 🟩 [DO] 4. DETECT TRANSITIONS BY THE LAYOUT SCALE CONTROLLER (R)
 *          Do not run shape math or redraw your cache on every frame. Compare the current 
 *          active resolution scale factor `R` against a tracked memory state variable. 
 *          Only erase and recompile the memory cache when `this._lastCacheR !== R` 
 *          (e.g., when the user resizes or maximizes the window display frame).
 *
 * 🟩 [DO] 5. USE HARDWARE-ACCELERATED IMAGING BLITTING FOR STABLE ASSETS
 *          On active frames where tracking data shifts, replace intensive line math 
 *          and typography calculations with near-instant image blits: 
 *          `ctx.drawImage(this._yourSpecificCachedCanvas, x, y)`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🟥 [DO NOT!] 1. ASSIGN EMPTY ARRAY OBJECT SYNTAX LITERALS Inside the code generator blocks
 *                 Using raw structural arrays like `const bars = [];` can break the 
 *                 system text-formatting compiler layers during text export. Always bypass 
 *                 this constraint securely by using explicit constructor objects:
 *                 👉 WRONG: const ticks =; 
 *                 👉 CORRECT: const ticks = new Array(10, 20, 30);
 *
 * 🟥 [DO NOT!] 2. BIND RENDERING CONTEXT PRIMITIVES TO FIXED CLASS INSTANCE FIELDS
 *                 When writing shared layout primitives or helper routines, pass the targeted 
 *                 canvas rendering context (`ctx` or your offscreen `sCtx`) explicitly as an 
 *                 input parameter. If you hardcode helpers to use `this.ctx`, offscreen buffer 
 *                 drawing tasks will leak onto the active screen, causing major visual artifacts.
 *
 * 🟥 [DO NOT!] 3. RECALCULATE SCALING COEFFICIENTS (S, PX, TAN) ON EVERY RUN
 *                 Keep the primary loop clean of floating-point math and trigonometry. If an 
 *                 element doesn't dynamically transform relative to incoming network data, its 
 *                 math calculations belong inside the setup cache engine, not the active drawing method.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BaseInstrument } from '../base.js'
import { triggerCommand } from '../../xplane-api.js'

export const DEFAULTS = {
  AHARS_pitch_deg: 'sim/cockpit2/gauges/indicators/pitch_AHARS_deg_pilot',
  AHARS_roll_deg:  'sim/cockpit2/gauges/indicators/roll_AHARS_deg_pilot',
  EADIbrightness:  'KA350/instruments/EADI/EADIdispOnX',
  EADI_slip_deg:    'sim/cockpit2/gauges/indicators/slip_deg',
  EADI_DH_bug:    'KA350/instruments/EADI/radioAltimeterBugFtPilot',
  EADI_radio_altitude:    'KA350/instruments/EADI/radioAltHeight',
  EADI_DH_annun:  'KA350/instruments/EADI/showDHannun',
  // Gate 1:
  EADI_show_active_course: 'KA350/instruments/EHSI_Pilot/showActiveCourse',		// 0 none, 1 NAV1, 2 NAV2, 3 FMS1
  // Gate 2:  
  EADI_show_scale_vert: 'KA350/instruments/EADI/showScaleVert', 				// this is the gate for vertical nav only
  // Gates to determine WHAT to show (pointer type, off flags etc.. these determine which source we track for displaying, if red, do not track the actual dot position, only when green mode
  EADI_fms_type_flag: 'KA350/instruments/EHSI_Pilot/fmsTypeFlag',				// 0 FMS1 fail, 1 FMS1 green
  EADI_nav1_type_flag: 'KA350/instruments/EHSI_Pilot/nav1TypeFlag',				// 0 VOR1 fail, 1 LOC1 fail, 2 VOR1 captured(green), 3 LOC1 green
  EADI_nav2_type_flag: 'KA350/instruments/EHSI_Pilot/nav2TypeFlag',				// 0 VOR2 fail, 1 LOC2 fail, 2 VOR2 captured(green), 3 LOC2 green
  // actual navigation to track on the scale, only track according to source
  EADI_nav1_hdef:   'sim/cockpit/radios/nav1_hdef_dot', // full scale is 2.5 to -2.5
  EADI_nav1_vdef:   'sim/cockpit/radios/nav1_vdef_dot', // full scale is 2.5 to -2.5
  EADI_nav2_hdef: 'sim/cockpit/radios/nav2_hdef_dot', // full scale is 2.5 to -2.5
  EADI_nav2_vdef: 'sim/cockpit/radios/nav2_vdef_dot', // full scale is 2.5 to -2.5
  EADI_gps_hdef: 'sim/cockpit/radios/gps_hdef_dot', // full scale is 2.5 to -2.5
  EADI_gps_vdef: 'sim/cockpit/radios/gps_vdef_dot', // full scale is 2.5 to -2.5
  
}

export class KingAirEADI extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._pitch = 0
    this._roll = 0
    this._slip = 0
    this._EADIbrightness = 1.0 
    this._dPitch = 0
    this._dRoll = 0
    this._dSlip = 0
    this._hasData = false

    // Explicitly named cache canvas references
    this._staticMarksCanvas = null
    this._pitchLadderCanvas = null
    this._slipTubeCanvas = null
    this._lastCacheR = 0

    // Radio Altimeter / Decision Height States
    this._radioAltitude = 0
    this._dhSet = 0
    this._dhAnnun = 0

    // =========================================================================
    // NEW MECHANICS: NAVIGATION SUITE TRACKING STATES
    // =========================================================================
    this._showActiveCourse = 0 // 0 = none, 1 = NAV1, 2 = NAV2, 3 = FMS1
    this._showScaleVert = 0    // 0 = off, 1 = on
    
    this._fmsTypeFlag = 0
    this._nav1TypeFlag = 0
    this._nav2TypeFlag = 0
    
    this._nav1Hdef = 0
    this._nav1Vdef = 0
    this._nav2Hdef = 0
    this._nav2Vdef = 0
    this._gpsHdef = 0
    this._gpsVdef = 0

    // Smooth Interpolation Pointers
    this._dLatDeflection = 0
    this._dVertDeflection = 0

    // On-screen controls (hidden when touch controls are switched off in the Panel Manager)
    this.setTouchButtons([
      { id: 'dh-', label: '− DH', repeat: true, onPress: () => triggerCommand('sim/instruments/dh_ref_down').catch(() => {}) },
      { id: 'dh+', label: 'DH +', repeat: true, onPress: () => triggerCommand('sim/instruments/dh_ref_up').catch(() => {}) },
    ])
  }


  requiredDatarefs() { 
    return Object.values(this._drefs) 
  }

  update(state) {
    if (!state) return

    // 1. MASTER CONTROLLING GATE
    const acSource = state[this._drefs.EADI_show_active_course]
    
    // If system is entirely dark, only monitor the supreme entry gate
    if (this._showActiveCourse === 0 && (acSource === 0 || acSource == null)) {
      return
    }

    // Sync Master Course Configuration changes immediately
    if (acSource != null && !isNaN(acSource) && acSource !== this._showActiveCourse) {
      this._showActiveCourse = acSource
      this._dirty = true
    }

    // 2. STANDARD STATE INJECTIONS (Attitude and Altitudes)
    const p = state[this._drefs.AHARS_pitch_deg]
    const r = state[this._drefs.AHARS_roll_deg]
    const b = state[this._drefs.EADIbrightness]
    const s = state[this._drefs.EADI_slip_deg]
    const ra = state[this._drefs.EADI_radio_altitude]
    const dh = state[this._drefs.EADI_DH_bug]
    const annun = state[this._drefs.EADI_DH_annun]
    
    if (p != null && !isNaN(p) && p !== this._pitch) { this._pitch = p; this._hasData = true; this._dirty = true }
    if (r != null && !isNaN(r) && r !== this._roll)   { this._roll  = r; this._dirty = true }
    if (b != null && !isNaN(b) && b !== this._EADIbrightness) { this._EADIbrightness = Math.max(0, Math.min(1, b)); this._dirty = true }
    if (s != null && !isNaN(s) && s !== this._slip)   { this._slip  = s; this._dirty = true }
    if (ra != null && !isNaN(ra) && ra !== this._radioAltitude) { this._radioAltitude = Math.round(ra); this._dirty = true }
    if (dh != null && !isNaN(dh) && dh !== this._dhSet) { this._dhSet = Math.round(dh); this._dirty = true }
    if (annun != null && !isNaN(annun) && annun !== this._dhAnnun) { this._dhAnnun = annun; this._dirty = true }

    // 3. ISOLATED CONDITIONAL SOURCE ROUTING PIPELINES
    // --- MODE 1: NAV1 EXCLUSIVE PIPELINE ---
    if (this._showActiveCourse === 1) {
      const n1T = state[this._drefs.EADI_nav1_type_flag]
      if (n1T != null && !isNaN(n1T) && n1T !== this._nav1TypeFlag) {
        this._nav1TypeFlag = n1T
        this._dirty = true
      }

      if (this._nav1TypeFlag >= 2) {
        // Only monitor showScaleVert if we are specifically in LOC mode (Type 3)
        if (this._nav1TypeFlag === 3) {
          const vGate = state[this._drefs.EADI_show_scale_vert]
          if (vGate != null && vGate !== this._showScaleVert) {
            this._showScaleVert = vGate
            this._dirty = true
          }
          
          if (this._showScaleVert === 1) {
            const vDef = state[this._drefs.EADI_nav1_vdef]
            if (vDef != null && !isNaN(vDef) && vDef !== this._nav1Vdef) {
              this._nav1Vdef = vDef
              this._dirty = true
            }
          }
        }

        // Always track active horizontal deflection if captured
        const hDef = state[this._drefs.EADI_nav1_hdef]
        if (hDef != null && !isNaN(hDef) && hDef !== this._nav1Hdef) {
          this._nav1Hdef = hDef
          this._dirty = true
        }
      }
    }

    // --- MODE 2: NAV2 EXCLUSIVE PIPELINE ---
    else if (this._showActiveCourse === 2) {
      const n2T = state[this._drefs.EADI_nav2_type_flag]
      if (n2T != null && !isNaN(n2T) && n2T !== this._nav2TypeFlag) {
        this._nav2TypeFlag = n2T
        this._dirty = true
      }

      if (this._nav2TypeFlag >= 2) {
        // Only monitor showScaleVert if we are specifically in LOC mode (Type 3)
        if (this._nav2TypeFlag === 3) {
          const vGate = state[this._drefs.EADI_show_scale_vert]
          if (vGate != null && vGate !== this._showScaleVert) {
            this._showScaleVert = vGate
            this._dirty = true
          }
          
          if (this._showScaleVert === 1) {
            const vDef = state[this._drefs.EADI_nav2_vdef]
            if (vDef != null && !isNaN(vDef) && vDef !== this._nav2Vdef) {
              this._nav2Vdef = vDef
              this._dirty = true
            }
          }
        }

        // Always track active horizontal deflection if captured
        const hDef = state[this._drefs.EADI_nav2_hdef]
        if (hDef != null && !isNaN(hDef) && hDef !== this._nav2Hdef) {
          this._nav2Hdef = hDef
          this._dirty = true
        }
      }
    }

    // --- MODE 3: FMS1 EXCLUSIVE PIPELINE ---
    else if (this._showActiveCourse === 3) {
      const fmsT = state[this._drefs.EADI_fms_type_flag]
      if (fmsT != null && !isNaN(fmsT) && fmsT !== this._fmsTypeFlag) {
        this._fmsTypeFlag = fmsT
        this._dirty = true
      }

      if (this._fmsTypeFlag === 1) {
        // FMS bypasses showScaleVert completely and always grabs vertical data stream
        const vDef = state[this._drefs.EADI_gps_vdef]
        if (vDef != null && !isNaN(vDef) && vDef !== this._gpsVdef) {
          this._gpsVdef = vDef
          this._dirty = true
        }

        const hDef = state[this._drefs.EADI_gps_hdef]
        if (hDef != null && !isNaN(hDef) && hDef !== this._gpsHdef) {
          this._gpsHdef = hDef
          this._dirty = true
        }
      }
    }
  }

  _resolveCurrentSource() {
    let rawHdef = 0
    let rawVdef = 0
    let isGreenMode = false
    let isFmsType = false
    let isLocType = false
    let isVorType = false

    if (this._showActiveCourse === 1) {
      if (this._nav1TypeFlag === 2) {
        isVorType = true
        isGreenMode = true
      } else if (this._nav1TypeFlag === 3) {
        isLocType = true
        isGreenMode = true
      }
      
      if (isGreenMode) {
        rawHdef = this._nav1Hdef
        rawVdef = this._nav1Vdef
      }
    } 
    else if (this._showActiveCourse === 2) {
      if (this._nav2TypeFlag === 2) {
        isVorType = true
        isGreenMode = true
      } else if (this._nav2TypeFlag === 3) {
        isLocType = true
        isGreenMode = true
      }
      
      if (isGreenMode) {
        rawHdef = this._nav2Hdef
        rawVdef = this._nav2Vdef
      }
    } 
    else if (this._showActiveCourse === 3) {
      if (this._fmsTypeFlag === 1) {
        isFmsType = true
        isGreenMode = true
        rawHdef = this._gpsHdef
        rawVdef = this._gpsVdef
      }
    }

    this._dLatDeflection  = this._lerp(this._dLatDeflection,  rawHdef, 0.08)
    this._dVertDeflection = this._lerp(this._dVertDeflection, rawVdef, 0.08)

    if (Math.abs(this._dLatDeflection - rawHdef) > 0.01 || Math.abs(this._dVertDeflection - rawVdef) > 0.01) {
      this._dirty = true
    }

    return {
      hdef: this._dLatDeflection,
      vdef: this._dVertDeflection,
      isGreenMode,
      isFmsType,
      isLocType,
      isVorType,
      color: isFmsType ? '#ffffff' : '#00ff00'
    }
  }

  _drawNavPointerShape(ctx, type, color, size, isFilled) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle = 'transparent'
    
    // LOCKED LINE THICKNESS: Matches our equal-legged glideslope triangle profile perfectly
    ctx.lineWidth = 3.0 
    
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (type === 'vor') {
      // VOR: Hollow Circle
      ctx.beginPath()
      ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2)
      ctx.stroke()
    } 
    else if (type === 'fms') {
      // FMS: Hollow 4-Pointed Map Star
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4
        const r = i % 2 === 0 ? size * 0.6 : size * 0.18
        const x = Math.cos(angle) * r
        const y = Math.sin(angle) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
    } 
    else if (type === 'loc-horiz') {
      const baseSize = size * 1.20
      const h = baseSize * 0.70
      const topW = baseSize * 0.32
      const botW = baseSize * 0.65
      
      // 1. Draw Expanded Outer Trapezoid
      ctx.beginPath()
      ctx.moveTo(-topW, -h / 2)
      ctx.lineTo(topW, -h / 2)
      ctx.lineTo(botW, h / 2)
      ctx.lineTo(-botW, h / 2)
      ctx.closePath()
      ctx.stroke()

      // 2. Draw the 2 Internal Straight Vertical Accent Lines
      const innerLineOffset = topW * 0.45 
      ctx.beginPath()
      ctx.moveTo(-innerLineOffset, -h / 2 + 3)
      ctx.lineTo(-innerLineOffset, h / 2 - 3)
      ctx.moveTo(innerLineOffset, -h / 2 + 3)
      ctx.lineTo(innerLineOffset, h / 2 - 3)
      ctx.stroke()
    } 
    else if (type === 'loc-vert') {
      const legLength = size * 1.30 
      const triangleHeight = legLength * 0.866 

      // Single hollow equal-legged triangle pointing left
      ctx.beginPath()
      ctx.moveTo(-triangleHeight / 2, 0)                  
      ctx.lineTo(triangleHeight / 2, -legLength / 2)       
      ctx.lineTo(triangleHeight / 2, legLength / 2)        
      ctx.closePath()
      ctx.stroke()
    }

    ctx.restore()
  }


  _drawNavigationDeviations(ctx, cx, cy, frameW, frameH, R) {
    if (this._showActiveCourse === 0) return

    const src = this._resolveCurrentSource()
    
    const dotSpacing = R * 0.15 * 1.21 
    const elementSize = R * 0.12
    const diaSize = R * 0.022 * 2.0   

    ctx.save()

    // =========================================================================
    // LAYER A: LATERAL (HORIZONTAL) SCALE LAYOUT
    // =========================================================================
    const scaleY = cy + (frameH / 2) - (R * 0.06) 
    
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.75

    // Center Box
    ctx.strokeRect(cx - 3, scaleY - (R * 0.04), 6, R * 0.08)

    // Flanking Diamond Reference Marks
    new Array(-2, -1, 1, 2).forEach(dotIdx => {
      ctx.save()
      ctx.translate(cx + (dotIdx * dotSpacing), scaleY)
      ctx.rotate(45 * Math.PI / 180)
      ctx.strokeRect(-diaSize / 2, -diaSize / 2, diaSize, diaSize)
      ctx.restore()
    })

    // Dynamic Lateral Pointer Tracking
    if (src.isGreenMode) {
      const maxClampDef = Math.max(-2.5, Math.min(2.5, src.hdef))
      const pointerX = cx + ((maxClampDef / 2.5) * (2.0 * dotSpacing))

      ctx.save()
      // Lifted the transformation index further up clear of the bounding box
      ctx.translate(pointerX, scaleY - (R * 0.12))
      
      let ptrType = 'vor'
      if (src.isFmsType) ptrType = 'fms'
      if (src.isLocType) ptrType = 'loc-horiz'

      this._drawNavPointerShape(ctx, ptrType, src.color, elementSize, false)
      ctx.restore()
    }

    // =========================================================================
    // LAYER B: VERTICAL SCALE LAYOUT
    // =========================================================================
    let drawVertical = false
    if (src.isGreenMode) {
      if (src.isFmsType) {
        drawVertical = true
      } else if (src.isLocType && this._showScaleVert === 1) {
        drawVertical = true
      }
    }

    if (drawVertical) {
      const scaleX = cx + (frameW / 2) - (R * 0.36) 

      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.75

      // Vertical Reference Scale Marks
      new Array(-2, -1, 1, 2).forEach(dotIdx => {
        ctx.save()
        ctx.translate(scaleX, cy + (dotIdx * dotSpacing))
        ctx.rotate(45 * Math.PI / 180)
        ctx.strokeRect(-diaSize / 2, -diaSize / 2, diaSize, diaSize)
        ctx.restore()
      })

      // Dynamic Vertical Pointer Tracking
      const maxClampDef = Math.max(-2.5, Math.min(2.5, src.vdef))
      const pointerY = cy + ((maxClampDef / 2.5) * (2.0 * dotSpacing))

      ctx.save()
      ctx.translate(scaleX + (diaSize / 2) + (R * 0.1), pointerY)
      
      let ptrType = 'vor'
      if (src.isFmsType) ptrType = 'fms'
      if (src.isLocType) ptrType = 'loc-vert'

      this._drawNavPointerShape(ctx, ptrType, src.color, elementSize, false)
      ctx.restore()
    }

    ctx.restore()
  }


  _getPitchY(deg, PX) {
    return deg * PX
  }

  _ensureViewCache(R, PX, w, h) {
    if (this._staticMarksCanvas && this._lastCacheR === R) return;

    this._lastCacheR = R;
    const cx = w / 2;
    const cy = h / 2; 

    // =========================================================================
    // LAYER 1: STATIC MARKS CANVAS GENERATION (ARC TICKS & AIRCRAFT WINGS)
    // =========================================================================
    if (!this._staticMarksCanvas) {
      this._staticMarksCanvas = document.createElement('canvas');
    }
    this._staticMarksCanvas.width = w;
    this._staticMarksCanvas.height = h;
    
    const sCtx = this._staticMarksCanvas.getContext('2d');
    
    // 1. Draw the Static Roll Arc Scale Ticks
    sCtx.save();
    sCtx.translate(cx, cy);
    sCtx.strokeStyle = '#ffffff';
    const baseArcR = R * 0.80;
    const majorTicks = new Array(30, 60);
    const ticks = new Array(10, 20, 30, 60);

    ticks.forEach(deg => {
      new Array(-1, 1).forEach(side => {
        const angle = (deg * side - 90) * Math.PI / 180;
        const isMajor = majorTicks.includes(deg);
        const len = isMajor ? R * 0.11 : R * 0.07;
        sCtx.lineWidth = isMajor ? 2.5 : 1.5;

        sCtx.beginPath();
        sCtx.moveTo(Math.cos(angle) * baseArcR, Math.sin(angle) * baseArcR);
        sCtx.lineTo(Math.cos(angle) * (baseArcR + len), Math.sin(angle) * (baseArcR + len));
        sCtx.stroke();
      });
    });

    // 2. Draw the 45-degree inward static triangles on the Arc
    new Array(-1, 1).forEach(side => {
      const sideAngle = (45 * side - 90) * Math.PI / 180;
      this._drawInstrumentTriangle(sCtx, sideAngle, baseArcR, R * 0.07, R * 0.04, true, true);
    });
    
    // 3. Draw the Static Center Bank Pointer Index (Top center point)
    const centerAngle = -90 * Math.PI / 180;
    this._drawInstrumentTriangle(sCtx, centerAngle, baseArcR, R * 0.10, R * 0.05, true, true);
    sCtx.restore();

    // 4. Draw the Foreground Miniature Aircraft Symbol directly into this layer
    sCtx.save();
    sCtx.translate(cx, cy);
    const S = (R * 2.30) / 14;
    const mainLineLength = 8 * S;
    const rectW = 1 * S;
    const rectH = 0.2 * S;
    const wingSpan = (mainLineLength / 2) + rectW;
    const halfBoomerangW = (6 * S) / 2;
    const bottomCenterY = 3.5 * (R / 30.0);
    const topWingDropY = halfBoomerangW * Math.tan(20 * Math.PI / 180);

    sCtx.strokeStyle = '#ffffff'; 
    sCtx.lineWidth = 1.5; 
    sCtx.beginPath();
    sCtx.moveTo(-mainLineLength / 2, 0); sCtx.lineTo(mainLineLength / 2, 0);
    sCtx.stroke();

    sCtx.beginPath(); sCtx.rect(-wingSpan, -rectH / 2, rectW, rectH); sCtx.stroke();
    sCtx.beginPath(); sCtx.rect(wingSpan - rectW, -rectH / 2, rectW, rectH); sCtx.stroke();

    sCtx.beginPath();
    sCtx.moveTo(0, 0); sCtx.lineTo(halfBoomerangW, topWingDropY);
    sCtx.lineTo(0, bottomCenterY); sCtx.lineTo(-halfBoomerangW, topWingDropY);
    sCtx.closePath();
    sCtx.fillStyle = '#000000'; sCtx.fill();

    sCtx.strokeStyle = '#ffcc00'; sCtx.lineWidth = 1.5; sCtx.lineCap = 'round'; sCtx.lineJoin = 'round';
    sCtx.beginPath(); sCtx.moveTo(-halfBoomerangW, topWingDropY); sCtx.lineTo(0, 0); sCtx.stroke();
    sCtx.beginPath(); sCtx.moveTo(0, 0); sCtx.lineTo(halfBoomerangW, topWingDropY); sCtx.stroke();
    sCtx.beginPath(); sCtx.moveTo(0, bottomCenterY); sCtx.lineTo(-halfBoomerangW, topWingDropY); sCtx.stroke();
    sCtx.beginPath(); sCtx.moveTo(0, bottomCenterY); sCtx.lineTo(halfBoomerangW, topWingDropY); sCtx.stroke();
    sCtx.restore();

    // =========================================================================
    // LAYER 2: PITCH LADDER CANVAS GENERATION
    // =========================================================================
    const maxDeg = 30;
    const stripW = Math.ceil(R * 0.8) || 150; 
    const stripH = Math.ceil(maxDeg * 2 * PX) + 40;

    if (!this._pitchLadderCanvas) {
      this._pitchLadderCanvas = document.createElement('canvas');
    }
    this._pitchLadderCanvas.width = stripW;
    this._pitchLadderCanvas.height = stripH;

    const oCtx = this._pitchLadderCanvas.getContext('2d');
    const midX = stripW / 2;
    const midY = stripH / 2;
    
    oCtx.save();
    oCtx.strokeStyle = '#ffffff';
    oCtx.fillStyle   = '#ffffff';
    const fs = Math.max(9, R * 0.10);
    oCtx.font = `bold ${fs}px sans-serif`;
    oCtx.textBaseline = 'middle';
    oCtx.lineWidth = 2;

    const bars = new Array(5, 10, 15, 20, 25, 30);
    
    bars.forEach(deg => {
      new Array(-1, 1).forEach(side => {
        const yOffset = (deg * side) * PX;
        const targetY = midY - yOffset;
        const isMajor = deg % 10 === 0;
        const barWidth = isMajor ? R * 0.126 : R * 0.063;

        oCtx.beginPath();
        oCtx.moveTo(midX - barWidth, targetY);
        oCtx.lineTo(midX + barWidth, targetY);
        oCtx.stroke();

        if (isMajor) {
          oCtx.textAlign = 'left';
          oCtx.fillText(String(deg), midX + barWidth + R * 0.04, targetY);
        }
      });
    });
    oCtx.restore();

    this._cachedLadderMidX = midX;
    this._cachedLadderMidY = midY;

    // =========================================================================
    // LAYER 3: SLIP TUBE CANVAS GENERATION (Locked strictly to centered cy)
    // =========================================================================
    if (!this._slipTubeCanvas) {
      this._slipTubeCanvas = document.createElement('canvas');
    }
    this._slipTubeCanvas.width = w;
    this._slipTubeCanvas.height = h;

    const tCtx = this._slipTubeCanvas.getContext('2d');
    const baseBallR = R * 0.055; // Restored to exact stock thickness scale profile
    const trackY = cy + (R * 0.98); 
    
    // Curve configuration
    const startX = cx - R * 0.25;
    const endX = cx + R * 0.25;
    const arcSag = R * 0.034;  // Adjust this value to make the arc deeper or shallower

    tCtx.save();
    tCtx.strokeStyle = '#ffffff';
    tCtx.lineWidth = baseBallR * 2.4; // Restored back to your original tube line width
    tCtx.lineCap = 'round';
    tCtx.beginPath();
    
    // Draw slight arc using a quadratic curve
    tCtx.moveTo(startX, trackY);
    tCtx.quadraticCurveTo(cx, trackY + arcSag, endX, trackY);
    
    tCtx.stroke();
    tCtx.restore();
    }

  _render() {
    const { ctx, w, h } = this;
    if (!this._hasData) return;

    this._dSlip = this._lerp(this._dSlip, this._slip, 0.08);

    if (Math.abs(this._dSlip - this._slip) > 0.02) {
      this._dirty = true;
    }

    const R  = Math.min(w, h) * 0.46 || 1;
    const PX = R / 35.4;

    this._ensureViewCache(R, PX, w, h);

    //===== LAYER 0: BACKGROUND BLACKOVER PASS =====
    ctx.save();
    ctx.fillStyle = '#000000'; 
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // =========================================================================
    // MASTER LIFECYCLE WRAPPER:
    // Placed right before inner draws begin. Closes cleanly at the end.
    // =========================================================================
    ctx.save(); 
    ctx.translate(w / 2, h / 2); ctx.scale(0.9, 0.9); ctx.translate(-w / 2, -h / 2);

    if (this._slipTubeCanvas) {
      ctx.drawImage(this._slipTubeCanvas, 0, 0);
    }

    const cx = w / 2;
    const cy = h / 2;
    const trackY = cy + (R * 0.98); 
    const ballR = R * 0.066; 
    const arcSag = R * 0.034;  // Controls the depth of the arc bend (matches the tube canvas)

    const maxSlip = 8;
    const slipClamped = Math.max(-maxSlip, Math.min(maxSlip, this._dSlip));
    
    // 1. Calculate normalized position 't' from 0.0 (left) to 1.0 (right)
    const t = 0.5 - ((slipClamped / maxSlip) * 0.25);

    // 2. Define the exact endpoints of the tube path
    const startX = cx - R * 0.25;
    const endX = cx + R * 0.25;

    // 3. Compute ball position along the quadratic Bezier curve
    const bx = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * cx + t * t * endX;
    const by = (1 - t) * (1 - t) * trackY + 2 * (1 - t) * t * (trackY + arcSag) + t * t * trackY;

    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by + 0.5, ballR, 0, Math.PI * 2);
    ctx.fillStyle = '#000000'; 
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#60656a'; 
    ctx.lineWidth = 2;         
    
    const tubeTicks = new Array(-ballR * 1.2, ballR * 1.2); 
    const lineHalfLength = ballR * 1.06; 

    // Ticks remain perfectly vertical, dynamically shifting vertically to match the glass curve
    tubeTicks.forEach(dx => {
      const tickX = cx + dx;
      
      // Calculate where this tick falls on the 0 to 1 scale across the tube length
      const tickT = (tickX - startX) / (endX - startX);
      
      // Sample the vertical height of the curved glass tube at this specific horizontal coordinate
      const curveY = (1 - tickT) * (1 - tickT) * trackY + 2 * (1 - tickT) * tickT * (trackY + arcSag) + tickT * tickT * trackY;

      ctx.beginPath();
      ctx.moveTo(tickX, curveY - lineHalfLength);
      ctx.lineTo(tickX, curveY + lineHalfLength); // Shared tickX ensures line stays completely straight/vertical
      ctx.stroke();
    });
    ctx.restore();

    // Clean exit cleanup gate
    ctx.restore();
  }


  
  _renderEmissive() {
    const { ctx, w, h } = this

    // =========================================================================
    // MASTER LIFECYCLE BOUNDARY GATE:
    // Every single early return, data exit path, or blackout fill is now 
    // fully protected underneath this master boundary. Scale can NEVER stack.
    // =========================================================================
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.scale(0.9, 0.9); ctx.translate(-w / 2, -h / 2);
    // =========================================================================

    if (!this._hasData) { 
      this._drawNoData()
      ctx.restore() // Clean matrix exit path on data failure
      return 
    }
    
    const cyOffset = -14 
    const cx = w / 2
    const cy = (h / 2) + cyOffset 
    const R  = Math.min(w, h) * 0.46 || 1
    
    const frameW = R * 2.30            
    const frameH = R * 1.86            

    if (this._EADIbrightness <= 0) {
      ctx.save()
      ctx.clearRect(cx - frameW / 2, cy - frameH / 2, frameW, frameH)
      ctx.fillStyle = '#000000' 
      ctx.fillRect(cx - frameW / 2, cy - frameH / 2, frameW, frameH)
      ctx.restore()
      ctx.restore() // Clean matrix exit path on blackout
      return 
    }

    ctx.save()
    ctx.globalAlpha = this._EADIbrightness

    this._dPitch = this._lerp(this._dPitch, this._pitch, 0.08)
    this._dRoll  = this._lerp(this._dRoll,  this._roll,  0.08)
    
    if (Math.abs(this._dPitch - this._pitch) > 0.02 || Math.abs(this._dRoll - this._roll) > 0.02) {
      this._dirty = true
    }

    const PX = R / 32.0

    ctx.save()
    ctx.beginPath()
    const frameCornerRadius = R * 0.28 
    ctx.roundRect(cx - frameW / 2, cy - frameH / 2, frameW, frameH, frameCornerRadius)
    ctx.clip() 

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-this._dRoll * Math.PI / 180)

    const horizonY = this._getPitchY(this._dPitch, PX)
    ctx.fillStyle = '#1074ab'
    ctx.fillRect(-w * 2, -h * 2, w * 4, h * 2 + horizonY)
    ctx.fillStyle = '#683818'
    ctx.fillRect(-w * 2, horizonY, w * 4, h * 2)

    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-w * 2, horizonY)
    ctx.lineTo(w * 2, horizonY)
    ctx.stroke()

    ctx.save()
    ctx.beginPath()
    ctx.rect(-w, -R * 0.65, w * 2, R * 1.26);  
    ctx.clip()

    ctx.translate(0, horizonY)
    this._drawPitchLadder(ctx)
    ctx.restore()

    ctx.restore() 

    this._drawRollPointer(cx, cy, R, this._dRoll)
    ctx.restore() 

    ctx.drawImage(this._staticMarksCanvas, 0, cyOffset)

    // =========================================================================
    // INJECT NAVIGATION INSTRUMENTATION DATA RUNWAYS:
    // Placed high up to write clean layout indicators directly on top of the
    // active background passes.
    // =========================================================================
    this._drawNavigationDeviations(ctx, cx, cy, frameW, frameH, R)
    
    this._drawDecisionHeightLayers(ctx, cx, cy, frameW, frameH, R)
    
    // Pops the alpha scope and then the global master scaling lifecycle group smoothly
    ctx.restore(); ctx.restore() 
  }



  _drawDecisionHeightLayers(ctx, cx, cy, frameW, frameH, R) {
    const rightEdge = cx + (frameW / 2) - (R * 0.08)
    const bottomEdge = cy + (frameH / 2) - (R * 0.08)
    
    ctx.save()
    const fontSize = Math.max(11, Math.round(R * 0.11))
    
    // 1. Radio Altitude (Bright Green) - Top Row (Only drawn under 2000 ft)
    if (this._radioAltitude >= 0 && this._radioAltitude <= 2000) {
      const raFontSize = Math.round(fontSize * 1.4)
      ctx.font = `bold ${raFontSize}px sans-serif`
      ctx.textBaseline = 'bottom'
      ctx.textAlign = 'right'
      ctx.fillStyle = '#00ff00'
      ctx.fillText(String(this._radioAltitude), rightEdge, bottomEdge - fontSize - 12)
    }

    // 2. DH Bug Marker (Neon Electronic Blue) - Bottom Row
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#007aff' // Match user interface button blue
    
    // Clean Alternating Compromise: Hides when dataref is 1, visible when dataref is 0
    if (this._dhAnnun !== 1) {
      ctx.fillText(`DH ${this._dhSet}`, rightEdge, bottomEdge)
    }

    // 3. Side Warning (Yellow Alert Banner)
    // Visible only when the dataref pulses to 1, creating the clean flip-flop effect
    if (this._dhAnnun === 1) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const alertFontSize = Math.max(16, Math.round(R * 0.18))
      ctx.font = `bold ${alertFontSize}px sans-serif`
      ctx.fillStyle = '#ffff00'
      
      // Shifted left off-center to sit next to the ladder lines instead of on top
      ctx.fillText('DH', cx - (R * 0.45), cy - (R * 0.2))
    }

    ctx.restore()
  }




  // Patched to use the passed context drawing handle safely
  _drawPitchLadder(ctx) {
    ctx.drawImage(
      this._pitchLadderCanvas,
      -this._cachedLadderMidX,
      -this._cachedLadderMidY
    )
  }

  _drawInstrumentTriangle(ctx, angleRad, radius, height, halfWidth, pointingInward, isStatic = false) {
    ctx.save();
    const finalRotation = isStatic ? (angleRad + Math.PI / 2) : angleRad;
    ctx.rotate(finalRotation);
    ctx.beginPath();
    
    ctx.moveTo(0, -radius);
    
    const baseSign = pointingInward ? -1 : 1;
    const baseY = -radius + (height * baseSign);
    
    ctx.lineTo(-halfWidth, baseY);
    ctx.lineTo( halfWidth, baseY);
    ctx.closePath();
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.75; 
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  _drawRollPointer(cx, cy, R, roll) {
    const { ctx } = this;
    const baseArcR = R * 0.80; 
    ctx.save();
    ctx.translate(cx, cy);
    
    const rollAngle = -roll * Math.PI / 180;
    this._drawInstrumentTriangle(
      ctx, 
      rollAngle, 
      baseArcR, 
      R * 0.11,  
      R * 0.06,  
      false,     
      false      
    );
    ctx.restore();
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_eadi',
  label:    'King Air EADI',
  icon:     '✈',
  order:    20,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
  touchControls: true,
}
