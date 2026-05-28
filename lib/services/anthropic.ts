import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ONBOARDING_SYSTEM = `Tu es un assistant bienveillant qui aide les aidants familiaux à créer un profil musical pour leur proche.

RÈGLES ABSOLUES :
- N'utilise JAMAIS les mots : Alzheimer, démence, pathologie, maladie, thérapie, traitement, symptômes, diagnostic
- Pose UNE SEULE question à la fois
- Sois chaleureux, simple, et concis
- Réponds TOUJOURS dans la langue indiquée par le paramètre "langue"
- Ne mentionne jamais les fréquences ou la technologie
- Parle du "proche" ou utilise son prénom s'il est connu

TES OBJECTIFS (obtenir ces informations progressivement) :
1. Genres musicaux préférés dans sa jeunesse (variété française, rock, jazz, flamenco, etc.)
2. Chanteurs ou groupes favoris
3. Une chanson qui lui tient particulièrement à cœur ("chanson madeleine")
4. Ses passions / activités favorites (danse, sport, cuisine, nature...)
5. Sa sensibilité au volume (doux / normal / fort)
6. S'il a des problèmes d'audition (acouphènes) — formuler avec tact

SORTIE FINALE :
Quand tu as suffisamment d'informations (minimum : genres + une passion + sensibilité volume),
réponds avec ce JSON exact sur une ligne, sans texte autour :
{"isComplete":true,"data":{"genres_preferes":[],"chanson_madeleine":"","passions":[],"sensibilite_volume":"normale","acouphenes":false}}

Tant que tu n'as pas ces infos, réponds normalement avec tes questions.`;

type Message = { role: 'user' | 'assistant'; content: string };

export async function sendOnboardingMessage(
  history: Message[],
  userMessage: string,
  langue: string
): Promise<{ response: string; isComplete: boolean; data?: object }> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: `[langue:${langue}] ${userMessage}` },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: ONBOARDING_SYSTEM,
    messages,
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // Detect JSON completion signal
  const jsonMatch = text.match(/\{"isComplete":true.*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return { response: text, isComplete: true, data: parsed.data };
    } catch {
      // Fall through to normal response
    }
  }

  return { response: text, isComplete: false };
}

export async function filterMusicBrainzResults(
  titres: object[],
  profil: object,
  langue: string
): Promise<object[]> {
  const prompt = `Voici une liste de titres musicaux et un profil musical d'une personne.
Sélectionne les 20 titres les plus pertinents pour ce profil (époque, style, pays).
Retourne UNIQUEMENT un tableau JSON des titres sélectionnés, sans texte autour.

Profil : ${JSON.stringify(profil)}
Titres : ${JSON.stringify(titres)}
Langue de réponse : ${langue}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '[]';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return titres.slice(0, 20);

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return titres.slice(0, 20);
  }
}

export async function generateAutoMessages(
  prenomProche: string,
  prenomAidant: string,
  langue: string
): Promise<Array<{ phase: string; texte: string; titre: string }>> {
  const name = prenomProche || 'toi';
  const prompt = `Génère 5 courts messages vocaux d'accompagnement musical pour un proche.
Ces messages seront lus par l'aidant ${prenomAidant} avant/pendant la musique.

Règles :
- Jamais de vocabulaire médical ou pathologique
- Ton chaleureux, bienveillant, naturel
- Maximum 3 phrases par message
- Utilise le prénom "${name}" dans chaque message
- Une version par phase de la journée

Langue : ${langue}

Retourne UNIQUEMENT ce JSON :
[
  {"phase":"matin","titre":"Bonjour du matin","texte":"..."},
  {"phase":"soins","titre":"Moment de soins","texte":"..."},
  {"phase":"repas","titre":"L'heure du repas","texte":"..."},
  {"phase":"apres-midi","titre":"Après-midi musicale","texte":"..."},
  {"phase":"coucher","titre":"Bonne nuit","texte":"..."}
]`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '[]';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON in Anthropic response');

  return JSON.parse(jsonMatch[0]);
}

export async function generatePersonalizedAdvice(
  profil: object,
  phase: string,
  langue: string
): Promise<string> {
  const prompt = `Génère un court conseil pratique (1-2 phrases) pour un aidant familial.
Ce conseil est affiché pendant la phase "${phase}" de la journée.
Il doit être bienveillant, concret, positif.
N'utilise aucun vocabulaire médical.
Langue : ${langue}
Profil du proche : ${JSON.stringify(profil)}
Retourne uniquement le texte du conseil, sans guillemets.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].type === 'text'
    ? response.content[0].text.trim()
    : '';
}
