/*
 * XPanelServer.c  —  X-Plane 12 plugin
 *
 * Serves the XPlaneNetworkPanels web app on the local network.
 *
 * Port (default 8088, configurable via Plugin menu):
 *   /                  → static files from  <plugin>/Resources/web/
 *   /api/*             → HTTP proxy  →  http://127.0.0.1:8086/api/*
 *   /ws                → WebSocket hub  →  ws://127.0.0.1:8086/api/v3
 *   /panels[/*]        → panel config CRUD  →  <plugin>/Resources/panels.json
 *   /acf               → ACF file probe
 *
 * The HTTP proxy and WebSocket hub use civetweb's own client API and work
 * on Windows, macOS, and Linux without any platform-specific code.
 */

/* ── Platform compatibility ───────────────────────────────────────────────── */
#ifdef _WIN32
    #define WIN32_LEAN_AND_MEAN
    #define _WIN32_WINNT 0x0602
    #include <windows.h>
    #include <winsock2.h>
    #include <ws2tcpip.h>

    typedef CRITICAL_SECTION  xp_mutex_t;
    #define xp_mutex_init(m)  InitializeCriticalSection(m)
    #define xp_mutex_lock(m)  EnterCriticalSection(m)
    #define xp_mutex_unlock(m) LeaveCriticalSection(m)
    #define xp_mutex_free(m)  DeleteCriticalSection(m)
    #define xp_sleep_ms(ms)   Sleep(ms)
    #define xp_strdup         _strdup
    #define xp_mkdir(p)       CreateDirectoryA((p), NULL)
#elif defined(__APPLE__)
    #include <CoreFoundation/CoreFoundation.h>
#endif

#ifndef _WIN32
    #include <pthread.h>
    #include <unistd.h>
    #include <sys/stat.h>
    #include <ifaddrs.h>
    #include <arpa/inet.h>
    #include <net/if.h>

    typedef pthread_mutex_t   xp_mutex_t;
    #define xp_mutex_init(m)  pthread_mutex_init((m), NULL)
    #define xp_mutex_lock(m)  pthread_mutex_lock(m)
    #define xp_mutex_unlock(m) pthread_mutex_unlock(m)
    #define xp_mutex_free(m)  pthread_mutex_destroy(m)
    #define xp_sleep_ms(ms)   usleep((unsigned)(ms) * 1000u)
    #define xp_strdup         strdup
    #define xp_mkdir(p)       mkdir((p), 0755)

    #ifndef MAX_PATH
    #define MAX_PATH 4096
    #endif
#endif /* !_WIN32 */

/* ── macOS: HFS path → POSIX path ────────────────────────────────────────── */
/*
 * XPLMGetPluginInfo and XPLMGetNthAircraftModel return HFS-style paths on
 * macOS (colon-separated, e.g. "Volume:dir:file"). fopen() and civetweb need
 * POSIX paths. CoreFoundation converts reliably for both boot and non-boot
 * volumes.
 */
#ifdef __APPLE__
static void hfs_to_posix(const char *hfs, char *out, size_t out_size) {
    CFStringRef s = CFStringCreateWithCString(NULL, hfs, kCFStringEncodingUTF8);
    if (!s) { strncpy(out, hfs, out_size - 1); return; }
    CFURLRef url = CFURLCreateWithFileSystemPath(NULL, s, kCFURLHFSPathStyle, false);
    CFRelease(s);
    if (!url) { strncpy(out, hfs, out_size - 1); return; }
    CFStringRef p = CFURLCopyFileSystemPath(url, kCFURLPOSIXPathStyle);
    CFRelease(url);
    if (!p) { strncpy(out, hfs, out_size - 1); return; }
    CFStringGetCString(p, out, (CFIndex)out_size, kCFStringEncodingUTF8);
    CFRelease(p);
}
#endif

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#include "XPLMPlugin.h"
#include "XPLMMenus.h"
#include "XPLMUtilities.h"
#include "XPLMPlanes.h"
#include "XPWidgets.h"
#include "XPStandardWidgets.h"

#include "civetweb.h"
#include "cJSON.h"

/* ── Compile-time options ─────────────────────────────────────────────────── */
#define XPANEL_DEFAULT_PORT  8088
#define XPLANE_API_PORT      8086
#define XPLANE_HOST          "127.0.0.1"
#define RESP_BUFFER_INIT     (256  * 1024)
#define RESP_BUFFER_MAX      (8    * 1024 * 1024)
#define MAX_BROWSERS         8

/* ── Global state ─────────────────────────────────────────────────────────── */
static int                g_port    = XPANEL_DEFAULT_PORT;
static volatile int       g_running = 0;
static struct mg_context *g_ctx     = NULL;
static xp_mutex_t         g_cs;

static char g_plugin_root[MAX_PATH];
static char g_resources[MAX_PATH];
static char g_web_root[MAX_PATH];
static char g_panels_path[MAX_PATH];
static char g_config_path[MAX_PATH];

#define MAX_IPS 12
static char g_ips[MAX_IPS][64];
static int  g_ip_count = 0;

static XPLMMenuID g_menu;
static int        g_mi_toggle;
static int        g_mi_port;
static XPWidgetID g_dlg       = NULL;
static XPWidgetID g_dlg_field = NULL;
static XPWidgetID g_dlg_btn   = NULL;

/* ── WebSocket hub ────────────────────────────────────────────────────────── */
/*
 * One upstream civetweb WebSocket client to X-Plane, shared by all browsers.
 * g_xp_conn is created by mg_connect_websocket_client() and lives on
 * civetweb's internal thread.  All access is protected by hub.send_cs.
 */
static struct mg_connection *g_xp_conn = NULL;

typedef struct {
    struct mg_connection *conns[MAX_BROWSERS];
    char                 *sub_msgs[MAX_BROWSERS];
    int                   count;
    xp_mutex_t            cs;       /* guards conns[], sub_msgs[], count */
    xp_mutex_t            send_cs;  /* serialises writes to g_xp_conn    */
#ifdef _WIN32
    HANDLE         thread;
    volatile LONG  running;
#else
    pthread_t      thread;
    volatile int   running;
#endif
} WsHub;

static WsHub g_hub;

/* ── Dataref value cache ──────────────────────────────────────────────────── */
static cJSON      *g_dref_cache = NULL;
static xp_mutex_t  g_cache_cs;

/* ── Utility ──────────────────────────────────────────────────────────────── */
static void log_msg(const char *fmt, ...) {
    char buf[512];
    va_list ap; va_start(ap, fmt); vsnprintf(buf, sizeof(buf), fmt, ap); va_end(ap);
    XPLMDebugString("[XPanelServer] ");
    XPLMDebugString(buf);
    XPLMDebugString("\n");
}

/* ── Config ───────────────────────────────────────────────────────────────── */
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

/* ── Panels CRUD ──────────────────────────────────────────────────────────── */
static char *panels_read(void) {
    FILE *f = fopen(g_panels_path, "r");
    if (!f) return xp_strdup("[]");
    fseek(f, 0, SEEK_END); long sz = ftell(f); rewind(f);
    if (sz <= 0) { fclose(f); return xp_strdup("[]"); }
    char *b = malloc(sz + 1); fread(b, 1, sz, f); b[sz] = '\0'; fclose(f);
    return b;
}

static void panels_write(const char *json) {
    FILE *f = fopen(g_panels_path, "w");
    if (!f) return;
    fputs(json, f); fclose(f);
}

static const char *panel_id_from_uri(const char *uri) {
    if (strncmp(uri, "/panels/", 8) == 0 && uri[8] != '\0') return uri + 8;
    return NULL;
}

static int handle_panels(struct mg_connection *conn, void *cbdata) {
    const struct mg_request_info *ri = mg_get_request_info(conn);
    const char *method   = ri->request_method;
    const char *panel_id = panel_id_from_uri(ri->local_uri);

    xp_mutex_lock(&g_cs);

    if (strcmp(method, "GET") == 0) {
        char *file_json = panels_read();
        if (panel_id) {
            cJSON *arr = cJSON_Parse(file_json); free(file_json);
            cJSON *found = NULL;
            if (arr) { cJSON *it; cJSON_ArrayForEach(it, arr) {
                cJSON *id = cJSON_GetObjectItem(it, "id");
                if (id && strcmp(cJSON_GetStringValue(id), panel_id) == 0) { found = it; break; }
            }}
            char *out = found ? cJSON_PrintUnformatted(found) : xp_strdup("null");
            mg_printf(conn, "HTTP/1.1 %d OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s",
                      found ? 200 : 404, (int)strlen(out), out);
            free(out); cJSON_Delete(arr);
        } else {
            mg_printf(conn, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s",
                      (int)strlen(file_json), file_json);
            free(file_json);
        }

    } else if (strcmp(method, "PUT") == 0 || strcmp(method, "POST") == 0) {
        char body[1 << 17] = {0}; int blen = 0;
        if (ri->content_length > 0 && ri->content_length < (int64_t)sizeof(body))
            blen = mg_read(conn, body, (int)ri->content_length);
        char *file_json = panels_read();
        cJSON *arr = cJSON_Parse(file_json); if (!arr) arr = cJSON_CreateArray(); free(file_json);
        cJSON *panel = cJSON_Parse(body);
        if (panel) {
            cJSON *new_id = cJSON_GetObjectItem(panel, "id");
            for (int i = cJSON_GetArraySize(arr) - 1; i >= 0; i--) {
                cJSON *id = cJSON_GetObjectItem(cJSON_GetArrayItem(arr, i), "id");
                if (new_id && id && strcmp(cJSON_GetStringValue(id), cJSON_GetStringValue(new_id)) == 0)
                    cJSON_DeleteItemFromArray(arr, i);
            }
            cJSON_AddItemToArray(arr, panel);
        }
        char *out = cJSON_PrintUnformatted(arr); panels_write(out);
        char *resp = panel ? cJSON_PrintUnformatted(panel) : xp_strdup("{}");
        mg_printf(conn, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s",
                  (int)strlen(resp), resp);
        free(out); free(resp); cJSON_Delete(arr);

    } else if (strcmp(method, "DELETE") == 0 && panel_id) {
        char *file_json = panels_read();
        cJSON *arr = cJSON_Parse(file_json); free(file_json);
        if (arr) {
            for (int i = cJSON_GetArraySize(arr) - 1; i >= 0; i--) {
                cJSON *id = cJSON_GetObjectItem(cJSON_GetArrayItem(arr, i), "id");
                if (id && strcmp(cJSON_GetStringValue(id), panel_id) == 0)
                    cJSON_DeleteItemFromArray(arr, i);
            }
            char *out = cJSON_PrintUnformatted(arr); panels_write(out); free(out); cJSON_Delete(arr);
        }
        mg_printf(conn, "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n");
    }

    xp_mutex_unlock(&g_cs);
    return 1;
}

/* ── REST API proxy via civetweb HTTP client ─────────────────────────────── */
/*
 * Forwards /api/v3/... → http://127.0.0.1:8086/v3/...
 * Uses mg_connect_client (plain TCP, no SSL) + mg_get_response, which works
 * on all three platforms without any OS-specific HTTP library.
 */
static int handle_api(struct mg_connection *conn, void *cbdata) {
    const struct mg_request_info *ri = mg_get_request_info(conn);

    char req_path[2048];
    if (ri->query_string && ri->query_string[0])
        snprintf(req_path, sizeof(req_path), "%s?%s", ri->local_uri, ri->query_string);
    else
        strncpy(req_path, ri->local_uri, sizeof(req_path) - 1);

    char body[1 << 17] = {0}; int body_len = 0;
    if (ri->content_length > 0 && ri->content_length < (int64_t)sizeof(body))
        body_len = mg_read(conn, body, (int)ri->content_length);

    char errbuf[256] = {0};
    struct mg_connection *xp = mg_connect_client(XPLANE_HOST, XPLANE_API_PORT,
                                                  0, errbuf, sizeof(errbuf));
    if (!xp) goto fail;

    if (body_len > 0) {
        mg_printf(xp, "%s %s HTTP/1.0\r\nHost: %s:%d\r\n"
                  "Content-Type: application/json\r\nContent-Length: %d\r\n\r\n",
                  ri->request_method, req_path, XPLANE_HOST, XPLANE_API_PORT, body_len);
        mg_write(xp, body, body_len);
    } else {
        mg_printf(xp, "%s %s HTTP/1.0\r\nHost: %s:%d\r\n\r\n",
                  ri->request_method, req_path, XPLANE_HOST, XPLANE_API_PORT);
    }

    if (mg_get_response(xp, errbuf, sizeof(errbuf), 5000) < 0) {
        mg_close_connection(xp); goto fail;
    }

    const struct mg_response_info *rinfo = mg_get_response_info(xp);
    if (!rinfo) { mg_close_connection(xp); goto fail; }

    int status = rinfo->status_code;
    const char *ct = "application/json";
    for (int i = 0; i < rinfo->num_headers; i++) {
        if (mg_strcasecmp(rinfo->http_headers[i].name, "Content-Type") == 0) {
            ct = rinfo->http_headers[i].value; break;
        }
    }

    size_t cap = RESP_BUFFER_INIT, len = 0;
    char *resp = malloc(cap); int n;
    while ((n = mg_read(xp, resp + len, (int)(cap - len - 1))) > 0) {
        len += n;
        if (len + 1 >= cap) {
            size_t newcap = cap * 2;
            if (newcap > RESP_BUFFER_MAX) break;
            resp = realloc(resp, newcap); cap = newcap;
        }
    }
    mg_close_connection(xp);

    const char *st = status==200?"OK":status==204?"No Content":status==404?"Not Found":"Error";
    mg_printf(conn, "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\n\r\n",
              status, st, ct, len);
    if (len > 0) mg_write(conn, resp, len);
    free(resp);
    return 1;

fail:
    log_msg("REST proxy failed for %s %s: %s", ri->request_method, ri->local_uri, errbuf);
    mg_printf(conn, "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 19\r\n\r\nX-Plane unreachable");
    return 1;
}

/* ── Dataref value cache ──────────────────────────────────────────────────── */
static void cache_init(void) {
    xp_mutex_init(&g_cache_cs);
    g_dref_cache = cJSON_CreateObject();
}

static void cache_free(void) {
    if (g_dref_cache) { cJSON_Delete(g_dref_cache); g_dref_cache = NULL; }
    xp_mutex_free(&g_cache_cs);
}

static void cache_update(const char *data, size_t len) {
    if (!g_dref_cache || len == 0) return;
    cJSON *msg = cJSON_ParseWithLength(data, len);
    if (!msg) return;
    cJSON *type = cJSON_GetObjectItemCaseSensitive(msg, "type");
    if (!cJSON_IsString(type) || strcmp(type->valuestring, "dataref_update_values") != 0)
        { cJSON_Delete(msg); return; }
    cJSON *obj = cJSON_GetObjectItemCaseSensitive(msg, "data");
    if (!cJSON_IsObject(obj)) { cJSON_Delete(msg); return; }

    xp_mutex_lock(&g_cache_cs);
    cJSON *item;
    cJSON_ArrayForEach(item, obj) {
        if (!item->string) continue;
        cJSON_DeleteItemFromObject(g_dref_cache, item->string);
        cJSON_AddItemToObject(g_dref_cache, item->string, cJSON_Duplicate(item, 1));
    }
    xp_mutex_unlock(&g_cache_cs);
    cJSON_Delete(msg);
}

static void cache_flush(struct mg_connection *conn) {
    xp_mutex_lock(&g_cache_cs);
    int n = cJSON_GetArraySize(g_dref_cache);
    if (!g_dref_cache || n == 0) { xp_mutex_unlock(&g_cache_cs); return; }
    cJSON *msg = cJSON_CreateObject();
    cJSON *out = cJSON_CreateObject();
    cJSON_AddStringToObject(msg, "type", "dataref_update_values");
    cJSON *val;
    cJSON_ArrayForEach(val, g_dref_cache)
        cJSON_AddItemToObject(out, val->string, cJSON_Duplicate(val, 1));
    cJSON_AddItemToObject(msg, "data", out);
    xp_mutex_unlock(&g_cache_cs);

    char *json = cJSON_PrintUnformatted(msg);
    cJSON_Delete(msg);
    if (json) {
        log_msg("cache_flush: replaying %d cached values to new browser", n);
        mg_websocket_write(conn, MG_WEBSOCKET_OPCODE_TEXT, json, strlen(json));
        free(json);
    }
}

/* ── WebSocket hub — upstream X-Plane callbacks ───────────────────────────── */
/*
 * These are called from civetweb's internal client thread.
 * hub_ws_data_from_xplane  — X-Plane sent data → broadcast to all browsers
 * hub_ws_close_from_xplane — upstream connection dropped → mark for reconnect
 */
static int hub_ws_data_from_xplane(struct mg_connection *conn, int bits,
                                    char *data, size_t data_len, void *user_data) {
    int op = bits & 0x0f;
    if (op == MG_WEBSOCKET_OPCODE_CONNECTION_CLOSE) return 0;
    if (data_len == 0) return 1;

    if (op == MG_WEBSOCKET_OPCODE_TEXT)
        cache_update(data, data_len);

    struct mg_connection *snap[MAX_BROWSERS]; int snap_n;
    xp_mutex_lock(&g_hub.cs);
    snap_n = g_hub.count;
    memcpy(snap, g_hub.conns, snap_n * sizeof(snap[0]));
    xp_mutex_unlock(&g_hub.cs);

    for (int i = 0; i < snap_n; i++) {
        if (mg_websocket_write(snap[i], op, data, data_len) <= 0) {
            log_msg("hub: write to browser %d failed, removing", i);
            xp_mutex_lock(&g_hub.cs);
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
            xp_mutex_unlock(&g_hub.cs);
        }
    }
    return 1;
}

static void hub_ws_close_from_xplane(const struct mg_connection *conn, void *user_data) {
    log_msg("hub: X-Plane WS closed — will reconnect");
    xp_mutex_lock(&g_hub.send_cs);
    if (g_xp_conn == conn) g_xp_conn = NULL;
    xp_mutex_unlock(&g_hub.send_cs);
}

static int hub_connect_xplane(void) {
    char errbuf[256] = {0};
    struct mg_connection *c = mg_connect_websocket_client(
        XPLANE_HOST, XPLANE_API_PORT, 0,
        errbuf, sizeof(errbuf),
        "/api/v3", NULL,
        hub_ws_data_from_xplane,
        hub_ws_close_from_xplane,
        NULL);
    if (!c) { log_msg("hub: connect failed: %s", errbuf); return 0; }
    xp_mutex_lock(&g_hub.send_cs);
    g_xp_conn = c;
    xp_mutex_unlock(&g_hub.send_cs);
    log_msg("hub: connected to X-Plane WebSocket");
    return 1;
}

/* ── WebSocket hub — reconnect loop (common logic) ────────────────────────── */
static void hub_reconnect_loop(void) {
    while (g_hub.running) {
        xp_mutex_lock(&g_hub.send_cs);
        int connected = (g_xp_conn != NULL);
        xp_mutex_unlock(&g_hub.send_cs);

        if (connected) { xp_sleep_ms(500); continue; }

        if (!hub_connect_xplane()) { xp_sleep_ms(2000); continue; }

        /* Replay every browser's last subscription so X-Plane streams
         * the right datarefs after a reconnect. */
        char *subs[MAX_BROWSERS] = {0};
        xp_mutex_lock(&g_hub.cs);
        for (int i = 0; i < g_hub.count; i++)
            if (g_hub.sub_msgs[i]) subs[i] = xp_strdup(g_hub.sub_msgs[i]);
        xp_mutex_unlock(&g_hub.cs);

        for (int i = 0; i < MAX_BROWSERS; i++) {
            if (!subs[i]) continue;
            log_msg("hub: replaying subscription for browser slot %d", i);
            xp_mutex_lock(&g_hub.send_cs);
            if (g_xp_conn)
                mg_websocket_client_write(g_xp_conn, MG_WEBSOCKET_OPCODE_TEXT,
                                          subs[i], strlen(subs[i]));
            xp_mutex_unlock(&g_hub.send_cs);
            free(subs[i]);
        }
    }

    /* Clean up the upstream connection before the thread exits. */
    xp_mutex_lock(&g_hub.send_cs);
    struct mg_connection *xp = g_xp_conn;
    g_xp_conn = NULL;
    xp_mutex_unlock(&g_hub.send_cs);
    if (xp) mg_close_connection(xp);

    log_msg("hub: reconnect thread exiting");
}

/* Thin platform wrappers so the loop body stays #ifdef-free. */
#ifdef _WIN32
static DWORD WINAPI hub_reconnect_thread(LPVOID arg) { hub_reconnect_loop(); return 0; }
#else
static void *hub_reconnect_thread(void *arg) { hub_reconnect_loop(); return NULL; }
#endif

/* ── WebSocket civetweb callbacks (browser side) ─────────────────────────── */
static int ws_connect(const struct mg_connection *conn, void *cbdata) { return 0; }

static void ws_ready(struct mg_connection *conn, void *cbdata) {
    xp_mutex_lock(&g_hub.cs);
    int full = (g_hub.count >= MAX_BROWSERS);
    xp_mutex_unlock(&g_hub.cs);
    if (full) { log_msg("hub: MAX_BROWSERS reached"); mg_close_connection(conn); return; }

    /* Send snapshot before adding to the list so the recv thread can't
     * write to this connection concurrently with cache_flush. */
    cache_flush(conn);

    xp_mutex_lock(&g_hub.cs);
    if (g_hub.count < MAX_BROWSERS) {
        g_hub.conns[g_hub.count++] = conn;
        log_msg("hub: browser connected (%d/%d)", g_hub.count, MAX_BROWSERS);
    }
    xp_mutex_unlock(&g_hub.cs);
}

static int ws_data(struct mg_connection *conn, int bits, char *data,
                   size_t len, void *cbdata) {
    int op = bits & 0x0f;
    if (op == MG_WEBSOCKET_OPCODE_CONNECTION_CLOSE) return 0;

    /* Store subscription messages so we can replay them on X-Plane reconnect. */
    if (op == MG_WEBSOCKET_OPCODE_TEXT &&
        strstr(data, "\"dataref_subscribe") != NULL) {
        char *copy = xp_strdup(data);
        if (copy) {
            xp_mutex_lock(&g_hub.cs);
            for (int i = 0; i < g_hub.count; i++) {
                if (g_hub.conns[i] == conn) {
                    free(g_hub.sub_msgs[i]);
                    g_hub.sub_msgs[i] = copy; copy = NULL; break;
                }
            }
            xp_mutex_unlock(&g_hub.cs);
            free(copy);
        }
        /* Second flush: browser sends subscription after fetchAllDatarefs,
         * so _idToName is now populated and the snapshot will be processed. */
        cache_flush(conn);
    }

    /* Forward to X-Plane. */
    xp_mutex_lock(&g_hub.send_cs);
    if (g_xp_conn)
        mg_websocket_client_write(g_xp_conn, op, data, len);
    xp_mutex_unlock(&g_hub.send_cs);
    return 1;
}

static void ws_close(const struct mg_connection *conn, void *cbdata) {
    xp_mutex_lock(&g_hub.cs);
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
    xp_mutex_unlock(&g_hub.cs);
}

/* ── ACF file probe ───────────────────────────────────────────────────────── */
static int handle_acf(struct mg_connection *conn, void *cbdata) {
    char acf_file[MAX_PATH] = {0}, acf_path[MAX_PATH] = {0};
    XPLMGetNthAircraftModel(0, acf_file, acf_path);
#ifdef __APPLE__
    if (acf_path[0]) { char posix[MAX_PATH]; hfs_to_posix(acf_path, posix, sizeof(posix)); strncpy(acf_path, posix, MAX_PATH - 1); }
#endif
    int num_cyls = 0;
    if (acf_path[0]) {
        FILE *f = fopen(acf_path, "r");
        if (f) {
            char line[512];
            while (fgets(line, sizeof(line), f)) {
                if (strncmp(line, "P acf/_num_cylinders", 20) == 0) {
                    const char *p = line + 20;
                    while (*p == ' ' || *p == '\t') p++;
                    num_cyls = atoi(p);
                    log_msg("handle_acf: %s → num_cylinders=%d", acf_file, num_cyls);
                    break;
                }
            }
            fclose(f);
        }
    }
    char resp[128];
    int rlen = snprintf(resp, sizeof(resp), "{\"num_cylinders_per_engine\":%d}", num_cyls);
    mg_printf(conn,
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
        "Content-Length: %d\r\nAccess-Control-Allow-Origin: *\r\n\r\n%s",
        rlen, resp);
    return 1;
}

/* ── HTTP server start / stop ─────────────────────────────────────────────── */
static int server_start(void) {
    if (g_running) return 1;

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

    mg_set_request_handler(g_ctx, "/api/",    handle_api,    NULL);
    mg_set_request_handler(g_ctx, "/acf",     handle_acf,    NULL);
    mg_set_request_handler(g_ctx, "/panels",  handle_panels, NULL);
    mg_set_request_handler(g_ctx, "/panels/", handle_panels, NULL);
    mg_set_websocket_handler(g_ctx, "/ws",
        ws_connect, ws_ready, ws_data, ws_close, NULL);

    cache_init();
    xp_mutex_init(&g_hub.cs);
    xp_mutex_init(&g_hub.send_cs);
    memset(g_hub.conns,    0, sizeof(g_hub.conns));
    memset(g_hub.sub_msgs, 0, sizeof(g_hub.sub_msgs));
    g_hub.count = 0;

#ifdef _WIN32
    InterlockedExchange(&g_hub.running, 1);
    g_hub.thread = CreateThread(NULL, 0, hub_reconnect_thread, NULL, 0, NULL);
#else
    g_hub.running = 1;
    pthread_create(&g_hub.thread, NULL, hub_reconnect_thread, NULL);
#endif

    g_running = 1;
    log_msg("Server started on port %d  web_root=%s", g_port, g_web_root);
    return 1;
}

static void server_stop(void) {
    if (!g_running) return;

    /* Signal the reconnect thread to stop and wait for it.
     * The thread closes g_xp_conn as its last action. */
#ifdef _WIN32
    InterlockedExchange(&g_hub.running, 0);
    if (g_hub.thread) {
        WaitForSingleObject(g_hub.thread, 6000);
        CloseHandle(g_hub.thread);
        g_hub.thread = NULL;
    }
#else
    g_hub.running = 0;
    pthread_join(g_hub.thread, NULL);
#endif

    /* Stop civetweb AFTER the reconnect thread exits so the ws_close
     * callbacks (which lock g_hub.cs) are still safe to call. */
    mg_stop(g_ctx); g_ctx = NULL; g_running = 0;

    for (int i = 0; i < MAX_BROWSERS; i++) { free(g_hub.sub_msgs[i]); g_hub.sub_msgs[i] = NULL; }
    xp_mutex_free(&g_hub.cs);
    xp_mutex_free(&g_hub.send_cs);
    cache_free();
    log_msg("Server stopped");
}

/* ── IP enumeration ───────────────────────────────────────────────────────── */
static int is_private_ip(const char *ip) {
    if (strncmp(ip, "10.", 3) == 0) return 1;
    if (strncmp(ip, "192.168.", 8) == 0) return 1;
    if (strncmp(ip, "172.", 4) == 0) { int b = atoi(ip+4); if (b >= 16 && b <= 31) return 1; }
    return 0;
}

#ifdef _WIN32
static void collect_ips(void) {
    g_ip_count = 0;
    SOCKET s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (s == INVALID_SOCKET) return;
    INTERFACE_INFO ifaces[32]; DWORD returned = 0;
    int ok = (WSAIoctl(s, SIO_GET_INTERFACE_LIST, NULL, 0,
                       ifaces, sizeof(ifaces), &returned, NULL, NULL) != SOCKET_ERROR);
    closesocket(s);
    if (!ok) return;
    int n = (int)(returned / sizeof(INTERFACE_INFO));
    char tmp[MAX_IPS][64]; int priv[MAX_IPS]; int tmp_n = 0;
    for (int i = 0; i < n && tmp_n < MAX_IPS; i++) {
        if (!(ifaces[i].iiFlags & IFF_UP)) continue;
        struct sockaddr_in *a = (struct sockaddr_in *)&ifaces[i].iiAddress;
        if (a->sin_family != AF_INET) continue;
        char ip[64]; inet_ntop(AF_INET, &a->sin_addr, ip, sizeof(ip));
        if (strncmp(ip, "127.", 4) == 0 || strcmp(ip, "0.0.0.0") == 0) continue;
        strncpy(tmp[tmp_n], ip, 63); priv[tmp_n++] = is_private_ip(ip);
    }
    for (int i = 0; i < tmp_n && g_ip_count < MAX_IPS; i++)
        if ( priv[i]) strncpy(g_ips[g_ip_count++], tmp[i], 63);
    for (int i = 0; i < tmp_n && g_ip_count < MAX_IPS; i++)
        if (!priv[i]) strncpy(g_ips[g_ip_count++], tmp[i], 63);
}
#else
static void collect_ips(void) {
    g_ip_count = 0;
    struct ifaddrs *ifap = NULL;
    if (getifaddrs(&ifap) != 0) return;
    char tmp[MAX_IPS][64]; int priv[MAX_IPS]; int tmp_n = 0;
    for (struct ifaddrs *ifa = ifap; ifa && tmp_n < MAX_IPS; ifa = ifa->ifa_next) {
        if (!ifa->ifa_addr || ifa->ifa_addr->sa_family != AF_INET) continue;
        if (!(ifa->ifa_flags & IFF_UP)) continue;
        struct sockaddr_in *sa = (struct sockaddr_in *)ifa->ifa_addr;
        char ip[64]; inet_ntop(AF_INET, &sa->sin_addr, ip, sizeof(ip));
        if (strncmp(ip, "127.", 4) == 0) continue;
        strncpy(tmp[tmp_n], ip, 63); priv[tmp_n++] = is_private_ip(ip);
    }
    freeifaddrs(ifap);
    for (int i = 0; i < tmp_n && g_ip_count < MAX_IPS; i++)
        if ( priv[i]) strncpy(g_ips[g_ip_count++], tmp[i], 63);
    for (int i = 0; i < tmp_n && g_ip_count < MAX_IPS; i++)
        if (!priv[i]) strncpy(g_ips[g_ip_count++], tmp[i], 63);
}
#endif

/* ── Menu / clipboard ─────────────────────────────────────────────────────── */
static void copy_to_clipboard(const char *text) {
#ifdef _WIN32
    if (!OpenClipboard(NULL)) return;
    EmptyClipboard();
    HGLOBAL hg = GlobalAlloc(GMEM_MOVEABLE, strlen(text) + 1);
    if (hg) { memcpy(GlobalLock(hg), text, strlen(text)+1); GlobalUnlock(hg); SetClipboardData(CF_TEXT, hg); }
    CloseClipboard();
    XPLMSpeakString("URL copied to clipboard.");
#elif defined(__APPLE__)
    char cmd[512];
    snprintf(cmd, sizeof(cmd), "echo '%s' | pbcopy", text);
    system(cmd);
    XPLMSpeakString("URL copied to clipboard.");
#else
    log_msg("URL: %s", text);
    XPLMSpeakString("URL logged to X-Plane log.");
#endif
}

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

/* ── Port dialog ──────────────────────────────────────────────────────────── */
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

/* ── Plugin entry points ──────────────────────────────────────────────────── */
PLUGIN_API int XPluginStart(char *name, char *sig, char *desc) {
    strncpy(name, "XPanel Server",            255);
    strncpy(sig,  "com.xpanelserver.plugin",  255);
    strncpy(desc, "Serves XPlane Network Panels web app on the LAN", 255);

    xp_mutex_init(&g_cs);

    char xpl_path[MAX_PATH];
    XPLMGetPluginInfo(XPLMGetMyID(), NULL, xpl_path, NULL, NULL);
#ifdef __APPLE__
    { char posix[MAX_PATH]; hfs_to_posix(xpl_path, posix, sizeof(posix)); strncpy(xpl_path, posix, MAX_PATH - 1); }
#endif
    /* Strip  .../XPanelServer/<platform>/XPanelServer.xpl  →  .../XPanelServer */
    char *s = strrchr(xpl_path, '/');
#ifdef _WIN32
    { char *bs = strrchr(xpl_path, '\\'); if (!s || (bs && bs > s)) s = bs; }
#endif
    if (s) *s = '\0';
    s = strrchr(xpl_path, '/');
#ifdef _WIN32
    { char *bs = strrchr(xpl_path, '\\'); if (!s || (bs && bs > s)) s = bs; }
#endif
    if (s) *s = '\0';
    strncpy(g_plugin_root, xpl_path, MAX_PATH - 1);

    snprintf(g_resources,   sizeof(g_resources),   "%s/Resources",     g_plugin_root);
    snprintf(g_web_root,    sizeof(g_web_root),     "%s/Resources/web", g_plugin_root);
    snprintf(g_panels_path, sizeof(g_panels_path),  "%s/panels.json",   g_resources);
    snprintf(g_config_path, sizeof(g_config_path),  "%s/config.json",   g_resources);

    xp_mkdir(g_resources);
    xp_mkdir(g_web_root);
    config_load();

#ifdef _WIN32
    WSADATA wsd; WSAStartup(MAKEWORD(2, 2), &wsd);
#endif

    int root_idx = XPLMAppendMenuItem(XPLMFindPluginsMenu(), "XPanel Server", NULL, 1);
    g_menu = XPLMCreateMenu("XPanel Server", XPLMFindPluginsMenu(), root_idx, menu_handler, NULL);
    menu_rebuild();
    log_msg("Plugin loaded. Root: %s", g_plugin_root);
    return 1;
}

PLUGIN_API void XPluginStop(void) {
    server_stop();
#ifdef _WIN32
    WSACleanup();
#endif
    xp_mutex_free(&g_cs);
    log_msg("Plugin unloaded");
}

PLUGIN_API int XPluginEnable(void)  { server_start(); menu_rebuild(); return 1; }
PLUGIN_API void XPluginDisable(void) { server_stop();  menu_rebuild(); }
PLUGIN_API void XPluginReceiveMessage(XPLMPluginID from, int msg, void *param) {}
