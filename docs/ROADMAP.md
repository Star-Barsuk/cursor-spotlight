# Cursor Spotlight — Roadmap

## Phase 1: Core spotlight

- [x] Settings schema (toggle, dim-opacity, focus-width, focus-height, edge-softness)
- [x] Overlay rendering with soft-edged spotlight
- [x] Pointer tracking loop
- [x] Hotkey toggle
- [x] Preferences UI (prefs.js)
- [x] Makefile (build, install, uninstall, enable, disable, zip, lint)

## Phase 2: Zoom

- [ ] Add `toggle-zoom` keybinding setting (default `<Ctrl>F6`)
- [ ] Add `zoom-factor` setting (1.0–5.0, default 1.25)
- [ ] Register zoom hotkey in extension entry
- [ ] Implement zoom toggle state
- [ ] Apply zoom transform in Cairo rendering (centered on pointer)
- [ ] Add zoom toggle to preferences UI
- [ ] Test: zoom activates only when spotlight is active
- [ ] Test: both hotkeys can share the same key combination

## Phase 3: Polish

- [ ] Smooth zoom transition (optional, future)
- [ ] Per-monitor support (optional, future)
- [ ] State persistence across shell restarts (optional, future)
