# SPECS.md — NeuroWake Music
*Mémoire technique complète du projet. Mise à jour : 2026-05-30.*

---

## 1. DESCRIPTION DU PROJET

**NeuroWake Music** est une application web progressive (PWA) destinée aux **aidants familiaux** de patients souffrant de troubles cognitifs liés à l'âge. Elle combine deux approches complémentaires :

1. **Musique autobiographique** : chaque proche possède un profil musical personnalisé (période du « bump de réminiscence », genres préférés, chanson madeleine, passions). L'IA génère une liste de titres correspondant à son histoire musicale personnelle.
2. **Fréquences 40Hz Gamma** : superposées à la musique via Web Audio API, elles constituent une stimulation sensorielle douce.

### Contraintes de sécurité absolues (invariant de toutes les sessions)
> Ces règles ne peuvent jamais être levées, quels que soient les refactors ou ajouts de fonctionnalités :
- **Aucun vocabulaire médical** dans le code, les logs, les commentaires, l'UI ou les prompts : interdits = Alzheimer, démence, pathologie, maladie, thérapie, traitement, symptômes, diagnostic
- **Le `voice_id` ElevenLabs ne doit jamais être exposé côté client**
- **Les fichiers audio ne sont jamais uploadés sur Supabase Storage** — tout reste sur l'appareil de l'utilisateur

### Positionnement produit
- Cible : aidants familiaux (conjoints, enfants, soignants) — pas les patients eux-mêmes
- Interface : grande police (`text-base` minimum), boutons larges (`h-11`), couleurs douces
- Langues : Français (défaut), Espagnol, Anglais
- Abonnement mensuel via Lemon Squeezy, essai gratuit 14 jours

---

## 2. ARCHITECTURE TECHNIQUE

### Stack principale
| Composant | Technologie | Version |
|---|---|---|
| Framework | Next.js App Router | 14.2.5 |
| Langage | TypeScript | 5.x |
| Styles | Tailwind CSS + Radix UI + shadcn/ui | 3.4.x |
| Base de données | Supabase (PostgreSQL) | ^2.44.2 |
| Auth | Supabase Auth + @supabase/auth-helpers-nextjs | ^0.10.0 |
| IA générative | Anthropic Claude (SDK) | ^0.24.3 |
| Synthèse vocale | ElevenLabs (clonage de voix) | API REST |
| Paiements | Lemon Squeezy | API REST |
| Icônes | Lucide React | ^0.400.0 |
| Validation | Zod | ^3.23.8 |
| Drag & drop | @dnd-kit/core + sortable | ^6.1 / ^8.0 |
| Métadonnées audio | music-metadata | ^10.5.0 |
| Gestionnaire de paquets | pnpm | workspace |

### Infrastructure
| Élément | Valeur |
|---|---|
| Hébergement | Vercel |
| URL production | https://app.neurologis.fr |
| URL alternative | https://neurowake-music.vercel.app |
| Repository | GitHub — Neurologis/neurowake-music |
| Base de données | Supabase (PostgreSQL avec RLS) |
| Cron Vercel | `/api/cron/health-check` à 09h00 UTC chaque jour |

### Schéma de déploiement
```
Browser (PWA)
  ↕ HTTPS
Vercel Edge (Next.js 14)
  ↕ Supabase JS Client (cookies)
Supabase (PostgreSQL + Auth + RLS)
  + Anthropic Claude API (server-side uniquement)
  + ElevenLabs API (server-side uniquement)
  + Lemon Squeezy (webhooks + API)
```

### Structure des répertoires
```
/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (providers, toaster)
│   ├── page.tsx                  # Landing page (/)
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── onboarding/page.tsx       # Onboarding conversationnel IA
│   ├── reset-password/page.tsx
│   ├── decouverte/page.tsx       # Découverte musicale + import
│   ├── dossier/page.tsx          # Configuration dossier NeuroWake Music
│   ├── admin/page.tsx            # Panneau admin conseils
│   ├── app/                      # Zone protégée (auth required)
│   │   ├── layout.tsx            # App layout (navigation)
│   │   ├── page.tsx              # Lecteur principal
│   │   ├── titres/page.tsx       # Bibliothèque de titres
│   │   ├── messages/page.tsx     # Messages vocaux
│   │   └── parametres/page.tsx   # Paramètres
│   ├── auth/callback/route.ts    # Callback Supabase OAuth
│   └── api/                      # Routes API (voir section dédiée)
├── components/
│   ├── ui/                       # Composants shadcn/ui
│   ├── layout/
│   │   ├── app-nav.tsx           # Navigation desktop
│   │   └── mobile-nav.tsx        # Navigation mobile bottom bar
│   ├── providers.tsx
│   └── pwa/
│       ├── PwaFolderSetup.tsx
│       └── ServiceWorkerRegistration.tsx
├── hooks/
│   ├── use-audio-player.ts       # Hook Web Audio API + 40Hz Gamma
│   ├── use-t.ts                  # Hook i18n (lit localStorage, écoute CustomEvent)
│   └── use-toast.ts
├── lib/
│   ├── auth.ts                   # requireAuth() helper pour les API routes
│   ├── cache.ts                  # Cache serveur
│   ├── i18n.ts                   # Dictionnaires FR/ES/EN + types TKey
│   ├── local-audio-store.ts      # Gestion fichiers locaux (FSA + IndexedDB)
│   ├── utils.ts                  # formatDuration, getCurrentPhase…
│   └── services/
│       ├── anthropic.ts          # Claude — onboarding + découverte musicale
│       ├── elevenlabs.ts         # Clonage et synthèse de voix
│       ├── lemonsqueezy.ts       # Paiements et abonnements
│       ├── music-metadata.ts     # Extraction métadonnées audio
│       └── musicbrainz.ts        # API MusicBrainz (non utilisé en prod)
├── lib/supabase/
│   ├── client.ts                 # Client Supabase navigateur
│   ├── server.ts                 # Client Supabase serveur (cookies)
│   └── types.ts                  # Types générés Supabase
├── supabase/
│   ├── schema.sql                # Schéma complet de la base
│   ├── seed.sql                  # Données initiales (conseils)
│   └── migrations/
│       └── 001_add_phase_recommandee.sql
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service Worker
│   └── logo-neurowake.png
├── messages/                     # Fichiers de traduction next-intl (en cours)
│   ├── fr.json
│   ├── es.json
│   └── en.json
├── middleware.ts                 # Auth middleware (redirect /app/* → /login)
├── vercel.json                   # Config crons Vercel
├── package.json
└── DEPLOIEMENT.md
```

---

## 3. BASE DE DONNÉES — SCHÉMA SUPABASE

Toutes les tables ont **Row Level Security activé** avec la politique `auth.uid() = user_id`.

### Table `profils`
Profil de la personne accompagnée (rempli pendant l'onboarding).
| Colonne | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK auth.users | 1 profil par compte |
| prenom_proche | text | Prénom de la personne accompagnée |
| annee_naissance | integer | |
| ville_jeunesse | text | |
| pays_jeunesse | text | default 'France' |
| bump_annee_debut | integer | Début de la période musicale formatrice |
| bump_annee_fin | integer | Fin de la période musicale formatrice |
| sensibilite_volume | text | 'douce' / 'normale' / 'sensible' |
| acouphenes | boolean | Désactive le mode binaural si true |
| gamma_gain | decimal(4,2) | Intensité 40Hz (défaut 0.04) |
| gamma_mode | text | 'binaural' / 'monaural' / 'am' |
| chanson_madeleine | text | Titre favori explicite |
| passions | text[] | Activités / centres d'intérêt |
| genres_preferes | text[] | |
| routine_prioritaire | text | Phase par défaut au démarrage |
| langue | text | 'fr' / 'es' / 'en' |
| onboarding_complet | boolean | |
| conversation_history | jsonb | Historique chat onboarding |

### Table `titres_audio`
Titres importés sur l'appareil de l'aidant.
| Colonne | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| titre | text | |
| artiste | text | |
| annee | integer | |
| storage_path | text | Nom du fichier local (hint d'affichage seulement) — default '' |
| repetitions | integer | Nombre de répétitions (défaut 1) |
| boucle_infinie | boolean | Si true → lecture en boucle infinie |
| note_aidant | text | Note personnelle de l'aidant |
| dans_playlist_favorite | boolean | Apparaît dans l'onglet Favoris |
| phase_recommandee | text | 'matin'/'soins'/'repas'/'apres-midi'/'coucher' — ajouté par migration 001 |
| ordre | integer | Ordre dans la bibliothèque |
| musicbrainz_id | text | Identifiant MusicBrainz (si disponible) |

### Table `titres_recommandes`
Titres générés par l'IA, en attente de validation par l'aidant.
| Colonne | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| titre / artiste / annee | | |
| pochette_url | text | URL pochette iTunes ou MusicBrainz |
| musicbrainz_id | text | |
| phase_recommandee | text | Phase d'écoute recommandée — ajouté par migration 001 |
| statut | text | 'propose' / 'valide' / 'refuse' / 'incertain' / 'importe' |

### Table `messages_vocaux`
Messages clonés avec la voix de l'aidant.
| Colonne | Type | Description |
|---|---|---|
| id | uuid PK | |
| titre | text | |
| texte_source | text | Texte lu par ElevenLabs |
| audio_storage_path | text | Chemin dans Supabase Storage |
| phase | text | Phase cible (+ 'toutes') |
| mode_diffusion | text | 'ouverture' / 'cloture' / 'rotation' |
| actif | boolean | Seul 1 message actif par phase |
| auto_genere | boolean | Généré automatiquement après clonage |

### Table `voice_profiles`
Profil de voix clonée ElevenLabs (1 par compte).
| Colonne | Type | Description |
|---|---|---|
| elevenlabs_voice_id | text | **JAMAIS exposé côté client** |
| clone_status | text | 'pending' / 'ready' / 'error' |

### Table `abonnements`
Abonnement Lemon Squeezy.
| Colonne | Type | Description |
|---|---|---|
| ls_customer_id | text | |
| ls_subscription_id | text | |
| statut | text | 'actif' / 'inactif' / 'trial' / 'suspendu' |
| trial_ends_at | timestamptz | Défaut : now() + 14 jours |
| current_period_end | timestamptz | |

### Table `conseils`
Conseils phasés affichés dans le lecteur (gérés par l'admin).
| Colonne | Type | Description |
|---|---|---|
| phase | text | Phase concernée |
| langue | text | 'fr' / 'es' / 'en' |
| texte | text | Contenu du conseil |
| actif / ordre | | |

### Autres tables
- `sessions_log` : log anonymisé des sessions de lecture
- `conseils_affichages` : tracking de rotation des conseils par utilisateur

### Migration 001 — `supabase/migrations/001_add_phase_recommandee.sql`
> **⚠️ Cette migration doit être appliquée manuellement dans Supabase SQL Editor.**

Ajoute `phase_recommandee` aux tables `titres_recommandes` et `titres_audio`, met `storage_path` à default '' et crée les index de performance associés.

---

## 4. ROUTES API

### Authentification
Toutes les routes API appellent `requireAuth(req)` depuis `lib/auth.ts`. Si la session est invalide, elles retournent `401`.

### Catalogue audio
| Route | Méthode | Description |
|---|---|---|
| `/api/titres` | GET | Liste les titres de l'utilisateur (filtre `?q=`) |
| `/api/titres` | POST | Crée un titre (métadonnées uniquement, no upload) |
| `/api/titres/[id]` | PATCH | Met à jour un titre (storage_path, répétitions, note…) |
| `/api/titres/[id]` | DELETE | Supprime un titre |
| `/api/playlist/[type]` | GET | Titres filtrés par phase (matin/soins/repas/apres-midi/coucher/favorite) |

**Stratégie filtrage playlist :**
- Stratégie A : colonne `titres_audio.phase_recommandee` — `phase IS NULL` → apparaît dans tous les onglets
- Stratégie B (fallback si error code `42703` = colonne absente) : jointure par `titre.lower()|artiste.lower()` avec `titres_recommandes`

### Playlists utilisateur
| Route | Méthode | Description |
|---|---|---|
| `/api/playlists` | GET / POST | Liste / crée une playlist |
| `/api/playlists/[id]` | DELETE | Supprime une playlist |
| `/api/playlists/[id]/titres` | POST | Ajoute un titre à une playlist |

### Découverte musicale
| Route | Méthode | Description |
|---|---|---|
| `/api/decouverte/titres` | GET | Récupère les titres recommandés de l'utilisateur |
| `/api/decouverte/valider` | POST | Change le statut d'un titre (propose/valide/refuse/importe) |
| `/api/decouverte/recherche` | POST | Lance une nouvelle découverte IA (Claude) |
| `/api/decouverte/ajouter` | POST | Ajoute un titre manuellement à la liste |
| `/api/decouverte/plus` | POST | Génère 20 titres supplémentaires (excluant déjà proposés) |

### Messages vocaux
| Route | Méthode | Description |
|---|---|---|
| `/api/messages` | GET | Liste les messages |
| `/api/messages/generer` | POST | Génère un message audio (ElevenLabs) |
| `/api/messages/generer-auto` | POST | Génère 5 messages auto après clonage |
| `/api/messages/[id]` | DELETE | Supprime un message |
| `/api/messages/[id]/activer` | POST | Active un message (désactive les autres de même phase) |

### Voix
| Route | Méthode | Description |
|---|---|---|
| `/api/voix/clone` | POST | Clone la voix à partir d'un enregistrement audio |
| `/api/voix/status` | GET | Retourne `{ hasVoice, status }` |

### Onboarding
| Route | Méthode | Description |
|---|---|---|
| `/api/onboarding/message` | POST | Envoie un message à Claude (chat onboarding) |
| `/api/onboarding/complete` | POST | Sauvegarde le profil après onboarding |

### Autres
| Route | Description |
|---|---|
| `/api/profile` | GET/PATCH profil utilisateur |
| `/api/conseils/[phase]` | GET conseil phasé (rotation) |
| `/api/audio/[id]/url` | Retourne une URL signée Supabase Storage (storage non utilisé en prod) |
| `/api/audio/upload` | Upload audio (désactivé — audio stocké localement) |
| `/api/session/log` | POST log anonymisé de session |
| `/api/billing/checkout` | POST crée une session de paiement Lemon Squeezy |
| `/api/billing/portal` | POST redirige vers le portail client Lemon Squeezy |
| `/api/webhook/lemonsqueezy` | POST webhook paiements (vérifie HMAC) |
| `/api/admin/conseils` | CRUD conseils (admin uniquement) |
| `/api/admin/stats` | GET statistiques (admin uniquement) |
| `/api/cron/health-check` | GET cron Vercel (09h00 UTC) |

---

## 5. FLUX UTILISATEUR COMPLET

### 5.1 Inscription et onboarding
```
1. /signup → création compte Supabase Auth
2. /login → email/password
3. Middleware vérifie session → redirect /app si déjà logué
4. /onboarding → chat conversationnel Claude Sonnet
   - Claude collecte : genres, chanteurs, chanson madeleine, passions,
     sensibilité volume, acouphènes
   - Dès les 6 objectifs remplis : JSON {"isComplete":true,"data":{...}}
   - POST /api/onboarding/complete → sauvegarde profil + lance découverte
5. Redirect /decouverte (ou /app si onboarding déjà fait)
```

### 5.2 Découverte musicale
```
1. /decouverte affiche la liste des titres_recommandes (statut='propose')
2. Aidant valide (✓), refuse (✗) ou marque "incertain"
3. Pour importer : cliquer "Importer ce titre"
   → POST /api/titres (crée l'enregistrement DB avec ID réel, filename='')
   → pickAndAssociate(newTitre.id) — ouvre le sélecteur de fichier
   → PATCH /api/titres/[id] (storage_path = file.name)
   → copyToMusicFolder(file) — copie dans le dossier NeuroWake Music si configuré
   → POST /api/decouverte/valider {statut:'importe'}
4. Bouton "Charger d'autres" → /api/decouverte/plus (20 nouveaux titres)
```

### 5.3 Configuration dossier NeuroWake Music (titres/page.tsx)
```
Chrome/Edge (File System Access API disponible) :
  → showDirectoryPicker({startIn:'music'}) → sélectionner dossier parent
  → getDirectoryHandle('NeuroWake Music', {create:true}) → créé automatiquement
  → handle stocké dans IndexedDB (STORE_DIR, clé 'musicFolder')

Safari/Firefox/iOS/Android (manuel) :
  → Instructions détaillées par OS affichées dans des <details> dépliables
  → Fichiers à copier manuellement dans le dossier créé
```

### 5.4 Association de fichiers (titres/page.tsx)
```
Status 'missing' → bouton "Associer le fichier"
  → pickAndAssociate(titreId) → FSA picker ou <input> fallback
  → associateHandle(id, handle) → IndexedDB STORE_HANDLES + STORE_META
  → PATCH /api/titres/[id] {storage_path: file.name}
  → copyToMusicFolder(file) → copie vers NeuroWake Music

Status 'pending' (handle stocké mais permission expirée) →
  → requestPermission(id) → prompt navigateur → URL recréée

Status 'ok' → lecteur peut lire le fichier directement
```

### 5.5 Lecteur (/app)
```
1. Sélection d'une phase (onglet) ou d'une playlist utilisateur
2. resolvePlaylist(type) :
   → GET /api/playlist/[type]
   → Pour chaque titre : getUrl(id) → si null : requestPermission(id)
   → Filtre les titres sans URL (fichier non associé)
3. Lecture via useAudioPlayer :
   → Web Audio API (AudioContext)
   → musicGainNode (volume musique)
   → gammaOscillator (40Hz, mode binaural/monaural/am)
   → gammaGainNode (intensité configurable)
4. Contrôles : Play/Pause, Suivant, Volume, Vitesse, Gamma on/off, mode Gamma
5. Messages vocaux : joués selon mode_diffusion (ouverture/cloture/rotation)
```

### 5.6 Messages vocaux (/app/messages)
```
1. Enregistrement voix aidant (MediaRecorder, 30-60s) → startRecording()
   → try-catch complet (NotAllowedError, NotFoundError)
2. Envoi vers /api/voix/clone (FormData audio/webm)
   → ElevenLabs : clone voix → voice_id stocké dans voice_profiles
   → voice_id JAMAIS retourné côté client
3. Génération auto de 5 messages (POST /api/messages/generer-auto)
4. Ajout manuel : titre + texte + phase + mode_diffusion
   → POST /api/messages/generer → ElevenLabs TTS → audio_storage_path
5. Max 20 messages par compte
```

---

## 6. COMPOSANTS CLÉS

### `lib/local-audio-store.ts`
Module central de gestion des fichiers audio locaux.

```typescript
// IndexedDB — DB: 'neurowake-audio-v1' version 2
// Stores: 'handles' (FSA handles), 'meta' (FileMeta), 'rootDir' (dossier NeuroWake Music)

supportsFileSystemAccess()   // showOpenFilePicker disponible ?
supportsDirectoryPicker()    // showDirectoryPicker disponible ? (Chrome/Edge uniquement)
pickAndAssociate(titreId)    // Ouvre picker → associeHandle ou associateFile
associateHandle(id, handle)  // FSA — persistant entre sessions
associateFile(id, file)      // Session-only (mobile/Firefox fallback)
getUrl(titreId)              // URL blob si permission 'granted', null sinon
requestPermission(titreId)   // Demande permission FSA (user gesture requis)
getFileStatus(titreId)       // 'ok' | 'pending' | 'missing'
checkStatuses(ids[])         // Batch check
removeAssociation(titreId)   // Supprime URL + handle + meta
setupMusicFolder()           // showDirectoryPicker → crée 'NeuroWake Music'
copyToMusicFolder(file)      // Copie un File dans le dossier configuré
hasMusicFolder()             // true si dossier configuré dans IndexedDB
revokeAllUrls()              // Révoque toutes les blob URLs de session
```

### `hooks/use-audio-player.ts`
Hook Web Audio API complet.
- **AudioBufferSourceNode** pour la lecture (supporte playbackRate)
- **OscillatorNode** (40Hz) + **GainNode** Gamma + **GainNode** musique
- Modes Gamma : binaural (L/R déphasés), monaural (mono), AM (modulation d'amplitude)
- Gestion répétitions / boucle infinie
- Progress bar temps réel
- Persistence du contexte audio entre tracks

### `lib/i18n.ts`
Système i18n maison (pas next-intl en production — voir note).
- 3 langues : `fr` | `es` | `en`
- ~200 clés typées via `TKey = keyof typeof T['fr']`
- Stockage : `localStorage` clé `nw-langue`
- Propagation : `CustomEvent('nw-langue-change')` → tous les composants se réabonnent
- Hook : `useT()` dans `hooks/use-t.ts`

> **Note :** Le dossier `messages/` contient des fichiers next-intl mais le système actif est `lib/i18n.ts`. Les deux coexistent. next-intl n'est pas actif en production.

### `lib/services/anthropic.ts`
- `sendOnboardingMessage()` — chat onboarding → détecte `{"isComplete":true}` par brace-counting
- `generateMusicDiscovery()` — génère 50 titres réels typés par phase
- `generateAutoMessages()` — 5 messages vocaux auto après clonage
- `generatePersonalizedAdvice()` — conseil phasé contextuel
- `detectLangueFromPays()` — détecte la langue depuis le pays de naissance
- Modèle principal : `claude-sonnet-4-6` (onboarding + découverte)
- Modèle secondaire : `claude-haiku-4-5-20251001` (filtrage + messages + conseils)

---

## 7. INTERNATIONALISATION (i18n)

### Langues supportées
- **Français** (défaut) — `fr`
- **Espagnol** — `es`
- **Anglais** — `en`

### Clés de traduction (catégories dans `lib/i18n.ts`)
- Navigation, phases, UI commun
- Page Lecteur (`player_*`)
- 40Hz Gamma (`gamma_*`)
- Page Titres (`tracks_*`, `file_*`, `folder_*`, `purchase_*`)
- Page Messages (`messages_*`, `record_*`, `mic_*`, `broadcast_*`)
- Page Paramètres (`settings_*`)
- Navigation mobile (`mobile_*`)

### Détection automatique de langue
- Lors de l'onboarding : `detectLangueFromPays(pays_jeunesse)` → langue suggérée
- Stockée dans `profils.langue` en base
- Modifiable dans les paramètres

---

## 8. AUDIO 40Hz — IMPLÉMENTATION WEB AUDIO API

Le 40Hz Gamma est une sinusoïde générée en temps réel, superposée à la musique.

```
AudioContext
  ├── AudioBufferSourceNode (musique)
  │     └── GainNode musicGain (volume musique)
  │           └── destination
  └── OscillatorNode (40Hz)
        └── GainNode gammaGain (intensité configurable 0–0.15)
              └── destination
```

### Modes Gamma
| Mode | Description | Compatible acouphènes |
|---|---|---|
| `binaural` | L : 440Hz, R : 480Hz → battement 40Hz | Non (désactivé si `acouphenes:true`) |
| `monaural` | L+R : 40Hz + 440Hz porteur | Oui |
| `am` | Modulation d'amplitude à 40Hz | Oui |

### Profils sonores
| Profil | Volume musique initial |
|---|---|
| douce | 0.50 |
| normale | 0.85 |
| sensible | 0.65 |

---

## 9. FONCTIONNALITÉS VALIDÉES (liste exhaustive)

### Authentification & Compte
- [x] Inscription email/password (Supabase Auth)
- [x] Connexion/déconnexion
- [x] Redirect automatique login ↔ app (middleware)
- [x] Réinitialisation mot de passe
- [x] Suppression de compte (avec confirmation)
- [x] Téléchargement des données personnelles

### Onboarding
- [x] Chat conversationnel guidé par Claude (6 objectifs)
- [x] Détection langue depuis pays de naissance
- [x] Extraction JSON robuste (brace-counting, tolère whitespace et markdown)
- [x] Génération immédiate de la liste de découverte à la fin de l'onboarding
- [x] Période de bumping calculée automatiquement : annee_naissance + 10 à + 25

### Découverte Musicale
- [x] Génération de 50 titres personnalisés par Claude Sonnet
- [x] Phase recommandée par titre (matin/soins/repas/apres-midi/coucher)
- [x] Validation / refus / incertain par l'aidant
- [x] Import d'un titre depuis la découverte → association fichier local
- [x] Chargement de 20 titres supplémentaires (exclut déjà proposés)
- [x] Recherche manuelle et ajout d'un titre

### Bibliothèque de titres (`/app/titres`)
- [x] Liste des titres importés avec statut de fichier (ok/pending/missing)
- [x] Ajout par glisser-déposer ou sélecteur de fichier
- [x] Association fichier via File System Access API (desktop, persistant)
- [x] Association session-only via `<input type="file">` (mobile/Firefox)
- [x] Ré-autorisation d'un handle expiré (`requestPermission`)
- [x] Remplacement de fichier
- [x] Copie automatique vers le dossier NeuroWake Music
- [x] Switch Favoris (dans_playlist_favorite)
- [x] Ajout à une playlist utilisateur
- [x] Création de nouvelle playlist depuis l'interface
- [x] Répétitions : 1×, 2×, 3×, 5×, 10×, ∞ (boucle infinie)
- [x] Note personnelle de l'aidant par titre
- [x] Suppression de titre

### Dossier NeuroWake Music
- [x] Création automatique via `showDirectoryPicker` (Chrome/Edge)
- [x] Instructions manuelles détaillées par OS (Windows/Mac/iOS/Android)
- [x] Handle du dossier persisté dans IndexedDB (STORE_DIR)
- [x] Sélecteur de fichier s'ouvre directement dans NeuroWake Music
- [x] Copie des fichiers importés dans le dossier
- [x] Changement d'emplacement

### Lecteur (`/app`)
- [x] 6 onglets de phase (Matin/Soins/Repas/Après-midi/Coucher/Favoris)
- [x] Playlists utilisateur personnalisées
- [x] Filtrage des titres par phase (`phase_recommandee`)
- [x] Lecture audio via Web Audio API (AudioBuffer)
- [x] 40Hz Gamma superposé (binaural/monaural/am)
- [x] Contrôle volume musique
- [x] Contrôle intensité Gamma
- [x] Activation/désactivation Gamma
- [x] Vitesse de lecture (0.75×, 1×, 1.25×, 1.5×)
- [x] Passage au titre suivant
- [x] Titre suivant affiché
- [x] Messages vocaux selon mode de diffusion
- [x] Conseil phasé affiché (rotation)
- [x] `requestPermission` automatique au démarrage si fichiers en 'pending'
- [x] Création de playlists utilisateur depuis le lecteur
- [x] Icône Heart pour la phase Soins (Lucide React)

### Messages Vocaux (`/app/messages`)
- [x] Enregistrement microphone (MediaRecorder API, audio/webm)
- [x] Gestion erreurs micro : NotAllowedError, NotFoundError, HTTPS requis
- [x] Clonage de voix via ElevenLabs (voice_id jamais exposé client)
- [x] Génération automatique de 5 messages après clonage
- [x] Création manuelle de messages avec sélection phase + mode
- [x] 3 modes de diffusion : avant la musique / ouverture+clôture / entre les titres
- [x] Activation d'un message (désactive les autres de la même phase)
- [x] Suppression de messages
- [x] Compteur 0/20 messages
- [x] Badge "Voix prête" quand le profil vocal est actif

### Paramètres
- [x] Changement de langue (FR/ES/EN)
- [x] Modification du profil sonore
- [x] Mode 40Hz
- [x] Gestion abonnement Lemon Squeezy
- [x] Déconnexion
- [x] Suppression de compte

### Abonnement
- [x] Essai gratuit 14 jours (créé à l'inscription)
- [x] Checkout Lemon Squeezy
- [x] Portal client Lemon Squeezy
- [x] Webhook HMAC pour mise à jour du statut
- [x] Statuts : actif / inactif / trial / suspendu

### Admin
- [x] CRUD des conseils phasés (par phase + langue)
- [x] Statistiques d'usage
- [x] Protégé par `ADMIN_EMAIL`

### PWA & Infrastructure
- [x] Service Worker (sw.js)
- [x] Web App Manifest
- [x] Cron Vercel health-check (09h00 UTC quotidien)
- [x] CRON_SECRET pour sécuriser le endpoint cron

---

## 10. DÉCISIONS TECHNIQUES IMPORTANTES

### DT-01 — Stockage audio 100% local
**Décision :** Les fichiers audio ne sont jamais uploadés sur Supabase Storage.
**Raison :** Droits d'auteur (iTunes, Amazon), coût de stockage, latence.
**Implémentation :** `lib/local-audio-store.ts` — IndexedDB pour les handles FSA, blob URLs en session, `storage_path` en base = nom du fichier uniquement (hint d'affichage).

### DT-02 — File System Access API pour la persistance des handles
**Décision :** Sur Chrome/Edge desktop, les `FileSystemFileHandle` sont persistés dans IndexedDB.
**Raison :** Permet de retrouver le fichier après rechargement de page sans re-picker.
**Limitation :** Safari et Firefox n'implémentent pas `showDirectoryPicker`. Sur mobile, les handles sont session-only.
**Clé IndexedDB :** Toujours l'UUID réel du titre en base (jamais un ID temporaire).

### DT-03 — Créer l'enregistrement DB avant le picker FSA
**Décision :** Dans `importerFichier` (découverte) et `confirmNewTitre` (titres) : `POST /api/titres` en premier → obtenir l'UUID réel → puis `pickAndAssociate(realId)`.
**Raison :** Le handle FSA doit être indexé sous l'UUID permanent. Si on ouvre le picker avant d'avoir l'UUID, le handle serait stocké sous un ID temporaire et perdu après rechargement.
**Rollback :** Si l'utilisateur annule le picker → `DELETE /api/titres/[newId]`.

### DT-04 — Claude Sonnet pour la découverte musicale (pas iTunes/MusicBrainz)
**Décision :** `generateMusicDiscovery()` demande à Claude de générer directement les titres avec phases.
**Raison :** MusicBrainz est trop restrictif (metadata uniquement, peu de hits), iTunes Search est limité. Claude produit des résultats culturellement corrects et populaires.
**Modèle :** `claude-sonnet-4-6` (qualité > vitesse pour cette tâche).

### DT-05 — Système i18n maison (lib/i18n.ts)
**Décision :** Dictionnaires statiques `const T = { fr: {}, es: {}, en: {} }` avec type `TKey`.
**Raison :** next-intl et next-i18next ajoutent de la complexité de configuration pour une app SPA. Le CustomEvent permet la mise à jour en temps réel sans rechargement.
**Conséquence :** Le dossier `messages/` (next-intl) coexiste mais n'est pas actif. Il peut être supprimé sans impact.

### DT-06 — 40Hz via Web Audio API (pas de fichier audio)
**Décision :** L'oscillateur 40Hz est généré en temps réel par `OscillatorNode`.
**Raison :** Pas de droits à gérer, gain précisément contrôlable, synchronisé avec la musique.

### DT-07 — Lemon Squeezy (pas Stripe)
**Décision :** Paiements via Lemon Squeezy.
**Raison :** Gestion VAT/TVA automatique, pas besoin de compte marchand séparé.

### DT-08 — Stratégie double pour les playlists par phase
**Décision :** `/api/playlist/[type]` essaie Strategy A (colonne `phase_recommandee` directe), puis Strategy B (join `titres_recommandes` par titre+artiste) si error `42703`.
**Raison :** Compatibilité avec les instances Supabase où la migration 001 n'a pas encore été appliquée.

### DT-09 — `phase_recommandee` null = apparaît dans tous les onglets
**Décision :** Un titre avec `phase_recommandee IS NULL` est inclus dans toutes les phases.
**Raison :** Titres ajoutés manuellement sans phase → toujours disponibles.

### DT-10 — Types Supabase non régénérés après migration 001
**Décision :** Cast `as any` dans `POST /api/titres` pour contourner l'absence de `phase_recommandee` dans les types générés.
**Action requise :** Régénérer les types Supabase (`npx supabase gen types typescript`) après application de la migration 001.

---

## 11. BUGS CORRIGÉS

### BUG-01 — Playlists par phase toujours vides (root cause double)
**Cause 1 :** Colonne `phase_recommandee` absente du schéma initial de `titres_recommandes` → aucune phase n'était jamais sauvegardée.
**Cause 2 :** Dans `importerFichier`, le handle FSA était stocké sous un ID temporaire `tmp-${titre.id}`, puis supprimé lors de la ré-association avec `associateFile` (session-only). Après rechargement, `getUrl()` retournait null pour tous les titres → `resolvePlaylist` retournait une liste vide.
**Fix :** Migration 001 (ajout colonnes) + Réécriture de `importerFichier` pour créer l'enregistrement DB en premier, puis `pickAndAssociate(realId)`.
**Fichiers :** `supabase/migrations/001_add_phase_recommandee.sql`, `app/decouverte/page.tsx`, `app/api/titres/route.ts`, `app/api/playlist/[type]/route.ts`

### BUG-02 — Copie vers dossier NeuroWake Music non effectuée
**Cause :** `copyToMusicFolder(file)` n'était pas appelé dans `importerFichier`.
**Fix :** Ajout de l'appel après association dans `importerFichier` et `associerFichier`.
**Fichiers :** `app/decouverte/page.tsx`, `app/app/titres/page.tsx`

### BUG-03 — Bouton "Créer une playlist" silencieux (aucune réaction)
**Cause :** `createPlaylist()` dans `app/app/page.tsx` n'avait aucun `else` ni `catch` — les erreurs API passaient silencieusement.
**Fix :** Ajout d'un bloc `else` avec toast d'erreur + `catch` pour les erreurs réseau.
**Fichier :** `app/app/page.tsx`

### BUG-04 — Bouton microphone ne lançait pas l'enregistrement
**Cause :** `startRecording()` n'était pas enveloppé dans un `try-catch` — toute erreur (permission refusée, micro absent, HTTPS manquant) était silencieuse.
**Fix :** Réécriture complète avec `try-catch`, gestion spécifique de `NotAllowedError`, `PermissionDeniedError`, `NotFoundError`, `DevicesNotFoundError`, vérification préalable de `navigator.mediaDevices?.getUserMedia`.
**Fichier :** `app/app/messages/page.tsx`

### BUG-05 — Textes non traduits en espagnol et anglais
**Cause :** Toute la section "Dossier NeuroWake Music" de `titres/page.tsx` était en français codé en dur. Les clés de gestion d'erreur micro (`mic_denied`, etc.) manquaient dans les 3 langues.
**Fix :** Ajout de ~44 nouvelles clés par langue dans `lib/i18n.ts`. Remplacement de tous les textes hardcodés dans `titres/page.tsx` par des appels `t()`.
**Fichiers :** `lib/i18n.ts`, `app/app/titres/page.tsx`

### BUG-06 — Icône de la phase "Soins" non différenciée
**Cause :** Phase soins affichait l'emoji 🕊️ comme les autres phases (affichage via `t()`), sans distinction visuelle dans les boutons de phase.
**Fix :** Remplacement par `<Heart>` de Lucide React pour la phase `soins` dans le lecteur.
**Fichier :** `app/app/page.tsx`

### BUG-07 — Erreur TypeScript phase_recommandee dans POST /api/titres
**Cause :** Les types Supabase générés ne connaissent pas encore `phase_recommandee` (migration 001 non appliquée → types non régénérés). Le spread conditionnel `...(condition ? {phase_recommandee: v} : {})` échoue à la vérification TypeScript `RejectExcessProperties`.
**Fix :** Construction de l'objet d'insertion avec `const insertRow: any = {...}` + assignation conditionnelle.
**Fichier :** `app/api/titres/route.ts`

### BUG-08 — Toggle `valider()` remettait le statut à 'propose'
**Cause :** La fonction `valider(titre.id, 'valide')` basculait l'état — si le titre était déjà 'valide', il repassait à 'propose'.
**Fix :** Appel direct de l'API avec `statut:'importe'` sans passer par la fonction de toggle.
**Fichier :** `app/decouverte/page.tsx`

---

## 12. POINTS EN COURS / À CORRIGER

### P-01 — Migration 001 non appliquée en production (CRITIQUE)
**Statut :** En attente d'action manuelle.
**Action :** Ouvrir Supabase SQL Editor → coller le contenu de `supabase/migrations/001_add_phase_recommandee.sql` → Run.
**Impact si non fait :** Les playlists par phase fonctionnent via Strategy B (fallback join) mais moins efficacement. Les nouveaux titres importés depuis la découverte n'auront pas de phase stockée en `titres_audio`.

### P-02 — Types Supabase à régénérer
**Statut :** En attente (bloqué par P-01).
**Action :** Après P-01, exécuter : `npx supabase gen types typescript --project-id [PROJECT_ID] > lib/supabase/types.ts`
**Impact :** Workaround `as any` dans `app/api/titres/route.ts` ligne ~65.

### P-03 — Handles FSA session-only sur mobile et Firefox
**Statut :** Limitation browser, non résolvable.
**Comportement :** Sur iOS Safari, Android Chrome < 86, et Firefox : les `FileSystemFileHandle` ne sont pas persistés entre sessions. L'utilisateur doit ré-associer les fichiers après rechargement.
**Atténuation :** Le `storage_path` (nom du fichier) est toujours affiché comme hint. Le dossier NeuroWake Music facilite la re-sélection.

### P-04 — ElevenLabs requis pour les messages vocaux
**Statut :** Fonctionnalité optionnelle.
**Comportement si ELEVENLABS_API_KEY absent :** L'endpoint `/api/voix/clone` retourne `{code:'ELEVENLABS_NOT_CONFIGURED'}`. Le toast informe l'utilisateur.
**Note :** Le clonage de voix est une feature premium. L'app fonctionne sans (musique seule).

### P-05 — Bucket Supabase Storage 'audio-prive' déclaré mais non utilisé
**Statut :** Dead code.
**Description :** Le schéma SQL crée le bucket `audio-prive` et ses RLS policies. En pratique, aucun fichier audio n'est uploadé (DT-01). Les routes `/api/audio/upload` et `/api/audio/[id]/url` sont des stubs.
**Action suggérée :** Supprimer ces routes ou documenter comme "réservé pour messages vocaux ElevenLabs".

### P-06 — next-intl cohabite avec lib/i18n.ts (système dupliqué)
**Statut :** Non bloquant.
**Description :** Le dossier `messages/` contient des fichiers next-intl, mais le système actif est `lib/i18n.ts`. next-intl est listé en dépendance.
**Action suggérée :** Soit supprimer `messages/` et retirer next-intl des dépendances, soit migrer vers next-intl proprement.

### P-07 — Pas de gestion de l'expiration du trial dans l'UI
**Statut :** À implémenter.
**Description :** Quand `trial_ends_at` est passé et que le statut est toujours 'trial', l'accès n'est pas restreint.
**Action :** Ajouter une vérification middleware ou dans le layout `/app` pour bloquer l'accès si trial expiré sans abonnement actif.

### P-08 — Génération de conseils personnalisés non branchée
**Statut :** Backend prêt, frontend non branché.
**Description :** `generatePersonalizedAdvice()` existe dans `lib/services/anthropic.ts` mais `/api/conseils/[phase]` retourne des conseils de la table `conseils` (admin), pas des conseils générés par IA.

---

## 13. VARIABLES D'ENVIRONNEMENT

### Fichier `.env.local` (développement) — `.env.example` disponible

| Variable | Requise | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Oui | URL du projet Supabase (ex: `https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Oui | Clé anon Supabase (publique, côté client) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Oui | Clé service role (privée, côté serveur uniquement) |
| `ANTHROPIC_API_KEY` | ✅ Oui | Clé API Anthropic Claude (sk-ant-...) |
| `NEXT_PUBLIC_APP_URL` | ✅ Oui | URL de l'application (`https://app.neurologis.fr`) |
| `ELEVENLABS_API_KEY` | ⚠️ Optionnel | Clé ElevenLabs pour le clonage de voix (sk_...) |
| `LEMON_SQUEEZY_API_KEY` | ⚠️ Optionnel | Clé API Lemon Squeezy |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | ⚠️ Optionnel | Secret pour vérification HMAC des webhooks |
| `LEMON_SQUEEZY_STORE_ID` | ⚠️ Optionnel | ID boutique Lemon Squeezy |
| `LEMON_SQUEEZY_VARIANT_ID` | ⚠️ Optionnel | ID variante de l'abonnement |
| `ADMIN_EMAIL` | ⚠️ Optionnel | Email admin pour accès `/admin` |
| `CRON_SECRET` | ⚠️ Optionnel | Bearer token pour sécuriser `/api/cron/health-check` |
| `ITUNES_AFFILIATE_TOKEN` | ⚠️ Optionnel | Token affilié iTunes (non utilisé en prod) |
| `AMAZON_ASSOCIATE_TAG` | ⚠️ Optionnel | Tag associé Amazon (non utilisé en prod) |

### Variables Vercel (production)
Toutes les variables ci-dessus doivent être configurées dans le Dashboard Vercel → Settings → Environment Variables.

---

## 14. COMMANDES DE DÉVELOPPEMENT

```bash
# Installation
pnpm install

# Développement local
pnpm dev          # http://localhost:3000

# Build de production
pnpm build

# Vérification TypeScript sans build
pnpm type-check

# Linting
pnpm lint
```

### Régénération des types Supabase
```bash
npx supabase gen types typescript \
  --project-id [SUPABASE_PROJECT_ID] \
  > lib/supabase/types.ts
```

### Application de la migration 001
1. Ouvrir Supabase Dashboard → SQL Editor
2. Cliquer "New query"
3. Coller le contenu de `supabase/migrations/001_add_phase_recommandee.sql`
4. Cliquer "Run"

---

## 15. RÉFÉRENCE PHASES

| Clé DB | Label FR | Label ES | Label EN | BPM indicatif | Style musical |
|---|---|---|---|---|---|
| `matin` | Matin | Mañana | Morning | > 100 | Énergique, dynamique |
| `soins` | Soins | Cuidados | Care | 60–80 | Doux, apaisant |
| `repas` | Repas | Comida | Meal | 80–100 | Gai, festif |
| `apres-midi` | Après-midi | Tarde | Afternoon | 70–90 | Nostalgique, mélancolique |
| `coucher` | Coucher | Noche | Bedtime | < 70 | Lent, relaxant |
| `favorite` | Favorite | Favoritas | Favorites | — | Tous titres favoris |

---

*Fin du document SPECS.md*
