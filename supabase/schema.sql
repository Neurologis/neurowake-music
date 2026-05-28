create extension if not exists "uuid-ossp";

-- Profils sonores
create table profils (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade unique,
  prenom_proche text,
  annee_naissance integer not null,
  ville_jeunesse text not null,
  pays_jeunesse text default 'France',
  bump_annee_debut integer not null,
  bump_annee_fin integer not null,
  sensibilite_volume text check (sensibilite_volume in
    ('douce','normale','sensible')) default 'normale',
  acouphenes boolean default false,
  gamma_gain decimal(4,2) default 0.04,
  gamma_mode text check (gamma_mode in
    ('binaural','monaural','am')) default 'binaural',
  chanson_madeleine text,
  passions text[] default '{}',
  genres_preferes text[] default '{}',
  routine_prioritaire text check (routine_prioritaire in
    ('matin','soins','repas','apres-midi','coucher'))
    default 'matin',
  langue text check (langue in ('fr','es','en')) default 'fr',
  onboarding_complet boolean default false,
  conversation_history jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Titres audio importés
create table titres_audio (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  titre text not null,
  artiste text not null,
  annee integer,
  pochette_url text,
  storage_path text not null,
  duree_secondes integer,
  format text,
  taille_octets bigint,
  repetitions integer default 1,
  boucle_infinie boolean default false,
  note_aidant text,
  ordre integer default 0,
  dans_playlist_favorite boolean default true,
  musicbrainz_id text,
  created_at timestamptz default now()
);

-- Titres recommandés (avant import)
create table titres_recommandes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  titre text not null,
  artiste text not null,
  annee integer,
  pochette_url text,
  musicbrainz_id text,
  statut text check (statut in
    ('propose','valide','refuse','incertain','importe'))
    default 'propose',
  created_at timestamptz default now()
);

-- Messages vocaux
create table messages_vocaux (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  titre text not null,
  texte_source text not null,
  audio_storage_path text,
  duree_secondes integer,
  phase text check (phase in
    ('matin','soins','repas','apres-midi','coucher','toutes'))
    default 'toutes',
  mode_diffusion text check (mode_diffusion in
    ('ouverture','cloture','rotation')) default 'ouverture',
  actif boolean default false,
  auto_genere boolean default false,
  ordre integer default 0,
  created_at timestamptz default now()
);

-- Profils de voix clonée
create table voice_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade unique,
  elevenlabs_voice_id text not null,
  clone_status text check (clone_status in
    ('pending','ready','error')) default 'pending',
  created_at timestamptz default now()
);

-- Log sessions (anonymisé)
create table sessions_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  playlist_type text,
  duree_secondes integer,
  message_joue boolean default false,
  gamma_actif boolean default true,
  gamma_mode text,
  created_at timestamptz default now()
);

-- Abonnements Lemon Squeezy
create table abonnements (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade unique,
  ls_customer_id text unique,
  ls_subscription_id text unique,
  statut text check (statut in
    ('actif','inactif','trial','suspendu')) default 'trial',
  trial_ends_at timestamptz
    default (now() + interval '14 days'),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Conseils phasés (admin)
create table conseils (
  id uuid primary key default uuid_generate_v4(),
  phase text check (phase in
    ('matin','soins','repas','apres-midi','coucher')) not null,
  langue text check (langue in ('fr','es','en')) not null,
  texte text not null,
  actif boolean default true,
  ordre integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tracking rotation conseils
create table conseils_affichages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  conseil_id uuid references conseils(id),
  affiche_at timestamptz default now()
);

-- Row Level Security
alter table profils enable row level security;
alter table titres_audio enable row level security;
alter table titres_recommandes enable row level security;
alter table messages_vocaux enable row level security;
alter table voice_profiles enable row level security;
alter table sessions_log enable row level security;
alter table abonnements enable row level security;
alter table conseils enable row level security;
alter table conseils_affichages enable row level security;

create policy "own" on profils
  for all using (auth.uid() = user_id);
create policy "own" on titres_audio
  for all using (auth.uid() = user_id);
create policy "own" on titres_recommandes
  for all using (auth.uid() = user_id);
create policy "own" on messages_vocaux
  for all using (auth.uid() = user_id);
create policy "own" on voice_profiles
  for all using (auth.uid() = user_id);
create policy "own" on sessions_log
  for all using (auth.uid() = user_id);
create policy "own" on abonnements
  for all using (auth.uid() = user_id);
create policy "own" on conseils_affichages
  for all using (auth.uid() = user_id);
create policy "read_conseils" on conseils
  for select using (auth.role() = 'authenticated');
create policy "admin_conseils" on conseils
  for all using (auth.jwt() ->> 'role' = 'admin');

-- Trigger updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profils_updated_at
  before update on profils
  for each row execute function update_updated_at();

create trigger abonnements_updated_at
  before update on abonnements
  for each row execute function update_updated_at();

create trigger conseils_updated_at
  before update on conseils
  for each row execute function update_updated_at();

-- Storage buckets
insert into storage.buckets (id, name, public)
  values ('audio-prive', 'audio-prive', false)
  on conflict (id) do nothing;

create policy "own_audio" on storage.objects
  for all using (
    bucket_id = 'audio-prive' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Index pour les performances
create index idx_titres_audio_user_id on titres_audio(user_id);
create index idx_titres_audio_ordre on titres_audio(user_id, ordre);
create index idx_messages_vocaux_user_phase on messages_vocaux(user_id, phase);
create index idx_conseils_phase_langue on conseils(phase, langue, actif);
create index idx_sessions_log_user_date on sessions_log(user_id, created_at);
