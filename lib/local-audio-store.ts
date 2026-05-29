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
 * Mobile / Firefox fallback:
 *   Plain File objects live in memory for the current tab session only.
 *   After a page reload the user must re-associate files via the file picker.
 *
 * Object URLs are created on demand and revoked automatically when no longer needed.
 */

// ── File System Access API type extensions ───────────────────────────────────
// TypeScript's built-in lib does not yet include queryPermission / requestPermission
// nor showDirectoryPicker on window.
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
const DB_VERSION = 2;                    // v2 adds STORE_DIR
const STORE_HANDLES = 'handles'; // FileSystemFileHandle (desktop persistent)
const STORE_META    = 'meta';    // FileMeta (filename hint, works everywhere)
const STORE_DIR     = 'rootDir'; // FileSystemDirectoryHandle for NeuroWake Music folder

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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * True if the browser supports the File System Access file-picker API.
 * Chrome 86+, Edge 86+, Opera 72+, Safari 15.2+, Firefox 111+.
 * Used for opening individual audio files.
 */
export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

/**
 * True if the browser supports the directory-picker API (`showDirectoryPicker`).
 * Needed for automatic folder creation — Chrome 86+, Edge 86+, Chrome Android 86+.
 * NOT available in Safari (macOS or iOS) or Firefox as of 2025.
 */
export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Associate a plain File object (session-only — works on all platforms).
 * The object URL is created immediately and lives until `removeAssociation`
 * or `revokeAllUrls` is called.
 */
export async function associateFile(titreId: string, file: File): Promise<void> {
  // Revoke previous URL for this ID if any
  const old = _urls.get(titreId);
  if (old) URL.revokeObjectURL(old);

  _urls.set(titreId, URL.createObjectURL(file));

  await _idbPut(STORE_META, titreId, {
    filename: file.name,
    size: file.size,
    format: _ext(file.name),
  } satisfies FileMeta);
}

/**
 * Associate via FileSystemFileHandle (persists across sessions on desktop).
 * Requires File System Access API support.
 */
export async function associateHandle(titreId: string, handle: FileSystemFileHandle): Promise<void> {
  const file = await handle.getFile();
  // Create the object URL (registers in _urls)
  await associateFile(titreId, file);
  // Cache and persist the handle
  _handles.set(titreId, handle);
  await _idbPut(STORE_HANDLES, titreId, handle);
}

/**
 * Get a playable object URL for a titre.
 * For desktop FSA handles with 'granted' permission, the URL is created automatically
 * (silent restore). Returns null when permission requires a user gesture or no file exists.
 */
export async function getUrl(titreId: string): Promise<string | null> {
  // Fast path: already in session cache
  if (_urls.has(titreId)) return _urls.get(titreId)!;

  // Try to restore from FSA handle
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
      // 'prompt' or 'denied' — needs a user gesture, return null
    } catch {
      // Handle stale (file moved / deleted)
      _handles.delete(titreId);
      await _idbDelete(STORE_HANDLES, titreId);
    }
  }

  return null;
}

/**
 * Request FSA permission for a stored handle (MUST be called from a user gesture).
 * Returns the object URL if permission was granted, null otherwise.
 */
export async function requestPermission(titreId: string): Promise<string | null> {
  const handle = _handles.get(titreId)
    ?? await _idbGet<FileSystemFileHandle>(STORE_HANDLES, titreId);
  if (!handle) return null;
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
  return null;
}

/**
 * Full status check for a titre ID.
 * 'ok'      — URL ready
 * 'pending' — handle/meta stored but URL not yet created (needs user action)
 * 'missing' — nothing stored
 */
export async function getFileStatus(titreId: string): Promise<FileStatus> {
  // Fast path: URL already in session
  if (_urls.has(titreId)) return 'ok';

  // Try handle
  const handle = _handles.get(titreId)
    ?? await _idbGet<FileSystemFileHandle>(STORE_HANDLES, titreId);

  if (handle) {
    try {
      const perm = await (handle as FSAFileHandle).queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        // Silently restore URL
        const file = await handle.getFile();
        _urls.set(titreId, URL.createObjectURL(file));
        _handles.set(titreId, handle);
        return 'ok';
      }
      if (perm === 'prompt') return 'pending';
      // 'denied' → handle is useless but meta might exist
    } catch {
      _handles.delete(titreId);
      await _idbDelete(STORE_HANDLES, titreId);
    }
  }

  // Check if we at least have the filename meta (mobile: file was associated this tab)
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
 * Desktop: tries File System Access API (persistent handle).
 * Mobile / fallback: plain <input type="file"> (session-only).
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
      // Open picker in the stored NeuroWake Music folder if available; fall back to 'music'.
      const musicFolder = await getMusicFolderHandle();
      const [handle] = await (window as unknown as FSAWindow).showOpenFilePicker({
        types: [audioAccept],
        multiple: false,
        excludeAcceptAllOption: false,
        startIn: musicFolder ?? 'music',
        id: 'neurowake-audio-file',
      });
      await associateHandle(titreId, handle);
      return handle.getFile();
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return null; // user cancelled
      // FSA failed for another reason — fall through to file input
      console.warn('[LocalAudioStore] FSA picker failed, using <input>:', (err as Error)?.message);
    }
  }

  // ── Mobile / fallback: <input type="file"> ─────────────────────────────────
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.wav,.aac,.m4a,.flac,.ogg,.wma,.aiff,.aif';

    let resolved = false;
    input.onchange = async () => {
      resolved = true;
      const file = input.files?.[0] ?? null;
      if (file) await associateFile(titreId, file);
      resolve(file);
    };
    // Some browsers never fire onchange on cancel — resolve after a delay
    setTimeout(() => { if (!resolved) resolve(null); }, 60_000);
    input.click();
  });
}

/**
 * Remove a file association completely (URL + handle + meta).
 */
export async function removeAssociation(titreId: string): Promise<void> {
  const url = _urls.get(titreId);
  if (url) URL.revokeObjectURL(url);
  _urls.delete(titreId);
  _handles.delete(titreId);
  await _idbDelete(STORE_HANDLES, titreId);
  await _idbDelete(STORE_META,    titreId);
}

/** Return the stored filename hint for a titre (for display when file is pending/missing). */
export async function getFileMeta(titreId: string): Promise<FileMeta | null> {
  return (await _idbGet<FileMeta>(STORE_META, titreId)) ?? null;
}

/** All titre IDs that have at least a filename meta stored. */
export async function getAssociatedIds(): Promise<string[]> {
  return _idbAllKeys(STORE_META);
}

// ── Music folder management ──────────────────────────────────────────────────

/**
 * Open a system directory picker (starting in the OS Music folder), then
 * automatically create a "NeuroWake Music" subfolder inside the chosen
 * location. The subfolder handle is persisted in IndexedDB so that future
 * file pickers (showOpenFilePicker) open directly in that folder.
 *
 * Must be called from a user gesture (click handler).
 * Returns the created/existing subfolder handle, or null if cancelled/unsupported.
 */
export async function setupMusicFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFileSystemAccess()) return null;
  try {
    const parentHandle = await (window as unknown as FSAWindow).showDirectoryPicker({
      startIn: 'music',
      mode: 'readwrite',
      id: 'neurowake-parent-dir',
    });
    // Create "NeuroWake Music" subfolder — no-op if it already exists.
    const nwHandle = await parentHandle.getDirectoryHandle('NeuroWake Music', { create: true });
    await _idbPut(STORE_DIR, 'musicFolder', nwHandle);
    // Also persist the parent folder name so the UI can display the full path hint.
    await _idbPut(STORE_DIR, 'musicFolderParentName', parentHandle.name);
    return nwHandle;
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') return null; // user cancelled
    console.warn('[LocalAudioStore] setupMusicFolder error:', (err as Error)?.message);
    return null;
  }
}

/**
 * Return the name of the parent folder the user chose when calling setupMusicFolder().
 * e.g. "Musique", "Music", "Downloads".
 * Returns null if never set (manual-folder flow or folder not yet configured).
 */
export async function getMusicFolderParentName(): Promise<string | null> {
  return (await _idbGet<string>(STORE_DIR, 'musicFolderParentName')) ?? null;
}

/**
 * Copy a File into the NeuroWake Music folder (if one has been configured).
 * Uses the File System Access API — no-op if FSA unavailable or folder not set up.
 * Returns true on success, false if unavailable or on error.
 */
export async function copyToMusicFolder(file: File): Promise<boolean> {
  if (!supportsDirectoryPicker()) return false;
  const dirHandle = await getMusicFolderHandle();
  if (!dirHandle) return false;

  try {
    // FileSystemDirectoryHandle.getFileHandle + createWritable are FSA-only
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

/**
 * Return the persisted "NeuroWake Music" directory handle, or null if not yet set up.
 */
export async function getMusicFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  return (await _idbGet<FileSystemDirectoryHandle>(STORE_DIR, 'musicFolder')) ?? null;
}

/**
 * True if a "NeuroWake Music" folder handle has been stored in IndexedDB.
 */
export async function hasMusicFolder(): Promise<boolean> {
  return (await getMusicFolderHandle()) !== null;
}

/**
 * Revoke all object URLs for the current session.
 * Call on component unmount or page unload.
 * Does NOT clear IndexedDB (handles/meta persist for next session).
 */
export function revokeAllUrls(): void {
  _urls.forEach((url) => URL.revokeObjectURL(url));
  _urls.clear();
}
