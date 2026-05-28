export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profils: {
        Row: {
          id: string;
          user_id: string;
          prenom_proche: string | null;
          annee_naissance: number;
          ville_jeunesse: string;
          pays_jeunesse: string;
          bump_annee_debut: number;
          bump_annee_fin: number;
          sensibilite_volume: 'douce' | 'normale' | 'sensible';
          acouphenes: boolean;
          gamma_gain: number;
          gamma_mode: 'binaural' | 'monaural' | 'am';
          chanson_madeleine: string | null;
          passions: string[];
          genres_preferes: string[];
          routine_prioritaire: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';
          langue: 'fr' | 'es' | 'en';
          onboarding_complet: boolean;
          conversation_history: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profils']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profils']['Insert']>;
      };
      titres_audio: {
        Row: {
          id: string;
          user_id: string;
          titre: string;
          artiste: string;
          annee: number | null;
          pochette_url: string | null;
          storage_path: string;
          duree_secondes: number | null;
          format: string | null;
          taille_octets: number | null;
          repetitions: number;
          boucle_infinie: boolean;
          note_aidant: string | null;
          ordre: number;
          dans_playlist_favorite: boolean;
          musicbrainz_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['titres_audio']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['titres_audio']['Insert']>;
      };
      titres_recommandes: {
        Row: {
          id: string;
          user_id: string;
          titre: string;
          artiste: string;
          annee: number | null;
          pochette_url: string | null;
          musicbrainz_id: string | null;
          statut: 'propose' | 'valide' | 'refuse' | 'incertain' | 'importe';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['titres_recommandes']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['titres_recommandes']['Insert']>;
      };
      messages_vocaux: {
        Row: {
          id: string;
          user_id: string;
          titre: string;
          texte_source: string;
          audio_storage_path: string | null;
          duree_secondes: number | null;
          phase: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher' | 'toutes';
          mode_diffusion: 'ouverture' | 'cloture' | 'rotation';
          actif: boolean;
          auto_genere: boolean;
          ordre: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['messages_vocaux']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['messages_vocaux']['Insert']>;
      };
      voice_profiles: {
        Row: {
          id: string;
          user_id: string;
          elevenlabs_voice_id: string;
          clone_status: 'pending' | 'ready' | 'error';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['voice_profiles']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['voice_profiles']['Insert']>;
      };
      sessions_log: {
        Row: {
          id: string;
          user_id: string;
          playlist_type: string | null;
          duree_secondes: number | null;
          message_joue: boolean;
          gamma_actif: boolean;
          gamma_mode: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sessions_log']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['sessions_log']['Insert']>;
      };
      abonnements: {
        Row: {
          id: string;
          user_id: string;
          ls_customer_id: string | null;
          ls_subscription_id: string | null;
          statut: 'actif' | 'inactif' | 'trial' | 'suspendu';
          trial_ends_at: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['abonnements']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['abonnements']['Insert']>;
      };
      conseils: {
        Row: {
          id: string;
          phase: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';
          langue: 'fr' | 'es' | 'en';
          texte: string;
          actif: boolean;
          ordre: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['conseils']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['conseils']['Insert']>;
      };
      conseils_affichages: {
        Row: {
          id: string;
          user_id: string;
          conseil_id: string;
          affiche_at: string;
        };
        Insert: Omit<Database['public']['Tables']['conseils_affichages']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['conseils_affichages']['Insert']>;
      };
    };
  };
};
