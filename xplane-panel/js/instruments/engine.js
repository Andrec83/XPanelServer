import { BaseInstrument } from './base.js'

export const DEFAULTS = {
  n1_array:  'sim/flightmodel/engine/ENGN_N1_',
  n2_array:  'sim/flightmodel/engine/ENGN_N2_',
  rpm_array: 'sim/cockpit2/engine/indicators/prop_speed_rpm',
  mp_array:  'sim/cockpit2/engine/indicators/MPR_in_hg',
}

const JET_ZONES = [
  { lo: 0,          hi: 95  / 110, color: '#0c4' },
  { lo: 95  / 110,  hi: 100 / 110, color: '#fa0' },
  { lo: 100 / 110,  hi: 1.0,       color: '#f33' },
]

function _arcToFractionZones(arc, maxValue) {
  if (!arc || !maxValue) return null
  const pts = new Set([0, maxValue])
  for (const b of ['green', 'yellow', 'red']) {
    if (arc[b]) {
      pts.add(Math.max(0, arc[b][0]))
      pts.add(Math.min(maxValue, arc[b][1]))
    }
  }
  const sorted = [...pts].sort((a, b) => a - b)
  return sorted.slice(0, -1).map((lo, i) => {
    const hi  = sorted[i + 1]
    const mid = (lo + hi) / 2
    let color = '#555'
    if (arc.green  && mid >= arc.green[0]  && mid <= arc.green[1])  color = '#0c4'
    if (arc.yellow && mid >= arc.yellow[0] && mid <= arc.yellow[1]) color = '#fa0'
    if (arc.red    && mid >= arc.red[0]    && mid <= arc.red[1])    color = '#f33'
    return { lo: lo / maxValue, hi: hi / maxValue, color }
  })
}

export class EngineGauge extends BaseInstrument {
  constructor(canvas, config = {}, datarefs = {}, resolvedIds = {}) {
    super(canvas, config)
    this._drefs = { ...DEFAULTS, ...datarefs }
    this._engineCount = config.engineCount || 1
    this._autoCount   = !config.engineCount
    this._mode = 'jet'

    this._n1 = []; this._dN1 = []
    this._n2 = []; this._dN2 = []
    this._rpm = null
    this._mp  = null
    this._dRpm = []; this._dMp = []
    this._hasData = false

    for (let i = 0; i < 4; i++) {
      this._n1.push(0);  this._dN1.push(0)
      this._n2.push(0);  this._dN2.push(0)
      this._dRpm.push(0); this._dMp.push(0)
    }

    this._rpmRedline  = 2700
    this._rpmGreenMin = 0
    this._rpmGreenMax = 2700 * 0.9
    this._mpMax       = 30

    this._rpmZones = [
      { lo: 0, hi: 0.85, color: '#0c4' },
      { lo: 0.85, hi: 0.95, color: '#fa0' },
      { lo: 0.95, hi: 1,   color: '#f33' },
    ]
    this._mpZones = [
      { lo: 0, hi: 0.85, color: '#0c4' },
      { lo: 0.85, hi: 0.95, color: '#fa0' },
      { lo: 0.95, hi: 1,   color: '#f33' },
    ]
  }

  requiredDatarefs() { return Object.values(this._drefs) }

  setAircraftProfile(profile) {
    const et  = profile.engineType
    const lim = profile.limits

    if      (et.isPiston)    this._mode = 'piston'
    else if (et.isTurboprop) this._mode = 'turboprop'
    else                      this._mode = 'jet'

    if (this._autoCount) { this._engineCount = profile.numEngines; this._dirty = true }

    const R = 60 / (2 * Math.PI)
    this._rpmRedline  = et.rpmRedline  > 0 ? et.rpmRedline  * R : 2700
    this._rpmGreenMin = et.rpmGreenMin > 0 ? et.rpmGreenMin * R : 0
    this._rpmGreenMax = et.rpmGreenMax > 0 ? et.rpmGreenMax * R : this._rpmRedline * 0.9
    this._mpMax       = et.maxMP > 0 ? et.maxMP : 30

    this._rpmZones = this._rpmGreenMin > 0
      ? [
          { lo: 0,                                             hi: this._rpmGreenMin / this._rpmRedline, color: '#fa0' },
          { lo: this._rpmGreenMin / this._rpmRedline,          hi: this._rpmGreenMax / this._rpmRedline, color: '#0c4' },
          { lo: this._rpmGreenMax / this._rpmRedline,          hi: 1,                                    color: '#fa0' },
        ]
      : [
          { lo: 0,    hi: 0.85, color: '#0c4' },
          { lo: 0.85, hi: 0.95, color: '#fa0' },
          { lo: 0.95, hi: 1,    color: '#f33' },
        ]

    this._mpZones = _arcToFractionZones(profile.limits.mp, this._mpMax)
      ?? [
          { lo: 0,    hi: 0.85, color: '#0c4' },
          { lo: 0.85, hi: 0.95, color: '#fa0' },
          { lo: 0.95, hi: 1,    color: '#f33' },
        ]

    this._dirty = true
  }

  setEngineCount(n) {
    if (this._autoCount) { this._engineCount = n; this._dirty = true }
  }

  update(state) {
    const n1arr  = state[this._drefs.n1_array]
    const n2arr  = state[this._drefs.n2_array]
    const rpmArr = state[this._drefs.rpm_array]
    const mpArr  = state[this._drefs.mp_array]

    if (!Array.isArray(n1arr)) return
    this._hasData = true

    for (let i = 0; i < this._engineCount; i++) {
      this._n1[i] = n1arr[i] ?? 0
      this._n2[i] = Array.isArray(n2arr) ? (n2arr[i] ?? 0) : 0
    }

    this._rpm = Array.isArray(rpmArr) ? rpmArr : null
    this._mp  = Array.isArray(mpArr)  ? mpArr  : null

    this._dirty = true
  }

  _render() {
    const { ctx, w, h } = this
    if (!this._hasData) { this._drawNoData(); return }

    let stillMoving = false
    for (let i = 0; i < this._engineCount; i++) {
      this._dN1[i]  = this._lerp(this._dN1[i],  this._n1[i],  0.08)
      this._dN2[i]  = this._lerp(this._dN2[i],  this._n2[i],  0.08)
      if (Math.abs(this._dN1[i] - this._n1[i]) > 0.05) stillMoving = true
      if (Math.abs(this._dN2[i] - this._n2[i]) > 0.05) stillMoving = true

      if (this._mode === 'piston') {
        const rawRpm = this._rpm ? (this._rpm[i] ?? 0) : (this._n1[i] / 100 * this._rpmRedline)
        const rawMp  = this._mp  ? (this._mp[i]  ?? 0) : 0
        this._dRpm[i] = this._lerp(this._dRpm[i], rawRpm, 0.08)
        this._dMp[i]  = this._lerp(this._dMp[i],  rawMp,  0.08)
        if (Math.abs(this._dRpm[i] - rawRpm) > 0.5) stillMoving = true
        if (Math.abs(this._dMp[i]  - rawMp)  > 0.1) stillMoving = true
      } else if (this._mode === 'turboprop') {
        const rawNp = this._rpm ? (this._rpm[i] ?? 0) : 0
        this._dRpm[i] = this._lerp(this._dRpm[i], rawNp, 0.08)
        if (Math.abs(this._dRpm[i] - rawNp) > 0.5) stillMoving = true
      }
    }
    this._dirty = stillMoving

    this._drawBars()
  }

  _drawBars() {
    const { ctx, w, h } = this
    const t = this._theme
    const n = this._engineCount

    ctx.fillStyle = t.panelBg
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = t.frameBorder; ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

    const F_ENG  = 0.08
    const F_BAR  = 0.56
    const F_GAP  = 0.01
    const F_BOX  = 0.11
    const F_UNIT = 0.07
    const F_NAME = 0.11

    const engLabelCY = h * F_ENG * 0.5
    const barTop     = h * F_ENG
    const barMaxH    = h * F_BAR
    const barBaseY   = barTop + barMaxH
    const valBoxY    = barBaseY + h * F_GAP
    const valBoxH    = h * F_BOX
    const unitCY     = valBoxY + valBoxH + h * F_UNIT  * 0.5
    const nameCY     = unitCY  + h * F_UNIT * 0.5 + h * F_NAME * 0.5

    const valBoxFS = Math.min(12, valBoxH * 0.60)
    const unitFS   = Math.min(10, h * F_UNIT * 0.65)
    const nameFS   = Math.min(11, h * F_NAME * 0.65)

    const hPad = Math.max(4, w * 0.04)
    const colW = (w - hPad * 2) / n
    const bw   = Math.max(6, colW * 0.36)

    for (let i = 0; i < n; i++) {
      const cx = hPad + colW * (i + 0.5)
      const lx = cx - bw * 1.1
      const rx = cx + bw * 0.1

      if (i > 0) {
        ctx.strokeStyle = t.divider + '66'; ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(hPad + colW * i, h * 0.03)
        ctx.lineTo(hPad + colW * i, h * 0.97)
        ctx.stroke()
      }

      ctx.fillStyle = t.labelDim
      ctx.font = `${Math.max(6, h * F_ENG * 0.58)}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`ENG ${i + 1}`, cx, engLabelCY)

      if (this._mode === 'piston') {
        const rawRpm = this._rpm ? (this._rpm[i] ?? 0) : (this._n1[i] / 100 * this._rpmRedline)
        const rawMp  = this._mp  ? (this._mp[i]  ?? 0) : 0
        this._drawBar(lx, barBaseY, bw, barMaxH, this._dRpm[i], rawRpm, this._rpmRedline, this._rpmZones,
                      'RPM', '',    valBoxY, valBoxH, unitCY, nameCY, valBoxFS, unitFS, nameFS)
        this._drawBar(rx, barBaseY, bw, barMaxH, this._dMp[i],  rawMp,  this._mpMax,      this._mpZones,
                      'MP',  'inHg',  valBoxY, valBoxH, unitCY, nameCY, valBoxFS, unitFS, nameFS)
      } else if (this._mode === 'turboprop') {
        const rawNp = this._rpm ? (this._rpm[i] ?? 0) : 0
        this._drawBar(lx, barBaseY, bw, barMaxH, this._dN1[i],  this._n1[i], 110,             JET_ZONES,
                      'NG', '%',   valBoxY, valBoxH, unitCY, nameCY, valBoxFS, unitFS, nameFS)
        this._drawBar(rx, barBaseY, bw, barMaxH, this._dRpm[i], rawNp, this._rpmRedline, this._rpmZones,
                      'NP', 'RPM', valBoxY, valBoxH, unitCY, nameCY, valBoxFS, unitFS, nameFS)
      } else {
        this._drawBar(lx, barBaseY, bw, barMaxH, this._dN1[i], this._n1[i], 110, JET_ZONES,
                      'N1', '%', valBoxY, valBoxH, unitCY, nameCY, valBoxFS, unitFS, nameFS)
        this._drawBar(rx, barBaseY, bw, barMaxH, this._dN2[i], this._n2[i], 110, JET_ZONES,
                      'N2', '%', valBoxY, valBoxH, unitCY, nameCY, valBoxFS, unitFS, nameFS)
      }
    }
  }

  _drawBar(x, baseY, bw, maxH, dispVal, rawVal, maxVal, zones, label, unit,
           valBoxY, valBoxH, unitCY, nameCY, valBoxFS, unitFS, nameFS) {
    const { ctx } = this
    const t = this._theme
    const dispFrac = maxVal > 0 ? Math.max(0, Math.min(1, dispVal / maxVal)) : 0
    const rawFrac  = maxVal > 0 ? Math.max(0, Math.min(1, (rawVal ?? 0) / maxVal)) : 0

    let zoneColor = t.accent
    for (const z of zones) {
      if (rawFrac >= z.lo && rawFrac <= z.hi) { zoneColor = z.color; break }
    }
    const isWarn = zoneColor === '#f33' || zoneColor === '#fa0'

    ctx.fillStyle = '#0e0e0e'
    ctx.fillRect(x, baseY - maxH, bw, maxH)
    ctx.strokeStyle = '#2e2e2e'; ctx.lineWidth = 1
    ctx.strokeRect(x, baseY - maxH, bw, maxH)

    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1
    for (const tick of [0.25, 0.50, 0.75]) {
      const ty = baseY - maxH * tick
      ctx.beginPath()
      ctx.moveTo(x, ty); ctx.lineTo(x + bw * 0.28, ty)
      ctx.stroke()
    }

    ctx.lineWidth = 2
    for (let zi = 0; zi < zones.length - 1; zi++) {
      const by = baseY - maxH * zones[zi].hi
      ctx.strokeStyle = zones[zi + 1].color
      ctx.beginPath()
      ctx.moveTo(x + bw * 0.72, by); ctx.lineTo(x + bw, by)
      ctx.stroke()
    }

    ctx.strokeStyle = '#c00'; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, baseY - maxH + 1); ctx.lineTo(x + bw, baseY - maxH + 1)
    ctx.stroke()

    if (dispFrac > 0.002) {
      const fillH  = maxH * dispFrac
      const fillBg = isWarn ? (zoneColor === '#f33' ? '#6a0e0e' : '#6a4900') : '#0b4d22'
      const fillHi = isWarn ? (zoneColor === '#f33' ? '#b01616' : '#b07000') : '#178a38'

      ctx.fillStyle = fillBg
      ctx.fillRect(x + 1, baseY - fillH, bw - 2, fillH - 1)

      const hiH = Math.min(fillH * 0.22, 6)
      ctx.fillStyle = fillHi
      ctx.fillRect(x + 1, baseY - fillH, bw - 2, hiH)

      ctx.strokeStyle = isWarn ? (zoneColor === '#f33' ? '#f55' : '#fb2') : '#2e6'
      ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(x + 1, baseY - fillH); ctx.lineTo(x + bw - 1, baseY - fillH)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    const bxX = x - 1, bxW = bw + 2
    ctx.fillStyle = t.digitalBg
    ctx.strokeStyle = isWarn ? zoneColor : t.digitalBorder
    ctx.lineWidth = 1
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(bxX, valBoxY, bxW, valBoxH, 2)
      ctx.fill(); ctx.stroke()
    } else {
      ctx.fillRect(bxX, valBoxY, bxW, valBoxH)
      ctx.strokeRect(bxX, valBoxY, bxW, valBoxH)
    }
    ctx.fillStyle    = isWarn ? zoneColor : t.accent
    ctx.font         = `bold ${Math.max(5, valBoxFS)}px monospace`
    ctx.textAlign    = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText((rawVal ?? 0).toFixed(0), x + bw / 2, valBoxY + valBoxH / 2)

    ctx.fillStyle = t.labelDim
    ctx.font = `${Math.max(5, unitFS)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(unit, x + bw / 2, unitCY)

    ctx.fillStyle = '#888'
    ctx.font = `${Math.max(5, nameFS)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, x + bw / 2, nameCY)
  }
}
