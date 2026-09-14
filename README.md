<div align="center">

# cursor-spotlight

**Dim the screen and leave a soft-edged spotlight around the mouse pointer — with optional zoom**

[![GNOME](https://img.shields.io/badge/GNOME_Shell-45--51-4A86CF?style=flat&logo=gnome&logoColor=white)](https://www.gnome.org/)
[![extensions.gnome.org](https://img.shields.io/badge/extensions.gnome.org-install-4A86CF?style=flat)](https://extensions.gnome.org/)
[![Wayland](https://img.shields.io/badge/Wayland-FFBC00?style=flat)](https://wayland.freedesktop.org/)
[![GJS](https://img.shields.io/badge/GJS-ESM-729FCF?style=flat&logo=javascript&logoColor=white)](https://gjs.guide/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)

</div>

A GNOME Shell extension for presentations, screencasts, and tired eyes:
one hotkey dims everything except a configurable area around the pointer
that follows the mouse. A second hotkey does the same while held, for
momentary, push-to-talk-style highlighting. Another magnifies that area
with a live GPU-composited zoom lens.

---

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Hotkeys](#hotkeys)
- [Settings](#settings)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Repository Layout](#repository-layout)
- [Development](#development)
- [Translations](#translations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

---

## Install

From [extensions.gnome.org](https://extensions.gnome.org/) (once published), or
from source:

```bash
git clone https://github.com/Star-Barsuk/cursor-spotlight.git
cd cursor-spotlight

make install   # build + copy into ~/.local/share/gnome-shell/extensions
# Log out and back in (Wayland picks up new extensions on login)
gnome-extensions enable cursor-spotlight@star-barsuk
```

## Quick Start

Press `Ctrl+F5` — the screen dims, the spotlight follows your pointer.
Press it again to switch off.

---

## Hotkeys

| Hotkey (default) | Action |
|------------------|--------|
| `Ctrl+F5` | Toggle the spotlight on/off |
| `Ctrl+Shift+F5` | Hold — spotlight only while the key is held (GNOME 48+) |
| `Ctrl+F6` | Toggle zoom mode (only while the spotlight is active) |

All bindings are remappable in the extension preferences and may share
the same key combination. Any binding can be cleared with `Backspace`,
which disables it.

Toggle and hold are independent: holding the momentary key does not cancel
a latched toggle, and vice versa. Hold requires GNOME Shell 48 or newer
(older shells do not deliver key-release events to extensions).

---

## Settings

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `toggle` | hotkey | `Ctrl+F5` | Spotlight on/off |
| `hold` | hotkey | `Ctrl+Shift+F5` | Spotlight only while held (GNOME 48+) |
| `toggle-zoom` | hotkey | `Ctrl+F6` | Zoom mode on/off |
| `dim-opacity` | 0–100 | 75 | Darkness of the overlay, in percent |
| `focus-radius` | 1–10000 px | 130 | Radius of the undimmed spotlight circle |
| `edge-softness` | 0–2000 px | 56 | Soft transition width at the edge |
| `zoom-factor` | 1.0–5.0 | 1.25 | Zoom multiplier (1.0 = no zoom) |

All values apply immediately, no restart needed. The bounds shown above are
enforced both by the preferences UI and by the extension, using the shared
constants in `lib/constants.js`.

---

## How It Works

- A full-stage `St.DrawingArea` paints black at `dim-opacity`, then cuts
  a soft-edged circular hole (`Cairo.RadialGradient` + `DEST_OUT`)
  under the pointer. It lives in `lib/overlay.js`.
- Zoom is a live `Clutter.Clone` of `Main.layoutManager.uiGroup` sitting below
  the overlay: the magnified content shows through the hole while
  everything else stays dimmed. The lens is GPU-composited — tracking
  only moves it, never repaints it (`lib/lens.js`).
- The clone is a rectangle, so it is clipped to the same circle by a
  fragment shader: lens alpha is multiplied by the radial falloff used
  for the spotlight hole, and the two soft edges line up seamlessly.
  The shader lives in `lib/lens-effect.js` and uses `Shell.GLSLEffect`
  on GNOME 45–50 and `Clutter.ShaderEffect` on GNOME 51+ (feature
  detected, single call site).
- `lib/spotlight.js` is the controller: it owns the runtime state, the
  cached settings, the 60 fps pointer tracker (`lib/pointer-tracker.js`)
  and the visibility rules for the overview and lock screen.
- The overlay spans the union of all monitors (correct for monitors
  placed left or above the primary), stays hidden while the overview or
  lock screen is visible, and never captures input (`reactive: false`).
- Performance: the pointer loop runs only while active, repaints only
  on movement or change, settings are cached out of the paint path, and
  the gradient is reused while its shape is unchanged.

---

## Requirements

| Requirement | Version | Purpose |
|-------------|---------|---------|
| GNOME Shell | 45–51 | Extension API target (`metadata.json`) |
| Wayland session | any | Primary target (X11 untested) |
| `glib-compile-schemas` | any | `make build` (compiled into `schemas/`) |
| `gettext` (`xgettext`, `msgfmt`) | any | `make pot` and translation packaging (optional) |

---

## Repository Layout

```text
.
├── LICENSE                       # MIT
├── README.md
├── Makefile                      # build / install / enable / zip / lint / pot
├── metadata.json                 # uuid cursor-spotlight@star-barsuk
├── extension.js                  # entry: keybindings + controller wiring
├── prefs.js                      # preferences entry
├── eslint.config.js              # lint rules for the JS sources
├── lib/                          # shell-process modules (no UI imports)
│   ├── constants.js              # shared bounds/defaults + clamps
│   ├── utils.js                  # guarded error handling + settings reads
│   ├── pointer-tracker.js        # pointer polling loop
│   ├── overlay.js                # St.DrawingArea + Cairo dim/hole
│   ├── lens.js                   # Clutter.Clone zoom lens
│   ├── lens-effect.js            # GPU circle mask (45-50 / 51+)
│   ├── spotlight.js              # controller: state, visibility, resources
│   └── shell-version.js          # shell version capability helpers
├── prefs/                        # preferences-process widgets
│   ├── keybinding-row.js         # keybinding row + capture dialog
│   └── spin-rows.js              # integer/double spin rows
├── po/                           # gettext translation template
│   ├── POTFILES.in
│   ├── LINGUAS
│   └── cursor-spotlight.pot
├── tools/
│   └── syntax-check.mjs          # dev-only lint helper (not shipped)
├── schemas/
│   └── org.gnome.shell.extensions.cursor-spotlight.gschema.xml
└── docs/
    └── CHANGELOG.md              # release history
```

---

## Development

```bash
make build    # glib-compile-schemas schemas
make install  # build + copy into ~/.local/share/gnome-shell/extensions
make enable   # gnome-extensions enable cursor-spotlight@star-barsuk
make zip      # distribution archive for extensions.gnome.org
make lint     # syntax-check all JS with gjs (SpiderMonkey) + eslint
make pot      # regenerate po/cursor-spotlight.pot with xgettext
```

Changes to the extension require re-login (Wayland) or
`gnome-shell --restart`-style reload; on the nested/dev shell use the
debugging workflow from the GNOME documentation.

---

## Translations

User-visible strings are wrapped with `gettext` (`_()`), and the gettext
domain is declared in `metadata.json`. To add a language:

1. `make pot` to refresh `po/cursor-spotlight.pot`.
2. Create `po/<lang>.po` (e.g. `po/de.po`) with a PO editor.
3. Add the language code to `po/LINGUAS`.
4. `make zip` / `make install` picks up compiled translations via
   `gnome-extensions pack --podir=po`.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Hotkey does nothing | Another app grabbed the combo — remap it in preferences; binding needs a modifier (`Ctrl`/`Super`/…) to fire globally |
| No visible dimming | `dim-opacity` is 0, or the overview/lock screen is active (overlay hides there by design) |
| Zoom hotkey does nothing | Zoom works only while the spotlight is on — press `Ctrl+F5` first |
| Spotlight lags on HiDPI | Expected one-frame tracking granularity; shrink `focus-radius` to reduce repaint area |
| Overlay visible in overview | Should hide automatically — check the journal for errors (below) |
| Extension in ERROR state after login | Broken install — `make install`, log out/in |

Live log for diagnosis:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i spotlight
```

---

## Contributing

Issues and pull requests are welcome at
<https://github.com/Star-Barsuk/cursor-spotlight>.

- Keep `extension.js` / `prefs.js` as thin entry points; put logic in
  `lib/` (shell process) or `prefs/` (preferences process).
- Shared modules must not import `St`, `Clutter`, `Gtk`, `Gdk` or `Adw`.
- Run `make lint` before opening a pull request.

---

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md).

---

## License

[MIT](LICENSE) © 2026 Star-Barsuk
