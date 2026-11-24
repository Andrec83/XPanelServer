// _sd.js — shared parts of the A330 system display (SD) pages: page title and the
// permanent data strip at the bottom (TAT / SAT, UTC time, gross weight).
// No META, so the Panel Manager doesn't list it as an instrument.

import { num, text } from '../_glass.js'

export const SD_GREEN = '#3dff6a', SD_WHITE = '#f2f2f2', SD_CYAN = '#4fd8ff', SD_AMBER = '#ffa526', SD_RED = '#ff3030'

export const SD_FOOTER_DREFS = {
  tat:  'sim/cockpit2/gauges/indicators/TAT_stby',
  sat:  'sim/cockpit2/temperature/outside_air_temp_degc',
  zulu: 'sim/time/zulu_time_sec',
  gw:   'sim/flightmodel/weight/m_total',
}

/** Page title, white and underlined, top left. */
export function sdTitle(ctx, s, w, h, lab) {
  const size = lab * 1.3
  text(ctx, s, w * 0.03, h * 0.045, size, SD_WHITE, 'left')
  ctx.font = `${size.toFixed(1)}px Arial, sans-serif`
  const tw = ctx.measureText(s).width
  ctx.fillStyle = SD_WHITE
  ctx.fillRect(w * 0.03, h * 0.045 + size * 0.6, tw, Math.max(1, size * 0.08))
}

/** Height of the footer strip as a fraction of the page height. */
export const SD_FOOTER = 0.11

/** Permanent data strip: TAT / SAT left, UTC centre, GW right (GWCG isn't published). */
export function sdFooter(ctx, w, h, v, lab) {
  const top = h * (1 - SD_FOOTER)
  ctx.strokeStyle = SD_WHITE; ctx.lineWidth = Math.max(1, h * 0.003)
  ctx.beginPath()
  ctx.moveTo(w * 0.01, top); ctx.lineTo(w * 0.99, top)
  ctx.moveTo(w * 0.34, top); ctx.lineTo(w * 0.34, h * 0.99)
  ctx.moveTo(w * 0.62, top); ctx.lineTo(w * 0.62, h * 0.99)
  ctx.stroke()
  const y1 = top + h * 0.03, y2 = top + h * 0.075, s = lab * 0.9
  const temp = t => Number.isFinite(t) ? `${t >= 0 ? '+' : ''}${Math.round(t)}` : 'XX'
  for (const [label, key, y] of [['TAT', 'tat', y1], ['SAT', 'sat', y2]]) {
    text(ctx, label, w * 0.03, y, s, SD_WHITE, 'left')
    text(ctx, temp(num(v[key], NaN)), w * 0.22, y, s, SD_GREEN, 'right')
    text(ctx, '°C', w * 0.24, y, s * 0.9, SD_CYAN, 'left')
  }
  const z = num(v.zulu, NaN)
  if (Number.isFinite(z)) {
    const hh = String(Math.floor(z / 3600) % 24).padStart(2, '0'), mm = String(Math.floor(z / 60) % 60).padStart(2, '0')
    text(ctx, hh, w * 0.44, (y1 + y2) / 2, s * 1.1, SD_GREEN, 'right')
    text(ctx, 'H', w * 0.48, (y1 + y2) / 2, s * 0.9, SD_CYAN)
    text(ctx, mm, w * 0.52, (y1 + y2) / 2, s * 1.1, SD_GREEN, 'left')
  }
  const gw = num(v.gw, NaN)
  text(ctx, 'GW', w * 0.65, y1, s, SD_WHITE, 'left')
  text(ctx, Number.isFinite(gw) ? String(Math.round(gw / 100) * 100) : '--', w * 0.9, y1, s, SD_GREEN, 'right')
  text(ctx, 'KG', w * 0.92, y1, s * 0.9, SD_CYAN, 'left')
  text(ctx, 'GWCG', w * 0.65, y2, s, SD_WHITE, 'left')
  text(ctx, '--', w * 0.9, y2, s, SD_GREEN, 'right')
  text(ctx, '%', w * 0.92, y2, s * 0.9, SD_CYAN, 'left')
}

/**
 * Valve: circle with a bar — bar along the flow = open, across the flow = closed.
 * flow: 'v' (vertical line through the valve) or 'h'.
 */
export function sdValve(ctx, x, y, r, open, flow, color = SD_GREEN) {
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, r * 0.16)
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  const vertical = (flow === 'v') === !!open
  ctx.beginPath()
  if (vertical) { ctx.moveTo(x, y - r); ctx.lineTo(x, y + r) } else { ctx.moveTo(x - r, y); ctx.lineTo(x + r, y) }
  ctx.stroke()
}

/** Small outline triangle; dir 'up' | 'down' | 'left' | 'right'. */
export function sdTri(ctx, x, y, s, dir, color = SD_WHITE, fill = false) {
  const pts = { up: [[0, -s], [s, s * 0.8], [-s, s * 0.8]], down: [[0, s], [s, -s * 0.8], [-s, -s * 0.8]],
    left: [[-s, 0], [s * 0.8, -s], [s * 0.8, s]], right: [[s, 0], [-s * 0.8, -s], [-s * 0.8, s]] }[dir]
  ctx.beginPath(); pts.forEach(([dx, dy], i) => i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)); ctx.closePath()
  if (fill) { ctx.fillStyle = color; ctx.fill() } else { ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, s * 0.18); ctx.stroke() }
}

/** Bus bar: grey bar with the bus name, green when powered, amber when not. */
export function sdBus(ctx, x, y, w, h, name, powered, lab) {
  ctx.fillStyle = '#4a4a4a'; ctx.fillRect(x - w / 2, y - h / 2, w, h)
  text(ctx, name, x, y, lab * 1.05, powered ? SD_GREEN : SD_AMBER)
}

/** Polyline helper: [[x, y], …] in pixels. */
export function sdLine(ctx, pts, color = SD_GREEN, width = 2) {
  ctx.strokeStyle = color; ctx.lineWidth = width
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke()
}
