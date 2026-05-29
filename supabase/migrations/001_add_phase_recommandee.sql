-- Migration 001: Add phase_recommandee to titres_recommandes and titres_audio
-- Run this once in Supabase SQL Editor → New query → paste → Run

-- 1. Colonne phase dans titres_recommandes (si absente)
ALTER TABLE titres_recommandes
  ADD COLUMN IF NOT EXISTS phase_recommandee text
    CHECK (phase_recommandee IN ('matin','soins','repas','apres-midi','coucher'));

-- 2. Colonne phase dans titres_audio (si absente)
ALTER TABLE titres_audio
  ADD COLUMN IF NOT EXISTS phase_recommandee text
    CHECK (phase_recommandee IN ('matin','soins','repas','apres-midi','coucher'));

-- 3. storage_path peut être vide (pour les imports depuis Découverte avant pick)
ALTER TABLE titres_audio
  ALTER COLUMN storage_path SET DEFAULT '';
-- Rendre nullable les enregistrements existants sans chemin
UPDATE titres_audio SET storage_path = '' WHERE storage_path IS NULL;

-- 4. Index pour les requêtes par phase
CREATE INDEX IF NOT EXISTS idx_titres_audio_phase
  ON titres_audio(user_id, phase_recommandee);
CREATE INDEX IF NOT EXISTS idx_titres_recommandes_phase
  ON titres_recommandes(user_id, phase_recommandee)
  WHERE phase_recommandee IS NOT NULL;
