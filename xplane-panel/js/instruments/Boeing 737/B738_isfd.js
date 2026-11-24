// 737 Standby (ISFD) — integrated standby flight display: attitude, airspeed and
// altitude tapes and baro setting, driven by the standby instruments' own datarefs.
// Touch buttons: BARO −/+ (standby baro commands) and STD.

import { BaseInstrument } from '../base.js'
import { writeDataref, triggerCommand } from '../../xplane-api.js'
import { pick, num, attitude, tape, text } from '../_glass.js'

const G = 'sim/cockpit2/gauges/indicators/'
export const DEFAULTS = {
  ias:   `${G}airspeed_kts_stby`,
  alt:   `${G}altitude_ft_stby`,
  pitch: `${G}pitch_electric_deg_pilot`,
  roll:  `${G}roll_electric_deg_pilot`,
  slip:  `${G}slip_deg`,
  baro:  'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_stby',
}

const GREEN = '#2bff4a', WHITE = '#f2f2f2'

export class B738ISFD extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._ids = resolvedIds
    this._v = {}
    this._hasData = false
    this.setTouchButtons([
      { id: 'baro-', label: '− BARO', repeat: true, onPress: () => triggerCommand('sim/instruments/barometer_stby_down').catch(() => {}) },
      { id: 'std',   label: 'STD',                  onPress: () => this._setBaro(29.92) },
      { id: 'baro+', label: 'BARO +', repeat: true, onPress: () => triggerCommand('sim/instruments/barometer_stby_up').catch(() => {}) },
    ])
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  _setBaro(inhg) {
    const id = this._ids[this._drefs.baro]
    if (id != null) writeDataref(id, inhg).catch(() => {})
  }

  update(state) {
    if (pick(state, this._drefs, this._v)) { this._hasData = this._v.pitch !== undefined; this._dirty = true }
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w } = this
    const h = this.h - this.touchStripHeight               // leave room for the buttons
    if (!this._hasData) { text(ctx, 'ATT —', w / 2, h / 2, Math.max(10, h * 0.06), '#ffb000'); return }
    const v = this._v, f = k => num(v[k], NaN)
    const lab = Math.max(7, h * 0.05)

    attitude(ctx, { x: w * 0.04, y: h * 0.1, w: w * 0.92, h: h * 0.86, pitch: f('pitch'), roll: f('roll'), slip: f('slip'),
      radius: w * 0.04, degSpan: 50, compact: true })
    const ias = f('ias'), alt = f('alt')
    tape(ctx, { x: w * 0.04, y: h * 0.18, w: w * 0.2, h: h * 0.7, value: Math.max(ias, 0), span: 100, step: 10, labelStep: 20, min: 0,
      fmt: x => String(x), side: 'right', bg: 'rgba(40,40,40,0.75)', readoutText: Number.isFinite(ias) ? String(Math.max(0, Math.round(ias))) : '---' })
    tape(ctx, { x: w * 0.74, y: h * 0.18, w: w * 0.22, h: h * 0.7, value: alt, span: 1000, step: 100, labelStep: 200,
      fmt: x => String(x), side: 'left', bg: 'rgba(40,40,40,0.75)', readoutText: Number.isFinite(alt) ? String(Math.round(alt / 20) * 20) : '-----' })
    const baro = f('baro')
    if (Number.isFinite(baro)) {
      const std = Math.abs(baro - 29.92) < 0.005
      text(ctx, std ? 'STD' : `${baro.toFixed(2)} IN`, w * 0.94, h * 0.055, lab, GREEN, 'right')
    }
    text(ctx, 'STBY', w * 0.06, h * 0.055, lab * 0.85, WHITE, 'left')
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'b738_isfd',
  label:    '737 Standby (ISFD)',
  icon:     '◎',
  order:    3,
  datarefs: DEFAULTS,
  touchControls: true,
}
