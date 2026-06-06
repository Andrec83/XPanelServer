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
    this._theme = { ...DEFAULT_THEME, ...(config.theme || {}) }
    this._ambient = { night: 0, hypoxia: 0, flood: 0 }
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

  // level: 0 = full day, 1 = full night backlit
  setNightMode(level) {
    this._theme = level > 0.35 ? { ...NIGHT_THEME } : { ...DEFAULT_THEME }
    this._dirty = true
  }

  // Called by panel.js when ambient sim state changes.
  // night   : instrument brightness ratio 0–1 (from sim/cockpit2/switches/instrument_brightness_ratio)
  // hypoxia : hypoxia severity 0–1
  // flood   : flood light level 0–1
  setAmbient({ night = 0, hypoxia = 0, flood = 0 } = {}) {
    this._ambient.night   = night
    this._ambient.hypoxia = hypoxia
    this._ambient.flood   = flood
    this.setNightMode(night)
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

  // Drawn on top of every instrument frame — driven entirely by _ambient state.
  _drawAmbientOverlays() {
    const { ctx, w, h } = this
    const { hypoxia, flood } = this._ambient

    // Hypoxia: flat black overlay, linearly more opaque as hypoxia increases
    if (hypoxia > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.97, hypoxia).toFixed(3)})`
      ctx.fillRect(0, 0, w, h)
    }

    // Flood light: warm amber-white wash from above (glareshield / overhead lamp)
    if (flood > 0.01) {
      const a = flood * 0.38
      const grad = ctx.createLinearGradient(w / 2, 0, w / 2, h * 0.75)
      grad.addColorStop(0,   `rgba(255,215,110,${a})`)
      grad.addColorStop(0.45,`rgba(255,200,80,${a * 0.55})`)
      grad.addColorStop(1,   'rgba(255,200,80,0)')
      ctx.fillStyle = grad
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
