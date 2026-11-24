// FMS CDU — the screen and keypad of X-Plane's built-in FMS.
//
// Works with every aircraft that uses X-Plane's own FMS (the Laminar A330, 737-800,
// MD-82 and others): it reads the standard CDU screen datarefs and presses keys with
// the standard sim/FMS commands, so nothing here is aircraft-specific.
//
// Screen datarefs (https://developer.x-plane.com/article/datarefs-for-the-cdu-screen/):
//   sim/cockpit2/radios/indicators/fms_cduN_text_lineL   UTF-8 string, 24 characters
//   sim/cockpit2/radios/indicators/fms_cduN_style_lineL  one byte per character:
//       0x80 large font · 0x40 reverse video · 0x20 flashing · 0x10 underline
//       0x0F colour: 0 black, 1 cyan, 2 red, 3 yellow, 4 green, 5 magenta, 6 amber, 7 white
//   N = 1 (captain, commands sim/FMS/…) or 2 (first officer, commands sim/FMS2/…)
//
// The keypad follows the touch-controls switch: with touch controls off the widget
// shows the screen only — handy for a display-only tablet.

import { BaseInstrument } from './base.js'
import { triggerCommand } from '../xplane-api.js'

const LINES = 16
const COLS  = 24
const P     = 'sim/cockpit2/radios/indicators/'

export const DEFAULTS = {}
for (const cdu of [1, 2]) {
  for (let i = 0; i < LINES; i++) {
    DEFAULTS[`cdu${cdu}_text${i}`]  = `${P}fms_cdu${cdu}_text_line${i}`
    DEFAULTS[`cdu${cdu}_style${i}`] = `${P}fms_cdu${cdu}_style_line${i}`
  }
}
DEFAULTS.exec_pilot   = `${P}fms_exec_light_pilot`
DEFAULTS.exec_copilot = `${P}fms_exec_light_copilot`
DEFAULTS.acf_icao     = 'sim/aircraft/view/acf_ICAO'

const COLORS = ['#e8e8e8', '#4fd8ff', '#ff4a3d', '#ffe640', '#3dff6a', '#ff6cf0', '#ffa526', '#f2f2f2']
//               0 black→white (never draw black text on a black screen)

// ── Keypads ──────────────────────────────────────────────────────────────────
// [label, command suffix] — label '' = blank spacer. '\n' splits a label over two lines.
const AIRBUS_FUNC = [
  [['DIR', 'dir_intc'], ['PROG', 'prog'], ['PERF', 'perf'], ['INIT', 'index'], ['DATA', 'data'], ['', null]],
  [['F-PLN', 'fpln'], ['RAD\nNAV', 'navrad'], ['FUEL\nPRED', 'fuel_pred'], ['SEC\nF-PLN', 'sec_fpln'], ['ATC\nCOMM', 'atc_comm'], ['MCDU\nMENU', 'menu']],
  [['AIR\nPORT', 'airport'], ['', null], ['◀', 'prev'], ['▲', 'up'], ['', null], ['', null]],
  [['', null], ['', null], ['▶', 'next'], ['▼', 'down'], ['', null], ['', null]],
]
// Keys X-Plane's built-in FMS actually implements on the Laminar 737-800 and MD-82
// (taken from their cockpit manipulators) — no MENU / N1 LIMIT, which do nothing there.
const BOEING_FUNC = [
  [['INIT\nREF', 'index'], ['RTE', 'fpln'], ['CLB', 'clb'], ['CRZ', 'crz'], ['DES', 'des'], ['', null]],
  [['DIR\nINTC', 'dir_intc'], ['LEGS', 'legs'], ['DEP\nARR', 'dep_arr'], ['HOLD', 'hold'], ['PROG', 'prog'], ['EXEC', 'exec']],
  [['NAV\nRAD', 'navrad'], ['FIX', 'fix'], ['PREV\nPAGE', 'prev'], ['NEXT\nPAGE', 'next'], ['', null], ['', null]],
]
const NUM_PAD = [
  [['1', 'key_1'], ['2', 'key_2'], ['3', 'key_3']],
  [['4', 'key_4'], ['5', 'key_5'], ['6', 'key_6']],
  [['7', 'key_7'], ['8', 'key_8'], ['9', 'key_9']],
  [['.', 'key_period'], ['0', 'key_0'], ['+/-', 'key_minus']],
]
const _alpha = extra => {
  const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => [c, `key_${c}`]).concat(extra)
  const rows = []
  for (let i = 0; i < keys.length; i += 5) rows.push(keys.slice(i, i + 5))
  return rows
}
const AIRBUS_ALPHA = _alpha([['/', 'key_slash'], ['SP', 'key_space'], ['OVFY', 'key_overfly'], ['CLR', 'key_clear']])
const BOEING_ALPHA = _alpha([['SP', 'key_space'], ['DEL', 'key_delete'], ['/', 'key_slash'], ['CLR', 'key_clear']])

const FONT = '"DejaVu Sans Mono", Consolas, "Lucida Console", "Courier New", monospace'

// base64 / byte-array dataref value → Uint8Array
function _bytes(v) {
  if (v == null) return null
  if (Array.isArray(v)) return Uint8Array.from(v, n => n & 0xff)
  try {
    const s = String(v).trim()
    const bin = atob(s.padEnd(s.length + (4 - s.length % 4) % 4, '='))
    return Uint8Array.from(bin, c => c.charCodeAt(0))
  } catch { return null }
}
const _utf8 = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null
function _text(v) {
  const b = _bytes(v)
  if (!b) return null
  let end = b.indexOf(0); if (end < 0) end = b.length
  const s = _utf8 ? _utf8.decode(b.subarray(0, end)) : String.fromCharCode(...b.subarray(0, end))
  return Array.from(s)      // one entry per character (UTF-8 glyphs like ← ☐ ° are multi-byte)
}

export class FMSCDU extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs   = { ...DEFAULTS, ...datarefs }
    this._cdu     = Number(config.cdu) === 2 ? 2 : 1
    this._layoutCfg = config.layout || 'auto'          // 'auto' | 'airbus' | 'boeing'
    this._icao    = ''
    this._text    = Array(LINES).fill(null)            // arrays of characters
    this._style   = Array(LINES).fill(null)            // Uint8Array per line
    this._rows    = 14                                 // grows to 16 if lines 14/15 are used
    this._exec    = 0
    this._hasData = false
    this._zones   = []
    this._pressed = null
    this._flashT  = null
    this._setupPointer()
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  get _layout() {
    if (this._layoutCfg === 'airbus' || this._layoutCfg === 'boeing') return this._layoutCfg
    return /^A\d/i.test(this._icao) ? 'airbus' : 'boeing'    // A330, A320… → Airbus MCDU
  }

  update(state) {
    let changed = false
    for (let i = 0; i < LINES; i++) {
      const tv = state[this._drefs[`cdu${this._cdu}_text${i}`]]
      const sv = state[this._drefs[`cdu${this._cdu}_style${i}`]]
      if (tv !== undefined && tv !== this._rawT?.[i]) {
        (this._rawT ||= [])[i] = tv
        this._text[i] = _text(tv)
        changed = true
        if (i >= 14 && this._text[i]?.some(c => c !== ' ')) this._rows = 16
      }
      if (sv !== undefined && sv !== this._rawS?.[i]) {
        (this._rawS ||= [])[i] = sv
        this._style[i] = _bytes(sv)
        changed = true
      }
    }
    const ex = state[this._drefs[this._cdu === 2 ? 'exec_copilot' : 'exec_pilot']]
    if (ex !== undefined && (ex ? 1 : 0) !== this._exec) { this._exec = ex ? 1 : 0; changed = true }
    const ic = state[this._drefs.acf_icao]
    if (ic !== undefined && ic !== this._rawIcao) {
      this._rawIcao = ic
      this._icao = (_text(ic) || []).join('').trim()
      changed = true
    }
    if (changed) { this._hasData = true; this._dirty = true }
  }

  // ── geometry ────────────────────────────────────────────────────────────────
  _geom() {
    const { w, h } = this
    const keys = this.controlsVisible
    const pad  = Math.round(Math.min(w, h) * 0.02)
    const lskW = keys ? Math.round(w * 0.085) : 0
    const screenH = keys ? Math.round(h * 0.42) : h - pad * 2
    const scr = { x: pad + lskW + (keys ? pad : 0), y: pad, w: w - 2 * (pad + lskW + (keys ? pad : 0)), h: screenH }
    return { pad, lskW, scr, kbY: scr.y + scr.h + pad, kbH: h - (scr.y + scr.h + pad) - pad }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  _render() {
    const { ctx, w, h } = this
    this._zones = []
    ctx.fillStyle = '#1b1d1f'                       // CDU body
    ctx.fillRect(0, 0, w, h)
    const g = this._geom()
    ctx.fillStyle = '#000'
    ctx.fillRect(g.scr.x, g.scr.y, g.scr.w, g.scr.h)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.strokeRect(g.scr.x + 0.5, g.scr.y + 0.5, g.scr.w - 1, g.scr.h - 1)

    if (this.controlsVisible) {
      this._drawLSKs(g)
      this._drawKeypad(g)
    }
  }

  // Screen characters are self-lit — drawn after the night overlay
  _renderEmissive() {
    const { ctx } = this
    const g = this._geom(), s = g.scr
    if (!this._hasData) {
      ctx.fillStyle = '#3dff6a'
      ctx.font = `${Math.max(9, s.h * 0.06)}px ${FONT}`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`FMS CDU ${this._cdu} — waiting for data`, s.x + s.w / 2, s.y + s.h / 2)
      return
    }
    const rows  = this._rows
    const lineH = s.h / rows
    const inset = s.w * 0.02
    const charW = (s.w - inset * 2) / COLS
    const big   = Math.min(lineH * 0.86, charW * 1.62)
    const small = big * 0.74
    const blinkOn = Math.floor(performance.now() / 500) % 2 === 0
    let anyFlash = false

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let r = 0; r < rows; r++) {
      const chars = this._text[r]
      if (!chars) continue
      const st = this._style[r]
      const cy = s.y + lineH * (r + 0.55)
      for (let c = 0; c < chars.length && c < COLS; c++) {
        const ch  = chars[c]
        const sb  = st?.[c] ?? 0x07
        const col = COLORS[sb & 0x07] ?? COLORS[7]
        const x   = s.x + inset + charW * c
        if (sb & 0x20) { anyFlash = true; if (!blinkOn) continue }
        if (sb & 0x40) {                                   // reverse video
          ctx.fillStyle = col
          ctx.fillRect(x, cy - lineH * 0.45, charW + 0.5, lineH * 0.9)
        }
        if (ch === ' ' || ch === '\0') continue
        ctx.font = `${(sb & 0x80 ? big : small).toFixed(1)}px ${FONT}`
        ctx.fillStyle = (sb & 0x40) ? '#000' : col
        ctx.fillText(ch, x + charW / 2, cy)
        if (sb & 0x10) ctx.fillRect(x + charW * 0.1, cy + lineH * 0.36, charW * 0.8, Math.max(1, lineH * 0.05))
      }
    }
    if (anyFlash && !this._flashT) {                       // redraw at the next blink phase
      this._flashT = setTimeout(() => { this._flashT = null; this._dirty = true }, 500 - performance.now() % 500 + 5)
    }
  }

  _drawLSKs(g) {
    const s = g.scr, lineH = s.h / this._rows
    const bw = g.lskW * 0.82, bh = Math.min(lineH * 1.3, g.lskW * 0.55)
    for (let i = 0; i < 6; i++) {
      const cy = s.y + lineH * (2 * (i + 1) + 0.55)       // value rows 2, 4 … 12
      this._key(g.pad + (g.lskW - bw) / 2, cy - bh / 2, bw, bh, '—', `ls_${i + 1}l`, true)
      this._key(this.w - g.pad - g.lskW + (g.lskW - bw) / 2, cy - bh / 2, bw, bh, '—', `ls_${i + 1}r`, true)
    }
  }

  _drawKeypad(g) {
    const airbus = this._layout === 'airbus'
    const func   = airbus ? AIRBUS_FUNC : BOEING_FUNC
    const alpha  = airbus ? AIRBUS_ALPHA : BOEING_ALPHA
    const x0 = g.pad, W = this.w - g.pad * 2
    const gap = Math.max(2, Math.round(Math.min(W, g.kbH) * 0.012))
    const lowerRows = Math.max(alpha.length, NUM_PAD.length)
    const totalRows = func.length + lowerRows
    const rowH = (g.kbH - gap * (totalRows - 1)) / totalRows

    // function keys: 6 columns across the full width
    let y = g.kbY
    for (const row of func) {
      const kw = (W - gap * 5) / 6
      row.forEach(([label, cmd], i) => {
        if (cmd) this._key(x0 + i * (kw + gap), y, kw, rowH, label, cmd, false, cmd === 'exec' ? this._exec : 0)
      })
      y += rowH + gap
    }
    // numeric pad (left) and alpha grid (right)
    const numW = W * 0.36, alphaX = x0 + numW + gap * 3, alphaW = W - numW - gap * 3
    const nk = (numW - gap * 2) / 3
    NUM_PAD.forEach((row, r) => row.forEach(([label, cmd], i) =>
      this._key(x0 + i * (nk + gap), y + r * (rowH + gap), nk, rowH, label, cmd)))
    const ak = (alphaW - gap * 4) / 5
    alpha.forEach((row, r) => row.forEach(([label, cmd], i) =>
      this._key(alphaX + i * (ak + gap), y + r * (rowH + gap), ak, rowH, label, cmd)))
  }

  _key(x, y, w, h, label, cmd, lsk = false, lit = 0) {
    const { ctx } = this
    const down = this._pressed === cmd
    ctx.fillStyle = down ? '#4a4f55' : '#2e3236'
    ctx.strokeStyle = down ? '#9ab' : '#45494e'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.12) : ctx.rect(x, y, w, h)
    ctx.fill(); ctx.stroke()
    if (lit) {                                             // EXEC annunciator bar
      ctx.fillStyle = '#ffe9a0'
      ctx.fillRect(x + w * 0.2, y + h * 0.1, w * 0.6, Math.max(2, h * 0.12))
    }
    const lines = label.split('\n')
    const longest = Math.max(...lines.map(l => l.length), 1)
    const fs = Math.max(6, Math.min(h * (lines.length > 1 ? 0.34 : 0.48), w * 1.5 / (longest + 1)))
    ctx.fillStyle = lsk ? '#8a8f95' : '#e6e6e6'
    ctx.font = `bold ${fs.toFixed(1)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * fs * 1.1 + (lit ? h * 0.06 : 0)))
    this._zones.push({ x, y, w, h, cmd })
  }

  // ── input ───────────────────────────────────────────────────────────────────
  _setupPointer() {
    const c = this.canvas
    c.style.touchAction = 'none'
    const hit = e => {
      const r = c.getBoundingClientRect()
      const x = (e.clientX - r.left) * (c.width / r.width), y = (e.clientY - r.top) * (c.height / r.height)
      return this._zones.find(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) || null
    }
    c.addEventListener('pointerdown', e => {
      if (!this.controlsVisible) return
      const z = hit(e)
      if (!z) return
      this._pressed = z.cmd
      this._dirty = true
      const prefix = this._cdu === 2 ? 'sim/FMS2/' : 'sim/FMS/'
      triggerCommand(prefix + z.cmd).catch(err => console.warn(`[FMS CDU] ${prefix}${z.cmd}:`, err.message))
      try { c.setPointerCapture(e.pointerId) } catch {}
    })
    const release = () => { if (this._pressed) { this._pressed = null; this._dirty = true } }
    c.addEventListener('pointerup', release)
    c.addEventListener('pointercancel', release)
    c.addEventListener('pointermove', e => { c.style.cursor = this.controlsVisible && hit(e) ? 'pointer' : 'default' })
  }

  destroy() {
    clearTimeout(this._flashT)
    super.destroy()
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'fms_cdu',
  label:    'FMS CDU',
  icon:     '⌨',
  order:    185,
  datarefs: DEFAULTS,
  touchControls: true,       // touch controls off → screen only (no keypad)
  requires: "an aircraft that uses X-Plane's built-in FMS (e.g. the Laminar A330, 737-800, MD-82)",
  optionalDatarefs: ['exec_pilot', 'exec_copilot', 'acf_icao'],
  options: [
    { key: 'cdu', label: 'CDU', type: 'select', default: 1,
      choices: [{ value: 1, label: 'CDU 1 (Captain)' }, { value: 2, label: 'CDU 2 (First Officer)' }] },
    { key: 'layout', label: 'Keypad', type: 'select', default: 'auto',
      choices: [{ value: 'auto', label: 'Auto (Airbus for A3xx)' }, { value: 'airbus', label: 'Airbus MCDU' }, { value: 'boeing', label: 'Boeing CDU' }],
      help: 'Auto picks the Airbus keypad when the aircraft ICAO starts with A, otherwise the Boeing one. Switch touch controls off for a screen-only display.' },
  ],
}
