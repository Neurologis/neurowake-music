import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'NeuroWake Music',
  description: 'La musique qui lui parle vraiment',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.neurologis.fr'),
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
      </body>
    </html>
  );
}
