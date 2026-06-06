import { BaseInstrument } from './base.js'
import { writeDataref, triggerCommand, searchCommands } from '../xplane-api.js'

export const DEFAULTS = {
  ap_on:          'sim/cockpit2/autopilot/autopilot_on',
  fd_mode:        'sim/cockpit2/autopilot/flight_director_mode',
  heading_dial:   'sim/cockpit2/autopilot/heading_dial_deg_mag_pilot',
  altitude_dial:  'sim/cockpit2/autopilot/altitude_dial_ft',
  vvi_dial:       'sim/cockpit2/autopilot/vvi_dial_fpm',
  airspeed_dial:  'sim/cockpit2/autopilot/airspeed_dial_kts',
  heading_mode:   'sim/cockpit2/autopilot/heading_mode',
  altitude_mode:  'sim/cockpit2/autopilot/altitude_mode',
  athr_on:        'sim/cockpit2/autopilot/autothrottle_on',
  athr_arm:       'sim/cockpit2/autopilot/autothrottle_arm',
  hnav_armed:     'sim/cockpit2/autopilot/hnav_armed',
  glideslope_armed: 'sim/cockpit2/autopilot/glideslope_armed',
  alt_hold_armed: 'sim/cockpit2/autopilot/altitude_hold_armed',
  bkcrse_on:      'sim/cockpit2/autopilot/backcourse_on',
  heading_status: 'sim/cockpit2/autopilot/heading_status',
  nav_status:     'sim/cockpit2/autopilot/nav_status',
  alt_hold_status:'sim/cockpit2/autopilot/altitude_hold_status',
  vvi_status:     'sim/cockpit2/autopilot/vvi_status',
  speed_status:   'sim/cockpit2/autopilot/speed_status',
  gls_status:     'sim/cockpit2/autopilot/glideslope_status',
  TOGA_status:    'sim/cockpit2/autopilot/TOGA_status',
}

// Mode names for display
const LAT_MODES = {
  0: 'ROLL', 1: 'HDG', 2: 'NAV', 10: 'TO/GA', 11: 'RE-ENTRY', 12: 'FREE',
  13: 'GPSS', 14: 'HDG HOLD', 15: 'TURN', 16: 'ROLLOUT', 18: 'TRK',
}

const VERT_MODES = {
  3: 'PITCH', 4: 'VS', 5: 'FLCH', 6: 'ALT', 7: 'TERRAIN', 8: 'GS',
  9: 'VPATH', 10: 'TO/GA', 11: 'RE-ENTRY', 12: 'FREE', 17: 'FLARE',
  19: 'FPA', 20: 'VSPD',
}

const STATUS_LABEL = { 0: 'OFF', 1: 'ARM', 2: 'ACTIVE' }

export class AutopilotPanel extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds

    this._apOn       = 0
    this._fdMode     = 0
    this._hdgDial    = 0
    this._altDial    = 0
    this._vviDial    = 0
    this._spdDial    = 0
    this._hdgMode    = 0
    this._altMode    = 0
    this._athrOn     = 0
    this._athrArm    = 0
    this._hnavArmed  = 0
    this._gsArmed    = 0
    this._altArmed   = 0
    this._bkcrse     = 0
    this._hdgStatus  = 0
    this._navStatus  = 0
    this._altStatus  = 0
    this._vviStatus  = 0
    this._spdStatus  = 0
    this._glsStatus  = 0
    this._togaStatus = 0

    this._displayValues = {
      hdg: 0, alt: 0, vvi: 0, spd: 0
    }
    this._hasData = false

    // Aircraft capability flags (updated by setCapabilities after boot detection)
    this._hasAutothrottle = true
    // Aircraft-defined step increments (updated by setApSteps after boot detection)
    this._vviStep = 100
    this._altStep = 100

    // Knob state
    this._activeKnob = null   // 'hdg' | 'alt' | 'vvi' | 'spd'
    this._knobDir    = 0      // -1 dec, +1 inc
    this._holdTimer  = null
    this._repeatTimer = null

    // Flash state for button feedback
    this._flash = {}

    this._setupPointer()
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  setResolvedIds(ids) { this._resolvedIds = ids }

  setAircraftProfile(profile) {
    this.setCapabilities({ hasAutothrottle: profile.autopilot.hasAutothrottle })
    this.setApSteps(profile.autopilot.vviStep, profile.autopilot.altStep)
  }

  setCapabilities({ hasAutothrottle = true } = {}) {
    this._hasAutothrottle = hasAutothrottle
    this._dirty = true
  }

  setApSteps(vviStep, altStep) {
    if (vviStep >= 50) this._vviStep = vviStep
    if (altStep >= 50) this._altStep = altStep
  }

  update(state) {
    const d = this._drefs
    const get = (key) => state[d[key]]

    if (get('ap_on') != null) {
      // DEBUG — log dial values when they change
      const prev = { hdg: this._hdgDial, alt: this._altDial, vvi: this._vviDial, spd: this._spdDial }

      this._apOn       = get('ap_on')       ?? this._apOn
      this._fdMode     = get('fd_mode')     ?? this._fdMode
      this._hdgDial    = get('heading_dial') ?? this._hdgDial
      this._altDial    = get('altitude_dial') ?? this._altDial
      this._vviDial    = get('vvi_dial')     ?? this._vviDial
      this._spdDial    = get('airspeed_dial') ?? this._spdDial
      this._hdgMode    = get('heading_mode') ?? this._hdgMode
      this._altMode    = get('altitude_mode') ?? this._altMode
      this._athrOn     = get('athr_on')      ?? this._athrOn
      this._athrArm    = get('athr_arm')     ?? this._athrArm
      this._hnavArmed  = get('hnav_armed')   ?? this._hnavArmed
      this._gsArmed    = get('glideslope_armed') ?? this._gsArmed
      this._altArmed   = get('alt_hold_armed') ?? this._altArmed
      this._bkcrse     = get('bkcrse_on')    ?? this._bkcrse
      this._hdgStatus  = get('heading_status') ?? this._hdgStatus
      this._navStatus  = get('nav_status')   ?? this._navStatus
      this._altStatus  = get('alt_hold_status') ?? this._altStatus
      this._vviStatus  = get('vvi_status')   ?? this._vviStatus
      this._spdStatus  = get('speed_status') ?? this._spdStatus
      this._glsStatus  = get('gls_status')   ?? this._glsStatus
      this._togaStatus = get('TOGA_status')  ?? this._togaStatus
      this._hasData = true

      // DEBUG — only log when a dial value actually changed
      if (this._hdgDial !== prev.hdg) console.log(`[AP] ← xplane hdg_dial: ${prev.hdg} → ${this._hdgDial}`)
      if (this._altDial !== prev.alt) console.log(`[AP] ← xplane alt_dial: ${prev.alt} → ${this._altDial}`)
      if (this._vviDial !== prev.vvi) console.log(`[AP] ← xplane vvi_dial: ${prev.vvi} → ${this._vviDial}`)
      if (this._spdDial !== prev.spd) console.log(`[AP] ← xplane spd_dial: ${prev.spd} → ${this._spdDial}`)
    }
    this._dirty = true
  }

  // ── pointer interaction ──────────────────────────────────────────────────

  _setupPointer() {
    const c = this.canvas
    c.style.touchAction = 'none'

    const px = (e) => { const r = c.getBoundingClientRect(); return e.clientX - r.left }
    const py = (e) => { const r = c.getBoundingClientRect(); return e.clientY - r.top }

    const stopKnobRepeat = () => {
      clearTimeout(this._holdTimer)
      clearInterval(this._repeatTimer)
      this._holdTimer = null
      this._repeatTimer = null
      this._activeKnob = null
      this._knobDir = 0
    }

    const startKnobRepeat = (knob, dir) => {
      this._activeKnob = knob
      this._knobDir = dir
      this._adjustKnob()
      this._holdTimer = setTimeout(() => {
        this._repeatTimer = setInterval(() => this._adjustKnob(), 100)
      }, 350)
    }

    c.addEventListener('pointerdown', e => {
      const x = px(e), y = py(e)
      const zone = this._hitTest(x, y)
      if (!zone) return

      if (zone.type === 'knob_dec') {
        startKnobRepeat(zone.knob, -1)
      } else if (zone.type === 'knob_inc') {
        startKnobRepeat(zone.knob, 1)
      } else if (zone.type === 'button') {
        this._handleButton(zone.id)
        this._flash[zone.id] = Date.now()
      }
      this._dirty = true
      c.setPointerCapture(e.pointerId)
    })

    c.addEventListener('pointermove', e => {
      const zone = this._hitTest(px(e), py(e))
      c.style.cursor = (zone?.type === 'button' || zone?.type === 'knob_dec' || zone?.type === 'knob_inc') ? 'pointer' : 'default'
    })
    c.addEventListener('pointerup',   () => { stopKnobRepeat(); this._dirty = true })
    c.addEventListener('pointercancel', () => { stopKnobRepeat(); this._dirty = true })
  }

  _adjustKnob() {
    const knob = this._activeKnob
    const dir  = this._knobDir
    // Compute the target value from last known sim state and write it.
    // No local update — the display always reflects what X-Plane reports back.
    if (knob === 'hdg') {
      const v = ((this._hdgDial + dir) % 360 + 360) % 360
      console.log(`[AP] hdg: current=${this._hdgDial} dir=${dir} → writing ${v}`)
      this._writeDref('heading_dial', v)
    } else if (knob === 'alt') {
      const v = Math.max(-1000, Math.min(60000, this._altDial + dir * this._altStep))
      console.log(`[AP] alt: current=${this._altDial} step=${this._altStep} dir=${dir} → writing ${v}`)
      this._writeDref('altitude_dial', v)
    } else if (knob === 'vvi') {
      const step = this._vviStep
      const v = Math.round(Math.max(-6000, Math.min(6000, this._vviDial + dir * step)) / step) * step
      console.log(`[AP] vvi: current=${this._vviDial} step=${step} dir=${dir} → writing ${v}`)
      this._writeDref('vvi_dial', v)
    } else if (knob === 'spd') {
      const v = Math.max(20, Math.min(450, this._spdDial + dir))
      console.log(`[AP] spd: current=${this._spdDial} dir=${dir} → writing ${v}`)
      this._writeDref('airspeed_dial', v)
    }
    this._dirty = true
  }

  _writeDref(key, val) {
    const id = this._resolvedIds[this._drefs[key]]
    if (id != null) writeDataref(id, val).catch((err) => console.warn(`[AP] write failed for ${key}:`, err))
  }

  _handleButton(btn) {
    // Use commands for most functions
    const cmdMap = {
      ap_master:  'sim/autopilot/servos_toggle',
      fd:         'sim/autopilot/fdir_toggle',
      hdg:        'sim/autopilot/heading',
      nav:        'sim/autopilot/NAV',
      apr:        'sim/autopilot/approach',
      vs:         'sim/autopilot/vertical_speed',
      alt:        'sim/autopilot/altitude_hold',
      flch:       'sim/autopilot/level_change',
      athr:       'sim/autopilot/autothrottle_toggle',
      bc:         'sim/autopilot/back_course',
      toga:       'sim/autopilot/take_off_go_around',
    }
    const cmd = cmdMap[btn]
    if (cmd) {
      console.log(`[AP] button "${btn}" → command "${cmd}"`)
      triggerCommand(cmd)
        .then(() => console.log(`[AP] command OK: "${cmd}"`))
        .catch((err) => {
          console.warn(`[AP] command FAILED: "${cmd}"`, err.message)
          console.log('[AP] available autopilot commands:', searchCommands('autopilot'))
        })
    } else {
      console.warn(`[AP] button "${btn}" has no command mapping`)
    }
    this._flash[btn] = Date.now()
  }

  // ── hit testing ──────────────────────────────────────────────────────────

  _hitTest(x, y) {
    const { w, h } = this
    const relX = x / w, relY = y / h

    if (relY < 0.15) {
      // Status strip: AP and FD circles are clickable
      if (relX < 0.14) return { type: 'button', id: 'ap_master' }
      if (relX < 0.27) return { type: 'button', id: 'fd' }
      if (this._hasAutothrottle && relX < 0.38) return { type: 'button', id: 'athr' }
      return null
    }
    if (relY < 0.55) {
      // Knob row: HDG, ALT, VVI, [SPD if autothrottle]
      const knobs = ['hdg', 'alt', 'vvi']
      if (this._hasAutothrottle) knobs.push('spd')
      const col  = Math.floor(relX * knobs.length)
      const colX = (relX * knobs.length) % 1
      if (col < 0 || col >= knobs.length) return null
      if (colX < 0.35) return { type: 'knob_dec', knob: knobs[col] }
      if (colX > 0.65) return { type: 'knob_inc', knob: knobs[col] }
      return null // centre display area
    }
    if (relY < 0.60) return null  // narrow gap between knob and button sections
    // Button row: HDG, NAV, APR, BC, ALT, VS, FLCH, [A/THR if autothrottle]
    const btns = ['hdg', 'nav', 'apr', 'bc', 'alt', 'vs', 'flch']
    if (this._hasAutothrottle) btns.push('athr')
    const col = Math.floor(relX * btns.length)
    if (col < 0 || col >= btns.length) return null
    return { type: 'button', id: btns[col] }
  }

  // ── render ───────────────────────────────────────────────────────────────

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    // Snap display values directly — these are set values reported by X-Plane, not live readings
    this._displayValues.hdg = this._hdgDial
    this._displayValues.alt = this._altDial
    this._displayValues.vvi = this._vviDial
    this._displayValues.spd = this._spdDial

    this._drawBezel()
    this._drawBackground()

    // Top status strip
    this._drawStatusStrip()

    // Knob row
    this._drawKnobSection()

    // Button row
    this._drawButtonRow()

    // Check for flash expiry
    const now = Date.now()
    let anyFlashing = false
    for (const key of Object.keys(this._flash)) {
      if (now - this._flash[key] < 250) anyFlashing = true
      else delete this._flash[key]
    }
    if (anyFlashing) this._dirty = true
  }

  _drawBackground() {
    const { ctx, w, h } = this
    ctx.fillStyle = this._theme.panelBg
    ctx.beginPath()
    const r = Math.min(w, h) * 0.02
    ctx.roundRect ? ctx.roundRect(2, 2, w - 4, h - 4, r) : ctx.rect(2, 2, w - 4, h - 4)
    ctx.fill()
  }

  _drawStatusStrip() {
    const { ctx, w, h } = this
    const top    = h * 0.04
    const stripH = h * 0.11
    const pad    = w * 0.02
    const cy     = top + stripH * 0.5

    const now = Date.now()

    // ── Lighted pushbutton helper ──────────────────────────────────────────
    // Draws a button with a coloured LED lens on top and a label below,
    // like real avionics pushbuttons.
    const drawBtn = (cx, label, litColor, isOn, isArm, flashKey) => {
      const bh     = stripH * 0.84
      const bw     = Math.min(w * 0.095, bh * 1.7)
      const bx     = cx - bw / 2
      const by     = cy - bh / 2
      const rad    = Math.min(bw, bh) * 0.18
      const ledH   = bh * 0.30
      const isFlash = flashKey && this._flash[flashKey] && (now - this._flash[flashKey]) < 250
      const color  = isFlash ? '#fff' : isOn ? litColor : isArm ? '#fa0' : null

      // Outer body
      ctx.fillStyle  = this._theme.dialFace
      ctx.strokeStyle = color ?? this._theme.frameBorder
      ctx.lineWidth  = isFlash ? 2 : 1
      ctx.beginPath()
      ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, rad) : ctx.rect(bx, by, bw, bh)
      ctx.fill(); ctx.stroke()

      // LED lens — clipped to the button's rounded interior
      ctx.save()
      ctx.beginPath()
      ctx.roundRect ? ctx.roundRect(bx + 1, by + 1, bw - 2, bh - 2, rad)
                    : ctx.rect(bx + 1, by + 1, bw - 2, bh - 2)
      ctx.clip()

      ctx.fillStyle = color ?? '#111'
      ctx.fillRect(bx + 1, by + 1, bw - 2, ledH)

      if (color) {
        // Highlight gloss on upper half of lens
        ctx.fillStyle = 'rgba(255,255,255,0.20)'
        ctx.fillRect(bx + 1, by + 1, bw - 2, ledH * 0.45)
      }
      ctx.restore()

      // Separator between lens and label area
      ctx.strokeStyle = '#333'
      ctx.lineWidth   = 1
      ctx.beginPath()
      ctx.moveTo(bx + 1, by + ledH + 1)
      ctx.lineTo(bx + bw - 1, by + ledH + 1)
      ctx.stroke()

      // Label in the lower portion
      const labelAreaH = bh - ledH
      ctx.fillStyle    = color ?? '#777'
      ctx.font         = this._fitRectFont(bw * 0.85, label, labelAreaH * 0.68)
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, cx, by + ledH + labelAreaH * 0.52)
    }

    drawBtn(w * 0.08, 'AP',  '#0f8', !!this._apOn,       false,                   'ap_master')
    drawBtn(w * 0.20, 'FD',  '#4af', this._fdMode >= 1,  false,                   'fd')

    // ── A/THR button (only when autothrottle is available) ──
    const annStartFrac = this._hasAutothrottle ? 0.38 : 0.27
    if (this._hasAutothrottle) {
      drawBtn(w * 0.32, 'THR', '#0f8', !!this._athrOn, this._athrArm && !this._athrOn, 'athr')
    }

    // ── Mode annunciator box ──
    const annX  = w * annStartFrac
    const annW  = w * 0.60
    const annH  = stripH * 0.85
    const annY  = top + (stripH - annH) * 0.5
    ctx.fillStyle = this._theme.digitalBg
    ctx.strokeStyle = this._theme.divider
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(annX, annY, annW, annH, 3) : ctx.rect(annX, annY, annW, annH)
    ctx.fill(); ctx.stroke()

    // Lay out the annunciator as two columns (LAT | VERT) with an armed-flags row above.
    // Top 28% of annH = armed row (tiny text)
    // Bottom 72% = mode names (larger text)
    const armedRowH = annH * 0.30
    const modeRowH  = annH * 0.62
    const armedY    = annY + armedRowH * 0.55   // baseline of armed text
    const modeY     = annY + armedRowH + modeRowH * 0.45

    const colLeft  = annX + annW * 0.30   // centre of left (lat) column
    const colRight = annX + annW * 0.70   // centre of right (vert) column
    const halfW    = annW * 0.35          // usable width per column

    const latName = LAT_MODES[this._hdgMode] || '---'
    const vertName = VERT_MODES[this._altMode] || '---'

    // ── Armed flags (tiny, amber, above mode names) ──
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = this._theme.warnColor
    // armed text must fit in ~70% of the column width AND armedRowH height
    const armedSlotW  = halfW * 0.70
    const armedSlotH  = armedRowH * 0.85
    // Compute the smallest size needed for all possible armed labels
    const armedFontPx = Math.min(
      this._fitRectSize(armedSlotW, 'LOC', armedSlotH),
      this._fitRectSize(armedSlotW, 'GS',  armedSlotH),
      this._fitRectSize(armedSlotW, 'ALT', armedSlotH),
    )
    const armedFont = this._font(armedFontPx, 'bold')

    if (this._hnavArmed) { ctx.font = armedFont; ctx.fillText('LOC', colLeft, armedY) }
    if (this._gsArmed)   { ctx.font = armedFont; ctx.fillText('GS',  colRight, armedY) }
    // ALT armed shows centred below the other two when active
    if (this._altArmed)  {
      ctx.font = armedFont
      ctx.fillText('ALT', (colLeft + colRight) * 0.5, armedY + armedRowH * 0.3)
    }

    // ── Mode names (cyan, larger) ──
    const modeFont = this._fitRectFont(halfW, latName.length > vertName.length ? latName : vertName, modeRowH * 0.9)
    ctx.fillStyle = this._theme.accent
    ctx.font = modeFont
    ctx.fillText(latName, colLeft, modeY)
    ctx.fillText(vertName, colRight, modeY)

    // Divider
    ctx.strokeStyle = this._theme.divider
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad, top + stripH)
    ctx.lineTo(w - pad, top + stripH)
    ctx.stroke()
  }

  _drawKnobSection() {
    const { ctx, w, h } = this
    const top   = h * 0.17
    const bot   = h * 0.55
    const secH  = bot - top
    const pad   = w * 0.015

    const configs = [
      { key: 'hdg', label: 'HDG', unit: '°',   val: this._displayValues.hdg, raw: this._hdgDial },
      { key: 'alt', label: 'ALT', unit: 'FT',  val: this._displayValues.alt, raw: this._altDial },
      { key: 'vvi', label: 'V/S', unit: 'FPM', val: this._displayValues.vvi, raw: this._vviDial },
    ]
    if (this._hasAutothrottle) {
      configs.push({ key: 'spd', label: 'IAS', unit: 'KT', val: this._displayValues.spd, raw: this._spdDial })
    }
    const colW = (w - pad * 2) / configs.length

    for (let i = 0; i < configs.length; i++) {
      const cfg   = configs[i]
      const cx    = pad + colW * i + colW * 0.5
      const cy    = top + secH * 0.5
      // Knob radius: fit within the column and section height, with room for +/- on the sides
      const maxR  = Math.min(colW * 0.28, secH * 0.32)
      const knobR = Math.max(10, maxR)
      const sideW = colW - knobR * 2  // width remaining for +/- areas

      // Decorative ring
      ctx.strokeStyle = this._theme.divider
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, knobR, 0, Math.PI * 2)
      ctx.stroke()

      // Knob fill
      const isActive = this._activeKnob === cfg.key
      ctx.fillStyle = isActive ? this._theme.accent + '33' : '#222'
      ctx.beginPath()
      ctx.arc(cx, cy, knobR * 0.85, 0, Math.PI * 2)
      ctx.fill()

      // Minus / Plus side — size so the sign fits in sideW/2
      const signSize = Math.min(sideW * 0.35, knobR * 0.85)
      const signFont = this._font(signSize, 'bold')
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      ctx.fillStyle = this._activeKnob === cfg.key && this._knobDir < 0 ? this._theme.accent : this._theme.accentDim
      ctx.font = signFont
      ctx.fillText('−', cx - knobR - sideW * 0.25, cy)

      ctx.fillStyle = this._activeKnob === cfg.key && this._knobDir > 0 ? this._theme.accent : this._theme.accentDim
      ctx.fillText('+', cx + knobR + sideW * 0.25, cy)

      // Value display — fit inside the knob circle
      const valText = String(Math.round(cfg.val))
      ctx.fillStyle = this._theme.accent
      ctx.font = this._fitCircleFont(knobR * 0.7, valText)
      ctx.fillText(valText, cx, cy)

      // Label anchored to section bottom, height-capped to prevent overflow into button row
      const labelText = cfg.label + ' ' + cfg.unit
      const labelFont = this._fitRectFont(colW * 0.9, labelText, secH * 0.14)
      ctx.fillStyle = this._theme.labelDim
      ctx.font = labelFont
      ctx.fillText(labelText, cx, bot - secH * 0.06)
    }

    // Divider
    ctx.strokeStyle = this._theme.divider
    ctx.beginPath()
    ctx.moveTo(pad, bot)
    ctx.lineTo(w - pad, bot)
    ctx.stroke()
  }

  _drawButtonRow() {
    const { ctx, w, h } = this
    const top  = h * 0.58
    const bot  = h * 0.92
    const pad  = w * 0.015

    const buttons = [
      { id: 'hdg',  label: 'HDG' },
      { id: 'nav',  label: 'NAV' },
      { id: 'apr',  label: 'APR' },
      { id: 'bc',   label: 'BC'  },
      { id: 'alt',  label: 'ALT' },
      { id: 'vs',   label: 'V/S' },
      { id: 'flch', label: 'FLCH'},
    ]
    if (this._hasAutothrottle) buttons.push({ id: 'athr', label: 'A/THR' })
    const colW = (w - pad * 2) / buttons.length

    // Determine which button modes are "active" for highlighting
    const activeMap = {
      hdg:  this._hdgStatus === 2,
      nav:  this._navStatus === 2,
      apr:  this._glsStatus === 2 || this._hnavArmed || this._gsArmed,
      bc:   this._bkcrse,
      alt:  this._altStatus === 2,
      vs:   this._vviStatus === 2,
      flch: this._spdStatus === 2,
      athr: this._athrOn,
    }

    for (let i = 0; i < buttons.length; i++) {
      const btn  = buttons[i]
      const bx   = pad + colW * i + colW * 0.1
      const by   = top + (bot - top) * 0.15
      const bw   = colW * 0.8
      const bh   = (bot - top) * 0.7

      const isFlashing = this._flash[btn.id] && (Date.now() - this._flash[btn.id]) < 250
      const isActive   = activeMap[btn.id]

      // Button background
      if (isFlashing) {
        ctx.fillStyle = this._theme.accent + '66'
      } else if (isActive) {
        ctx.fillStyle = this._theme.accent + '44'
      } else {
        ctx.fillStyle = this._theme.dialFace
      }
      ctx.strokeStyle = isActive ? this._theme.accent : this._theme.frameBorder
      ctx.lineWidth = 1
      ctx.beginPath()
      const rad = Math.min(bw, bh) * 0.25
      ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, rad) : ctx.rect(bx, by, bw, bh)
      ctx.fill()
      ctx.stroke()

      // Button label — fit inside the button rectangle with padding
      ctx.fillStyle = isFlashing ? '#fff' : isActive ? this._theme.accent : this._theme.accentDim
      ctx.font = this._fitRectFont(bw * 0.88, btn.label)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(btn.label, bx + bw * 0.5, by + bh * 0.5)
    }
  }

  _font(size, weight = 'normal') {
    return `${weight} ${Math.max(6, size).toFixed(1)}px system-ui, sans-serif`
  }

  /** Compute a fitted pixel size for text in a circle; returns the numeric px value */
  _fitCircleSize(radius, text) {
    // Regardless of the number of characters in the text, we consider
    // a minimum of 3 char to avoid labels to appear too big
    const maxTextLength = Math.max(3, text.length)
    const maxCharWidth = radius * 2 * 0.80 / maxTextLength
    return Math.max(6, maxCharWidth / 0.7)
  }

  /** Compute a fitted pixel size for text in a rect; returns the numeric px value */
  _fitRectSize(width, text, maxHeight = Infinity) {
    // Regardless of the number of characters in the text, we consider
    // a minimum of 3 char to avoid labels to appear too big
    const maxTextLength = Math.max(3, text.length)
    const maxCharWidth = width * 0.80 / maxTextLength
    let size = maxCharWidth / 0.7
    if (maxHeight < Infinity) size = Math.min(size, maxHeight * 0.85)
    return Math.max(6, size)
  }

  /** Fit text to a circle — returns a font string sized to fit text in radius*2 diameter */
  _fitCircleFont(radius, text) {
    return this._font(this._fitCircleSize(radius, text), 'bold')
  }

  /** Fit text to a rectangle width, optionally capped by available height */
  _fitRectFont(width, text, maxHeight = Infinity) {
    return this._font(this._fitRectSize(width, text, maxHeight), 'bold')
  }
}