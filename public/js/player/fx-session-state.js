// Live playback FX overrides (rate, reverb) from the FX popup - persisted across
// reloads via localStorage, since players expect touching these to stick around like
// any other setting, not silently reset the moment the tab refreshes.
const STORAGE_KEY = 'maywifin_fx_state';

const defaults = {
    rateOverridden: false,
    rate: 1.0,
    reverbOverridden: false,
    reverbWet: 0,
    reverbDecay: 3,
    reverbRoomSize: 3,
};

function loadSaved() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && typeof saved === 'object') return { ...defaults, ...saved };
    } catch (err) {
        // Corrupt/unavailable storage - fall back to defaults below.
    }
    return { ...defaults };
}

// A Proxy so every existing `sessionFxState.foo = value` write (in fx-modal.js) persists
// automatically - callers don't need to know this is backed by storage at all.
export const sessionFxState = new Proxy(loadSaved(), {
    set(target, prop, value) {
        target[prop] = value;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(target));
        } catch (err) {
            // Storage full/unavailable - the override still works for this tab, it just
            // won't survive a reload.
        }
        return true;
    },
});
