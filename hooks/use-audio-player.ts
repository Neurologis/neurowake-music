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

  const [tracks, setTracksState] = useState<Track[]>([]);
  const tracksRef = useRef<Track[]>([]); // always in sync — avoids stale closures

  // Keep tracksRef in sync with state
  const updateTracks = useCallback((newTracks: Track[]) => {
    tracksRef.current = newTracks;
    setTracksState(newTracks);
  }, []);

  const audioCtxRef        = useRef<AudioContext | null>(null);
  const sourceRef          = useRef<AudioBufferSourceNode | null>(null);
  const gammaRef           = useRef<OscillatorNode | null>(null);
  const gammaGainRef       = useRef<GainNode | null>(null);
  const musicGainRef       = useRef<GainNode | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef       = useRef<number>(0);
  const offsetRef          = useRef<number>(0);
  const currentBufferRef   = useRef<AudioBuffer | null>(null);
  const repetitionCountRef = useRef<number>(0);
  const currentIndexRef    = useRef<number>(0);
  // Stable refs to avoid stale closures in callbacks
  const gammaEnabledRef    = useRef<boolean>(true);
  const gammaModeRef       = useRef<GammaMode>(initialGammaMode);
  const gammaGainValRef    = useRef<number>(initialGammaGain);

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
    if (gammaGainRef.current) {
      gammaGainRef.current.disconnect();
      gammaGainRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startGamma = useCallback((ctx: AudioContext, mode: GammaMode, gain: number) => {
    // Stop any existing gamma first
    if (gammaRef.current) {
      try { gammaRef.current.stop(); } catch {}
      gammaRef.current.disconnect();
      gammaRef.current = null;
    }
    if (gammaGainRef.current) {
      gammaGainRef.current.disconnect();
      gammaGainRef.current = null;
    }

    const gainNode = ctx.createGain();
    gainNode.gain.value = gain;
    gainNode.connect(ctx.destination);
    gammaGainRef.current = gainNode;

    if (mode === 'binaural') {
      const left  = ctx.createOscillator();
      const right = ctx.createOscillator();
      left.frequency.value  = 200;
      right.frequency.value = 240; // 40Hz difference = gamma beat
      const merger = ctx.createChannelMerger(2);
      const gainL  = ctx.createGain();
      const gainR  = ctx.createGain();
      gainL.gain.value = gain;
      gainR.gain.value = gain;
      left.connect(gainL);  right.connect(gainR);
      gainL.connect(merger, 0, 0);
      gainR.connect(merger, 0, 1);
      merger.connect(ctx.destination);
      left.start(); right.start();
      gammaRef.current = left; // stop left to stop both via disconnect
    } else if (mode === 'monaural') {
      const osc = ctx.createOscillator();
      osc.frequency.value = 40;
      osc.type = 'sine';
      osc.connect(gainNode);
      osc.start();
      gammaRef.current = osc;
    } else {
      // AM modulation: 200Hz carrier modulated by 40Hz
      const carrier   = ctx.createOscillator();
      const modulator = ctx.createOscillator();
      const modGain   = ctx.createGain();
      carrier.frequency.value   = 200;
      modulator.frequency.value = 40;
      modGain.gain.value        = 0.5;
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

    const response    = await fetch(track.audio_url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    currentBufferRef.current = audioBuffer;

    const source    = ctx.createBufferSource();
    source.buffer   = audioBuffer;
    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.85;
    source.connect(musicGain);
    musicGain.connect(ctx.destination);
    musicGainRef.current = musicGain;
    sourceRef.current    = source;

    startTimeRef.current = ctx.currentTime - offset;
    source.start(0, offset);

    setState((s) => ({
      ...s,
      isPlaying:    true,
      currentTrack: track,
      duration:     audioBuffer.duration,
      progress:     offset,
    }));

    progressIntervalRef.current = setInterval(() => {
      if (!audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
      setState((s) => ({ ...s, progress: Math.min(elapsed, audioBuffer.duration) }));
    }, 250);

    source.onended = () => {
      // Guard: if source was replaced (stop was called), ignore this event
      if (sourceRef.current !== source) return;

      const reps    = repetitionCountRef.current;
      const maxReps = track.boucle_infinie ? Infinity : track.repetitions;

      if (reps + 1 < maxReps) {
        // Repeat current track
        repetitionCountRef.current++;
        playTrack(track, 0);
      } else {
        // Advance to next track (using ref — no stale closure)
        repetitionCountRef.current = 0;
        const currentTracks = tracksRef.current;
        const nextIndex     = currentIndexRef.current + 1;

        if (nextIndex >= currentTracks.length) {
          // ── End of playlist — stop cleanly ──────────────────────────
          currentIndexRef.current = 0;
          setState((s) => ({ ...s, isPlaying: false, currentIndex: 0, currentTrack: null, progress: 0 }));
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
        } else {
          // ── Play next track ──────────────────────────────────────────
          currentIndexRef.current = nextIndex;
          setState((s) => ({ ...s, currentIndex: nextIndex }));
          playTrack(currentTracks[nextIndex], 0);
        }
      }
    };

    // Start gamma (using stable refs to avoid stale closure)
    if (gammaEnabledRef.current) {
      startGamma(ctx, gammaModeRef.current, gammaGainValRef.current);
    }
  }, [getAudioContext, stopCurrentPlayback, startGamma]);

  const loadPlaylist = useCallback(async (type: PlaylistType) => {
    const res = await fetch(`/api/playlist/${type}`);
    if (!res.ok) return;
    const { titres } = await res.json();
    currentIndexRef.current = 0;
    updateTracks(titres ?? []);
    setState((s) => ({ ...s, playlistType: type, currentIndex: 0 }));
    return titres as Track[];
  }, [updateTracks]);

  const playTrackList = useCallback(async (newTracks: Track[], playlistName?: string) => {
    if (!newTracks.length) return;
    currentIndexRef.current = 0;
    updateTracks(newTracks);
    setState((s) => ({ ...s, currentIndex: 0, customPlaylistName: playlistName }));
    repetitionCountRef.current = 0;
    await playTrack(newTracks[0], 0);
  }, [playTrack, updateTracks]);

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

  /** Jump directly to a track by its index in the current playlist. */
  const playAtIndex = useCallback(async (index: number) => {
    const track = tracksRef.current[index];
    if (!track) return;
    currentIndexRef.current = index;
    repetitionCountRef.current = 0;
    setState((s) => ({ ...s, currentIndex: index }));
    await playTrack(track, 0);
  }, [playTrack]);

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
    gammaEnabledRef.current = enabled;
    setState((s) => ({ ...s, gammaEnabled: enabled }));
    if (!enabled) {
      if (gammaRef.current) {
        try { gammaRef.current.stop(); } catch {}
        gammaRef.current.disconnect();
        gammaRef.current = null;
      }
      if (gammaGainRef.current) {
        gammaGainRef.current.disconnect();
        gammaGainRef.current = null;
      }
    } else if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      startGamma(audioCtxRef.current, gammaModeRef.current, gammaGainValRef.current);
    }
  }, [startGamma]);

  const setGammaGain = useCallback((gain: number) => {
    gammaGainValRef.current = gain;
    setState((s) => ({ ...s, gammaGain: gain }));
    if (gammaGainRef.current) {
      gammaGainRef.current.gain.value = gain;
    }
  }, []);

  /** Change 40Hz mode and restart oscillators immediately with the new mode. */
  const setGammaMode = useCallback((mode: GammaMode) => {
    gammaModeRef.current = mode;
    setState((s) => ({ ...s, gammaMode: mode }));
    // Restart gamma immediately so the user hears the difference right away
    if (gammaEnabledRef.current && audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      startGamma(audioCtxRef.current, mode, gammaGainValRef.current);
    }
  }, [startGamma]);

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
    playAtIndex,
    setGammaEnabled,
    setGammaGain,
    setGammaMode,
  };
}
