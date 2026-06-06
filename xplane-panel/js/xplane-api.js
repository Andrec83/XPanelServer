/* Port is read from the page's own URL so it stays correct even when the
   user changes the plugin port via the plugin menu. */
const PROXY_PORT = parseInt(location.port) || 8088
const RECONNECT_BASE = 1000
const RECONNECT_MAX = 30000

// When running on localhost, talk directly to X-Plane on :8086.
// When on a LAN hostname/IP, everything goes through the XPanelServer plugin.

function _capabilitiesUrl() {
  const isLocal = _host === 'localhost' || _host === '127.0.0.1'
  return isLocal
    ? `http://${_host}:8086/api/capabilities`
    : `http://${_host}:${PROXY_PORT}/api/capabilities`
}

function _restBase() {
  const isLocal = _host === 'localhost' || _host === '127.0.0.1'
  return isLocal
    ? `http://${_host}:8086`
    : `http://${_host}:${PROXY_PORT}/api`
}

function _wsUrl() {
  const isLocal = _host === 'localhost' || _host === '127.0.0.1'
  return isLocal
    ? `ws://${_host}:8086/api/v3`
    : `ws://${_host}:${PROXY_PORT}/ws`
}

let _host = 'localhost'
let _ws = null
let _connected = false
let _xpVersion = null
let _datarefCount = 0
let _lastUpdateAt = null
let _allDatarefs = []       // [{id, name, value_type}]
let _nameToMeta = new Map() // name → {id, name, value_type}
let _idToName = new Map()   // id → name
let _cmdNameToId = new Map() // command name → id (lazy-loaded)
let _subscribers = []       // [{idFreqPairs, onUpdate, onError, reqId}]
let _reqIdCounter = 1
let _reconnectTimer = null
let _reconnectDelay = RECONNECT_BASE
let _pendingAcks = new Map() // reqId → resolve

export async function connect(host = 'localhost') {
  _host = host
  _reconnectDelay = RECONNECT_BASE
  await _openWS()
  await fetchAllDatarefs()
}

export function disconnect() {
  if (_reconnectTimer) clearTimeout(_reconnectTimer)
  _reconnectTimer = null
  if (_ws) {
    _ws.onclose = null
    _ws.close()
    _ws = null
  }
  _connected = false
  _cmdNameToId.clear()   // command IDs are session-scoped like dataref IDs
}

export function getStatus() {
  return {
    connected: _connected,
    xpVersion: _xpVersion,
    datarefCount: _datarefCount,
    lastUpdateAt: _lastUpdateAt,
  }
}

export async function fetchAllDatarefs() {
  const res = await fetch(`${_restBase()}/v3/datarefs?limit=100000`)
  if (!res.ok) throw new Error(`DataRef fetch failed: ${res.status}`)
  const json = await res.json()
  _allDatarefs = json.data
  _datarefCount = _allDatarefs.length
  _nameToMeta = new Map(_allDatarefs.map(d => [d.name, d]))
  _idToName = new Map(_allDatarefs.map(d => [d.id, d.name]))
  return _allDatarefs
}

export async function resolveNames(names) {
  const result = {}
  for (const name of names) {
    const meta = _nameToMeta.get(name)
    if (meta) result[name] = meta
  }
  return result
}

export async function readDataref(id) {
  const res = await fetch(`${_restBase()}/v3/datarefs/${id}/value`)
  if (!res.ok) throw new Error(`Read failed: ${res.status}`)
  const json = await res.json()
  return json.data
}

export async function writeDataref(id, value) {
  const res = await fetch(`${_restBase()}/v3/datarefs/${id}/value`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: value }),
  })
  if (!res.ok) {
    const name = _idToName.get(id) ?? `id:${id}`
    console.warn(`[xplane-api] writeDataref ${res.status} for "${name}" — use triggerCommand() for controls that require commands`)
  }
  return res.ok
}

// Trigger an X-Plane command by name (e.g. 'sim/flight_controls/flaps_down').
// Commands are lazy-loaded on first call and cached for the session.
// Activation uses the WebSocket — REST endpoints return 404 in X-Plane 12.
// The confirmed working format is command_set_is_active with duration:0 (momentary).
export async function triggerCommand(name) {
  if (_cmdNameToId.size === 0) {
    const res = await fetch(`${_restBase()}/v3/commands?limit=10000`)
    if (!res.ok) throw new Error(`Commands fetch failed: ${res.status}`)
    const json = await res.json()
    for (const c of json.data) _cmdNameToId.set(c.name, c.id)
  }
  const id = _cmdNameToId.get(name)
  if (id == null) throw new Error(`Command not found: "${name}"`)
  if (!_ws || _ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket not connected')
  _ws.send(JSON.stringify({
    req_id: _reqIdCounter++,
    type:   'command_set_is_active',
    params: { commands: [{ id, is_active: true, duration: 0 }] },
  }))
  return true
}

export function searchCommands(pattern) {
  const re = new RegExp(pattern, 'i')
  return [..._cmdNameToId.keys()].filter(n => re.test(n)).sort()
}

export function subscribe(idFrequencyPairs, onUpdate, onError) {
  const reqId = _reqIdCounter++
  const sub = { idFreqPairs: idFrequencyPairs, onUpdate, onError, reqId }
  _subscribers.push(sub)

  if (_connected) _sendSubscribe(sub)

  return function unsubscribe() {
    const idx = _subscribers.indexOf(sub)
    if (idx !== -1) _subscribers.splice(idx, 1)
  }
}

// ── internal ──────────────────────────────────────────────────────────────────

function _openWS() {
  return new Promise((resolve, reject) => {
    const url = _wsUrl()
    const ws = new WebSocket(url)
    _ws = ws

    ws.onopen = async () => {
      try {
        const res = await fetch(`${_capabilitiesUrl()}`)
        if (res.ok) {
          const json = await res.json()
          _xpVersion = json['x-plane']?.version ?? null
        }
      } catch (_) {}
      _connected = true
      _reconnectDelay = RECONNECT_BASE
      // re-subscribe all active subscribers
      for (const sub of _subscribers) _sendSubscribe(sub)
      resolve()
    }

    ws.onmessage = (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      _lastUpdateAt = Date.now()

      if (msg.type === 'result') {
        const pending = _pendingAcks.get(msg.req_id)
        if (pending) { pending(msg); _pendingAcks.delete(msg.req_id) }
        return
      }

      if (msg.type === 'dataref_update_values') {
        const raw = msg.data || {}
        const named = {}
        for (const [idStr, value] of Object.entries(raw)) {
          const name = _idToName.get(parseInt(idStr, 10))
          if (name) named[name] = value
        }
        for (const sub of _subscribers) {
          try { sub.onUpdate(named) } catch (_) {}
        }
      }
    }

    ws.onerror = () => {
      if (!_connected) reject(new Error('WebSocket connection failed'))
    }

    ws.onclose = () => {
      _connected = false
      _ws = null
      _cmdNameToId.clear()   // IDs are session-scoped; re-fetch after reconnect
      for (const sub of _subscribers) {
        try { sub.onError(new Error('Disconnected')) } catch (_) {}
      }
      _scheduleReconnect()
    }
  })
}

function _sendSubscribe(sub) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return
  const msg = {
    req_id: sub.reqId,
    type: 'dataref_subscribe_values',
    params: { datarefs: sub.idFreqPairs },
  }
  _ws.send(JSON.stringify(msg))
}

function _scheduleReconnect() {
  if (_reconnectTimer) return
  _reconnectTimer = setTimeout(async () => {
    _reconnectTimer = null
    try {
      await _openWS()
      await fetchAllDatarefs()
      // re-resolve IDs for all subscribers — panel.js handles this via onError→reconnect
    } catch (_) {
      _reconnectDelay = Math.min(_reconnectDelay * 2, RECONNECT_MAX)
      _scheduleReconnect()
    }
  }, _reconnectDelay)
  _reconnectDelay = Math.min(_reconnectDelay * 2, RECONNECT_MAX)
}