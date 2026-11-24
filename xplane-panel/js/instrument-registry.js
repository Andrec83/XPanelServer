// instrument-registry.js — discovers instrument modules at runtime.
//
// The server (XPanelServer plugin or serve.py) lists every .js file under
// js/instruments/ at GET /instruments. Each file that exports a `META` object
// becomes an instrument; files without META (base.js, shared helpers) are
// ignored. The first-level sub-folder a file lives in is its palette section:
//
//   js/instruments/airspeed.js                    → section "General"
//   js/instruments/King Air 350/B350_EADI.js      → section "King Air 350"
//   js/instruments/King Air 350/lib/helpers.js    → section "King Air 350" (no META → skipped)
//
// META shape (only `type` is required):
//   {
//     type:     'b350_eadi',          // unique key stored in saved panels — never rename
//     label:    'King Air EADI',      // palette / editor label
//     icon:     '✈',                  // palette icon (emoji or short text)
//     order:    20,                   // sort position within its section (default 1000)
//     datarefs: DEFAULTS,             // { key: datarefName } — subscribed + editable in the sidebar
//     select:   'engine' | 'nav',     // ask for ENG 1–4 / NAV 1–2 on drop (config.engineIndex / navIndex)
//     options:  [ … ],                // extra sidebar options, see index.html → _optionField()
//     requires: 'the King Air 350 add-on',  // shown when its datarefs are missing in X-Plane
//     optionalDatarefs: ['key', …],   // keys that may be missing without breaking the instrument
//     datarefCheck: 'any',            // works if ANY dataref exists (e.g. alternative add-on sets)
//     touchControls: true,            // instrument draws on-screen buttons (setTouchButtons)
//     hidden:   false,                // true → loadable by panels but not shown in the palette
//     component: MyClass,             // only needed if the file exports more than one instrument class
//   }

import { BaseInstrument } from './instruments/base.js'

export const GENERAL_SECTION = 'General'
const TYPE_RE = /^[A-Za-z0-9_-]+$/

let _registry = null

/** Loads (once) and returns { byType: Map, sections: [{name, items}], errors: [{path, message}] }. */
export function loadInstruments() {
  return _registry ??= _load().catch(err => { _registry = null; throw err })
}

async function _load() {
  let listing
  try {
    const res = await fetch('/instruments', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    listing = (await res.json()).instruments || []
  } catch (err) {
    throw new Error(`Could not list instruments (${err.message}). ` +
      'Make sure you are running an XPanelServer plugin (or serve.py) that supports GET /instruments.')
  }

  // Deterministic order: General first, then sections, then by path — first file wins on duplicate types.
  listing.sort((a, b) => (a.section ? 1 : 0) - (b.section ? 1 : 0) || a.path.localeCompare(b.path))

  const results = await Promise.allSettled(listing.map(async item => {
    const url = '/' + item.path.split('/').map(encodeURIComponent).join('/')
    return { item, mod: await import(url) }
  }))

  const byType = new Map()
  const errors = []

  results.forEach((r, i) => {
    const path = listing[i].path
    if (r.status === 'rejected') {
      errors.push({ path, message: r.reason?.message || String(r.reason) })
      console.error('[instruments] failed to load', path, r.reason)
      return
    }
    const { item, mod } = r.value
    const meta = mod.META
    if (!meta) return   // helper module, not an instrument

    try {
      if (typeof meta.type !== 'string' || !TYPE_RE.test(meta.type))
        throw new Error(`META.type must be a string of letters, digits, _ or - (got ${JSON.stringify(meta.type)})`)
      if (byType.has(meta.type))
        throw new Error(`duplicate type "${meta.type}" (already defined by ${byType.get(meta.type).path})`)
      const cls = _findClass(mod, meta)
      byType.set(meta.type, {
        type:    meta.type,
        label:   meta.label || meta.type,
        icon:    meta.icon  || '▫',
        order:   meta.order ?? 1000,
        section: item.section || GENERAL_SECTION,
        path,
        meta:    { datarefs: {}, options: [], ...meta },
        cls,
      })
    } catch (err) {
      errors.push({ path, message: err.message })
      console.error('[instruments]', path, err.message)
    }
  })

  const groups = new Map()
  for (const entry of byType.values()) {
    if (entry.meta.hidden) continue
    if (!groups.has(entry.section)) groups.set(entry.section, [])
    groups.get(entry.section).push(entry)
  }
  const sections = [...groups.entries()]
    .sort(([a], [b]) => (a === GENERAL_SECTION ? -1 : b === GENERAL_SECTION ? 1 : a.localeCompare(b)))
    .map(([name, items]) => ({
      name,
      items: items.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)),
    }))

  return { byType, sections, errors }
}

function _findClass(mod, meta) {
  if (meta.component) return meta.component
  if (_isInstrument(mod.default)) return mod.default
  const classes = Object.values(mod).filter(_isInstrument)
  if (classes.length === 1) return classes[0]
  throw new Error(classes.length === 0
    ? 'no exported class extending BaseInstrument'
    : 'several instrument classes exported — set META.component to pick one')
}

function _isInstrument(v) {
  return typeof v === 'function' && v.prototype instanceof BaseInstrument
}
