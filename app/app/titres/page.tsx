'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  Upload, Trash2, RefreshCw, Infinity, ListPlus, Check, Plus,
  FolderOpen, AlertCircle, Loader2, HardDrive, Link, ShoppingCart, X,
  ChevronRight, Info,
} from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import * as localStore from '@/lib/local-audio-store';
import type { FileStatus } from '@/lib/local-audio-store';
import { useT } from '@/hooks/use-t';

interface Titre {
  id: string;
  titre: string;
  artiste: string;
  annee: number | null;
  duree_secondes: number | null;
  repetitions: number;
  boucle_infinie: boolean;
  note_aidant: string | null;
  dans_playlist_favorite: boolean;
  ordre: number;
  storage_path: string; // filename hint
}

interface UserPlaylist { id: string; nom: string }

interface PendingAdd {
  file: File;
  titre: string;
  artiste: string;
  annee: string;
}

const REP_OPTIONS = [
  { label: '1×',  value: 1,  loop: false },
  { label: '2×',  value: 2,  loop: false },
  { label: '3×',  value: 3,  loop: false },
  { label: '5×',  value: 5,  loop: false },
  { label: '10×', value: 10, loop: false },
  { label: '∞',   value: 1,  loop: true  },
];

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.wma', '.aiff', '.aif'];

export default function TitresPage() {
  const router = useRouter();
  const { t }  = useT();

  const [titres, setTitres]             = useState<Titre[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [fileStatus, setFileStatus]     = useState<Record<string, FileStatus>>({});
  const [associating, setAssociating]   = useState<string | null>(null);
  const [editNotes, setEditNotes]       = useState<Record<string, string>>({});
  const [showReps, setShowReps]         = useState<string | null>(null);
  const [pendingAdd, setPendingAdd]     = useState<PendingAdd | null>(null);
  const [savingNew, setSavingNew]       = useState(false);
  const [dragOver, setDragOver]         = useState(false);
  const [fileMetas, setFileMetas]       = useState<Record<string, localStore.FileMeta | null>>({});
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [folderSetup, setFolderSetup]               = useState<boolean | null>(null); // null = checking
  const [settingUpFolder, setSettingUpFolder]       = useState(false);
  const [showIOSWarning, setShowIOSWarning]         = useState(false);
  // Capabilities — set client-side to avoid SSR mismatch
  const [dirPickerSupported, setDirPickerSupported] = useState(false);
  const [platform, setPlatform]                     = useState<'windows' | 'macos' | 'ios' | 'android' | 'other'>('other');

  // Playlists
  const [userPlaylists, setUserPlaylists]         = useState<UserPlaylist[]>([]);
  const [showPlaylistMenu, setShowPlaylistMenu]   = useState<string | null>(null);
  const [addingToPlaylist, setAddingToPlaylist]   = useState<string | null>(null);
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName]     = useState('');
  const newPlaylistRef = useRef<HTMLInputElement>(null);

  // ── Detect capabilities & platform (client-only) ────────────────────────────
  useEffect(() => {
    setDirPickerSupported(localStore.supportsDirectoryPicker());
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua))                            setPlatform('ios');
    else if (/android/.test(ua))                                setPlatform('android');
    else if (/macintosh|mac os x/.test(ua) && !/mobile/.test(ua)) setPlatform('macos');
    else if (/windows/.test(ua))                                setPlatform('windows');
    else                                                        setPlatform('other');
    localStore.hasMusicFolder().then(setFolderSetup);
    setShowIOSWarning(localStore.shouldShowIOSStorageWarning());
  }, []);

  async function handleSetupFolder() {
    setSettingUpFolder(true);
    try {
      const handle = await localStore.setupMusicFolder();
      if (handle) {
        setFolderSetup(true);
        toast({
          title: t('folder_created_ok'),
          description: t('folder_created_desc'),
        });
      }
    } catch {
      toast({ title: t('error_title'), description: t('error_generic'), variant: 'destructive' });
    } finally {
      setSettingUpFolder(false);
    }
  }

  // ── Load titres ─────────────────────────────────────────────────────────────
  const loadTitres = useCallback(async () => {
    const url = search ? `/api/titres?q=${encodeURIComponent(search)}` : '/api/titres';
    const res = await fetch(url);
    if (res.ok) {
      const { titres: data } = await res.json();
      setTitres(data ?? []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { loadTitres(); }, [loadTitres]);

  useEffect(() => {
    fetch('/api/playlists').then(r => r.json()).then(({ playlists }) => setUserPlaylists(playlists ?? []));
  }, []);

  // ── Check file statuses whenever titre list changes ─────────────────────────
  useEffect(() => {
    if (titres.length === 0) return;
    const ids = titres.map(t => t.id);
    localStore.checkStatuses(ids).then(setFileStatus);
    Promise.all(ids.map(id => localStore.getFileMeta(id).then(m => [id, m] as [string, localStore.FileMeta | null])))
      .then(entries => setFileMetas(Object.fromEntries(entries)));
  }, [titres]);

  // ── File association ─────────────────────────────────────────────────────────
  async function associerFichier(titreId: string) {
    setAssociating(titreId);
    try {
      const file = await localStore.pickAndAssociate(titreId);
      if (!file) { setAssociating(null); return; }

      await fetch(`/api/titres/${titreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: file.name }),
      });

      setFileStatus(s => ({ ...s, [titreId]: 'ok' }));
      const fmt = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() || 'audio';
      setFileMetas(m => ({ ...m, [titreId]: { filename: file.name, size: file.size, format: fmt } }));
      // Try to copy the file to the NeuroWake Music folder
      const copied = await localStore.copyToMusicFolder(file);
      if (copied) {
        toast({ title: t('titre_added_toast'), description: `${file.name} — ${t('titre_added_copied')}` });
      } else {
        toast({ title: t('titre_added_toast'), description: file.name });
      }
    } catch (err) {
      console.error('[titres] associerFichier error:', err);
      toast({ title: t('error_title'), description: t('error_assoc'), variant: 'destructive' });
    } finally {
      setAssociating(null);
    }
  }

  async function reautoriserFichier(titreId: string) {
    setAssociating(titreId);
    try {
      const url = await localStore.requestPermission(titreId);
      if (url) {
        setFileStatus(s => ({ ...s, [titreId]: 'ok' }));
        toast({ title: t('access_granted_toast') });
      } else {
        await associerFichier(titreId);
        return;
      }
    } finally {
      setAssociating(null);
    }
  }

  // ── Add new titre from local file ────────────────────────────────────────────
  function handleNewFileSelected(file: File) {
    const cleanName = file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    setPendingAdd({ file, titre: cleanName, artiste: '', annee: '' });
  }

  function isAudioFile(file: File): boolean {
    if (file.type.startsWith('audio/')) return true;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return AUDIO_EXTENSIONS.includes(ext);
  }

  async function confirmNewTitre() {
    if (!pendingAdd || !pendingAdd.titre.trim()) return;
    setSavingNew(true);
    try {
      const res = await fetch('/api/titres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre:    pendingAdd.titre.trim(),
          artiste:  pendingAdd.artiste.trim() || 'Inconnu',
          annee:    pendingAdd.annee ? parseInt(pendingAdd.annee) : null,
          filename: pendingAdd.file.name,
        }),
      });
      if (!res.ok) throw new Error('API error');

      const newTitre = await res.json();
      await localStore.associateFile(newTitre.id, pendingAdd.file);
      setTitres(ts => [newTitre, ...ts]);
      setFileStatus(s => ({ ...s, [newTitre.id]: 'ok' }));
      setPendingAdd(null);
      toast({ title: t('titre_new_added'), description: `${newTitre.titre} — ${newTitre.artiste}` });
    } catch {
      toast({ title: t('error_title'), description: t('error_save_titre'), variant: 'destructive' });
    } finally {
      setSavingNew(false);
    }
  }

  // ── Playlist helpers ─────────────────────────────────────────────────────────
  async function addToPlaylist(titreId: string, playlistId: string) {
    setAddingToPlaylist(playlistId);
    const res = await fetch(`/api/playlists/${playlistId}/titres`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titre_id: titreId }),
    });
    toast(res.ok
      ? { title: t('titre_added_to_pl_toast'), description: t('added_to_pl_desc') }
      : { title: t('error_title'), description: t('error_generic'), variant: 'destructive' }
    );
    setAddingToPlaylist(null);
    setShowPlaylistMenu(null);
    setShowNewPlaylistInput(null);
  }

  async function createPlaylistAndAdd(titreId: string) {
    if (!newPlaylistName.trim()) return;
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: newPlaylistName.trim() }),
    });
    if (res.ok) {
      const { playlist } = await res.json();
      setUserPlaylists(p => [...p, playlist]);
      await addToPlaylist(titreId, playlist.id);
      setNewPlaylistName('');
    }
  }

  // ── Titre CRUD ───────────────────────────────────────────────────────────────
  async function updateTitre(id: string, updates: Partial<Titre>) {
    setTitres(ts => ts.map(x => x.id === id ? { ...x, ...updates } : x));
    await fetch(`/api/titres/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  async function deleteTitre(id: string) {
    if (!confirm(t('delete_titre_confirm'))) return;
    setTitres(ts => ts.filter(x => x.id !== id));
    await Promise.all([
      fetch(`/api/titres/${id}`, { method: 'DELETE' }),
      localStore.removeAssociation(id),
    ]);
    toast({ title: t('titre_deleted_toast') });
  }

  async function saveNote(id: string) {
    await updateTitre(id, { note_aidant: editNotes[id] });
    setEditNotes(n => { const c = { ...n }; delete c[id]; return c; });
  }

  // ── Status badge ─────────────────────────────────────────────────────────────
  function StatusBadge({ titreId, storagePath }: { titreId: string; storagePath: string }) {
    const status = fileStatus[titreId] ?? 'checking';
    const meta   = fileMetas[titreId];
    const hint   = meta?.filename ?? storagePath ?? '';

    if (status === 'checking') {
      return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> {t('file_checking_label')}</span>;
    }
    if (status === 'ok') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[#7BA05B]">
          <Check className="h-3 w-3" />
          {hint && <span className="truncate max-w-[180px]">{hint}</span>}
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
          <AlertCircle className="h-3 w-3" />
          {hint ? <span className="truncate max-w-[150px]">{hint}</span> : t('file_reauth_required')}
        </span>
      );
    }
    // missing
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" />
        {t('file_no_assoc')}
      </span>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Popup "Après l'achat" ───────────────────────────────────────────── */}
      {purchaseDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPurchaseDialogOpen(false)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-[#4A6FA5]" />
                <h3 className="font-bold text-[#2C2C2A]">{t('purchase_dialog_title')}</h3>
              </div>
              <button onClick={() => setPurchaseDialogOpen(false)} className="text-muted-foreground hover:text-[#2C2C2A]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-[#2C2C2A]">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4A6FA5] text-white text-xs font-bold flex items-center justify-center">1</span>
                <span>{t('purchase_step1')}</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4A6FA5] text-white text-xs font-bold flex items-center justify-center">2</span>
                <span>
                  {t('purchase_step2_intro')}<br />
                  <span className="text-xs text-muted-foreground font-mono">Windows : Musique\NeuroWake Music\</span><br />
                  <span className="text-xs text-muted-foreground font-mono">Mac : ~/Musique/NeuroWake Music/</span>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4A6FA5] text-white text-xs font-bold flex items-center justify-center">3</span>
                <span>{t('purchase_step3')}</span>
              </li>
            </ol>
            <Button className="w-full bg-[#4A6FA5] text-base h-11" onClick={() => setPurchaseDialogOpen(false)}>
              {t('understood_btn')}
            </Button>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-[#2C2C2A]">{t('tracks_title')}</h1>
        <p className="text-muted-foreground text-base">{titres.length} {titres.length > 1 ? 'titres' : 'titre'}</p>
      </div>

      {/* ── Avertissement stockage iOS ──────────────────────────────────────── */}
      {showIOSWarning && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">{t('ios_storage_warning')}</p>
        </div>
      )}

      {/* ── Bannière dossier NeuroWake Music ───────────────────────────────── */}
      <Card className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60 hover:-translate-y-1 transition-all duration-200">
        <CardContent className="p-5 space-y-4">

          <div className="flex items-center gap-3">
            <HardDrive className="h-5 w-5 text-[#4A6FA5] flex-shrink-0" />
            <p className="font-semibold text-[#2C2C2A]">{t('folder_section_title')}</p>
          </div>

          {/* ⚠️ Avertissement permanent */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong>{t('folder_required_label')}</strong> {t('folder_required_desc')}
            </p>
          </div>

          {/* Vérification initiale */}
          {folderSetup === null && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> {t('folder_checking')}
            </p>
          )}

          {/* ✅ Dossier configuré */}
          {folderSetup === true && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[#7BA05B] font-medium">
                <Check className="h-4 w-4 flex-shrink-0" />
                {t('folder_setup_done_msg')}
              </div>
              {dirPickerSupported && (
                <button onClick={handleSetupFolder} className="text-xs text-muted-foreground hover:text-[#4A6FA5] underline">
                  {t('folder_change_location')}
                </button>
              )}
            </div>
          )}

          {/* Dossier non encore configuré */}
          {folderSetup === false && (
            <div className="space-y-4">

              {/* Bouton d'autorisation automatique (Chrome / Edge / Chrome Android) */}
              {dirPickerSupported && (
                <div className="bg-white border border-[#4A6FA5]/30 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium text-[#2C2C2A]">
                    {t('folder_auto_title')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('folder_auto_desc')}
                  </p>
                  <Button
                    size="lg"
                    onClick={handleSetupFolder}
                    disabled={settingUpFolder}
                    className="w-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 text-white text-base"
                  >
                    {settingUpFolder ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" />{t('creating_folder_label')}</>
                    ) : (
                      <><FolderOpen className="h-5 w-5 mr-2" />{t('authorize_create_folder')}</>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t('folder_permission_note')}
                  </p>
                </div>
              )}

              {/* Instructions manuelles — adaptées à l'OS détecté */}
              <div className={dirPickerSupported ? 'border-t border-[#4A6FA5]/20 pt-4' : ''}>
                {dirPickerSupported && (
                  <p className="text-xs text-muted-foreground mb-3 font-medium">
                    {t('folder_manual_intro')}
                  </p>
                )}

                <div className="space-y-2 text-sm">

                  {/* Windows */}
                  {(platform === 'windows' || platform === 'other') && (
                    <details className="bg-white border rounded-lg" open={platform === 'windows'}>
                      <summary className="px-4 py-3 font-medium cursor-pointer select-none list-none flex items-center gap-2">
                        {t('folder_win_title')}
                      </summary>
                      <ol className="px-6 pb-3 pt-1 space-y-1.5 text-xs text-muted-foreground list-decimal">
                        <li>{t('folder_win_s1')}</li>
                        <li>{t('folder_win_s2')}</li>
                        <li>{t('folder_win_s3')}</li>
                        <li>{t('folder_step4_type')} <code className="bg-[#EDEAE3] px-1.5 py-0.5 rounded font-mono">NeuroWake Music</code></li>
                        <li>{t('folder_win_s5')}</li>
                      </ol>
                    </details>
                  )}

                  {/* Mac */}
                  {(platform === 'macos' || platform === 'other') && (
                    <details className="bg-white border rounded-lg" open={platform === 'macos'}>
                      <summary className="px-4 py-3 font-medium cursor-pointer select-none list-none flex items-center gap-2">
                        {t('folder_mac_title')}
                      </summary>
                      <ol className="px-6 pb-3 pt-1 space-y-1.5 text-xs text-muted-foreground list-decimal">
                        <li>{t('folder_mac_s1')}</li>
                        <li>{t('folder_mac_s2')}</li>
                        <li>{t('folder_mac_s3')}</li>
                        <li>{t('folder_step4_type')} <code className="bg-[#EDEAE3] px-1.5 py-0.5 rounded font-mono">NeuroWake Music</code></li>
                        <li>{t('folder_mac_s5')}</li>
                      </ol>
                    </details>
                  )}

                  {/* iPhone / iPad */}
                  {(platform === 'ios' || platform === 'other') && (
                    <details className="bg-white border rounded-lg" open={platform === 'ios'}>
                      <summary className="px-4 py-3 font-medium cursor-pointer select-none list-none flex items-center gap-2">
                        {t('folder_ios_title')}
                      </summary>
                      <ol className="px-6 pb-3 pt-1 space-y-1.5 text-xs text-muted-foreground list-decimal">
                        <li>{t('folder_ios_s1')}</li>
                        <li>{t('folder_ios_s2')}</li>
                        <li>{t('folder_ios_s3')}</li>
                        <li>{t('folder_step4_type')} <code className="bg-[#EDEAE3] px-1.5 py-0.5 rounded font-mono">NeuroWake Music</code></li>
                        <li>{t('folder_ios_s5')}</li>
                      </ol>
                    </details>
                  )}

                  {/* Android */}
                  {(platform === 'android' || platform === 'other') && (
                    <details className="bg-white border rounded-lg" open={platform === 'android'}>
                      <summary className="px-4 py-3 font-medium cursor-pointer select-none list-none flex items-center gap-2">
                        {t('folder_android_title')}
                      </summary>
                      <ol className="px-6 pb-3 pt-1 space-y-1.5 text-xs text-muted-foreground list-decimal">
                        <li>{t('folder_android_s1')}</li>
                        <li>{t('folder_android_s2')}</li>
                        <li>{t('folder_android_s3')}</li>
                        <li>{t('folder_step4_type')} <code className="bg-[#EDEAE3] px-1.5 py-0.5 rounded font-mono">NeuroWake Music</code></li>
                        <li>{t('folder_android_s5')}</li>
                      </ol>
                    </details>
                  )}

                </div>
              </div>
            </div>
          )}

          {/* ── Règles permanentes — toujours visibles ── */}
          <div className="space-y-2 text-sm text-[#2C2C2A] border-t border-[#4A6FA5]/20 pt-3">
            <div className="flex gap-2">
              <span className="text-[#4A6FA5] font-bold flex-shrink-0">→</span>
              <p>{t('folder_rule_audio')}</p>
            </div>
            <div className="flex gap-2">
              <span className="text-[#4A6FA5] font-bold flex-shrink-0">→</span>
              <p>
                {t('folder_rule_purchase')}{' '}
                <button onClick={() => setPurchaseDialogOpen(true)} className="text-[#4A6FA5] underline hover:no-underline inline-flex items-center gap-1">
                  <Info className="h-3 w-3" />{t('folder_how_to_btn')}
                </button>
              </p>
            </div>
            <div className="flex gap-2">
              <span className="text-[#4A6FA5] font-bold flex-shrink-0">→</span>
              <p>{t('folder_rule_assoc')}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t('folder_privacy')}
          </p>
        </CardContent>
      </Card>

      {/* ── Recherche ───────────────────────────────────────────────────────── */}
      <Input
        placeholder={t('search_placeholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-base h-11"
      />

      {/* ── Zone ajout par glisser-déposer ──────────────────────────────────── */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors min-h-[120px] flex flex-col items-center justify-center ${
          dragOver ? 'border-[#4A6FA5] bg-[#4A6FA5]/5' : 'border-[#EDEAE3] hover:border-[#4A6FA5]'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file && isAudioFile(file)) handleNewFileSelected(file);
          else toast({ title: t('unsupported_format_msg'), description: t('unsupported_format_desc'), variant: 'destructive' });
        }}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'audio/*' + AUDIO_EXTENSIONS.join(',');
          input.onchange = () => {
            const file = input.files?.[0];
            if (file) handleNewFileSelected(file);
          };
          input.click();
        }}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground font-medium text-base">{t('drag_drop_title')}</p>
        <p className="text-sm text-muted-foreground mt-1">{t('drag_drop_formats')}</p>
      </div>

      {/* ── Formulaire confirmation nouveau titre ────────────────────────────── */}
      {pendingAdd && (
        <Card className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-[#F5A623]/40">
          <CardContent className="p-4 space-y-3">
            <p className="text-base font-semibold text-[#4A6FA5]">{t('new_titre_header')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('titre_label')}</label>
                <Input
                  value={pendingAdd.titre}
                  onChange={(e) => setPendingAdd(p => p ? { ...p, titre: e.target.value } : p)}
                  placeholder={t('titre_label')}
                  className="text-base"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('artiste_label')}</label>
                <Input
                  value={pendingAdd.artiste}
                  onChange={(e) => setPendingAdd(p => p ? { ...p, artiste: e.target.value } : p)}
                  placeholder={t('artiste_label')}
                  className="text-base"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('annee_label')}</label>
                <Input
                  type="number"
                  min="1900"
                  max="2030"
                  value={pendingAdd.annee}
                  onChange={(e) => setPendingAdd(p => p ? { ...p, annee: e.target.value } : p)}
                  placeholder="Ex : 1975"
                />
              </div>
              <div className="flex items-end">
                <p className="text-xs text-muted-foreground truncate">{pendingAdd.file.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={confirmNewTitre} disabled={savingNew || !pendingAdd.titre.trim()} className="bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white text-base h-11 hover:-translate-y-0.5 transition-all">
                {savingNew ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('saving_label')}</> : t('confirm_btn')}
              </Button>
              <Button variant="outline" onClick={() => setPendingAdd(null)} className="text-base h-11">{t('cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Liste des titres ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />{t('loading')}
        </div>
      ) : titres.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-base">
          {t('no_titles_msg')}
        </p>
      ) : (
        <div className="space-y-3">
          {titres.map((titre) => {
            const status = fileStatus[titre.id] ?? 'checking';
            return (
              <Card key={titre.id} className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60 hover:-translate-y-1 transition-all duration-200 hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Status icon */}
                    <div className={`w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 text-2xl ${
                      status === 'ok'       ? 'bg-green-50 border border-green-200' :
                      status === 'pending'  ? 'bg-amber-50 border border-amber-200' :
                      status === 'checking' ? 'bg-[#EDEAE3]' :
                      'bg-red-50 border border-red-200'
                    }`}>
                      {status === 'ok'       ? '🎵' :
                       status === 'pending'  ? '🔑' :
                       status === 'checking' ? '⏳' : '❌'}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Title + delete */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-base truncate">{titre.titre}</p>
                          <p className="text-sm text-muted-foreground">
                            {titre.artiste}{titre.annee ? ` · ${titre.annee}` : ''}{titre.duree_secondes ? ` · ${formatDuration(titre.duree_secondes)}` : ''}
                          </p>
                          <div className="mt-1">
                            <StatusBadge titreId={titre.id} storagePath={titre.storage_path} />
                          </div>
                        </div>
                        <button onClick={() => deleteTitre(titre.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0 mt-1">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>

                      {/* ── File association buttons ─────────────────────── */}
                      <div className="mt-3 flex flex-col gap-2">

                        {/* MISSING — bouton principal bien visible */}
                        {status === 'missing' && (
                          <>
                            <Button
                              className="w-full bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white text-base h-12 hover:-translate-y-0.5 transition-all"
                              onClick={() => associerFichier(titre.id)}
                              disabled={associating === titre.id}
                            >
                              {associating === titre.id
                                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('selecting_label')}</>
                                : <><FolderOpen className="h-4 w-4 mr-2" />{t('assoc_file_btn')}</>
                              }
                            </Button>
                            <button
                              onClick={() => setPurchaseDialogOpen(true)}
                              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-[#4A6FA5] min-h-[44px] justify-center"
                            >
                              <ShoppingCart className="h-4 w-4" />
                              {t('i_bought_itunes')}
                            </button>
                          </>
                        )}

                        {/* PENDING — ré-association */}
                        {status === 'pending' && (
                          <Button
                            variant="outline"
                            className="w-full border-amber-500 text-amber-600 hover:bg-amber-50 text-base h-12"
                            onClick={() => reautoriserFichier(titre.id)}
                            disabled={associating === titre.id}
                          >
                            {associating === titre.id
                              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />…</>
                              : <><Link className="h-4 w-4 mr-2" />{t('assoc_file_btn')}</>
                            }
                          </Button>
                        )}

                        {/* OK — remplacement discret */}
                        {status === 'ok' && (
                          <Button
                            variant="ghost"
                            className="w-full text-muted-foreground hover:text-[#4A6FA5] text-sm h-10"
                            onClick={() => associerFichier(titre.id)}
                            disabled={associating === titre.id}
                          >
                            {associating === titre.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <><FolderOpen className="h-3 w-3 mr-1" />{t('replace_file_btn')}</>
                            }
                          </Button>
                        )}
                      </div>

                      {/* ── Options (favorite, playlist, répétitions) ────── */}
                      <div className="flex flex-wrap items-center gap-4 mt-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={titre.dans_playlist_favorite}
                            onCheckedChange={(checked) => updateTitre(titre.id, { dans_playlist_favorite: checked })}
                          />
                          <span className="text-base text-muted-foreground">{t('favorite_label')}</span>
                        </div>

                        <div className="relative">
                          <button
                            onClick={() => {
                              setShowPlaylistMenu(showPlaylistMenu === titre.id ? null : titre.id);
                              setShowNewPlaylistInput(null);
                            }}
                            className="flex items-center gap-1 text-base text-[#4A6FA5] hover:underline"
                          >
                            <ListPlus className="h-5 w-5" /> Playlist
                          </button>
                          {showPlaylistMenu === titre.id && (
                            <div className="absolute z-20 top-8 left-0 bg-white border rounded-lg shadow-lg p-2 min-w-[200px] space-y-1">
                              {userPlaylists.length === 0 && (
                                <p className="text-sm text-muted-foreground px-2 py-1">{t('no_playlist_option')}</p>
                              )}
                              {userPlaylists.map((pl) => (
                                <button
                                  key={pl.id}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded hover:bg-[#EDEAE3]"
                                  onClick={() => addToPlaylist(titre.id, pl.id)}
                                  disabled={addingToPlaylist === pl.id}
                                >
                                  {addingToPlaylist === pl.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 opacity-0" />}
                                  {pl.nom}
                                </button>
                              ))}
                              {showNewPlaylistInput === titre.id ? (
                                <div className="flex gap-1 px-1 pt-1">
                                  <Input
                                    ref={newPlaylistRef}
                                    value={newPlaylistName}
                                    onChange={(e) => setNewPlaylistName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && createPlaylistAndAdd(titre.id)}
                                    placeholder="Nom…"
                                    className="h-7 text-xs"
                                  />
                                  <button onClick={() => createPlaylistAndAdd(titre.id)} className="px-2 py-1 text-xs bg-[#4A6FA5] text-white rounded">{t('ok_btn')}</button>
                                </div>
                              ) : (
                                <button
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-[#4A6FA5] rounded hover:bg-[#EDEAE3]"
                                  onClick={() => { setShowNewPlaylistInput(titre.id); setTimeout(() => newPlaylistRef.current?.focus(), 50); }}
                                >
                                  <Plus className="h-3 w-3" /> {t('new_playlist_option')}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="relative">
                          <button
                            onClick={() => setShowReps(showReps === titre.id ? null : titre.id)}
                            className="flex items-center gap-1 text-base text-[#4A6FA5] hover:underline"
                          >
                            {titre.boucle_infinie
                              ? <><Infinity className="h-5 w-5" /> Boucle</>
                              : <><RefreshCw className="h-5 w-5" /> {titre.repetitions}×</>
                            }
                          </button>
                          {showReps === titre.id && (
                            <div className="absolute z-10 top-8 left-0 bg-white border rounded-lg shadow-lg p-2 flex gap-1">
                              {REP_OPTIONS.map((opt) => (
                                <button
                                  key={`${opt.value}-${opt.loop}`}
                                  className={`px-3 py-2 text-base rounded-md ${
                                    titre.boucle_infinie === opt.loop && titre.repetitions === opt.value
                                      ? 'bg-[#4A6FA5] text-white'
                                      : 'hover:bg-[#EDEAE3]'
                                  }`}
                                  onClick={() => { updateTitre(titre.id, { repetitions: opt.value, boucle_infinie: opt.loop }); setShowReps(null); }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Note ──────────────────────────────────────────── */}
                      {editNotes[titre.id] !== undefined ? (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            value={editNotes[titre.id]}
                            onChange={(e) => setEditNotes(n => ({ ...n, [titre.id]: e.target.value }))}
                            placeholder={t('note_placeholder')}
                            className="text-base"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" className="text-base h-10" onClick={() => saveNote(titre.id)}>{t('save_btn')}</Button>
                            <Button size="sm" variant="outline" className="text-base h-10" onClick={() => setEditNotes(n => { const c = { ...n }; delete c[titre.id]; return c; })}>{t('cancel')}</Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditNotes(n => ({ ...n, [titre.id]: titre.note_aidant ?? '' }))}
                          className="mt-2 text-sm text-muted-foreground hover:text-[#4A6FA5]"
                        >
                          {titre.note_aidant || t('add_note_btn')}
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Avertissement iOS ──────────────────────────────────────────────────── */}
{localStore.shouldShowIOSStorageWarning() && (
  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
    <Info className="h-5 w-5 mt-0.5 shrink-0 text-amber-500" />
    <p>{t('ios_storage_warning')}</p>
  </div>
)}
      {/* ── Légende ─────────────────────────────────────────────────────────── */}
      {titres.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Check className="h-4 w-4 text-[#7BA05B]" /> {t('file_ready_legend')}</span>
          <span className="flex items-center gap-1"><AlertCircle className="h-4 w-4 text-amber-500" /> {t('file_reauth_legend')}</span>
          <span className="flex items-center gap-1"><AlertCircle className="h-4 w-4 text-destructive" /> {t('file_missing_legend')}</span>
        </div>
      )}

      {/* ── Bouton "J'ai terminé" ────────────────────────────────────────────── */}
      <div className="pb-8">
        <Button
          size="lg"
          className="w-full bg-[#7BA05B] hover:bg-[#7BA05B]/90 text-white text-base font-semibold"
          onClick={() => router.push('/app')}
        >
          {t('done_player_btn')}
          <ChevronRight className="h-5 w-5 ml-2" />
        </Button>
      </div>

    </div>
  );
}
