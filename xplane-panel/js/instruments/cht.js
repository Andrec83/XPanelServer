import { BaseInstrument } from './base.js'

export const DEFAULTS = {
  cht:     'sim/cockpit2/engine/indicators/CHT_CYL_deg_C',
  cht_avg: 'sim/cockpit2/engine/indicators/CHT_deg_C',
  egt:     'sim/cockpit2/engine/indicators/EGT_deg_C',
}

export class CHTGauge extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs     = { ...DEFAULTS, ...datarefs }
    this._engineIdx = config.engineIndex ?? 0
    this._maxTemp   = config.maxTemp ?? 500
    this._cyls      = new Array(12).fill(0)
    this._dCyls     = new Array(12).fill(0)
    this._numCyls   = 0
    this._egt       = null
    this._hasData   = false

    this._chtGreenHi  = 350
    this._chtYellowHi = 420
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  setAircraftProfile(profile) {
    const et     = profile.engineType
    const lim    = profile.limits.cht
    if (et.numCylinders > 0) this._numCyls = et.numCylinders
    if (et.maxCHT > 0) this._maxTemp = et.maxCHT
    if (lim?.green) {
      this._chtGreenHi  = lim.green[1]
      this._chtYellowHi = lim.yellow?.[1] ?? et.maxCHT ?? 500
    }
    this._dirty = true
  }

  update(state) {
    const cht = state[this._drefs.cht]
    const egt = state[this._drefs.egt]

    if (Array.isArray(cht) && cht.length > 0) {
      const base = this._engineIdx * 12
      for (let i = 0; i < 12; i++) this._cyls[i] = cht[base + i] ?? 0
      if (!this._hasData) {
        this._numCyls = this._cyls.filter(v => v > 0).length || 0
        console.log(`[CHT eng${this._engineIdx}] per-cyl data: len=${cht.length} base=${base} cyls=${this._numCyls} vals=[${this._cyls.slice(0,this._numCyls).map(v=>Math.round(v)).join(',')}]`)
      }
      this._hasData = true
    } else {
      const avg = state[this._drefs.cht_avg]
      const v   = Array.isArray(avg) ? (avg[this._engineIdx] ?? 0)
                : typeof avg === 'number' ? avg : 0
      if (v > 0) {
        if (!this._hasData) {
          this._numCyls = 1
          console.log(`[CHT eng${this._engineIdx}] using per-engine avg CHT=${Math.round(v)}`)
        }
        this._cyls.fill(v)
        this._hasData = true
      } else if (!this._hasData) {
        console.warn(`[CHT eng${this._engineIdx}] no data — per-cyl: ${this._drefs.cht} not found; avg: ${avg}`)
      }
    }

    if (Array.isArray(egt)) {
      this._egt = egt[this._engineIdx] ?? null
    } else if (typeof egt === 'number') {
      this._egt = egt
    }
    if (!this._hasData && this._egt != null && this._egt > 0) this._hasData = true

    this._dirty = true
  }

  _render() {
    const { w, h } = this
    if (!this._hasData) { this._drawNoData(); return }
    const nCyls = this._numCyls || 12
    let moving = false
    for (let i = 0; i < nCyls; i++) {
      this._dCyls[i] = this._lerp(this._dCyls[i], this._cyls[i], 0.1)
      if (Math.abs(this._dCyls[i] - this._cyls[i]) > 0.5) moving = true
    }
    this._dirty = moving
    this._drawBars()
  }

  _drawBars() {
    const { ctx, w, h } = this
    const t = this._theme
    const nCyls  = this._numCyls || this._cyls.filter(v => v > 0).length || 4
    const active = Array.from({ length: nCyls }, (_, i) => ({ i, v: this._cyls[i] }))

    const maxTemp  = this._maxTemp
    const greenHi  = this._chtGreenHi  ?? 350
    const yellowHi = this._chtYellowHi ?? 420

    const F_TITLE = 0.09
    const F_BAR   = 0.62
    const F_CYL   = 0.10
    const F_VAL   = 0.11

    const titleCY  = h * F_TITLE * 0.5
    const barMaxH  = h * F_BAR
    const barBaseY = h * (F_TITLE + F_BAR)
    const cylLabelY = barBaseY + h * F_CYL * 0.5
    const valueY    = cylLabelY + h * F_CYL * 0.5 + h * F_VAL * 0.5
    const titleFS  = Math.max(7,  h * F_TITLE * 0.60)
    const cylFS    = Math.max(5,  h * F_CYL   * 0.62)
    const valFS    = Math.min(11, Math.max(6, h * F_VAL * 0.60))

    const n       = active.length
    const padding = w * 0.06
    const colW    = (w - padding * 2) / n
    const barW    = colW * 0.55

    ctx.fillStyle = t.panelBg; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = t.frameBorder; ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

    ctx.fillStyle = t.labelDim
    ctx.font = `${titleFS}px sans-serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`CHT  ENG ${this._engineIdx + 1}`, padding, titleCY)

    for (let ci = 0; ci < n; ci++) {
      const cyl    = active[ci] ?? { i: ci, v: 0 }
      const disp   = this._dCyls[cyl.i]
      const rawVal = this._cyls[cyl.i]
      const cx     = padding + colW * ci + colW / 2
      const bx     = cx - barW / 2
      const fillH  = (Math.min(disp, maxTemp) / maxTemp) * barMaxH

      ctx.fillStyle = '#0e0e0e'; ctx.strokeStyle = '#2e2e2e'; ctx.lineWidth = 1
      ctx.fillRect(bx, barBaseY - barMaxH, barW, barMaxH)
      ctx.strokeRect(bx, barBaseY - barMaxH, barW, barMaxH)

      const g = (greenHi  / maxTemp) * barMaxH
      const y = (yellowHi / maxTemp) * barMaxH
      let drawn = 0
      for (const [limit, color] of [[g, '#0b4d22'], [y, '#6a4900'], [barMaxH, '#6a0e0e']]) {
        const seg = Math.min(limit, fillH) - drawn
        if (seg <= 0) continue
        ctx.fillStyle = color
        ctx.fillRect(bx + 1, barBaseY - drawn - seg, barW - 2, seg)
        drawn += seg
        if (drawn >= fillH) break
      }

      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(bx, barBaseY - g); ctx.lineTo(bx + barW, barBaseY - g)
      ctx.moveTo(bx, barBaseY - y); ctx.lineTo(bx + barW, barBaseY - y)
      ctx.stroke()

      if (fillH > 1) {
        const edgeColor = rawVal > yellowHi ? '#f55' : rawVal > greenHi ? '#fb2' : '#2e6'
        ctx.strokeStyle = edgeColor; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8
        ctx.beginPath()
        ctx.moveTo(bx + 1, barBaseY - fillH)
        ctx.lineTo(bx + barW - 1, barBaseY - fillH)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      ctx.fillStyle = t.labelDim
      ctx.font = `${cylFS}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`C${cyl.i + 1}`, cx, cylLabelY)

      ctx.fillStyle = rawVal > yellowHi ? '#f33' : rawVal > greenHi ? '#fa0' : t.accent
      ctx.font = `bold ${valFS}px monospace`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(Math.round(rawVal), cx, valueY)
    }

    if (this._egt != null) {
      ctx.fillStyle = t.labelDim
      ctx.font = `${titleFS}px sans-serif`
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      ctx.fillText(`EGT ${Math.round(this._egt)}°`, w - padding, titleCY)
    }
  }
}
