'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Play, Pause, Music, ListMusic, Plus, Trash2, Loader2, SkipForward, Heart, Star,
} from 'lucide-react';
import { useAudioPlayer, type PlaylistType, type GammaMode } from '@/hooks/use-audio-player';
import { formatDuration, getCurrentPhase } from '@/lib/utils';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
import * as localStore from '@/lib/local-audio-store';
import { useT } from '@/hooks/use-t';
import type { TKey } from '@/lib/i18n';

interface Profil {
  prenom_proche: string | null;
  acouphenes: boolean;
  gamma_gain: number;
  gamma_mode: GammaMode;
  sensibilite_volume?: 'douce' | 'normale' | 'sensible';
}

const VOLUME_MAP: Record<string, number> = {
  douce:     0.5,
  normale:   0.85,
  sensible:  0.65,
};

// Static phase keys so they never get out of sync with TKey
const PHASE_EMOJI_KEYS: Record<PlaylistType, TKey> = {
  matin:        'phase_matin_emoji',
  soins:        'phase_soins_emoji',
  repas:        'phase_repas_emoji',
  'apres-midi': 'phase_aprem_emoji',
  coucher:      'phase_coucher_emoji',
  favorite:     'phase_favorite_emoji',
};
const PHASE_TEXT_KEYS: Record<PlaylistType, TKey> = {
  matin:        'phase_matin_text',
  soins:        'phase_soins_text',
  repas:        'phase_repas_text',
  'apres-midi': 'phase_aprem_text',
  coucher:      'phase_coucher_text',
  favorite:     'phase_favorite_text',
};
const PHASE_FULL_KEYS: Record<PlaylistType, TKey> = {
  matin:        'phase_matin',
  soins:        'phase_soins',
  repas:        'phase_repas',
  'apres-midi': 'phase_aprem',
  coucher:      'phase_coucher',
  favorite:     'phase_favorite',
};

const PLAYLIST_TYPES: PlaylistType[] = [
  'matin', 'soins', 'repas', 'apres-midi', 'coucher', 'favorite',
];

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;

interface UserPlaylist {
  id: string;
  nom: string;
  created_at: string;
}

interface PlaylistTrack {
  id: string;
  titre: string;
  artiste: string;
  audio_url: string;
  repetitions: number;
  boucle_infinie: boolean;
}

/**
 * Resolve a playlist from the API into playable tracks.
 *
 * For each track returned by the server we try to get a local object URL:
 *  1. Fast path: URL already in session cache (getUrl returns immediately).
 *  2. FSA handle with 'granted' permission: getUrl silently restores.
 *  3. FSA handle with 'prompt' permission: requestPermission() is called in
 *     a user-gesture context (the caller is always a button click handler).
 *
 * Tracks with no local file (never associated, or permission denied) are
 * silently skipped — the player can still play the rest of the list.
 */
async function resolvePlaylist(apiUrl: string): Promise<PlaylistTrack[]> {
  const res = await fetch(apiUrl);
  if (!res.ok) return [];
  const { titres } = await res.json();
  if (!titres?.length) return [];

  const playable: PlaylistTrack[] = [];
  for (const t of titres) {
    // Try fast path first
    let url = await localStore.getUrl(t.id);
    // If null and there's a stored handle with 'prompt' permission, ask now
    // (safe because resolvePlaylist is always called from a user gesture)
    if (!url) {
      url = await localStore.requestPermission(t.id);
    }
    if (url) {
      playable.push({
        id:             t.id,
        titre:          t.titre,
        artiste:        t.artiste,
        audio_url:      url,
        repetitions:    t.repetitions   ?? 1,
        boucle_infinie: t.boucle_infinie ?? false,
      });
    }
  }
  return playable;
}

export default function PlayerPage() {
  const { t } = useT();

  const [profil, setProfil]                 = useState<Profil | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<PlaylistType>('matin');
  const [conseil, setConseil]               = useState<string | null>(null);
  const [messageEnabled, setMessageEnabled] = useState(false);

  // ── Messages v2 — lookup maps (refs = toujours frais dans les closures) ────
  interface MsgEntry { titre: string; audio_url: string | null }
  // Pour l'affichage dans la carte : messages de la phase courante
  const [phaseMessageDebut, setPhaseMessageDebut] = useState<MsgEntry | null>(null);
  const [phaseMessageFin,   setPhaseMessageFin]   = useState<MsgEntry | null>(null);

  // Lookup maps utilisées pendant la lecture
  const phaseDebutMapRef  = useRef<Record<string, MsgEntry>>({});
  const phaseFinMapRef    = useRef<Record<string, MsgEntry>>({});
  const titreDebutMapRef  = useRef<Record<string, MsgEntry>>({});
  const titreFinMapRef    = useRef<Record<string, MsgEntry>>({});

  // Audio pour les messages vocaux (ne touche pas le Web Audio du player)
  const msgAudioRef        = useRef<HTMLAudioElement | null>(null);
  // Détection de changement de piste pour les messages par titre
  const prevTrackIndexRef  = useRef<number>(-1);
  // Évite de rejouer le message de fin si l'utilisateur a pausé manuellement
  const finMsgPlayedRef    = useRef<boolean>(false);

  const [userPlaylists, setUserPlaylists]               = useState<UserPlaylist[]>([]);
  const [launchingPlaylistId, setLaunchingPlaylistId]   = useState<string | null>(null);
  const [activeUserPlaylistId, setActiveUserPlaylistId] = useState<string | null>(null);
  const [showCreatePlaylist, setShowCreatePlaylist]     = useState(false);
  const [newPlaylistName, setNewPlaylistName]           = useState('');
  const [creatingPlaylist, setCreatingPlaylist]         = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);

  const player = useAudioPlayer(
    profil?.gamma_gain ?? 0.04,
    profil?.gamma_mode ?? 'am'
  );

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(({ profil: p }) => {
      if (p) {
        setProfil(p);
        if (typeof p.gamma_gain === 'number') player.setGammaGain(p.gamma_gain);
        if (p.gamma_mode && p.gamma_mode !== 'binaural') player.setGammaMode(p.gamma_mode);
        if (p.sensibilite_volume) {
          player.setMusicVolume(VOLUME_MAP[p.sensibilite_volume] ?? 0.85);
        }
      }
    });
    loadConseil();
    loadUserPlaylists();
    // Charger les messages une seule fois au montage
    loadMessage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadConseil();
    // Mettre à jour les états d'affichage depuis les refs (pas besoin de recharger l'API)
    setPhaseMessageDebut(phaseDebutMapRef.current[activePlaylist] ?? null);
    setPhaseMessageFin(phaseFinMapRef.current[activePlaylist]     ?? null);
    console.log('[NW] activePlaylist changed →', activePlaylist,
      '| debut:', phaseDebutMapRef.current[activePlaylist]?.titre ?? 'none',
      '| fin:',   phaseFinMapRef.current[activePlaylist]?.titre   ?? 'none');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaylist]);

  // ── Changement de piste → messages titre-spécifiques ──────────────────────
  useEffect(() => {
    const idx = player.currentIndex;
    console.log('[NW] track-change effect — idx:', idx, '| isPlaying:', player.isPlaying, '| msgEnabled:', messageEnabled);

    if (!messageEnabled || !player.isPlaying) return;
    if (idx < 0 || idx === prevTrackIndexRef.current) return;

    const prevIdx   = prevTrackIndexRef.current;
    const currentId = player.tracks[idx]?.id;
    console.log('[NW] track changed from', prevIdx, 'to', idx, '| currentId:', currentId?.slice(0,8));

    // Message FIN du titre précédent
    if (prevIdx >= 0) {
      const prevId = player.tracks[prevIdx]?.id;
      const finMsg = prevId ? titreFinMapRef.current[prevId] : undefined;
      console.log('[NW] titreFin for prev track:', finMsg?.titre ?? 'none');
      if (finMsg?.audio_url) playMessageAudio(finMsg.audio_url);
    }

    // Message DÉBUT du titre courant → pause musique, message, reprise
    const debutMsg = currentId ? titreDebutMapRef.current[currentId] : undefined;
    console.log('[NW] titreDebut for current track:', debutMsg?.titre ?? 'none');
    if (debutMsg?.audio_url) {
      player.pause();
      playMessageAudio(debutMsg.audio_url).then(() => player.resume());
    }

    prevTrackIndexRef.current = idx;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.currentIndex, player.isPlaying, messageEnabled]);

  // ── Fin de playlist → message de fin de phase ─────────────────────────────
  useEffect(() => {
    const tracks = player.tracks;
    const isLastTrack = tracks.length > 0 && player.currentIndex === tracks.length - 1;
    console.log('[NW] playlist-end effect — isPlaying:', player.isPlaying, '| isLastTrack:', isLastTrack,
      '| finPlayed:', finMsgPlayedRef.current, '| msgEnabled:', messageEnabled);

    if (!messageEnabled || finMsgPlayedRef.current) return;
    if (!player.isPlaying && isLastTrack && tracks.length > 0) {
      const finMsg = phaseFinMapRef.current[activePlaylist];
      console.log('[NW] playlist ended — phaseFin for', activePlaylist, ':', finMsg?.titre ?? 'none');
      if (finMsg?.audio_url) {
        finMsgPlayedRef.current = true;
        playMessageAudio(finMsg.audio_url);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.isPlaying, player.currentIndex, messageEnabled]);

  async function loadUserPlaylists() {
    const res = await fetch('/api/playlists');
    if (res.ok) {
      const { playlists } = await res.json();
      setUserPlaylists(playlists ?? []);
    }
  }

  async function loadConseil() {
    const phase = getCurrentPhase();
    const res = await fetch(`/api/conseils/${phase}`);
    if (res.ok) {
      const { conseil: c } = await res.json();
      setConseil(c);
    }
  }

  /**
   * Charge TOUS les messages avec leurs affectations et construit les lookup maps.
   * Appelé une seule fois au montage — les refs sont toujours frais dans les closures.
   */
  async function loadMessage() {
    console.log('[NW] loadMessage() — fetching /api/messages ...');
    const res = await fetch('/api/messages');
    if (!res.ok) {
      console.warn('[NW] loadMessage() — API error', res.status);
      return;
    }
    const { messages } = await res.json();
    console.log('[NW] loadMessage() — received', messages?.length ?? 0, 'messages');

    type Aff = { type_affectation: string; position: string; phase: string | null; titre_id: string | null };
    type Msg = { id: string; titre: string; audio_url: string | null; affectations?: Aff[] };

    const byPhaseDebut: Record<string, MsgEntry> = {};
    const byPhaseFin:   Record<string, MsgEntry> = {};
    const byTitreDebut: Record<string, MsgEntry> = {};
    const byTitreFin:   Record<string, MsgEntry> = {};

    for (const m of (messages ?? []) as Msg[]) {
      const affs = m.affectations ?? [];
      console.log(`[NW]   msg "${m.titre}" (id=${m.id.slice(0,8)}) — audio_url=${m.audio_url ? 'OK' : 'NULL'} — ${affs.length} affectation(s)`);
      const entry: MsgEntry = { titre: m.titre, audio_url: m.audio_url };
      for (const a of affs) {
        console.log(`[NW]     → ${a.type_affectation} | ${a.position} | phase=${a.phase} | titre_id=${a.titre_id?.slice(0,8) ?? 'null'}`);
        if (a.type_affectation === 'playlist_phase' && a.phase) {
          if (a.position === 'debut') byPhaseDebut[a.phase] = entry;
          else                        byPhaseFin[a.phase]   = entry;
        } else if (a.type_affectation === 'titre_specifique' && a.titre_id) {
          if (a.position === 'debut') byTitreDebut[a.titre_id] = entry;
          else                        byTitreFin[a.titre_id]   = entry;
        }
      }
    }

    console.log('[NW] loadMessage() — phaseDebut keys:', Object.keys(byPhaseDebut));
    console.log('[NW] loadMessage() — phaseFin keys:',   Object.keys(byPhaseFin));
    console.log('[NW] loadMessage() — titreDebut keys:', Object.keys(byTitreDebut));
    console.log('[NW] loadMessage() — titreFin keys:',   Object.keys(byTitreFin));

    // Mettre à jour les refs
    phaseDebutMapRef.current = byPhaseDebut;
    phaseFinMapRef.current   = byPhaseFin;
    titreDebutMapRef.current = byTitreDebut;
    titreFinMapRef.current   = byTitreFin;

    // Mettre à jour l'affichage pour la phase active courante
    // Note: activePlaylist peut être stale ici — on utilise la valeur initiale 'matin'
    // L'effet sur [activePlaylist] mettra à jour l'affichage ensuite
    const currentPhase = activePlaylist;
    const debutEntry = byPhaseDebut[currentPhase];
    const finEntry   = byPhaseFin[currentPhase];
    setPhaseMessageDebut(debutEntry ?? null);
    setPhaseMessageFin(finEntry     ?? null);

    // Auto-activer le switch si des messages sont affectés
    const hasAnyMessage = Object.keys(byPhaseDebut).length > 0 ||
                          Object.keys(byPhaseFin).length   > 0 ||
                          Object.keys(byTitreDebut).length > 0 ||
                          Object.keys(byTitreFin).length   > 0;
    if (hasAnyMessage) {
      console.log('[NW] loadMessage() — messages disponibles, activation du switch');
      setMessageEnabled(true);
    }
  }

  /**
   * Joue un message vocal via Audio HTML standard.
   * Arrête tout message en cours. Retourne une Promise qui se résout à la fin.
   */
  function playMessageAudio(audioUrl: string): Promise<void> {
    console.log('[NW] playMessageAudio() — url:', audioUrl.slice(0, 80) + '...');
    if (msgAudioRef.current) {
      msgAudioRef.current.pause();
      msgAudioRef.current.onended = null;
      msgAudioRef.current.onerror = null;
      msgAudioRef.current = null;
    }
    return new Promise<void>((resolve) => {
      const audio = new Audio(audioUrl);
      msgAudioRef.current = audio;
      audio.onended = () => {
        console.log('[NW] playMessageAudio() — ended');
        msgAudioRef.current = null;
        resolve();
      };
      audio.onerror = (e) => {
        console.error('[NW] playMessageAudio() — error', e);
        msgAudioRef.current = null;
        resolve();
      };
      audio.play().catch((err) => {
        console.error('[NW] playMessageAudio() — play() rejected:', err);
        msgAudioRef.current = null;
        resolve();
      });
    });
  }

  async function startSystemPlaylist(type: PlaylistType): Promise<boolean> {
    const tracks = await resolvePlaylist(`/api/playlist/${type}`);
    if (tracks.length === 0) {
      toast({ title: t('no_audio'), description: t('no_audio_for_phase') });
      return false;
    }

    prevTrackIndexRef.current = -1;
    finMsgPlayedRef.current   = false;

    console.log('[NW] startSystemPlaylist() — type:', type,
      '| messageEnabled:', messageEnabled,
      '| phaseDebut keys:', Object.keys(phaseDebutMapRef.current),
      '| phaseFin keys:',   Object.keys(phaseFinMapRef.current));

    // Message de début de phase
    if (messageEnabled) {
      const debutMsg = phaseDebutMapRef.current[type];
      console.log('[NW] startSystemPlaylist() — debutMsg for phase', type, ':', debutMsg ?? 'NONE');
      if (debutMsg?.audio_url) {
        console.log('[NW] startSystemPlaylist() — playing debut message before tracks');
        await playMessageAudio(debutMsg.audio_url);
      } else {
        console.log('[NW] startSystemPlaylist() — no debut message (audio_url null or no entry)');
      }
    } else {
      console.log('[NW] startSystemPlaylist() — messageEnabled=false, skipping messages');
    }

    await player.playTrackList(tracks, t(PHASE_FULL_KEYS[type]));

    fetch('/api/session/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playlist_type:  type,
        duree_secondes: 0,
        gamma_actif:    player.gammaEnabled,
        gamma_mode:     player.gammaMode,
        message_joue:   messageEnabled && !!(phaseDebutMapRef.current[type] || phaseFinMapRef.current[type]),
      }),
    });

    return true;
  }

  async function handlePlay(type: PlaylistType) {
    setActivePlaylist(type);

    // Same playlist, currently playing → pause
    if (player.isPlaying && activePlaylist === type) {
      player.pause();
      return;
    }

    // Same playlist, paused with an active track → resume
    if (!player.isPlaying && activePlaylist === type && player.currentTrack) {
      player.resume();
      return;
    }

    // Different or new playlist → load and start fresh
    await startSystemPlaylist(type);
  }

  async function launchUserPlaylist(pl: UserPlaylist) {
    setLaunchingPlaylistId(pl.id);
    try {
      const tracks = await resolvePlaylist(`/api/playlists/${pl.id}/titres`);
      if (tracks.length === 0) {
        toast({ title: t('no_audio'), description: t('no_audio_desc') });
        return;
      }

      prevTrackIndexRef.current = -1;
      finMsgPlayedRef.current   = false;
      setActiveUserPlaylistId(pl.id);
      await player.playTrackList(tracks, pl.nom);
    } catch {
      toast({ title: t('error_title'), description: t('error_load_playlist'), variant: 'destructive' });
    } finally {
      setLaunchingPlaylistId(null);
    }
  }

  async function createPlaylist() {
    const name = newPlaylistName.trim();
    if (!name) {
      toast({ title: t('error_title'), description: t('playlist_name_placeholder'), variant: 'destructive' });
      createInputRef.current?.focus();
      return;
    }
    setCreatingPlaylist(true);
    try {
      const res = await fetch('/api/playlists', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nom: name }),
      });
      if (res.ok) {
        const { playlist } = await res.json();
        setUserPlaylists(p => [...p, playlist]);
        setNewPlaylistName('');
        setShowCreatePlaylist(false);
        toast({ title: t('playlist_created_ok'), description: `"${playlist.nom}"` });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title:       t('error_title'),
          description: (err as { error?: string }).error ?? t('error_generic'),
          variant:     'destructive',
        });
      }
    } catch {
      toast({ title: t('error_title'), description: t('error_generic'), variant: 'destructive' });
    } finally {
      setCreatingPlaylist(false);
    }
  }

  async function deleteUserPlaylist(id: string) {
    if (!confirm(t('delete_playlist_confirm'))) return;
    await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
    setUserPlaylists(p => p.filter(x => x.id !== id));
    if (activeUserPlaylistId === id) setActiveUserPlaylistId(null);
    toast({ title: t('playlist_deleted_ok') });
  }

  // ── 40Hz volume helpers ──────────────────────────────────────────────────
  const gammaLabelKeys: TKey[]  = ['gamma_soft', 'gamma_normal', 'gamma_loud'];
  const gammaValues              = [0.02, 0.04, 0.08];

  function getGammaLevel(): number {
    const idx = gammaValues.findIndex(v => v >= player.gammaGain);
    return idx === -1 ? 1 : idx;
  }

  // ── Music volume helpers ─────────────────────────────────────────────────
  const musicVolLabels: TKey[]  = ['gamma_soft', 'gamma_normal', 'gamma_loud'];
  const musicVolValues           = [0.5, 0.85, 1.0];

  function getMusicVolLevel(): number {
    const idx = musicVolValues.findIndex(v => v >= player.musicVolume);
    return idx === -1 ? 1 : idx;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#2C2C2A]">{t('player_title')}</h1>

      {/* ── Sélecteur de playlist par phase — grille 3 colonnes mobile, 6 desktop ── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
        {PLAYLIST_TYPES.map((type) => {
          const isActive = activePlaylist === type;

          const phaseIcon = type === 'matin' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-7 w-7 ${isActive ? 'text-white' : 'text-[#F5A623]'}`}>
              <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
          ) : type === 'soins' ? (
            <Heart className={`h-7 w-7 ${isActive ? 'text-white' : 'text-[#E85D8A]'}`} />
          ) : type === 'repas' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-7 w-7 ${isActive ? 'text-white' : 'text-[#7BA05B]'}`}>
              <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
            </svg>
          ) : type === 'apres-midi' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-7 w-7 ${isActive ? 'text-white' : 'text-[#6B8EC9]'}`}>
              <path d="M17.5 19H9a7 7 0 116.71-9h1.79a4.5 4.5 0 110 9z"/>
            </svg>
          ) : type === 'coucher' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-7 w-7 ${isActive ? 'text-white' : 'text-[#7B6BB5]'}`}>
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
          ) : (
            <Star className={`h-7 w-7 fill-current ${isActive ? 'text-white' : 'text-[#F5A623]'}`} />
          );

          return (
            <button
              key={type}
              onClick={() => handlePlay(type)}
              className={`
                flex flex-col items-center justify-center gap-1
                h-20 rounded-2xl border font-semibold transition-all duration-200
                ${isActive
                  ? 'bg-gradient-to-r from-[#F5A623] to-[#E8A856] border-transparent text-white shadow-xl'
                  : 'bg-white border-[#EDEAE3] text-[#2C2C2A] shadow-md hover:-translate-y-1 hover:shadow-lg'
                }
              `}
            >
              {phaseIcon}
              <span className="text-sm font-semibold leading-tight">{t(PHASE_TEXT_KEYS[type])}</span>
            </button>
          );
        })}
      </div>

      {/* ── Mes playlists ────────────────────────────────────────────────── */}
      <Card className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60 hover:-translate-y-1 transition-all duration-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ListMusic className="h-5 w-5 text-[#4A6FA5]" />
              <span className="font-semibold text-base">{t('my_playlists')}</span>
            </div>
            <button
              onClick={() => {
                setShowCreatePlaylist(!showCreatePlaylist);
                if (!showCreatePlaylist) setTimeout(() => createInputRef.current?.focus(), 50);
              }}
              className="text-[#4A6FA5] hover:opacity-70 transition-opacity"
              title={t('btn_create')}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {showCreatePlaylist && (
            <div className="flex gap-2 mb-3">
              <Input
                ref={createInputRef}
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                placeholder={t('new_pl_name')}
                className="text-base"
              />
              <Button
                size="sm"
                onClick={createPlaylist}
                disabled={creatingPlaylist || !newPlaylistName.trim()}
                className="bg-[#4A6FA5] text-white min-w-[60px]"
              >
                {creatingPlaylist ? <Loader2 className="h-4 w-4 animate-spin" /> : t('ok_btn')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowCreatePlaylist(false); setNewPlaylistName(''); }}>
                ✕
              </Button>
            </div>
          )}

          {userPlaylists.length === 0 ? (
            <p className="text-base text-muted-foreground">{t('no_playlists')}</p>
          ) : (
            <div className="space-y-2">
              {userPlaylists.map((pl) => (
                <div
                  key={pl.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
                    activeUserPlaylistId === pl.id
                      ? 'bg-[#4A6FA5]/10 border-[#4A6FA5]'
                      : 'hover:bg-[#EDEAE3] border-transparent'
                  }`}
                >
                  <span className="text-base font-medium truncate flex-1 mr-2">{pl.nom}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant={activeUserPlaylistId === pl.id ? 'default' : 'outline'}
                      className={`h-8 px-3 text-sm ${activeUserPlaylistId === pl.id ? 'bg-[#4A6FA5]' : ''}`}
                      onClick={() => launchUserPlaylist(pl)}
                      disabled={launchingPlaylistId === pl.id}
                    >
                      {launchingPlaylistId === pl.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <><Play className="h-3 w-3 mr-1" />{t('btn_launch')}</>
                      }
                    </Button>
                    <button
                      onClick={() => deleteUserPlaylist(pl.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Grand bouton lecture + piste courante + contrôles ───────────── */}
      <div className="flex flex-col items-center gap-4 py-4">

        {/* Play / Pause + Titre suivant */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => {
              if (player.isPlaying) {
                player.pause();
              } else if (player.currentTrack) {
                player.resume();
              } else {
                handlePlay(activePlaylist);
              }
            }}
            className={`w-24 h-24 lg:w-28 lg:h-28 rounded-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 flex items-center justify-center transition-all shadow-lg ${player.isPlaying ? 'player-pulse' : ''}`}
          >
            {player.isPlaying
              ? <Pause className="h-12 w-12 text-white" />
              : <Play  className="h-12 w-12 text-white ml-2" />
            }
          </button>

          {/* Skip to next — visible as soon as a playlist is loaded */}
          {player.tracks.length > 0 && (
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => player.skipToNext()}
                disabled={player.currentIndex >= player.tracks.length - 1}
                className="w-14 h-14 rounded-full border-2 border-[#4A6FA5] text-[#4A6FA5] flex items-center justify-center hover:bg-[#4A6FA5]/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('next_track')}
              >
                <SkipForward className="h-7 w-7" />
              </button>
              <span className="text-xs text-muted-foreground">{t('next_track')}</span>
            </div>
          )}
        </div>

        {/* Piste courante */}
        {player.currentTrack && (
          <div className="text-center w-full max-w-xs">
            <p className="font-semibold text-[#2C2C2A] truncate text-base">{player.currentTrack.titre}</p>
            <p className="text-sm text-muted-foreground truncate">{player.currentTrack.artiste}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground justify-center">
              <span>{formatDuration(Math.floor(player.progress))}</span>
              <div className="w-36 h-2 bg-[#EDEAE3] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#4A6FA5] transition-all"
                  style={{ width: `${player.duration ? (player.progress / player.duration) * 100 : 0}%` }}
                />
              </div>
              <span>{formatDuration(Math.floor(player.duration))}</span>
            </div>
          </div>
        )}

        {!player.currentTrack && !player.isPlaying && (
          <p className="text-muted-foreground text-base">{t('press_play')}</p>
        )}

        {/* Vitesse de lecture */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">{t('speed_label')}</span>
          <div className="flex flex-wrap gap-2">
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                onClick={() => player.setPlaybackRate(rate)}
                className={`min-w-[60px] h-12 px-3 rounded-lg text-base font-semibold border transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${
                  player.playbackRate === rate
                    ? 'bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white border-transparent shadow-md'
                    : 'bg-white border-gray-200 text-[#2C2C2A] shadow-sm'
                }`}
              >
                {rate}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Liste des pistes ─────────────────────────────────────────────── */}
      {player.tracks.length > 0 && (
        <Card className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60 hover:-translate-y-1 transition-all duration-200">
          <CardContent className="p-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase mb-2 px-1">
              {t(PHASE_FULL_KEYS[activePlaylist])} · {player.tracks.length} {player.tracks.length > 1 ? 'titres' : 'titre'}
            </p>
            <div className="space-y-0.5">
              {player.tracks.map((track, index) => {
                const isActive = index === player.currentIndex && !!player.currentTrack;
                return (
                  <button
                    key={track.id}
                    onClick={() => player.playAtIndex(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-[#4A6FA5]/10 text-[#4A6FA5]'
                        : 'hover:bg-[#EDEAE3] text-[#2C2C2A]'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
                      isActive ? 'bg-[#4A6FA5] text-white' : 'bg-[#EDEAE3] text-muted-foreground'
                    }`}>
                      {isActive && player.isPlaying
                        ? <Pause className="h-3 w-3" />
                        : <Play  className="h-3 w-3 ml-0.5" />
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-base truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>
                        {track.titre}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{track.artiste}</p>
                    </div>
                    {isActive && (
                      <span className="text-sm text-[#4A6FA5] font-mono shrink-0">
                        {formatDuration(Math.floor(player.progress))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Options ──────────────────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* Volume musique */}
        <Card className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60 hover:-translate-y-1 transition-all duration-200">
          <CardContent className="p-5 space-y-3">
            <p className="font-bold text-lg flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#F5A623]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              {t('music_volume_label')}
            </p>
            <div className="flex gap-2 flex-wrap">
              {musicVolLabels.map((labelKey, i) => (
                <Button
                  key={labelKey}
                  className={`flex-1 text-base h-12 transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${
                    getMusicVolLevel() === i
                      ? 'bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white border-transparent shadow-md'
                      : 'bg-white border border-gray-200 text-[#2C2C2A] shadow-sm'
                  }`}
                  onClick={() => player.setMusicVolume(musicVolValues[i])}
                >
                  {t(labelKey)}
                </Button>
              ))}
            </div>
            <div className="[&_[role=slider]]:bg-[#F5A623] [&_[role=slider]]:border-[#F5A623] [&_[role=slider]]:shadow-md [&_[role=slider]]:hover:scale-110 [&_[role=slider]]:transition-transform [&_.bg-primary]:bg-[#F5A623] [&_.bg-secondary]:bg-gray-200">
              <Slider
                value={[Math.round(player.musicVolume * 100)]}
                min={20}
                max={100}
                step={5}
                onValueChange={([v]) => player.setMusicVolume(v / 100)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Message vocal */}
        <Card className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60 hover:-translate-y-1 transition-all duration-200">
          <CardContent className="p-5 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base">{t('voice_msg')}</p>
                {phaseMessageDebut || phaseMessageFin ? (
                  <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
                    {phaseMessageDebut && (
                      <p className="flex items-center gap-1">
                        <span className="text-[#7BA05B]">▶</span>
                        <span className="font-medium">{t('msg_position_debut')} :</span> {phaseMessageDebut.titre}
                      </p>
                    )}
                    {phaseMessageFin && (
                      <p className="flex items-center gap-1">
                        <span className="text-[#4A6FA5]">◀</span>
                        <span className="font-medium">{t('msg_position_fin')} :</span> {phaseMessageFin.titre}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Aucun message affecté à cette phase.
                  </p>
                )}
                <Link href="/app/messages" className="text-xs text-[#4A6FA5] hover:underline mt-1 inline-block">
                  Gérer les affectations →
                </Link>
              </div>
              {(phaseMessageDebut || phaseMessageFin) && (
                <Switch checked={messageEnabled} onCheckedChange={setMessageEnabled} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gamma 40Hz */}
<Card className="bg-white/90 backdrop-blur-sm shadow-md rounded-2xl border border-white/60 hover:-translate-y-1 transition-all duration-200">
  <CardContent className="p-5 space-y-4">
    {/* Stimulation 40Hz */}
    <div className="flex items-center justify-between">
      <div>
        <p className="text-lg font-bold flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#4A6FA5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.96-3 2.5 2.5 0 0 1 .92-4.97A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.96-3 2.5 2.5 0 0 0-.92-4.97A2.5 2.5 0 0 0 14.5 2Z"/></svg>
          {t('gamma_title')}
        </p>
        <p className="text-sm text-muted-foreground">{t('gamma_40hz_desc_short')}</p>
      </div>
      <Switch
        checked={player.gammaEnabled && player.gammaMode !== 'binaural'}
        onCheckedChange={(v) => {
          if (v) {
            player.setGammaMode('am');
            player.setGammaEnabled(true);
          } else {
            player.setGammaEnabled(false);
          }
        }}
      />
    </div>

    {player.gammaEnabled && player.gammaMode !== 'binaural' && (
      <>
        <div>
          <div className="flex justify-between text-sm mb-2">
            {gammaLabelKeys.map((labelKey, i) => (
              <button
                key={labelKey}
                className={`text-base px-2 py-0.5 rounded transition-all duration-200 hover:-translate-y-0.5 ${getGammaLevel() === i ? 'bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white font-semibold shadow-sm' : 'text-muted-foreground bg-white border border-gray-200'}`}
                onClick={() => player.setGammaGain(gammaValues[i])}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <div className="[&_[role=slider]]:bg-[#F5A623] [&_[role=slider]]:border-[#F5A623] [&_[role=slider]]:shadow-md [&_[role=slider]]:hover:scale-110 [&_[role=slider]]:transition-transform [&_.bg-primary]:bg-[#F5A623] [&_.bg-secondary]:bg-gray-200">
            <Slider
              value={[player.gammaGain * 1000]}
              min={20}
              max={80}
              step={10}
              onValueChange={([v]) => player.setGammaGain(v / 1000)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          {(['monaural', 'am'] as GammaMode[]).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={player.gammaMode === mode ? 'default' : 'outline'}
              className={`w-full text-base h-12 px-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${
                player.gammaMode === mode
                  ? 'bg-gradient-to-r from-[#4A6FA5] to-[#6B8EC9] text-white border-transparent shadow-md'
                  : 'bg-white border border-gray-200 text-[#2C2C2A] shadow-sm'
              }`}
              onClick={() => player.setGammaMode(mode)}
            >
              {mode === 'monaural' ? t('gamma_monaural') : t('gamma_am')}
            </Button>
          ))}
        </div>
      </>
    )}

    {/* Séparateur */}
    <div className="border-t border-[#EDEAE3]" />

    {/* Relaxation Binaural */}
    {!profil?.acouphenes && (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">{t('gamma_binaural_relax')}</p>
            <p className="text-sm text-muted-foreground">{t('gamma_binaural_relax_desc')}</p>
          </div>
          <Switch
            checked={player.gammaEnabled && player.gammaMode === 'binaural'}
            onCheckedChange={(v) => {
              if (v) {
                player.setGammaMode('binaural');
                player.setGammaEnabled(true);
              } else {
                player.setGammaEnabled(false);
              }
            }}
          />
        </div>
      </div>
    )}
  </CardContent>
</Card>

        {/* Conseil du moment */}
        {conseil && (
          <Card className="bg-[#4A6FA5]/5 border-[#4A6FA5]/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Music className="h-5 w-5 text-[#4A6FA5] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-base font-semibold text-[#4A6FA5] mb-1">{t('conseil_title')}</p>
                  <p className="text-base text-[#2C2C2A]">{conseil}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
