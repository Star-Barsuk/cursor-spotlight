// Pure helpers for reasoning about the running GNOME Shell version.
// Kept free of any GI / Shell imports so both extension.js (shell process)
// and prefs.js (preferences process) can share it.

// Momentary (hold-to-show) mode needs Meta.KeyBindingFlags.TRIGGER_RELEASE
// and the key event passed to the keybinding handler. The flag exists since
// mutter 47, but the event reaches the handler only since GNOME Shell 48.
export const HOLD_MIN_SHELL_MAJOR = 48;

export function majorVersion(versionString) {
    const major = parseInt(String(versionString).split('.')[0], 10);
    return Number.isFinite(major) ? major : 0;
}

export function supportsHold(versionString) {
    return majorVersion(versionString) >= HOLD_MIN_SHELL_MAJOR;
}
