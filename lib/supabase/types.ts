export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------------
// Database type – structure must match what @supabase/supabase-js v2 expects:
//   • Each table must have Row / Insert / Update / Relationships
//   • The public schema must have Tables / Views / Functions / Enums / CompositeTypes
// Without these, Database['public'] fails to extend GenericSchema and every
// .insert() / .update() / .upsert() call resolves to type `never`.
// ---------------------------------------------------------------------------

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
        Insert: {
          id?: string;
          user_id: string;
          prenom_proche?: string | null;
          annee_naissance: number;
          ville_jeunesse: string;
          pays_jeunesse?: string;
          bump_annee_debut: number;
          bump_annee_fin: number;
          sensibilite_volume?: 'douce' | 'normale' | 'sensible';
          acouphenes?: boolean;
          gamma_gain?: number;
          gamma_mode?: 'binaural' | 'monaural' | 'am';
          chanson_madeleine?: string | null;
          passions?: string[];
          genres_preferes?: string[];
          routine_prioritaire?: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';
          langue?: 'fr' | 'es' | 'en';
          onboarding_complet?: boolean;
          conversation_history?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          prenom_proche?: string | null;
          annee_naissance?: number;
          ville_jeunesse?: string;
          pays_jeunesse?: string;
          bump_annee_debut?: number;
          bump_annee_fin?: number;
          sensibilite_volume?: 'douce' | 'normale' | 'sensible';
          acouphenes?: boolean;
          gamma_gain?: number;
          gamma_mode?: 'binaural' | 'monaural' | 'am';
          chanson_madeleine?: string | null;
          passions?: string[];
          genres_preferes?: string[];
          routine_prioritaire?: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';
          langue?: 'fr' | 'es' | 'en';
          onboarding_complet?: boolean;
          conversation_history?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
        Insert: {
          id?: string;
          user_id: string;
          titre: string;
          artiste: string;
          annee?: number | null;
          pochette_url?: string | null;
          storage_path: string;
          duree_secondes?: number | null;
          format?: string | null;
          taille_octets?: number | null;
          repetitions?: number;
          boucle_infinie?: boolean;
          note_aidant?: string | null;
          ordre?: number;
          dans_playlist_favorite?: boolean;
          musicbrainz_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          titre?: string;
          artiste?: string;
          annee?: number | null;
          pochette_url?: string | null;
          storage_path?: string;
          duree_secondes?: number | null;
          format?: string | null;
          taille_octets?: number | null;
          repetitions?: number;
          boucle_infinie?: boolean;
          note_aidant?: string | null;
          ordre?: number;
          dans_playlist_favorite?: boolean;
          musicbrainz_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
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
        Insert: {
          id?: string;
          user_id: string;
          titre: string;
          artiste: string;
          annee?: number | null;
          pochette_url?: string | null;
          musicbrainz_id?: string | null;
          statut?: 'propose' | 'valide' | 'refuse' | 'incertain' | 'importe';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          titre?: string;
          artiste?: string;
          annee?: number | null;
          pochette_url?: string | null;
          musicbrainz_id?: string | null;
          statut?: 'propose' | 'valide' | 'refuse' | 'incertain' | 'importe';
          created_at?: string;
        };
        Relationships: [];
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
        Insert: {
          id?: string;
          user_id: string;
          titre: string;
          texte_source: string;
          audio_storage_path?: string | null;
          duree_secondes?: number | null;
          phase?: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher' | 'toutes';
          mode_diffusion?: 'ouverture' | 'cloture' | 'rotation';
          actif?: boolean;
          auto_genere?: boolean;
          ordre?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          titre?: string;
          texte_source?: string;
          audio_storage_path?: string | null;
          duree_secondes?: number | null;
          phase?: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher' | 'toutes';
          mode_diffusion?: 'ouverture' | 'cloture' | 'rotation';
          actif?: boolean;
          auto_genere?: boolean;
          ordre?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      voice_profiles: {
        Row: {
          id: string;
          user_id: string;
          elevenlabs_voice_id: string;
          clone_status: 'pending' | 'ready' | 'error';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          elevenlabs_voice_id: string;
          clone_status?: 'pending' | 'ready' | 'error';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          elevenlabs_voice_id?: string;
          clone_status?: 'pending' | 'ready' | 'error';
          created_at?: string;
        };
        Relationships: [];
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
        Insert: {
          id?: string;
          user_id: string;
          playlist_type?: string | null;
          duree_secondes?: number | null;
          message_joue?: boolean;
          gamma_actif?: boolean;
          gamma_mode?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          playlist_type?: string | null;
          duree_secondes?: number | null;
          message_joue?: boolean;
          gamma_actif?: boolean;
          gamma_mode?: string | null;
          created_at?: string;
        };
        Relationships: [];
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
        Insert: {
          id?: string;
          user_id: string;
          ls_customer_id?: string | null;
          ls_subscription_id?: string | null;
          statut?: 'actif' | 'inactif' | 'trial' | 'suspendu';
          trial_ends_at?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          ls_customer_id?: string | null;
          ls_subscription_id?: string | null;
          statut?: 'actif' | 'inactif' | 'trial' | 'suspendu';
          trial_ends_at?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
        Insert: {
          id?: string;
          phase: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';
          langue: 'fr' | 'es' | 'en';
          texte: string;
          actif?: boolean;
          ordre?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          phase?: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';
          langue?: 'fr' | 'es' | 'en';
          texte?: string;
          actif?: boolean;
          ordre?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conseils_affichages: {
        Row: {
          id: string;
          user_id: string;
          conseil_id: string;
          affiche_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          conseil_id: string;
          affiche_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          conseil_id?: string;
          affiche_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conseils_affichages_conseil_id_fkey';
            columns: ['conseil_id'];
            isOneToOne: false;
            referencedRelation: 'conseils';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// ---------------------------------------------------------------------------
// Convenience helper types (mirrors what Supabase CLI generates)
// ---------------------------------------------------------------------------

type PublicSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] &
        PublicSchema['Views'])
    ? (PublicSchema['Tables'] &
        PublicSchema['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
