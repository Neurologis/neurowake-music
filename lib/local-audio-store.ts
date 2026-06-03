/**
 * local-audio-store.ts — NeuroWake Music
 *
 * Audio files are NEVER uploaded to the server.
 * Only metadata (titre, artiste, annee, filename) is stored in Supabase.
 * This module manages the mapping between titre IDs and local files on the device.
 *
 * Persistence strategy
 * ─────────────────────
 * Desktop (Chrome / Edge / Opera — File System Access API available):
 *   FileSystemFileHandle objects are stored in IndexedDB.
 *   On the next session the handle is retrieved and permission re-requested;
 *   in most cases Chrome auto-grants without a prompt.
 *
 * Mobile / Firefox / Safari — ALL platforms (v3+):
 *   The file's binary content (ArrayBuffer) is stored in IndexedDB (STORE_BLOBS).
 *   The file is imported ONCE — it is then available across all sessions
 *   without any re-selection, on every browser and every device.
 *
 *   ⚠️ iOS caveat: iOS may purge IndexedDB storage when the device runs very low
 *   on space and the app has not been used for a long time. In that rare case the
 *   user will need to re-import their files. A warning banner is shown on iOS to
 *   inform caregivers of this possibility (see `shouldShowIOSStorageWarning()`).
 *
 * Object URLs are created on demand and revoked automatically when no longer needed.
 */

// ── File System Access API type extensions ───────────────────────────────────
interface FSAFileHandle extends FileSystemFileHandle {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

type FSAStartIn =
  | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
  | FileSystemDirectoryHandle;

interface FSAWindow extends Window {
  showOpenFilePicker(options?: {
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    startIn?: FSAStartIn;
    id?: string;
  }): Promise<FileSystemFileHandle[]>;
  showDirectoryPicker(options?: {
    startIn?: FSAStartIn;
    mode?: 'read' | 'readwrite';
    id?: string;
  }): Promise<FileSystemDirectoryHandle>;
}

// ── IndexedDB ────────────────────────────────────────────────────────────────

const DB_NAME    = 'neurowake-audio-v1';
const DB_VERSION = 3;                    // v3 adds STORE_BLOBS for universal persistence
const STORE_HANDLES = 'handles'; // FileSystemFileHandle (desktop persistent)
const STORE_META    = 'meta';    // FileMeta (filename hint, works everywhere)
const STORE_DIR     = 'rootDir'; // FileSystemDirectoryHandle for NeuroWake Music folder
const STORE_BLOBS   = 'blobs';   // ArrayBuffer — universal persistence (mobile, Firefox, Safari)

export interface FileMeta {
  filename: string;
  size: number;
  format: string; // extension without dot, e.g. 'mp3'
}

/** File association status for a single titre. */
export type FileStatus =
  | 'ok'       // URL ready — file can be played immediately
  | 'pending'  // Handle or meta stored, but active URL not yet created (needs user gesture or re-pick)
  | 'missing'  // No association at all
  | 'checking' // Async check in progress (UI loading state)

// Lazy IndexedDB singleton
let _dbPromise: Promise<IDBDatabase | null> | null = null;

function _openDB(): Promise<IDBDatabase | null> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_HANDLES)) db.createObjectStore(STORE_HANDLES);
      if (!db.objectStoreNames.contains(STORE_META))    db.createObjectStore(STORE_META);
      if (!db.objectStoreNames.contains(STORE_DIR))     db.createObjectStore(STORE_DIR);
      if (!db.objectStoreNames.contains(STORE_BLOBS))   db.createObjectStore(STORE_BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => { console.warn('[LocalAudioStore] IndexedDB unavailable'); resolve(null); };
  });
  return _dbPromise;
}

async function _idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await _openDB();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror   = () => resolve(undefined);
  });
}

async function _idbPut(store: string, key: string, value: unknown): Promise<void> {
  const db = await _openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

async function _idbDelete(store: string, key: string): Promise<void> {
  const db = await _openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

async function _idbAllKeys(store: string): Promise<string[]> {
  const db = await _openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
    req.onsuccess = () => resolve((req.result ?? []) as string[]);
    req.onerror   = () => resolve([]);
  });
}

// ── In-memory session cache ──────────────────────────────────────────────────

// Object URLs created this session — keys are titre IDs.
const _urls    = new Map<string, string>();
// FSA handles loaded from IDB or freshly picked — avoids redundant IDB reads.
const _handles = new Map<string, FileSystemFileHandle>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function _ext(filename: string): string {
  return filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() || 'audio';
}

/**
 * Detect iOS devices (iPhone, iPad, iPod).
 * Used to show the storage-eviction warning banner.
 */
function _isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ── iOS Storage Warning ──────────────────────────────────────────────────────

/**
 * Returns true if a storage warning banner should be displayed to the user.
 *
 * On iOS, the browser may evict IndexedDB data when the device runs critically
 * low on storage and the app has not been used for an extended period.
 * In that rare case, caregivers would need to re-import their audio files.
 *
 * Show this banner once during onboarding or first file import on iOS.
 */
export function shouldShowIOSStorageWarning(): boolean {
  return _isIOS();
}

/**
 * i18n key for the iOS warning message to display in the UI.
 * See lib/i18n.ts — key 'ios_storage_warning'.
 */
export const IOS_STORAGE_WARNING_KEY = 'ios_storage_warning';

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * True if the browser supports the File System Access file-picker API.
 */
export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

/**
 * True if the browser supports the directory-picker API (`showDirectoryPicker`).
 * Chrome 86+, Edge 86+, Chrome Android 86+. NOT available in Safari or Firefox.
 */
export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Associate a plain File object.
 * The file's binary content is stored in IndexedDB (STORE_BLOBS) so it
 * persists across sessions on ALL platforms — including iOS Safari, Android,
 * and Firefox — without any re-selection required.
 */
export async function associateFile(titreId: string, file: File): Promise<void> {
  // Revoke previous URL for this ID if any
  const old = _urls.get(titreId);
  if (old) URL.revokeObjectURL(old);

  // Store the binary content for cross-session persistence on all platforms
  try {
    const buffer = await file.arrayBuffer();
    await _idbPut(STORE_BLOBS, titreId, { buffer, type: file.type || 'audio/mpeg' });
  } catch (err) {
    console.warn('[LocalAudioStore] Could not persist blob to IndexedDB:', (err as Error)?.message);
    // Continue anyway — URL will work for this session
  }

  // Create object URL for immediate playback
  _urls.set(titreId, URL.createObjectURL(file));

  // Store metadata (filename hint)
  await _idbPut(STORE_META, titreId, {
    filename: file.name,
    size: file.size,
    format: _ext(file.name),
  } satisfies FileMeta);
}

/**
 * Associate via FileSystemFileHandle (desktop persistent, Chrome/Edge).
 * Also stores the binary blob for universal fallback.
 */
export async function associateHandle(titreId: string, handle: FileSystemFileHandle): Promise<void> {
  const file = await handle.getFile();
  // associateFile stores the blob + meta + creates URL
  await associateFile(titreId, file);
  // Cache and persist the FSA handle (desktop extra layer)
  _handles.set(titreId, handle);
  await _idbPut(STORE_HANDLES, titreId, handle);
}

/**
 * Restore a playable URL from the persisted blob in IndexedDB.
 * Called automatically by getUrl() — no user gesture required.
 */
async function _restoreFromBlob(titreId: string): Promise<string | null> {
  const stored = await _idbGet<{ buffer: ArrayBuffer; type: string }>(STORE_BLOBS, titreId);
  if (!stored?.buffer) return null;
  try {
    const blob = new Blob([stored.buffer], { type: stored.type || 'audio/mpeg' });
    const url  = URL.createObjectURL(blob);
    _urls.set(titreId, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Get a playable object URL for a titre.
 *
 * Priority order:
 * 1. Session cache (instant)
 * 2. FSA handle with granted permission (desktop, silent restore)
 * 3. Persisted blob in IndexedDB (ALL platforms — mobile, Firefox, Safari)
 *
 * Returns null only when no file has ever been associated.
 */
export async function getUrl(titreId: string): Promise<string | null> {
  // 1. Fast path: already in session cache
  if (_urls.has(titreId)) return _urls.get(titreId)!;

  // 2. Try to restore from FSA handle (desktop)
  const handle = _handles.get(titreId)
    ?? await _idbGet<FileSystemFileHandle>(STORE_HANDLES, titreId);

  if (handle) {
    try {
      const perm = await (handle as FSAFileHandle).queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        const file = await handle.getFile();
        const url  = URL.createObjectURL(file);
        _urls.set(titreId, url);
        _handles.set(titreId, handle);
        return url;
      }
    } catch {
      _handles.delete(titreId);
      await _idbDelete(STORE_HANDLES, titreId);
    }
  }

  // 3. Universal fallback: restore from persisted blob (mobile, Firefox, Safari)
  return _restoreFromBlob(titreId);
}

/**
 * Request FSA permission for a stored handle (desktop, needs user gesture).
 * On mobile/Firefox/Safari, restores from blob automatically (no gesture needed).
 */
export async function requestPermission(titreId: string): Promise<string | null> {
  // Try FSA handle first (desktop)
  const handle = _handles.get(titreId)
    ?? await _idbGet<FileSystemFileHandle>(STORE_HANDLES, titreId);

  if (handle) {
    try {
      const perm = await (handle as FSAFileHandle).requestPermission({ mode: 'read' });
      if (perm === 'granted') {
        const file = await handle.getFile();
        const url  = URL.createObjectURL(file);
        _urls.set(titreId, url);
        _handles.set(titreId, handle);
        return url;
      }
    } catch {
      _handles.delete(titreId);
      await _idbDelete(STORE_HANDLES, titreId);
    }
  }

  // Fallback: restore from blob (works without user gesture on mobile)
  return _restoreFromBlob(titreId);
}

/**
 * Full status check for a titre ID.
 * 'ok'      — URL ready or blob available (can play immediately)
 * 'pending' — FSA handle stored but needs permission prompt (desktop only, no blob)
 * 'missing' — nothing stored
 */
export async function getFileStatus(titreId: string): Promise<FileStatus> {
  // Fast path: URL already in session
  if (_urls.has(titreId)) return 'ok';

  // Try FSA handle (desktop)
  const handle = _handles.get(titreId)
    ?? await _idbGet<FileSystemFileHandle>(STORE_HANDLES, titreId);

  if (handle) {
    try {
      const perm = await (handle as FSAFileHandle).queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        const file = await handle.getFile();
        _urls.set(titreId, URL.createObjectURL(file));
        _handles.set(titreId, handle);
        return 'ok';
      }
      if (perm === 'prompt') {
        // Before returning 'pending', check if blob is available as fallback
        const blobUrl = await _restoreFromBlob(titreId);
        if (blobUrl) return 'ok';
        return 'pending';
      }
    } catch {
      _handles.delete(titreId);
      await _idbDelete(STORE_HANDLES, titreId);
    }
  }

  // Check persisted blob (mobile, Firefox, Safari — universal)
  const stored = await _idbGet<{ buffer: ArrayBuffer }>(STORE_BLOBS, titreId);
  if (stored?.buffer) {
    const blobUrl = await _restoreFromBlob(titreId);
    if (blobUrl) return 'ok';
  }

  // Check filename meta as last resort
  const meta = await _idbGet<FileMeta>(STORE_META, titreId);
  return meta ? 'pending' : 'missing';
}

/**
 * Batch status check. Use in list UIs to populate all status badges at once.
 */
export async function checkStatuses(titreIds: string[]): Promise<Record<string, FileStatus>> {
  const pairs = await Promise.all(
    titreIds.map(async (id) => [id, await getFileStatus(id)] as [string, FileStatus])
  );
  return Object.fromEntries(pairs);
}

/**
 * Open a file picker and associate the result with a titre.
 * The file is stored persistently in IndexedDB on ALL platforms.
 * Must be called from a user gesture (click handler, etc.).
 * Returns the picked File, or null if the user cancelled.
 */
export async function pickAndAssociate(titreId: string): Promise<File | null> {
  const audioAccept = {
    description: 'Fichiers audio',
    accept: {
      'audio/*': ['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.wma', '.aiff', '.aif'],
    },
  };

  // ── Desktop: File System Access API ────────────────────────────────────────
  if (supportsFileSystemAccess()) {
    try {
      const musicFolder = await getMusicFolderHandle();
      const [handle] = await (window as unknown as FSAWindow).showOpenFilePicker({
        types: [audioAccept],
        multiple: false,
        excludeAcceptAllOption: false,
        startIn: musicFolder ?? 'music',
        id: 'neurowake-audio-file',
      });
      await associateHandle(titreId, handle); // stores FSA handle + blob
      return handle.getFile();
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return null;
      console.warn('[LocalAudioStore] FSA picker failed, using <input>:', (err as Error)?.message);
    }
  }

  // ── Mobile / Firefox / Safari: <input type="file"> ─────────────────────────
  // The file is stored as a blob in IndexedDB — persistent across sessions.
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.wav,.aac,.m4a,.flac,.ogg,.wma,.aiff,.aif';

    let resolved = false;
    input.onchange = async () => {
      resolved = true;
      const file = input.files?.[0] ?? null;
      if (file) await associateFile(titreId, file); // stores blob persistently
      resolve(file);
    };
    setTimeout(() => { if (!resolved) resolve(null); }, 60_000);
    input.click();
  });
}

/**
 * Remove a file association completely (URL + handle + blob + meta).
 */
export async function removeAssociation(titreId: string): Promise<void> {
  const url = _urls.get(titreId);
  if (url) URL.revokeObjectURL(url);
  _urls.delete(titreId);
  _handles.delete(titreId);
  await _idbDelete(STORE_HANDLES, titreId);
  await _idbDelete(STORE_META,    titreId);
  await _idbDelete(STORE_BLOBS,   titreId); // free the stored binary
}

/** Return the stored filename hint for a titre. */
export async function getFileMeta(titreId: string): Promise<FileMeta | null> {
  return (await _idbGet<FileMeta>(STORE_META, titreId)) ?? null;
}

/** All titre IDs that have at least a filename meta stored. */
export async function getAssociatedIds(): Promise<string[]> {
  return _idbAllKeys(STORE_META);
}

// ── Music folder management ──────────────────────────────────────────────────

/**
 * Open a system directory picker and set up the NeuroWake Music folder.
 * Universal implementation covering all platforms:
 *
 * CAS 1 — User directly selected/created "NeuroWake Music" (Android Chrome,
 *          Samsung Internet, Safari macOS): persist the handle as-is.
 * CAS 2 — User selected a parent folder (PC Chrome/Edge): create the
 *          "NeuroWake Music" subfolder automatically inside it.
 * CAS 3 — Subfolder creation failed (insufficient permissions): use the
 *          selected folder as root directly.
 *
 * Must be called from a user gesture. Returns the folder handle or null.
 */
export async function setupMusicFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null;
  try {
    const selectedHandle = await (window as unknown as FSAWindow).showDirectoryPicker({
      startIn: 'music',
      mode: 'readwrite',
      id: 'neurowake-parent-dir',
    });

    // CAS 1 — User directly selected/created "NeuroWake Music"
    if (selectedHandle.name === 'NeuroWake Music') {
      await _idbPut(STORE_DIR, 'musicFolder', selectedHandle);
      await _idbPut(STORE_DIR, 'musicFolderParentName', 'NeuroWake Music');
      await _idbPut(STORE_DIR, 'folderSetupComplete', true);
      return selectedHandle;
    }

    // CAS 2 — User selected a parent folder: try to create "NeuroWake Music" inside
    try {
      const nwHandle = await selectedHandle.getDirectoryHandle(
        'NeuroWake Music',
        { create: true },
      );
      await _idbPut(STORE_DIR, 'musicFolder', nwHandle);
      await _idbPut(STORE_DIR, 'musicFolderParentName', selectedHandle.name);
      await _idbPut(STORE_DIR, 'folderSetupComplete', true);
      return nwHandle;
    } catch {
      // CAS 3 — Subfolder creation failed: use the selected folder as root
      await _idbPut(STORE_DIR, 'musicFolder', selectedHandle);
      await _idbPut(STORE_DIR, 'musicFolderParentName', selectedHandle.name);
      await _idbPut(STORE_DIR, 'folderSetupComplete', true);
      return selectedHandle;
    }
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') return null;
    console.warn('[LocalAudioStore] setupMusicFolder error:', (err as Error)?.message);
    return null;
  }
}

/**
 * Mark the folder setup step as complete without a directory picker.
 * Used on iOS / Firefox where FSA is unavailable and files are stored as blobs.
 */
export async function markFolderSetupComplete(): Promise<void> {
  await _idbPut(STORE_DIR, 'folderSetupComplete', true);
}

/**
 * Returns true when the folder setup step can be considered done:
 *  - Always true on iOS / Firefox (no FSA — blobs are stored directly).
 *  - True if the user has previously called setupMusicFolder() or markFolderSetupComplete().
 *  - True if a music folder handle is present in IndexedDB.
 */
export async function isFolderSetupComplete(): Promise<boolean> {
  if (!supportsDirectoryPicker()) return true; // iOS, Firefox → always OK
  const complete = await _idbGet<boolean>(STORE_DIR, 'folderSetupComplete');
  if (complete === true) return true;
  return hasMusicFolder();
}

export async function getMusicFolderParentName(): Promise<string | null> {
  return (await _idbGet<string>(STORE_DIR, 'musicFolderParentName')) ?? null;
}

/**
 * Copy a File into the NeuroWake Music folder (if configured, Chrome/Edge only).
 * Returns true on success, false if unavailable or on error.
 */
export async function copyToMusicFolder(file: File): Promise<boolean> {
  if (!supportsDirectoryPicker()) return false;
  const dirHandle = await getMusicFolderHandle();
  if (!dirHandle) return false;
  try {
    const fh = await (dirHandle as unknown as {
      getFileHandle(name: string, opts: { create: boolean }): Promise<{
        createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
      }>;
    }).getFileHandle(file.name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(file);
    await writable.close();
    return true;
  } catch (err) {
    console.warn('[LocalAudioStore] copyToMusicFolder error:', (err as Error)?.message);
    return false;
  }
}

/** Return the persisted NeuroWake Music directory handle, or null if not set up. */
export async function getMusicFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  return (await _idbGet<FileSystemDirectoryHandle>(STORE_DIR, 'musicFolder')) ?? null;
}

/** True if a NeuroWake Music folder handle has been stored in IndexedDB. */
export async function hasMusicFolder(): Promise<boolean> {
  return (await getMusicFolderHandle()) !== null;
}

/**
 * Revoke all object URLs for the current session.
 * Does NOT clear IndexedDB (handles/meta/blobs persist for next session).
 */
export function revokeAllUrls(): void {
  _urls.forEach((url) => URL.revokeObjectURL(url));
  _urls.clear();
}
