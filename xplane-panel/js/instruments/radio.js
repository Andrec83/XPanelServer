import { BaseInstrument } from './base.js'
import { writeDataref } from '../xplane-api.js'

export const DEFAULTS = {
  com1_mhz:     'sim/cockpit2/radios/actuators/com1_frequency_Mhz',
  com1_khz:     'sim/cockpit2/radios/actuators/com1_frequency_khz',
  com1_sby_mhz: 'sim/cockpit2/radios/actuators/com1_standby_frequency_Mhz',
  com1_sby_khz: 'sim/cockpit2/radios/actuators/com1_standby_frequency_khz',
  com1_rx:      'sim/cockpit2/radios/actuators/audio_selection_com1',
  com2_mhz:     'sim/cockpit2/radios/actuators/com2_frequency_Mhz',
  com2_khz:     'sim/cockpit2/radios/actuators/com2_frequency_khz',
  com2_sby_mhz: 'sim/cockpit2/radios/actuators/com2_standby_frequency_Mhz',
  com2_sby_khz: 'sim/cockpit2/radios/actuators/com2_standby_frequency_khz',
  com2_rx:      'sim/cockpit2/radios/actuators/audio_selection_com2',
  nav1_mhz:     'sim/cockpit2/radios/actuators/nav1_frequency_Mhz',
  nav1_khz:     'sim/cockpit2/radios/actuators/nav1_frequency_khz',
  nav1_sby_mhz: 'sim/cockpit2/radios/actuators/nav1_standby_frequency_Mhz',
  nav1_sby_khz: 'sim/cockpit2/radios/actuators/nav1_standby_frequency_khz',
  nav1_rx:      'sim/cockpit2/radios/actuators/audio_selection_nav1',
  nav2_mhz:     'sim/cockpit2/radios/actuators/nav2_frequency_Mhz',
  nav2_khz:     'sim/cockpit2/radios/actuators/nav2_frequency_khz',
  nav2_sby_mhz: 'sim/cockpit2/radios/actuators/nav2_standby_frequency_Mhz',
  nav2_sby_khz: 'sim/cockpit2/radios/actuators/nav2_standby_frequency_khz',
  nav2_rx:      'sim/cockpit2/radios/actuators/audio_selection_nav2',
  adf1_hz:      'sim/cockpit2/radios/actuators/adf1_frequency_hz',
  adf1_sby_hz:  'sim/cockpit2/radios/actuators/adf1_standby_frequency_hz',
  adf1_rx:      'sim/cockpit2/radios/actuators/audio_selection_adf1',
  adf2_hz:      'sim/cockpit2/radios/actuators/adf2_frequency_hz',
  adf2_sby_hz:  'sim/cockpit2/radios/actuators/adf2_standby_frequency_hz',
  adf2_rx:      'sim/cockpit2/radios/actuators/audio_selection_adf2',
}

// Per-radio static definition
// COM/NAV use separate _Mhz / _khz datarefs for clean tuning.
// ADF uses a single _hz dataref; X-Plane stores ADF in kHz directly (e.g. 320 = 320 kHz).
const RADIO_DEFS = {
  com1: { label:'COM1', color:'#3d9', mhzMin:118, mhzMax:136, khzStep:5, khzMax:975,
          act_mhz:'com1_mhz', act_khz:'com1_khz', sby_mhz:'com1_sby_mhz', sby_khz:'com1_sby_khz', rx:'com1_rx' },
  com2: { label:'COM2', color:'#3d9', mhzMin:118, mhzMax:136, khzStep:5, khzMax:975,
          act_mhz:'com2_mhz', act_khz:'com2_khz', sby_mhz:'com2_sby_mhz', sby_khz:'com2_sby_khz', rx:'com2_rx' },
  nav1: { label:'NAV1', color:'#4af', mhzMin:108, mhzMax:117, khzStep:5, khzMax:950,
          act_mhz:'nav1_mhz', act_khz:'nav1_khz', sby_mhz:'nav1_sby_mhz', sby_khz:'nav1_sby_khz', rx:'nav1_rx' },
  nav2: { label:'NAV2', color:'#4af', mhzMin:108, mhzMax:117, khzStep:5, khzMax:950,
          act_mhz:'nav2_mhz', act_khz:'nav2_khz', sby_mhz:'nav2_sby_mhz', sby_khz:'nav2_sby_khz', rx:'nav2_rx' },
  adf1: { label:'ADF1', color:'#fa0', type:'adf', coarseStep:10, fineStep:1,
          act_hz:'adf1_hz', sby_hz:'adf1_sby_hz', rx:'adf1_rx' },
  adf2: { label:'ADF2', color:'#fa0', type:'adf', coarseStep:10, fineStep:1,
          act_hz:'adf2_hz', sby_hz:'adf2_sby_hz', rx:'adf2_rx' },
}

// x-zone boundaries (relative 0–1) for each row
const Z = {
  labelL: 0.00, labelR: 0.09,
  rxL:    0.09, rxR:    0.17,   // RX monitor toggle button
  actL:   0.17, actR:   0.47,
  swapL:  0.47, swapR:  0.56,
  sbyL:   0.56, sbyR:   0.80,
  mhzL:   0.80, mhzR:   0.90,
  khzL:   0.90, khzR:   1.00,
}

export class RadioPanel extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs       = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds

    // Which radios to show — from config, default COM1+COM2+NAV1+NAV2
    this._radioIds = Array.isArray(config.radios)
      ? config.radios.filter(id => RADIO_DEFS[id])
      : ['com1', 'com2', 'nav1', 'nav2']

    // Per-radio state (last values reported by X-Plane)
    this._rs = {}
    for (const id of Object.keys(RADIO_DEFS)) {
      if (RADIO_DEFS[id].type === 'adf') {
        this._rs[id] = { act_hz: 0, sby_hz: 0, audio: 0, hasData: false }
      } else {
        this._rs[id] = { act_mhz: 0, act_khz: 0, sby_mhz: 0, sby_khz: 0, audio: 0, hasData: false }
      }
    }

    this._hasData = false

    // Hold-to-repeat state
    this._activeZone  = null   // { radioIdx, part: 'mhz'|'khz'|'swap', dir: 1|-1 }
    this._holdTimer   = null
    this._repeatTimer = null

    // Flash feedback: radioId → timestamp
    this._flash = {}

    this._setupPointer()
  }

  setResolvedIds(ids) { this._resolvedIds = ids }

  // Called by panel.js after auto-detection to override the visible radio list
  setVisibleRadios(ids) {
    this._radioIds = ids.filter(id => RADIO_DEFS[id])
    this._dirty = true
  }

  requiredDatarefs() {
    const names = new Set()
    for (const id of this._radioIds) {
      const def = RADIO_DEFS[id]
      names.add(this._drefs[def.rx])
      if (def.type === 'adf') {
        names.add(this._drefs[def.act_hz])
        names.add(this._drefs[def.sby_hz])
      } else {
        names.add(this._drefs[def.act_mhz])
        names.add(this._drefs[def.act_khz])
        names.add(this._drefs[def.sby_mhz])
        names.add(this._drefs[def.sby_khz])
      }
    }
    return [...names].filter(Boolean)
  }

  update(state) {
    const d = this._drefs
    const g = k => state[d[k]]

    for (const id of this._radioIds) {
      const def = RADIO_DEFS[id]
      const rs  = this._rs[id]
      if (g(def.rx) != null) {
        const prev = rs.audio
        rs.audio = g(def.rx)
        if (rs.audio !== prev) console.log(`[Radio] ← xplane ${id} audio: ${prev} → ${rs.audio}`)
      }
      if (def.type === 'adf') {
        if (g(def.act_hz) != null) {
          rs.act_hz = g(def.act_hz) ?? rs.act_hz
          rs.sby_hz = g(def.sby_hz) ?? rs.sby_hz
          rs.hasData = true
        }
      } else {
        if (g(def.act_mhz) != null) {
          rs.act_mhz = g(def.act_mhz) ?? rs.act_mhz
          rs.act_khz = g(def.act_khz) ?? rs.act_khz
          rs.sby_mhz = g(def.sby_mhz) ?? rs.sby_mhz
          rs.sby_khz = g(def.sby_khz) ?? rs.sby_khz
          rs.hasData = true
        }
      }
    }
    const hadData = this._hasData
    this._hasData = this._radioIds.some(id => this._rs[id].hasData)
    if (!hadData && this._hasData) {
      // First snapshot — log initial audio state for all radios
      const summary = this._radioIds.map(id => `${id}:rx=${this._rs[id].audio}`).join(' ')
      console.log('[Radio] initial audio state:', summary)
    }
    this._dirty = true
  }

  // ── pointer ────────────────────────────────────────────────────────────────

  _setupPointer() {
    const c = this.canvas
    c.style.touchAction = 'none'
    const px = e => { const r = c.getBoundingClientRect(); return e.clientX - r.left }
    const py = e => { const r = c.getBoundingClientRect(); return e.clientY - r.top }

    const stopRepeat = () => {
      clearTimeout(this._holdTimer)
      clearInterval(this._repeatTimer)
      this._holdTimer = this._repeatTimer = this._activeZone = null
    }

    const startRepeat = zone => {
      this._activeZone = zone
      this._fireZone(zone)
      this._holdTimer = setTimeout(() => {
        this._repeatTimer = setInterval(() => this._fireZone(this._activeZone), 120)
      }, 350)
    }

    c.addEventListener('pointerdown', e => {
      const zone = this._hitTest(px(e), py(e))
      if (!zone) return
      c.setPointerCapture(e.pointerId)
      if (zone.part === 'swap') {
        this._swapFreq(zone.radioId)
        this._flash[zone.radioId] = Date.now()
      } else if (zone.part === 'audio') {
        this._toggleAudio(zone.radioId)
      } else {
        startRepeat(zone)
      }
      this._dirty = true
    })
    c.addEventListener('pointerup',     () => { stopRepeat(); this._dirty = true })
    c.addEventListener('pointercancel', () => { stopRepeat(); this._dirty = true })
    c.addEventListener('pointermove', e => {
      c.style.cursor = this._hitTest(px(e), py(e)) ? 'pointer' : 'default'
    })
  }

  _fireZone(zone) {
    if (!zone) return
    const { radioId, part, dir } = zone
    const def = RADIO_DEFS[radioId]
    const rs  = this._rs[radioId]

    if (def.type === 'adf') {
      const step = part === 'mhz' ? def.coarseStep : def.fineStep
      const v = Math.max(190, Math.min(1750, rs.sby_hz + dir * step))
      this._write(def.sby_hz, v)
    } else {
      if (part === 'mhz') {
        const v = Math.max(def.mhzMin, Math.min(def.mhzMax, rs.sby_mhz + dir))
        this._write(def.sby_mhz, v)
      } else {
        // kHz with rollover into MHz
        let newMhz = rs.sby_mhz
        let newKhz = rs.sby_khz + dir * def.khzStep
        if (newKhz > def.khzMax) { newKhz = 0;           newMhz++ }
        if (newKhz < 0)          { newKhz = def.khzMax;  newMhz-- }
        newMhz = Math.max(def.mhzMin, Math.min(def.mhzMax, newMhz))
        this._write(def.sby_khz, newKhz)
        if (newMhz !== rs.sby_mhz) this._write(def.sby_mhz, newMhz)
      }
    }
    this._dirty = true
  }

  _swapFreq(radioId) {
    const def = RADIO_DEFS[radioId]
    const rs  = this._rs[radioId]
    if (def.type === 'adf') {
      const tmp = rs.act_hz
      this._write(def.act_hz, rs.sby_hz)
      this._write(def.sby_hz, tmp)
    } else {
      const { act_mhz: am, act_khz: ak, sby_mhz: sm, sby_khz: sk } = rs
      this._write(def.act_mhz, rs.sby_mhz)
      this._write(def.act_khz, rs.sby_khz)
      this._write(def.sby_mhz, am)
      this._write(def.sby_khz, ak)
    }
  }

  _toggleAudio(radioId) {
    const def    = RADIO_DEFS[radioId]
    const rs     = this._rs[radioId]
    const newVal = rs.audio ? 0 : 1
    const drefName = this._drefs[def.rx]
    const drefId   = this._resolvedIds[drefName]
    console.log(`[Radio] RX toggle ${radioId}: ${rs.audio} → ${newVal} | dref="${drefName}" id=${drefId}`)
    this._write(def.rx, newVal)
    this._dirty = true
  }

  _write(drefKey, value) {
    const id = this._resolvedIds[this._drefs[drefKey]]
    if (id != null) writeDataref(id, value).catch(() => {})
  }

  // ── hit test ───────────────────────────────────────────────────────────────

  _hitTest(x, y) {
    const { w, h } = this
    const n = this._radioIds.length
    if (n === 0) return null
    const rowH  = h / n
    const rowIdx = Math.floor(y / rowH)
    if (rowIdx < 0 || rowIdx >= n) return null
    const relX  = x / w
    const relYr = (y - rowIdx * rowH) / rowH  // 0–1 within the row
    const radioId = this._radioIds[rowIdx]
    const def     = RADIO_DEFS[radioId]

    if (relX >= Z.rxL && relX < Z.rxR) {
      return { part: 'audio', radioId }
    }
    if (relX >= Z.swapL && relX < Z.swapR) {
      return { part: 'swap', radioId }
    }
    if (relX >= Z.mhzL && relX < Z.mhzR) {
      return { part: 'mhz', radioId, dir: relYr < 0.5 ? 1 : -1 }
    }
    if (relX >= Z.khzL && relX < Z.khzR) {
      return { part: 'khz', radioId, dir: relYr < 0.5 ? 1 : -1 }
    }
    return null
  }

  // ── render ─────────────────────────────────────────────────────────────────

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    ctx.fillStyle = this._theme.panelBg
    ctx.fillRect(0, 0, w, h)

    const n    = this._radioIds.length
    const rowH = h / n
    const now  = Date.now()

    for (let i = 0; i < n; i++) {
      this._drawRow(i, rowH, now)
    }

    // Flash expiry — keep dirty while any flash is live
    let anyFlash = false
    for (const k of Object.keys(this._flash)) {
      if (now - this._flash[k] < 250) anyFlash = true
      else delete this._flash[k]
    }
    if (anyFlash) this._dirty = true
  }

  _drawRow(rowIdx, rowH, now) {
    const { ctx, w } = this
    const y0      = rowIdx * rowH
    const radioId = this._radioIds[rowIdx]
    const def     = RADIO_DEFS[radioId]
    const rs      = this._rs[radioId]
    const pad     = Math.max(2, w * 0.01)
    const isFlash = this._flash[radioId] && (now - this._flash[radioId]) < 250

    // Row separator
    if (rowIdx > 0) {
      ctx.strokeStyle = this._theme.divider
      ctx.lineWidth   = 1
      ctx.beginPath()
      ctx.moveTo(0, y0); ctx.lineTo(w, y0)
      ctx.stroke()
    }

    // ── Label ──
    const labelX  = w * (Z.labelL + Z.labelR) / 2
    const labelFS = Math.max(7, Math.min(rowH * 0.28, w * 0.028))
    ctx.fillStyle    = def.color
    ctx.font         = `bold ${labelFS.toFixed(1)}px system-ui, sans-serif`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(def.label, labelX, y0 + rowH * 0.5)

    // ── RX monitor button ──
    const rxCx  = w * (Z.rxL + Z.rxR) / 2
    const rxW   = w * (Z.rxR - Z.rxL) * 0.80
    const rxH   = rowH * 0.55
    const rxX   = rxCx - rxW / 2
    const rxY   = y0 + (rowH - rxH) / 2
    const rxOn  = !!rs.audio
    const rxRad = Math.min(rxW, rxH) * 0.20
    ctx.fillStyle  = rxOn ? def.color + '33' : this._theme.panelBg
    ctx.strokeStyle = rxOn ? def.color : this._theme.divider
    ctx.lineWidth  = 1
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(rxX, rxY, rxW, rxH, rxRad) : ctx.rect(rxX, rxY, rxW, rxH)
    ctx.fill(); ctx.stroke()
    const rxFS = Math.max(5, rxH * 0.52)
    ctx.fillStyle    = rxOn ? def.color : '#444'
    ctx.font         = `bold ${rxFS.toFixed(1)}px system-ui, sans-serif`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('RX', rxCx, y0 + rowH * 0.5)

    // ── Frequencies ──
    const actFreq = this._fmtFreq(radioId, rs, 'active')
    const sbyFreq = this._fmtFreq(radioId, rs, 'standby')

    const actCx = w * (Z.actL + Z.actR) / 2
    const sbyCx = w * (Z.sbyL + Z.sbyR) / 2
    const actW  = w * (Z.actR - Z.actL)
    const sbyW  = w * (Z.sbyR - Z.sbyL)

    // Active freq — large, bright
    const actFS = this._fitFreqFont(actW, actFreq, rowH * 0.52)
    ctx.fillStyle = def.color
    ctx.font      = `bold ${actFS.toFixed(1)}px monospace`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(actFreq, actCx, y0 + rowH * 0.5)

    // Standby freq — smaller, dim
    const sbyFS = this._fitFreqFont(sbyW * 0.90, sbyFreq, rowH * 0.38)
    ctx.fillStyle = this._theme.labelDim
    ctx.font      = `${sbyFS.toFixed(1)}px monospace`
    ctx.fillText(sbyFreq, sbyCx, y0 + rowH * 0.5)

    // ── SWAP button ──
    const swapCx = w * (Z.swapL + Z.swapR) / 2
    const swapFS = Math.max(8, rowH * 0.34)
    ctx.fillStyle = isFlash ? '#fff' : this._theme.accentDim
    ctx.font      = `${swapFS.toFixed(1)}px system-ui, sans-serif`
    ctx.fillText('⇄', swapCx, y0 + rowH * 0.5)

    // ── Tune columns (MHz coarse, kHz fine) ──
    const mhzLabel = def.type === 'adf' ? '+10' : 'MHz'
    const khzLabel = def.type === 'adf' ? '+1'  : 'kHz'
    this._drawTuneCol(w * Z.mhzL, w * (Z.mhzR - Z.mhzL), y0, rowH, mhzLabel)
    this._drawTuneCol(w * Z.khzL, w * (Z.khzR - Z.khzL), y0, rowH, khzLabel)
  }

  _drawTuneCol(x, colW, y0, rowH, labelText) {
    const { ctx } = this
    const cx    = x + colW / 2
    const arFS  = Math.max(7, rowH * 0.26)
    const lblFS = Math.max(5, rowH * 0.16)
    const arY1  = y0 + rowH * 0.22
    const arY2  = y0 + rowH * 0.78
    const lblY  = y0 + rowH * 0.50

    ctx.fillStyle    = this._theme.accentDim
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = `${arFS.toFixed(1)}px system-ui`
    ctx.fillText('▲', cx, arY1)
    ctx.fillText('▼', cx, arY2)

    ctx.font = `${lblFS.toFixed(1)}px system-ui`
    ctx.fillStyle = this._theme.divider
    ctx.fillText(labelText, cx, lblY)
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  _fmtFreq(radioId, rs, which) {
    const def = RADIO_DEFS[radioId]
    if (def.type === 'adf') {
      const hz = which === 'active' ? rs.act_hz : rs.sby_hz
      return `${hz}`   // stored directly as kHz integer
    }
    const mhz = which === 'active' ? rs.act_mhz : rs.sby_mhz
    const khz = which === 'active' ? rs.act_khz : rs.sby_khz
    return `${mhz}.${String(khz).padStart(3, '0')}`
  }

  _fitFreqFont(availW, text, maxH) {
    const charW   = availW * 0.82 / Math.max(6, text.length)
    const fromW   = charW / 0.60   // monospace ~0.6 aspect
    return Math.min(Math.max(6, fromW), maxH)
  }
}
