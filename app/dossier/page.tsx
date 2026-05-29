'use client';
/**
 * /dossier — NeuroWake Music
 *
 * Mandatory transition page between onboarding and découverte.
 * Flow: onboarding → /dossier → /decouverte → /app
 *
 * Behaviour:
 *  - On mount: check IndexedDB (hasMusicFolder)
 *    → if folder already exists, redirect straight to /decouverte
 *    → otherwise show setup UI
 *
 *  - If File System Access API available (Chrome ≥86, Edge ≥86, Chrome Android):
 *      → ONLY the auto-create button (no manual instructions)
 *      → showDirectoryPicker() → getDirectoryHandle('NeuroWake Music', {create:true})
 *      → save handle to IndexedDB
 *      → show success then "Continuer →"
 *
 *  - If FSA NOT available (Safari, Firefox, iOS):
 *      → ONLY manual instructions for the detected OS (no auto button)
 *      → "J'ai créé le dossier → Continuer"
 *
 * Never mix the two modes on the same page.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as localStore from '@/lib/local-audio-store';
import { FolderOpen, CheckCircle2, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type State = 'checking' | 'setup' | 'creating' | 'done' | 'error';
type Platform = 'ios' | 'android' | 'desktop' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/windows|macintosh|linux/.test(ua) && !/mobile/.test(ua)) return 'desktop';
  return 'other';
}

export default function DossierPage() {
  const router = useRouter();
  const [state, setState] = useState<State>('checking');
  const [errorMsg, setErrorMsg] = useState('');
  const [platform, setPlatform] = useState<Platform>('other');

  // canUsePicker is evaluated client-side only (safe: supportsDirectoryPicker checks typeof window)
  const canUsePicker = localStore.supportsDirectoryPicker();

  useEffect(() => {
    setPlatform(detectPlatform());

    localStore.hasMusicFolder().then((has) => {
      if (has) {
        // Folder already configured — skip straight to selection
        router.replace('/decouverte');
      } else {
        setState('setup');
      }
    });
  }, [router]);

  async function handleAutoCreate() {
    setState('creating');
    setErrorMsg('');
    try {
      const handle = await localStore.setupMusicFolder();
      if (handle) {
        setState('done');
      } else {
        // User cancelled the picker without selecting — back to setup
        setState('setup');
      }
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      // AbortError = user pressed Cancel in the OS picker — treat as cancellation, not an error
      if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('cancel')) {
        setState('setup');
      } else {
        setErrorMsg(msg || 'Une erreur est survenue lors de la création du dossier.');
        setState('error');
      }
    }
  }

  // ── Checking (IndexedDB query in progress) ────────────────────────────────
  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#4A6FA5]" />
      </div>
    );
  }

  // ── Creating (picker open, waiting for OS response) ───────────────────────
  if (state === 'creating') {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center gap-5 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#4A6FA5]" />
          <p className="font-semibold text-[#2C2C2A] text-lg">Création du dossier en cours…</p>
          <p className="text-sm text-muted-foreground">
            Choisissez un emplacement dans la fenêtre qui vient de s&apos;ouvrir,<br />
            puis validez. Le dossier <strong>NeuroWake Music</strong> sera créé automatiquement à l&apos;intérieur.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex flex-col items-center justify-center p-4">
      {/* Breadcrumb */}
      <div className="w-full max-w-md mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-[#7BA05B] font-medium">✓ Profil</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-semibold text-[#2C2C2A]">Dossier musical</span>
        <ChevronRight className="h-3 w-3" />
        <span>Sélection des titres</span>
        <ChevronRight className="h-3 w-3" />
        <span>Lecteur</span>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-[#4A6FA5] px-6 py-5">
          <h1 className="text-white font-bold text-xl">Dossier NeuroWake Music</h1>
          <p className="text-white/80 text-sm mt-1">
            Étape 2 sur 3 — Préparation de votre espace musical
          </p>
        </div>

        <div className="px-6 py-6 space-y-5">

          {/* ── SUCCESS ────────────────────────────────────────────────────── */}
          {state === 'done' && (
            <div className="flex flex-col items-center py-4 gap-4 text-center">
              <CheckCircle2 className="h-14 w-14 text-[#7BA05B]" />
              <p className="font-semibold text-[#2C2C2A] text-lg">
                ✅ Dossier <strong>NeuroWake Music</strong> créé avec succès sur votre appareil.
              </p>
              <p className="text-sm text-muted-foreground">
                Après la sélection des titres, déposez-y vos fichiers audio (MP3, M4A, FLAC…)
                pour les associer à votre bibliothèque.
              </p>
              <Button
                onClick={() => router.push('/decouverte')}
                className="w-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 text-white mt-2"
                size="lg"
              >
                Continuer vers la sélection musicale
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ── ERROR ──────────────────────────────────────────────────────── */}
          {state === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 text-red-700 bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Impossible de créer le dossier</p>
                  {errorMsg && (
                    <p className="text-sm mt-1 text-red-600">{errorMsg}</p>
                  )}
                </div>
              </div>
              <Button variant="outline" onClick={() => setState('setup')} className="w-full">
                Réessayer
              </Button>
            </div>
          )}

          {/* ── SETUP — FSA AVAILABLE: auto button ONLY ────────────────────── */}
          {state === 'setup' && canUsePicker && (
            <div className="space-y-4">
              <p className="text-gray-700 text-sm leading-relaxed">
                NeuroWake Music lit vos fichiers audio directement depuis votre appareil —
                aucun fichier n&apos;est jamais envoyé sur Internet.
              </p>
              <p className="text-gray-700 text-sm leading-relaxed">
                Cliquez sur le bouton ci-dessous pour choisir un emplacement.
                Le dossier <strong>NeuroWake Music</strong> sera créé automatiquement
                à l&apos;intérieur.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800">
                <strong>Emplacement conseillé :</strong>{' '}
                {platform === 'android'
                  ? <>Téléchargements / <code className="font-mono font-bold">NeuroWake Music</code></>
                  : <>Musique / <code className="font-mono font-bold">NeuroWake Music</code></>
                }
              </div>

              <p className="text-xs text-gray-400">
                🔒 L&apos;app ne lit que ce dossier — aucun fichier n&apos;est envoyé sur Internet.
              </p>

              <Button
                onClick={handleAutoCreate}
                size="lg"
                className="w-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 text-white"
              >
                <FolderOpen className="h-5 w-5 mr-2" />
                J&apos;autorise — Créer le dossier sur mon appareil
              </Button>
            </div>
          )}

          {/* ── SETUP — FSA NOT AVAILABLE: manual instructions ONLY ────────── */}
          {state === 'setup' && !canUsePicker && (
            <div className="space-y-4">
              <p className="text-gray-700 text-sm leading-relaxed">
                Créez manuellement le dossier{' '}
                <strong>NeuroWake Music</strong> sur votre appareil,
                puis revenez ici pour continuer.
              </p>

              {/* iOS */}
              {platform === 'ios' && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 font-semibold text-sm text-gray-800 bg-gray-50">
                    📱 iPhone / iPad (iOS)
                  </div>
                  <ol className="px-4 py-3 space-y-2 text-sm text-gray-700 list-none">
                    <li>1. Ouvrez l&apos;app <strong>Fichiers</strong></li>
                    <li>2. Touchez <strong>Sur mon iPhone</strong> (ou Sur mon iPad)</li>
                    <li>3. Appuyez longuement → <strong>Nouveau dossier</strong></li>
                    <li>4. Nommez-le exactement :{' '}
                      <code className="font-mono bg-gray-100 px-1 rounded">NeuroWake Music</code>
                    </li>
                    <li>5. Revenez ici une fois le dossier créé</li>
                  </ol>
                </div>
              )}

              {/* Android sans FSA */}
              {platform === 'android' && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 font-semibold text-sm text-gray-800 bg-gray-50">
                    🤖 Android
                  </div>
                  <ol className="px-4 py-3 space-y-2 text-sm text-gray-700 list-none">
                    <li>1. Ouvrez le <strong>Gestionnaire de fichiers</strong></li>
                    <li>2. Allez dans <strong>Téléchargements</strong></li>
                    <li>3. Créez un dossier :{' '}
                      <code className="font-mono bg-gray-100 px-1 rounded">NeuroWake Music</code>
                    </li>
                    <li>4. Revenez ici une fois le dossier créé</li>
                  </ol>
                </div>
              )}

              {/* Desktop (Firefox) ou autre */}
              {(platform === 'desktop' || platform === 'other') && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 font-semibold text-sm text-gray-800 bg-gray-50">
                    🖥️ Windows / Mac
                  </div>
                  <ol className="px-4 py-3 space-y-2 text-sm text-gray-700 list-none">
                    <li>
                      Windows :{' '}
                      <code className="font-mono bg-gray-100 px-1 rounded text-xs">
                        Documents\NeuroWake Music
                      </code>
                    </li>
                    <li>
                      Mac :{' '}
                      <code className="font-mono bg-gray-100 px-1 rounded text-xs">
                        ~/Musique/NeuroWake Music
                      </code>
                    </li>
                    <li>Créez ce dossier dans l&apos;Explorateur ou le Finder.</li>
                  </ol>
                </div>
              )}

              <Button
                onClick={() => router.push('/decouverte')}
                size="lg"
                className="w-full bg-[#4A6FA5] hover:bg-[#4A6FA5]/90 text-white"
              >
                J&apos;ai créé le dossier — Continuer
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
