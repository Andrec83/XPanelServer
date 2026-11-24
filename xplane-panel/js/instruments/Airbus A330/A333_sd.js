// A330 SD (selected page) — one lower ECAM display that shows whichever system page is
// selected on the cockpit ECAM control panel (the lit page pushbutton, or STATUS while STS
// is lit), and the automatic page when none is selected:
//   in flight:  CRUISE, or WHEEL with the gear down
//   on ground:  ENG while an engine is starting, WHEEL with engines running, DOOR otherwise
// Each page is the corresponding A330 SD instrument, created on demand on this canvas.
// Needs the Laminar A330 (page lights: laminar/A333/annun/ecam_mode_*).

import { BaseInstrument } from '../base.js'
import { num, at, text } from '../_glass.js'
import * as Eng from './A333_eng.js'
import * as Bleed from './A333_bleed.js'
import * as Press from './A333_press.js'
import * as Elec from './A333_elec.js'
import * as ElecDC from './A333_elec_dc.js'
import * as Hyd from './A333_hyd.js'
import * as CB from './A333_cb.js'
import * as Apu from './A333_apu.js'
import * as Cond from './A333_cond.js'
import * as Door from './A333_door.js'
import * as Wheel from './A333_wheel.js'
import * as Fctl from './A333_fctl.js'
import * as Fuel from './A333_fuel.js'
import * as Cruise from './A333_cruise.js'
import * as Status from './A333_status.js'

const PAGES = {
  eng: [Eng, 'A333Eng'], bleed: [Bleed, 'A333Bleed'], press: [Press, 'A333Press'], el_ac: [Elec, 'A333Elec'],
  el_dc: [ElecDC, 'A333ElecDC'], hyd: [Hyd, 'A333Hyd'], c_b: [CB, 'A333CB'], apu: [Apu, 'A333Apu'], cond: [Cond, 'A333Cond'],
  door: [Door, 'A333Door'], wheel: [Wheel, 'A333Wheel'], f_ctl: [Fctl, 'A333Fctl'], fuel: [Fuel, 'A333Fuel'],
  cruise: [Cruise, 'A333Cruise'], sts: [Status, 'A333Status'],
}
const SELECTABLE = ['eng', 'bleed', 'press', 'el_ac', 'el_dc', 'hyd', 'c_b', 'apu', 'cond', 'door', 'wheel', 'f_ctl', 'fuel']

const SEL = {
  on_ground: 'sim/flightmodel/failures/onground_any',
  gear:      'sim/flightmodel2/gear/deploy_ratio',
  running:   'sim/flightmodel/engine/ENGN_running',
  n2:        'sim/cockpit2/engine/indicators/N2_percent',
}
for (const p of SELECTABLE) SEL[`sel_${p}`] = `laminar/A333/annun/ecam_mode_${p}`
SEL.sts = 'laminar/A333/annun/ecp_sts'                        // STS pushbutton light: STATUS page shown
SEL.sts_pb = 'laminar/A333/ecp/annun/sts_pushbutton'

// every page's datarefs, so the panel subscribes to all of them (keys prefixed by page)
export const DEFAULTS = { ...SEL }
for (const [page, entry] of Object.entries(PAGES)) {
  if (!entry) continue
  for (const [k, name] of Object.entries(entry[0].DEFAULTS)) DEFAULTS[`${page}.${k}`] = name
}

// placeholder for a page without an instrument (none at the moment)
class MissingPage extends BaseInstrument {
  constructor(canvas, config, title) { super(canvas, config); this._title = title }
  update() {}
  requiredDatarefs() { return [] }
  _render() { this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.w, this.h) }
  _renderEmissive() {
    const { ctx, w, h } = this, lab = Math.max(7, Math.min(h * 0.04, w * 0.04))
    text(ctx, this._title, w / 2, h * 0.045, lab * 1.3, '#f2f2f2')
    text(ctx, 'PAGE NOT AVAILABLE', w / 2, h * 0.45, lab, '#ffa526')
  }
}

export class A333SD extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._config = config
    this._state = {}
    this._page = null
    this._child = null
    this._ambient = null
  }

  // the host draws nothing itself: the page instrument owns the canvas
  _startLoop() {}
  _setupResizeObserver() {}

  requiredDatarefs() { return Object.values(DEFAULTS) }

  _selected() {
    const s = this._state, v = k => s[SEL[k]]
    if (num(v('sts'), 0) > 0 || num(v('sts_pb'), 0) > 0) return 'sts'
    for (const p of SELECTABLE) if (num(v(`sel_${p}`), 0) > 0) return p
    const ground = num(v('on_ground'), 0) > 0
    const gearDown = at(v('gear'), 0, 0) > 0.5
    if (!ground) return gearDown ? 'wheel' : 'cruise'
    const n2 = [0, 1].map(i => at(v('n2'), i, 0)), run = [0, 1].map(i => at(v('running'), i, 0) > 0)
    if (n2.some((x, i) => x > 1 && x < 55 && !run[i])) return 'eng'          // engine start in progress
    return run.some(Boolean) ? 'wheel' : 'door'
  }

  _show(page) {
    if (page === this._page && this._child) return
    this._child?.destroy()
    const entry = PAGES[page]
    this._child = entry ? new entry[0][entry[1]](this.canvas, this._config, {}) : new MissingPage(this.canvas, this._config, page.toUpperCase().replace('_', '/'))
    this._page = page
    if (this._ambient) this._child.setAmbient(this._ambient)
    this._child.update(this._state)
  }

  update(state) {
    this._state = state
    this._show(this._selected())
    this._child.update(state)
  }

  setAmbient(a) { this._ambient = a; this._child?.setAmbient(a) }
  setTheme(t) { this._child?.setTheme(t) }
  setAircraftProfile(p) { this._child?.setAircraftProfile(p) }
  destroy() { this._child?.destroy(); this._dead = true }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_sd',
  label:    'A330 SD (selected page)',
  icon:     '▣',
  order:    19,
  datarefs: DEFAULTS,
  requires: 'the Laminar A330 (follows the ECAM control panel page buttons)',
  datarefCheck: 'any',
}
