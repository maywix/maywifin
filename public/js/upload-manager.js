// Global, page-independent upload queue. Lives as long as the SPA tab is open, so
// uploads started from Admin > Sources keep running (2 files at a time) even if the
// user navigates elsewhere - any page (or the persistent indicator) can subscribe to
// watch progress.
import { Api, AppState } from './api.js';

const CONCURRENCY = 2;
const CLEAR_DELAY_MS = 4000;
const MAX_STALL_RETRIES = 4;

let idCounter = 0;

export const UploadManager = {
    items: [], // { id, file, status: 'pending'|'uploading'|'done'|'error', progress, error, stallRetries }
    activeCount: 0,
    lastScanResult: null,
    lastScanError: null,
    _listeners: [],
    _finishTimer: null,

    subscribe(fn) {
        this._listeners.push(fn);
        return () => {
            this._listeners = this._listeners.filter((l) => l !== fn);
        };
    },

    _notify() {
        this._listeners.forEach((fn) => fn(this.getState()));
    },

    _log(...args) {
        console.log('[UploadManager]', ...args);
    },

    getState() {
        const isActive = this.activeCount > 0
            || this.items.some((i) => i.status === 'pending' || i.status === 'uploading')
            || Boolean(this._scanInFlight);
        return {
            items: this.items,
            isActive,
            lastScanResult: this.lastScanResult,
            lastScanError: this.lastScanError
        };
    },

    enqueue(fileList) {
        this._log('enqueue', Array.from(fileList).map((f) => `${f.name} (${f.size}b)`));
        clearTimeout(this._finishTimer);
        const newItems = Array.from(fileList).map((file) => ({
            id: `up-${Date.now()}-${idCounter++}`,
            file,
            status: 'pending',
            progress: 0,
            error: null,
            stallRetries: 0
        }));
        this.items.push(...newItems);
        this.lastScanResult = null;
        this.lastScanError = null;
        this._notify();
        this._pump();
        return newItems;
    },

    _pump() {
        while (this.activeCount < CONCURRENCY) {
            const next = this.items.find((i) => i.status === 'pending');
            if (!next) break;

            this.activeCount += 1;
            next.status = 'uploading';
            this._notify();

            this._uploadOne(next).finally(() => {
                this.activeCount -= 1;
                this._pump();
                this._maybeFinishBatch();
            });
        }
    },

    async _uploadOne(item) {
        this._log('starting upload:', item.file.name);
        try {
            await Api.uploadTrack(item.file, (percent) => {
                item.progress = percent;
                this._notify();
            }, { autoScan: false });
            item.status = 'done';
            this._log('done:', item.file.name);
        } catch (err) {
            // A stalled connection (no bytes for 20s) is auto-retried a few times before
            // giving up - transient network drops shouldn't need a manual click to recover.
            if (err.message === 'STALLED' && item.stallRetries < MAX_STALL_RETRIES) {
                item.stallRetries += 1;
                item.progress = 0;
                this._log(`stalled, auto-retry ${item.stallRetries}/${MAX_STALL_RETRIES}:`, item.file.name);
                this._notify();
                return this._uploadOne(item);
            }
            item.status = 'error';
            item.error = err.message === 'STALLED'
                ? `Connexion instable - abandon après ${MAX_STALL_RETRIES} tentatives`
                : err.message;
            this._log('error:', item.file.name, item.error);
        }
        this._notify();
    },

    _maybeFinishBatch() {
        const stillWorking = this.activeCount > 0 || this.items.some((i) => i.status === 'pending' || i.status === 'uploading');
        if (stillWorking || this._scanInFlight) return;

        const hadSuccess = this.items.some((i) => i.status === 'done');
        if (!hadSuccess) {
            this._scheduleClear();
            return;
        }

        this._scanInFlight = true;
        Api.scanLibrary()
            .then(async (res) => {
                this.lastScanResult = res;
                AppState.library = await Api.getLocalLibrary();
            })
            .catch((err) => {
                this.lastScanError = err.message;
            })
            .finally(() => {
                this._scanInFlight = false;
                this._notify();
                this._scheduleClear();
            });
    },

    _scheduleClear() {
        clearTimeout(this._finishTimer);
        this._finishTimer = setTimeout(() => {
            // Keep failed items around (with their retry button) until the user
            // explicitly retries or clears them - only auto-clear finished/pending work.
            this.items = this.items.filter((i) => i.status !== 'done');
            this._notify();
        }, CLEAR_DELAY_MS);
    },

    retry(id) {
        const item = this.items.find((i) => i.id === id);
        if (!item || item.status !== 'error') return;
        clearTimeout(this._finishTimer);
        item.status = 'pending';
        item.progress = 0;
        item.error = null;
        this._notify();
        this._pump();
    },

    retryAll() {
        this.items.filter((i) => i.status === 'error').forEach((i) => this.retry(i.id));
    }
};
