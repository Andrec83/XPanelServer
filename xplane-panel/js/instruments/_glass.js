// _glass.js — shared helpers for the airliner glass displays (Boeing 737 / Airbus A330
// sections). Files starting with "_" are not listed as instruments, so this module is
// only imported by the instruments that use it.
//
// Everything here works on X-Plane's standard datarefs, so the displays also work on
// other jets — only the look is aircraft-specific.

const E = 'sim/cockpit2/engine/indicators/'

// Standard engine / fuel datarefs shared by the displays
export const ENGINE_DREFS = {
  num_engines: 'sim/aircraft/engine/acf_num_engines',
  n1:          `${E}N1_percent`,
  n2:          `${E}N2_percent`,
  egt:         `${E}EGT_deg_C`,
  epr:         `${E}EPR_ratio`,
  ff:          `${E}fuel_flow_kg_sec`,
  oil_p:       `${E}oil_pressure_psi`,
  oil_t:       `${E}oil_temperature_deg_C`,
  oil_q:       `${E}oil_quantity_ratio`,
  running:     'sim/flightmodel/engine/ENGN_running',
  reverser:    'sim/flightmodel2/engines/thrust_reverser_deploy_ratio',
  n1_red:      'sim/aircraft/limits/red_hi_N1',
  n2_red:      'sim/aircraft/limits/red_hi_N2',
  egt_red:     'sim/aircraft/limits/red_hi_EGT',
  epr_red:     'sim/aircraft/limits/red_hi_EPR',
  oilp_red_lo: 'sim/aircraft/limits/red_lo_oilP',
  oilp_red_hi: 'sim/aircraft/limits/red_hi_oilP',
  oilt_red:    'sim/aircraft/limits/red_hi_oilT',
}

export const FUEL_DREFS = {
  fuel_qty:   'sim/cockpit2/fuel/fuel_quantity',          // kg per tank
  tank_rat:   'sim/aircraft/overflow/acf_tank_rat',       // share of total capacity per tank
  tank_x:     'sim/aircraft/overflow/acf_tank_X',         // lateral position (− left, + right)
  tank_z:     'sim/aircraft/overflow/acf_tank_Z',         // longitudinal position (+ aft)
  fuel_cap:   'sim/aircraft/weight/acf_m_fuel_tot',       // total capacity kg
  fuel_total: 'sim/flightmodel/weight/m_fuel_total',      // fuel on board kg
  fuel_used:  'sim/cockpit2/fuel/fuel_totalizer_sum_kg',  // used since the totalizer was reset
  ff:         `${E}fuel_flow_kg_sec`,
  num_engines:'sim/aircraft/engine/acf_num_engines',
}

// Keep the latest value of every dataref the instrument declared, keyed by DEFAULTS key.
export function pick(state, drefs, into) {
  let changed = false
  for (const [key, name] of Object.entries(drefs)) {
    const v = state[name]
    if (v !== undefined && v !== into[key]) { into[key] = v; changed = true }
  }
  return changed
}

export const at  = (v, i, d = 0) => Array.isArray(v) ? (Number.isFinite(+v[i]) ? +v[i] : d) : (i === 0 && Number.isFinite(+v) ? +v : d)
export const num = (v, d = 0) => Array.isArray(v) ? at(v, 0, d) : (Number.isFinite(+v) && v !== null ? +v : d)
export const engineCount = v => Math.max(1, Math.min(4, Math.round(num(v, 2)) || 2))

export const MONO = '"DejaVu Sans Mono", Consolas, "Lucida Console", monospace'
export const SANS = 'Arial, "Helvetica Neue", sans-serif'

const rad = d => d * Math.PI / 180

/**
 * Round dial with a scale arc, optional ticks, red/amber marks and a needle.
 *   angles in degrees, 0° = 3 o'clock, positive = clockwise (canvas convention)
 * opts: { cx, cy, r, value, min, max, start, sweep, ticks: [values], labels: [[value, text]],
 *         red, amber, bug, colors: { scale, needle, red, amber, bug, fill, label }, fill: bool,
 *         width }
 */
export function dial(ctx, o) {
  const c = { scale: '#e8e8e8', needle: '#ffffff', red: '#ff2b2b', amber: '#ffb000', bug: '#2bff4a', fill: 'rgba(160,160,160,0.35)', label: '#e8e8e8', ...o.colors }
  const ang = v => o.start + o.sweep * Math.max(0, Math.min(1, (v - o.min) / (o.max - o.min)))
  const lw = o.width ?? Math.max(1.5, o.r * 0.06)

  if (o.fill && Number.isFinite(o.value)) {                   // 737-style filled sector
    ctx.beginPath()
    ctx.moveTo(o.cx, o.cy)
    ctx.arc(o.cx, o.cy, o.r, rad(o.start), rad(ang(o.value)))
    ctx.closePath()
    ctx.fillStyle = c.fill
    ctx.fill()
  }
  const arcEnd = o.red ? ang(o.red) : o.start + o.sweep
  ctx.lineWidth = lw
  ctx.strokeStyle = c.scale
  ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, rad(o.start), rad(arcEnd)); ctx.stroke()
  if (o.amber && o.amber < (o.red ?? o.max)) {
    ctx.strokeStyle = c.amber
    ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, rad(ang(o.amber)), rad(ang(o.red ?? o.max))); ctx.stroke()
  }
  if (o.red) {                                                // red radial at the limit
    const a = rad(ang(o.red))
    ctx.strokeStyle = c.red
    ctx.lineWidth = lw * 1.4
    ctx.beginPath()
    ctx.moveTo(o.cx + Math.cos(a) * o.r * 0.78, o.cy + Math.sin(a) * o.r * 0.78)
    ctx.lineTo(o.cx + Math.cos(a) * o.r * 1.12, o.cy + Math.sin(a) * o.r * 1.12)
    ctx.stroke()
  }
  ctx.lineWidth = Math.max(1, lw * 0.7)
  ctx.strokeStyle = c.scale
  for (const t of o.ticks || []) {
    const a = rad(ang(t))
    ctx.beginPath()
    ctx.moveTo(o.cx + Math.cos(a) * o.r, o.cy + Math.sin(a) * o.r)
    ctx.lineTo(o.cx + Math.cos(a) * o.r * 0.86, o.cy + Math.sin(a) * o.r * 0.86)
    ctx.stroke()
  }
  if (o.labels) {
    ctx.fillStyle = c.label
    ctx.font = `${Math.max(7, o.r * 0.2).toFixed(1)}px ${SANS}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const [v, txt] of o.labels) {
      const a = rad(ang(v))
      ctx.fillText(txt, o.cx + Math.cos(a) * o.r * 0.68, o.cy + Math.sin(a) * o.r * 0.68)
    }
  }
  if (o.bug && o.bug > o.min) {                               // reference / limit bug
    const a = rad(ang(o.bug))
    ctx.fillStyle = c.bug
    ctx.beginPath()
    ctx.moveTo(o.cx + Math.cos(a) * o.r * 1.02, o.cy + Math.sin(a) * o.r * 1.02)
    ctx.lineTo(o.cx + Math.cos(a + 0.09) * o.r * 1.2, o.cy + Math.sin(a + 0.09) * o.r * 1.2)
    ctx.lineTo(o.cx + Math.cos(a - 0.09) * o.r * 1.2, o.cy + Math.sin(a - 0.09) * o.r * 1.2)
    ctx.closePath(); ctx.fill()
  }
  if (Number.isFinite(o.value)) {                             // needle
    const a = rad(ang(o.value))
    ctx.strokeStyle = c.needle
    ctx.lineWidth = Math.max(1.5, lw * 0.9)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(o.cx, o.cy)
    ctx.lineTo(o.cx + Math.cos(a) * o.r * 0.95, o.cy + Math.sin(a) * o.r * 0.95)
    ctx.stroke()
    ctx.lineCap = 'butt'
  }
}

/** Digital readout in a box: { x, y, w, h, text, color, border, font, align } */
export function readout(ctx, o) {
  if (o.border) {
    ctx.strokeStyle = o.border
    ctx.lineWidth = Math.max(1, o.h * 0.06)
    ctx.strokeRect(o.x, o.y, o.w, o.h)
  }
  ctx.fillStyle = o.color || '#fff'
  ctx.font = `${(o.size ?? o.h * 0.72).toFixed(1)}px ${o.font || SANS}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = o.align || 'right'
  const tx = ctx.textAlign === 'right' ? o.x + o.w - o.h * 0.15 : ctx.textAlign === 'left' ? o.x + o.h * 0.15 : o.x + o.w / 2
  ctx.fillText(o.text, tx, o.y + o.h * 0.54)
}

// ── Flight instruments (PFD / standby) ───────────────────────────────────────
const G = 'sim/cockpit2/gauges/indicators/'
export const FLIGHT_DREFS = {
  ias:        `${G}airspeed_kts_pilot`,
  ias_trend:  `${G}airspeed_acceleration_kts_sec_pilot`,
  mach:       `${G}mach_pilot`,
  alt:        `${G}altitude_ft_pilot`,
  vs:         `${G}vvi_fpm_pilot`,
  pitch:      `${G}pitch_AHARS_deg_pilot`,
  roll:       `${G}roll_AHARS_deg_pilot`,
  heading:    `${G}heading_AHARS_deg_mag_pilot`,
  track:      `${G}ground_track_mag_pilot`,
  slip:       `${G}slip_deg`,
  radio_alt:  `${G}radio_altimeter_height_ft_pilot`,
  baro:       'sim/cockpit2/gauges/actuators/barometer_setting_in_hg_pilot',
}

export const SKY = '#1f9be0', GROUND = '#b8641c'

/**
 * Attitude ball clipped to a (rounded) rectangle.
 * o: { x, y, w, h, pitch, roll, slip, radius, degSpan (visible pitch range, default 44),
 *      fd: { pitch, roll, showPitch, showRoll } | null, compact (standby style: no FD, thinner symbol),
 *      colors: { fd, symbol (outline), symbolFill } — default 737 style: magenta FD, white/black symbol,
 *      symbolWeight (thickness factor of the aircraft symbol, default 1),
 *      symbolGap / wingLen (wing position / length as a fraction of w, default 0.12 / 0.2),
 *      ladderScale (pitch ladder width factor, default 1),
 *      shape: 'barrel' (Airbus: convex sides, top and bottom) instead of the rounded rectangle }
 */
export function attitude(ctx, o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2
  const ppd = o.h / (o.degSpan || 44)                 // pixels per degree of pitch
  const pitch = Number.isFinite(o.pitch) ? o.pitch : 0
  const roll  = Number.isFinite(o.roll) ? o.roll : 0
  ctx.save()
  if (o.shape === 'barrel') {
    // intersection of four large circles: gently convex sides, top and bottom
    const rs = o.h * 1.15, rt = o.w * 1.1
    for (const [x0, y0, r] of [[o.x + rs, cy, rs], [o.x + o.w - rs, cy, rs], [cx, o.y + rt, rt], [cx, o.y + o.h - rt, rt]]) {
      ctx.beginPath(); ctx.arc(x0, y0, r, 0, Math.PI * 2); ctx.clip()
    }
  } else {
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(o.x, o.y, o.w, o.h, o.radius ?? o.w * 0.08) : ctx.rect(o.x, o.y, o.w, o.h)
    ctx.clip()
  }
  ctx.translate(cx, cy)
  ctx.rotate(-roll * Math.PI / 180)
  ctx.translate(0, pitch * ppd)
  const big = Math.max(o.w, o.h) * 3
  ctx.fillStyle = SKY;    ctx.fillRect(-big, -big, big * 2, big)
  ctx.fillStyle = GROUND; ctx.fillRect(-big, 0, big * 2, big)
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, o.h * 0.006)
  ctx.beginPath(); ctx.moveTo(-big, 0); ctx.lineTo(big, 0); ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = `${Math.max(7, o.h * 0.045).toFixed(1)}px ${SANS}`
  ctx.textBaseline = 'middle'
  for (let p = -90; p <= 90; p += 2.5) {
    if (p === 0 || Math.abs(p - pitch) > (o.degSpan || 44) * 0.42) continue
    const y = -p * ppd
    const lw0 = o.w * (o.ladderScale ?? 1)
    const len = p % 10 === 0 ? lw0 * 0.22 : p % 5 === 0 ? lw0 * 0.11 : lw0 * 0.055
    ctx.beginPath(); ctx.moveTo(-len, y); ctx.lineTo(len, y); ctx.stroke()
    if (p % 10 === 0) {
      ctx.textAlign = 'right'; ctx.fillText(String(Math.abs(p)), -len - lw0 * 0.03, y)
      ctx.textAlign = 'left';  ctx.fillText(String(Math.abs(p)), len + lw0 * 0.03, y)
    }
  }
  ctx.restore()

  // roll scale (fixed) + roll pointer and slip indicator (move with bank)
  const R = Math.min(o.w, o.h) * 0.44
  ctx.save()
  ctx.beginPath(); ctx.rect(o.x, o.y - R, o.w, o.h + R); ctx.clip()
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, o.h * 0.006)
  for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const t = (a - 90) * Math.PI / 180, l = Math.abs(a) % 30 === 0 ? R * 0.1 : R * 0.06
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R)
    ctx.lineTo(cx + Math.cos(t) * (R + l), cy + Math.sin(t) * (R + l))
    ctx.stroke()
  }
  ctx.fillStyle = '#fff'                              // fixed zero index
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx - R * 0.05, cy - R - R * 0.09); ctx.lineTo(cx + R * 0.05, cy - R - R * 0.09); ctx.closePath(); ctx.fill()
  ctx.translate(cx, cy); ctx.rotate(-roll * Math.PI / 180)
  ctx.beginPath(); ctx.moveTo(0, -R + 1); ctx.lineTo(-R * 0.06, -R + R * 0.1); ctx.lineTo(R * 0.06, -R + R * 0.1); ctx.closePath(); ctx.fill()
  const s = Math.max(-1, Math.min(1, (Number.isFinite(o.slip) ? o.slip : 0) / 8)) * R * 0.15
  ctx.fillRect(-R * 0.07 + s, -R + R * 0.12, R * 0.14, R * 0.035)
  ctx.restore()

  // flight director (magenta)
  const col = { fd: '#ff40ff', symbol: '#fff', symbolFill: '#000', ...o.colors }
  if (o.fd) {
    ctx.strokeStyle = col.fd; ctx.lineWidth = Math.max(2, o.h * 0.012)
    const dx = Math.max(-1, Math.min(1, (o.fd.roll - roll) / 25)) * o.w * 0.3
    const dy = Math.max(-1, Math.min(1, (pitch - o.fd.pitch) * ppd / (o.h * 0.3))) * o.h * 0.3
    if (o.fd.showRoll !== false)  { ctx.beginPath(); ctx.moveTo(cx + dx, cy - o.h * 0.28); ctx.lineTo(cx + dx, cy + o.h * 0.28); ctx.stroke() }
    if (o.fd.showPitch !== false) { ctx.beginPath(); ctx.moveTo(cx - o.w * 0.28, cy + dy); ctx.lineTo(cx + o.w * 0.28, cy + dy); ctx.stroke() }
  }

  // aircraft symbol (black with white outline)
  const th0 = Math.max(3, o.h * (o.compact ? 0.022 : 0.03)), th = Math.max(2, th0 * (o.symbolWeight ?? 1)), tab = th0 * 2.4
  const wl = o.w * (o.wingLen ?? (o.compact ? 0.16 : 0.2)), gap = o.w * (o.symbolGap ?? (o.compact ? 0.08 : 0.12))
  ctx.fillStyle = col.symbolFill; ctx.strokeStyle = col.symbol; ctx.lineWidth = Math.max(1, th * 0.25)
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? cx - gap - wl : cx + gap
    ctx.fillRect(x0, cy - th / 2, wl, th); ctx.strokeRect(x0, cy - th / 2, wl, th)
    const xd = side < 0 ? cx - gap - th : cx + gap
    ctx.fillRect(xd, cy - th / 2, th, tab); ctx.strokeRect(xd, cy - th / 2, th, tab)
  }
  ctx.fillRect(cx - th / 2, cy - th / 2, th, th); ctx.strokeRect(cx - th / 2, cy - th / 2, th, th)
}

/**
 * Vertical tape (speed or altitude) with a centred readout.
 * o: { x, y, w, h, value, span (units visible), step (tick), labelStep, fmt(v), side: 'left'|'right'
 *      (side the ticks are on), bug, bugColor, redAbove, bg, readout: bool, readoutText }
 */
export function tape(ctx, o) {
  const ppu = o.h / o.span, cy = o.y + o.h / 2
  const val = Number.isFinite(o.value) ? o.value : 0
  ctx.save()
  ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip()
  ctx.fillStyle = o.bg || '#4a4a4a'; ctx.fillRect(o.x, o.y, o.w, o.h)
  const tickX = o.side === 'left' ? o.x : o.x + o.w
  const dir = o.side === 'left' ? 1 : -1
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = Math.max(1, o.h * 0.004)
  ctx.font = `${Math.max(7, o.w * 0.26).toFixed(1)}px ${SANS}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = o.side === 'left' ? 'left' : 'right'
  const first = Math.floor((val - o.span / 2) / o.step) * o.step
  for (let v = first; v <= val + o.span / 2 + o.step; v += o.step) {
    if (o.min != null && v < o.min) continue
    const y = cy - (v - val) * ppu
    const labelled = Math.round(v / o.labelStep) * o.labelStep === v
    ctx.beginPath(); ctx.moveTo(tickX, y); ctx.lineTo(tickX + dir * o.w * (labelled ? 0.18 : 0.12), y); ctx.stroke()
    if (labelled) ctx.fillText(o.fmt(v), tickX + dir * o.w * 0.24, y)
  }
  if (o.redAbove) {                                       // red/black barber pole above the limit
    const y = cy - (o.redAbove - val) * ppu
    if (y > o.y) {
      const bx = o.side === 'left' ? o.x + o.w * 0.86 : o.x, bw = o.w * 0.14
      for (let yy = Math.min(y, o.y + o.h); yy > o.y - bw; yy -= bw) {
        ctx.fillStyle = '#ff2b2b'; ctx.fillRect(bx, yy - bw / 2, bw, bw / 2)
        ctx.fillStyle = '#000';    ctx.fillRect(bx, yy - bw, bw, bw / 2)
      }
    }
  }
  if (o.trend) {                                          // green speed trend vector
    const y2 = cy - o.trend * ppu
    ctx.strokeStyle = '#2bff4a'; ctx.lineWidth = Math.max(1.5, o.w * 0.03)
    const tx = o.x + o.w * 0.9
    ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(tx, y2); ctx.stroke()
  }
  if (Number.isFinite(o.bug)) {                           // magenta selected-value bug
    const y = Math.max(o.y + 4, Math.min(o.y + o.h - 4, cy - (o.bug - val) * ppu))
    const bx = o.side === 'left' ? o.x + o.w : o.x
    ctx.fillStyle = o.bugColor || '#ff40ff'
    const bs = o.w * 0.12
    ctx.fillRect(o.side === 'left' ? bx - bs : bx, y - bs * 1.4, bs, bs * 2.8)
  }
  ctx.restore()
  if (o.readout !== false) {                              // centred readout box with pointer
    const bh = Math.max(14, o.h * 0.1), bw = o.w * 0.92
    const bx = o.side === 'left' ? o.x + o.w * 0.02 : o.x + o.w * 0.06
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, bh * 0.07)
    ctx.beginPath()
    if (o.side === 'left') { ctx.moveTo(bx, cy - bh / 2); ctx.lineTo(bx + bw, cy - bh / 2); ctx.lineTo(bx + bw + bh * 0.3, cy); ctx.lineTo(bx + bw, cy + bh / 2); ctx.lineTo(bx, cy + bh / 2) }
    else                   { ctx.moveTo(bx + bw, cy - bh / 2); ctx.lineTo(bx, cy - bh / 2); ctx.lineTo(bx - bh * 0.3, cy); ctx.lineTo(bx, cy + bh / 2); ctx.lineTo(bx + bw, cy + bh / 2) }
    ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.min(bh * 0.72, bw / (String(o.readoutText).length * 0.62)).toFixed(1)}px ${SANS}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(o.readoutText, bx + bw / 2, cy + bh * 0.04)
  }
}

export const wrap360 = a => ((a % 360) + 360) % 360
export const angDiff = (a, b) => ((a - b + 540) % 360) - 180      // a − b in −180…180

// Weight units: X-Plane works in kg; displays may show lbs
export const LBS_PER_KG = 2.20462
export const unitFactor = units => units === 'kg' ? 1 : LBS_PER_KG
export const UNITS_OPTION = { key: 'units', label: 'Units', type: 'select', default: 'lbs',
  choices: [{ value: 'lbs', label: 'LBS' }, { value: 'kg', label: 'KG' }] }

/** Thousands with Boeing-style precision: 8.43 / 25.0 / 112 */
export const thousands = v => !Number.isFinite(v) ? '--' : v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)

/**
 * Small vertical scale with a pointer (737 oil pressure / temperature style).
 * { x, y, h, value, min, max, redHi, redLo, side: 'left'|'right', color }
 */
export function vtape(ctx, o) {
  const frac = v => Math.max(0, Math.min(1, (v - o.min) / (o.max - o.min)))
  const lw = Math.max(1, o.h * 0.04)
  ctx.strokeStyle = '#f2f2f2'
  ctx.lineWidth = lw
  ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y + o.h); ctx.stroke()
  const mark = (v, color) => {
    const yy = o.y + o.h * (1 - frac(v))
    ctx.strokeStyle = color; ctx.lineWidth = lw * 1.6
    ctx.beginPath(); ctx.moveTo(o.x - o.h * 0.14, yy); ctx.lineTo(o.x + o.h * 0.14, yy); ctx.stroke()
  }
  if (o.redHi != null) mark(o.redHi, '#ff2b2b')
  if (o.redLo != null) mark(o.redLo, '#ff2b2b')
  if (Number.isFinite(o.value)) {
    const yy = o.y + o.h * (1 - frac(o.value)), s = o.h * 0.13, dir = o.side === 'right' ? 1 : -1
    ctx.fillStyle = o.color || '#f2f2f2'
    ctx.beginPath()
    ctx.moveTo(o.x + dir * lw, yy)
    ctx.lineTo(o.x + dir * (lw + s * 1.4), yy - s)
    ctx.lineTo(o.x + dir * (lw + s * 1.4), yy + s)
    ctx.closePath(); ctx.fill()
  }
}

/** String ("data") dataref value — base64 over the API, or a byte array — → JS string. */
export function dataText(v) {
  if (v == null || v === '') return ''
  let bytes
  if (Array.isArray(v)) bytes = Uint8Array.from(v, n => n & 0xff)
  else {
    try {
      const s = String(v).trim()
      bytes = Uint8Array.from(atob(s.padEnd(s.length + (4 - s.length % 4) % 4, '=')), c => c.charCodeAt(0))
    } catch { return '' }
  }
  let end = bytes.indexOf(0); if (end < 0) end = bytes.length
  return new TextDecoder('utf-8').decode(bytes.subarray(0, end))
}

export function text(ctx, s, x, y, size, color, align = 'center', font = SANS, bold = false) {
  ctx.fillStyle = color
  ctx.font = `${bold ? 'bold ' : ''}${size.toFixed(1)}px ${font}`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(s, x, y)
}

/**
 * Active fuel tanks with a position-based role, from the standard tank geometry datarefs.
 * → [{ idx, kg, cap, side: 'L'|'C'|'R'|'T', order }]  (T = trim tank in the tail)
 */
export function fuelTanks(v) {
  const rats = Array.isArray(v.tank_rat) ? v.tank_rat : []
  const cap  = num(v.fuel_cap, 0)
  const tanks = []
  rats.forEach((r, idx) => {
    if (!(+r > 0)) return
    tanks.push({ idx, kg: at(v.fuel_qty, idx), cap: +r * cap, x: at(v.tank_x, idx), z: at(v.tank_z, idx) })
  })
  const wingZ = Math.max(0, ...tanks.filter(t => Math.abs(t.x) > 0.5).map(t => t.z))
  for (const t of tanks) {
    t.side = t.x < -0.5 ? 'L' : t.x > 0.5 ? 'R' : (t.z > wingZ + 8 ? 'T' : 'C')
  }
  // order: left outer → left inner, centre, right inner → right outer, trim last
  const rank = t => t.side === 'L' ? t.x : t.side === 'C' ? 1000 : t.side === 'R' ? 2000 + t.x : 5000 + t.z
  return tanks.sort((a, b) => rank(a) - rank(b))
}
