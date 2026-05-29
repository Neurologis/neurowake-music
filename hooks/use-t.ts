'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  type Langue, type TKey, tFn, getStoredLangue, storeLangue, LANGUAGE_CHANGE_EVENT,
} from '@/lib/i18n';

export function useT() {
  const [langue, setLangueState] = useState<Langue>('fr');

  useEffect(() => {
    // Read from localStorage after mount (avoids SSR mismatch)
    setLangueState(getStoredLangue());

    const handler = (e: Event) => {
      setLangueState((e as CustomEvent<Langue>).detail);
    };
    window.addEventListener(LANGUAGE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, handler);
  }, []);

  const t = useCallback((key: TKey): string => tFn(langue, key), [langue]);

  const setLangue = useCallback((newLangue: Langue) => {
    storeLangue(newLangue);
    setLangueState(newLangue);
  }, []);

  return { t, langue, setLangue };
}
