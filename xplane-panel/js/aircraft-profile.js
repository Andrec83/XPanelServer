import { resolveNames, readDataref } from './xplane-api.js'

// ── Dataref declarations ──────────────────────────────────────────────────────

const SCALAR_DREFS = {
  // Airframe identity
  numEngines:      'sim/aircraft/engine/acf_num_engines',
  cockpitType:     'sim/aircraft/view/acf_cockpit_type',
  hasFD:           'sim/aircraft/view/acf_has_SC_fd',

  // V-speeds (kts)
  vs0:  'sim/aircraft/view/acf_Vso',
  vs1:  'sim/aircraft/view/acf_Vs',
  vfe:  'sim/aircraft/view/acf_Vfe',
  vno:  'sim/aircraft/view/acf_Vno',
  vne:  'sim/aircraft/view/acf_Vne',
  mmo:  'sim/aircraft/view/acf_Mmo',       // max operating Mach

  // Autopilot
  apType:          'sim/aircraft/autopilot/preconfigured_ap_type',
  singleAxisAp:    'sim/aircraft/autopilot/single_axis_autopilot',
  vviStep:         'sim/aircraft/autopilot/vvi_step_ft',
  altStep:         'sim/aircraft/autopilot/alt_step_ft',

  // Cylinders per engine (piston only; 0 for jets/turboprops)
  numCylinders:     'sim/aircraft/engine/acf_num_cylinder',

  // Engine type inference (spool times > 0 indicate which category)
  spoolTimeJet:     'sim/aircraft/engine/acf_spooltime_jet',
  spoolTimeProp:    'sim/aircraft/engine/acf_spooltime_prop',
  spoolTimeTurbine: 'sim/aircraft/engine/acf_spooltime_turbine',
  faceJet:          'sim/aircraft/engine/acf_face_jet',

  // Engine performance limits
  rpmRedline:  'sim/aircraft/engine/acf_RSC_redline_eng',   // rad/sec
  rpmGreenMin: 'sim/aircraft/engine/acf_RSC_mingreen_eng',  // rad/sec
  rpmGreenMax: 'sim/aircraft/engine/acf_RSC_maxgreen_eng',  // rad/sec
  maxMP:       'sim/aircraft/engine/acf_mpmax',             // inHg (piston)
  maxEGT:      'sim/aircraft/engine/acf_max_EGT',           // degC
  maxCHT:      'sim/aircraft/engine/acf_max_CHT',           // degC
  maxOilP:     'sim/aircraft/engine/acf_max_OILP',          // PSI
  maxOilT:     'sim/aircraft/engine/acf_max_OILT',          // degC

  // Unit flags (0 = Fahrenheit, 1 = Celsius)
  oilTisCelsius: 'sim/aircraft/engine/acf_oilT_is_C',
  egtIsCelsius:  'sim/aircraft/engine/acf_EGT_is_C',
  chtIsCelsius:  'sim/aircraft/engine/acf_CHT_is_C',
  ittIsCelsius:  'sim/aircraft/engine/acf_ITT_is_C',

  // Electrical system
  numBatteries:  'sim/aircraft/electrical/num_batteries',
  numGenerators: 'sim/aircraft/electrical/num_generators',
  numInverters:  'sim/aircraft/electrical/num_inverters',

  // Fuel
  fuelCapTotal: 'sim/aircraft/weight/acf_m_fuel_tot',   // total max fuel (kg)

  // Flap detents
  flapNotch0: 'sim/aircraft/controls/acf_flap0',
  flapNotch1: 'sim/aircraft/controls/acf_flap1',
  flapNotch2: 'sim/aircraft/controls/acf_flap2',
  flapNotch3: 'sim/aircraft/controls/acf_flap3',
  flapNotch4: 'sim/aircraft/controls/acf_flap4',
  flapNotch5: 'sim/aircraft/controls/acf_flap5',
  flapNotch6: 'sim/aircraft/controls/acf_flap6',
  flapNotch7: 'sim/aircraft/controls/acf_flap7',
  flapNotch8: 'sim/aircraft/controls/acf_flap8',
  flapNotch9: 'sim/aircraft/controls/acf_flap9',
}

// Instrument arc limits from sim/aircraft/limits/.
// Each entry maps an internal key prefix to the X-Plane dataref suffix.
// Bands: green_lo/hi, yellow_lo/hi, red_lo/hi  (all floats, in the instrument's native unit)
const ARC_SPECS = {
  egt:  'EGT',   // degC
  cht:  'CHT',   // degC
  itt:  'ITT',   // degC (inter-turbine temperature, turboprops/jets)
  oilT: 'oilT',  // degC
  oilP: 'oilP',  // PSI
  mp:   'MP',    // inHg  (manifold pressure, piston)
  trq:  'TRQ',   // ft-lbs (torque, turboprops)
  epr:  'EPR',   // ratio  (engine pressure ratio, jets)
  ff:   'FF',    // kg/s  (fuel flow — same units as live dataref)
}
const ARC_BANDS = ['green_lo', 'green_hi', 'yellow_lo', 'yellow_hi', 'red_lo', 'red_hi']

// Build arc datarefs dynamically to avoid 48 hand-written lines
const ARC_DREFS = {}
for (const [key, sfx] of Object.entries(ARC_SPECS)) {
  for (const band of ARC_BANDS) {
    ARC_DREFS[`arc_${key}_${band}`] = `sim/aircraft/limits/${band}_${sfx}`
  }
}

// Array datarefs (returned as number[])
const ARRAY_DREFS = {
  gearType: 'sim/aircraft/parts/acf_gear_type',
  gearX:    'sim/aircraft/parts/acf_gear_xnodef',
  gearZ:    'sim/aircraft/parts/acf_gear_znodef',
  fuelQty:  'sim/cockpit2/fuel/fuel_quantity',          // current kg per slot (live, used to detect active tanks)
  fuelCap:  'sim/aircraft/overflow/acf_m_fuel_tab',     // per-tank capacity kg, if exposed by X-Plane
  enType:   'sim/aircraft/prop/acf_en_type',            // int[8..16] engine type enum per slot
}

const ALL_DREFS = { ...SCALAR_DREFS, ...ARC_DREFS, ...ARRAY_DREFS }

// Cheap fingerprint for change detection — three stable scalars
const FINGERPRINT_DREFS = [
  'sim/aircraft/engine/acf_num_engines',
  'sim/aircraft/autopilot/preconfigured_ap_type',
  'sim/aircraft/view/acf_Vne',
]

// ── Public API ────────────────────────────────────────────────────────────────

// Read all aircraft datarefs in parallel and return a structured capability profile.
//
// Profile shape:
//   numEngines    number
//   cockpitType   number   (0=steam gauges; other values from acf_cockpit_type enum)
//   hasFD         boolean
//   autopilot     { type, singleAxis, hasAutothrottle, vviStep, altStep }
//   speeds        { vs0, vs1, vfe, vno, vne, mmo, maxKts }  — kts/Mach; only keys with value > 0 present
//   engineType    { isJet, isTurboprop, isPiston, numCylinders,
//                   rpmRedline, rpmGreenMin, rpmGreenMax,
//                   maxMP, maxEGT, maxCHT, maxOilP, maxOilT,
//                   egtIsCelsius, chtIsCelsius, oilTIsCelsius, ittIsCelsius }
//   limits        { egt, cht, itt, oilT, oilP, mp, trq, epr, ff }
//                   each: { green:[lo,hi]|null, yellow:[lo,hi]|null, red:[lo,hi]|null }
//   electrical    { numBatteries, numGenerators, numInverters }
//   flapNotches   number[]   e.g. [0, 0.33, 0.67, 1.0]
//   gear          { idx, label, x, z }[]
//   fuelTanks     { idx, capacity_kg, label }[]
export async function probeAircraftProfile() {
  // Run dataref resolution and ACF probe in parallel.
  // The /acf endpoint only exists on the C plugin — serve.py returns 404,
  // which is caught and returns an empty object.
  const [resolved, acfExtra] = await Promise.all([
    resolveNames(Object.values(ALL_DREFS)),
    _fetchAcfExtra(),
  ])

  const read = async (name) => {
    const meta = resolved[name]
    if (!meta) return undefined
    try { return await readDataref(meta.id) } catch { return undefined }
  }

  const vals = {}
  await Promise.all(
    Object.entries(ALL_DREFS).map(async ([key, name]) => {
      vals[key] = await read(name)
    })
  )

  // ── Autopilot ──
  // Types 2-9 = preconfigured GA APs (S-Tec, KAP-140…) — no autothrottle.
  // 0 = custom/unknown → assume full capability. 1 = airliner → has AT.
  const apType = vals.apType ?? 0
  const hasAutothrottle = apType === 0 || apType === 1

  // ── V-speeds ──
  const speeds = {}
  for (const k of ['vs0', 'vs1', 'vfe', 'vno', 'vne']) {
    if (typeof vals[k] === 'number' && vals[k] > 0) speeds[k] = Math.round(vals[k])
  }
  if (typeof vals.mmo === 'number' && vals.mmo > 0) speeds.mmo = vals.mmo
  if (speeds.vne) speeds.maxKts = Math.ceil(speeds.vne * 1.15 / 50) * 50

  // ── Instrument arc limits (computed first — used as engine type fallback) ──
  const limits = {}
  for (const key of Object.keys(ARC_SPECS)) {
    limits[key] = _buildArc(vals, `arc_${key}_`)
  }

  // ── Engine type ──
  // Primary: sim/aircraft/prop/acf_en_type int[] — definitive Plane Maker enum.
  //   0 = Recip carbureted (piston)   1 = Recip fuel-injected (piston)
  //   3 = Electric                    5 = Single-spool jet
  //   6 = Rocket                      7 = Multi-spool jet (turbofan)
  //   9 = Free turboprop             10 = Fixed turboprop
  // Fallback (if dataref unavailable): RPM redline range, then arc limits.
  const enTypeArr   = Array.isArray(vals.enType) ? vals.enType : []
  const primaryType = enTypeArr.length > 0 ? enTypeArr[0] : -1

  // Fallback signals (used only when acf_en_type is unavailable)
  const rpmRed     = vals.rpmRedline ?? 0
  const hasPropRpm = rpmRed > 50 && rpmRed < 800  // realistic prop RPM: ~500–7600 RPM
  const arcPiston    = (limits.mp?.green?.[0]  >= 10) || (limits.cht?.green?.[0] >= 50)
  const arcTurboprop = !arcPiston && (limits.trq?.green?.[1] > 10 || limits.itt?.green?.[1] > 100)

  let isJet, isTurboprop, isPiston
  if (primaryType >= 0) {
    // Definitive enum from Plane Maker
    isPiston    = primaryType === 0 || primaryType === 1 || primaryType === 3  // carb, FI, electric
    isTurboprop = primaryType === 9 || primaryType === 10                      // free or fixed turboprop
    isJet       = !isPiston && !isTurboprop                                    // jet, rocket, or unknown
  } else if (hasPropRpm) {
    // Prop RPM redline in realistic range → propeller engine
    isTurboprop = arcTurboprop
    isPiston    = !isTurboprop
    isJet       = false
  } else {
    // Last resort: arc limits, defaulting to jet
    isPiston    = arcPiston
    isTurboprop = arcTurboprop
    isJet       = !isPiston && !isTurboprop
  }

  const tier = primaryType >= 0 ? `enType[${primaryType}]` : hasPropRpm ? 'propRpm' : 'arc'
  console.log('[aircraft-profile] engine type via', tier,
    '→', isJet ? 'jet' : isTurboprop ? 'turboprop' : isPiston ? 'piston' : 'unknown→jet')

  const engineType = {
    isJet,
    isTurboprop,
    isPiston,
    numCylinders:  (acfExtra.num_cylinders_per_engine > 0 ? acfExtra.num_cylinders_per_engine
                   : typeof vals.numCylinders === 'number' && vals.numCylinders > 0 ? vals.numCylinders : 0),
    rpmRedline:    vals.rpmRedline  ?? 0,  // rad/sec
    rpmGreenMin:   vals.rpmGreenMin ?? 0,  // rad/sec
    rpmGreenMax:   vals.rpmGreenMax ?? 0,  // rad/sec
    maxMP:         vals.maxMP  ?? 0,       // inHg
    maxEGT:        vals.maxEGT ?? 0,       // degC
    maxCHT:        vals.maxCHT ?? 0,       // degC
    maxOilP:       vals.maxOilP ?? 0,
    maxOilT:       vals.maxOilT ?? 0,
    egtIsCelsius:  vals.egtIsCelsius  !== 0,  // default true
    chtIsCelsius:  vals.chtIsCelsius  !== 0,
    oilTIsCelsius: vals.oilTisCelsius !== 0,
    ittIsCelsius:  vals.ittIsCelsius  !== 0,
  }

  // ── Electrical ──
  const electrical = {
    numBatteries:  typeof vals.numBatteries  === 'number' ? vals.numBatteries  : 1,
    numGenerators: typeof vals.numGenerators === 'number' ? vals.numGenerators : 1,
    numInverters:  typeof vals.numInverters  === 'number' ? vals.numInverters  : 0,
  }

  // ── Flap notches ──
  const rawFlaps = Array.from({ length: 10 }, (_, i) => vals[`flapNotch${i}`])
    .filter(x => typeof x === 'number')
  const flapNotches = _buildFlapNotches(rawFlaps)

  // ── Gear layout ──
  const gear = Array.isArray(vals.gearType)
    ? _buildGearConfig({ gearType: vals.gearType, gearX: vals.gearX, gearZ: vals.gearZ })
    : []

  // ── Fuel tanks ──
  const fuelTanks = _buildFuelTanks(vals.fuelQty, vals.fuelCap, vals.fuelCapTotal ?? 0)

  const profile = {
    numEngines:  typeof vals.numEngines === 'number' ? vals.numEngines : 1,
    cockpitType: vals.cockpitType ?? 0,
    hasFD:       !!vals.hasFD,
    autopilot:   { type: apType, singleAxis: !!vals.singleAxisAp, hasAutothrottle, vviStep: vals.vviStep ?? 100, altStep: vals.altStep ?? 100 },
    speeds,
    engineType,
    limits,
    electrical,
    flapNotches,
    gear,
    fuelTanks,
  }

  console.log('[aircraft-profile]', profile)
  return profile
}

// Poll every 30 s; call callback with a fresh profile when the aircraft changes.
// Returns a stop function.
export function watchAircraftChanges(callback) {
  let lastFingerprint = null
  let stopped = false

  const check = async () => {
    if (stopped) return
    try {
      const resolved = await resolveNames(FINGERPRINT_DREFS)
      const values = await Promise.all(
        FINGERPRINT_DREFS.map(async name => {
          const meta = resolved[name]
          if (!meta) return null
          try { return await readDataref(meta.id) } catch { return null }
        })
      )
      const fp = values.join('|')
      if (lastFingerprint !== null && fp !== lastFingerprint) {
        console.log('[aircraft-profile] aircraft change detected, re-probing…')
        const profile = await probeAircraftProfile()
        callback(profile)
      }
      lastFingerprint = fp
    } catch (_) {}
  }

  const timer = setInterval(check, 5_000)
  return () => { stopped = true; clearInterval(timer) }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// Build a { green, yellow, red } arc object from the vals map.
// Each band is [lo, hi] or null if undefined/invalid for this aircraft type.
function _buildArc(vals, prefix) {
  const band = (loKey, hiKey) => {
    const lo = vals[prefix + loKey]
    const hi = vals[prefix + hiKey]
    return (typeof lo === 'number' && typeof hi === 'number' && hi > lo) ? [lo, hi] : null
  }
  return {
    green:  band('green_lo',  'green_hi'),
    yellow: band('yellow_lo', 'yellow_hi'),
    red:    band('red_lo',    'red_hi'),
  }
}

function _buildFlapNotches(raw) {
  const notches = []
  let last = -Infinity
  for (const v of raw) {
    if (v > last + 0.005) { notches.push(v); last = v }
    else if (v < last - 0.005) break
  }
  if (notches.length === 0 || notches[0] > 0.01) notches.unshift(0)
  return notches.length >= 2 ? notches : [0, 0.5, 1.0]
}

// Fetch extra aircraft data from the C plugin's /acf endpoint.
// Returns {} gracefully when running via serve.py (404) or on network error.
async function _fetchAcfExtra() {
  try {
    const r = await fetch('/acf')
    return r.ok ? r.json() : {}
  } catch { return {} }
}

function _buildFuelTanks(fuelQty, fuelCap, totalCap) {
  // Determine which slots are active from live qty (non-zero) or per-tank capacity
  const qtyArr = Array.isArray(fuelQty) ? fuelQty : []
  const capArr = Array.isArray(fuelCap) ? fuelCap : []

  // Find last active slot index
  let lastIdx = -1
  for (let i = 0; i < Math.max(qtyArr.length, capArr.length); i++) {
    if ((qtyArr[i] ?? 0) > 0.01 || (capArr[i] ?? 0) > 0.01) lastIdx = i
  }
  if (lastIdx < 0) return []

  const active = []
  for (let i = 0; i <= lastIdx; i++) {
    const qty = qtyArr[i] ?? 0
    const cap = capArr[i] > 0.01 ? capArr[i]        // per-tank from X-Plane if available
              : totalCap > 0    ? totalCap / (lastIdx + 1) // distribute total equally
              : qty * 2         // fallback: assume current qty is ~50%
    if (qty > 0.01 || cap > 0.01) active.push({ idx: i, capacity_kg: cap })
  }

  const labels = _tankLabels(active.length)
  return active.map((t, i) => ({ ...t, label: labels[i] ?? `TK${i + 1}` }))
}

function _tankLabels(n) {
  if (n === 1) return ['MAIN']
  if (n === 2) return ['LEFT', 'RIGHT']
  if (n === 3) return ['LEFT', 'CTR', 'RIGHT']
  if (n === 4) return ['L OUT', 'L IN', 'R IN', 'R OUT']
  return Array.from({ length: n }, (_, i) => `TK ${i + 1}`)
}

function _buildGearConfig({ gearType, gearX, gearZ }) {
  const raw = []
  for (let i = 0; i < gearType.length; i++) {
    if (gearType[i] === 0) continue
    raw.push({ idx: i, x: gearX?.[i] ?? 0, z: gearZ?.[i] ?? 0 })
  }
  if (raw.length === 0) return []

  const maxAbsX = Math.max(...raw.map(g => Math.abs(g.x)))
  const noseThresh = maxAbsX * 0.25 + 0.20
  const centreGears = raw.filter(g => Math.abs(g.x) <= noseThresh)
  const sideGears   = raw.filter(g => Math.abs(g.x)  > noseThresh)
  centreGears.sort((a, b) => b.z - a.z)
  sideGears  .sort((a, b) => a.x - b.x)

  if (centreGears.length === 1) {
    centreGears[0].label = 'N'
  } else if (centreGears.length > 1) {
    centreGears.forEach((g, i) => { g.label = `N${i + 1}` })
    const lastCentre = centreGears[centreGears.length - 1]
    if (sideGears.length && lastCentre.z < Math.min(...sideGears.map(g => g.z))) {
      lastCentre.label = 'T'
    }
  }

  const ns = sideGears.length
  sideGears.forEach((g, i) => {
    if (ns === 1)      g.label = 'C'
    else if (ns === 2) g.label = i === 0 ? 'L' : 'R'
    else if (ns === 3) g.label = i === 0 ? 'L' : i === 1 ? 'C' : 'R'
    else {
      const half = Math.floor(ns / 2)
      if      (i === 0)    g.label = 'L'
      else if (i < half)   g.label = `L${i + 1}`
      else if (i === half) g.label = 'R'
      else                 g.label = `R${i - half + 1}`
    }
  })

  return [...centreGears, ...sideGears]
}
