# NeuroWake Music — Instructions de déploiement

## 1. Prérequis (à installer sur votre PC)

### Node.js (indispensable)
1. Allez sur https://nodejs.org
2. Téléchargez la version **LTS** (20.x)
3. Installez avec les options par défaut
4. Redémarrez PowerShell
5. Vérifiez : `node --version` → doit afficher v20.x.x

### pnpm
```powershell
npm install -g pnpm
```

## 2. Initialisation du projet

```powershell
# Dans votre répertoire de projet
cd "C:\Users\jeanc\Desktop\Dossiers\BLOG BL ALZHEIMER\Projet Musiques Autobiograpiques IA\Code Neuro Wake Music"

# Installer les dépendances (⚠️ nécessite Node.js installé)
pnpm install

# Lancer en développement
pnpm dev
```

Ouvrez http://localhost:3000

## 3. Supabase — Configuration

### 3.1 Exécuter le schéma SQL

1. Allez sur https://supabase.com/dashboard/project/nxocpihpvyuugswmtfpr
2. Cliquez sur **SQL Editor** dans le menu gauche
3. Cliquez **New query**
4. Copiez-collez le contenu de `supabase/schema.sql`
5. Cliquez **Run**

### 3.2 Insérer les conseils de base

1. Dans SQL Editor, nouveau query
2. Copiez-collez le contenu de `supabase/seed.sql`
3. Cliquez **Run**

### 3.3 Vérifier le bucket Storage

Dans Supabase → Storage, vérifiez que le bucket `audio-prive` existe.
S'il n'existe pas, créez-le manuellement (privé).

## 4. Variables d'environnement Vercel

Lors du déploiement sur Vercel, ajoutez ces variables :

| Variable | Valeur |
|----------|--------|
| NEXT_PUBLIC_SUPABASE_URL | https://nxocpihpvyuugswmtfpr.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | (votre clé anon) |
| SUPABASE_SERVICE_ROLE_KEY | (votre clé service role) |
| ANTHROPIC_API_KEY | (votre clé Anthropic) |
| ELEVENLABS_API_KEY | (votre clé ElevenLabs) |
| LEMON_SQUEEZY_API_KEY | (à ajouter plus tard) |
| LEMON_SQUEEZY_WEBHOOK_SECRET | (à ajouter plus tard) |
| LEMON_SQUEEZY_STORE_ID | (à ajouter plus tard) |
| LEMON_SQUEEZY_VARIANT_ID | (à ajouter plus tard) |
| NEXT_PUBLIC_APP_URL | https://app.neurologis.fr |
| ADMIN_EMAIL | jeancharles.orozco@gmail.com |
| CRON_SECRET | (générez une clé aléatoire forte) |

## 5. Déploiement Vercel

### Option A — Via CLI Vercel
```powershell
# Installer Vercel CLI
npm install -g vercel

# Déployer
vercel

# Suivez les instructions interactives
# Projet: neurowake
# Framework: Next.js (détecté auto)
```

### Option B — Via GitHub (recommandé)

1. Créez un dépôt GitHub pour ce projet
2. Poussez le code :
   ```powershell
   git init
   git add .
   git commit -m "Initial commit: NeuroWake Music"
   git remote add origin https://github.com/VOTRE-COMPTE/neurowake.git
   git push -u origin main
   ```
3. Sur https://vercel.com, cliquez **New Project**
4. Importez votre dépôt GitHub
5. Configurez les variables d'environnement (voir tableau ci-dessus)
6. Cliquez **Deploy**

## 6. Configuration du domaine (app.neurologis.fr)

1. Dans Vercel → Settings → Domains
2. Ajoutez `app.neurologis.fr`
3. Configurez votre DNS selon les instructions Vercel (CNAME ou A record)

## 7. Webhook Lemon Squeezy (à configurer quand les clés seront prêtes)

URL du webhook : `https://app.neurologis.fr/api/webhook/lemonsqueezy`

Événements à activer :
- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_expired`
- `subscription_payment_failed`

## 8. Health Check Cron

Le fichier `vercel.json` configure déjà le cron toutes les heures.
Pour l'activer :
1. Générez un CRON_SECRET fort : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Ajoutez-le comme variable d'environnement Vercel

## 9. Vérification post-déploiement

- [ ] Page d'accueil accessible
- [ ] Inscription / connexion fonctionne
- [ ] Onboarding chat Claude répond
- [ ] Import audio fonctionne
- [ ] Lecteur joue les titres
- [ ] Fréquences 40Hz actives (son discret audible)
- [ ] Clone de voix ElevenLabs (si clé valide)
- [ ] Conseils s'affichent dans le lecteur

## Structure des fichiers

```
neurowake/
├── app/                    # Pages Next.js (App Router)
│   ├── api/               # Endpoints API
│   │   ├── onboarding/    # Chat IA + completion profil
│   │   ├── decouverte/    # MusicBrainz + validation
│   │   ├── audio/         # Upload + URLs signées
│   │   ├── playlist/      # Lecture par type
│   │   ├── messages/      # Messages vocaux TTS
│   │   ├── voix/          # Clone ElevenLabs
│   │   ├── conseils/      # Conseils rotatifs
│   │   ├── billing/       # Lemon Squeezy
│   │   ├── admin/         # Interface admin
│   │   └── cron/          # Health check
│   ├── app/               # Pages protégées (/app/*)
│   ├── onboarding/        # Page onboarding
│   ├── decouverte/        # Page découverte musicale
│   ├── admin/             # Page administration
│   ├── login/ signup/     # Auth pages
│   └── page.tsx           # Landing publique
├── components/
│   ├── ui/                # Composants shadcn/ui
│   └── layout/            # Nav desktop + mobile
├── hooks/
│   ├── use-audio-player.ts # Hook Web Audio API + 40Hz
│   └── use-toast.ts
├── lib/
│   ├── supabase/          # Client, server, types
│   ├── services/          # ElevenLabs, Anthropic, MusicBrainz, LS
│   ├── auth.ts            # Auth + rate limiting
│   ├── cache.ts           # Cache audio SHA256
│   └── utils.ts
├── messages/              # Traductions FR/ES/EN
├── supabase/
│   ├── schema.sql         # Schéma complet
│   └── seed.sql           # 50 conseils
├── .env.local             # Variables d'environnement
├── next.config.js
├── tailwind.config.ts
└── vercel.json            # Cron config
```
