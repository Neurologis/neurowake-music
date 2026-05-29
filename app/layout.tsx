import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import ServiceWorkerRegistration from '@/components/pwa/ServiceWorkerRegistration';
import PwaFolderSetup from '@/components/pwa/PwaFolderSetup';

export const metadata: Metadata = {
  title: 'NeuroWake Music',
  description: 'La musique qui lui parle vraiment',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.neurologis.fr'),
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'NeuroWake Music',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/logo-neurowake.png',
  },
};

/** theme-color déclaré via viewport (Next.js 14+) */
export const viewport: Viewport = {
  themeColor: '#4A6FA5',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        {/* PWA — service worker + configuration initiale du dossier musique */}
        <ServiceWorkerRegistration />
        <PwaFolderSetup />
      </body>
    </html>
  );
}
