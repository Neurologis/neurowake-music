import Anthropic from '@anthropic-ai/sdk';

// Let the SDK read ANTHROPIC_API_KEY from the environment automatically.
// Passing `apiKey: undefined` explicitly could mask missing-key errors on some
// SDK versions, so we rely on the SDK's own env-var lookup.
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    '[anthropic] ⚠️  ANTHROPIC_API_KEY is not set — all AI features will fail. ' +
    'Set it in .env.local (development) or in your deployment environment variables.'
  );
}

const client = new Anthropic();

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
  // Anthropic's API requires that the first message has role 'user'.
  // The client passes a history that starts with the locally-generated welcome bubble
  // (role: 'assistant'), which would immediately throw an invalid_request_error.
  // Fix: skip all leading assistant messages before building the messages array.
  const firstUserIdx = history.findIndex((m) => m.role === 'user');
  const normalizedHistory = firstUserIdx >= 0 ? history.slice(firstUserIdx) : [];

  console.log(
    `[sendOnboardingMessage] history=${history.length} messages, normalized=${normalizedHistory.length}, lang=${langue}`
  );

  const messages: Anthropic.MessageParam[] = [
    ...normalizedHistory.map((m) => ({
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

  console.log(
    `[sendOnboardingMessage] Response: stop_reason=${response.stop_reason}, text_length=${text.length}, first100="${text.slice(0, 100)}"`
  );

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

// ---------------------------------------------------------------------------
// Helper: detect interface language from country name
// ---------------------------------------------------------------------------
export function detectLangueFromPays(pays: string): 'fr' | 'es' | 'en' {
  const p = (pays ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const francophone = [
    'france', 'belgique', 'suisse', 'canada', 'quebec', 'maroc', 'tunisie', 'algerie',
    'senegal', 'mali', 'benin', 'togo', 'cameroun', 'gabon', 'congo', 'cote d ivoire',
    'madagascar', 'mauritanie', 'niger', 'burkina', 'rwanda', 'burundi', 'djibouti',
  ];
  const hispanophone = [
    'espagne', 'mexique', 'argentine', 'colombie', 'chili', 'perou', 'venezuela', 'cuba',
    'equateur', 'bolivie', 'uruguay', 'paraguay', 'costa rica', 'panama', 'guatemala',
    'honduras', 'salvador', 'nicaragua', 'republique dominicaine', 'porto rico',
  ];
  if (francophone.some((c) => p.includes(c))) return 'fr';
  if (hispanophone.some((c) => p.includes(c))) return 'es';
  return 'en';
}

export async function generateMusicDiscovery(params: {
  annee_naissance: number;
  bump_annee_debut: number;
  bump_annee_fin: number;
  genres_preferes: string[];
  passions: string[];
  pays_jeunesse: string;
  pays_residence?: string | null;
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
    pays_residence,
    chanson_madeleine,
    exclude_artiste_titre = [],
    limit = 50,
  } = params;

  console.log('[generateMusicDiscovery] Called with:', {
    period: `${bump_annee_debut}–${bump_annee_fin}`,
    pays: pays_jeunesse,
    pays_residence: pays_residence ?? '(identique)',
    genres: genres_preferes,
    passions,
    limit,
    excludeCount: exclude_artiste_titre.length,
  });

  const genresStr  = genres_preferes.length > 0 ? genres_preferes.join(', ') : 'variété, chanson populaire';
  const passionsStr = passions.length > 0 ? passions.join(', ') : 'musique';

  const excludeNote =
    exclude_artiste_titre.length > 0
      ? `\nNe JAMAIS inclure ces titres déjà proposés :\n${exclude_artiste_titre.slice(0, 60).join('\n')}`
      : '';

  const madeleineNote = chanson_madeleine
    ? `\nChanson madeleine (titre qui lui tient à cœur) : "${chanson_madeleine}" — inspire-toi du style et de l'époque de ce titre.`
    : '';

  // If resident in a different country → bilingual note
  const residenceNote =
    pays_residence && pays_residence.toLowerCase() !== pays_jeunesse.toLowerCase()
      ? `\nPays de résidence actuel : ${pays_residence} — inclure aussi des hits populaires locaux du pays de résidence (en plus des titres en langue d'origine).`
      : '';

  const prompt = `Tu es expert en histoire musicale et catalogues de hits internationaux.

Génère exactement ${limit} titres musicaux RÉELS, POPULAIRES et VÉRIFIABLES pour ce profil :

Période musicale formatrice (années du bump) : ${bump_annee_debut}–${bump_annee_fin}
Pays d'origine / culture musicale : ${pays_jeunesse}${residenceNote}
Genres préférés : ${genresStr}
Passions & activités : ${passionsStr}${madeleineNote}${excludeNote}

ORDRE DE PRIORITÉ STRICT (respecte-le absolument) :
1. D'abord les titres et artistes explicitement mentionnés dans l'historique de conversation
2. Ensuite les grands hits de la période ${bump_annee_debut}–${bump_annee_fin} dans la culture de ${pays_jeunesse}
3. Puis le top hits de l'époque dans le pays / la langue du profil (titres locaux, pas uniquement les versions internationales)
4. Puis les titres qui correspondent aux émotions et passions déclarées : ${passionsStr}
5. Titres classés par phase de journée selon BPM et style musical

RÈGLES ABSOLUES :
1. Uniquement des titres ayant réellement existé et été populaires (hits, pas des B-sides obscures)
2. Correspondance culturelle stricte avec ${pays_jeunesse} (artistes locaux prioritaires, dans la langue du pays)
3. Maximum 2 titres par artiste sur l'ensemble de la liste
4. Répartition équilibrée : ~${Math.round(limit / 5)} titres par phase

PHASES DE JOURNÉE (énergie + BPM du titre) :
• "matin"      = énergique, dynamique, optimiste  — BPM > 100, rythme rapide, style rythmé
• "soins"      = doux, calme, apaisant            — BPM 60–80, rythme lent, style calme
• "repas"      = gai, festif, convivial, enjoué   — BPM 80–100, ambiance légère et conviviale
• "apres-midi" = nostalgique, sentimental, mélodieux — BPM 70–90, mélancolique
• "coucher"    = lent, introspectif, relaxant     — BPM < 70, berceuse ou ballade lente

Retourne UNIQUEMENT ce tableau JSON valide, sans texte avant ni après :
[{"titre":"...","artiste":"...","annee":1978,"phase_recommandee":"matin"},...]`;

  console.log('[generateMusicDiscovery] Calling Claude claude-sonnet-4-6, limit:', limit);
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  console.log('[generateMusicDiscovery] Raw response length:', text.length, 'chars. First 200:', text.slice(0, 200));
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('[generateMusicDiscovery] No JSON array found in response!');
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      titre?: unknown;
      artiste?: unknown;
      annee?: unknown;
      phase_recommandee?: unknown;
    }>;

    const VALID_PHASES: PhaseRecommandee[] = ['matin', 'soins', 'repas', 'apres-midi', 'coucher'];

    const result = parsed
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

    console.log(`[generateMusicDiscovery] Parsed ${result.length} valid titles out of ${parsed.length} raw entries`);
    return result;
  } catch (parseErr) {
    console.error('[generateMusicDiscovery] JSON.parse failed:', parseErr);
    console.error('[generateMusicDiscovery] Raw text was:', text.slice(0, 500));
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
