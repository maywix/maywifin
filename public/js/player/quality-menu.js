// Custom quality dropdown - replaces the old invisible-<select> hack with a real,
// styled menu. Decoupled from Player (no import) to avoid a circular import; the
// caller wires up what happens on selection via initQualityMenu(onChange).

let currentQuality = 'lossless';
let onChangeCallback = null;

export function getCurrentQuality() {
    return currentQuality;
}

export function setCurrentQuality(tier) {
    currentQuality = tier;
    renderActiveOption();
}

function renderActiveOption() {
    document.querySelectorAll('.quality-option').forEach((opt) => {
        opt.classList.toggle('active', opt.dataset.value === currentQuality);
    });
}

export function initQualityMenu(onChange) {
    onChangeCallback = onChange;

    const menu = document.getElementById('quality-menu');
    const btn = document.getElementById('quality-menu-btn');
    const panel = document.getElementById('quality-menu-panel');
    if (!menu || !btn || !panel) return;

    const closeMenu = () => {
        panel.classList.add('hidden');
        menu.classList.remove('is-open');
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = panel.classList.contains('hidden');
        closeMenu();
        if (willOpen) {
            panel.classList.remove('hidden');
            menu.classList.add('is-open');
        }
    });

    document.addEventListener('click', closeMenu);
    panel.addEventListener('click', (e) => e.stopPropagation());

    panel.querySelectorAll('.quality-option').forEach((opt) => {
        opt.addEventListener('click', () => {
            if (opt.disabled) return;
            const tier = opt.dataset.value;
            closeMenu();
            if (tier === currentQuality) return;
            currentQuality = tier;
            renderActiveOption();
            if (onChangeCallback) onChangeCallback(tier);
        });
    });

    renderActiveOption();
}

// Reflects a track's real capabilities/format in the menu: disables tiers the source
// can't honestly provide, and highlights Dolby Atmos when detected.
export function updateQualityMenu(tiersInfo) {
    const menu = document.getElementById('quality-menu');
    const panel = document.getElementById('quality-menu-panel');
    const hint = document.getElementById('quality-hint');
    if (!menu || !panel || !tiersInfo) return;

    panel.querySelectorAll('.quality-option').forEach((opt) => {
        const info = tiersInfo.tiers?.[opt.dataset.value];
        opt.disabled = info ? !info.available : false;
    });

    // For Atmos tracks, relabel "Lossless" as "Dolby Atmos" with its badge - it still
    // requests the 'lossless' tier under the hood, this is just an honest label for
    // the best-effort rendition of an Atmos/multichannel source (see resolveStreamPlan).
    const losslessOption = panel.querySelector('.quality-option[data-value="lossless"]');
    if (losslessOption) {
        const label = losslessOption.querySelector('.quality-option-label');
        const badge = losslessOption.querySelector('.quality-option-atmos-badge');
        if (tiersInfo.isAtmos) {
            label.textContent = label.dataset.atmosLabel;
            badge.classList.remove('hidden');
        } else {
            label.textContent = label.dataset.normalLabel;
            badge.classList.add('hidden');
        }
    }

    menu.classList.toggle('is-atmos', !!tiersInfo.isAtmos && currentQuality === 'lossless');
    menu.classList.toggle('is-max-quality', !!tiersInfo.isMaxQuality);

    if (tiersInfo.isMaxQuality) {
        const confidenceNote = tiersInfo.atmosConfidence === 'confirmed' ? '' : tiersInfo.isAtmos ? ' (détection automatique)' : '';
        hint.textContent = tiersInfo.isAtmos ? `Source Dolby Atmos${confidenceNote}` : 'Qualité source maximale';
        hint.classList.remove('hidden');
    } else {
        hint.classList.add('hidden');
    }

    renderActiveOption();
}
