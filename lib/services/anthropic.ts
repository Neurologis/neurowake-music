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

TES OBJECTIFS (obtenir ces informations dans cet ordre) :
1. Genres musicaux préférés dans sa jeunesse (variété française, rock, jazz, flamenco, etc.)
2. Chanteurs ou groupes favoris
3. Une chanson qui lui tient particulièrement à cœur ("chanson madeleine")
4. Ses passions / activités favorites (danse, sport, cuisine, nature...)
5. Sa sensibilité au volume (doux / normal / fort) — propose trois options claires
6. S'il a une sensibilité auditive particulière (acouphènes) — formule avec tact, question fermée oui/non

RÈGLE DE SORTIE — CRITIQUE — RESPECTE-LA ABSOLUMENT :
Dès que tu as reçu une réponse à la question sur la sensibilité auditive (objectif 6),
tu DOIS immédiatement terminer la conversation en répondant UNIQUEMENT avec ce JSON compact sur une seule ligne.
N'ajoute AUCUN texte avant, AUCUN texte après, AUCUN remerciement, AUCUN bloc de code markdown.
Uniquement le JSON brut, rien d'autre :
{"isComplete":true,"data":{"genres_preferes":[],"chanson_madeleine":"","passions":[],"sensibilite_volume":"normale","acouphenes":false}}

Remplis les tableaux et valeurs avec les informations collectées pendant la conversation.
sensibilite_volume doit être "douce", "normale" ou "sensible". acouphenes est un booléen.
Tant que tu n'as pas encore reçu de réponse à l'objectif 6, continue la conversation normalement.`;

type Message = { role: 'user' | 'assistant'; content: string };

/**
 * Extracts the completion data object from Claude's response text.
 *
 * Uses brace-counting rather than regex so it handles:
 *   - Spaces around colons  ("isComplete" : true)
 *   - Multi-line / pretty-printed JSON
 *   - JSON wrapped in markdown code fences
 *   - Arbitrary text before or after the JSON
 *
 * Returns null if no valid completion JSON is found.
 */
function extractCompletionData(text: string): Record<string, unknown> | null {
  // Find "isComplete":true anywhere in the text (tolerates whitespace around :)
  const markerMatch = text.match(/"isComplete"\s*:\s*true/);
  if (!markerMatch || markerMatch.index === undefined) return null;

  // Walk backwards from the marker to locate the opening {
  let startIdx = markerMatch.index - 1;
  while (startIdx >= 0 && text[startIdx] !== '{') startIdx--;
  if (startIdx < 0) return null;

  // Walk forwards counting braces until depth reaches 0 (matching closing })
  let depth = 0;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.substring(startIdx, i + 1)) as Record<string, unknown>;
          if (parsed.isComplete === true && parsed.data && typeof parsed.data === 'object') {
            return parsed.data as Record<string, unknown>;
          }
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

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

  // Robust completion detection — handles:
  //   • spaces around colon:   "isComplete" : true
  //   • pretty-printed JSON    (multi-line)
  //   • JSON wrapped in ```    markdown fences
  //   • arbitrary text before/after the JSON object
  const completionData = extractCompletionData(text);
  if (completionData) {
    return { response: text, isComplete: true, data: completionData };
  }

  return { response: text, isComplete: false };
}

// ---------------------------------------------------------------------------
// Music discovery via AI — replaces the MusicBrainz + filter approach.
// Claude generates curated, real, popular titles for the user's bump period,
// with a recommended time-of-day phase for each track.
// ---------------------------------------------------------------------------
export type PhaseRecommandee = 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';

export interface TitreDecouvert {
  titre: string;
  artiste: string;
  annee: number;
  phase_recommandee: PhaseRecommandee;
}

export async function generateMusicDiscovery(params: {
  annee_naissance: number;
  bump_annee_debut: number;
  bump_annee_fin: number;
  genres_preferes: string[];
  passions: string[];
  pays_jeunesse: string;
  chanson_madeleine?: string | null;
  exclude_artiste_titre?: string[];
  limit?: number;
}): Promise<TitreDecouvert[]> {
  const {
    bump_annee_debut,
    bump_annee_fin,
    genres_preferes,
    passions,
    pays_jeunesse,
    chanson_madeleine,
    exclude_artiste_titre = [],
    limit = 30,
  } = params;

  const genresStr = genres_preferes.length > 0 ? genres_preferes.join(', ') : 'variété, chanson populaire';
  const passionsStr = passions.length > 0 ? passions.join(', ') : 'musique';
  const excludeNote =
    exclude_artiste_titre.length > 0
      ? `\nNe JAMAIS inclure ces titres déjà proposés :\n${exclude_artiste_titre.slice(0, 60).join('\n')}`
      : '';
  const madeleineNote = chanson_madeleine
    ? `\nChanson madeleine : "${chanson_madeleine}" — inspire-toi du style et de l'époque.`
    : '';

  const prompt = `Tu es expert en histoire musicale et catalogues de hits.

Génère exactement ${limit} titres musicaux RÉELS, POPULAIRES et VÉRIFIABLES pour ce profil :

Période musicale formatrice : ${bump_annee_debut}–${bump_annee_fin}
Pays d'origine : ${pays_jeunesse}
Genres préférés : ${genresStr}
Passions & activités : ${passionsStr}${madeleineNote}${excludeNote}

RÈGLES ABSOLUES :
1. Uniquement des titres ayant réellement existé et été populaires (hits, pas des B-sides obscures)
2. Correspondance culturelle stricte avec ${pays_jeunesse} (artistes locaux prioritaires)
3. Maximum 2 titres par artiste sur l'ensemble de la liste
4. Répartition équilibrée : ~${Math.round(limit / 5)} titres par phase

PHASES DE JOURNÉE (énergie du titre) :
• "matin"      = énergique, dynamique, optimiste, tempo rapide
• "soins"      = doux, calme, apaisant, lent
• "repas"      = gai, festif, convivial, enjoué
• "apres-midi" = nostalgique, sentimental, mélodieux, mélancolique
• "coucher"    = lent, introspectif, relaxant

Retourne UNIQUEMENT ce tableau JSON valide, sans texte avant ni après :
[{"titre":"...","artiste":"...","annee":1978,"phase_recommandee":"matin"},...]`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      titre?: unknown;
      artiste?: unknown;
      annee?: unknown;
      phase_recommandee?: unknown;
    }>;

    const VALID_PHASES: PhaseRecommandee[] = ['matin', 'soins', 'repas', 'apres-midi', 'coucher'];

    return parsed
      .filter((t) => t.titre && t.artiste && t.annee)
      .map((t) => ({
        titre: String(t.titre),
        artiste: String(t.artiste),
        annee: parseInt(String(t.annee), 10) || bump_annee_debut,
        phase_recommandee: VALID_PHASES.includes(t.phase_recommandee as PhaseRecommandee)
          ? (t.phase_recommandee as PhaseRecommandee)
          : 'apres-midi',
      }))
      .slice(0, limit);
  } catch {
    return [];
  }
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
