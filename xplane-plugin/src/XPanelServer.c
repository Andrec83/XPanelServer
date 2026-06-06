/*
 * XPanelServer.c  —  X-Plane 12 plugin
 *
 * Serves the XPlaneNetworkPanels web app on the local network so that
 * a separate Python process is no longer required.
 *
 * Port (default 8088, configurable via Plugin menu):
 *   /                  → static files from  <plugin>/Resources/web/
 *   /api/*             → HTTP proxy  →  http://127.0.0.1:8086/api/*
 *   /ws                → WebSocket proxy  →  ws://127.0.0.1:8086/api/v3
 *   /panels[/*]        → panel config CRUD  →  <plugin>/Resources/panels.json
 *   /acf               → ACF file probe  →  parses loaded aircraft .acf for extra data
 *
 * Build requirements (Windows x64):
 *   Visual Studio 2019+ or MinGW-w64 GCC 12+
 *   CMake 3.15+
 *   X-Plane SDK 4.x  (place in ../sdk/)
 *   civetweb source  (fetched automatically by CMake)
 *   cJSON source     (fetched automatically by CMake)
 */

#define _WIN32_WINNT 0x0602   /* Windows 8+ — needed for WinHTTP WebSocket */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

/* XPLM SDK */
#include "XPLMPlugin.h"
#include "XPLMMenus.h"
#include "XPLMUtilities.h"
#include "XPLMPlanes.h"
#include "XPWidgets.h"
#include "XPStandardWidgets.h"

/* Vendored libs */
#include "civetweb.h"
#include "cJSON.h"

/* ── Compile-time options ──────────────────────────────────────────────────── */
#define XPANEL_DEFAULT_PORT  8088
#define XPLANE_API_PORT      8086
#define XPLANE_HOST          "127.0.0.1"
#define XPLANE_HOST_W        L"127.0.0.1"
#define RESP_BUFFER_INIT     (256  * 1024)   /* initial HTTP response buffer */
#define RESP_BUFFER_MAX      (8    * 1024 * 1024) /* max response (8 MB for datarefs) */
#define WS_RECV_BUFFER       (128  * 1024)

/* ── Global state ──────────────────────────────────────────────────────────── */
static int                g_port      = XPANEL_DEFAULT_PORT;
static volatile int       g_running   = 0;
static struct mg_context *g_ctx       = NULL;
static CRITICAL_SECTION   g_cs;                     /* guards panels.json I/O */

static char  g_plugin_root[MAX_PATH];   /* .../Resources/plugins/XPanelServer   */
static char  g_resources[MAX_PATH];     /* g_plugin_root/Resources              */
static char  g_web_root[MAX_PATH];      /* g_resources/web  (static files)      */
static char  g_panels_path[MAX_PATH];   /* g_resources/panels.json              */
static char  g_config_path[MAX_PATH];   /* g_resources/config.json              */

#define MAX_IPS 12
static char g_ips[MAX_IPS][64];   /* sorted IPs: private first, then other */
static int  g_ip_count = 0;

static XPLMMenuID g_menu;
static int        g_mi_toggle;
static int        g_mi_port;

static XPWidgetID g_dlg        = NULL;
static XPWidgetID g_dlg_field  = NULL;
static XPWidgetID g_dlg_btn    = NULL;

/* ── WebSocket hub ─────────────────────────────────────────────────────────── */
/*
 * One persistent WebSocket connection to X-Plane, shared by all browser
 * clients.  Each browser that connects is added to conns[]; messages from
 * X-Plane are broadcast to every entry.  This avoids hitting X-Plane's
 * concurrent-connection limit when multiple devices are open at once.
 */
#define MAX_BROWSERS 8

typedef struct {
    struct mg_connection *conns[MAX_BROWSERS];
    char                 *sub_msgs[MAX_BROWSERS]; /* last subscription per browser  */
    int                   count;
    CRITICAL_SECTION      cs;          /* guards conns[], sub_msgs[], count   */
    CRITICAL_SECTION      send_cs;     /* serialises WinHTTP sends to X-Plane */
    HINTERNET             hS, hC, hR, hWs;
    HANDLE                thread;
    volatile LONG         running;
} WsHub;

static WsHub g_hub;

/* ── Dataref value cache ───────────────────────────────────────────────────── */
/*
 * Stores the latest known value for every dataref received from X-Plane.
 * When a new browser connects it gets an immediate snapshot so it doesn't
 * have to wait for slow-changing datarefs to update before displaying data.
 *
 * Format assumed for X-Plane v3 update messages:
 *   { "type": "dataref_update_values",
 *     "data": [ {"id": 123, "value": 42.5}, ... ] }
 */
static cJSON            *g_dref_cache = NULL;   /* object keyed by id-as-string */
static CRITICAL_SECTION  g_cache_cs;

/* ── Utility ───────────────────────────────────────────────────────────────── */
static void log_msg(const char *fmt, ...) {
    char buf[512];
    va_list ap; va_start(ap, fmt); vsnprintf(buf, sizeof(buf), fmt, ap); va_end(ap);
    XPLMDebugString("[XPanelServer] ");
    XPLMDebugString(buf);
    XPLMDebugString("\n");
}

/* ASCII → wide char (UTF-8 paths/URLs) */
static wchar_t *to_wide(const char *s, wchar_t *buf, int n) {
    MultiByteToWideChar(CP_UTF8, 0, s, -1, buf, n);
    return buf;
}

/* ── Config ────────────────────────────────────────────────────────────────── */
static void config_load(void) {
    FILE *f = fopen(g_config_path, "r");
    if (!f) return;
    char buf[128];
    if (fgets(buf, sizeof(buf), f)) {
        char *p = strstr(buf, "\"port\"");
        if (p) { p = strchr(p, ':'); if (p) { int v = atoi(p+1); if (v >= 1024 && v <= 65535) g_port = v; } }
    }
    fclose(f);
}

static void config_save(void) {
    FILE *f = fopen(g_config_path, "w");
    if (!f) return;
    fprintf(f, "{\"port\":%d}\n", g_port);
    fclose(f);
}

/* ── Panels CRUD ───────────────────────────────────────────────────────────── */
static char *panels_read(void) {          /* caller must free() */
    FILE *f = fopen(g_panels_path, "r");
    if (!f) return _strdup("[]");
    fseek(f, 0, SEEK_END); long sz = ftell(f); rewind(f);
    if (sz <= 0) { fclose(f); return _strdup("[]"); }
    char *b = malloc(sz + 1); fread(b, 1, sz, f); b[sz] = '\0'; fclose(f);
    return b;
}

static void panels_write(const char *json) {
    FILE *f = fopen(g_panels_path, "w");
    if (!f) return;
    fputs(json, f); fclose(f);
}

/* Extract panel_id from URI "/panels/<id>" (returns pointer into uri, or NULL) */
static const char *panel_id_from_uri(const char *uri) {
    if (strncmp(uri, "/panels/", 8) == 0 && uri[8] != '\0') return uri + 8;
    return NULL;
}

static int handle_panels(struct mg_connection *conn, void *cbdata) {
    const struct mg_request_info *ri = mg_get_request_info(conn);
    const char *method    = ri->request_method;
    const char *panel_id  = panel_id_from_uri(ri->local_uri);

    EnterCriticalSection(&g_cs);

    if (strcmp(method, "GET") == 0) {
        char *file_json = panels_read();

        if (panel_id) {
            cJSON *arr = cJSON_Parse(file_json); free(file_json);
            cJSON *found = NULL;
            if (arr) { cJSON *it; cJSON_ArrayForEach(it, arr) {
                cJSON *id = cJSON_GetObjectItem(it, "id");
                if (id && strcmp(cJSON_GetStringValue(id), panel_id) == 0) { found = it; break; }
            }}
            char *out = found ? cJSON_PrintUnformatted(found) : _strdup("null");
            int  code = found ? 200 : 404;
            mg_printf(conn, "HTTP/1.1 %d OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s",
                      code, (int)strlen(out), out);
            free(out); cJSON_Delete(arr);
        } else {
            mg_printf(conn, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s",
                      (int)strlen(file_json), file_json);
            free(file_json);
        }

    } else if (strcmp(method, "PUT") == 0 || strcmp(method, "POST") == 0) {
        char body[1 << 17] = {0};
        int  blen = 0;
        if (ri->content_length > 0 && ri->content_length < (int64_t)sizeof(body))
            blen = mg_read(conn, body, (int)ri->content_length);

        char *file_json = panels_read();
        cJSON *arr = cJSON_Parse(file_json); if (!arr) arr = cJSON_CreateArray(); free(file_json);
        cJSON *panel = cJSON_Parse(body);
        if (panel) {
            cJSON *new_id = cJSON_GetObjectItem(panel, "id");
            int cnt = cJSON_GetArraySize(arr);
            for (int i = cnt - 1; i >= 0; i--) {
                cJSON *id = cJSON_GetObjectItem(cJSON_GetArrayItem(arr, i), "id");
                if (new_id && id && strcmp(cJSON_GetStringValue(id), cJSON_GetStringValue(new_id)) == 0)
                    cJSON_DeleteItemFromArray(arr, i);
            }
            cJSON_AddItemToArray(arr, panel);
        }
        char *out = cJSON_PrintUnformatted(arr); panels_write(out);
        char *resp = panel ? cJSON_PrintUnformatted(panel) : _strdup("{}");
        mg_printf(conn, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s",
                  (int)strlen(resp), resp);
        free(out); free(resp); cJSON_Delete(arr);

    } else if (strcmp(method, "DELETE") == 0 && panel_id) {
        char *file_json = panels_read();
        cJSON *arr = cJSON_Parse(file_json); free(file_json);
        if (arr) {
            int cnt = cJSON_GetArraySize(arr);
            for (int i = cnt - 1; i >= 0; i--) {
                cJSON *id = cJSON_GetObjectItem(cJSON_GetArrayItem(arr, i), "id");
                if (id && strcmp(cJSON_GetStringValue(id), panel_id) == 0) cJSON_DeleteItemFromArray(arr, i);
            }
            char *out = cJSON_PrintUnformatted(arr); panels_write(out); free(out); cJSON_Delete(arr);
        }
        mg_printf(conn, "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n");
    }

    LeaveCriticalSection(&g_cs);
    return 1;
}

/* ── REST API proxy ─────────────────────────────────────────────────────────── */
/*
 * Forwards /api/v3/... → http://127.0.0.1:8086/v3/...
 * Uses WinHTTP (synchronous) so we can stream the response back simply.
 */
static int handle_api(struct mg_connection *conn, void *cbdata) {
    const struct mg_request_info *ri = mg_get_request_info(conn);

    /* Forward full URI — X-Plane serves its REST API at /api/v3/... on port 8086 */
    const char *uri = ri->local_uri;
    const char *xp  = uri;
    char full[2048];
    if (ri->query_string && ri->query_string[0])
        snprintf(full, sizeof(full), "%s?%s", xp, ri->query_string);
    else
        strncpy(full, xp, sizeof(full) - 1);

    /* Read request body */
    char   body[1 << 17] = {0};
    int    body_len = 0;
    if (ri->content_length > 0 && ri->content_length < (int64_t)sizeof(body))
        body_len = mg_read(conn, body, (int)ri->content_length);

    /* Open WinHTTP session */
    HINTERNET hS = WinHttpOpen(L"XPanelServer/1.0", WINHTTP_ACCESS_TYPE_NO_PROXY,
                               WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hS) goto fail;
    HINTERNET hC = WinHttpConnect(hS, XPLANE_HOST_W, XPLANE_API_PORT, 0);
    if (!hC) { WinHttpCloseHandle(hS); goto fail; }

    wchar_t wpath[2048], wmethod[16];
    HINTERNET hR = WinHttpOpenRequest(hC,
        to_wide(ri->request_method, wmethod, 16),
        to_wide(full, wpath, 2048),
        NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
    if (!hR) { WinHttpCloseHandle(hC); WinHttpCloseHandle(hS); goto fail; }

    LPCWSTR hdrs  = body_len > 0 ? L"Content-Type: application/json\r\n" : WINHTTP_NO_ADDITIONAL_HEADERS;
    DWORD   hdrs_len = body_len > 0 ? (DWORD)-1L : 0;
    BOOL ok = WinHttpSendRequest(hR, hdrs, hdrs_len,
                                 body_len > 0 ? body : NULL, body_len, body_len, 0);
    if (!ok || !WinHttpReceiveResponse(hR, NULL)) {
        WinHttpCloseHandle(hR); WinHttpCloseHandle(hC); WinHttpCloseHandle(hS); goto fail;
    }

    /* Status code */
    DWORD status = 200, sz = sizeof(status);
    WinHttpQueryHeaders(hR, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        NULL, &status, &sz, NULL);

    /* Content-Type from X-Plane */
    wchar_t ct[128] = L"application/json";
    DWORD   ct_sz = sizeof(ct);
    WinHttpQueryHeaders(hR, WINHTTP_QUERY_CONTENT_TYPE, NULL, ct, &ct_sz, NULL);
    char ct_a[128]; WideCharToMultiByte(CP_UTF8, 0, ct, -1, ct_a, 128, NULL, NULL);

    /* Read response into dynamic buffer */
    size_t resp_cap = RESP_BUFFER_INIT, resp_len = 0;
    char  *resp = malloc(resp_cap);
    DWORD  avail = 0, nread = 0;
    while (WinHttpQueryDataAvailable(hR, &avail) && avail > 0) {
        if (resp_len + avail + 1 > resp_cap) {
            resp_cap = (resp_len + avail + 1) * 2;
            if (resp_cap > RESP_BUFFER_MAX) break;
            resp = realloc(resp, resp_cap);
        }
        WinHttpReadData(hR, resp + resp_len, avail, &nread);
        resp_len += nread;
    }

    WinHttpCloseHandle(hR); WinHttpCloseHandle(hC); WinHttpCloseHandle(hS);

    const char *stext = (status==200)?"OK":(status==204)?"No Content":(status==404)?"Not Found":"Error";
    mg_printf(conn, "HTTP/1.1 %lu %s\r\nContent-Type: %s\r\nContent-Length: %lu\r\n\r\n",
              (unsigned long)status, stext, ct_a, (unsigned long)resp_len);
    if (resp_len > 0) mg_write(conn, resp, resp_len);
    free(resp);
    return 1;

fail:
    log_msg("REST proxy failed for %s %s", ri->request_method, ri->local_uri);
    mg_printf(conn, "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 22\r\n\r\nX-Plane unreachable\r\n");
    return 1;
}

/* ── Dataref value cache ───────────────────────────────────────────────────── */

static void cache_init(void) {
    InitializeCriticalSection(&g_cache_cs);
    g_dref_cache = cJSON_CreateObject();
}

static void cache_free(void) {
    if (g_dref_cache) { cJSON_Delete(g_dref_cache); g_dref_cache = NULL; }
    DeleteCriticalSection(&g_cache_cs);
}

/* Called for every text message received from X-Plane.
 * Parses dataref_update_values and stores the latest value per dataref.
 * X-Plane v3 format: {"type":"dataref_update_values","data":{"123":42.5,...}} */
static void cache_update(const BYTE *data, DWORD len) {
    if (!g_dref_cache || len == 0) return;
    /* Safe to null-terminate: buf is WS_RECV_BUFFER and len < WS_RECV_BUFFER */
    ((char *)data)[len] = '\0';
    cJSON *msg = cJSON_Parse((const char *)data);
    if (!msg) return;

    cJSON *type = cJSON_GetObjectItemCaseSensitive(msg, "type");
    if (!cJSON_IsString(type) ||
        strcmp(type->valuestring, "dataref_update_values") != 0) {
        cJSON_Delete(msg); return;
    }
    /* X-Plane sends "data" as a JSON object keyed by string dataref ID */
    cJSON *obj = cJSON_GetObjectItemCaseSensitive(msg, "data");
    if (!cJSON_IsObject(obj)) { cJSON_Delete(msg); return; }

    EnterCriticalSection(&g_cache_cs);
    cJSON *item;
    cJSON_ArrayForEach(item, obj) {   /* cJSON_ArrayForEach iterates object children too */
        if (!item->string) continue;
        cJSON_DeleteItemFromObject(g_dref_cache, item->string);
        cJSON_AddItemToObject(g_dref_cache, item->string, cJSON_Duplicate(item, 1));
    }
    LeaveCriticalSection(&g_cache_cs);
    cJSON_Delete(msg);
}

/* Send all cached values to a newly-connected browser so it gets the full
 * current state immediately rather than waiting for each value to change.
 * Output matches X-Plane v3 format: {"type":"dataref_update_values","data":{"123":42.5,...}} */
static void cache_flush(struct mg_connection *conn) {
    EnterCriticalSection(&g_cache_cs);
    int n = cJSON_GetArraySize(g_dref_cache);  /* works for objects */
    if (!g_dref_cache || n == 0) {
        LeaveCriticalSection(&g_cache_cs); return;
    }

    cJSON *msg     = cJSON_CreateObject();
    cJSON *out_obj = cJSON_CreateObject();
    cJSON_AddStringToObject(msg, "type", "dataref_update_values");

    cJSON *val;
    cJSON_ArrayForEach(val, g_dref_cache) {
        cJSON_AddItemToObject(out_obj, val->string, cJSON_Duplicate(val, 1));
    }
    cJSON_AddItemToObject(msg, "data", out_obj);
    LeaveCriticalSection(&g_cache_cs);  /* release before potentially slow write */

    char *json = cJSON_PrintUnformatted(msg);
    cJSON_Delete(msg);
    if (json) {
        log_msg("cache_flush: replaying %d cached values to new browser", n);
        mg_websocket_write(conn, MG_WEBSOCKET_OPCODE_TEXT, json, strlen(json));
        free(json);
    }
}

/* ── WebSocket hub ─────────────────────────────────────────────────────────── */

/* Open a fresh WinHTTP WebSocket to X-Plane.
 * Returns 1 on success, 0 on failure (X-Plane not yet running, etc.). */
static int hub_connect_xplane(void) {
    g_hub.hS = WinHttpOpen(L"XPanelServer/1.0", WINHTTP_ACCESS_TYPE_NO_PROXY,
                           WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!g_hub.hS) return 0;

    g_hub.hC = WinHttpConnect(g_hub.hS, XPLANE_HOST_W, XPLANE_API_PORT, 0);
    if (!g_hub.hC) { WinHttpCloseHandle(g_hub.hS); g_hub.hS = NULL; return 0; }

    g_hub.hR = WinHttpOpenRequest(g_hub.hC, L"GET", L"/api/v3",
                                  NULL, WINHTTP_NO_REFERER, NULL, 0);
    if (!g_hub.hR) goto fail;

    WinHttpSetOption(g_hub.hR, WINHTTP_OPTION_UPGRADE_TO_WEB_SOCKET, NULL, 0);

    if (!WinHttpSendRequest(g_hub.hR,
            L"Pragma: no-cache\r\nCache-Control: no-cache\r\n",
            (DWORD)-1, NULL, 0, 0, 0)) goto fail;
    if (!WinHttpReceiveResponse(g_hub.hR, NULL)) goto fail;

    g_hub.hWs = WinHttpWebSocketCompleteUpgrade(g_hub.hR, 0);
    if (!g_hub.hWs) goto fail;

    log_msg("hub: connected to X-Plane WebSocket");
    return 1;

fail:
    log_msg("hub: failed to connect to X-Plane (not running yet?)");
    if (g_hub.hR) { WinHttpCloseHandle(g_hub.hR); g_hub.hR = NULL; }
    WinHttpCloseHandle(g_hub.hC); g_hub.hC = NULL;
    WinHttpCloseHandle(g_hub.hS); g_hub.hS = NULL;
    return 0;
}

static void hub_close_xplane(void) {
    if (g_hub.hWs) {
        WinHttpWebSocketClose(g_hub.hWs,
            WINHTTP_WEB_SOCKET_SUCCESS_CLOSE_STATUS, NULL, 0);
        WinHttpCloseHandle(g_hub.hWs); g_hub.hWs = NULL;
    }
    if (g_hub.hR) { WinHttpCloseHandle(g_hub.hR); g_hub.hR = NULL; }
    if (g_hub.hC) { WinHttpCloseHandle(g_hub.hC); g_hub.hC = NULL; }
    if (g_hub.hS) { WinHttpCloseHandle(g_hub.hS); g_hub.hS = NULL; }
}

/* Background thread: receive from X-Plane and broadcast to all browsers. */
static DWORD WINAPI hub_recv_thread(LPVOID arg) {
    BYTE buf[WS_RECV_BUFFER];

    while (g_hub.running) {

        /* If we lost the X-Plane connection, keep retrying every 2 s */
        if (!g_hub.hWs) {
            Sleep(2000);
            if (!g_hub.running) break;
            if (!hub_connect_xplane()) continue;
            /* Replay every browser's stored subscription so X-Plane knows
             * what datarefs to stream — snapshot strings under lock first
             * to avoid racing with ws_close freeing them.                */
            char *subs[MAX_BROWSERS] = {0};
            EnterCriticalSection(&g_hub.cs);
            for (int i = 0; i < g_hub.count; i++)
                if (g_hub.sub_msgs[i]) subs[i] = _strdup(g_hub.sub_msgs[i]);
            LeaveCriticalSection(&g_hub.cs);
            for (int i = 0; i < MAX_BROWSERS; i++) {
                if (!subs[i]) continue;
                log_msg("hub: replaying subscription for browser slot %d", i);
                EnterCriticalSection(&g_hub.send_cs);
                WinHttpWebSocketSend(g_hub.hWs,
                    WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE,
                    subs[i], (DWORD)strlen(subs[i]));
                LeaveCriticalSection(&g_hub.send_cs);
                free(subs[i]);
            }
        }

        DWORD bytes = 0;
        WINHTTP_WEB_SOCKET_BUFFER_TYPE btype;
        DWORD rc = WinHttpWebSocketReceive(g_hub.hWs,
                       buf, sizeof(buf), &bytes, &btype);

        if (rc != ERROR_SUCCESS) {
            log_msg("hub: X-Plane WS receive error %lu — reconnecting", rc);
            hub_close_xplane();
            /* Leave browsers connected — instruments freeze on their last value.
             * Subscriptions are replayed automatically once X-Plane comes back. */
            continue;
        }

        /* X-Plane closed cleanly — treat same as error, will reconnect */
        if (btype == WINHTTP_WEB_SOCKET_CLOSE_BUFFER_TYPE) {
            log_msg("hub: X-Plane closed WS cleanly — reconnecting");
            hub_close_xplane();
            continue;
        }

        /* Control frames (ping/pong) carry 0 bytes — nothing to forward */
        if (bytes == 0) continue;

        /* Broadcast to all connected browsers.
         * Snapshot the list under the lock, then write outside it so a
         * slow remote connection can't stall ws_ready / ws_close.        */
        int opcode = (btype == WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE ||
                      btype == WINHTTP_WEB_SOCKET_BINARY_FRAGMENT_BUFFER_TYPE)
                     ? MG_WEBSOCKET_OPCODE_BINARY : MG_WEBSOCKET_OPCODE_TEXT;

        struct mg_connection *snap[MAX_BROWSERS];
        int snap_n;
        EnterCriticalSection(&g_hub.cs);
        snap_n = g_hub.count;
        memcpy(snap, g_hub.conns, snap_n * sizeof(snap[0]));
        LeaveCriticalSection(&g_hub.cs);

        /* Update the value cache so late-joining browsers get a full snapshot */
        if (opcode == MG_WEBSOCKET_OPCODE_TEXT)
            cache_update(buf, bytes);

        for (int i = 0; i < snap_n; i++) {
            if (mg_websocket_write(snap[i], opcode,
                                   (char *)buf, bytes) <= 0) {
                /* Dead connection — remove from the live list */
                log_msg("hub: write failed for browser %d, removing", i);
                EnterCriticalSection(&g_hub.cs);
                for (int j = 0; j < g_hub.count; j++) {
                    if (g_hub.conns[j] == snap[i]) {
                        int last = --g_hub.count;
                        free(g_hub.sub_msgs[j]);
                        g_hub.sub_msgs[j] = g_hub.sub_msgs[last];
                        g_hub.conns[j]    = g_hub.conns[last];
                        g_hub.sub_msgs[last] = NULL;
                        break;
                    }
                }
                LeaveCriticalSection(&g_hub.cs);
            }
        }
    }

    hub_close_xplane();
    log_msg("hub: recv thread exiting");
    return 0;
}

/* ── WebSocket civetweb callbacks (browser side) ─────────────────────────── */

static int ws_connect(const struct mg_connection *conn, void *cbdata) {
    return 0; /* accept all */
}

static void ws_ready(struct mg_connection *conn, void *cbdata) {
    /* Check capacity before committing so we don't hold the lock
     * across the potentially-slow cache_flush write below. */
    EnterCriticalSection(&g_hub.cs);
    int full = (g_hub.count >= MAX_BROWSERS);
    LeaveCriticalSection(&g_hub.cs);

    if (full) {
        log_msg("hub: MAX_BROWSERS (%d) reached — rejecting connection", MAX_BROWSERS);
        mg_close_connection(conn);
        return;
    }

    /* Flush the cached snapshot BEFORE adding to g_hub.conns so the recv
     * thread cannot write to this connection concurrently with cache_flush.
     * Any updates that arrive between here and the add below are fine: the
     * snapshot already reflects the latest known state. */
    cache_flush(conn);

    EnterCriticalSection(&g_hub.cs);
    if (g_hub.count < MAX_BROWSERS) {
        g_hub.conns[g_hub.count++] = conn;
        log_msg("hub: browser connected (%d/%d)", g_hub.count, MAX_BROWSERS);
    }
    LeaveCriticalSection(&g_hub.cs);
}

/* Forward messages from a browser to X-Plane (subscriptions, etc.) */
static int ws_data(struct mg_connection *conn, int bits, char *data,
                   size_t len, void *cbdata) {
    int op = bits & 0x0f;
    if (op == MG_WEBSOCKET_OPCODE_CONNECTION_CLOSE) return 0;

    /* Store subscription messages for X-Plane reconnect replay.
     * civetweb null-terminates text frames before calling ws_data, so
     * strstr is safe.  We store only the last subscription per browser;
     * commands (command_set_is_active) are one-shot and not replayed. */
    if (op == MG_WEBSOCKET_OPCODE_TEXT &&
        strstr(data, "\"dataref_subscribe") != NULL) {
        char *copy = _strdup(data);
        if (copy) {
            EnterCriticalSection(&g_hub.cs);
            for (int i = 0; i < g_hub.count; i++) {
                if (g_hub.conns[i] == conn) {
                    free(g_hub.sub_msgs[i]);
                    g_hub.sub_msgs[i] = copy; copy = NULL;
                    break;
                }
            }
            LeaveCriticalSection(&g_hub.cs);
            free(copy);  /* free if connection not found (already closed) */
        }
        /* Replay the full cache NOW — the browser sent its subscription only
         * after fetchAllDatarefs completed, so _idToName is populated and the
         * snapshot will be processed correctly.  The earlier ws_ready flush
         * arrived before that map was ready and was silently discarded. */
        cache_flush(conn);
    }

    if (!g_hub.hWs) return 1;  /* X-Plane not connected — subscription stored, drop send */
    WINHTTP_WEB_SOCKET_BUFFER_TYPE t =
        (op == MG_WEBSOCKET_OPCODE_BINARY)
        ? WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE
        : WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE;
    /* Serialise: WinHttpWebSocketSend must not be called concurrently */
    EnterCriticalSection(&g_hub.send_cs);
    WinHttpWebSocketSend(g_hub.hWs, t, data, (DWORD)len);
    LeaveCriticalSection(&g_hub.send_cs);
    return 1;
}

static void ws_close(const struct mg_connection *conn, void *cbdata) {
    EnterCriticalSection(&g_hub.cs);
    for (int i = 0; i < g_hub.count; i++) {
        if (g_hub.conns[i] == conn) {
            int last = --g_hub.count;
            free(g_hub.sub_msgs[i]);
            g_hub.sub_msgs[i] = g_hub.sub_msgs[last];
            g_hub.conns[i]    = g_hub.conns[last];
            g_hub.sub_msgs[last] = NULL;
            break;
        }
    }
    log_msg("hub: browser disconnected (%d remaining)", g_hub.count);
    LeaveCriticalSection(&g_hub.cs);
}

/* ── ACF file probe ──────────────────────────────────────────────────────────── */
/*
 * GET /acf  →  {"num_cylinders_per_engine": N, ...}
 * Reads the loaded aircraft's .acf text file and extracts values that are not
 * available via X-Plane's dataref API (e.g. cylinder count per engine).
 * Returns 200 with zeros for fields not found. Falls back gracefully on error.
 */
static int handle_acf(struct mg_connection *conn, void *cbdata) {
    char acf_file[MAX_PATH] = {0};
    char acf_path[MAX_PATH] = {0};
    XPLMGetNthAircraftModel(0, acf_file, acf_path);

    int num_cyls = 0;

    if (acf_path[0]) {
        FILE *f = fopen(acf_path, "r");
        if (f) {
            char line[512];
            while (fgets(line, sizeof(line), f)) {
                /* Lines of interest: "P acf/_num_cyls  6" */
                if (strncmp(line, "P acf/_num_cylinders", 20) == 0) {
                    const char *p = line + 20;
                    while (*p == ' ' || *p == '\t') p++;
                    num_cyls = atoi(p);
                    log_msg("handle_acf: %s → num_cylinders=%d", acf_file, num_cyls);
                    break;
                }
            }
            fclose(f);
        } else {
            log_msg("handle_acf: cannot open %s", acf_path);
        }
    }

    char resp[128];
    int  rlen = snprintf(resp, sizeof(resp),
                         "{\"num_cylinders_per_engine\":%d}", num_cyls);

    mg_printf(conn,
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %d\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "\r\n%s",
        rlen, resp);
    return 1;
}

/* ── HTTP server start / stop ────────────────────────────────────────────────── */
static int server_start(void) {
    if (g_running) return 1;

    /* Ensure panels.json exists */
    FILE *pf = fopen(g_panels_path, "r");
    if (!pf) { pf = fopen(g_panels_path, "w"); if (pf) { fputs("[]", pf); fclose(pf); } }
    else fclose(pf);

    char port_str[16];
    snprintf(port_str, sizeof(port_str), "%d", g_port);

    const char *opts[] = {
        "document_root",            g_web_root,
        "listening_ports",          port_str,
        "enable_directory_listing", "no",
        "index_files",              "index.html",
        "tcp_nodelay",              "1",
        NULL
    };

    struct mg_callbacks cbs = {0};
    g_ctx = mg_start(&cbs, NULL, opts);
    if (!g_ctx) { log_msg("Failed to start HTTP server on port %d", g_port); return 0; }

    mg_set_request_handler(g_ctx, "/api/",     handle_api,    NULL);
    mg_set_request_handler(g_ctx, "/acf",      handle_acf,    NULL);
    mg_set_request_handler(g_ctx, "/panels",   handle_panels, NULL);
    mg_set_request_handler(g_ctx, "/panels/",  handle_panels, NULL);
    mg_set_websocket_handler(g_ctx, "/ws",
        ws_connect, ws_ready, ws_data, ws_close, NULL);

    /* Start the shared X-Plane WebSocket hub */
    cache_init();
    InitializeCriticalSection(&g_hub.cs);
    InitializeCriticalSection(&g_hub.send_cs);
    memset(g_hub.conns,    0, sizeof(g_hub.conns));
    memset(g_hub.sub_msgs, 0, sizeof(g_hub.sub_msgs));
    g_hub.count = 0;
    InterlockedExchange(&g_hub.running, 1);
    hub_connect_xplane();   /* best-effort; thread will retry if X-Plane not up yet */
    g_hub.thread = CreateThread(NULL, 0, hub_recv_thread, NULL, 0, NULL);

    g_running = 1;
    log_msg("Server started on port %d  web_root=%s", g_port, g_web_root);
    return 1;
}

static void server_stop(void) {
    if (!g_running) return;

    /* Stop the hub thread first */
    InterlockedExchange(&g_hub.running, 0);
    hub_close_xplane();   /* unblocks WinHttpWebSocketReceive */
    if (g_hub.thread) {
        WaitForSingleObject(g_hub.thread, 4000);
        CloseHandle(g_hub.thread);
        g_hub.thread = NULL;
    }
    /* Stop civetweb BEFORE deleting critical sections — mg_stop() fires ws_close
     * callbacks for any still-connected browsers, which call EnterCriticalSection
     * on g_hub.cs.  Deleting the CS first causes an access violation on disable. */
    mg_stop(g_ctx); g_ctx = NULL; g_running = 0;

    for (int i = 0; i < MAX_BROWSERS; i++) { free(g_hub.sub_msgs[i]); g_hub.sub_msgs[i] = NULL; }
    DeleteCriticalSection(&g_hub.cs);
    DeleteCriticalSection(&g_hub.send_cs);
    cache_free();

    log_msg("Server stopped");
}

/* ── IP enumeration ──────────────────────────────────────────────────────────── */

static int is_private_ip(const char *ip) {
    if (strncmp(ip, "10.", 3) == 0) return 1;
    if (strncmp(ip, "192.168.", 8) == 0) return 1;
    if (strncmp(ip, "172.", 4) == 0) {
        int b = atoi(ip + 4);   /* second octet */
        if (b >= 16 && b <= 31) return 1;
    }
    return 0;
}

/* Enumerate all UP IPv4 addresses via WSAIoctl — no extra libs needed.
 * Result is sorted: RFC-1918 private addresses first (home/office LAN),
 * then everything else (Docker, VMware, public IPs). */
static void collect_ips(void) {
    g_ip_count = 0;

    SOCKET s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (s == INVALID_SOCKET) return;

    INTERFACE_INFO ifaces[32];
    DWORD returned = 0;
    int ok = (WSAIoctl(s, SIO_GET_INTERFACE_LIST, NULL, 0,
                       ifaces, sizeof(ifaces), &returned, NULL, NULL) != SOCKET_ERROR);
    closesocket(s);
    if (!ok) return;

    int n = (int)(returned / sizeof(INTERFACE_INFO));

    /* Collect all valid non-loopback addresses, noting which are private */
    char   tmp[MAX_IPS][64];
    int    priv[MAX_IPS];
    int    tmp_n = 0;

    for (int i = 0; i < n && tmp_n < MAX_IPS; i++) {
        if (!(ifaces[i].iiFlags & IFF_UP)) continue;
        struct sockaddr_in *addr = (struct sockaddr_in *)&ifaces[i].iiAddress;
        if (addr->sin_family != AF_INET) continue;
        char ip[64];
        inet_ntop(AF_INET, &addr->sin_addr, ip, sizeof(ip));
        if (strncmp(ip, "127.", 4) == 0) continue;
        if (strcmp(ip, "0.0.0.0") == 0) continue;
        strncpy(tmp[tmp_n], ip, 63);
        priv[tmp_n] = is_private_ip(ip);
        tmp_n++;
    }

    /* Private/home addresses first, then all others */
    for (int i = 0; i < tmp_n && g_ip_count < MAX_IPS; i++)
        if ( priv[i]) strncpy(g_ips[g_ip_count++], tmp[i], 63);
    for (int i = 0; i < tmp_n && g_ip_count < MAX_IPS; i++)
        if (!priv[i]) strncpy(g_ips[g_ip_count++], tmp[i], 63);
}

/* ── Menu ────────────────────────────────────────────────────────────────────── */

static void copy_to_clipboard(const char *text) {
    if (!OpenClipboard(NULL)) return;
    EmptyClipboard();
    HGLOBAL hg = GlobalAlloc(GMEM_MOVEABLE, strlen(text) + 1);
    if (hg) { memcpy(GlobalLock(hg), text, strlen(text)+1); GlobalUnlock(hg); SetClipboardData(CF_TEXT, hg); }
    CloseClipboard();
    XPLMSpeakString("URL copied to clipboard.");
}

/* Rebuild the entire menu from scratch so IP entries can be added/removed
 * dynamically.  iref values: 0=toggle, 100=port, 10..10+MAX_IPS-1=copy URL[n]. */
static void menu_rebuild(void) {
    XPLMClearAllMenuItems(g_menu);

    g_mi_toggle = XPLMAppendMenuItem(g_menu,
        g_running ? "Disable Server" : "Enable Server", (void*)0, 1);

    if (g_running) {
        collect_ips();
        if (g_ip_count == 0) {
            XPLMAppendMenuItem(g_menu, "URL: (no network interfaces found)", (void*)10, 1);
        } else {
            for (int i = 0; i < g_ip_count; i++) {
                char label[128];
                snprintf(label, sizeof(label), "http://%s:%d  (click to copy)", g_ips[i], g_port);
                XPLMAppendMenuItem(g_menu, label, (void*)(intptr_t)(10 + i), 1);
            }
        }
    } else {
        XPLMAppendMenuItem(g_menu, "URL: (server offline)", (void*)10, 1);
    }

    XPLMAppendMenuSeparator(g_menu);
    char port_item[64];
    snprintf(port_item, sizeof(port_item), "Port: %d  (click to change)", g_port);
    g_mi_port = XPLMAppendMenuItem(g_menu, port_item, (void*)100, 1);
}

/* ── Port dialog (XPWidgets) ─────────────────────────────────────────────────── */
static int dlg_handler(XPWidgetMessage msg, XPWidgetID wid, intptr_t p1, intptr_t p2) {
    if (msg == xpMessage_CloseButtonPushed) { XPHideWidget(g_dlg); return 1; }
    if (msg == xpMsg_PushButtonPressed && wid == g_dlg_btn) {
        char buf[16] = {0};
        XPGetWidgetDescriptor(g_dlg_field, buf, sizeof(buf));
        int v = atoi(buf);
        if (v >= 1024 && v <= 65535 && v != g_port) {
            int was = g_running; if (was) server_stop();
            g_port = v; config_save();
            if (was) server_start();
            menu_rebuild();
        }
        XPHideWidget(g_dlg);
        return 1;
    }
    return 0;
}

static void show_port_dialog(void) {
    if (!g_dlg) {
        /* Coordinates: X-Plane GUI uses top-left origin, Y increases downward */
        int x = 100, y = 400, w = 280, h = 120;
        g_dlg = XPCreateWidget(x, y, x+w, y-h, 1,
            "XPanel Server — Port", 1, NULL, xpWidgetClass_MainWindow);
        XPSetWidgetProperty(g_dlg, xpProperty_MainWindowHasCloseBoxes, 1);
        XPAddWidgetCallback(g_dlg, dlg_handler);

        XPCreateWidget(x+12, y-32, x+90, y-50, 1, "Port:", 0, g_dlg, xpWidgetClass_Caption);

        g_dlg_field = XPCreateWidget(x+95, y-30, x+200, y-50, 1, "8088", 0, g_dlg, xpWidgetClass_TextField);
        XPSetWidgetProperty(g_dlg_field, xpProperty_TextFieldType, xpTextEntryField);

        g_dlg_btn = XPCreateWidget(x+95, y-65, x+200, y-85, 1, "Apply & Restart", 0, g_dlg, xpWidgetClass_Button);
        XPSetWidgetProperty(g_dlg_btn, xpProperty_ButtonType, xpPushButton);
        XPAddWidgetCallback(g_dlg_btn, dlg_handler);
    }
    char buf[16]; snprintf(buf, sizeof(buf), "%d", g_port);
    XPSetWidgetDescriptor(g_dlg_field, buf);
    XPShowWidget(g_dlg);
    XPBringRootWidgetToFront(g_dlg);
}

static void menu_handler(void *mref, void *iref) {
    intptr_t item = (intptr_t)iref;
    if (item == 0) {
        if (g_running) server_stop(); else server_start();
        menu_rebuild();
    } else if (item == 100) {
        show_port_dialog();
    } else if (item >= 10 && item < 10 + MAX_IPS) {
        int idx = (int)(item - 10);
        if (g_running && idx < g_ip_count) {
            char url[128];
            snprintf(url, sizeof(url), "http://%s:%d", g_ips[idx], g_port);
            copy_to_clipboard(url);
        }
    }
}

/* ── Plugin entry points ─────────────────────────────────────────────────────── */
PLUGIN_API int XPluginStart(char *name, char *sig, char *desc) {
    strncpy(name, "XPanel Server",            255);
    strncpy(sig,  "com.xpanelserver.plugin",  255);
    strncpy(desc, "Serves XPlane Network Panels web app on the LAN", 255);

    InitializeCriticalSection(&g_cs);

    /* Resolve paths from .xpl location */
    char xpl_path[MAX_PATH];
    XPLMGetPluginInfo(XPLMGetMyID(), NULL, xpl_path, NULL, NULL);
    /* xpl_path = .../XPanelServer/win_x64/XPanelServer.xpl  — go up twice */
    char *s = strrchr(xpl_path, '\\'); if (!s) s = strrchr(xpl_path, '/');
    if (s) *s = '\0';  /* strip filename  → .../win_x64 */
    s = strrchr(xpl_path, '\\'); if (!s) s = strrchr(xpl_path, '/');
    if (s) *s = '\0';  /* strip platform  → .../XPanelServer */
    strncpy(g_plugin_root, xpl_path, MAX_PATH - 1);

    snprintf(g_resources, sizeof(g_resources), "%s\\Resources",           g_plugin_root);
    snprintf(g_web_root,  sizeof(g_web_root),  "%s\\Resources\\web",      g_plugin_root);
    snprintf(g_panels_path, sizeof(g_panels_path), "%s\\panels.json",     g_resources);
    snprintf(g_config_path, sizeof(g_config_path), "%s\\config.json",     g_resources);

    CreateDirectoryA(g_resources, NULL);
    CreateDirectoryA(g_web_root,  NULL);

    config_load();

    /* Winsock (needed for gethostname / getaddrinfo) */
    WSADATA wsd; WSAStartup(MAKEWORD(2, 2), &wsd);

    /* Build Plugin menu:  Plugins → XPanel Server → [items] */
    int root_idx = XPLMAppendMenuItem(XPLMFindPluginsMenu(), "XPanel Server", NULL, 1);
    g_menu = XPLMCreateMenu("XPanel Server", XPLMFindPluginsMenu(), root_idx, menu_handler, NULL);
    menu_rebuild();   /* populates all items; server is offline at this point */

    log_msg("Plugin loaded. Root: %s", g_plugin_root);
    return 1;
}

PLUGIN_API void XPluginStop(void) {
    server_stop();
    WSACleanup();
    DeleteCriticalSection(&g_cs);
    log_msg("Plugin unloaded");
}

PLUGIN_API int XPluginEnable(void) {
    server_start();
    menu_rebuild();
    return 1;
}

PLUGIN_API void XPluginDisable(void) {
    server_stop();
    menu_rebuild();
}

PLUGIN_API void XPluginReceiveMessage(XPLMPluginID from, int msg, void *param) {
    /* Nothing to handle yet */
}