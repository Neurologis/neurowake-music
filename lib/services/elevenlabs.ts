const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const API_KEY = process.env.ELEVENLABS_API_KEY!;

const LANGUAGE_MODELS: Record<string, string> = {
  fr: 'eleven_multilingual_v2',
  es: 'eleven_multilingual_v2',
  en: 'eleven_monolingual_v1',
};

export async function cloneVoice(
  audioBuffer: Buffer,
  voiceName: string
): Promise<{ voice_id: string }> {
  const formData = new FormData();
  formData.append('name', voiceName);
  formData.append('description', 'Voice clone for NeuroWake');
  // new Uint8Array(buffer) creates a Uint8Array<ArrayBuffer> (not ArrayBufferLike)
  // which satisfies the BlobPart / ArrayBufferView constraint in Node.js v24 types.
  formData.append(
    'files',
    new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' }),
    'recording.mp3'
  );

  const res = await fetch(`${ELEVENLABS_BASE}/voices/add`, {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs clone failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return { voice_id: data.voice_id };
}

export async function generateSpeech(
  text: string,
  voiceId: string,
  langue: string
): Promise<Buffer> {
  const modelId = LANGUAGE_MODELS[langue] ?? 'eleven_multilingual_v2';

  const res = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${body}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function deleteVoice(voiceId: string): Promise<void> {
  const res = await fetch(`${ELEVENLABS_BASE}/voices/${voiceId}`, {
    method: 'DELETE',
    headers: { 'xi-api-key': API_KEY },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`ElevenLabs delete voice failed: ${res.status}`);
  }
}

export async function checkVoiceExists(voiceId: string): Promise<boolean> {
  const res = await fetch(`${ELEVENLABS_BASE}/voices/${voiceId}`, {
    headers: { 'xi-api-key': API_KEY },
  });
  return res.ok;
}
