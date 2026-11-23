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
      condominiums: {
        Row: {
          address: string;
          demo_dataset: string | null;
          id: string;
          manager_id: string;
          name: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          address: string;
          demo_dataset?: string | null;
          id?: string;
          manager_id: string;
          name: string;
          slug: string;
        };
        Update: {
          address?: string;
          demo_dataset?: string | null;
          id?: string;
          manager_id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "condominiums_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      occurrence_attachments: {
        Row: {
          content_type: string;
          created_at: string;
          event_id: number;
          file_name: string;
          id: string;
          occurrence_id: string;
          size_bytes: number;
          storage_bucket: string;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          content_type: string;
          created_at?: string;
          event_id: number;
          file_name: string;
          id?: string;
          occurrence_id: string;
          size_bytes: number;
          storage_bucket: string;
          storage_path: string;
        };
        Update: {
          content_type?: string;
          created_at?: string;
          event_id?: number;
          file_name?: string;
          id?: string;
          occurrence_id?: string;
          size_bytes?: number;
          storage_bucket?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "occurrence_attachments_occurrence_id_event_id_fkey";
            columns: ["occurrence_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "occurrence_events";
            referencedColumns: ["occurrence_id", "id"];
          },
        ];
      };
      occurrence_events: {
        Row: {
          author_name: string | null;
          author_phone: string | null;
          author_profile_id: string | null;
          author_role: string | null;
          author_type: string;
          data: NonNullable<Json>;
          delegation_started_at: string | null;
          due_at: string | null;
          event_type: string;
          id: number;
          internal_description: string;
          is_human_action: boolean;
          occurred_at: string;
          occurrence_id: string;
          previous_due_at: string | null;
          previous_responsible_name: string | null;
          priority_snapshot: string | null;
          public_text: string | null;
          responsible_name: string | null;
          responsible_phone: string | null;
          responsible_role: string | null;
          visible_to_resident: boolean;
        };
        ComputedFields: never;
        Insert: {
          author_name?: string | null;
          author_phone?: string | null;
          author_profile_id?: string | null;
          author_role?: string | null;
          author_type: string;
          data?: NonNullable<Json>;
          delegation_started_at?: string | null;
          due_at?: string | null;
          event_type: string;
          id?: never;
          internal_description: string;
          is_human_action?: boolean;
          occurred_at?: string;
          occurrence_id: string;
          previous_due_at?: string | null;
          previous_responsible_name?: string | null;
          priority_snapshot?: string | null;
          public_text?: string | null;
          responsible_name?: string | null;
          responsible_phone?: string | null;
          responsible_role?: string | null;
          visible_to_resident?: boolean;
        };
        Update: {
          author_name?: string | null;
          author_phone?: string | null;
          author_profile_id?: string | null;
          author_role?: string | null;
          author_type?: string;
          data?: NonNullable<Json>;
          delegation_started_at?: string | null;
          due_at?: string | null;
          event_type?: string;
          id?: never;
          internal_description?: string;
          is_human_action?: boolean;
          occurred_at?: string;
          occurrence_id?: string;
          previous_due_at?: string | null;
          previous_responsible_name?: string | null;
          priority_snapshot?: string | null;
          public_text?: string | null;
          responsible_name?: string | null;
          responsible_phone?: string | null;
          responsible_role?: string | null;
          visible_to_resident?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "occurrence_events_author_profile_id_fkey";
            columns: ["author_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "occurrence_events_occurrence_id_fkey";
            columns: ["occurrence_id"];
            isOneToOne: false;
            referencedRelation: "occurrences";
            referencedColumns: ["id"];
          },
        ];
      };
      occurrences: {
        Row: {
          ai_failure_reason: string | null;
          category: string | null;
          channel: string;
          completed_at: string | null;
          condominium_id: string;
          created_by_profile_id: string | null;
          decided_priority: string | null;
          decided_suggested_priority: string | null;
          decision: string | null;
          description: string;
          due_at: string | null;
          final_priority: string | null;
          id: string;
          internal_note: string | null;
          location: string | null;
          number: number;
          origin: string;
          priority_change_reason: string | null;
          priority_decided_at: string | null;
          registered_at: string;
          reporter_name: string | null;
          reporter_phone: string | null;
          reporter_unit_or_role: string | null;
          responsible_name: string | null;
          responsible_phone: string | null;
          responsible_profile_id: string | null;
          responsible_role: string | null;
          status: string;
          suggested_priority: string | null;
          suggestion_at: string | null;
          suggestion_reason: string | null;
          suggestion_source: string | null;
          tracking_code: string;
        };
        ComputedFields: never;
        Insert: {
          ai_failure_reason?: string | null;
          category?: string | null;
          channel: string;
          completed_at?: string | null;
          condominium_id: string;
          created_by_profile_id?: string | null;
          decided_priority?: string | null;
          decided_suggested_priority?: string | null;
          decision?: string | null;
          description: string;
          due_at?: string | null;
          final_priority?: string | null;
          id?: string;
          internal_note?: string | null;
          location?: string | null;
          number?: never;
          origin: string;
          priority_change_reason?: string | null;
          priority_decided_at?: string | null;
          registered_at?: string;
          reporter_name?: string | null;
          reporter_phone?: string | null;
          reporter_unit_or_role?: string | null;
          responsible_name?: string | null;
          responsible_phone?: string | null;
          responsible_profile_id?: string | null;
          responsible_role?: string | null;
          status?: string;
          suggested_priority?: string | null;
          suggestion_at?: string | null;
          suggestion_reason?: string | null;
          suggestion_source?: string | null;
          tracking_code?: string;
        };
        Update: {
          ai_failure_reason?: string | null;
          category?: string | null;
          channel?: string;
          completed_at?: string | null;
          condominium_id?: string;
          created_by_profile_id?: string | null;
          decided_priority?: string | null;
          decided_suggested_priority?: string | null;
          decision?: string | null;
          description?: string;
          due_at?: string | null;
          final_priority?: string | null;
          id?: string;
          internal_note?: string | null;
          location?: string | null;
          number?: never;
          origin?: string;
          priority_change_reason?: string | null;
          priority_decided_at?: string | null;
          registered_at?: string;
          reporter_name?: string | null;
          reporter_phone?: string | null;
          reporter_unit_or_role?: string | null;
          responsible_name?: string | null;
          responsible_phone?: string | null;
          responsible_profile_id?: string | null;
          responsible_role?: string | null;
          status?: string;
          suggested_priority?: string | null;
          suggestion_at?: string | null;
          suggestion_reason?: string | null;
          suggestion_source?: string | null;
          tracking_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: "occurrences_condominium_id_fkey";
            columns: ["condominium_id"];
            isOneToOne: false;
            referencedRelation: "condominiums";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "occurrences_created_by_profile_id_fkey";
            columns: ["created_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "occurrences_responsible_profile_id_fkey";
            columns: ["responsible_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          is_morador: boolean;
          is_sindico: boolean;
          phone: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          is_morador?: boolean;
          is_sindico?: boolean;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          is_morador?: boolean;
          is_sindico?: boolean;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      append_occurrence_note: {
        Args: { note: string; target_occurrence: string };
        Returns: number;
      };
      create_condominium: {
        Args: { p_address: string; p_name: string };
        Returns: {
          address: string;
          demo_dataset: string | null;
          id: string;
          manager_id: string;
          name: string;
          slug: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "condominiums";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      decide_occurrence_priority: {
        Args: {
          change_reason?: string;
          decided_priority: string;
          target_occurrence: string;
        };
        Returns: Json;
      };
      email_confirmation_guard: {
        Args: {
          email_address: string;
          lease_id?: string;
          operation: string;
          outcome?: string;
          registration_id?: string;
        };
        Returns: Json;
      };
      has_active_session: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      occurrence_detail: { Args: { target_occurrence: string }; Returns: Json };
      portfolio_occurrence_queue: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      prepare_account_demo: {
        Args: { fixtures: Json; target_manager: string };
        Returns: Json;
      };
      register_account_demo: {
        Args: {
          fixture_key: string;
          registration: Json;
          target_manager: string;
        };
        Returns: {
          number: number;
          occurrence_id: string;
          tracking_code: string;
        }[];
      };
      register_public_occurrence: {
        Args: {
          condominium_slug: string;
          description: string;
          reporter_name: string;
          reporter_phone: string;
          reporter_unit_or_role: string;
        };
        Returns: {
          number: number;
          occurrence_id: string;
          tracking_code: string;
        }[];
      };
      register_public_occurrence_with_suggestion: {
        Args: {
          calculated_priority: string;
          calculated_reason: string;
          calculated_source: string;
          condominium_slug: string;
          description: string;
          location: string;
          reporter_name: string;
          reporter_phone: string;
          reporter_unit_or_role: string;
        };
        Returns: {
          number: number;
          occurrence_id: string;
          tracking_code: string;
        }[];
      };
      resolve_condominium_link: {
        Args: { p_slug: string };
        Returns: {
          address: string;
          name: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
