'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Pause, Music } from 'lucide-react';
import { useAudioPlayer, type PlaylistType, type GammaMode } from '@/hooks/use-audio-player';
import { formatDuration, getCurrentPhase } from '@/lib/utils';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';

interface Profil {
  prenom_proche: string | null;
  acouphenes: boolean;
  gamma_gain: number;
  gamma_mode: GammaMode;
}

const PLAYLIST_LABELS: Record<PlaylistType, string> = {
  matin: 'Matin',
  soins: 'Soins',
  repas: 'Repas',
  'apres-midi': 'Après-midi',
  coucher: 'Coucher',
  favorite: '⭐ Favorite',
};

export default function PlayerPage() {
  const [profil, setProfil] = useState<Profil | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<PlaylistType>('matin');
  const [conseil, setConseil] = useState<string | null>(null);
  const [messageActif, setMessageActif] = useState<{ titre: string; audio_url: string | null } | null>(null);
  const [messageEnabled, setMessageEnabled] = useState(false);

  const player = useAudioPlayer(
    profil?.gamma_gain ?? 0.04,
    profil?.gamma_mode ?? 'binaural'
  );

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(({ profil: p }) => {
      if (p) setProfil(p);
    });
    loadConseil();
  }, []);

  useEffect(() => {
    loadConseil();
    loadMessage();
  }, [activePlaylist]);

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

  async function handlePlay(type: PlaylistType) {
    setActivePlaylist(type);
    await player.togglePlay(type);

    // Log session start
    fetch('/api/session/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playlist_type: type,
        duree_secondes: 0,
        gamma_actif: player.gammaEnabled,
        gamma_mode: player.gammaMode,
        message_joue: messageEnabled && !!messageActif,
      }),
    });
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
            onClick={() => setActivePlaylist(type)}
          >
            {PLAYLIST_LABELS[type]}
          </Button>
        ))}
      </div>

      {/* Grand bouton lecture */}
      <div className="flex flex-col items-center gap-4 py-8">
        <button
          onClick={() => handlePlay(activePlaylist)}
          className={`w-32 h-32 rounded-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 flex items-center justify-center transition-all shadow-lg ${player.isPlaying ? 'player-pulse' : ''}`}
        >
          {player.isPlaying ? (
            <Pause className="h-12 w-12 text-white" />
          ) : (
            <Play className="h-12 w-12 text-white ml-2" />
          )}
        </button>

        {/* Info titre en cours */}
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
                <Switch
                  checked={messageEnabled}
                  onCheckedChange={setMessageEnabled}
                />
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
              <Switch
                checked={player.gammaEnabled}
                onCheckedChange={player.setGammaEnabled}
              />
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
