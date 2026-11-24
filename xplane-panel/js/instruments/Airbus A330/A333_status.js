// A330 STATUS (lower ECAM / SD page, STS pushbutton), laid out as on the Laminar A330-300:
// the status text (limitations, procedures, inoperative systems) in a left and a right
// column in the aircraft's colours, or NORMAL when there is nothing to report; plus the
// permanent TAT / SAT / UTC / GW strip.
// Text and colours come from the Laminar A330 (laminar/A333/ecam/sd_text_*).

import { BaseInstrument } from '../base.js'
import { pick, num, at, text, dataText, MONO } from '../_glass.js'
import { sdFooter, sdLine, SD_FOOTER_DREFS, SD_GREEN, SD_WHITE, SD_CYAN, SD_AMBER, SD_RED } from './_sd.js'

const E = 'laminar/A333/ecam/'
const LINES = 18
// Laminar ECAM colour codes: 0 red, 1 amber, 2 green, 3 white, 4 cyan, 5 magenta
const COLORS = [SD_RED, SD_AMBER, SD_GREEN, SD_WHITE, SD_CYAN, '#ff5cff']

const LAMINAR = {
  color_l: `${E}sd_text_color_L`, color_l2: `${E}sd_text_color_L2`, color_r: `${E}sd_text_color_R`,
  normal: 'laminar/A333/data/sts_normal_msg_show',
}
for (let i = 1; i <= LINES; i++) {
  const nn = String(i).padStart(2, '0')
  LAMINAR[`l${i}`] = `${E}sd_text_msg_L_${nn}`
  LAMINAR[`l2_${i}`] = `${E}sd_text_msg_L2_${nn}`
  LAMINAR[`r${i}`] = `${E}sd_text_msg_R_${nn}`
}

export const DEFAULTS = { ...SD_FOOTER_DREFS, ...LAMINAR }

export class A333Status extends BaseInstrument {
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
    const { ctx, w, h } = this, v = this._v
    const lab = Math.max(7, Math.min(h * 0.04, w * 0.04))
    text(ctx, 'STATUS', w / 2, h * 0.045, lab * 1.3, SD_WHITE)
    ctx.fillStyle = SD_WHITE; ctx.fillRect(w / 2 - lab * 2.6, h * 0.045 + lab * 0.8, lab * 5.2, Math.max(1, lab * 0.1))
    const splitX = w * 0.63
    sdLine(ctx, [[splitX, h * 0.15], [splitX - w * 0.01, h * 0.8]], SD_WHITE, Math.max(1, lab * 0.12))

    const col = (arr, i) => COLORS[Math.round(at(arr, i, 3))] || SD_WHITE
    const top = h * 0.12, lineH = (h * 0.85 - top) / LINES
    const size = Math.min(lineH * 0.85, (splitX - w * 0.04) / (24 * 0.6))
    let any = false
    for (let i = 0; i < LINES; i++) {
      const y = top + lineH * (i + 0.5)
      const l = dataText(v[`l${i + 1}`]).replace(/\s+$/, ''), l2 = dataText(v[`l2_${i + 1}`])
      const r = dataText(v[`r${i + 1}`]).replace(/\s+$/, '')
      if (l) { text(ctx, l, w * 0.03, y, size, col(v.color_l, i), 'left', MONO); any = true }
      if (l2.trim()) { text(ctx, l2, w * 0.03, y, size, col(v.color_l2, i), 'left', MONO); any = true }   // overlay, spaces keep alignment
      if (r) { text(ctx, r, splitX + w * 0.02, y, size, col(v.color_r, i), 'left', MONO); any = true }
    }
    if (!any || num(v.normal, 0) > 0) text(ctx, 'NORMAL', w * 0.36, h * 0.4, lab * 1.1, SD_GREEN)

    sdFooter(ctx, w, h, v, lab)
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'a333_status',
  label:    'A330 STATUS (SD page)',
  icon:     '☰',
  order:    33,
  datarefs: DEFAULTS,
  requires: 'the Laminar A330 (publishes the laminar/A333/ecam/sd_text datarefs)',
  optionalDatarefs: [...Object.keys(SD_FOOTER_DREFS), 'normal'],
}
