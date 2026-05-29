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
  musicVolume: number;
  playbackRate: number;
}

export function useAudioPlayer(initialGammaGain = 0.04, initialGammaMode: GammaMode = 'binaural') {
  const [state, setState] = useState<PlayerState>({
    isPlaying:         false,
    currentTrack:      null,
    currentIndex:      0,
    progress:          0,
    duration:          0,
    gammaEnabled:      true,
    gammaGain:         initialGammaGain,
    gammaMode:         initialGammaMode,
    playlistType:      'matin',
    musicVolume:       0.85,
    playbackRate:      1.0,
  });

  const [tracks, setTracksState] = useState<Track[]>([]);
  const tracksRef = useRef<Track[]>([]); // always in sync — avoids stale closures

  const updateTracks = useCallback((newTracks: Track[]) => {
    tracksRef.current = newTracks;
    setTracksState(newTracks);
  }, []);

  const audioCtxRef         = useRef<AudioContext | null>(null);
  const sourceRef           = useRef<AudioBufferSourceNode | null>(null);
  const gammaRef            = useRef<OscillatorNode | null>(null);
  const gammaGainRef        = useRef<GainNode | null>(null);
  const musicGainRef        = useRef<GainNode | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef        = useRef<number>(0);
  const offsetRef           = useRef<number>(0);
  const currentBufferRef    = useRef<AudioBuffer | null>(null);
  const repetitionCountRef  = useRef<number>(0);
  const currentIndexRef     = useRef<number>(0);

  // Stable refs — avoid stale closures in source.onended callbacks
  const gammaEnabledRef  = useRef<boolean>(true);
  const gammaModeRef     = useRef<GammaMode>(initialGammaMode);
  const gammaGainValRef  = useRef<number>(initialGammaGain);
  const musicVolumeRef   = useRef<number>(0.85);
  const playbackRateRef  = useRef<number>(1.0);

  // ── AudioContext helper ──────────────────────────────────────────────────
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // ── Stop all current nodes ───────────────────────────────────────────────
  const stopCurrentPlayback = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    // Gamma oscillators
    if (gammaRef.current) {
      try { gammaRef.current.stop(); } catch { /* already stopped */ }
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

  // ── Start 40Hz gamma oscillators ────────────────────────────────────────
  // BUG FIX: in binaural mode, the master gainNode was not in the signal path,
  // making setGammaGain have no effect. Now gainNode is always the output stage.
  const startGamma = useCallback((ctx: AudioContext, mode: GammaMode, gain: number) => {
    // Stop any running gamma first
    if (gammaRef.current) {
      try { gammaRef.current.stop(); } catch { /* ok */ }
      gammaRef.current.disconnect();
      gammaRef.current = null;
    }
    if (gammaGainRef.current) {
      gammaGainRef.current.disconnect();
      gammaGainRef.current = null;
    }

    // Master gain node — always used for all modes so setGammaGain works universally
    const gainNode = ctx.createGain();
    gainNode.gain.value = gain;
    gainNode.connect(ctx.destination);
    gammaGainRef.current = gainNode;

    if (mode === 'binaural') {
      // Two oscillators at 200 Hz and 240 Hz → 40 Hz beat perceived in the brain
      const left   = ctx.createOscillator();
      const right  = ctx.createOscillator();
      left.frequency.value  = 200;
      right.frequency.value = 240;

      const merger = ctx.createChannelMerger(2);
      const gainL  = ctx.createGain();
      const gainR  = ctx.createGain();
      gainL.gain.value = 1.0; // volume controlled by master gainNode
      gainR.gain.value = 1.0;

      left.connect(gainL);
      right.connect(gainR);
      gainL.connect(merger, 0, 0);
      gainR.connect(merger, 0, 1);
      merger.connect(gainNode); // route through master gain ← fix
      // Note: gainNode already connected to destination above

      left.start();
      right.start();
      gammaRef.current = left; // stopping left stops both via GC

    } else if (mode === 'monaural') {
      // Single 40 Hz sine wave
      const osc = ctx.createOscillator();
      osc.frequency.value = 40;
      osc.type = 'sine';
      osc.connect(gainNode);
      osc.start();
      gammaRef.current = osc;

    } else {
      // AM modulation: 200 Hz carrier amplitude-modulated by 40 Hz
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

  // ── Play a single track (core engine) ────────────────────────────────────
  const playTrack = useCallback(async (track: Track, offset = 0) => {
    const ctx = getAudioContext();
    stopCurrentPlayback();
    offsetRef.current = offset;

    const response    = await fetch(track.audio_url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    currentBufferRef.current = audioBuffer;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRateRef.current; // apply current speed

    const musicGain = ctx.createGain();
    musicGain.gain.value = musicVolumeRef.current; // apply current music volume
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
      // Guard: if source was replaced (stop called), ignore stale event
      if (sourceRef.current !== source) return;

      const reps    = repetitionCountRef.current;
      const maxReps = track.boucle_infinie ? Infinity : track.repetitions;

      if (reps + 1 < maxReps) {
        repetitionCountRef.current++;
        playTrack(track, 0);
      } else {
        repetitionCountRef.current = 0;
        const currentTracks = tracksRef.current;
        const nextIndex     = currentIndexRef.current + 1;

        if (nextIndex >= currentTracks.length) {
          // ── End of playlist — stop cleanly (no loop) ──────────────────────
          currentIndexRef.current = 0;
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          setState((s) => ({
            ...s,
            isPlaying:    false,
            currentIndex: 0,
            currentTrack: null,
            progress:     0,
          }));
        } else {
          // ── Advance to next track ─────────────────────────────────────────
          currentIndexRef.current = nextIndex;
          setState((s) => ({ ...s, currentIndex: nextIndex }));
          playTrack(currentTracks[nextIndex], 0);
        }
      }
    };

    // Start gamma oscillators (using stable refs — no stale closures)
    if (gammaEnabledRef.current) {
      startGamma(ctx, gammaModeRef.current, gammaGainValRef.current);
    }
  }, [getAudioContext, stopCurrentPlayback, startGamma]);

  // ── Load playlist from API ───────────────────────────────────────────────
  const loadPlaylist = useCallback(async (type: PlaylistType) => {
    const res = await fetch(`/api/playlist/${type}`);
    if (!res.ok) return;
    const { titres } = await res.json();
    currentIndexRef.current = 0;
    updateTracks(titres ?? []);
    setState((s) => ({ ...s, playlistType: type, currentIndex: 0 }));
    return titres as Track[];
  }, [updateTracks]);

  // ── Play a full track list ───────────────────────────────────────────────
  const playTrackList = useCallback(async (newTracks: Track[], playlistName?: string) => {
    if (!newTracks.length) return;
    currentIndexRef.current = 0;
    updateTracks(newTracks);
    setState((s) => ({ ...s, currentIndex: 0, customPlaylistName: playlistName }));
    repetitionCountRef.current = 0;
    await playTrack(newTracks[0], 0);
  }, [playTrack, updateTracks]);

  // ── High-level play (loads playlist) ────────────────────────────────────
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

  // ── Jump to track by index ───────────────────────────────────────────────
  const playAtIndex = useCallback(async (index: number) => {
    const track = tracksRef.current[index];
    if (!track) return;
    currentIndexRef.current = index;
    repetitionCountRef.current = 0;
    setState((s) => ({ ...s, currentIndex: index }));
    await playTrack(track, 0);
  }, [playTrack]);

  // ── Skip to next track ───────────────────────────────────────────────────
  const skipToNext = useCallback(async () => {
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex >= tracksRef.current.length) return;
    await playAtIndex(nextIndex);
  }, [playAtIndex]);

  // ── Pause (preserves position) ───────────────────────────────────────────
  const pause = useCallback(() => {
    if (!audioCtxRef.current) return;
    if (audioCtxRef.current.state === 'running') {
      offsetRef.current = audioCtxRef.current.currentTime - startTimeRef.current;
      audioCtxRef.current.suspend();
      setState((s) => ({ ...s, isPlaying: false }));
    }
  }, []);

  // ── Resume from paused position ──────────────────────────────────────────
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

  // ── 40Hz ON/OFF ──────────────────────────────────────────────────────────
  const setGammaEnabled = useCallback((enabled: boolean) => {
    gammaEnabledRef.current = enabled;
    setState((s) => ({ ...s, gammaEnabled: enabled }));
    if (!enabled) {
      if (gammaRef.current) {
        try { gammaRef.current.stop(); } catch { /* ok */ }
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

  // ── 40Hz gain (real-time) ────────────────────────────────────────────────
  const setGammaGain = useCallback((gain: number) => {
    gammaGainValRef.current = gain;
    setState((s) => ({ ...s, gammaGain: gain }));
    if (gammaGainRef.current) {
      gammaGainRef.current.gain.value = gain;
    }
  }, []);

  // ── 40Hz mode (restarts oscillators immediately) ──────────────────────────
  const setGammaMode = useCallback((mode: GammaMode) => {
    gammaModeRef.current = mode;
    setState((s) => ({ ...s, gammaMode: mode }));
    if (gammaEnabledRef.current && audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      startGamma(audioCtxRef.current, mode, gammaGainValRef.current);
    }
  }, [startGamma]);

  // ── Music volume (real-time) ──────────────────────────────────────────────
  const setMusicVolume = useCallback((volume: number) => {
    musicVolumeRef.current = volume;
    setState((s) => ({ ...s, musicVolume: volume }));
    if (musicGainRef.current) {
      musicGainRef.current.gain.value = volume;
    }
  }, []);

  // ── Playback speed ────────────────────────────────────────────────────────
  const setPlaybackRate = useCallback((rate: number) => {
    playbackRateRef.current = rate;
    setState((s) => ({ ...s, playbackRate: rate }));
    if (sourceRef.current) {
      sourceRef.current.playbackRate.value = rate;
    }
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────────────────
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
    skipToNext,
    setGammaEnabled,
    setGammaGain,
    setGammaMode,
    setMusicVolume,
    setPlaybackRate,
  };
}
