export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cohorts: {
        Row: {
          cohort_label: string
          created_at: string
          end_date: string | null
          id: string
          program_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          cohort_label: string
          created_at?: string
          end_date?: string | null
          id?: string
          program_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          cohort_label?: string
          created_at?: string
          end_date?: string | null
          id?: string
          program_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          active: boolean
          created_at: string
          field_type: string
          id: string
          key: string
          label: string
          options: Json | null
          required: boolean
          sort_order: number
          visible_to_organization: boolean
          visible_to_student: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          field_type?: string
          id?: string
          key: string
          label: string
          options?: Json | null
          required?: boolean
          sort_order?: number
          visible_to_organization?: boolean
          visible_to_student?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          field_type?: string
          id?: string
          key?: string
          label?: string
          options?: Json | null
          required?: boolean
          sort_order?: number
          visible_to_organization?: boolean
          visible_to_student?: boolean
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          amount_paid: number
          cohort_id: string | null
          created_at: string
          email: string
          enrollment_status: string
          first_payment_date: string | null
          full_name: string
          id: string
          last_payment_date: string | null
          organization_id: string | null
          outstanding_balance: number | null
          payment_evidence_url: string | null
          payment_type: string
          phone: string | null
          program_id: string
          total_amount: number
          updated_at: string
          user_id: string | null
          verification_status: string
        }
        Insert: {
          amount_paid?: number
          cohort_id?: string | null
          created_at?: string
          email: string
          enrollment_status?: string
          first_payment_date?: string | null
          full_name: string
          id?: string
          last_payment_date?: string | null
          organization_id?: string | null
          outstanding_balance?: number | null
          payment_evidence_url?: string | null
          payment_type?: string
          phone?: string | null
          program_id: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
          verification_status?: string
        }
        Update: {
          amount_paid?: number
          cohort_id?: string | null
          created_at?: string
          email?: string
          enrollment_status?: string
          first_payment_date?: string | null
          full_name?: string
          id?: string
          last_payment_date?: string | null
          organization_id?: string | null
          outstanding_balance?: number | null
          payment_evidence_url?: string | null
          payment_type?: string
          phone?: string | null
          program_id?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          payment_reference: string | null
          recorded_by: string | null
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
          recorded_by?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
          recorded_by?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: []
      }
      field_values: {
        Row: {
          enrollment_id: string
          field_id: string
          id: string
          value: string | null
        }
        Insert: {
          enrollment_id: string
          field_id: string
          id?: string
          value?: string | null
        }
        Update: {
          enrollment_id?: string
          field_id?: string
          id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_values_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          invoice_id: string
          paid_at: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          invoice_id: string
          paid_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          invoice_id?: string
          paid_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          currency: string
          enrollment_id: string
          id: string
          invoice_number: string
          payment_plan_type: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          enrollment_id: string
          id?: string
          invoice_number: string
          payment_plan_type?: string
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          enrollment_id?: string
          id?: string
          invoice_number?: string
          payment_plan_type?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          enrollment_id: string | null
          id: string
          message: string
          read: boolean
          sent_at: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          message: string
          read?: boolean
          sent_at?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          message?: string
          read?: boolean
          sent_at?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          organization_name: string
          organization_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          organization_name: string
          organization_type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          organization_name?: string
          organization_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      other_income: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          notes: string | null
          payer_name: string
          payment_date: string
          payment_method: string | null
          payment_reference: string | null
          recorded_by: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          id?: string
          notes?: string | null
          payer_name: string
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
          recorded_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          payer_name?: string
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          installment_id: string | null
          invoice_id: string
          notes: string | null
          payment_method: string | null
          payment_reference: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          installment_id?: string | null
          invoice_id: string
          notes?: string | null
          payment_method?: string | null
          payment_reference: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          installment_id?: string | null
          invoice_id?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          pay_month: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          pay_month: string
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          pay_month?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_admin_invites: {
        Row: {
          accepted_at: string | null
          email: string
          id: string
          invited_at: string
          invited_by: string | null
        }
        Insert: {
          accepted_at?: string | null
          email: string
          id?: string
          invited_at?: string
          invited_by?: string | null
        }
        Update: {
          accepted_at?: string | null
          email?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
        }
        Relationships: []
      }
      pending_payments: {
        Row: {
          amount: number
          created_at: string
          enrollment_id: string
          evidence_url: string
          id: string
          installment_id: string | null
          invoice_id: string
          notes: string | null
          payment_reference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          enrollment_id: string
          evidence_url: string
          id?: string
          installment_id?: string | null
          invoice_id: string
          notes?: string | null
          payment_reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          enrollment_id?: string
          evidence_url?: string
          id?: string
          installment_id?: string | null
          invoice_id?: string
          notes?: string | null
          payment_reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          organization_id: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          program_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          program_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          program_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          account_number: string | null
          active: boolean
          bank_name: string | null
          base_salary: number
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          role_title: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          active?: boolean
          bank_name?: string | null
          base_salary?: number
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          role_title?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          active?: boolean
          bank_name?: string | null
          base_salary?: number
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          role_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_enrollment: {
        Args: { p_enrollment_id: string }
        Returns: undefined
      }
      admin_delete_invoice: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      admin_update_invoice: {
        Args: {
          p_installments: Json
          p_invoice_id: string
          p_total_amount: number
        }
        Returns: undefined
      }
      cancel_admin_invite: { Args: { p_email: string }; Returns: undefined }
      create_admin_invite: { Args: { p_email: string }; Returns: undefined }
      get_enrollment_field_values: {
        Args: { p_enrollment_id: string }
        Returns: {
          field_key: string
          value: string
        }[]
      }
      get_enrollment_for_completion: {
        Args: { p_enrollment_id: string }
        Returns: {
          email: string
          full_name: string
          id: string
          program_name: string
          user_id: string
        }[]
      }
      get_finance_summary: {
        Args: { p_end_date?: string; p_months?: number; p_start_date?: string }
        Returns: {
          expenses_total: number
          month: string
          other_income_total: number
          payroll_total: number
          profit: number
          revenue: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invite_admin: { Args: { p_email: string }; Returns: undefined }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      link_enrollment_to_user: {
        Args: { p_enrollment_id: string }
        Returns: undefined
      }
      list_admins: {
        Args: never
        Returns: {
          email: string
          is_super: boolean
          pending: boolean
          user_id: string
        }[]
      }
      list_audit_logs: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          created_at: string
          details: Json
          entity_id: string
          entity_type: string
          id: string
          user_email: string
          user_id: string
        }[]
      }
      list_outstanding_invoices: {
        Args: { p_only_overdue?: boolean }
        Returns: {
          amount_paid: number
          cohort_label: string
          days_overdue: number
          earliest_overdue_date: string
          email: string
          enrollment_id: string
          full_name: string
          invoice_id: string
          invoice_number: string
          invoice_status: string
          is_overdue: boolean
          next_due_date: string
          outstanding: number
          phone: string
          program_name: string
          total_amount: number
        }[]
      }
      revoke_admin: { Args: { p_email: string }; Returns: undefined }
      submit_enrollment_fields: {
        Args: { p_enrollment_id: string; p_fields: Json }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "student" | "organization"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "student", "organization"],
    },
  },
} as const
