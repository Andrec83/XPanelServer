export const DEFAULT_THEME = {
  bezelBg:       '#1a1a1a',
  dialFace:      '#1e1e1e',
  dialRim:       '#555',
  panelBg:       '#1a1a1a',
  frameBorder:   '#444',
  divider:       '#333',
  needle:        '#e8e8e8',
  sky:           '#1a3a6a',
  earth:         '#5a3010',
  accent:        '#4af',
  accentDim:     '#999',
  labelDim:      '#666',
  digitalBg:     '#000',
  digitalBorder: '#444',
  capFill:       '#333',
  capStroke:     '#666',
  bugColor:      '#0cf',
  lubberColor:   '#fa0',
  warnColor:     '#fa0',
  alertColor:    '#f44',
}

export const NIGHT_THEME = {
  bezelBg:       '#0d0a06',
  dialFace:      '#0f0a05',
  dialRim:       '#3d2800',
  panelBg:       '#0d0a06',
  frameBorder:   '#3d2800',
  divider:       '#2a1a00',
  needle:        '#cc6600',
  sky:           '#0a1a3a',
  earth:         '#3a1e08',
  accent:        '#ff8800',
  accentDim:     '#663300',
  labelDim:      '#4d2a00',
  digitalBg:     '#050300',
  digitalBorder: '#3d1a00',
  capFill:       '#1a0d00',
  capStroke:     '#3d1a00',
  bugColor:      '#cc6600',
  lubberColor:   '#cc6600',
  warnColor:     '#fa0',
  alertColor:    '#f44',
}

export class BaseInstrument {
  constructor(canvas, config = {}) {
    this.canvas = canvas
    this.ctx    = canvas.getContext('2d')
    this.config = config
    this.values = {}
    this._dirty = true
    this._theme   = { ...DEFAULT_THEME, ...(config.theme || {}) }
    this._ambient = { ambientLight: 1, backlitLight: 0, hypoxia: 0, flood: 0 }
    this._setupResizeObserver()
    this._startLoop()
  }

  get w() { return this.canvas.width }
  get h() { return this.canvas.height }

  update(state) { throw new Error('implement update()') }
  requiredDatarefs() { throw new Error('implement requiredDatarefs()') }
  setAircraftProfile(profile) {}

  onPointerDown(x, y) {}
  onPointerMove(x, y) {}
  onPointerUp(x, y)   {}

  setTheme(overrides) {
    this._theme = { ...DEFAULT_THEME, ...overrides }
    this._dirty = true
  }

  // Called by panel.js when ambient sim state changes.
  // ambientLight : natural daylight reaching instruments, 0–1 (from sun pitch)
  // backlitLight : panel rheostat level 0–1 (instrument_brightness_ratio[0])
  // flood        : flood light on/off 0–1
  // hypoxia      : hypoxia severity 0–1
  setAmbient({ ambientLight = 1, backlitLight = 0, hypoxia = 0, flood = 0 } = {}) {
    this._ambient.ambientLight = ambientLight
    this._ambient.backlitLight = backlitLight
    this._ambient.hypoxia      = hypoxia
    this._ambient.flood        = flood
    this._dirty = true
  }

  destroy() {
    if (this._ro) this._ro.disconnect()
    this._dead = true
  }

  _setupResizeObserver() {
    this._ro = new ResizeObserver(() => {
      const rect = this.canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      this.canvas.width  = rect.width  || this.canvas.offsetWidth  || 200
      this.canvas.height = rect.height || this.canvas.offsetHeight || 200
      this._dirty = true
    })
    this._ro.observe(this.canvas.parentElement || this.canvas)
    const rect = this.canvas.parentElement?.getBoundingClientRect()
    if (rect && rect.width > 0) {
      this.canvas.width  = rect.width
      this.canvas.height = rect.height
    }
  }

  _startLoop() {
    const tick = () => {
      if (this._dead) return
      if (this._dirty) {
        this._dirty = false
        this._render()
        this._drawAmbientOverlays()
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  _render() {}

  // Drawn on top of every instrument frame — handles luminosity and environmental effects.
  // Luminosity model: visibleBrightness(y) = min(1, ambientLight + backlitLight + floodAtY)
  // floodAtY falls linearly from `flood` at the top to 0 at the bottom, producing a gradient
  // darkness overlay that creates the "light from above" perception for flood lights.
  // No colour tinting is applied — instruments always render in their base colours.
  _drawAmbientOverlays() {
    const { ctx, w, h } = this
    const { ambientLight, backlitLight, hypoxia, flood } = this._ambient

    // ── 1. Darkness gradient ─────────────────────────────────────────────────
    // Top receives full flood contribution; bottom receives none.
    const topBrightness    = Math.min(1, ambientLight + backlitLight + flood)
    const bottomBrightness = Math.min(1, ambientLight + backlitLight)
    const topDark    = 1 - topBrightness
    const bottomDark = 1 - bottomBrightness

    if (bottomDark > 0.005 || topDark > 0.005) {
      if (Math.abs(topDark - bottomDark) < 0.01) {
        ctx.fillStyle = `rgba(0,0,0,${bottomDark.toFixed(3)})`
      } else {
        const gd = ctx.createLinearGradient(0, 0, 0, h)
        gd.addColorStop(0, `rgba(0,0,0,${topDark.toFixed(3)})`)
        gd.addColorStop(1, `rgba(0,0,0,${bottomDark.toFixed(3)})`)
        ctx.fillStyle = gd
      }
      ctx.fillRect(0, 0, w, h)
    }

    // ── 2. Flood warm colour tint from above ─────────────────────────────────
    // Brightness handled by the gradient above; this adds only a subtle warm hue.
    if (flood > 0.005) {
      const a    = flood * 0.25
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0,    `rgba(255,225,130,${a.toFixed(3)})`)
      grad.addColorStop(0.35, `rgba(255,210,90,${(a * 0.4).toFixed(3)})`)
      grad.addColorStop(0.7,  `rgba(255,200,60,${(a * 0.06).toFixed(3)})`)
      grad.addColorStop(1,    'rgba(255,200,60,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    }

    // ── 3. Hypoxia: full-instrument black overlay ────────────────────────────
    if (hypoxia > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.97, hypoxia).toFixed(3)})`
      ctx.fillRect(0, 0, w, h)
    }
  }

  _drawNoData() {
    const { ctx, w, h } = this
    ctx.fillStyle = this._theme.panelBg
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f90'
    ctx.font = `${Math.max(10, Math.min(14, w * 0.08))}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('NO DATA', w / 2, h / 2)
  }

  _lerp(current, target, factor) {
    return current + (target - current) * factor
  }

  _drawBezel() {
    const { ctx, w, h } = this
    const t = this._theme
    const r = Math.min(w, h) * 0.02
    ctx.fillStyle = t.bezelBg
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(0, 0, w, h, r) : ctx.rect(0, 0, w, h)
    ctx.fill()
    const rim = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*.4, w/2, h/2, Math.min(w,h)*.52)
    rim.addColorStop(0, 'transparent')
    rim.addColorStop(1, '#000a')
    ctx.fillStyle = rim
    ctx.fillRect(0, 0, w, h)
  }
}
