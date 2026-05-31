'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Play, Pause, Music, ListMusic, Plus, Trash2, Loader2, SkipForward, Heart,
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

  const [profil, setProfil]                     = useState<Profil | null>(null);
  const [activePlaylist, setActivePlaylist]      = useState<PlaylistType>('matin');
  const [conseil, setConseil]                   = useState<string | null>(null);
  const [messageActif, setMessageActif]         = useState<{ titre: string; audio_url: string | null } | null>(null);
  const [messageEnabled, setMessageEnabled]     = useState(false);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadConseil();
    loadMessage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaylist]);

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

  async function loadMessage() {
    const res = await fetch(`/api/messages?phase=${activePlaylist}`);
    if (res.ok) {
      const { messages } = await res.json();
      const actif = messages?.find((m: { actif: boolean }) => m.actif);
      setMessageActif(actif ?? null);
    }
  }

  async function startSystemPlaylist(type: PlaylistType): Promise<boolean> {
    const tracks = await resolvePlaylist(`/api/playlist/${type}`);

    if (tracks.length === 0) {
      toast({
        title:       t('no_audio'),
        description: t('no_audio_for_phase'),
      });
      return false;
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
        message_joue:   messageEnabled && !!messageActif,
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
        toast({
          title:       t('no_audio'),
          description: t('no_audio_desc'),
        });
        return;
      }

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

      {/* ── Sélecteur de playlist par phase — texte ≥18px, icônes ≥28px ─── */}
      <div className="grid grid-cols-3 gap-2">
        {PLAYLIST_TYPES.map((type) => {
          const isActive = activePlaylist === type;
          return (
            <button
              key={type}
              onClick={() => handlePlay(type)}
              className={`
                flex flex-col items-center justify-center gap-1
                h-20 rounded-xl border-2 font-semibold transition-all
                ${isActive
                  ? 'bg-[#4A6FA5] border-[#4A6FA5] text-white shadow-md'
                  : 'bg-white border-[#EDEAE3] text-[#2C2C2A] hover:border-[#4A6FA5] hover:bg-[#4A6FA5]/5'
                }
              `}
            >
              {type === 'soins'
                ? <Heart className={`h-8 w-8 ${isActive ? 'text-white' : 'text-[#4A6FA5]'}`} />
                : type === 'matin'
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src="/Matin.png" width={48} height={48} alt="Matin" style={{ objectFit: 'contain' }} className={isActive ? 'brightness-[10]' : ''} />
                : type === 'repas'
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src="/Repas.png" width={48} height={48} alt="Repas" style={{ objectFit: 'contain' }} className={isActive ? 'brightness-[10]' : ''} />
                : <span className="text-3xl leading-none">{t(PHASE_EMOJI_KEYS[type])}</span>
              }
              <span className="text-[15px] leading-tight font-semibold">{t(PHASE_TEXT_KEYS[type])}</span>
            </button>
          );
        })}
      </div>

      {/* ── Mes playlists ────────────────────────────────────────────────── */}
      <Card>
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
            className={`w-28 h-28 rounded-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 flex items-center justify-center transition-all shadow-lg ${player.isPlaying ? 'player-pulse' : ''}`}
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
          <div className="flex gap-2">
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                onClick={() => player.setPlaybackRate(rate)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                  player.playbackRate === rate
                    ? 'bg-[#4A6FA5] text-white border-[#4A6FA5]'
                    : 'bg-white text-[#2C2C2A] border-[#EDEAE3] hover:border-[#4A6FA5]'
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
        <Card>
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
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="font-semibold text-base">{t('music_volume_label')}</p>
            <div className="flex gap-2 flex-wrap">
              {musicVolLabels.map((labelKey, i) => (
                <Button
                  key={labelKey}
                  size="sm"
                  variant={getMusicVolLevel() === i ? 'default' : 'outline'}
                  className={`text-base px-4 py-2 h-auto ${getMusicVolLevel() === i ? 'bg-[#4A6FA5]' : ''}`}
                  onClick={() => player.setMusicVolume(musicVolValues[i])}
                >
                  {t(labelKey)}
                </Button>
              ))}
            </div>
            <Slider
              value={[Math.round(player.musicVolume * 100)]}
              min={20}
              max={100}
              step={5}
              onValueChange={([v]) => player.setMusicVolume(v / 100)}
            />
          </CardContent>
        </Card>

        {/* Message vocal */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-base">{t('voice_msg')}</p>
                {messageActif ? (
                  <p className="text-sm text-muted-foreground">{messageActif.titre}</p>
                ) : (
                  <Link href="/app/messages" className="text-sm text-[#4A6FA5] hover:underline">
                    {t('create_msg')}
                  </Link>
                )}
              </div>
              {messageActif && (
                <Switch checked={messageEnabled} onCheckedChange={setMessageEnabled} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gamma 40Hz */}
        {/* Gamma 40Hz */}
<Card>
  <CardContent className="p-4 space-y-4">
    {/* Stimulation 40Hz */}
    <div className="flex items-center justify-between">
      <div>
        <p className="text-lg font-bold">{t('gamma_title')}</p>
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
                className={`text-base px-2 py-0.5 rounded ${getGammaLevel() === i ? 'text-[#4A6FA5] font-semibold bg-[#4A6FA5]/10' : 'text-muted-foreground'}`}
                onClick={() => player.setGammaGain(gammaValues[i])}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <Slider
            value={[player.gammaGain * 1000]}
            min={20}
            max={80}
            step={10}
            onValueChange={([v]) => player.setGammaGain(v / 1000)}
          />
        </div>
        <div className="flex gap-2">
          {(['monaural', 'am'] as GammaMode[]).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={player.gammaMode === mode ? 'default' : 'outline'}
              className={`text-base h-auto py-2 px-3 ${player.gammaMode === mode ? 'bg-[#4A6FA5]' : ''}`}
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
