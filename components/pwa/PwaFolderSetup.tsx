'use client';

/**
 * PwaFolderSetup — NeuroWake Music
 *
 * Affiché automatiquement au premier lancement en mode PWA installée
 * lorsque le dossier "NeuroWake Music" n'existe pas encore sur l'appareil.
 *
 * Plateforme         | Méthode
 * ────────────────── | ──────────────────────────────────────────────────────
 * Chrome / Edge      | showDirectoryPicker → crée NeuroWake Music automatiquement
 * (desktop + Android)|
 * ────────────────── | ──────────────────────────────────────────────────────
 * Safari / iOS       | Pas d'accès dossier via API → instructions manuelles
 * Firefox            | Pas de showDirectoryPicker → instructions manuelles
 *
 * Le handle du dossier est mémorisé dans IndexedDB via local-audio-store.ts
 * afin que les sessions suivantes s'ouvrent directement dans ce dossier.
 */

import { useEffect, useState, useCallback } from 'react';
import * as localStore from '@/lib/local-audio-store';
import { FolderOpen, CheckCircle2, X, Smartphone, Monitor } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Platform = 'desktop' | 'android' | 'ios' | 'other';
type Step = 'idle' | 'creating' | 'done' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Vrai si l'app tourne en mode PWA installée (standalone). */
function isPwaMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua))                               return 'ios';
  if (/android/.test(ua))                                        return 'android';
  if (/windows|macintosh|linux/.test(ua) && !/mobile/.test(ua)) return 'desktop';
  return 'other';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PwaFolderSetup() {
  const [visible, setVisible]   = useState(false);
  const [platform, setPlatform] = useState<Platform>('other');
  const [step, setStep]         = useState<Step>('idle');
  const [dismissed, setDismissed] = useState(false);

  // Initialisation côté client uniquement
  useEffect(() => {
    if (!isPwaMode()) return;         // Hors PWA → rien à faire
    if (dismissed)    return;

    const plt = detectPlatform();
    setPlatform(plt);

    localStore.hasMusicFolder().then((has) => {
      if (!has) setVisible(true);    // Pas encore configuré → afficher la modale
    });
  }, [dismissed]);

  // ── Création automatique (Chrome/Edge/Android) ──────────────────────────────
  const handleCreate = useCallback(async () => {
    setStep('creating');
    try {
      const handle = await localStore.setupMusicFolder();
      if (handle) {
        setStep('done');
        // Ferme la modale après un court délai pour que l'utilisateur voie la confirmation
        setTimeout(() => setVisible(false), 1800);
      } else {
        // L'utilisateur a annulé le picker → reste sur la modale
        setStep('idle');
      }
    } catch {
      setStep('error');
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
  };

  const canUsePicker = localStore.supportsDirectoryPicker();

  if (!visible) return null;

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-folder-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* En-tête */}
        <div className="bg-[#4A6FA5] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {platform === 'desktop'
              ? <Monitor className="h-6 w-6 text-white" />
              : <Smartphone className="h-6 w-6 text-white" />
            }
            <h2 id="pwa-folder-title" className="text-white font-bold text-lg leading-tight">
              Configuration initiale
            </h2>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Ignorer pour l'instant"
            className="text-white/70 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* ── Succès ─────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="flex flex-col items-center py-4 gap-3 text-center">
              <CheckCircle2 className="h-12 w-12 text-[#7BA05B]" />
              <p className="font-semibold text-gray-800 text-lg">
                Dossier <strong>NeuroWake Music</strong> créé !
              </p>
              <p className="text-sm text-gray-500">
                Placez-y vos fichiers audio pour les associer à vos titres.
              </p>
            </div>
          )}

          {/* ── Erreur ─────────────────────────────────────────────────── */}
          {step === 'error' && (
            <div className="space-y-3">
              <p className="text-red-600 font-medium text-sm">
                Une erreur est survenue. Essayez à nouveau ou créez le dossier manuellement.
              </p>
              <button
                onClick={() => setStep('idle')}
                className="text-[#4A6FA5] text-sm underline"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* ── Création automatique (Chrome / Edge / Android Chrome) ──── */}
          {/* ONLY shown when FSA is available — never mixed with manual instructions */}
          {(step === 'idle' || step === 'creating') && canUsePicker && (
            <div className="space-y-4">
              <p className="text-gray-700 text-sm leading-relaxed">
                Pour associer vos fichiers audio à vos titres, NeuroWake Music a besoin d&apos;un
                dossier dédié sur votre appareil.
              </p>
              <p className="text-gray-700 text-sm leading-relaxed">
                Cliquez sur le bouton ci-dessous pour choisir l&apos;emplacement.
                Le dossier <strong>NeuroWake Music</strong> sera créé automatiquement à l&apos;intérieur.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800">
                {platform === 'android' ? (
                  <>Recommandé : <code className="font-mono font-bold">Téléchargements / NeuroWake Music</code></>
                ) : (
                  <>Recommandé : <code className="font-mono font-bold">Musique / NeuroWake Music</code></>
                )}
              </div>

              <p className="text-xs text-gray-400">
                🔒 L&apos;application ne lit que ce dossier — aucun fichier n&apos;est envoyé sur Internet.
              </p>

              <button
                onClick={handleCreate}
                disabled={step === 'creating'}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4
                           bg-[#4A6FA5] hover:bg-[#3d5f8f] active:bg-[#3a5a89]
                           text-white font-semibold text-sm
                           disabled:opacity-60 disabled:cursor-not-allowed
                           transition-colors"
              >
                {step === 'creating' ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sélection du dossier…
                  </>
                ) : (
                  <>
                    <FolderOpen className="h-4 w-4" />
                    J&apos;autorise — Créer le dossier sur mon appareil
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── Instructions manuelles (iOS / Firefox / pas de FSA) ──────── */}
          {/* ONLY shown when FSA is NOT available — never mixed with auto button */}
          {!canUsePicker && step !== 'done' && (
            <div className="space-y-4">
              <p className="text-gray-700 text-sm leading-relaxed">
                Votre navigateur ne supporte pas la création automatique de dossier.
                Suivez les étapes ci-dessous pour votre appareil&nbsp;:
              </p>

              {/* iOS */}
              {(platform === 'ios' || (!canUsePicker && platform !== 'android' && platform !== 'desktop')) && (
                <details open className="border border-gray-200 rounded-lg overflow-hidden">
                  <summary className="px-4 py-3 font-semibold text-sm text-gray-800 cursor-pointer select-none bg-gray-50">
                    📱 iPhone / iPad (iOS)
                  </summary>
                  <ol className="px-4 py-3 space-y-2 text-sm text-gray-700 list-none">
                    <li>1. Ouvrez l&apos;app <strong>Fichiers</strong></li>
                    <li>2. Touchez <strong>Sur mon iPhone</strong> (ou Sur mon iPad)</li>
                    <li>3. Appuyez longuement → <strong>Nouveau dossier</strong></li>
                    <li>4. Nommez-le exactement : <code className="font-mono bg-gray-100 px-1 rounded">NeuroWake Music</code></li>
                    <li>5. Revenez ici et copiez vos fichiers audio dans ce dossier</li>
                  </ol>
                </details>
              )}

              {/* Android sans picker */}
              {platform === 'android' && !canUsePicker && (
                <details open className="border border-gray-200 rounded-lg overflow-hidden">
                  <summary className="px-4 py-3 font-semibold text-sm text-gray-800 cursor-pointer select-none bg-gray-50">
                    🤖 Android
                  </summary>
                  <ol className="px-4 py-3 space-y-2 text-sm text-gray-700 list-none">
                    <li>1. Ouvrez le <strong>Gestionnaire de fichiers</strong></li>
                    <li>2. Allez dans <strong>Téléchargements</strong></li>
                    <li>3. Créez un dossier <code className="font-mono bg-gray-100 px-1 rounded">NeuroWake Music</code></li>
                    <li>4. Copiez vos fichiers audio dans ce dossier</li>
                  </ol>
                </details>
              )}

              {/* Desktop sans picker (Firefox) */}
              {platform === 'desktop' && !canUsePicker && (
                <details open className="border border-gray-200 rounded-lg overflow-hidden">
                  <summary className="px-4 py-3 font-semibold text-sm text-gray-800 cursor-pointer select-none bg-gray-50">
                    🖥️ Windows / Mac (Firefox)
                  </summary>
                  <ol className="px-4 py-3 space-y-2 text-sm text-gray-700 list-none">
                    <li>Windows : <code className="font-mono bg-gray-100 px-1 rounded text-xs">C:\Utilisateurs\[vous]\Musique\NeuroWake Music</code></li>
                    <li>Mac : <code className="font-mono bg-gray-100 px-1 rounded text-xs">~/Musique/NeuroWake Music</code></li>
                    <li>Créez ce dossier, puis placez-y vos fichiers audio.</li>
                  </ol>
                </details>
              )}

              <button
                onClick={handleDismiss}
                className="w-full rounded-xl py-2.5 px-4 bg-gray-100 hover:bg-gray-200
                           text-gray-700 font-medium text-sm transition-colors"
              >
                J&apos;ai créé le dossier manuellement — Fermer
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
