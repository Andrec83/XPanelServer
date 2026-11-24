import { BaseInstrument } from './base.js'

export class BlankInstrument extends BaseInstrument {
  constructor(canvas, config = {}) {
    super(canvas, config)
    
    this._hasData = true 
    this._dirty = true // Mark dirty ONCE on startup to force the initial black paint
  }

  requiredDatarefs() { 
    return [] // Return an empty array so it doesn't request simulator variables
  }

  update(state) {
    // Check if the panel size changed while running. If it did, flag a redraw.
    if (this._lastW !== this.w || this._lastH !== this.h) {
      this._dirty = true
    }
  }

  _render() {
    const { ctx, w, h } = this
    if (!ctx) return

    ctx.save()
    ctx.fillStyle = '#000000' 
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // Cache the dimensions we just drew
    this._lastW = w
    this._lastH = h
    this._dirty = false // Clear the dirty flag so the manager stops refreshing us
  }

  _drawNoData() {
    this._render() 
  }
}

// ── Panel Manager registration (see ARCHITECTURE.md → Adding a new instrument) ──
export const META = {
  type:     'blanc',
  label:    'Blank Tile',
  icon:     '▫',
  order:    990,
  datarefs: {},
}
