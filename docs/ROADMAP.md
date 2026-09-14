# Cursor Spotlight — Roadmap

## Phase 1: Core spotlight

- [x] Settings schema (toggle, dim-opacity, focus-radius, edge-softness)
- [x] Overlay rendering with soft-edged spotlight
- [x] Pointer tracking loop
- [x] Hotkey toggle
- [x] Preferences UI (prefs.js)
- [x] Makefile (build, install, uninstall, enable, disable, zip, lint)

## Phase 2: Zoom

- [x] Add `toggle-zoom` keybinding setting (default `<Ctrl>F6`)
- [x] Add `zoom-factor` setting (1.0–5.0, default 1.25)
- [x] Register zoom hotkey in extension entry
- [x] Implement zoom toggle state
- [x] Live magnifier lens via `Clutter.Clone` of `global.window_group` (Cairo stage readout is not available)
- [x] Add zoom toggle to preferences UI
- [x] Test: zoom activates only when spotlight is active
- [x] Test: both hotkeys can share the same key combination

## Phase 3: Circular lens and version-proofing

- [x] Circular spotlight (`focus-radius`)
- [x] Clip the zoom lens to the circle with a GPU fragment shader
- [x] `lib/lens-effect.js`: `Shell.GLSLEffect` (45-50) and `Clutter.ShaderEffect` (51+) behind feature detection
- [x] `lib/shell-version.js`: shared version helpers
- [x] `Adw.AlertDialog` preference dialog with `Adw.MessageDialog` fallback
- [x] Declare GNOME Shell 51 support

## Phase 4: Polish

- [ ] Smooth zoom transition (optional, future)
- [ ] Per-monitor support (optional, future)
- [ ] State persistence across shell restarts (optional, future)
