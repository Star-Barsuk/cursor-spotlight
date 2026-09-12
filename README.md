<div align="center">

# cursor-spotlight

**Dim the screen and leave a soft-edged spotlight around the mouse pointer — with optional zoom**

[![GNOME](https://img.shields.io/badge/GNOME_Shell-45--50-4A86CF?style=flat&logo=gnome&logoColor=white)](https://www.gnome.org/)
[![Wayland](https://img.shields.io/badge/Wayland-FFBC00?style=flat)](https://wayland.freedesktop.org/)
[![GJS](https://img.shields.io/badge/GJS-ESM-729FCF?style=flat&logo=javascript&logoColor=white)](https://gjs.guide/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)

</div>

A GNOME Shell extension for presentations, screencasts, and tired eyes:
one hotkey dims everything except a configurable area around the pointer
that follows the mouse. A second hotkey magnifies that area with a live
GPU-composited zoom lens.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Hotkeys](#hotkeys)
- [Settings](#settings)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Repository Layout](#repository-layout)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Versions](#versions)
- [License](#license)

---

## Quick Start

```bash
# 1. Build + install into ~/.local/share/gnome-shell/extensions
make install

# 2. Log out and back in (Wayland picks up new extensions on login)

# 3. Enable
gnome-extensions enable cursor-spotlight@star-barsuk
```

Press `Ctrl+F5` — the screen dims, the spotlight follows your pointer.
Press it again to switch off.

---

## Hotkeys

| Hotkey (default) | Action |
|------------------|--------|
| `Ctrl+F5` | Toggle the spotlight on/off |
| `Ctrl+F6` | Toggle zoom mode (only while the spotlight is active) |

Both bindings are remappable in the extension preferences and may share
the same key combination.

---

## Settings

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `toggle` | hotkey | `Ctrl+F5` | Spotlight on/off |
| `toggle-zoom` | hotkey | `Ctrl+F6` | Zoom mode on/off |
| `dim-opacity` | 0–100 | 75 | Darkness of the overlay, in percent |
| `focus-width` | ≥ 1 px | 260 | Undimmed area width |
| `focus-height` | ≥ 1 px | 180 | Undimmed area height |
| `edge-softness` | ≥ 0 px | 56 | Soft transition width at the edge |
| `zoom-factor` | 1.0–5.0 | 1.25 | Zoom multiplier (1.0 = no zoom) |

All values apply immediately, no restart needed.

---

## How It Works

- A full-stage `St.DrawingArea` paints black at `dim-opacity`, then cuts
  a soft-edged elliptical hole (`Cairo.RadialGradient` + `DEST_OUT`)
  under the pointer.
- Zoom is a live `Clutter.Clone` of `global.window_group` sitting below
  the overlay: the magnified content shows through the hole while
  everything else stays dimmed. The lens is GPU-composited — tracking
  only moves it, never repaints it.
- The overlay spans the union of all monitors (correct for monitors
  placed left or above the primary), stays hidden while the overview or
  lock screen is visible, and never captures input (`reactive: false`).
- Performance: 60 fps pointer loop runs only while active, repaints only
  on movement or change, settings are cached out of the paint path, and
  the gradient is reused while its shape is unchanged.

---

## Requirements

| Requirement | Version | Purpose |
|-------------|---------|---------|
| GNOME Shell | 45–50 | Extension API target (`metadata.json`) |
| Wayland session | any | Primary target (X11 untested) |
| `glib-compile-schemas` | any | `make build` (compiled into `schemas/`) |

---

## Repository Layout

```text
.
├── LICENSE                       # MIT
├── README.md
├── Makefile                      # build / install / enable / zip / lint
├── metadata.json                 # uuid cursor-spotlight@star-barsuk
├── extension.js                  # overlay + entry (SpotlightOverlay, enable/disable)
├── prefs.js                      # preferences window (hotkeys, sizes, zoom)
├── schemas/
│   └── org.gnome.shell.extensions.cursor-spotlight.gschema.xml
└── docs/
    ├── SPEC.md                   # technical specification
    └── ROADMAP.md                # phases: core, zoom, polish
```

---

## Development

```bash
make build    # glib-compile-schemas schemas
make install  # build + copy into ~/.local/share/gnome-shell/extensions
make enable   # gnome-extensions enable cursor-spotlight@star-barsuk
make zip      # distribution archive for extensions.gnome.org
make lint     # syntax check (gjs/eslint when available)
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Hotkey does nothing | Another app grabbed the combo — remap it in preferences; binding needs a modifier (`Ctrl`/`Super`/…) to fire globally |
| No visible dimming | `dim-opacity` is 0, or the overview/lock screen is active (overlay hides there by design) |
| Zoom hotkey does nothing | Zoom works only while the spotlight is on — press `Ctrl+F5` first |
| Spotlight lags on HiDPI | Expected one-frame tracking granularity; shrink `focus-width`/`focus-height` to reduce repaint area |
| Overlay visible in overview | Should hide automatically — check the journal for errors (below) |
| Extension in ERROR state after login | Broken install — `make install`, log out/in |

Live log for diagnosis:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i spotlight
```

---

## Versions

| Commit | Date | Changes |
|--------|------|---------|
| `876c681` | 2026-09-11 | Performance: cached settings and gradient, no-op repaint skip, multi-monitor geometry fix |
| `0d2f33d` | 2026-09-11 | Zoom lens via `Clutter.Clone`, overview handling, docs |
| `7afea3f` | 2026-09-08 | Initial release: overlay, pointer tracking, hotkey, preferences |

---

## License

[MIT](LICENSE) © 2026 Star-Barsuk
