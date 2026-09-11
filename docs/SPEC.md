# Cursor Spotlight — Technical Specification

This document is a self-contained specification for building a GNOME Shell
extension from scratch. It describes requirements, architecture, and the exact
GNOME Shell APIs to use. No part of this document or the resulting code should
copy any existing implementation; only standard GNOME / Clutter / Cairo APIs
are used.

## 1. Project identity

| Item            | Value                                            |
| --------------- | ------------------------------------------------ |
| Display name    | Cursor Spotlight                                 |
| Extension UUID  | `cursor-spotlight@star-barsuk`                   |
| Schema id       | `org.gnome.shell.extensions.cursor-spotlight`    |
| Schema path     | `/org/gnome/shell/extensions/cursor-spotlight/`  |
| License         | MIT (Copyright Star-Barsuk)                      |

The UUID contains the author suffix `@star-barsuk`, which guarantees uniqueness
in the extension system. Display names are not required to be unique.

## 2. Purpose

A GNOME Shell extension that, when a configurable global hotkey is pressed,
dims the entire screen and leaves a configurable, soft-edged area around the
mouse pointer undimmed (the "spotlight"). The spotlight follows the pointer.
An optional zoom mode magnifies the spotlighted area by a configurable factor.
Pressing the hotkey again hides the spotlight. The state is a toggle: the
spotlight stays visible until the hotkey is pressed again.

## 3. Non-goals

- No support for hardware presenter devices.
- No per-monitor independent control (the overlay spans the logical stage).
- No persistence of the on/off state across shell restarts (always starts off).

## 4. Target environment

- GNOME Shell 45 through 50, Wayland session (primary).
- GJS, ESM extension format.
- GI modules imported via `gi://`; shell internals imported via
  `resource:///org/gnome/shell/...`.

## 5. Architecture

Repository layout:

```
new_project/
├── LICENSE
├── README.md
├── Makefile
├── metadata.json
├── extension.js
├── prefs.js
├── schemas/
│   └── org.gnome.shell.extensions.cursor-spotlight.gschema.xml
└── docs/
    ├── SPEC.md
    └── ROADMAP.md
```

Runtime responsibilities are split into two parts inside `extension.js`:

1. **Extension entry** (a class extending `Extension`) — reads settings,
   creates the overlay, starts pointer tracking, registers the hotkey, and
   cleans everything up on `disable()`.
2. **Overlay class** — owns the `St.DrawingArea`, paints the dim layer and the
   spotlight hole, and keeps it positioned under the pointer.

## 6. Settings schema

`schemas/org.gnome.shell.extensions.cursor-spotlight.gschema.xml` defines these
keys:

| Key             | Type | Range          | Default       | Meaning                                    |
| --------------- | ---- | -------------- | ------------- | ------------------------------------------ |
| `toggle`        | `as` | —              | `['<Ctrl>F5']`| Keybinding that toggles the spotlight      |
| `toggle-zoom`   | `as` | —              | `['<Ctrl>F6']`| Keybinding that toggles zoom mode          |
| `dim-opacity`   | `i`  | 0–100          | 75            | Darkness of the overlay, in percent        |
| `focus-width`   | `i`  | >= 1           | 260           | Undimmed area width, in pixels             |
| `focus-height`  | `i`  | >= 1           | 180           | Undimmed area height, in pixels            |
| `edge-softness` | `i`  | >= 0           | 56            | Soft transition width at the edge, pixels  |
| `zoom-factor`   | `d`  | 1.0–5.0        | 1.25          | Zoom multiplier (1.0 = no zoom)            |

`toggle` and `toggle-zoom` are keybinding keys (type `as`, a string array). The
accelerator format is the GTK accelerator syntax: modifier prefixes `<Ctrl>`,
`<Alt>`, `<Shift>`, `<Super>`, `<Primary>` followed by a key name such as `F5`,
`F6`, `space`, `a`. A modifier prefix must be present so that the binding fires
globally even when a window has keyboard focus (unmodified keys are delivered
to the focused application first). Both bindings can share the same key
combination; the extension checks active state independently.

## 7. Behavior

### enable()

1. Obtain settings via `this.getSettings()`.
2. Create the overlay object.
3. Start the pointer-tracking loop.
4. Register the hotkeys with the shell (`toggle` and `toggle-zoom`).

### Hotkey press

Each press flips the active state (on -> off, off -> on). When it becomes
active, the overlay is shown; when inactive, it is hidden.

### Zoom hotkey press

When the spotlight is active, pressing the zoom hotkey toggles zoom mode.
Zoom mode shows a live magnified lens of the spotlighted area: a
`Clutter.Clone` of `global.window_group` (app windows + background, but not
the dim overlay itself, so there is no feedback loop) sits directly below the
overlay. The overlay dims the lens everywhere except the spotlight hole, where
the magnified content shows through. The lens is GPU-composited: pointer
tracking only updates its scale/position, never repaints it. The lens is
rectangular (`focus-width` by `focus-height`, centered on the pointer) and is
hidden together with the overlay while the overview is visible.

When the spotlight is inactive, pressing the zoom hotkey has no effect.

### While active

- The overlay is visible and covers the whole stage.
- The overlay is hidden while the overview is visible (Super / Show Apps)
  and reshown when the overview hides, without changing the toggle state.
- Every tick, the pointer position is read and the overlay repaints so the
  spotlight hole follows the pointer.
- If zoom is active, a live `Clutter.Clone` lens below the overlay shows the
  spotlighted area magnified by `zoom-factor`; the rest of the screen
  (including the lens edges outside the hole) remains dimmed.
- Settings changes (dim level, focus size, edge softness, zoom factor) trigger
  a repaint.

### disable()

1. Remove the hotkeys (`toggle` and `toggle-zoom`).
2. Reset zoom state to inactive.
3. Stop the pointer-tracking loop.
4. Disconnect all settings signal handlers.
5. Destroy the overlay actor.

## 8. Rendering (Cairo)

The overlay is a full-stage `St.DrawingArea` added as chrome so it sits above
application windows. Rendering happens in the `repaint` signal handler.

Algorithm:

1. Fill the whole surface with black at `alpha = dim-opacity / 100`, using
   `Cairo.Operator.SOURCE`.
2. Compute the pointer center in surface coordinates. Account for the HiDPI
   scale factor: `scale = surfaceSize / actorSize`.
3. Scale the context so that drawing a unit circle produces an ellipse with
   radii `(focus-width / 2, focus-height / 2)`.
4. Create a `Cairo.RadialGradient` from the center (inner radius 0) to outer
   radius 1, with color stops:
   - stop 0.0: black, alpha 1.0
   - stop `innerStop`: black, alpha 1.0
   - stop 1.0: black, alpha 0.0
   where `innerStop = max(0, 1 - feather / minRadius)` and
   `feather = min(minRadius, edge-softness * scale)`, `minRadius` being the
   smaller of the two ellipse radii.
5. Set `Cairo.Operator.DEST_OUT` and fill the unit circle.

If zoom is active, apply a second pass: save the context, translate to the
pointer, scale by `zoom-factor`, translate back, and redraw the spotlight
content from the stage texture. The dim layer and the gradient mask remain
unchanged; only the content inside the spotlight hole is magnified.

NOTE: this paragraph describes the original Cairo-based idea, which is not
implementable (no public stage-to-cairo API exists). The actual implementation
uses a `Clutter.Clone` lens actor below the overlay, as described in
"Zoom hotkey press" above.

Because `DEST_OUT` removes destination pixels proportionally to source alpha,
the opaque center fully clears the dim layer (revealing the screen) while the
gradient fades to zero at the edge, producing a soft-edged spotlight.

The black fill color and the gradient both use `alpha` values; no other colors
are needed.

## 9. Pointer tracking

- Read the pointer with `global.get_pointer()`, which returns an array whose
  first two elements are the `x` and `y` coordinates on the stage.
- A repeating timer (interval 16 ms) runs while the extension is enabled.
  The timer always updates the stored pointer position, but calls
  `queue_repaint()` only when the spotlight is active.
- Geometry: the overlay is sized to `global.stage.width` by
  `global.stage.height` and positioned at `(0, 0)`.

## 10. Keybinding

Use the shell window manager keybinding API for both bindings:

```js
Main.wm.addKeybinding(
    'toggle',
    settings,
    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
    handler
);

Main.wm.addKeybinding(
    'toggle-zoom',
    settings,
    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
    zoomHandler
);
```

- The binding name `'toggle'` must match the settings key name.
- The binding name `'toggle-zoom'` must match the settings key name.
- Remove them on disable with `Main.wm.removeKeybinding('toggle')` and
  `Main.wm.removeKeybinding('toggle-zoom')`.
- `Meta` and `Shell` are GI modules imported from `gi://Meta` and `gi://Shell`.
- Both bindings can share the same key combination; the extension checks
  active state independently and each handler acts on its own toggle.

## 11. GNOME Shell API notes (version-specific, must follow)

- `Main.layoutManager.addChrome(actor)` — in GNOME Shell 50 the call takes no
  options object; do **not** pass an `affectsInputRegion` option (it no longer
  exists and raises "Unrecognized parameter").
- The overlay actor must be `reactive: false` so it never captures input.
- `St.DrawingArea` repaint handler receives the area; call
  `area.get_context()` for the Cairo context, `area.get_surface_size()` for
  `[width, height]`, and use `area.width` / `area.height` for actor size.
- ESM imports (GNOME 45+):

  ```js
  import Cairo from 'cairo';
  import Clutter from 'gi://Clutter';
  import GLib from 'gi://GLib';
  import Meta from 'gi://Meta';
  import Shell from 'gi://Shell';
  import St from 'gi://St';
  import * as Main from 'resource:///org/gnome/shell/ui/main.js';
  import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
  ```

- `metadata.json` fields: `uuid`, `name`, `description`, `shell-version`
  (array `["45","46","47","48","49","50"]`), `settings-schema` (the schema id).
- `prefs.js` exports `default class extends ExtensionPreferences` and builds the
  preferences UI with GTK/Adw widgets bound to the schema.

## 12. Build and install (Makefile)

Provide a `Makefile` with these targets:

| Target      | Action                                                     |
| ----------- | ---------------------------------------------------------- |
| `build`     | `glib-compile-schemas schemas`                             |
| `install`   | `build` + copy project files into `~/.local/share/gnome-shell/extensions/cursor-spotlight@star-barsuk` |
| `uninstall` | remove the installed extension directory                   |
| `enable`    | `gnome-extensions enable cursor-spotlight@star-barsuk`     |
| `disable`   | `gnome-extensions disable cursor-spotlight@star-barsuk`    |
| `zip`       | package the extension into `cursor-spotlight@star-barsuk.zip` (for `gnome-extensions install`) |
| `lint`      | run `gjs` / `eslint` syntax check if available             |

## 13. Acceptance criteria

1. `make install && make enable` followed by a re-login loads the extension
   without JS errors in `journalctl --user`.
2. Pressing the hotkey dims the screen; the area around the pointer stays
   bright and follows the pointer.
3. Pressing the hotkey again removes the dimming.
4. Changing `dim-opacity`, `focus-width`, `focus-height`, `edge-softness`,
   or `zoom-factor` (via `gnome-extensions prefs` or `dconf`) takes effect
   immediately.
5. Pressing `toggle-zoom` while the spotlight is active toggles zoom mode.
6. Pressing `toggle-zoom` while the spotlight is inactive does nothing.
7. Zoom magnifies the spotlighted area by the configured factor; the rest
   of the screen remains dimmed.
8. Both `toggle` and `toggle-zoom` can be assigned the same key combination
   without conflicts.
9. The overlay does not intercept mouse clicks or keyboard input.
10. Disabling the extension leaves no orphan actors, timers, or keybindings.
11. Opening the overview (Super / Show Apps) never shows the overlay when the
    spotlight is off, and hides it while the overview is visible when on.

## 14. Implementation constraints

- Write original code. Do not copy or port any existing extension's source.
- No runtime dependencies beyond GNOME Shell and its bundled GI modules.
- Keep the module structure ESM-native and the code comment-light and clean.
