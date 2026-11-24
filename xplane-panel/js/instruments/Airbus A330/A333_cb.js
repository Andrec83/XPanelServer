// A330 C/B (lower ECAM / SD page), laid out as on the Laminar A330-300: the page shows
// tripped circuit breakers; the Laminar A330 doesn't simulate them, so it always reads
// NORMAL (as in the cockpit). Includes the permanent TAT / SAT / UTC / GW strip.

import { BaseInstrument } from '../base.js'
import { pick, text } from '../_glass.js'
import { sdFooter, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE } from './_sd.js'

export const DEFAULTS = { ...SD_FOOTER_DREFS }

export class A333CB extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._v = {}
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  update(state) {
    if (pick(state, this._drefs, this._v)) this._dirty = true
  }

  _render() {
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  _renderEmissive() {
    const { ctx, w, h } = this
    const lab = Math.max(7, Math.min(h * 0.04, w * 0.04))
    text(ctx, 'C/B', w / 2, h * 0.045, lab * 1.3, SD_WHITE)
    ctx.fillStyle = SD_WHITE; ctx.fillRect(w / 2 - lab * 1.2, h * 0.045 + lab * 0.8, lab * 2.4, Math.max(1, lab * 0.1))
    text(ctx, '1/1', w * 0.88, h * 0.1, lab, SD_WHITE)
    sdLine(ctx, [[w * 0.73, h * 0.17], [w * 0.74, h * 0.75]], SD_WHITE, Math.max(1, lab * 0.12))
    text(ctx, 'NORMAL', w * 0.4, h * 0.42, lab * 1.1, SD_GREEN)
    sdFooter(ctx, w, h, this._v, lab)
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_cb',
  label:    'A330 C/B (SD page)',
  icon:     '⊟',
  order:    32,
  datarefs: DEFAULTS,
  datarefCheck: 'any',
}
