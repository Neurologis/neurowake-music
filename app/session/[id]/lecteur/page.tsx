'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAudioPlayer, type GammaMode } from '@/hooks/use-audio-player';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/hooks/use-toast';
import { formatDuration } from '@/lib/utils';
import {
  Play, Pause, SkipForward, Loader2, LogOut, Music2,
} from 'lucide-react';

interface SessionInfo {
  id: string;
  nom: string;
  gamma_enabled: boolean;
  messages_actifs: boolean;
}

interface PlaylistTrack {
  id: string;
  titre: string;
  artiste: string;
  annee: number | null;
  audio_url: string;
  duree_secondes: number | null;
  repetitions: number;
  boucle_infinie: boolean;
}

interface SessionMessage {
  id: string;
  position: string;
  audio_url: string;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
const gammaLabelKeys = ['Doux', 'Normal', 'Fort'];
const gammaValues    = [0.02, 0.04, 0.08];

export default function SessionLecteurPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [loading,       setLoading]       = useState(true);
  const [sessionInfo,   setSessionInfo]   = useState<SessionInfo | null>(null);
  const [tracks,        setTracksData]    = useState<PlaylistTrack[]>([]);
  const [playlistNom,   setPlaylistNom]   = useState('');
  const [messages,      setMessages]      = useState<SessionMessage[]>([]);

  const msgAudioRef = useRef<HTMLAudioElement | null>(null);

  const player = useAudioPlayer(0.04, 'am');

  useEffect(() => {
    if (!params.id) return;
    loadSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function loadSession() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/playlist?session_id=${params.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: 'Erreur', description: err.error ?? 'Session introuvable', variant: 'destructive' });
        router.replace('/session');
        return;
      }
      const { session, playlist } = await res.json();
      setSessionInfo(session);
      setPlaylistNom(playlist.nom);
      setTracksData(playlist.titres);
      setMessages(playlist.messages ?? []);

      // Auto-configure gamma from session settings
      if (!session.gamma_enabled) {
        player.setGammaEnabled(false);
      }
    } catch {
      toast({ title: 'Erreur réseau', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function playMessageAudio(audioUrl: string): Promise<void> {
    if (msgAudioRef.current) {
      msgAudioRef.current.pause();
      msgAudioRef.current = null;
    }
    return new Promise((resolve) => {
      const audio = new Audio(audioUrl);
      msgAudioRef.current = audio;
      audio.onended = () => { msgAudioRef.current = null; resolve(); };
      audio.onerror = () => { msgAudioRef.current = null; resolve(); };
      audio.play().catch(() => resolve());
    });
  }

  async function handlePlay() {
    if (player.isPlaying) {
      player.pause();
      return;
    }
    if (player.currentTrack) {
      player.resume();
      return;
    }
    if (tracks.length === 0) return;

    // Play debut message if enabled
    const debutMsg = messages.find((m) => m.position === 'debut_session');
    if (debutMsg?.audio_url) {
      await playMessageAudio(debutMsg.audio_url);
    }

    await player.playTrackList(tracks, playlistNom);
  }

  function handleQuit() {
    player.pause();
    if (msgAudioRef.current) {
      msgAudioRef.current.pause();
      msgAudioRef.current = null;
    }
    router.push('/session');
  }

  function getGammaLevel(): number {
    const idx = gammaValues.findIndex((v) => v >= player.gammaGain);
    return idx === -1 ? 1 : idx;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FFF8EE] via-[#F7F5F0] to-[#EEF2F9] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-[#F5A623] mx-auto" />
          <p className="text-muted-foreground">Chargement de la session…</p>
        </div>
      </div>
    );
  }

  if (!sessionInfo) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF8EE] via-[#F7F5F0] to-[#EEF2F9] pb-10">

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-[#EDEAE3] px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoappli.png" alt="NeuroWake Music" className="h-12 w-auto flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Session Collective</p>
            <p className="font-bold text-[#2C2C2A] truncate">{sessionInfo.nom}</p>
          </div>
        </div>
        <button
          onClick={handleQuit}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Quitter</span>
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Playlist title */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-[#F5A623]/10 border border-[#F5A623]/30 rounded-full px-4 py-1.5 mb-2">
            <Music2 className="h-4 w-4 text-[#F5A623]" />
            <span className="text-sm font-semibold text-[#F5A623]">{playlistNom}</span>
          </div>
          <p className="text-sm text-muted-foreground">{tracks.length} titre{tracks.length > 1 ? 's' : ''}</p>
        </div>

        {/* Play controls */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-6">

            {/* Play/Pause */}
            <button
              onClick={handlePlay}
              disabled={tracks.length === 0}
              className={`w-24 h-24 rounded-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 flex items-center justify-center transition-all shadow-xl disabled:opacity-50 ${player.isPlaying ? 'player-pulse' : ''}`}
            >
              {player.isPlaying
                ? <Pause className="h-10 w-10 text-white" />
                : <Play  className="h-10 w-10 text-white ml-1" />
              }
            </button>

            {/* Skip */}
            {player.tracks.length > 0 && (
              <button
                onClick={() => player.skipToNext()}
                disabled={player.currentIndex >= player.tracks.length - 1}
                className="w-14 h-14 rounded-full border-2 border-[#4A6FA5] text-[#4A6FA5] flex items-center justify-center hover:bg-[#4A6FA5]/10 transition-colors disabled:opacity-30"
              >
                <SkipForward className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* Current track */}
          {player.currentTrack ? (
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
          ) : (
            <p className="text-muted-foreground text-base">Appuyez sur Play pour démarrer</p>
          )}

          {/* Speed */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Vitesse</span>
            <div className="flex flex-wrap gap-2 justify-center">
              {SPEED_OPTIONS.map((rate) => (
                <button
                  key={rate}
                  onClick={() => player.setPlaybackRate(rate)}
                  className={`min-w-[56px] h-10 px-3 rounded-lg text-sm font-semibold border transition-all hover:-translate-y-0.5 ${
                    player.playbackRate === rate
                      ? 'bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white border-transparent shadow-md'
                      : 'bg-white border-gray-200 text-[#2C2C2A]'
                  }`}
                >
                  {rate}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Track list */}
        {tracks.length > 0 && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-md border border-white/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EDEAE3]">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {playlistNom} · {tracks.length} titre{tracks.length > 1 ? 's' : ''}
              </p>
            </div>
            <div className="divide-y divide-[#EDEAE3]">
              {tracks.map((track, index) => {
                const isActive = index === player.currentIndex && !!player.currentTrack;
                return (
                  <button
                    key={track.id}
                    onClick={() => player.playAtIndex(index)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isActive ? 'bg-[#4A6FA5]/8 text-[#4A6FA5]' : 'hover:bg-[#F7F5F0] text-[#2C2C2A]'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      isActive ? 'bg-[#4A6FA5] text-white' : 'bg-[#EDEAE3] text-muted-foreground'
                    }`}>
                      {isActive && player.isPlaying ? <Pause className="h-3 w-3" /> : index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>{track.titre}</p>
                      <p className="text-xs text-muted-foreground truncate">{track.artiste}</p>
                    </div>
                    {track.duree_secondes && (
                      <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                        {formatDuration(track.duree_secondes)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Protocole Cognitif 40Hz ── */}
        {sessionInfo.gamma_enabled && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-md border border-white/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-lg flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#4A6FA5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.96-3 2.5 2.5 0 0 1 .92-4.97A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.96-3 2.5 2.5 0 0 0-.92-4.97A2.5 2.5 0 0 0 14.5 2Z"/></svg>
                  Protocole Cognitif
                </p>
                <p className="text-sm text-muted-foreground">Stimulation gamma 40Hz</p>
              </div>
              <Switch
                checked={player.gammaEnabled && player.gammaMode !== 'binaural'}
                onCheckedChange={(v) => {
                  if (v) { player.setGammaMode('am'); player.setGammaEnabled(true); }
                  else   { player.setGammaEnabled(false); }
                }}
              />
            </div>

            {player.gammaEnabled && player.gammaMode !== 'binaural' && (
              <>
                <div className="flex justify-between text-sm mb-1">
                  {gammaLabelKeys.map((label, i) => (
                    <button
                      key={label}
                      className={`text-sm px-3 py-1 rounded-lg transition-all hover:-translate-y-0.5 ${
                        getGammaLevel() === i
                          ? 'bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white shadow-sm'
                          : 'bg-white border border-gray-200 text-muted-foreground'
                      }`}
                      onClick={() => player.setGammaGain(gammaValues[i])}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="[&_[role=slider]]:bg-[#F5A623] [&_[role=slider]]:border-[#F5A623] [&_[role=slider]]:hover:scale-110 [&_[role=slider]]:transition-transform [&_.bg-primary]:bg-[#F5A623] [&_.bg-secondary]:bg-gray-200">
                  <Slider
                    value={[player.gammaGain * 1000]}
                    min={20} max={80} step={10}
                    onValueChange={([v]) => player.setGammaGain(v / 1000)}
                  />
                </div>
                <div className="flex gap-2">
                  {(['monaural', 'am'] as GammaMode[]).map((mode) => (
                    <Button
                      key={mode}
                      className={`w-full h-11 text-sm transition-all hover:-translate-y-0.5 ${
                        player.gammaMode === mode
                          ? 'bg-gradient-to-r from-[#4A6FA5] to-[#6B8EC9] text-white border-transparent shadow-md'
                          : 'bg-white border border-gray-200 text-[#2C2C2A]'
                      }`}
                      onClick={() => player.setGammaMode(mode)}
                    >
                      {mode === 'monaural' ? 'Monaural' : 'Modulation AM'}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Protocole Anti-Stress (Binaural) ── */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-md border border-white/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-lg flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#7B6BB5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                Protocole Anti-Stress
              </p>
              <p className="text-sm text-muted-foreground">Son Binaural</p>
            </div>
            <Switch
              checked={player.gammaEnabled && player.gammaMode === 'binaural'}
              onCheckedChange={(v) => {
                if (v) { player.setGammaMode('binaural'); player.setGammaEnabled(true); }
                else   { player.setGammaEnabled(false); }
              }}
            />
          </div>
        </div>

        {/* Quitter */}
        <Button
          onClick={handleQuit}
          variant="outline"
          className="w-full h-12 text-base text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Quitter la session
        </Button>

      </div>
    </div>
  );
}
