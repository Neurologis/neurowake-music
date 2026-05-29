'use client';

/**
 * ServiceWorkerRegistration
 * Enregistre /sw.js au premier rendu côté client.
 * Composant invisible — ne rend rien dans le DOM.
 */

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Vérification silencieuse des mises à jour
        reg.update().catch(() => {/* ignore en dev */});
      })
      .catch((err) => {
        console.warn('[SW] Enregistrement échoué :', err);
      });
  }, []);

  return null;
}
