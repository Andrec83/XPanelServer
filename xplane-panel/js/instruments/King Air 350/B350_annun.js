import { BaseInstrument } from '../base.js'

const RENDER_THROTTLE_MS = 1 

export const DEFAULTS = {
  L_DC_GEN:        'KA350/ann/lDcGen',
  L_GEN_TIE_OPEN:  'KA350/ann/lGenTieOpen',
  HYD_FLUID_LOW:   'KA350/ann/hydFluidLow',
  RVS_NOT_READY:   'KA350/ann/rvsNotReady',
  R_GEN_TIE_OPEN:  'KA350/ann/rGenTieOpen',
  R_DC_GEN:        'KA350/ann/rDcGen',
  L_CHIP_DETECT:   'KA350/ann/lChipDetect',
  L_NO_FUEL_XFR:   'KA350/ann/lNoFuelXfr',
  BAT_TIE_OPEN:    'KA350/ann/batTieOpen',
  DUCT_OVERTEMP:   'KA350/ann/ductOvertemp',
  R_NO_FUEL_XFR:   'KA350/ann/rNoFuelXfr',
  R_CHIP_DETECT:   'KA350/ann/rChipDetect',
  L_ENG_ICE_FAIL:  'KA350/ann/lEngIceFail',
  L_FUEL_QTY:      'KA350/ann/lFuelQty',
  EXT_PWR:         'KA350/ann/extPwr',
  R_FUEL_QTY:      'KA350/ann/rFuelQty',
  R_ENG_ICE_FAIL:  'KA350/ann/rEngIceFail',
  L_BL_AIR_OFF:    'KA350/ann/lBlAirOff',
  AUTOFEATHER_OFF: 'KA350/ann/autofeatherOff',
  PITCH_TRIM_OFF:  'KA350/ann/pitchTrimOff',
  OXY_NOT_ARMED:   'KA350/ann/oxyNotArmed',
  RUD_BOOST_OFF:   'KA350/ann/rudBoostOff',
  R_BL_AIR_OFF:    'KA350/ann/rBlAirOff',
  L_PITOT_HEAT:    'KA350/ann/lPitotHeat',
  R_PITOT_HEAT:    'KA350/ann/rPitotHeat',
  PROP_GND_SOL:    'KA350/ann/propGndSol',
  L_IGNITION_ON:   'KA350/ann/lIgnitionOn',
  L_ENG_ANTI_ICE:  'KA350/ann/lEngAntiIce',
  FUEL_CROSSFEED:  'KA350/ann/fuelCrossfeed', 
  R_ENG_ANTI_ICE:  'KA350/ann/rEngAntiIce',
  R_IGNITION_ON:   'KA350/ann/rIgnitionOn',
  WING_DEICE:      'KA350/ann/wingDeice',
  L_BK_DEICE_ON:   'KA350/ann/lBkDeiceOn',
  MAN_TIES_CLOSE:  'KA350/ann/manTiesClose',
  ELEC_HEAT_ON:    'KA350/ann/elecHeatOn',
  R_BK_DEICE_ON:   'KA350/ann/rBkDeiceOn',
  TAIL_DEICE:      'KA350/ann/tailDeice',
  L_PROP_PITCH:    'KA350/ann/lPropPitch',
  CABIN_ALTITUDE:  'KA350/ann/cabinAltitude',
  LDG_TAXI_LIGHT:  'KA350/ann/ldgTaxiLight',
  PASS_OXYGEN_ON:  'KA350/ann/passOxygenOn',
  AIR_COND_N1_LOW: 'KA350/ann/airCondN1Low',
  R_PROP_PITCH:    'KA350/ann/rPropPitch',
  DIVIDER_NONE:    'KA350/ann/sNone'
}

const GRID_LAYOUT = [
  // --- ROW 1 (Amber) ---
  { id: 'L_DC_GEN',       label: 'L DC GEN' },
  { id: 'L_GEN_TIE_OPEN', label: 'L GEN TIE OPEN' },
  { id: 'HYD_FLUID_LOW',  label: 'HYD FLUID LOW' },
  { id: 'RVS_NOT_READY',  label: 'RVS NOT READY' },
  { id: 'R_GEN_TIE_OPEN', label: 'R GEN TIE OPEN' },
  { id: 'R_DC_GEN',       label: 'R DC GEN' },

  // --- ROW 2 (Amber) ---
  { id: 'L_CHIP_DETECT',  label: 'L CHIP DETECT' },
  { id: 'L_NO_FUEL_XFR',  label: 'L NO FUEL XFR' },
  { id: 'BAT_TIE_OPEN',   label: 'BAT TIE OPEN' },
  { id: 'DUCT_OVERTEMP',  label: 'DUCT OVERTEMP' },
  { id: 'R_NO_FUEL_XFR',  label: 'R NO FUEL XFR' },
  { id: 'R_CHIP_DETECT',  label: 'R CHIP DETECT' },

  // --- ROW 3 (Amber) ---
  { id: 'L_ENG_ICE_FAIL', label: 'L ENG ICE FAIL' },
  { id: 'L_FUEL_QTY',     label: 'L FUEL QTY' },
  { id: 'DIVIDER_R3_C3',  label: '——————' },
  { id: 'EXT_PWR',        label: 'EXT PWR' },
  { id: 'R_FUEL_QTY',     label: 'R FUEL QTY' },
  { id: 'R_ENG_ICE_FAIL', label: 'R ENG ICE FAIL' },

  // --- ROW 4 (Amber) ---
  { id: 'L_BL_AIR_OFF',   label: 'L BL AIR OFF' },
  { id: 'AUTOFEATHER_OFF',label: 'AUTOFEATHER OFF' },
  { id: 'PITCH_TRIM_OFF', label: 'PITCH TRIM OFF' },
  { id: 'OXY_NOT_ARMED',  label: 'OXY NOT ARMED' },
  { id: 'RUD_BOOST_OFF',  label: 'RUD BOOST OFF' },
  { id: 'R_BL_AIR_OFF',   label: 'R BL AIR OFF' },

  // --- ROW 5 (Amber) ---
  { id: 'L_PITOT_HEAT',   label: 'L PITOT HEAT' },
  { id: 'DIVIDER_R5_C2',  label: '——————' },
  { id: 'DIVIDER_R5_C3',  label: '——————' },
  { id: 'PROP_GND_SOL',   label: 'PROP GND SOL' },
  { id: 'DIVIDER_R5_C5',  label: '——————' },
  { id: 'R_PITOT_HEAT',   label: 'R PITOT HEAT' },

  // --- ROW 6 (Green) ---
  { id: 'L_IGNITION_ON',  label: 'L IGNITION ON' },
  { id: 'L_ENG_ANTI_ICE', label: 'L ENG ANTI-ICE' },
  { id: 'FUEL_CROSSFEED', label: 'FUEL CROSSFEED' },
  { id: 'DIVIDER_R6_C4',  label: '——————' },
  { id: 'R_ENG_ANTI_ICE', label: 'R ENG ANTI-ICE' },
  { id: 'R_IGNITION_ON',  label: 'R IGNITION ON' },

  // --- ROW 7 (Green) ---
  { id: 'WING_DEICE',     label: 'WING DEICE' },
  { id: 'L_BK_DEICE_ON',  label: 'L BK DEICE ON' },
  { id: 'MAN_TIES_CLOSE', label: 'MAN TIES CLOSE' },
  { id: 'ELEC_HEAT_ON',   label: 'ELEC HEAT ON' },
  { id: 'R_BK_DEICE_ON',  label: 'R BK DEICE ON' },
  { id: 'TAIL_DEICE',     label: 'TAIL DEICE' },

  // --- ROW 8 (White) ---
  { id: 'L_PROP_PITCH',   label: 'L PROP PITCH' },
  { id: 'CABIN_ALTITUDE', label: 'CABIN ALTITUDE' },
  { id: 'LDG_TAXI_LIGHT', label: 'LDG/TAXI LIGHT' },
  { id: 'PASS_OXYGEN_ON', label: 'PASS OXYGEN ON' },
  { id: 'AIR_COND_N1_LOW',label: 'AIR COND N1 LOW' },
  { id: 'R_PROP_PITCH',   label: 'R PROP PITCH' }
]

export class KingAir350Annunciator extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs       = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds
    this._targetIntensities = {}  
    this._displayIntensities = {} 
    this._lastDrawTime = 0        

    GRID_LAYOUT.forEach(tile => {
      this._targetIntensities[tile.id] = 0
      this._displayIntensities[tile.id] = 0
    })

    this._hasData = false
  }

  requiredDatarefs() {
    return [...new Set(Object.values(this._drefs))]
  }
  update(state) {
    let receivedUpdate = false

    GRID_LAYOUT.forEach(tile => {
      const lookupKey = tile.id.startsWith('DIVIDER_') ? 'DIVIDER_NONE' : tile.id
      const dref = this._drefs[lookupKey]
      const val = state[dref]
      
      if (val != null) {
        const rawVal = Array.isArray(val) ? val[this.config.engineIndex ?? 0] : val
        this._targetIntensities[tile.id] = Math.max(0, Math.min(1, rawVal))
        receivedUpdate = true
      }
    })

    if (receivedUpdate && !this._hasData) {
      this._hasData = true
      this._dirty = true 
    }
  }
  
  // PHASE 1 LAYER: Clears the background to matte texture ahead of ambient shadow injection
  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) {
      this._drawNoData()
      return
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, w, h)
  }

  // PHASE 2 LAYER: Draws all emissive bezel illumination tiles and warning alphanumeric labels on top
  _renderEmissive() {
    const { ctx, w, h } = this
    if (!this._hasData) return

    ctx.setTransform(1, 0, 0, 1, 0, 0)

    const cols = 6
    const rows = 8 
    const colW = w / cols
    const rowH = h / rows

    const padding = 2          
    const thickBezel = 6       
    const radius = 5           

    const baseFontSize = Math.round(rowH * 0.23)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < GRID_LAYOUT.length; i++) {
      const tile = GRID_LAYOUT[i]
      const colIdx = i % cols
      const rowIdx = Math.floor(i / cols)

      const x = colIdx * colW + padding
      const y = rowIdx * rowH + padding
      const boxW = colW - (padding * 2)
      const boxH = rowH - (padding * 2)

      let r = 255, g = 255, b = 255
      if (rowIdx < 5) {
        r = 255; g = 160; b = 0   
      } else if (rowIdx === 5 || rowIdx === 6) {
        r = 40; g = 220; b = 80   
      }

      const opacity = this._targetIntensities[tile.id] ?? 0
      this._displayIntensities[tile.id] = opacity
      
      const textAlpha = opacity * 0.85 + 0.15
      const frameAlpha = opacity * 0.50 + 0.12

      // LAYER A: DRAW BEZEL INNER BACKGROUND
      ctx.fillStyle = `rgb(${Math.round(r * 0.05)}, ${Math.round(g * 0.05)}, ${Math.round(b * 0.05)})`
      ctx.beginPath()
      ctx.moveTo(x + radius, y)
      ctx.arcTo(x + boxW, y, x + boxW, y + boxH, radius)
      ctx.arcTo(x + boxW, y + boxH, x, y + boxH, radius)
      ctx.arcTo(x, y + boxH, x, y, radius)
      ctx.arcTo(x, y, x + boxW, y, radius)
      ctx.closePath()
      ctx.fill()

      // LAYER B: DRAW THICK ROUNDED BEZEL RIM
      ctx.lineWidth = thickBezel
      ctx.strokeStyle = `rgb(${Math.round(r * frameAlpha)}, ${Math.round(g * frameAlpha)}, ${Math.round(b * frameAlpha)})`
      ctx.beginPath()
      
      const offset = thickBezel / 2
      const bx = x + offset
      const by = y + offset
      const bw = boxW - thickBezel
      const bh = boxH - thickBezel
      const br = Math.max(1, radius - offset)

      ctx.moveTo(bx + br, by)
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, br)
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, br)
      ctx.arcTo(bx, by + bh, bx, by, br)
      ctx.arcTo(bx, by, bx + bw, by, br)
      ctx.closePath()
      ctx.stroke()

      const isDivider = tile.label === '——————'
      const finalFontSize = (tile.label.length > 11 && !isDivider) ? Math.round(baseFontSize * 0.89) : baseFontSize
      ctx.font = `bold ${finalFontSize}px sans-serif`

      // LAYER C: RENDER LIVE PILOT ALERT LABELS
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${textAlpha.toFixed(3)})`
      ctx.fillText(tile.label, x + (boxW / 2), y + (boxH / 2))
    }
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b350_annunciator',
  label:    'King Air Annunciator Panel',
  icon:     '🚨',
  order:    130,
  datarefs: DEFAULTS,
  requires: 'the King Air 350 add-on (publishes the KA350/… datarefs)',
}
