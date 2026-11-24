# Contributing

Contributions are welcome — bug fixes, new instruments, improvements to existing ones, or documentation.

## How to contribute

1. **Open an issue first** for anything beyond a trivial fix, so we can align on the approach before you invest time coding.
2. Fork the repo, create a branch, make your changes.
3. Open a Pull Request with a clear description of what changed and why.

## Building the plugin

See [xplane-plugin/README.md](xplane-plugin/README.md) for build instructions (CMake, Windows x64).

The web app (`xplane-panel/`) requires no build step — edit JS files directly and reload the browser.

## Adding a new instrument

Instruments are auto-discovered: drop a `.js` file into `xplane-panel/js/instruments/` (or into a sub-folder such as `King Air 350/`, which becomes its own palette section) that exports a `BaseInstrument` subclass and a `META` object. You do **not** edit `index.html` or `panel.js`. See [ARCHITECTURE.md → Adding a new instrument](ARCHITECTURE.md#adding-a-new-instrument) for the `META` fields, touch buttons and the render pipeline.

Please:
- **Add new files — don't modify the stock instruments** to suit one aircraft. Put aircraft-specific versions in a section folder with their own `type` (e.g. `b350_airspeed`).
- Never rename a published `type` — saved panels reference it.
- Leave out backups, scratch files and notes (`* - backup.js`, `.txt` dataref lists); put useful notes in a comment at the top of the instrument file.
- **Don't hardcode per-aircraft workarounds.** Declare everything the instrument reads in `DEFAULTS` (so users can override it in the sidebar), and describe its needs in `META` instead: `requires` (e.g. `'the King Air 350 add-on'`), `optionalDatarefs` for keys it can live without, `datarefCheck: 'any'` when it supports alternative add-on dataref sets. If something differs per aircraft (like generic light slots), make it a `META.options` field.
- **Check it in the Panel Manager with X-Plane running:** with the target aircraft loaded your instrument must not be red — a red tile means a dataref name is wrong or missing from `DEFAULTS`. With another aircraft loaded it should be red with a helpful hover message, not silently blank.

## Code style

- Vanilla ES modules, no bundler, no dependencies.
- Canvas2D for all rendering — no SVG or third-party graphics libraries.
- All colours via `this._theme.*` on generic gauges. Aircraft-replica glass displays may use their real colours, but draw self-lit elements in `_renderEmissive()`.
- Keep one instrument per file; export a named class and a `DEFAULTS` object.
