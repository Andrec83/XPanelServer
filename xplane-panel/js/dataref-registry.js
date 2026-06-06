const CACHE_KEY    = 'xplane_datarefs_txt'
const CACHE_TS_KEY = 'xplane_datarefs_txt_ts'
const TTL_MS       = 7 * 24 * 60 * 60 * 1000
const RAW_URL      = 'https://raw.githubusercontent.com/X-Plane/XPlane2Blender/master/io_xplane2blender/resources/DataRefs.txt'
const PROXY_URL    = 'https://corsproxy.io/?url=' + encodeURIComponent(RAW_URL)

let _registry = new Map() // name → {writable, units, description, type}
let _loaded = false
let _liveDatarefs = [] // from last fetchAllDatarefs — for enrichment

export async function loadRegistry() {
  const now = Date.now()
  const cached = localStorage.getItem(CACHE_KEY)
  const ts = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0', 10)

  if (cached && (now - ts) < TTL_MS) {
    _parse(cached)
    return { loaded: true, count: _registry.size, fromCache: true }
  }

  const text = await _fetch()
  localStorage.setItem(CACHE_KEY, text)
  localStorage.setItem(CACHE_TS_KEY, String(now))
  _parse(text)
  return { loaded: true, count: _registry.size, fromCache: false }
}

export function setLiveDatarefs(datarefs) {
  _liveDatarefs = datarefs
}

export function lookup(name) {
  return _registry.get(name) ?? null
}

export function search(query, limit = 30) {
  const q = query.toLowerCase()
  const liveMap = new Map(_liveDatarefs.map(d => [d.name, d]))
  const results = []

  for (const [name, meta] of _registry) {
    if (name.toLowerCase().includes(q)) {
      const live = liveMap.get(name)
      results.push({ name, ...meta, ...(live ? { id: live.id, value_type: live.value_type } : {}) })
      if (results.length >= limit) break
    }
  }
  return results
}

export function clearCache() {
  localStorage.removeItem(CACHE_KEY)
  localStorage.removeItem(CACHE_TS_KEY)
  _registry.clear()
  _loaded = false
}

// ── internal ──────────────────────────────────────────────────────────────────

function _parse(text) {
  _registry.clear()
  const lines = text.split('\n')
  // first 2 lines are header
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split('\t')
    if (parts.length < 2) continue
    const [name, type, writableRaw, units = '', description = ''] = parts
    _registry.set(name, {
      type,
      writable: writableRaw === 'y',
      units: units.trim(),
      description: description.trim(),
    })
  }
  _loaded = true
}

async function _fetch() {
  let res
  try {
    res = await fetch(PROXY_URL)
    if (!res.ok) throw new Error(`proxy status ${res.status}`)
    return await res.text()
  } catch (err) {
    // fallback: try direct (works from file:// → localhost)
    res = await fetch(RAW_URL)
    if (!res.ok) throw new Error(`direct fetch status ${res.status}`)
    return await res.text()
  }
}
