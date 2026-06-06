/**
 * panel-store.js
 *
 * Panels are stored server-side in panels.json (served by serve.py).
 * The PC editor writes via POST/DELETE; tablets read via GET.
 * Falls back to localStorage transparently if the server is unreachable
 * so the editor still works when serve.py isn't running.
 */

const STORAGE_KEY  = 'xplane_panels'
const SERVER_BASE  = '/panels'          // same origin as serve.py

// ── helpers ──────────────────────────────────────────────────────────────────

function _uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
      })
}

// ── local fallback (localStorage) ────────────────────────────────────────────

function _localLoad() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }
  catch { return [] }
}

function _localSave(panels) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(panels))
}

function _localSavePanel(panel) {
  const panels = _localLoad()
  if (!panel.id) { panel.id = _uuid(); panels.push(panel) }
  else {
    const idx = panels.findIndex(p => p.id === panel.id)
    if (idx === -1) panels.push(panel)
    else panels[idx] = panel
  }
  _localSave(panels)
  return panel
}

// ── server API ────────────────────────────────────────────────────────────────

async function _serverAvailable() {
  try {
    const r = await fetch(SERVER_BASE, { method: 'GET', cache: 'no-store' })
    return r.ok
  } catch { return false }
}

async function _serverList() {
  const r = await fetch(SERVER_BASE, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Server error ${r.status}`)
  return r.json()
}

async function _serverSave(panel) {
  const r = await fetch(SERVER_BASE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(panel),
  })
  if (!r.ok) throw new Error(`Server error ${r.status}`)
  return r.json()
}

async function _serverDelete(id) {
  const r = await fetch(`${SERVER_BASE}/${id}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`Server error ${r.status}`)
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * List all panels.
 * Tries server first; falls back to localStorage.
 */
export async function listPanels() {
  try {
    return await _serverList()
  } catch {
    console.warn('[panel-store] server unavailable, using localStorage')
    return _localLoad()
  }
}

/**
 * Get a single panel by ID.
 */
export async function getPanel(id) {
  const panels = await listPanels()
  return panels.find(p => p.id === id) ?? null
}

/**
 * Save (create or update) a panel.
 * Writes to server AND keeps localStorage in sync as a local cache.
 */
export async function savePanel(panel) {
  if (!panel.id) panel.id = _uuid()
  try {
    const saved = await _serverSave(panel)
    _localSavePanel(saved)   // keep local cache in sync
    return saved
  } catch {
    console.warn('[panel-store] server unavailable, saving to localStorage only')
    return _localSavePanel(panel)
  }
}

/**
 * Delete a panel by ID.
 */
export async function deletePanel(id) {
  try {
    await _serverDelete(id)
  } catch {
    console.warn('[panel-store] server unavailable, deleting from localStorage only')
  }
  // Always remove locally too
  _localSave(_localLoad().filter(p => p.id !== id))
}

/**
 * Create a new panel with defaults.
 */
export async function createPanel(name) {
  return savePanel({
    name:       name || 'New Panel',
    background: '#111',
    columns:    4,
    rows:       3,
    widgets:    [],
  })
}

/**
 * Push all locally-stored panels to the server.
 * Useful when serve.py was offline and you want to sync up.
 */
export async function syncLocalToServer() {
  const local = _localLoad()
  if (!local.length) return { synced: 0 }
  let synced = 0
  for (const panel of local) {
    try { await _serverSave(panel); synced++ }
    catch { /* skip failures */ }
  }
  return { synced, total: local.length }
}