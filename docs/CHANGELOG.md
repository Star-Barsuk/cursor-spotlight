# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-14

### Added

- Circular spotlight with a shader-masked zoom lens and GNOME Shell 51 support.
- Momentary hold hotkey (GNOME Shell 48+) alongside the latched toggle.
- GPU fragment shader that clips the zoom lens to the spotlight circle
  (`lib/lens-effect.js`), with a `Shell.GLSLEffect` backend on GNOME 45-50 and
  a `Clutter.ShaderEffect` backend on GNOME 51+.
- Shared constants module (`lib/constants.js`) so the extension and the
  preferences UI enforce the same bounds.
- Gettext translations: `gettext-domain` in metadata, `_()`-wrapped strings,
  `po/` template and a `make pot` target.
- ESLint flat config and a real `make lint` target.

### Changed

- Split the monolithic `extension.js` into small modules under `lib/`
  (controller, overlay, lens, pointer tracker, utils) and moved preference
  widgets into `prefs/`; the entry points are now thin.
- Centralised error handling in `lib/utils.js`: only genuinely fallible calls
  are guarded, and failures are logged with context instead of being silently
  swallowed.
- `make zip` now packs the extension with `gnome-extensions pack`, including
  the compiled schema, `LICENSE` and translations.
- `Adw.AlertDialog` is used for the keybinding capture dialog where available,
  with an `Adw.MessageDialog` fallback.
- Refreshed README, specification and metadata (URL, version, gettext domain).

### Fixed

- Multi-monitor geometry uses the union of all monitors, handling monitors
  placed left of or above the primary.
- Performance: settings and the Cairo gradient are cached, no-op repaints are
  skipped, and the pointer loop only runs while the spotlight is active.
- Keybinding preference rows now refresh when the binding changes outside the
  window.

## [0.1.0] - 2026-09-08

### Added

- Initial release: dim overlay with a soft-edged spotlight, pointer tracking,
  toggle hotkey and preferences.
- Preferences for dim opacity, focus size, edge softness and zoom factor.
- `Makefile` with build, install, uninstall, enable, disable, zip and lint
  targets.

[Unreleased]: https://github.com/Star-Barsuk/gnome-extension-cursor-spotlight/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Star-Barsuk/gnome-extension-cursor-spotlight/releases/tag/v1.0.0
[0.1.0]: https://github.com/Star-Barsuk/gnome-extension-cursor-spotlight/releases/tag/v0.1.0
