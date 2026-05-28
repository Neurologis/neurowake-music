'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

export type PlaylistType = 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher' | 'favorite';
export type GammaMode = 'binaural' | 'monaural' | 'am';

interface Track {
  id: string;
  titre: string;
  artiste: string;
  audio_url: string;
  repetitions: number;
  boucle_infinie: boolean;
}

interface PlayerState {
  isPlaying: boolean;
  currentTrack: Track | null;
  currentIndex: number;
  progress: number;
  duration: number;
  gammaEnabled: boolean;
  gammaGain: number;
  gammaMode: GammaMode;
  playlistType: PlaylistType;
  customPlaylistName?: string;
}

export function useAudioPlayer(initialGammaGain = 0.04, initialGammaMode: GammaMode = 'binaural') {
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTrack: null,
    currentIndex: 0,
    progress: 0,
    duration: 0,
    gammaEnabled: true,
    gammaGain: initialGammaGain,
    gammaMode: initialGammaMode,
    playlistType: 'matin',
  });

  const [tracks, setTracks] = useState<Track[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gammaRef = useRef<OscillatorNode | null>(null);
  const gammaGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const currentBufferRef = useRef<AudioBuffer | null>(null);
  const repetitionCountRef = useRef<number>(0);
  // Ref-based currentIndex avoids stale closures in source.onended callbacks
  const currentIndexRef = useRef<number>(0);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const stopCurrentPlayback = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (gammaRef.current) {
      try { gammaRef.current.stop(); } catch {}
      gammaRef.current.disconnect();
      gammaRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startGamma = useCallback((ctx: AudioContext, mode: GammaMode, gain: number) => {
    const gainNode = ctx.createGain();
    gainNode.gain.value = gain;
    gainNode.connect(ctx.destination);
    gammaGainRef.current = gainNode;

    if (mode === 'binaural') {
      const left = ctx.createOscillator();
      const right = ctx.createOscillator();
      left.frequency.value = 200;
      right.frequency.value = 240; // 40Hz difference = gamma
      const merger = ctx.createChannelMerger(2);
      const gainL = ctx.createGain();
      const gainR = ctx.createGain();
      gainL.gain.value = gain;
      gainR.gain.value = gain;
      left.connect(gainL);
      right.connect(gainR);
      gainL.connect(merger, 0, 0);
      gainR.connect(merger, 0, 1);
      merger.connect(ctx.destination);
      left.start();
      right.start();
      gammaRef.current = left; // store one to stop both via disconnect
    } else if (mode === 'monaural') {
      const osc = ctx.createOscillator();
      osc.frequency.value = 40;
      osc.type = 'sine';
      osc.connect(gainNode);
      osc.start();
      gammaRef.current = osc;
    } else {
      // AM modulation: carrier at 200Hz, modulated at 40Hz
      const carrier = ctx.createOscillator();
      const modulator = ctx.createOscillator();
      const modGain = ctx.createGain();
      carrier.frequency.value = 200;
      modulator.frequency.value = 40;
      modGain.gain.value = 0.5;
      modulator.connect(modGain.gain);
      carrier.connect(gainNode);
      modulator.start();
      carrier.start();
      gammaRef.current = carrier;
    }
  }, []);

  const playTrack = useCallback(async (track: Track, offset = 0) => {
    const ctx = getAudioContext();

    stopCurrentPlayback();
    offsetRef.current = offset;

    const response = await fetch(track.audio_url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    currentBufferRef.current = audioBuffer;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.85;
    source.connect(musicGain);
    musicGain.connect(ctx.destination);
    musicGainRef.current = musicGain;
    sourceRef.current = source;

    startTimeRef.current = ctx.currentTime - offset;
    source.start(0, offset);

    setState((s) => ({
      ...s,
      isPlaying: true,
      currentTrack: track,
      duration: audioBuffer.duration,
      progress: offset,
    }));

    progressIntervalRef.current = setInterval(() => {
      if (!audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
      setState((s) => ({ ...s, progress: Math.min(elapsed, audioBuffer.duration) }));
    }, 250);

    source.onended = () => {
      if (!sourceRef.current) return;
      const reps = repetitionCountRef.current;
      const maxReps = track.boucle_infinie ? Infinity : track.repetitions;

      if (reps + 1 < maxReps) {
        repetitionCountRef.current++;
        playTrack(track, 0);
      } else {
        repetitionCountRef.current = 0;
        // Advance to next track — use ref to avoid stale closure on currentIndex
        setTracks((currentTracks) => {
          const nextIndex = (currentIndexRef.current + 1) % currentTracks.length;
          currentIndexRef.current = nextIndex;
          setState((s) => ({ ...s, currentIndex: nextIndex }));
          if (currentTracks[nextIndex]) {
            playTrack(currentTracks[nextIndex], 0);
          }
          return currentTracks;
        });
      }
    };

    // Start gamma
    if (state.gammaEnabled) {
      startGamma(ctx, state.gammaMode, state.gammaGain);
    }
  }, [getAudioContext, stopCurrentPlayback, startGamma, state.gammaEnabled, state.gammaMode, state.gammaGain]);

  const loadPlaylist = useCallback(async (type: PlaylistType) => {
    const res = await fetch(`/api/playlist/${type}`);
    if (!res.ok) return;
    const { titres } = await res.json();
    currentIndexRef.current = 0;
    setTracks(titres ?? []);
    setState((s) => ({ ...s, playlistType: type, currentIndex: 0 }));
    return titres as Track[];
  }, []);

  /**
   * Play a pre-loaded track list (user-created playlists).
   * Bypasses the API-based loadPlaylist and plays the given tracks directly.
   */
  const playTrackList = useCallback(async (newTracks: Track[], playlistName?: string) => {
    if (!newTracks.length) return;
    currentIndexRef.current = 0;
    setTracks(newTracks);
    setState((s) => ({ ...s, currentIndex: 0, customPlaylistName: playlistName }));
    repetitionCountRef.current = 0;
    await playTrack(newTracks[0], 0);
  }, [playTrack]);

  /**
   * Loads and starts the playlist.
   * Returns `true` if at least one track was found and playback started,
   * `false` if the playlist was empty (caller can show an appropriate message).
   */
  const play = useCallback(async (type?: PlaylistType): Promise<boolean> => {
    const playlistType = type ?? state.playlistType;
    const loaded = await loadPlaylist(playlistType);
    if (loaded && loaded.length > 0) {
      repetitionCountRef.current = 0;
      await playTrack(loaded[0], 0);
      return true;
    }
    return false;
  }, [loadPlaylist, playTrack, state.playlistType]);

  const pause = useCallback(() => {
    if (!audioCtxRef.current) return;
    if (audioCtxRef.current.state === 'running') {
      offsetRef.current = audioCtxRef.current.currentTime - startTimeRef.current;
      audioCtxRef.current.suspend();
      setState((s) => ({ ...s, isPlaying: false }));
    }
  }, []);

  const resume = useCallback(() => {
    if (!audioCtxRef.current) return;
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
      setState((s) => ({ ...s, isPlaying: true }));
    }
  }, []);

  const togglePlay = useCallback(async (type?: PlaylistType): Promise<boolean> => {
    if (state.isPlaying) {
      pause();
      return true;
    } else if (audioCtxRef.current?.state === 'suspended') {
      resume();
      return true;
    } else {
      return play(type);
    }
  }, [state.isPlaying, pause, resume, play]);

  const setGammaEnabled = useCallback((enabled: boolean) => {
    setState((s) => ({ ...s, gammaEnabled: enabled }));
    if (!enabled && gammaRef.current) {
      try { gammaRef.current.stop(); } catch {}
      gammaRef.current.disconnect();
      gammaRef.current = null;
    } else if (enabled && audioCtxRef.current && state.isPlaying) {
      startGamma(audioCtxRef.current, state.gammaMode, state.gammaGain);
    }
  }, [startGamma, state.isPlaying, state.gammaMode, state.gammaGain]);

  const setGammaGain = useCallback((gain: number) => {
    setState((s) => ({ ...s, gammaGain: gain }));
    if (gammaGainRef.current) {
      gammaGainRef.current.gain.value = gain;
    }
  }, []);

  const setGammaMode = useCallback((mode: GammaMode) => {
    setState((s) => ({ ...s, gammaMode: mode }));
  }, []);

  useEffect(() => {
    return () => {
      stopCurrentPlayback();
      audioCtxRef.current?.close();
    };
  }, [stopCurrentPlayback]);

  return {
    ...state,
    tracks,
    play,
    pause,
    resume,
    togglePlay,
    loadPlaylist,
    playTrackList,
    setGammaEnabled,
    setGammaGain,
    setGammaMode,
  };
}
