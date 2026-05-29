import { NextResponse } from 'next/server';

/**
 * Audio files are no longer uploaded to the server.
 * Files are stored locally on the user's device and read via the File System Access API.
 * Use POST /api/titres to save metadata, then associate the file client-side.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Les fichiers audio ne sont plus envoyés sur le serveur. Utilisez POST /api/titres pour enregistrer les métadonnées puis associez le fichier localement.',
      code: 'DEPRECATED',
    },
    { status: 410 }
  );
}
