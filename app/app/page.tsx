'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Play, Pause, Music, ListMusic, Plus, Trash2, Loader2 } from 'lucide-react';
import { useAudioPlayer, type PlaylistType, type GammaMode } from '@/hooks/use-audio-player';
import { formatDuration, getCurrentPhase } from '@/lib/utils';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
import * as localStore from '@/lib/local-audio-store';

interface Profil {
  prenom_proche: string | null;
  acouphenes: boolean;
  gamma_gain: number;
  gamma_mode: GammaMode;
}

const PLAYLIST_LABELS: Record<PlaylistType, string> = {
  matin:        'Matin',
  soins:        'Soins',
  repas:        'Repas',
  'apres-midi': 'Après-midi',
  coucher:      'Coucher',
  favorite:     '⭐ Favorite',
};

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
 * Load playlist metadata from the API and resolve local audio URLs.
 * Returns only the tracks that have an associated local file.
 */
async function resolvePlaylist(apiUrl: string): Promise<PlaylistTrack[]> {
  const res = await fetch(apiUrl);
  if (!res.ok) return [];
  const { titres } = await res.json();
  if (!titres?.length) return [];

  const playable: PlaylistTrack[] = [];
  for (const t of titres) {
    const url = await localStore.getUrl(t.id);
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
    profil?.gamma_mode ?? 'binaural'
  );

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(({ profil: p }) => {
      if (p) {
        setProfil(p);
        if (typeof p.gamma_gain === 'number') player.setGammaGain(p.gamma_gain);
        if (p.gamma_mode) player.setGammaMode(p.gamma_mode);
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

  /** Resolve URLs and start playing a system playlist (matin/soins/…/favorite). */
  async function startSystemPlaylist(type: PlaylistType): Promise<boolean> {
    const tracks = await resolvePlaylist(`/api/playlist/${type}`);

    if (tracks.length === 0) {
      toast({
        title: 'Aucun fichier audio',
        description: `Associez des fichiers dans "Mes titres" pour la playlist ${PLAYLIST_LABELS[type]}.`,
      });
      return false;
    }

    await player.playTrackList(tracks, PLAYLIST_LABELS[type]);

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

    // Same playlist already playing → pause (toggle)
    if (player.isPlaying && activePlaylist === type) {
      player.pause();
      return;
    }

    await startSystemPlaylist(type);
  }

  async function launchUserPlaylist(pl: UserPlaylist) {
    setLaunchingPlaylistId(pl.id);
    try {
      const tracks = await resolvePlaylist(`/api/playlists/${pl.id}/titres`);

      if (tracks.length === 0) {
        toast({
          title: 'Aucun fichier associé',
          description: 'Associez des fichiers audio depuis "Mes titres" pour écouter cette playlist.',
        });
        return;
      }

      setActiveUserPlaylistId(pl.id);
      setActivePlaylist('matin');
      await player.playTrackList(tracks, pl.nom);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger la playlist.', variant: 'destructive' });
    } finally {
      setLaunchingPlaylistId(null);
    }
  }

  async function createPlaylist() {
    if (!newPlaylistName.trim()) return;
    setCreatingPlaylist(true);
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: newPlaylistName.trim() }),
    });
    if (res.ok) {
      const { playlist } = await res.json();
      setUserPlaylists(p => [...p, playlist]);
      setNewPlaylistName('');
      setShowCreatePlaylist(false);
      toast({ title: 'Playlist créée', description: `"${playlist.nom}" prête.` });
    }
    setCreatingPlaylist(false);
  }

  async function deleteUserPlaylist(id: string) {
    if (!confirm('Supprimer cette playlist ?')) return;
    await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
    setUserPlaylists(p => p.filter(x => x.id !== id));
    if (activeUserPlaylistId === id) setActiveUserPlaylistId(null);
  }

  const gammaLabels = ['Doux', 'Normal', 'Fort'];
  const gammaValues = [0.02, 0.04, 0.08];

  function getGammaLevel(): number {
    const idx = gammaValues.findIndex(v => v >= player.gammaGain);
    return idx === -1 ? 1 : idx;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#2C2C2A]">Lecteur</h1>

      {/* Sélecteur de playlist */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
        {(Object.keys(PLAYLIST_LABELS) as PlaylistType[]).map((type) => (
          <Button
            key={type}
            variant={activePlaylist === type ? 'default' : 'outline'}
            className={`text-sm h-12 ${activePlaylist === type ? 'bg-[#4A6FA5]' : ''}`}
            onClick={() => handlePlay(type)}
          >
            {PLAYLIST_LABELS[type]}
          </Button>
        ))}
      </div>

      {/* Mes playlists */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ListMusic className="h-4 w-4 text-[#4A6FA5]" />
              <span className="font-medium text-sm">Mes playlists</span>
            </div>
            <button
              onClick={() => {
                setShowCreatePlaylist(!showCreatePlaylist);
                if (!showCreatePlaylist) setTimeout(() => createInputRef.current?.focus(), 50);
              }}
              className="text-[#4A6FA5] hover:opacity-70 transition-opacity"
              title="Nouvelle playlist"
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
                placeholder='Ex : "Matin énergique"'
                className="text-sm"
              />
              <Button size="sm" onClick={createPlaylist} disabled={creatingPlaylist || !newPlaylistName.trim()}>
                {creatingPlaylist ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer'}
              </Button>
            </div>
          )}

          {userPlaylists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune playlist. Cliquez sur <span className="text-[#4A6FA5]">+</span> pour en créer une.
            </p>
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
                  <span className="text-sm font-medium truncate flex-1 mr-2">{pl.nom}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant={activeUserPlaylistId === pl.id ? 'default' : 'outline'}
                      className={`h-8 px-3 text-xs ${activeUserPlaylistId === pl.id ? 'bg-[#4A6FA5]' : ''}`}
                      onClick={() => launchUserPlaylist(pl)}
                      disabled={launchingPlaylistId === pl.id}
                    >
                      {launchingPlaylistId === pl.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <><Play className="h-3 w-3 mr-1" />Lancer</>
                      }
                    </Button>
                    <button
                      onClick={() => deleteUserPlaylist(pl.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grand bouton lecture */}
      <div className="flex flex-col items-center gap-4 py-8">
        <button
          onClick={() => handlePlay(activePlaylist)}
          className={`w-32 h-32 rounded-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 flex items-center justify-center transition-all shadow-lg ${player.isPlaying ? 'player-pulse' : ''}`}
        >
          {player.isPlaying
            ? <Pause className="h-12 w-12 text-white" />
            : <Play  className="h-12 w-12 text-white ml-2" />
          }
        </button>

        {player.currentTrack && (
          <div className="text-center">
            <p className="font-semibold text-[#2C2C2A]">{player.currentTrack.titre}</p>
            <p className="text-sm text-muted-foreground">{player.currentTrack.artiste}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span>{formatDuration(Math.floor(player.progress))}</span>
              <div className="w-32 h-1 bg-[#EDEAE3] rounded-full overflow-hidden">
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
          <p className="text-muted-foreground text-sm">Appuyez pour démarrer la lecture</p>
        )}
      </div>

      {/* Options */}
      <div className="space-y-4">
        {/* Message vocal */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  Message de {profil?.prenom_proche ? `votre aidant` : 'vous'}
                </p>
                {messageActif ? (
                  <p className="text-sm text-muted-foreground">{messageActif.titre}</p>
                ) : (
                  <Link href="/app/messages" className="text-sm text-[#4A6FA5] hover:underline">
                    Créer un message
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
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Fréquences 40Hz</p>
                <p className="text-xs text-muted-foreground">Stimulation sensorielle douce</p>
              </div>
              <Switch checked={player.gammaEnabled} onCheckedChange={player.setGammaEnabled} />
            </div>

            {player.gammaEnabled && (
              <>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    {gammaLabels.map((l, i) => (
                      <button
                        key={l}
                        className={`text-sm ${getGammaLevel() === i ? 'text-[#4A6FA5] font-semibold' : 'text-muted-foreground'}`}
                        onClick={() => player.setGammaGain(gammaValues[i])}
                      >
                        {l}
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

                {!profil?.acouphenes && (
                  <div className="flex gap-2">
                    {(['binaural', 'monaural', 'am'] as GammaMode[]).map((mode) => (
                      <Button
                        key={mode}
                        size="sm"
                        variant={player.gammaMode === mode ? 'default' : 'outline'}
                        className={player.gammaMode === mode ? 'bg-[#4A6FA5]' : ''}
                        onClick={() => player.setGammaMode(mode)}
                      >
                        {mode === 'binaural' ? 'Binaural' : mode === 'monaural' ? 'Monaural' : 'Modulation AM'}
                      </Button>
                    ))}
                  </div>
                )}
              </>
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
                  <p className="text-sm font-medium text-[#4A6FA5] mb-1">Conseil du moment</p>
                  <p className="text-sm text-[#2C2C2A]">{conseil}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
