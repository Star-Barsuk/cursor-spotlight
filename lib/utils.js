// Small shared helpers for error handling and GSettings reads.
//
// Kept free of any GI / Shell imports so both the shell process and the
// preferences process can use them. Error handling is centralised here
// instead of being repeated (and silently swallowed) at every call site:
// only genuinely fallible operations are guarded, and failures are logged
// with enough context to diagnose them in the field.

export function logError(context, error) {
    const message = error && error.message ? error.message : error;
    console.error(`[spotlight] ${context}: ${message}`);
}

// disconnect() does not throw for a live object, but teardown can run on
// partially initialised objects; a failed disconnect should be visible.
export function safeDisconnect(object, id) {
    if (!object || id == null)
        return;
    try {
        object.disconnect(id);
    } catch (e) {
        logError('signal disconnect', e);
    }
}

// Remove the actor from its parent and destroy it, logging either step.
export function safeDestroy(actor) {
    if (!actor)
        return;
    try {
        const parent = actor.get_parent();
        if (parent)
            parent.remove_child(actor);
    } catch (e) {
        logError('actor remove', e);
    }
    try {
        actor.destroy();
    } catch (e) {
        logError('actor destroy', e);
    }
}

// Settings reads are guarded because a missing key or an unreadable dconf
// value must not take down the extension; the caller gets its fallback.
export function getInt(settings, key, fallback) {
    try {
        return settings.get_int(key);
    } catch (e) {
        logError(`read ${key}`, e);
        return fallback;
    }
}

export function getDouble(settings, key, fallback) {
    try {
        return settings.get_double(key);
    } catch (e) {
        logError(`read ${key}`, e);
        return fallback;
    }
}
