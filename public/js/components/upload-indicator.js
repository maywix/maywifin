import { UploadManager } from '../upload-manager.js';

// A small persistent pill (visible on every page, since uploads keep running in the
// background regardless of navigation) showing live import progress.
export function mountUploadIndicator() {
    if (document.getElementById('upload-indicator')) return;

    const el = document.createElement('div');
    el.id = 'upload-indicator';
    el.className = 'upload-indicator hidden';
    el.innerHTML = `
        <span class="material-symbols-rounded">upload</span>
        <span id="upload-indicator-text">Import…</span>
    `;
    document.body.appendChild(el);

    UploadManager.subscribe((state) => {
        const done = state.items.filter((i) => i.status === 'done').length;
        const errored = state.items.filter((i) => i.status === 'error').length;
        const total = state.items.length;

        if (total === 0) {
            el.classList.add('hidden');
            return;
        }

        el.classList.remove('hidden');
        const textEl = el.querySelector('#upload-indicator-text');

        if (state.isActive) {
            textEl.textContent = `Import ${done + errored}/${total} fichier${total > 1 ? 's' : ''}…`;
            el.classList.remove('is-done', 'is-error');
        } else if (state.lastScanError) {
            textEl.textContent = `Importé, mais le scan a échoué: ${state.lastScanError}`;
            el.classList.add('is-error');
        } else if (errored > 0) {
            textEl.textContent = `${done} importé(s), ${errored} échec(s)`;
            el.classList.add('is-error');
        } else {
            textEl.textContent = `✓ ${done} fichier${done > 1 ? 's' : ''} importé${done > 1 ? 's' : ''}`;
            el.classList.add('is-done');
        }
    });
}
