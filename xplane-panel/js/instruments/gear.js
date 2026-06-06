import { BaseInstrument } from './base.js'
import { triggerCommand } from '../xplane-api.js'

export const DEFAULTS = {
  gear_handle: 'sim/cockpit/switches/gear_handle_status',
  gear_deploy: 'sim/flightmodel2/gear/deploy_ratio',
}

export class GearIndicator extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs       = { ...DEFAULTS, ...datarefs }
    this._resolvedIds = resolvedIds
    this._handle     = 1
    this._deploy     = new Array(10).fill(0)
    this._gearConfig = null
    this._hasData    = false
    this._btnActive  = null
    this._setupControls()
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    const h = state[this._drefs.gear_handle]
    const d = state[this._drefs.gear_deploy]
    if (h != null) { this._handle = h; this._hasData = true }
    if (Array.isArray(d) && d.length >= 1) this._deploy = d.slice(0, 10)
    this._dirty = true
  }

  _setupControls() {
    const c = this.canvas
    const press = dir => {
      this._btnActive = dir > 0 ? 'dn' : 'up'
      this._write(dir > 0 ? 1 : 0)
      this._dirty = true
    }
    const release = () => { this._btnActive = null; this._dirty = true }
    c.addEventListener('pointerdown', e => {
      const r = c.getBoundingClientRect()
      const py = e.clientY - r.top
      if (py < this.h * 0.85) return
      press((e.clientX - r.left) < this.w / 2 ? -1 : 1)
      c.setPointerCapture(e.pointerId)
    })
    c.addEventListener('pointerup',     release)
    c.addEventListener('pointercancel', release)
  }

  _write(val) {
    const cmd = val === 0
      ? 'sim/flight_controls/landing_gear_up'
      : 'sim/flight_controls/landing_gear_down'
    triggerCommand(cmd).catch(e => console.warn('[gear]', e.message))
  }

  setAircraftProfile(profile) {
    if (profile.gear.length > 0) this.setGearConfig(profile.gear)
  }

  setGearConfig(gears) {
    this._gearConfig = gears
    this._dirty = true
  }

  _render() {
    if (!this._hasData) { this._drawNoData(); return }
    this._drawBezel()
    this._drawLights()
    this._drawControls()
  }

  _lightStyle(ratio) {
    if (ratio < 0.05) return { bg: '#449', rim: '#444', text: '#333', label: 'UP'  }
    if (ratio > 0.95) return { bg: '#0b3', rim: '#0f6', text: '#0f6', label: 'DN'  }
    return              { bg: '#7a2', rim: '#fa0', text: '#fa0', label: '···' }
  }

  _resolveLayout(w, ah) {
    const pad = Math.min(w, ah) * 0.10
    const r   = this._lightRadius(w, ah)

    const cfg = this._gearConfig
    if (!cfg || cfg.length === 0) {
      return [
        { idx: 0, label: 'N', cx: w * 0.50, cy: ah * 0.28 },
        { idx: 1, label: 'L', cx: w * 0.22, cy: ah * 0.68 },
        { idx: 2, label: 'R', cx: w * 0.78, cy: ah * 0.68 },
      ]
    }

    const n   = cfg.length
    const xs  = cfg.map(g => g.x)
    const zs  = cfg.map(g => g.z)
    const xMn = Math.min(...xs), xMx = Math.max(...xs)
    const zMn = Math.min(...zs), zMx = Math.max(...zs)
    const xR  = xMx - xMn || 1
    const zR  = zMx - zMn || 1

    const areaW = w  - 2 * (pad + r)
    const areaH = ah - 2 * (pad + r)

    return cfg.map(g => ({
      idx:   g.idx,
      label: g.label,
      cx:    pad + r + ((g.x - xMn) / xR) * areaW,
      cy:    pad + r + ((g.z - zMn) / zR) * areaH,
    }))
  }

  _lightRadius(w, ah) {
    const n = (this._gearConfig || [{ idx:0 }, { idx:1 }, { idx:2 }]).length
    const base = Math.min(w, ah) * 0.20
    return Math.max(12, base / Math.sqrt(n))
  }

  _drawLights() {
    const { ctx, w, h } = this
    const t = this._theme
    const ah   = h * 0.84
    const legs = this._resolveLayout(w, ah)
    const r    = this._lightRadius(w, ah)

    const sh = Math.max(30, h * 0.14), sy = h - sh
    ctx.fillStyle = t.labelDim
    ctx.font = `${Math.max(8, w * 0.07)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('GEAR', w / 2, sy - 4 - Math.max(8, w * 0.07))

    for (const leg of legs) {
      const ratio = this._deploy[leg.idx] ?? 1
      const s     = this._lightStyle(ratio)

      ctx.beginPath(); ctx.arc(leg.cx, leg.cy, r * 1.20, 0, Math.PI * 2)
      ctx.fillStyle = t.panelBg; ctx.fill()
      ctx.strokeStyle = t.frameBorder; ctx.lineWidth = 1; ctx.stroke()

      ctx.beginPath(); ctx.arc(leg.cx, leg.cy, r, 0, Math.PI * 2)
      ctx.fillStyle = s.bg; ctx.fill()
      ctx.strokeStyle = s.rim; ctx.lineWidth = 2; ctx.stroke()

      ctx.fillStyle = s.text
      ctx.font = `bold ${Math.max(9, r * 0.65)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(leg.label, leg.cx, leg.cy)

      ctx.fillStyle = s.rim
      ctx.font = `${Math.max(6, r * 0.42)}px monospace`
      ctx.fillText(s.label, leg.cx, leg.cy + r * 1.6)
    }

    const unsafe = this._deploy.slice(0, legs.length).some(d => d > 0.05 && d < 0.95)
    if (unsafe) {
      ctx.save()
      const bh = Math.max(14, ah * 0.09)
      const by = ah * 0.50 - bh / 2
      ctx.fillStyle = '#f802'; ctx.fillRect(w * 0.12, by, w * 0.76, bh)
      ctx.strokeStyle = '#f80'; ctx.lineWidth = 1; ctx.strokeRect(w * 0.12, by, w * 0.76, bh)
      ctx.fillStyle = '#fa0'
      ctx.font = `bold ${Math.max(8, bh * 0.65)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('UNSAFE', w / 2, by + bh / 2)
      ctx.restore()
    }
  }

  _drawControls() {
    const { ctx, w, h } = this
    const t = this._theme
    const sh = Math.max(30, h * 0.14), sy = h - sh
    ctx.save()
    ctx.fillStyle = '#000a'; ctx.fillRect(0, sy, w, sh)
    ctx.strokeStyle = t.divider; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke()
    const mid = sy + sh * 0.5
    const fs  = Math.max(12, sh * 0.50)
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    const upActive = this._btnActive === 'up' || this._handle === 0
    ctx.fillStyle = upActive ? '#f334' : '#ffffff12'
    ctx.fillRect(1, sy + 1, w / 2 - 2, sh - 2)
    ctx.fillStyle = upActive ? '#f55' : t.accentDim
    ctx.fillText('↑ UP', w * 0.25, mid)

    const dnActive = this._btnActive === 'dn' || this._handle === 1
    ctx.fillStyle = dnActive ? '#0b34' : '#ffffff12'
    ctx.fillRect(w / 2 + 1, sy + 1, w / 2 - 2, sh - 2)
    ctx.fillStyle = dnActive ? '#0f6' : t.accentDim
    ctx.fillText('DN ↓', w * 0.75, mid)
    ctx.restore()
  }
}
