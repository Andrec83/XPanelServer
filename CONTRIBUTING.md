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

[ARCHITECTURE.md](ARCHITECTURE.md) covers the full instrument lifecycle, theme system, ambient effects, and the three-location dataref registration pattern. Start there.

## Code style

- Vanilla ES modules, no bundler, no dependencies.
- Canvas2D for all rendering — no SVG or third-party graphics libraries.
- All colours via `this._theme.*` — no hardcoded hex values in instrument drawing code.
- Keep one instrument per file; export a named class and a `DEFAULTS` object.
