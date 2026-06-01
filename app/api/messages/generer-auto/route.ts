import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { generateAutoMessages } from '@/lib/services/anthropic';
import { generateSpeech } from '@/lib/services/elevenlabs';
import { cacheAudio } from '@/lib/cache';

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();

  // Get profile and voice
  const [{ data: profil }, { data: voiceProfile }] = await Promise.all([
    supabase.from('profils').select('prenom_proche, langue').eq('user_id', userId).single(),
    supabase.from('voice_profiles').select('elevenlabs_voice_id, clone_status').eq('user_id', userId).single(),
  ]);

  if (!voiceProfile || voiceProfile.clone_status !== 'ready') {
    return apiError('Voice not ready', 'VOICE_NOT_READY', 400);
  }

  const langue = profil?.langue ?? 'fr';
  const prenomProche = profil?.prenom_proche ?? '';
  const prenomAidant = 'votre aidant';

  // Generate message texts
  const templates = await generateAutoMessages(prenomProche, prenomAidant, langue);

  const admin = createAdminClient();
  const voiceId = voiceProfile.elevenlabs_voice_id;
  const results = [];

  for (let i = 0; i < templates.length; i++) {
    const tpl = templates[i];
    try {
      const audioBuffer = await generateSpeech(tpl.texte, voiceId, langue);
      const audioUrl = await cacheAudio(tpl.texte, voiceId, userId, langue, audioBuffer);
      const urlObj = new URL(audioUrl);
      const pathParts = urlObj.pathname.split('/object/sign/audio-prive/');
      const storagePath = pathParts[1]?.split('?')[0] ?? '';

      const { data: inserted } = await supabase.from('messages_vocaux').insert({
        user_id: userId,
        titre: tpl.titre,
        texte_source: tpl.texte,
        audio_storage_path: storagePath,
        phase: tpl.phase as 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher',
        mode_diffusion: 'ouverture',
        auto_genere: true,
        actif: true,
        ordre: i,
      }).select().single();

      if (inserted) {
        results.push(inserted);

        // Affecter automatiquement le message à sa phase en position "debut"
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any).from('messages_affectations').upsert({
            user_id: userId,
            message_id: inserted.id,
            type_affectation: 'playlist_phase',
            position: 'debut',
            phase: tpl.phase,
            titre_id: null,
          }, {
            onConflict: 'user_id,phase,type_affectation,position',
          });
        } catch (affErr) {
          // Non-fatal — table may not exist yet if migration not run
          console.warn('[generer-auto] Could not create affectation (migration needed?):', affErr);
        }
      }
    } catch (err) {
      console.error(`[generer-auto] Failed for phase ${tpl.phase}:`, err);
    }
  }

  return NextResponse.json({ messages: results, generated: results.length });
}
