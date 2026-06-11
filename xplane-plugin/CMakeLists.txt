# cmake_minimum_required(VERSION 3.15)
cmake_minimum_required(VERSION 3.15)
project(XPanelServer C)
set(CMAKE_C_STANDARD 11)

# ── SDK path ──────────────────────────────────────────────────────────────────
set(SDK_DIR "${CMAKE_SOURCE_DIR}/sdk" CACHE PATH "Path to X-Plane Plugin SDK")

if(NOT EXISTS "${SDK_DIR}/CHeaders/XPLM/XPLMPlugin.h")
    message(FATAL_ERROR
        "\nX-Plane SDK not found at: ${SDK_DIR}\n"
        "Download from https://developer.x-plane.com/sdk/plugin-sdk/\n"
        "and extract to xplane-plugin/sdk/\n")
endif()

# ── Detect platform ───────────────────────────────────────────────────────────
if(WIN32)
    set(XP_PLATFORM "win_x64")
elseif(APPLE)
    set(XP_PLATFORM "mac_x64")
else()
    set(XP_PLATFORM "lin_x64")
endif()

message(STATUS "Building for X-Plane platform: ${XP_PLATFORM}")

# ── Download civetweb and cJSON source files only ────────────────────────────
# We call FetchContent_Populate() directly instead of FetchContent_MakeAvailable()
# so that add_subdirectory() is NEVER called on either library.
# Both are single .c files compiled directly into our plugin target.
include(FetchContent)

FetchContent_Declare(civetweb
    GIT_REPOSITORY https://github.com/civetweb/civetweb.git
    GIT_TAG        v1.16
    GIT_SHALLOW    TRUE
)
FetchContent_GetProperties(civetweb)
if(NOT civetweb_POPULATED)
    FetchContent_Populate(civetweb)
    # intentionally NOT calling add_subdirectory — we only need civetweb.c
endif()

FetchContent_Declare(cjson
    GIT_REPOSITORY https://github.com/DaveGamble/cJSON.git
    GIT_TAG        v1.7.18
    GIT_SHALLOW    TRUE
)
FetchContent_GetProperties(cjson)
if(NOT cjson_POPULATED)
    FetchContent_Populate(cjson)
    # intentionally NOT calling add_subdirectory — we only need cJSON.c
endif()

# ── Plugin target ─────────────────────────────────────────────────────────────
add_library(XPanelServer SHARED
    src/XPanelServer.c
    ${civetweb_SOURCE_DIR}/src/civetweb.c
    ${cjson_SOURCE_DIR}/cJSON.c
)

target_include_directories(XPanelServer PRIVATE
    "${SDK_DIR}/CHeaders/XPLM"
    "${SDK_DIR}/CHeaders/Widgets"
    "${SDK_DIR}/CHeaders/Wrappers"
    "${civetweb_SOURCE_DIR}/include"
    "${cjson_SOURCE_DIR}"
)

# Common compile definitions for all platforms
target_compile_definitions(XPanelServer PRIVATE
    NO_SSL=1
    NO_CGI=1
    USE_WEBSOCKET=1
    USE_IPV6=0
)

# ── Output path helper ────────────────────────────────────────────────────────
# X-Plane requires:  <PluginName>/<platform>/XPanelServer.xpl
# where <platform>  is  win_x64 | mac_x64 | lin_x64
set(_DIST "${CMAKE_BINARY_DIR}/dist/XPanelServer/${XP_PLATFORM}")

# ── Windows x64 ───────────────────────────────────────────────────────────────
if(WIN32)
    target_compile_definitions(XPanelServer PRIVATE
        XPLM200=1 XPLM210=1 XPLM300=1 XPLM301=1 XPLM303=1 XPLM400=1
        IBM=1
        _WIN32_WINNT=0x0602
        WIN32_LEAN_AND_MEAN
        _CRT_SECURE_NO_WARNINGS
    )

    target_link_libraries(XPanelServer PRIVATE
        "${SDK_DIR}/Libraries/Win/XPLM_64.lib"
        "${SDK_DIR}/Libraries/Win/XPWidgets_64.lib"
        ws2_32
    )

    # Per-config output dirs prevent MSBuild from appending "RelWithDebInfo/" etc.
    set_target_properties(XPanelServer PROPERTIES
        OUTPUT_NAME                             "XPanelServer"
        SUFFIX                                  ".xpl"
        PREFIX                                  ""
        RUNTIME_OUTPUT_DIRECTORY                "${_DIST}"
        RUNTIME_OUTPUT_DIRECTORY_DEBUG          "${_DIST}"
        RUNTIME_OUTPUT_DIRECTORY_RELEASE        "${_DIST}"
        RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO "${_DIST}"
        RUNTIME_OUTPUT_DIRECTORY_MINSIZEREL     "${_DIST}"
        MSVC_RUNTIME_LIBRARY                    "MultiThreadedDLL"
    )
endif()

# ── macOS x64 / arm64 ─────────────────────────────────────────────────────────
if(APPLE)
    target_compile_definitions(XPanelServer PRIVATE
        XPLM200=1 XPLM210=1 XPLM300=1 XPLM301=1 XPLM303=1 XPLM400=1
        APL=1
    )

    # X-Plane SDK frameworks
    target_include_directories(XPanelServer PRIVATE
        "${SDK_DIR}/Libraries/Mac"
    )

    # civetweb needs pthreads on macOS
    find_package(Threads REQUIRED)

    # -undefined dynamic_lookup lets XPLM/XPWidgets symbols resolve at load time.
    # Use target_link_libraries for framework flags so CMake handles quoting correctly.
    target_link_libraries(XPanelServer PRIVATE
        Threads::Threads
        "-F${SDK_DIR}/Libraries/Mac"
        "-framework XPLM"
        "-framework XPWidgets"
        "-framework OpenGL"
        "-undefined dynamic_lookup"
    )

    # Build a universal binary if both toolchains are available
    # (override with -DCMAKE_OSX_ARCHITECTURES="x86_64" or "arm64" for single-arch)
    if(NOT CMAKE_OSX_ARCHITECTURES)
        set(CMAKE_OSX_ARCHITECTURES "x86_64" CACHE STRING "" FORCE)
    endif()

    set_target_properties(XPanelServer PROPERTIES
        OUTPUT_NAME    "XPanelServer"
        SUFFIX         ".xpl"
        PREFIX         ""
        LIBRARY_OUTPUT_DIRECTORY "${_DIST}"
    )
endif()

# ── Linux x64 ─────────────────────────────────────────────────────────────────
if(UNIX AND NOT APPLE)
    target_compile_definitions(XPanelServer PRIVATE
        XPLM200=1 XPLM210=1 XPLM300=1 XPLM301=1 XPLM303=1 XPLM400=1
        LIN=1
        _GNU_SOURCE
    )

    target_compile_options(XPanelServer PRIVATE
        -fPIC
        -fvisibility=hidden   # only export XPlugin* symbols; everything else is hidden
        -Wall
        -Wno-deprecated-declarations
    )

    # civetweb needs pthreads; XPLM symbols are injected by X-Plane at load time
    find_package(Threads REQUIRED)
    target_link_libraries(XPanelServer PRIVATE Threads::Threads)

    # XPLM symbols are resolved at load time by X-Plane (no import lib needed).
    # --allow-shlib-undefined suppresses link-time errors for those symbols.

    set_target_properties(XPanelServer PROPERTIES
        OUTPUT_NAME    "XPanelServer"
        SUFFIX         ".xpl"
        PREFIX         ""
        LIBRARY_OUTPUT_DIRECTORY "${_DIST}"
    )
endif()

# ── Post-build: copy web app into plugin Resources/web/ ───────────────────────
set(WEB_SRC "${CMAKE_SOURCE_DIR}/../xplane-panel")
set(WEB_DST "${CMAKE_BINARY_DIR}/dist/XPanelServer/Resources/web")

add_custom_command(TARGET XPanelServer POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "${WEB_DST}"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different "${WEB_SRC}/index.html"    "${WEB_DST}/"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different "${WEB_SRC}/panel.html"    "${WEB_DST}/"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different "${WEB_SRC}/manifest.json" "${WEB_DST}/"
    COMMAND ${CMAKE_COMMAND} -E copy_directory    "${WEB_SRC}/js"            "${WEB_DST}/js"
    COMMAND ${CMAKE_COMMAND} -E copy_directory    "${WEB_SRC}/images"        "${WEB_DST}/images"
    COMMENT "Copying web app into dist/XPanelServer/Resources/web/"
)

message(STATUS "")
message(STATUS "=======================================================")
message(STATUS " Platform : ${XP_PLATFORM}")
message(STATUS " Output   : ${CMAKE_BINARY_DIR}/dist/XPanelServer/")
message(STATUS " Install to: <X-Plane 12>/Resources/plugins/")
message(STATUS "=======================================================")
message(STATUS "")
