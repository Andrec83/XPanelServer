import { BaseInstrument } from './base.js'
import { writeDataref, triggerCommand } from '../xplane-api.js'

const LIGHT_TYPES = [
  {
    id: 'landing', label: 'LANDING', icon: '💡',
    hasDref:    'sim/aircraft/lighting/acf_has_landing_lights',
    switchDref: 'sim/cockpit2/switches/landing_lights_on',
    cmdOn:      'sim/lights/landing_lights_on',
    cmdOff:     'sim/lights/landing_lights_off',
  },
  {
    id: 'taxi', label: 'TAXI', icon: '🚥',
    hasDref:    'sim/aircraft/lighting/acf_has_taxi_light',
    switchDref: 'sim/cockpit2/switches/taxi_light_on',
    cmdOn:      'sim/lights/taxi_lights_on',
    cmdOff:     'sim/lights/taxi_lights_off',
  },
  {
    id: 'nav', label: 'NAV', icon: '🔴',
    hasDref:    'sim/aircraft/lighting/acf_has_nav_lights',
    switchDref: 'sim/cockpit2/switches/navigation_lights_on',
    cmdOn:      'sim/lights/nav_lights_on',      // X-Plane 12 name (navigation_lights_* doesn't exist)
    cmdOff:     'sim/lights/nav_lights_off',
  },
  {
    id: 'beacon', label: 'BEACON', icon: '🔴',
    hasDref:    null,
    switchDref: 'sim/cockpit2/switches/beacon_on',
    cmdOn:      'sim/lights/beacon_lights_on',
    cmdOff:     'sim/lights/beacon_lights_off',
  },
  {
    id: 'strobe', label: 'STROBE', icon: '⚡',
    hasDref:    'sim/aircraft/lighting/acf_has_strobe_lights',
    switchDref: 'sim/cockpit2/switches/strobe_lights_on',
    cmdOn:      'sim/lights/strobe_lights_on',
    cmdOff:     'sim/lights/strobe_lights_off',
  },
]

// ── Generic lights (logo, wing, formation, ice, …) ───────────────────────────
// X-Plane 12 has no dedicated datarefs for these: aircraft authors wire them to
// one of the 128 slots of generic_lights_switch, and which slot means what is
// different for every aircraft. So they are configured per widget in the Panel
// Manager as "LABEL=slot" pairs, e.g. "LOGO=3, WING=5" (slots are 1-based, the
// same numbering as the sim/lights/generic_NN_light_tog commands).
const GENERIC_DREF      = 'sim/cockpit2/switches/generic_lights_switch'
const GENERIC_SLOTS     = 128
const GENERIC_CMD_SLOTS = 64    // X-Plane only has toggle commands for slots 1–64

export function parseGenericLights(spec) {
  const out = []
  for (const part of String(spec ?? '').split(/[,;\n]+/)) {
    const m = part.trim().match(/^(.+?)\s*[=:]\s*(\d+)$/)
    if (!m) continue
    const slot = parseInt(m[2], 10)
    if (slot < 1 || slot > GENERIC_SLOTS || out.some(g => g.slot === slot)) continue
    out.push({ label: m[1].trim().toUpperCase().slice(0, 10), slot })
  }
  return out
}

function _genericType({ label, slot }) {
  return {
    id: `generic_${slot}`, label, icon: '💡',
    genericSlot: slot,
    cmdTog: slot <= GENERIC_CMD_SLOTS ? `sim/lights/generic_${String(slot).padStart(2, '0')}_light_tog` : null,
  }
}

export const DEFAULTS = {}
for (const lt of LIGHT_TYPES) {
  DEFAULTS[lt.id] = lt.switchDref
}
DEFAULTS.generic = GENERIC_DREF

export class LightSwitches extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs       = { ...DEFAULTS, ...datarefs }
    // standard switches + the generic-light buttons configured for this widget
    this._types       = [...LIGHT_TYPES, ...parseGenericLights(config.genericLights).map(_genericType)]
    this._resolvedIds = resolvedIds
    this._lights      = []
    this._detected    = false
    this._pendingDetection = true
    this._btnActive   = null
    this._states      = {}
    this._hasData     = false
    this._setupControls()
  }

  requiredDatarefs() {
    return Object.values(this._drefs)
  }

  setAvailableLights(availableIds) {
    if (!availableIds || availableIds.length === 0) {
      this._lights = this._types.map(lt => ({ type: lt, state: 0, detected: false }))
    } else {
      const idSet = new Set(availableIds)
      this._lights = this._types
        .filter(lt => idSet.has(lt.id))
        .map(lt => ({ type: lt, state: 0, detected: true }))
    }
    this._detected = true
    this._dirty = true
  }

  update(state) {
    let anyNew = false
    for (const lt of this._types) {
      let v = state[this._drefs[lt.genericSlot ? 'generic' : lt.id]]
      if (lt.genericSlot) v = Array.isArray(v) ? v[lt.genericSlot - 1] : undefined
      if (v != null) {
        this._hasData = true
        const s = Array.isArray(v) ? (v[0] ?? 0) : v
        const on = s !== 0 && s !== false ? 1 : 0     // generic switches are 0–1 ratios
        if (this._states[lt.id] !== on) {
          this._states[lt.id] = on
          anyNew = true
        }
        if (this._pendingDetection) {
          this._markDetected(lt.id)
        }
      }
    }
    if (anyNew) {
      for (const entry of this._lights) {
        entry.state = this._states[entry.type.id] ?? 0
      }
      this._dirty = true
    }
  }

  _markDetected(id) {
    if (!this._pendingDetection) return
  }

  _finaliseDetection() {
    if (this._pendingDetection) {
      const seen = Object.keys(this._states)
      if (seen.length > 0) {
        const seenSet = new Set(seen)
        this._lights = this._types
          .filter(lt => seenSet.has(lt.id))
          .map(lt => ({ type: lt, state: this._states[lt.id] ?? 0, detected: false }))
      }
      this._pendingDetection = false
    }
  }

  _setupControls() {
    const c = this.canvas
    c.style.cursor = 'pointer'

    c.addEventListener('pointerdown', e => {
      const r  = c.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top
      const idx = this._hitTest(px, py)
      if (idx >= 0) {
        this._toggleLight(idx)
        this._btnActive = idx
        this._dirty = true
      }
      c.setPointerCapture(e.pointerId)
    })

    c.addEventListener('pointerup', () => { this._btnActive = null; this._dirty = true })
    c.addEventListener('pointercancel', () => { this._btnActive = null; this._dirty = true })
  }

  _hitTest(px, py) {
    const { w, h } = this
    const margin = w * 0.04
    const cols   = Math.min(this._lights.length, 4)
    const rows   = Math.ceil(this._lights.length / cols)
    const cellW  = (w - margin * 2) / cols
    const cellH  = (h - margin * 2) / Math.max(rows, 1)

    const ci = Math.floor((px - margin) / cellW)
    const ri = Math.floor((py - margin) / cellH)
    if (ci < 0 || ci >= cols || ri < 0 || ri >= rows) return -1
    const idx = ri * cols + ci
    return idx < this._lights.length ? idx : -1
  }

  _toggleLight(idx) {
    const entry = this._lights[idx]
    if (!entry) return
    const lt    = entry.type
    const wasOn = this._states[lt.id] ?? 0

    if (lt.genericSlot) {
      // Toggle command when X-Plane has one (respects the aircraft's own logic),
      // otherwise write the slot of generic_lights_switch directly.
      const id = this._resolvedIds[this._drefs.generic]
      const write = () => { if (id != null) writeDataref(id, wasOn ? 0 : 1, lt.genericSlot - 1).catch(() => {}) }
      if (lt.cmdTog) triggerCommand(lt.cmdTog).catch(write)
      else write()
      return
    }

    const cmd   = wasOn ? lt.cmdOff : lt.cmdOn

    triggerCommand(cmd).catch(() => {
      const id = this._resolvedIds[this._drefs[lt.id]]
      if (id != null) {
        const newVal = wasOn ? 0 : 1
        writeDataref(id, newVal).catch(() => {})
      }
    })
  }

  _render() {
    const { ctx, w, h } = this
    const t = this._theme
    if (!this._hasData) { this._drawNoData(); return }

    this._finaliseDetection()

    ctx.fillStyle = t.panelBg
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = t.divider
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

    if (this._lights.length === 0) {
      ctx.fillStyle = t.labelDim
      ctx.font = `${Math.max(9, h * 0.06)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No lights detected', w / 2, h / 2)
      return
    }

    const margin = w * 0.03
    const cols   = Math.min(this._lights.length, 4)
    const rows   = Math.ceil(this._lights.length / cols)
    const cellW  = (w - margin * 2) / cols
    const cellH  = (h - margin * 2) / Math.max(rows, 1)

    for (let i = 0; i < this._lights.length; i++) {
      const entry  = this._lights[i]
      const lt     = entry.type
      const state  = this._states[lt.id] ?? 0
      const col    = i % cols
      const row    = Math.floor(i / cols)
      const cx     = margin + col * cellW
      const cy     = margin + row * cellH
      const active = this._btnActive === i

      this._drawToggle(cx, cy, cellW, cellH, lt, state, active)
    }
  }

  _drawToggle(x, y, w, h, lt, isOn, isPressed) {
    const { ctx } = this
    const pad = Math.min(w, h) * 0.08
    const bx  = x + pad
    const by  = y + pad
    const bw  = w - pad * 2
    const bh  = h - pad * 2
    const r   = Math.min(bw, bh) * 0.1

    if (isPressed) {
      ctx.fillStyle = isOn ? '#0f6444' : '#f04433'
    } else if (isOn) {
      ctx.fillStyle = '#0b8433'
    } else {
      ctx.fillStyle = '#2a2a2a'
    }
    ctx.strokeStyle = isOn ? '#0f6' : '#444'
    ctx.lineWidth   = isOn ? 2 : 1

    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, r)
    else ctx.rect(bx, by, bw, bh)
    ctx.fill()
    ctx.stroke()

    const iconSize = Math.max(16, Math.min(bw, bh) * 0.35)
    ctx.font = `${iconSize}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(lt.icon, bx + bw / 2, by + bh * 0.32)

    const labelSize = Math.max(7, Math.min(bw, bh) * 0.16)
    ctx.font = `bold ${labelSize}px sans-serif`
    ctx.fillStyle = isOn ? '#fff' : '#888'
    ctx.fillText(lt.label, bx + bw / 2, by + bh * 0.62)

    const dotR = Math.max(3, Math.min(bw, bh) * 0.08)
    const dotY = by + bh * 0.82
    ctx.beginPath()
    ctx.arc(bx + bw / 2, dotY, dotR, 0, Math.PI * 2)
    ctx.fillStyle = isOn ? '#0f0' : '#f004'
    ctx.fill()
    ctx.strokeStyle = isOn ? '#0f6' : '#444'
    ctx.lineWidth = 1
    ctx.stroke()

    const statusSize = Math.max(6, Math.min(bw, bh) * 0.12)
    ctx.font = `${statusSize}px monospace`
    ctx.fillStyle = isOn ? '#0f6' : this._theme.labelDim
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(isOn ? 'ON' : 'OFF', bx + bw / 2, dotY + dotR + statusSize + 2)
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'lights',
  label:    'Light Switches',
  icon:     '💡',
  order:    150,
  datarefs: DEFAULTS,
  options: [
    { key: 'genericLights', label: 'Generic light buttons', type: 'text',
      placeholder: 'LOGO=3, WING=5, FORM=7',
      help: 'Extra buttons for lights wired to generic_lights_switch (logo, wing, ice…). LABEL=slot, slots 1–128; '
          + 'which slot is which depends on the aircraft — check its docs or DataRefTool.' },
  ],
}
