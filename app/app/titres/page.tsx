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
  }, []);

  async function handleSetupFolder() {
    setSettingUpFolder(true);
    try {
      const handle = await localStore.setupMusicFolder();
      if (handle) {
        setFolderSetup(true);
        toast({
          title: '📁 Dossier créé ✅',
          description: 'Le dossier "NeuroWake Music" est prêt. Les prochains sélecteurs de fichiers s\'ouvriront directement dedans.',
        });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de créer le dossier.', variant: 'destructive' });
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
        toast({ title: 'Fichier associé ✅', description: `${file.name} — copié dans NeuroWake Music` });
      } else {
        toast({ title: 'Fichier associé ✅', description: file.name });
      }
    } catch (err) {
      console.error('[titres] associerFichier error:', err);
      toast({ title: 'Erreur', description: "Impossible d'associer le fichier.", variant: 'destructive' });
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
        toast({ title: 'Accès autorisé ✅' });
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
      toast({ title: 'Titre ajouté ✅', description: `${newTitre.titre} — ${newTitre.artiste}` });
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'enregistrer le titre.", variant: 'destructive' });
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
      ? { title: 'Titre ajouté', description: 'Ajouté à la playlist.' }
      : { title: 'Erreur', description: "Impossible d'ajouter.", variant: 'destructive' }
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
    setTitres(t => t.map(x => x.id === id ? { ...x, ...updates } : x));
    await fetch(`/api/titres/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  async function deleteTitre(id: string) {
    if (!confirm('Supprimer ce titre et son association au fichier local ?')) return;
    setTitres(t => t.filter(x => x.id !== id));
    await Promise.all([
      fetch(`/api/titres/${id}`, { method: 'DELETE' }),
      localStore.removeAssociation(id),
    ]);
    toast({ title: 'Titre supprimé' });
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
      return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Vérification…</span>;
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
          {hint ? <span className="truncate max-w-[150px]">{hint}</span> : 'Ré-autorisation requise'}
        </span>
      );
    }
    // missing
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" />
        Aucun fichier associé
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
                <h3 className="font-bold text-[#2C2C2A]">Après l&apos;achat iTunes ou Amazon</h3>
              </div>
              <button onClick={() => setPurchaseDialogOpen(false)} className="text-muted-foreground hover:text-[#2C2C2A]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-[#2C2C2A]">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4A6FA5] text-white text-xs font-bold flex items-center justify-center">1</span>
                <span>Téléchargez le fichier audio acheté sur votre appareil.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4A6FA5] text-white text-xs font-bold flex items-center justify-center">2</span>
                <span>
                  Déplacez-le dans votre dossier <strong>NeuroWake Music</strong> :<br />
                  <span className="text-xs text-muted-foreground font-mono">Windows : Musique\NeuroWake Music\</span><br />
                  <span className="text-xs text-muted-foreground font-mono">Mac : ~/Musique/NeuroWake Music/</span>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4A6FA5] text-white text-xs font-bold flex items-center justify-center">3</span>
                <span>Revenez ici et cliquez <strong>Associer le fichier</strong> à côté du titre.</span>
              </li>
            </ol>
            <Button className="w-full bg-[#4A6FA5]" onClick={() => setPurchaseDialogOpen(false)}>
              Compris
            </Button>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-[#2C2C2A]">Mes titres</h1>
        <p className="text-muted-foreground text-sm">{titres.length} titre(s)</p>
      </div>

      {/* ── Bannière dossier NeuroWake Music ───────────────────────────────── */}
      <Card className="bg-[#4A6FA5]/5 border-[#4A6FA5]/30">
        <CardContent className="p-5 space-y-4">

          <div className="flex items-center gap-3">
            <HardDrive className="h-5 w-5 text-[#4A6FA5] flex-shrink-0" />
            <p className="font-semibold text-[#2C2C2A]">📁 Dossier NeuroWake Music</p>
          </div>

          {/* ⚠️ Avertissement permanent */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong>Obligatoire :</strong> tous vos fichiers audio doivent être placés dans le
              dossier <strong>NeuroWake Music</strong>. L&apos;application ne peut lire que les
              fichiers présents dans ce dossier autorisé.
            </p>
          </div>

          {/* Vérification initiale */}
          {folderSetup === null && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Vérification…
            </p>
          )}

          {/* ✅ Dossier configuré */}
          {folderSetup === true && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[#7BA05B] font-medium">
                <Check className="h-4 w-4 flex-shrink-0" />
                Dossier <strong>NeuroWake Music</strong> configuré — les sélecteurs s&apos;ouvrent directement dedans.
              </div>
              {dirPickerSupported && (
                <button onClick={handleSetupFolder} className="text-xs text-muted-foreground hover:text-[#4A6FA5] underline">
                  Changer d&apos;emplacement
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
                    🖥️ Création automatique disponible sur votre navigateur
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Cliquez sur le bouton ci-dessous pour autoriser l&apos;application à créer le
                    dossier sur votre appareil. Une <strong>fenêtre système</strong> s&apos;ouvrira :
                    naviguez jusqu&apos;à votre dossier <strong>Musique</strong>, puis cliquez{' '}
                    <strong>Sélectionner</strong>. Le sous-dossier <strong>NeuroWake Music</strong>{' '}
                    sera créé automatiquement à l&apos;intérieur.
                  </p>
                  <Button
                    size="lg"
                    onClick={handleSetupFolder}
                    disabled={settingUpFolder}
                    className="w-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 text-white text-base"
                  >
                    {settingUpFolder ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Création en cours…</>
                    ) : (
                      <><FolderOpen className="h-5 w-5 mr-2" />J&apos;autorise — Créer le dossier sur mon appareil</>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    En cliquant, vous autorisez l&apos;application à créer et accéder uniquement au
                    dossier <strong>NeuroWake Music</strong>. Aucun autre fichier ou dossier n&apos;est accessible.
                  </p>
                </div>
              )}

              {/* Instructions manuelles — adaptées à l'OS détecté */}
              <div className={dirPickerSupported ? 'border-t border-[#4A6FA5]/20 pt-4' : ''}>
                {dirPickerSupported && (
                  <p className="text-xs text-muted-foreground mb-3 font-medium">
                    Sur un autre appareil (Safari, Firefox, iOS…) créez le dossier manuellement :
                  </p>
                )}

                <div className="space-y-2 text-sm">

                  {/* Windows */}
                  {(platform === 'windows' || platform === 'other') && (
                    <details className="bg-white border rounded-lg" open={platform === 'windows'}>
                      <summary className="px-4 py-3 font-medium cursor-pointer select-none list-none flex items-center gap-2">
                        <span>🪟</span> Windows — PC ou tablette Surface
                      </summary>
                      <ol className="px-6 pb-3 pt-1 space-y-1.5 text-xs text-muted-foreground list-decimal">
                        <li>Ouvrez l&apos;<strong>Explorateur de fichiers</strong> (touche Win&nbsp;+&nbsp;E)</li>
                        <li>Dans le panneau gauche, cliquez sur <strong>Musique</strong></li>
                        <li>Clic droit dans la zone vide → <strong>Nouveau → Dossier</strong></li>
                        <li>Tapez exactement : <code className="bg-[#EDEAE3] px-1.5 py-0.5 rounded font-mono">NeuroWake Music</code></li>
                        <li>Appuyez sur <strong>Entrée</strong> pour valider</li>
                      </ol>
                    </details>
                  )}

                  {/* Mac */}
                  {(platform === 'macos' || platform === 'other') && (
                    <details className="bg-white border rounded-lg" open={platform === 'macos'}>
                      <summary className="px-4 py-3 font-medium cursor-pointer select-none list-none flex items-center gap-2">
                        <span>🍎</span> Mac — MacBook ou iMac
                      </summary>
                      <ol className="px-6 pb-3 pt-1 space-y-1.5 text-xs text-muted-foreground list-decimal">
                        <li>Ouvrez le <strong>Finder</strong></li>
                        <li>Dans la barre latérale, cliquez sur <strong>Musique</strong></li>
                        <li>Menu Fichier → <strong>Nouveau dossier</strong> (ou <kbd>Cmd + Maj + N</kbd>)</li>
                        <li>Tapez exactement : <code className="bg-[#EDEAE3] px-1.5 py-0.5 rounded font-mono">NeuroWake Music</code></li>
                        <li>Appuyez sur <strong>Entrée</strong></li>
                      </ol>
                    </details>
                  )}

                  {/* iPhone / iPad */}
                  {(platform === 'ios' || platform === 'other') && (
                    <details className="bg-white border rounded-lg" open={platform === 'ios'}>
                      <summary className="px-4 py-3 font-medium cursor-pointer select-none list-none flex items-center gap-2">
                        <span>🍏</span> iPhone ou iPad
                      </summary>
                      <ol className="px-6 pb-3 pt-1 space-y-1.5 text-xs text-muted-foreground list-decimal">
                        <li>Ouvrez l&apos;app <strong>Fichiers</strong> (icône bleue)</li>
                        <li>Appuyez sur <strong>Sur mon iPhone</strong> (ou Sur mon iPad)</li>
                        <li>Appui long dans la zone vide → <strong>Nouveau dossier</strong></li>
                        <li>Tapez exactement : <code className="bg-[#EDEAE3] px-1.5 py-0.5 rounded font-mono">NeuroWake Music</code></li>
                        <li>Appuyez sur <strong>Terminé</strong></li>
                      </ol>
                    </details>
                  )}

                  {/* Android */}
                  {(platform === 'android' || platform === 'other') && (
                    <details className="bg-white border rounded-lg" open={platform === 'android'}>
                      <summary className="px-4 py-3 font-medium cursor-pointer select-none list-none flex items-center gap-2">
                        <span>🤖</span> Android — téléphone ou tablette
                      </summary>
                      <ol className="px-6 pb-3 pt-1 space-y-1.5 text-xs text-muted-foreground list-decimal">
                        <li>Ouvrez l&apos;app <strong>Mes fichiers</strong> ou <strong>Gestionnaire de fichiers</strong></li>
                        <li>Allez dans <strong>Stockage interne → Musique</strong></li>
                        <li>Appuyez sur <strong>+</strong> ou <strong>Nouveau dossier</strong></li>
                        <li>Tapez exactement : <code className="bg-[#EDEAE3] px-1.5 py-0.5 rounded font-mono">NeuroWake Music</code></li>
                        <li>Confirmez avec <strong>OK</strong> ou <strong>Créer</strong></li>
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
              <p>Placez <strong>tous vos fichiers audio</strong> (MP3, WAV, M4A, AAC, FLAC…) dans le dossier <strong>NeuroWake Music</strong>.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-[#4A6FA5] font-bold flex-shrink-0">→</span>
              <p>
                Après un achat iTunes / Amazon, téléchargez le fichier dans ce dossier.{' '}
                <button onClick={() => setPurchaseDialogOpen(true)} className="text-[#4A6FA5] underline hover:no-underline inline-flex items-center gap-1">
                  <Info className="h-3 w-3" />Comment faire ?
                </button>
              </p>
            </div>
            <div className="flex gap-2">
              <span className="text-[#4A6FA5] font-bold flex-shrink-0">→</span>
              <p>Cliquez <strong className="text-[#4A6FA5]">Associer le fichier</strong> à côté de chaque titre pour le lier.</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            🔒 <strong>Aucun fichier musical n&apos;est envoyé sur internet.</strong> Tout reste sur votre appareil.
          </p>
        </CardContent>
      </Card>

      {/* ── Recherche ───────────────────────────────────────────────────────── */}
      <Input
        placeholder="Rechercher dans mes titres..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* ── Zone ajout par glisser-déposer ──────────────────────────────────── */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-[#4A6FA5] bg-[#4A6FA5]/5' : 'border-[#EDEAE3] hover:border-[#4A6FA5]'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file && isAudioFile(file)) handleNewFileSelected(file);
          else toast({ title: 'Format non supporté', description: 'MP3, WAV, FLAC, M4A, OGG, AAC, WMA, AIFF acceptés.', variant: 'destructive' });
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
        <p className="text-muted-foreground font-medium">Glissez un fichier audio ou cliquez pour ajouter un titre</p>
        <p className="text-xs text-muted-foreground mt-1">MP3, WAV, FLAC, M4A, OGG, AAC, WMA, AIFF — tous formats audio</p>
      </div>

      {/* ── Formulaire confirmation nouveau titre ────────────────────────────── */}
      {pendingAdd && (
        <Card className="border-[#4A6FA5] bg-[#4A6FA5]/5">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-[#4A6FA5]">Nouveau titre — confirmez les informations</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Titre</label>
                <Input
                  value={pendingAdd.titre}
                  onChange={(e) => setPendingAdd(p => p ? { ...p, titre: e.target.value } : p)}
                  placeholder="Nom du titre"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Artiste</label>
                <Input
                  value={pendingAdd.artiste}
                  onChange={(e) => setPendingAdd(p => p ? { ...p, artiste: e.target.value } : p)}
                  placeholder="Nom de l'artiste"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Année (optionnel)</label>
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
              <Button onClick={confirmNewTitre} disabled={savingNew || !pendingAdd.titre.trim()} className="bg-[#4A6FA5]">
                {savingNew ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement…</> : '✅ Confirmer'}
              </Button>
              <Button variant="outline" onClick={() => setPendingAdd(null)}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Liste des titres ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Chargement…
        </div>
      ) : titres.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Aucun titre. Glissez un fichier audio ci-dessus ou validez des titres dans &ldquo;Découverte&rdquo;.
        </p>
      ) : (
        <div className="space-y-3">
          {titres.map((t) => {
            const status = fileStatus[t.id] ?? 'checking';
            return (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Status icon */}
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-xl ${
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
                          <p className="font-semibold truncate">{t.titre}</p>
                          <p className="text-sm text-muted-foreground">
                            {t.artiste}{t.annee ? ` · ${t.annee}` : ''}{t.duree_secondes ? ` · ${formatDuration(t.duree_secondes)}` : ''}
                          </p>
                          <div className="mt-1">
                            <StatusBadge titreId={t.id} storagePath={t.storage_path} />
                          </div>
                        </div>
                        <button onClick={() => deleteTitre(t.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0 mt-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* ── File association buttons ─────────────────────── */}
                      <div className="mt-3 flex flex-wrap gap-2 items-center">

                        {/* MISSING — bouton principal bien visible */}
                        {status === 'missing' && (
                          <>
                            <Button
                              size="sm"
                              className="bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 text-white"
                              onClick={() => associerFichier(t.id)}
                              disabled={associating === t.id}
                            >
                              {associating === t.id
                                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sélection…</>
                                : <><FolderOpen className="h-4 w-4 mr-2" />Associer le fichier</>
                              }
                            </Button>
                            <button
                              onClick={() => setPurchaseDialogOpen(true)}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-[#4A6FA5]"
                            >
                              <ShoppingCart className="h-3 w-3" />
                              J&apos;ai acheté ce titre sur iTunes / Amazon
                            </button>
                          </>
                        )}

                        {/* PENDING — ré-association */}
                        {status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500 text-amber-600 hover:bg-amber-50"
                            onClick={() => reautoriserFichier(t.id)}
                            disabled={associating === t.id}
                          >
                            {associating === t.id
                              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />…</>
                              : <><Link className="h-4 w-4 mr-2" />Associer le fichier</>
                            }
                          </Button>
                        )}

                        {/* OK — remplacement discret */}
                        {status === 'ok' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-[#4A6FA5] text-xs"
                            onClick={() => associerFichier(t.id)}
                            disabled={associating === t.id}
                          >
                            {associating === t.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <><FolderOpen className="h-3 w-3 mr-1" />Remplacer le fichier</>
                            }
                          </Button>
                        )}
                      </div>

                      {/* ── Options (favorite, playlist, répétitions) ────── */}
                      <div className="flex flex-wrap items-center gap-4 mt-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={t.dans_playlist_favorite}
                            onCheckedChange={(checked) => updateTitre(t.id, { dans_playlist_favorite: checked })}
                          />
                          <span className="text-sm text-muted-foreground">Favorite</span>
                        </div>

                        <div className="relative">
                          <button
                            onClick={() => {
                              setShowPlaylistMenu(showPlaylistMenu === t.id ? null : t.id);
                              setShowNewPlaylistInput(null);
                            }}
                            className="flex items-center gap-1 text-sm text-[#4A6FA5] hover:underline"
                          >
                            <ListPlus className="h-4 w-4" /> Playlist
                          </button>
                          {showPlaylistMenu === t.id && (
                            <div className="absolute z-20 top-8 left-0 bg-white border rounded-lg shadow-lg p-2 min-w-[200px] space-y-1">
                              {userPlaylists.length === 0 && (
                                <p className="text-xs text-muted-foreground px-2 py-1">Aucune playlist</p>
                              )}
                              {userPlaylists.map((pl) => (
                                <button
                                  key={pl.id}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded hover:bg-[#EDEAE3]"
                                  onClick={() => addToPlaylist(t.id, pl.id)}
                                  disabled={addingToPlaylist === pl.id}
                                >
                                  {addingToPlaylist === pl.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 opacity-0" />}
                                  {pl.nom}
                                </button>
                              ))}
                              {showNewPlaylistInput === t.id ? (
                                <div className="flex gap-1 px-1 pt-1">
                                  <Input
                                    ref={newPlaylistRef}
                                    value={newPlaylistName}
                                    onChange={(e) => setNewPlaylistName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && createPlaylistAndAdd(t.id)}
                                    placeholder="Nom…"
                                    className="h-7 text-xs"
                                  />
                                  <button onClick={() => createPlaylistAndAdd(t.id)} className="px-2 py-1 text-xs bg-[#4A6FA5] text-white rounded">OK</button>
                                </div>
                              ) : (
                                <button
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-[#4A6FA5] rounded hover:bg-[#EDEAE3]"
                                  onClick={() => { setShowNewPlaylistInput(t.id); setTimeout(() => newPlaylistRef.current?.focus(), 50); }}
                                >
                                  <Plus className="h-3 w-3" /> Nouvelle playlist…
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="relative">
                          <button
                            onClick={() => setShowReps(showReps === t.id ? null : t.id)}
                            className="flex items-center gap-1 text-sm text-[#4A6FA5] hover:underline"
                          >
                            {t.boucle_infinie
                              ? <><Infinity className="h-4 w-4" /> Boucle</>
                              : <><RefreshCw className="h-4 w-4" /> {t.repetitions}×</>
                            }
                          </button>
                          {showReps === t.id && (
                            <div className="absolute z-10 top-8 left-0 bg-white border rounded-lg shadow-lg p-2 flex gap-1">
                              {REP_OPTIONS.map((opt) => (
                                <button
                                  key={`${opt.value}-${opt.loop}`}
                                  className={`px-3 py-2 text-sm rounded-md ${
                                    t.boucle_infinie === opt.loop && t.repetitions === opt.value
                                      ? 'bg-[#4A6FA5] text-white'
                                      : 'hover:bg-[#EDEAE3]'
                                  }`}
                                  onClick={() => { updateTitre(t.id, { repetitions: opt.value, boucle_infinie: opt.loop }); setShowReps(null); }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Note ──────────────────────────────────────────── */}
                      {editNotes[t.id] !== undefined ? (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            value={editNotes[t.id]}
                            onChange={(e) => setEditNotes(n => ({ ...n, [t.id]: e.target.value }))}
                            placeholder="Note personnelle…"
                            className="text-sm"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveNote(t.id)}>Enregistrer</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditNotes(n => { const c = { ...n }; delete c[t.id]; return c; })}>Annuler</Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditNotes(n => ({ ...n, [t.id]: t.note_aidant ?? '' }))}
                          className="mt-2 text-xs text-muted-foreground hover:text-[#4A6FA5]"
                        >
                          {t.note_aidant || '+ Ajouter une note'}
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

      {/* ── Légende ─────────────────────────────────────────────────────────── */}
      {titres.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Check className="h-3 w-3 text-[#7BA05B]" /> Fichier prêt</span>
          <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-amber-500" /> Ré-association requise</span>
          <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-destructive" /> Aucun fichier</span>
        </div>
      )}

      {/* ── Bouton "J'ai terminé" ────────────────────────────────────────────── */}
      <div className="pb-8">
        <Button
          size="lg"
          className="w-full bg-[#7BA05B] hover:bg-[#7BA05B]/90 text-white text-base font-semibold"
          onClick={() => router.push('/app')}
        >
          J&apos;ai terminé → Aller au lecteur
          <ChevronRight className="h-5 w-5 ml-2" />
        </Button>
      </div>

    </div>
  );
}
