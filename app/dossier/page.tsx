'use client';
/**
 * /dossier — NeuroWake Music
 *
 * Mandatory transition page between onboarding and découverte.
 * Flow: onboarding → /dossier → /decouverte → /app
 *
 * Platform matrix:
 *   iOS / Firefox  — no FSA → blob storage only, no folder needed → skip instantly
 *   Android Chrome — FSA partial: user must create + select "NeuroWake Music" directly
 *   Safari macOS   — FSA partial: similar to Android
 *   PC Chrome/Edge — FSA full: auto-creates subfolder, just pick parent
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as localStore from '@/lib/local-audio-store';
import { useT } from '@/hooks/use-t';
import {
  FolderOpen, CheckCircle2, Loader2, AlertCircle, ChevronRight, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type State    = 'checking' | 'setup' | 'creating' | 'done' | 'error';
type Platform = 'ios' | 'android' | 'pc_chrome' | 'pc_safari' | 'firefox' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/firefox/.test(ua)) return 'firefox';
  if (/safari/.test(ua) && !/chrome/.test(ua)) return 'pc_safari';
  if (/chrome/.test(ua)) return 'pc_chrome';
  return 'other';
}

/** Platforms where FSA is not available and no folder setup is needed. */
function isNoFSAPlatform(p: Platform): boolean {
  return p === 'ios' || p === 'firefox';
}

export default function DossierPage() {
  const router   = useRouter();
  const { t }    = useT();
  const [state, setState]               = useState<State>('checking');
  const [errorMsg, setErrorMsg]         = useState('');
  const [platform, setPlatform]         = useState<Platform>('other');
  const [parentFolderName, setParentFolderName] = useState<string | null>(null);

  const canUsePicker = localStore.supportsDirectoryPicker();

  useEffect(() => {
    const plat = detectPlatform();
    setPlatform(plat);

    // iOS / Firefox → folder setup is irrelevant, proceed immediately
    if (isNoFSAPlatform(plat)) {
      localStore.markFolderSetupComplete().then(() => {
        setState('setup'); // show the "no folder needed" message briefly
      });
      return;
    }

    // All other platforms: check if already done
    localStore.isFolderSetupComplete().then((done) => {
      if (done) {
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
        const parentName = await localStore.getMusicFolderParentName();
        setParentFolderName(parentName);
        setState('done');
      } else {
        // null = user cancelled the picker
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

  async function handleNoFSAContinue() {
    await localStore.markFolderSetupComplete();
    router.push('/decouverte');
  }

  // ── Checking ───────────────────────────────────────────────────────────────
  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#4A6FA5]" />
      </div>
    );
  }

  // ── Creating (picker is open) ──────────────────────────────────────────────
  if (state === 'creating') {
    const isAndroidLike = platform === 'android';
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center gap-5 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#4A6FA5]" />
          <p className="font-bold text-[#2C2C2A] text-lg">La fenêtre est ouverte sur votre écran</p>
          {isAndroidLike ? (
            <div className="text-sm text-gray-600 leading-relaxed text-left w-full bg-gray-50 rounded-lg p-4 space-y-1.5">
              <p>1. {t('folder_android_step1')}</p>
              <p>2. {t('folder_android_step2')}</p>
              <p>3. {t('folder_android_step3')}</p>
              <p>4. {t('folder_android_step4')}</p>
              <p>5. {t('folder_android_step5')}</p>
            </div>
          ) : (
            <div className="text-sm text-gray-600 leading-relaxed text-left w-full bg-gray-50 rounded-lg p-4 space-y-1">
              <p>1. Naviguez jusqu&apos;au dossier <strong>Musique</strong> (ou Documents)</p>
              <p>2. Cliquez sur <strong>Sélectionner</strong> (ou Ouvrir)</p>
              <p className="text-[#7BA05B] font-medium pt-1">
                ✅ L&apos;app créera automatiquement le dossier NeuroWake Music à l&apos;intérieur
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF8EE] via-[#F7F5F0] to-[#EEF2F9] flex flex-col items-center justify-center p-4">

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

      <div className="w-full max-w-md bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/60 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#4A6FA5] to-[#6B8EC9] px-6 py-5">
          <h1 className="text-white font-bold text-xl">Dossier NeuroWake Music</h1>
          <p className="text-white/80 text-sm mt-1">
            Étape 2 sur 3 — Préparation de votre espace musical
          </p>
        </div>

        <div className="px-6 py-6 space-y-5">

          {/* ── SUCCESS ─────────────────────────────────────────────────────── */}
          {state === 'done' && (
            <div className="flex flex-col items-center py-4 gap-4 text-center">
              <CheckCircle2 className="h-14 w-14 text-[#7BA05B]" />
              <div className="space-y-2">
                <p className="font-bold text-[#2C2C2A] text-lg">✅ Parfait !</p>
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
                className="w-full h-12 bg-gradient-to-r from-[#4A6FA5] to-[#6B8EC9] text-white hover:-translate-y-0.5 transition-all"
                size="lg"
              >
                Continuer vers la sélection musicale
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ── ERROR ───────────────────────────────────────────────────────── */}
          {state === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 text-red-700 bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Impossible de créer le dossier</p>
                  {errorMsg && <p className="text-sm mt-1 text-red-600">{errorMsg}</p>}
                </div>
              </div>
              <Button variant="outline" onClick={() => setState('setup')} className="w-full h-12">
                Réessayer
              </Button>
            </div>
          )}

          {/* ── SETUP ───────────────────────────────────────────────────────── */}
          {state === 'setup' && (
            <>
              {/* ── iOS : pas de dossier nécessaire ── */}
              {platform === 'ios' && (
                <div className="space-y-5">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-blue-900 text-lg">
                      📱 iPhone / iPad
                    </div>
                    <p className="text-base text-blue-800 leading-relaxed">
                      {t('folder_ios_no_setup')}
                    </p>
                    <p className="text-sm text-blue-700">
                      Importez simplement vos fichiers audio depuis <strong>Mes titres</strong>.
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    🔒 Aucun fichier n&apos;est envoyé sur internet.
                  </p>
                  <Button
                    onClick={() => router.push('/app/titres')}
                    size="lg"
                    className="w-full h-12 bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white hover:-translate-y-0.5 transition-all"
                  >
                    {t('folder_go_to_tracks')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                  <Button
                    onClick={handleNoFSAContinue}
                    variant="outline"
                    size="lg"
                    className="w-full h-12"
                  >
                    {t('folder_continue_btn')}
                  </Button>
                </div>
              )}

              {/* ── Firefox : pas de dossier nécessaire ── */}
              {platform === 'firefox' && (
                <div className="space-y-5">
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-orange-900 text-lg">
                      🦊 Firefox
                    </div>
                    <p className="text-base text-orange-800 leading-relaxed">
                      {t('folder_firefox_no_setup')}
                    </p>
                    <p className="text-sm text-orange-700">
                      Importez simplement vos fichiers audio depuis <strong>Mes titres</strong>.
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    🔒 Aucun fichier n&apos;est envoyé sur internet.
                  </p>
                  <Button
                    onClick={() => router.push('/app/titres')}
                    size="lg"
                    className="w-full h-12 bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white hover:-translate-y-0.5 transition-all"
                  >
                    {t('folder_go_to_tracks')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                  <Button
                    onClick={handleNoFSAContinue}
                    variant="outline"
                    size="lg"
                    className="w-full h-12"
                  >
                    {t('folder_continue_btn')}
                  </Button>
                </div>
              )}

              {/* ── Android Chrome / Samsung Internet ── */}
              {platform === 'android' && canUsePicker && (
                <div className="space-y-5">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-green-900 text-lg">
                      📱 Sur Android — suivez ces étapes :
                    </div>
                    <ol className="text-base text-green-800 space-y-2 pl-1">
                      <li>1. {t('folder_android_step1')}</li>
                      <li>2. {t('folder_android_step2')}</li>
                      <li>3. {t('folder_android_step3')}</li>
                      <li>4. {t('folder_android_step4')}</li>
                      <li>5. {t('folder_android_step5')}</li>
                    </ol>
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    🔒 L&apos;app ne lit que ce dossier — aucun fichier n&apos;est envoyé sur Internet.
                  </p>
                  <Button
                    onClick={handleAutoCreate}
                    size="lg"
                    className="w-full h-14 bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white text-base font-semibold hover:-translate-y-0.5 transition-all"
                  >
                    <FolderOpen className="h-5 w-5 mr-2" />
                    J&apos;autorise — Créer le dossier
                  </Button>
                </div>
              )}

              {/* ── Safari macOS ── */}
              {platform === 'pc_safari' && canUsePicker && (
                <div className="space-y-5">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-gray-900 text-lg">
                      🍎 Sur Safari Mac — suivez ces étapes :
                    </div>
                    <ol className="text-base text-gray-700 space-y-2 pl-1">
                      <li>1. Appuyez sur &quot;J&apos;autorise&quot; ci-dessous</li>
                      <li>2. Dans le Finder → créez un dossier <strong>NeuroWake Music</strong> dans votre dossier Musique</li>
                      <li>3. Sélectionnez ce dossier et cliquez <strong>Ouvrir</strong></li>
                    </ol>
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    🔒 L&apos;app ne lit que ce dossier — aucun fichier n&apos;est envoyé sur Internet.
                  </p>
                  <Button
                    onClick={handleAutoCreate}
                    size="lg"
                    className="w-full h-14 bg-gradient-to-r from-[#4A6FA5] to-[#6B8EC9] text-white text-base font-semibold hover:-translate-y-0.5 transition-all"
                  >
                    <FolderOpen className="h-5 w-5 mr-2" />
                    J&apos;autorise — Sélectionner le dossier
                  </Button>
                </div>
              )}

              {/* ── PC Chrome / Edge (création auto) ── */}
              {(platform === 'pc_chrome' || platform === 'other') && canUsePicker && (
                <div className="space-y-5">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-blue-900">
                      <Info className="h-4 w-4 flex-shrink-0" />
                      🖥️ Création automatique disponible
                    </div>
                    <p className="text-base text-blue-800 leading-relaxed">
                      Cliquez sur <strong>J&apos;autorise</strong> — naviguez vers votre
                      dossier <strong>Musique</strong> et cliquez <strong>Sélectionner</strong>.
                    </p>
                    <p className="text-sm text-blue-700 font-medium">
                      ✅ Le dossier <strong>NeuroWake Music</strong> sera créé automatiquement.
                    </p>
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
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
                    className="w-full h-14 bg-gradient-to-r from-[#4A6FA5] to-[#6B8EC9] text-white text-base font-semibold hover:-translate-y-0.5 transition-all"
                  >
                    <FolderOpen className="h-5 w-5 mr-2" />
                    J&apos;autorise — Créer le dossier sur mon appareil
                  </Button>
                </div>
              )}

              {/* ── Fallback : pas de picker disponible sur cette plateforme ── */}
              {!canUsePicker && !isNoFSAPlatform(platform) && (
                <div className="space-y-5">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-blue-900">
                      <Info className="h-4 w-4 flex-shrink-0" />
                      🖥️ Créer le dossier manuellement
                    </div>
                    <p className="text-sm text-blue-800 leading-relaxed mb-3">
                      Votre navigateur ne permet pas la création automatique. Créez ce dossier manuellement :
                    </p>
                    <div className="space-y-2 text-sm text-blue-800">
                      <p>Windows : <code className="font-mono bg-white border border-blue-200 px-1 rounded text-xs">Documents\NeuroWake Music</code></p>
                      <p>Mac : <code className="font-mono bg-white border border-blue-200 px-1 rounded text-xs">~/Musique/NeuroWake Music</code></p>
                    </div>
                    <p className="text-sm text-blue-800 mt-3">
                      Une fois créé, cliquez sur <strong>Continuer</strong>.
                    </p>
                  </div>
                  <Button
                    onClick={handleNoFSAContinue}
                    size="lg"
                    className="w-full h-12 bg-gradient-to-r from-[#4A6FA5] to-[#6B8EC9] text-white hover:-translate-y-0.5 transition-all"
                  >
                    J&apos;ai créé le dossier — {t('folder_continue_btn')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
