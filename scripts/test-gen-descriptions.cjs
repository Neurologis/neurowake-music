/**
 * Test generateMusicDiscovery() avec le profil exact demandé.
 * node scripts/test-gen-descriptions.cjs
 */
const fs   = require('fs');
const path = require('path');

// Charger .env.local
const envPath = path.resolve(__dirname, '../.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const Anthropic = require(path.resolve(__dirname, '../node_modules/.pnpm/@anthropic-ai+sdk@0.24.3/node_modules/@anthropic-ai/sdk'));
const client = new Anthropic.default();

// Réplique exacte du prompt de generateMusicDiscovery()
const params = {
  annee_naissance: 1955,
  bump_annee_debut: 1965,
  bump_annee_fin: 1980,
  genres_preferes: ['rock'],
  passions: ['musique'],
  pays_jeunesse: 'France',
  limit: 3,
};

const genresStr   = params.genres_preferes.join(', ');
const passionsStr = params.passions.join(', ');

const prompt = `Tu es expert en histoire musicale mondiale, spécialisé dans la musicothérapie de réminiscence.

Génère exactement ${params.limit} titres musicaux RÉELS, POPULAIRES et VÉRIFIABLES pour ce profil :

Période musicale formatrice (bump de réminiscence) : ${params.bump_annee_debut}–${params.bump_annee_fin}
Pays d'origine / culture musicale : ${params.pays_jeunesse}
Genres préférés : ${genresStr}
Passions & activités : ${passionsStr}

ORDRE DE PRIORITÉ STRICT :
1. Grands hits de la période ${params.bump_annee_debut}–${params.bump_annee_fin} dans la culture de ${params.pays_jeunesse}
2. Artistes locaux chantant dans la langue de ${params.pays_jeunesse}
3. Titres liés aux émotions et passions : ${passionsStr}

RÈGLES ABSOLUES :
1. Uniquement des titres ayant réellement existé et été populaires
2. Maximum 2 titres par artiste
3. Pour chaque titre, génère une description de 1-2 phrases qui explique :
   - Pourquoi ce titre est pertinent pour la réminiscence
   - L'émotion ou le souvenir probable qu'il peut déclencher
   - Dans quelle phase de journée il est le plus efficace

PHASES :
• "matin"       = BPM > 100
• "soins"       = BPM 60–80
• "repas"       = BPM 80–100
• "apres-midi"  = BPM 70–90
• "coucher"     = BPM < 70

Retourne UNIQUEMENT ce tableau JSON valide, sans texte avant ni après :
[{"titre":"...","artiste":"...","annee":1975,"phase_recommandee":"matin","description":"..."},...]`;

(async () => {
  console.log('⏳ Appel generateMusicDiscovery() avec profil test...\n');
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = resp.content[0].text;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) { console.error('❌ Pas de JSON trouvé!\nRéponse brute:', text); return; }

  const parsed = JSON.parse(match[0]);
  console.log('=== 3 PREMIERS TITRES ===\n');
  parsed.slice(0, 3).forEach((t, i) => {
    console.log(`${i+1}. "${t.titre}" — ${t.artiste} (${t.annee})`);
    console.log(`   phase_recommandee : ${t.phase_recommandee ?? '⚠️ ABSENT'}`);
    console.log(`   description       : ${t.description ?? '⚠️ ABSENTE'}`);
    console.log();
  });

  const avecDesc = parsed.filter(t => !!t.description).length;
  console.log(`📊 Résultat : ${avecDesc}/${parsed.length} titres ont une description`);
  if (avecDesc === parsed.length) console.log('✅ Claude génère correctement les descriptions');
  else console.log('❌ Des descriptions manquent dans la réponse Claude');
})().catch(e => { console.error('❌ Erreur:', e.message); process.exit(1); });
