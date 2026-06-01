/**
 * Test rapide : vérifie que generateMusicDiscovery retourne bien des descriptions.
 * Usage : node scripts/test-descriptions.cjs
 */
const fs   = require('fs');
const path = require('path');

// Charger .env.local manuellement
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const Anthropic = require(path.resolve(__dirname, '../node_modules/.pnpm/@anthropic-ai+sdk@0.24.3/node_modules/@anthropic-ai/sdk'));
const client = new Anthropic.default();

const prompt = `Tu es expert en musicothérapie de réminiscence.

Génère exactement 3 titres musicaux RÉELS pour ce profil :
Période : 1970–1985, Pays : France, Genres : variété française, Passions : danse

RÈGLES :
- Pour chaque titre, génère une description de 1-2 phrases
- Maximum 2 titres par artiste

PHASES :
• "matin" = BPM > 100
• "apres-midi" = BPM 70–90

Retourne UNIQUEMENT ce tableau JSON :
[{"titre":"...","artiste":"...","annee":1975,"phase_recommandee":"matin","description":"..."}]`;

(async () => {
  console.log('⏳ Appel Claude...\n');
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = response.content[0].text;
  console.log('📨 Réponse brute:\n', text, '\n');

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) { console.error('❌ Pas de JSON trouvé !'); return; }

  const parsed = JSON.parse(match[0]);
  console.log(`✅ ${parsed.length} titres parsés:\n`);
  parsed.forEach((t, i) => {
    console.log(`${i+1}. ${t.titre} — ${t.artiste} (${t.annee})`);
    console.log(`   Phase : ${t.phase_recommandee}`);
    console.log(`   Description : ${t.description ?? '⚠️ ABSENTE'}`);
    console.log();
  });

  const avecDesc = parsed.filter(t => t.description).length;
  console.log(`📊 ${avecDesc}/${parsed.length} titres ont une description`);
})().catch(err => { console.error('❌ Erreur:', err.message); process.exit(1); });
