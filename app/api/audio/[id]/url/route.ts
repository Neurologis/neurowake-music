import { NextResponse } from 'next/server';

/**
 * Signed URLs are no longer generated server-side.
 * Audio files are served directly from the user's device via object URLs.
 * The client-side local-audio-store manages file associations.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Les URLs signées ne sont plus générées. Les fichiers audio sont lus depuis l\'appareil de l\'utilisateur.',
      code: 'DEPRECATED',
    },
    { status: 410 }
  );
}
