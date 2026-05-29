'use client';
/**
 * /dossier — NeuroWake Music
 *
 * Mandatory transition page between onboarding and découverte.
 * Flow: onboarding → /dossier → /decouverte → /app
 *
 * Desktop Chrome/Edge (FSA available):
 *   - Shows explanatory block BEFORE the picker opens
 *   - User clicks "J'autorise" → OS folder picker opens
 *   - App creates "NeuroWake Music" subfolder automatically
 *   - Success: shows exact parent folder name + confirmation
 *
 * Mobile / Safari / Firefox (no FSA):
 *   - Shows a single plain-language instruction
 *   - "Continuer" button after manual creation
 *
 * Rules:
 *   - Never show auto button AND manual instructions at the same time
 *   - Never show the picker without prior explanation
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as localStore from '@/lib/local-audio-store';
import {
  FolderOpen, CheckCircle2, Loader2, AlertCircle, ChevronRight, Info,
} from 'lucide-react';
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
  // Parent folder name chosen by the user — shown in the success message
  const [parentFolderName, setParentFolderName] = useState<string | null>(null);

  // Safe to call at render time: supportsDirectoryPicker checks typeof window
  const canUsePicker = localStore.supportsDirectoryPicker();

  useEffect(() => {
    setPlatform(detectPlatform());
    localStore.hasMusicFolder().then((has) => {
      if (has) {
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
        // Retrieve the parent folder name that was stored during creation
        const parentName = await localStore.getMusicFolderParentName();
        setParentFolderName(parentName);
        setState('done');
      } else {
        // null = user cancelled the picker → silently go back to setup
        setState('setup');
      }
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('cancel')) {
        setState('setup');
      } else {
        setErrorMsg(msg || 'Une erreur est survenue lors de la création du dossier.');
        setState('error');
      }
    }
  }

  // ── Checking ──────────────────────────────────────────────────────────────
  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#4A6FA5]" />
      </div>
    );
  }

  // ── Creating (picker is open — OS window is on screen) ────────────────────
  if (state === 'creating') {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center gap-5 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#4A6FA5]" />
          <p className="font-bold text-[#2C2C2A] text-lg">La fenêtre est ouverte sur votre écran</p>
          <div className="text-sm text-gray-600 leading-relaxed text-left w-full bg-gray-50 rounded-lg p-4 space-y-1">
            <p>1. Naviguez jusqu&apos;au dossier <strong>Musique</strong> (ou Documents)</p>
            <p>2. Cliquez sur <strong>Sélectionner</strong> (ou Ouvrir)</p>
            <p className="text-[#7BA05B] font-medium pt-1">
              ✅ L&apos;app créera automatiquement le dossier NeuroWake Music à l&apos;intérieur
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex flex-col items-center justify-center p-4">

      {/* Breadcrumb */}
      <div className="w-full max-w-md mb-4 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
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

          {/* ── SUCCESS ──────────────────────────────────────────────────────── */}
          {state === 'done' && (
            <div className="flex flex-col items-center py-4 gap-4 text-center">
              <CheckCircle2 className="h-14 w-14 text-[#7BA05B]" />
              <div className="space-y-2">
                <p className="font-bold text-[#2C2C2A] text-lg">
                  ✅ Parfait !
                </p>
                <p className="text-gray-700 text-sm leading-relaxed">
                  Votre dossier <strong>NeuroWake Music</strong> a été créé
                  {parentFolderName
                    ? <> dans <strong>{parentFolderName}</strong></>
                    : <> sur votre appareil</>
                  }.
                </p>
                <p className="text-gray-600 text-sm">
                  Placez-y vos fichiers musicaux (MP3, M4A, FLAC…) après la sélection des titres.
                </p>
              </div>
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

          {/* ── SETUP — FSA DISPONIBLE : bouton auto UNIQUEMENT ───────────── */}
          {state === 'setup' && canUsePicker && (
            <div className="space-y-5">

              {/* Bloc explicatif — écrit pour des non-informaticiens */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-blue-900">
                  <Info className="h-4 w-4 flex-shrink-0" />
                  📁 Comment ça va se passer :
                </div>
                <p className="text-sm text-blue-800 leading-relaxed">
                  Quand vous cliquerez sur le bouton ci-dessous, <strong>une fenêtre va s&apos;ouvrir
                  sur votre écran</strong>.
                </p>
                <p className="text-sm text-blue-800 font-semibold">Dans cette fenêtre :</p>
                <ol className="text-sm text-blue-800 space-y-1 pl-1">
                  <li>1. Naviguez jusqu&apos;au dossier <strong>Musique</strong> (ou Documents) de votre ordinateur</li>
                  <li>2. Cliquez sur <strong>Sélectionner</strong> (ou Ouvrir)</li>
                  <li>
                    3. C&apos;est tout !{' '}
                    L&apos;application créera automatiquement le dossier{' '}
                    <strong>NeuroWake Music</strong> à l&apos;intérieur, sans que vous ayez
                    à faire quoi que ce soit d&apos;autre.
                  </li>
                </ol>
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                  <span className="text-amber-700 text-sm">
                    ⚠️ <strong>Important :</strong> ne créez pas vous-même le dossier —
                    laissez l&apos;application le faire pour vous.
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-400 text-center">
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

          {/* ── SETUP — PAS DE FSA : instructions manuelles UNIQUEMENT ──────── */}
          {state === 'setup' && !canUsePicker && (
            <div className="space-y-5">

              {/* Message unique, langage simple, adapté mobile */}
              {(platform === 'ios' || platform === 'android') ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 font-semibold text-blue-900 mb-3">
                    <Info className="h-4 w-4 flex-shrink-0" />
                    📱 Créer le dossier sur votre téléphone
                  </div>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    Sur votre téléphone, créez un dossier nommé exactement{' '}
                    <code className="font-mono font-bold bg-white border border-blue-200 px-1 rounded">
                      NeuroWake Music
                    </code>{' '}
                    dans votre application <strong>Fichiers</strong> ou <strong>Mes fichiers</strong>,
                    dans le dossier <strong>Musique</strong> ou <strong>Téléchargements</strong>.
                  </p>
                  <p className="text-sm text-blue-800 mt-3">
                    Une fois créé, revenez ici et cliquez sur <strong>Continuer</strong>.
                  </p>
                </div>
              ) : (
                /* Desktop sans FSA (Firefox, etc.) */
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 font-semibold text-blue-900 mb-3">
                    <Info className="h-4 w-4 flex-shrink-0" />
                    🖥️ Créer le dossier sur votre ordinateur
                  </div>
                  <p className="text-sm text-blue-800 leading-relaxed mb-3">
                    Votre navigateur ne permet pas la création automatique. Créez ce dossier
                    manuellement :
                  </p>
                  <div className="space-y-2 text-sm text-blue-800">
                    <p>
                      Windows :{' '}
                      <code className="font-mono bg-white border border-blue-200 px-1 rounded text-xs">
                        Documents\NeuroWake Music
                      </code>
                    </p>
                    <p>
                      Mac :{' '}
                      <code className="font-mono bg-white border border-blue-200 px-1 rounded text-xs">
                        ~/Musique/NeuroWake Music
                      </code>
                    </p>
                  </div>
                  <p className="text-sm text-blue-800 mt-3">
                    Une fois créé, revenez ici et cliquez sur <strong>Continuer</strong>.
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-400 text-center">
                🔒 L&apos;app ne lit que ce dossier — aucun fichier n&apos;est envoyé sur Internet.
              </p>

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
