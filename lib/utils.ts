import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDate(dateStr: string, locale = 'fr-FR'): string {
  return new Date(dateStr).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function getCurrentPhase(): 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher' {
  const h = new Date().getHours();
  if (h >= 6 && h < 9) return 'matin';
  if (h >= 9 && h < 12) return 'soins';
  if (h >= 12 && h < 14) return 'repas';
  if (h >= 14 && h < 20) return 'apres-midi';
  return 'coucher';
}
