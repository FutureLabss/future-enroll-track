export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      _rls_policy_backup_20260705: {
        Row: {
          backed_up_at: string | null;
          cmd: string | null;
          policyname: unknown;
          qual: string | null;
          roles: unknown[] | null;
          schemaname: unknown;
          tablename: unknown;
          with_check: string | null;
        };
        Insert: {
          backed_up_at?: string | null;
          cmd?: string | null;
          policyname?: unknown;
          qual?: string | null;
          roles?: unknown[] | null;
          schemaname?: unknown;
          tablename?: unknown;
          with_check?: string | null;
        };
        Update: {
          backed_up_at?: string | null;
          cmd?: string | null;
          policyname?: unknown;
          qual?: string | null;
          roles?: unknown[] | null;
          schemaname?: unknown;
          tablename?: unknown;
          with_check?: string | null;
        };
        Relationships: [];
      };
      assignment_resources: {
        Row: {
          assignment_id: string;
          created_at: string;
          file_url: string | null;
          id: string;
          resource_type: string;
          title: string;
        };
        Insert: {
          assignment_id: string;
          created_at?: string;
          file_url?: string | null;
          id?: string;
          resource_type?: string;
          title: string;
        };
        Update: {
          assignment_id?: string;
          created_at?: string;
          file_url?: string | null;
          id?: string;
          resource_type?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assignment_resources_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
        ];
      };
      assignment_submissions: {
        Row: {
          assignment_id: string;
          created_at: string;
          enrollment_id: string | null;
          feedback: string | null;
          file_url: string | null;
          grade: string | null;
          graded_at: string | null;
          graded_by: string | null;
          id: string;
          image_url: string | null;
          link_url: string | null;
          score: number | null;
          status: string;
          student_id: string;
          submission_text: string | null;
          submitted_at: string | null;
        };
        Insert: {
          assignment_id: string;
          created_at?: string;
          enrollment_id?: string | null;
          feedback?: string | null;
          file_url?: string | null;
          grade?: string | null;
          graded_at?: string | null;
          graded_by?: string | null;
          id?: string;
          image_url?: string | null;
          link_url?: string | null;
          score?: number | null;
          status?: string;
          student_id: string;
          submission_text?: string | null;
          submitted_at?: string | null;
        };
        Update: {
          assignment_id?: string;
          created_at?: string;
          enrollment_id?: string | null;
          feedback?: string | null;
          file_url?: string | null;
          grade?: string | null;
          graded_at?: string | null;
          graded_by?: string | null;
          id?: string;
          image_url?: string | null;
          link_url?: string | null;
          score?: number | null;
          status?: string;
          student_id?: string;
          submission_text?: string | null;
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignment_submissions_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignment_submissions_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments_needing_duplicate_review";
            referencedColumns: ["enrollment_id"];
          },
        ];
      };
      assignments: {
        Row: {
          classroom_id: string;
          cohort_id: string | null;
          created_at: string;
          created_by: string | null;
          curriculum_lesson_id: string | null;
          due_date: string | null;
          id: string;
          instructions: string | null;
          lesson_id: string | null;
          max_score: number | null;
          pass_score: number | null;
          status: string;
          title: string;
          unit_id: string | null;
          updated_at: string;
        };
        Insert: {
          classroom_id: string;
          cohort_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          curriculum_lesson_id?: string | null;
          due_date?: string | null;
          id?: string;
          instructions?: string | null;
          lesson_id?: string | null;
          max_score?: number | null;
          pass_score?: number | null;
          status?: string;
          title: string;
          unit_id?: string | null;
          updated_at?: string;
        };
        Update: {
          classroom_id?: string;
          cohort_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          curriculum_lesson_id?: string | null;
          due_date?: string | null;
          id?: string;
          instructions?: string | null;
          lesson_id?: string | null;
          max_score?: number | null;
          pass_score?: number | null;
          status?: string;
          title?: string;
          unit_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_curriculum_lesson_id_fkey";
            columns: ["curriculum_lesson_id"];
            isOneToOne: false;
            referencedRelation: "curriculum_lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "old_lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_records: {
        Row: {
          attendance_status: string;
          classroom_id: string;
          cohort_id: string | null;
          distance_metres: number | null;
          enrollment_id: string | null;
          geofence_passed: boolean | null;
          id: string;
          lesson_id: string | null;
          marked_at: string;
          method: string;
          schedule_id: string | null;
          session_id: string;
          student_id: string;
          student_lat: number | null;
          student_lng: number | null;
        };
        Insert: {
          attendance_status?: string;
          classroom_id: string;
          cohort_id?: string | null;
          distance_metres?: number | null;
          enrollment_id?: string | null;
          geofence_passed?: boolean | null;
          id?: string;
          lesson_id?: string | null;
          marked_at?: string;
          method?: string;
          schedule_id?: string | null;
          session_id: string;
          student_id: string;
          student_lat?: number | null;
          student_lng?: number | null;
        };
        Update: {
          attendance_status?: string;
          classroom_id?: string;
          cohort_id?: string | null;
          distance_metres?: number | null;
          enrollment_id?: string | null;
          geofence_passed?: boolean | null;
          id?: string;
          lesson_id?: string | null;
          marked_at?: string;
          method?: string;
          schedule_id?: string | null;
          session_id?: string;
          student_id?: string;
          student_lat?: number | null;
          student_lng?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_records_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments_needing_duplicate_review";
            referencedColumns: ["enrollment_id"];
          },
          {
            foreignKeyName: "attendance_records_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "old_lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "schedules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "attendance_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_sessions: {
        Row: {
          classroom_id: string;
          closed_at: string | null;
          code: string;
          code_expires_at: string;
          cohort_id: string | null;
          created_at: string;
          duration_mins: number;
          generated_by: string | null;
          id: string;
          late_after_mins: number;
          lesson_id: string | null;
          schedule_id: string | null;
          status: string;
        };
        Insert: {
          classroom_id: string;
          closed_at?: string | null;
          code: string;
          code_expires_at: string;
          cohort_id?: string | null;
          created_at?: string;
          duration_mins?: number;
          generated_by?: string | null;
          id?: string;
          late_after_mins?: number;
          lesson_id?: string | null;
          schedule_id?: string | null;
          status?: string;
        };
        Update: {
          classroom_id?: string;
          closed_at?: string | null;
          code?: string;
          code_expires_at?: string;
          cohort_id?: string | null;
          created_at?: string;
          duration_mins?: number;
          generated_by?: string | null;
          id?: string;
          late_after_mins?: number;
          lesson_id?: string | null;
          schedule_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "old_lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          created_at: string;
          details: Json | null;
          entity_id: string | null;
          entity_type: string;
          id: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json | null;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      bank_transactions: {
        Row: {
          account_number: string;
          amount: number;
          balance_after: number | null;
          hub_id: string;
          id: string;
          imported_at: string;
          kind: string;
          narration: string | null;
          occurred_at: string;
          payer: string | null;
          statement_source: string | null;
          transaction_ref: string;
        };
        Insert: {
          account_number: string;
          amount: number;
          balance_after?: number | null;
          hub_id: string;
          id?: string;
          imported_at?: string;
          kind?: string;
          narration?: string | null;
          occurred_at: string;
          payer?: string | null;
          statement_source?: string | null;
          transaction_ref: string;
        };
        Update: {
          account_number?: string;
          amount?: number;
          balance_after?: number | null;
          hub_id?: string;
          id?: string;
          imported_at?: string;
          kind?: string;
          narration?: string | null;
          occurred_at?: string;
          payer?: string | null;
          statement_source?: string | null;
          transaction_ref?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_transactions_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      classroom_permissions: {
        Row: {
          can_create_assignments: boolean;
          can_create_lessons: boolean;
          can_edit_cohorts: boolean;
          can_schedule: boolean;
          can_start_attendance: boolean;
          can_view_students: boolean;
          classroom_staff_id: string;
          id: string;
        };
        Insert: {
          can_create_assignments?: boolean;
          can_create_lessons?: boolean;
          can_edit_cohorts?: boolean;
          can_schedule?: boolean;
          can_start_attendance?: boolean;
          can_view_students?: boolean;
          classroom_staff_id: string;
          id?: string;
        };
        Update: {
          can_create_assignments?: boolean;
          can_create_lessons?: boolean;
          can_edit_cohorts?: boolean;
          can_schedule?: boolean;
          can_start_attendance?: boolean;
          can_view_students?: boolean;
          classroom_staff_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classroom_permissions_classroom_staff_id_fkey";
            columns: ["classroom_staff_id"];
            isOneToOne: true;
            referencedRelation: "classroom_staff";
            referencedColumns: ["id"];
          },
        ];
      };
      classroom_staff: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          classroom_id: string;
          id: string;
          staff_id: string;
          staff_type: string;
          status: string;
          user_id: string | null;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          classroom_id: string;
          id?: string;
          staff_id: string;
          staff_type?: string;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          classroom_id?: string;
          id?: string;
          staff_id?: string;
          staff_type?: string;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "classroom_staff_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classroom_staff_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      classroom_students: {
        Row: {
          classroom_id: string;
          enrollment_id: string | null;
          id: string;
          joined_at: string;
          student_id: string;
        };
        Insert: {
          classroom_id: string;
          enrollment_id?: string | null;
          id?: string;
          joined_at?: string;
          student_id: string;
        };
        Update: {
          classroom_id?: string;
          enrollment_id?: string | null;
          id?: string;
          joined_at?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classroom_students_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classroom_students_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classroom_students_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments_needing_duplicate_review";
            referencedColumns: ["enrollment_id"];
          },
        ];
      };
      classrooms: {
        Row: {
          attendance_radius_metres: number;
          created_at: string;
          created_by: string | null;
          description: string | null;
          geofencing_enabled: boolean;
          gps_lat: number | null;
          gps_lng: number | null;
          hub_id: string | null;
          id: string;
          location: string | null;
          name: string;
          program_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attendance_radius_metres?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          geofencing_enabled?: boolean;
          gps_lat?: number | null;
          gps_lng?: number | null;
          hub_id?: string | null;
          id?: string;
          location?: string | null;
          name: string;
          program_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attendance_radius_metres?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          geofencing_enabled?: boolean;
          gps_lat?: number | null;
          gps_lng?: number | null;
          hub_id?: string | null;
          id?: string;
          location?: string | null;
          name?: string;
          program_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classrooms_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classrooms_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      cohort_announcements: {
        Row: {
          author_id: string | null;
          body: string;
          cohort_id: string;
          created_at: string;
          id: string;
          pinned: boolean;
          title: string;
          updated_at: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          cohort_id: string;
          created_at?: string;
          id?: string;
          pinned?: boolean;
          title: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          cohort_id?: string;
          created_at?: string;
          id?: string;
          pinned?: boolean;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cohort_announcements_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
        ];
      };
      cohort_messages: {
        Row: {
          body: string;
          cohort_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          body: string;
          cohort_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          cohort_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cohort_messages_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
        ];
      };
      cohort_schedules: {
        Row: {
          cohort_id: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          end_time: string;
          id: string;
          location: string | null;
          meeting_link: string | null;
          scheduled_date: string;
          start_time: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          cohort_id: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          end_time: string;
          id?: string;
          location?: string | null;
          meeting_link?: string | null;
          scheduled_date: string;
          start_time: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          cohort_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          end_time?: string;
          id?: string;
          location?: string | null;
          meeting_link?: string | null;
          scheduled_date?: string;
          start_time?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cohort_schedules_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
        ];
      };
      cohort_students: {
        Row: {
          auto_graduation_status: string;
          cohort_id: string;
          enrollment_id: string | null;
          final_graduation_status: string | null;
          graduation_override: string | null;
          graduation_override_at: string | null;
          graduation_override_by: string | null;
          graduation_override_reason: string | null;
          id: string;
          joined_at: string;
          status: string;
          student_id: string;
        };
        Insert: {
          auto_graduation_status?: string;
          cohort_id: string;
          enrollment_id?: string | null;
          final_graduation_status?: never;
          graduation_override?: string | null;
          graduation_override_at?: string | null;
          graduation_override_by?: string | null;
          graduation_override_reason?: string | null;
          id?: string;
          joined_at?: string;
          status?: string;
          student_id: string;
        };
        Update: {
          auto_graduation_status?: string;
          cohort_id?: string;
          enrollment_id?: string | null;
          final_graduation_status?: never;
          graduation_override?: string | null;
          graduation_override_at?: string | null;
          graduation_override_by?: string | null;
          graduation_override_reason?: string | null;
          id?: string;
          joined_at?: string;
          status?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cohort_students_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cohort_students_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cohort_students_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments_needing_duplicate_review";
            referencedColumns: ["enrollment_id"];
          },
        ];
      };
      cohorts: {
        Row: {
          capacity: number | null;
          classroom_id: string | null;
          cohort_label: string;
          created_at: string;
          end_date: string | null;
          hub_id: string;
          id: string;
          program_id: string;
          scope_id: string | null;
          scope_type: string | null;
          start_date: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          capacity?: number | null;
          classroom_id?: string | null;
          cohort_label: string;
          created_at?: string;
          end_date?: string | null;
          hub_id: string;
          id?: string;
          program_id: string;
          scope_id?: string | null;
          scope_type?: string | null;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          capacity?: number | null;
          classroom_id?: string | null;
          cohort_label?: string;
          created_at?: string;
          end_date?: string | null;
          hub_id?: string;
          id?: string;
          program_id?: string;
          scope_id?: string | null;
          scope_type?: string | null;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cohorts_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cohorts_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cohorts_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_leads: {
        Row: {
          consent_source: string | null;
          consented_at: string | null;
          converted_at: string | null;
          created_at: string;
          email: string | null;
          enrollment_id: string | null;
          full_name: string;
          hub_id: string;
          id: string;
          lifecycle_status: string;
          marketing_consent: boolean;
          next_follow_up_at: string | null;
          normalized_email: string | null;
          owner_id: string | null;
          phone: string | null;
          program_interest_id: string | null;
          qualification: string;
          qualification_override: string | null;
          qualification_override_reason: string | null;
          referral_detail: string | null;
          score: number;
          source_detail: string | null;
          source_id: string | null;
          suppressed_at: string | null;
          suppression_reason: string | null;
          updated_at: string;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_medium: string | null;
          utm_source: string | null;
        };
        Insert: {
          consent_source?: string | null;
          consented_at?: string | null;
          converted_at?: string | null;
          created_at?: string;
          email?: string | null;
          enrollment_id?: string | null;
          full_name: string;
          hub_id: string;
          id?: string;
          lifecycle_status?: string;
          marketing_consent?: boolean;
          next_follow_up_at?: string | null;
          normalized_email?: never;
          owner_id?: string | null;
          phone?: string | null;
          program_interest_id?: string | null;
          qualification?: string;
          qualification_override?: string | null;
          qualification_override_reason?: string | null;
          referral_detail?: string | null;
          score?: number;
          source_detail?: string | null;
          source_id?: string | null;
          suppressed_at?: string | null;
          suppression_reason?: string | null;
          updated_at?: string;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Update: {
          consent_source?: string | null;
          consented_at?: string | null;
          converted_at?: string | null;
          created_at?: string;
          email?: string | null;
          enrollment_id?: string | null;
          full_name?: string;
          hub_id?: string;
          id?: string;
          lifecycle_status?: string;
          marketing_consent?: boolean;
          next_follow_up_at?: string | null;
          normalized_email?: never;
          owner_id?: string | null;
          phone?: string | null;
          program_interest_id?: string | null;
          qualification?: string;
          qualification_override?: string | null;
          qualification_override_reason?: string | null;
          referral_detail?: string | null;
          score?: number;
          source_detail?: string | null;
          source_id?: string | null;
          suppressed_at?: string | null;
          suppression_reason?: string | null;
          updated_at?: string;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crm_leads_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_leads_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments_needing_duplicate_review";
            referencedColumns: ["enrollment_id"];
          },
          {
            foreignKeyName: "crm_leads_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_leads_program_interest_id_fkey";
            columns: ["program_interest_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_leads_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "lead_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      curricula: {
        Row: {
          classroom_id: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          classroom_id: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          classroom_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "curricula_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      curriculum_lessons: {
        Row: {
          created_at: string;
          curriculum_week_id: string;
          id: string;
          lesson_order: number;
          objectives: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          curriculum_week_id: string;
          id?: string;
          lesson_order?: number;
          objectives?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          curriculum_week_id?: string;
          id?: string;
          lesson_order?: number;
          objectives?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "curriculum_lessons_curriculum_week_id_fkey";
            columns: ["curriculum_week_id"];
            isOneToOne: false;
            referencedRelation: "curriculum_weeks";
            referencedColumns: ["id"];
          },
        ];
      };
      curriculum_weeks: {
        Row: {
          created_at: string;
          curriculum_id: string;
          id: string;
          objectives: string | null;
          start_date: string | null;
          title: string;
          week_number: number;
        };
        Insert: {
          created_at?: string;
          curriculum_id: string;
          id?: string;
          objectives?: string | null;
          start_date?: string | null;
          title: string;
          week_number: number;
        };
        Update: {
          created_at?: string;
          curriculum_id?: string;
          id?: string;
          objectives?: string | null;
          start_date?: string | null;
          title?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "curriculum_weeks_curriculum_id_fkey";
            columns: ["curriculum_id"];
            isOneToOne: false;
            referencedRelation: "curriculums";
            referencedColumns: ["id"];
          },
        ];
      };
      curriculums: {
        Row: {
          classroom_id: string | null;
          cohort_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          classroom_id?: string | null;
          cohort_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          classroom_id?: string | null;
          cohort_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "curriculums_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curriculums_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_fields: {
        Row: {
          active: boolean;
          created_at: string;
          field_type: string;
          hub_id: string | null;
          id: string;
          key: string;
          label: string;
          options: Json | null;
          required: boolean;
          sort_order: number;
          visible_to_organization: boolean;
          visible_to_student: boolean;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          field_type?: string;
          hub_id?: string | null;
          id?: string;
          key: string;
          label: string;
          options?: Json | null;
          required?: boolean;
          sort_order?: number;
          visible_to_organization?: boolean;
          visible_to_student?: boolean;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          field_type?: string;
          hub_id?: string | null;
          id?: string;
          key?: string;
          label?: string;
          options?: Json | null;
          required?: boolean;
          sort_order?: number;
          visible_to_organization?: boolean;
          visible_to_student?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "custom_fields_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollment_targets: {
        Row: {
          created_at: string;
          created_by: string | null;
          hub_id: string;
          id: string;
          notes: string | null;
          target_count: number;
          target_month: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          hub_id: string;
          id?: string;
          notes?: string | null;
          target_count?: number;
          target_month: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          hub_id?: string;
          id?: string;
          notes?: string | null;
          target_count?: number;
          target_month?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollment_targets_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollments: {
        Row: {
          address: string | null;
          amount_paid: number;
          cohort_id: string | null;
          created_at: string;
          email: string;
          enrollment_status: string;
          first_payment_date: string | null;
          full_name: string;
          guardian_name: string | null;
          guardian_phone: string | null;
          id: string;
          last_payment_date: string | null;
          organization_id: string | null;
          outstanding_balance: number | null;
          payment_evidence_url: string | null;
          payment_status: string | null;
          payment_type: string;
          phone: string | null;
          phone_normalized: string | null;
          profile_requirements_version: number;
          program_id: string;
          total_amount: number;
          updated_at: string;
          user_id: string | null;
          verification_status: string;
        };
        Insert: {
          address?: string | null;
          amount_paid?: number;
          cohort_id?: string | null;
          created_at?: string;
          email: string;
          enrollment_status?: string;
          first_payment_date?: string | null;
          full_name: string;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          id?: string;
          last_payment_date?: string | null;
          organization_id?: string | null;
          outstanding_balance?: never;
          payment_evidence_url?: string | null;
          payment_status?: never;
          payment_type?: string;
          phone?: string | null;
          phone_normalized?: never;
          profile_requirements_version?: number;
          program_id: string;
          total_amount?: number;
          updated_at?: string;
          user_id?: string | null;
          verification_status?: string;
        };
        Update: {
          address?: string | null;
          amount_paid?: number;
          cohort_id?: string | null;
          created_at?: string;
          email?: string;
          enrollment_status?: string;
          first_payment_date?: string | null;
          full_name?: string;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          id?: string;
          last_payment_date?: string | null;
          organization_id?: string | null;
          outstanding_balance?: never;
          payment_evidence_url?: string | null;
          payment_status?: never;
          payment_type?: string;
          phone?: string | null;
          phone_normalized?: never;
          profile_requirements_version?: number;
          program_id?: string;
          total_amount?: number;
          updated_at?: string;
          user_id?: string | null;
          verification_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          category: string;
          created_at: string;
          hub_id: string | null;
          id: string;
          notes: string | null;
          payment_date: string;
          payment_method: string | null;
          payment_reference: string | null;
          recorded_by: string | null;
          updated_at: string;
          vendor_name: string | null;
        };
        Insert: {
          amount?: number;
          category: string;
          created_at?: string;
          hub_id?: string | null;
          id?: string;
          notes?: string | null;
          payment_date?: string;
          payment_method?: string | null;
          payment_reference?: string | null;
          recorded_by?: string | null;
          updated_at?: string;
          vendor_name?: string | null;
        };
        Update: {
          amount?: number;
          category?: string;
          created_at?: string;
          hub_id?: string | null;
          id?: string;
          notes?: string | null;
          payment_date?: string;
          payment_method?: string | null;
          payment_reference?: string | null;
          recorded_by?: string | null;
          updated_at?: string;
          vendor_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      field_values: {
        Row: {
          enrollment_id: string;
          field_id: string;
          id: string;
          value: string | null;
        };
        Insert: {
          enrollment_id: string;
          field_id: string;
          id?: string;
          value?: string | null;
        };
        Update: {
          enrollment_id?: string;
          field_id?: string;
          id?: string;
          value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "field_values_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_values_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments_needing_duplicate_review";
            referencedColumns: ["enrollment_id"];
          },
          {
            foreignKeyName: "field_values_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "custom_fields";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          hub_id: string;
          hub_role: string;
          id: string;
          is_demo: boolean;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          hub_id: string;
          hub_role?: string;
          id?: string;
          is_demo?: boolean;
          token: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          hub_id?: string;
          hub_role?: string;
          id?: string;
          is_demo?: boolean;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hub_invitations_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      hub_members: {
        Row: {
          created_at: string;
          demo_expires_at: string | null;
          hub_id: string;
          hub_role: string;
          id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          demo_expires_at?: string | null;
          hub_id: string;
          hub_role?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          demo_expires_at?: string | null;
          hub_id?: string;
          hub_role?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hub_members_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      hubs: {
        Row: {
          contact_email: string | null;
          created_at: string;
          id: string;
          logo_url: string | null;
          name: string;
          plan: string;
          slug: string;
          status: string;
        };
        Insert: {
          contact_email?: string | null;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          name: string;
          plan?: string;
          slug: string;
          status?: string;
        };
        Update: {
          contact_email?: string | null;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          name?: string;
          plan?: string;
          slug?: string;
          status?: string;
        };
        Relationships: [];
      };
      installments: {
        Row: {
          amount: number;
          bank_transaction_id: string | null;
          created_at: string;
          due_date: string;
          id: string;
          invoice_id: string;
          paid_at: string | null;
          paid_at_actual: string | null;
          paid_at_source: string;
          paid_by: string | null;
          status: string;
        };
        Insert: {
          amount: number;
          bank_transaction_id?: string | null;
          created_at?: string;
          due_date: string;
          id?: string;
          invoice_id: string;
          paid_at?: string | null;
          paid_at_actual?: string | null;
          paid_at_source?: string;
          paid_by?: string | null;
          status?: string;
        };
        Update: {
          amount?: number;
          bank_transaction_id?: string | null;
          created_at?: string;
          due_date?: string;
          id?: string;
          invoice_id?: string;
          paid_at?: string | null;
          paid_at_actual?: string | null;
          paid_at_source?: string;
          paid_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "installments_bank_transaction_id_fkey";
            columns: ["bank_transaction_id"];
            isOneToOne: false;
            referencedRelation: "bank_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "installments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_change_requests: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          invoice_id: string;
          payload: Json | null;
          reason: string | null;
          requested_by: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          invoice_id: string;
          payload?: Json | null;
          reason?: string | null;
          requested_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          invoice_id?: string;
          payload?: Json | null;
          reason?: string | null;
          requested_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_change_requests_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          created_at: string;
          currency: string;
          enrollment_id: string;
          id: string;
          invoice_number: string;
          payment_plan_type: string;
          status: string;
          total_amount: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          enrollment_id: string;
          id?: string;
          invoice_number: string;
          payment_plan_type?: string;
          status?: string;
          total_amount: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          enrollment_id?: string;
          id?: string;
          invoice_number?: string;
          payment_plan_type?: string;
          status?: string;
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments_needing_duplicate_review";
            referencedColumns: ["enrollment_id"];
          },
        ];
      };
      lead_activities: {
        Row: {
          activity_type: string;
          created_at: string;
          created_by: string | null;
          details: NonNullable<Json>;
          hub_id: string;
          id: string;
          lead_id: string;
          occurred_at: string;
          title: string;
        };
        Insert: {
          activity_type: string;
          created_at?: string;
          created_by?: string | null;
          details?: NonNullable<Json>;
          hub_id: string;
          id?: string;
          lead_id: string;
          occurred_at?: string;
          title: string;
        };
        Update: {
          activity_type?: string;
          created_at?: string;
          created_by?: string | null;
          details?: NonNullable<Json>;
          hub_id?: string;
          id?: string;
          lead_id?: string;
          occurred_at?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_activities_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_follow_ups: {
        Row: {
          completed_at: string | null;
          created_at: string;
          due_at: string;
          hub_id: string;
          id: string;
          lead_id: string;
          notes: string | null;
          owner_id: string;
          reminder_sent_at: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          due_at: string;
          hub_id: string;
          id?: string;
          lead_id: string;
          notes?: string | null;
          owner_id: string;
          reminder_sent_at?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          due_at?: string;
          hub_id?: string;
          id?: string;
          lead_id?: string;
          notes?: string | null;
          owner_id?: string;
          reminder_sent_at?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_follow_ups_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_follow_ups_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_score_events: {
        Row: {
          created_at: string;
          event_type: string;
          external_key: string | null;
          hub_id: string;
          id: string;
          lead_id: string;
          points: number;
          rule_id: string | null;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          external_key?: string | null;
          hub_id: string;
          id?: string;
          lead_id: string;
          points: number;
          rule_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          external_key?: string | null;
          hub_id?: string;
          id?: string;
          lead_id?: string;
          points?: number;
          rule_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lead_score_events_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_score_events_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_score_events_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "lead_scoring_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_scoring_rules: {
        Row: {
          active: boolean;
          created_at: string;
          event_type: string;
          hub_id: string;
          id: string;
          label: string;
          max_occurrences: number | null;
          points: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          event_type: string;
          hub_id: string;
          id?: string;
          label: string;
          max_occurrences?: number | null;
          points: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          event_type?: string;
          hub_id?: string;
          id?: string;
          label?: string;
          max_occurrences?: number | null;
          points?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_scoring_rules_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_scoring_settings: {
        Row: {
          hot_threshold: number;
          hub_id: string;
          id: string;
          updated_at: string;
          warm_threshold: number;
        };
        Insert: {
          hot_threshold?: number;
          hub_id: string;
          id?: string;
          updated_at?: string;
          warm_threshold?: number;
        };
        Update: {
          hot_threshold?: number;
          hub_id?: string;
          id?: string;
          updated_at?: string;
          warm_threshold?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lead_scoring_settings_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: true;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_sources: {
        Row: {
          active: boolean;
          created_at: string;
          hub_id: string;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          hub_id: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          hub_id?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_sources_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_tag_assignments: {
        Row: {
          created_at: string;
          hub_id: string;
          id: string;
          lead_id: string;
          tag_id: string;
        };
        Insert: {
          created_at?: string;
          hub_id: string;
          id?: string;
          lead_id: string;
          tag_id: string;
        };
        Update: {
          created_at?: string;
          hub_id?: string;
          id?: string;
          lead_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_tag_assignments_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_tag_assignments_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_tag_assignments_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "lead_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_tags: {
        Row: {
          color: string;
          created_at: string;
          hub_id: string;
          id: string;
          name: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          hub_id: string;
          id?: string;
          name: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          hub_id?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_tags_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_materials: {
        Row: {
          created_at: string;
          curriculum_lesson_id: string | null;
          file_url: string | null;
          id: string;
          lesson_id: string | null;
          material_type: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          curriculum_lesson_id?: string | null;
          file_url?: string | null;
          id?: string;
          lesson_id?: string | null;
          material_type?: string;
          title: string;
        };
        Update: {
          created_at?: string;
          curriculum_lesson_id?: string | null;
          file_url?: string | null;
          id?: string;
          lesson_id?: string | null;
          material_type?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_materials_curriculum_lesson_id_fkey";
            columns: ["curriculum_lesson_id"];
            isOneToOne: false;
            referencedRelation: "curriculum_lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_materials_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "old_lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      lessons: {
        Row: {
          content: string | null;
          created_at: string;
          created_by: string | null;
          external_link: string | null;
          id: string;
          objectives: string | null;
          order_index: number;
          resources: Json | null;
          title: string;
          unit_id: string;
          updated_at: string;
          video_url: string | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          created_by?: string | null;
          external_link?: string | null;
          id?: string;
          objectives?: string | null;
          order_index?: number;
          resources?: Json | null;
          title: string;
          unit_id: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          created_by?: string | null;
          external_link?: string | null;
          id?: string;
          objectives?: string | null;
          order_index?: number;
          resources?: Json | null;
          title?: string;
          unit_id?: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_campaign_enrollments: {
        Row: {
          campaign_id: string;
          created_at: string;
          hub_id: string;
          id: string;
          lead_id: string;
          next_send_at: string;
          next_step_order: number;
          status: string;
          stop_reason: string | null;
          updated_at: string;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          hub_id: string;
          id?: string;
          lead_id: string;
          next_send_at?: string;
          next_step_order?: number;
          status?: string;
          stop_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          hub_id?: string;
          id?: string;
          lead_id?: string;
          next_send_at?: string;
          next_step_order?: number;
          status?: string;
          stop_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_enrollments_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "marketing_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_campaign_enrollments_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_campaign_enrollments_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_campaign_steps: {
        Row: {
          campaign_id: string;
          created_at: string;
          delay_hours: number;
          hub_id: string;
          id: string;
          step_order: number;
          template_id: string;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          delay_hours?: number;
          hub_id: string;
          id?: string;
          step_order: number;
          template_id: string;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          delay_hours?: number;
          hub_id?: string;
          id?: string;
          step_order?: number;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_steps_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "marketing_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_campaign_steps_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_campaign_steps_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "marketing_email_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_campaigns: {
        Row: {
          created_at: string;
          entry_rules: NonNullable<Json>;
          hub_id: string;
          id: string;
          name: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          entry_rules?: NonNullable<Json>;
          hub_id: string;
          id?: string;
          name: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          entry_rules?: NonNullable<Json>;
          hub_id?: string;
          id?: string;
          name?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_consent_history: {
        Row: {
          consented: boolean;
          created_at: string;
          hub_id: string;
          id: string;
          ip_hash: string | null;
          lead_id: string;
          source: string;
        };
        Insert: {
          consented: boolean;
          created_at?: string;
          hub_id: string;
          id?: string;
          ip_hash?: string | null;
          lead_id: string;
          source: string;
        };
        Update: {
          consented?: boolean;
          created_at?: string;
          hub_id?: string;
          id?: string;
          ip_hash?: string | null;
          lead_id?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_consent_history_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_consent_history_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_email_deliveries: {
        Row: {
          bounced_at: string | null;
          campaign_enrollment_id: string;
          campaign_step_id: string;
          clicked_at: string | null;
          created_at: string;
          delivered_at: string | null;
          error_message: string | null;
          hub_id: string;
          id: string;
          lead_id: string;
          opened_at: string | null;
          provider_message_id: string | null;
          recipient_email: string | null;
          rendered_html: string | null;
          rendered_subject: string | null;
          sent_at: string | null;
          status: string;
        };
        Insert: {
          bounced_at?: string | null;
          campaign_enrollment_id: string;
          campaign_step_id: string;
          clicked_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          error_message?: string | null;
          hub_id: string;
          id?: string;
          lead_id: string;
          opened_at?: string | null;
          provider_message_id?: string | null;
          recipient_email?: string | null;
          rendered_html?: string | null;
          rendered_subject?: string | null;
          sent_at?: string | null;
          status?: string;
        };
        Update: {
          bounced_at?: string | null;
          campaign_enrollment_id?: string;
          campaign_step_id?: string;
          clicked_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          error_message?: string | null;
          hub_id?: string;
          id?: string;
          lead_id?: string;
          opened_at?: string | null;
          provider_message_id?: string | null;
          recipient_email?: string | null;
          rendered_html?: string | null;
          rendered_subject?: string | null;
          sent_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_email_deliveries_campaign_enrollment_id_fkey";
            columns: ["campaign_enrollment_id"];
            isOneToOne: false;
            referencedRelation: "marketing_campaign_enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_email_deliveries_campaign_step_id_fkey";
            columns: ["campaign_step_id"];
            isOneToOne: false;
            referencedRelation: "marketing_campaign_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_email_deliveries_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_email_deliveries_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_email_templates: {
        Row: {
          active: boolean;
          created_at: string;
          html_body: string;
          hub_id: string;
          id: string;
          name: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          html_body: string;
          hub_id: string;
          id?: string;
          name: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          html_body?: string;
          hub_id?: string;
          id?: string;
          name?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_email_templates_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      modules: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          order_index: number;
          title: string;
          track_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          order_index?: number;
          title: string;
          track_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          order_index?: number;
          title?: string;
          track_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "modules_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          channel: string;
          created_at: string;
          enrollment_id: string | null;
          hub_id: string | null;
          id: string;
          message: string;
          read: boolean;
          sent_at: string | null;
          title: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          channel?: string;
          created_at?: string;
          enrollment_id?: string | null;
          hub_id?: string | null;
          id?: string;
          message: string;
          read?: boolean;
          sent_at?: string | null;
          title: string;
          type: string;
          user_id?: string | null;
        };
        Update: {
          channel?: string;
          created_at?: string;
          enrollment_id?: string | null;
          hub_id?: string | null;
          id?: string;
          message?: string;
          read?: boolean;
          sent_at?: string | null;
          title?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments_needing_duplicate_review";
            referencedColumns: ["enrollment_id"];
          },
          {
            foreignKeyName: "notifications_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      old_lessons: {
        Row: {
          attendance_session_status: string;
          classroom_id: string;
          cohort_id: string | null;
          created_at: string;
          created_by: string | null;
          curriculum_lesson_id: string | null;
          description: string | null;
          end_time: string;
          id: string;
          lesson_date: string;
          location: string | null;
          start_time: string;
          status: string;
          title: string;
          tutor_id: string | null;
          updated_at: string;
          week_number: number | null;
        };
        Insert: {
          attendance_session_status?: string;
          classroom_id: string;
          cohort_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          curriculum_lesson_id?: string | null;
          description?: string | null;
          end_time: string;
          id?: string;
          lesson_date: string;
          location?: string | null;
          start_time: string;
          status?: string;
          title: string;
          tutor_id?: string | null;
          updated_at?: string;
          week_number?: number | null;
        };
        Update: {
          attendance_session_status?: string;
          classroom_id?: string;
          cohort_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          curriculum_lesson_id?: string | null;
          description?: string | null;
          end_time?: string;
          id?: string;
          lesson_date?: string;
          location?: string | null;
          start_time?: string;
          status?: string;
          title?: string;
          tutor_id?: string | null;
          updated_at?: string;
          week_number?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_curriculum_lesson_id_fkey";
            columns: ["curriculum_lesson_id"];
            isOneToOne: false;
            referencedRelation: "curriculum_lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_tutor_id_fkey";
            columns: ["tutor_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          active: boolean;
          contact_email: string | null;
          contact_name: string | null;
          created_at: string;
          hub_id: string | null;
          id: string;
          organization_name: string;
          organization_type: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          contact_email?: string | null;
          contact_name?: string | null;
          created_at?: string;
          hub_id?: string | null;
          id?: string;
          organization_name: string;
          organization_type?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          contact_email?: string | null;
          contact_name?: string | null;
          created_at?: string;
          hub_id?: string | null;
          id?: string;
          organization_name?: string;
          organization_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      other_income: {
        Row: {
          amount: number;
          category: string;
          created_at: string;
          hub_id: string | null;
          id: string;
          notes: string | null;
          payer_name: string;
          payment_date: string;
          payment_method: string | null;
          payment_reference: string | null;
          recorded_by: string | null;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          category: string;
          created_at?: string;
          hub_id?: string | null;
          id?: string;
          notes?: string | null;
          payer_name: string;
          payment_date?: string;
          payment_method?: string | null;
          payment_reference?: string | null;
          recorded_by?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          category?: string;
          created_at?: string;
          hub_id?: string | null;
          id?: string;
          notes?: string | null;
          payer_name?: string;
          payment_date?: string;
          payment_method?: string | null;
          payment_reference?: string | null;
          recorded_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "other_income_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          bank_transaction_id: string | null;
          created_at: string;
          id: string;
          installment_id: string | null;
          invoice_id: string;
          notes: string | null;
          paid_at_actual: string | null;
          paid_at_source: string;
          paid_by: string | null;
          payment_date: string;
          payment_method: string | null;
          payment_reference: string;
        };
        Insert: {
          amount: number;
          bank_transaction_id?: string | null;
          created_at?: string;
          id?: string;
          installment_id?: string | null;
          invoice_id: string;
          notes?: string | null;
          paid_at_actual?: string | null;
          paid_at_source?: string;
          paid_by?: string | null;
          payment_date?: string;
          payment_method?: string | null;
          payment_reference: string;
        };
        Update: {
          amount?: number;
          bank_transaction_id?: string | null;
          created_at?: string;
          id?: string;
          installment_id?: string | null;
          invoice_id?: string;
          notes?: string | null;
          paid_at_actual?: string | null;
          paid_at_source?: string;
          paid_by?: string | null;
          payment_date?: string;
          payment_method?: string | null;
          payment_reference?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_bank_transaction_id_fkey";
            columns: ["bank_transaction_id"];
            isOneToOne: false;
            referencedRelation: "bank_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_installment_id_fkey";
            columns: ["installment_id"];
            isOneToOne: false;
            referencedRelation: "installments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_runs: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          notes: string | null;
          paid_at: string | null;
          pay_month: string;
          staff_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          created_at?: string;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          pay_month: string;
          staff_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          pay_month?: string;
          staff_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_runs_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      pending_admin_invites: {
        Row: {
          accepted_at: string | null;
          email: string;
          id: string;
          invited_at: string;
          invited_by: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          email: string;
          id?: string;
          invited_at?: string;
          invited_by?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          email?: string;
          id?: string;
          invited_at?: string;
          invited_by?: string | null;
        };
        Relationships: [];
      };
      pending_payments: {
        Row: {
          amount: number;
          created_at: string;
          enrollment_id: string;
          evidence_url: string;
          id: string;
          installment_id: string | null;
          invoice_id: string;
          notes: string | null;
          payment_reference: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          submitted_by: string | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          enrollment_id: string;
          evidence_url: string;
          id?: string;
          installment_id?: string | null;
          invoice_id: string;
          notes?: string | null;
          payment_reference?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_by?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          enrollment_id?: string;
          evidence_url?: string;
          id?: string;
          installment_id?: string | null;
          invoice_id?: string;
          notes?: string | null;
          payment_reference?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      presentation_grades: {
        Row: {
          created_at: string;
          feedback: string | null;
          graded_at: string | null;
          graded_by: string | null;
          id: string;
          presentation_id: string;
          score: number | null;
          status: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          feedback?: string | null;
          graded_at?: string | null;
          graded_by?: string | null;
          id?: string;
          presentation_id: string;
          score?: number | null;
          status?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          feedback?: string | null;
          graded_at?: string | null;
          graded_by?: string | null;
          id?: string;
          presentation_id?: string;
          score?: number | null;
          status?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "presentation_grades_presentation_id_fkey";
            columns: ["presentation_id"];
            isOneToOne: false;
            referencedRelation: "presentations";
            referencedColumns: ["id"];
          },
        ];
      };
      presentations: {
        Row: {
          classroom_id: string;
          cohort_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          instructions: string | null;
          max_score: number;
          pass_score: number;
          schedule_id: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          classroom_id: string;
          cohort_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          instructions?: string | null;
          max_score?: number;
          pass_score?: number;
          schedule_id: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          classroom_id?: string;
          cohort_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          instructions?: string | null;
          max_score?: number;
          pass_score?: number;
          schedule_id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "presentations_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: true;
            referencedRelation: "schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          organization_id: string | null;
          phone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          organization_id?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          organization_id?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      programs: {
        Row: {
          active: boolean;
          created_at: string;
          description: string | null;
          hub_id: string | null;
          id: string;
          program_name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          hub_id?: string | null;
          id?: string;
          program_name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          hub_id?: string | null;
          id?: string;
          program_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "programs_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_expenses: {
        Row: {
          active: boolean;
          amount: number;
          category: string;
          created_at: string;
          created_by: string | null;
          end_date: string | null;
          frequency: string;
          hub_id: string | null;
          id: string;
          last_posted_date: string | null;
          next_due_date: string;
          notes: string | null;
          payment_method: string | null;
          start_date: string;
          updated_at: string;
          vendor_name: string | null;
        };
        Insert: {
          active?: boolean;
          amount?: number;
          category: string;
          created_at?: string;
          created_by?: string | null;
          end_date?: string | null;
          frequency?: string;
          hub_id?: string | null;
          id?: string;
          last_posted_date?: string | null;
          next_due_date?: string;
          notes?: string | null;
          payment_method?: string | null;
          start_date?: string;
          updated_at?: string;
          vendor_name?: string | null;
        };
        Update: {
          active?: boolean;
          amount?: number;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          end_date?: string | null;
          frequency?: string;
          hub_id?: string | null;
          id?: string;
          last_posted_date?: string | null;
          next_due_date?: string;
          notes?: string | null;
          payment_method?: string | null;
          start_date?: string;
          updated_at?: string;
          vendor_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_income: {
        Row: {
          active: boolean;
          amount: number;
          category: string;
          created_at: string;
          created_by: string | null;
          end_date: string | null;
          frequency: string;
          hub_id: string | null;
          id: string;
          last_posted_date: string | null;
          next_due_date: string;
          notes: string | null;
          overdue_sent_at: string | null;
          payer_name: string;
          payment_method: string | null;
          start_date: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          amount?: number;
          category: string;
          created_at?: string;
          created_by?: string | null;
          end_date?: string | null;
          frequency?: string;
          hub_id?: string | null;
          id?: string;
          last_posted_date?: string | null;
          next_due_date?: string;
          notes?: string | null;
          overdue_sent_at?: string | null;
          payer_name: string;
          payment_method?: string | null;
          start_date?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          amount?: number;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          end_date?: string | null;
          frequency?: string;
          hub_id?: string | null;
          id?: string;
          last_posted_date?: string | null;
          next_due_date?: string;
          notes?: string | null;
          overdue_sent_at?: string | null;
          payer_name?: string;
          payment_method?: string | null;
          start_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_income_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      schedules: {
        Row: {
          classroom_id: string;
          cohort_id: string | null;
          created_at: string;
          created_by: string | null;
          end_time: string;
          id: string;
          instructor_id: string | null;
          lesson_id: string | null;
          location: string | null;
          meeting_link: string | null;
          module_id: string | null;
          scheduled_date: string;
          start_time: string;
          status: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          classroom_id: string;
          cohort_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          end_time: string;
          id?: string;
          instructor_id?: string | null;
          lesson_id?: string | null;
          location?: string | null;
          meeting_link?: string | null;
          module_id?: string | null;
          scheduled_date: string;
          start_time: string;
          status?: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          classroom_id?: string;
          cohort_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          end_time?: string;
          id?: string;
          instructor_id?: string | null;
          lesson_id?: string | null;
          location?: string | null;
          meeting_link?: string | null;
          module_id?: string | null;
          scheduled_date?: string;
          start_time?: string;
          status?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedules_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedules_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedules_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedules_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedules_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          account_number: string | null;
          active: boolean;
          bank_name: string | null;
          base_salary: number;
          created_at: string;
          email: string | null;
          externally_funded: boolean;
          full_name: string;
          funder_name: string | null;
          hub_id: string | null;
          id: string;
          phone: string | null;
          program_id: string | null;
          role_title: string | null;
          updated_at: string;
        };
        Insert: {
          account_number?: string | null;
          active?: boolean;
          bank_name?: string | null;
          base_salary?: number;
          created_at?: string;
          email?: string | null;
          externally_funded?: boolean;
          full_name: string;
          funder_name?: string | null;
          hub_id?: string | null;
          id?: string;
          phone?: string | null;
          program_id?: string | null;
          role_title?: string | null;
          updated_at?: string;
        };
        Update: {
          account_number?: string | null;
          active?: boolean;
          bank_name?: string | null;
          base_salary?: number;
          created_at?: string;
          email?: string | null;
          externally_funded?: boolean;
          full_name?: string;
          funder_name?: string | null;
          hub_id?: string | null;
          id?: string;
          phone?: string | null;
          program_id?: string | null;
          role_title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_invitations: {
        Row: {
          accepted_at: string | null;
          classroom_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          staff_id: string;
          staff_type: string;
          status: string;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          classroom_id: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          staff_id: string;
          staff_type: string;
          status?: string;
          token?: string;
        };
        Update: {
          accepted_at?: string | null;
          classroom_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          staff_id?: string;
          staff_type?: string;
          status?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_invitations_classroom_id_fkey";
            columns: ["classroom_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_invitations_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_invoices: {
        Row: {
          amount: number;
          created_at: string;
          description: string | null;
          evidence_url: string | null;
          expense_id: string | null;
          id: string;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          staff_id: string | null;
          staff_name: string;
          status: string;
          submitted_by: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          created_at?: string;
          description?: string | null;
          evidence_url?: string | null;
          expense_id?: string | null;
          id?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          staff_id?: string | null;
          staff_name: string;
          status?: string;
          submitted_by?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          description?: string | null;
          evidence_url?: string | null;
          expense_id?: string | null;
          id?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          staff_id?: string | null;
          staff_name?: string;
          status?: string;
          submitted_by?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      system_owners: {
        Row: {
          user_id: string;
        };
        Insert: {
          user_id: string;
        };
        Update: {
          user_id?: string;
        };
        Relationships: [];
      };
      tracks: {
        Row: {
          created_at: string;
          curriculum_id: string;
          description: string | null;
          id: string;
          order_index: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          curriculum_id: string;
          description?: string | null;
          id?: string;
          order_index?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          curriculum_id?: string;
          description?: string | null;
          id?: string;
          order_index?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tracks_curriculum_id_fkey";
            columns: ["curriculum_id"];
            isOneToOne: false;
            referencedRelation: "curricula";
            referencedColumns: ["id"];
          },
        ];
      };
      units: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          module_id: string;
          order_index: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          module_id: string;
          order_index?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          module_id?: string;
          order_index?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "units_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      enrollments_needing_duplicate_review: {
        Row: {
          amount_paid: number | null;
          bank_confirmed: number | null;
          created_at: string | null;
          email: string | null;
          enrollment_id: string | null;
          full_name: string | null;
          others_containing_this_name: number | null;
          others_on_this_number: number | null;
          paid_installments: number | null;
          phone_normalized: string | null;
          program_name: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      _get_classroom_hub_id: {
        Args: { p_classroom_id: string };
        Returns: string;
      };
      _get_hub_id_for_cs: { Args: { p_cs_id: string }; Returns: string };
      accept_hub_invitation: {
        Args: { p_token: string; p_user_id: string };
        Returns: undefined;
      };
      accept_staff_invitation: {
        Args: { p_token: string; p_user_id: string };
        Returns: Json;
      };
      activate_marketing_campaign: {
        Args: { p_campaign_id: string };
        Returns: undefined;
      };
      admin_delete_enrollment: {
        Args: { p_enrollment_id: string };
        Returns: undefined;
      };
      admin_delete_invoice: {
        Args: { p_invoice_id: string };
        Returns: undefined;
      };
      admin_update_invoice: {
        Args: {
          p_installments?: Json;
          p_invoice_id: string;
          p_total_amount: number;
        };
        Returns: undefined;
      };
      approve_invoice_change: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      approve_staff_invoice: {
        Args: { p_id: string; p_payment_date?: string };
        Returns: string;
      };
      assign_staff_to_classroom: {
        Args: {
          p_classroom_id: string;
          p_staff_id: string;
          p_staff_type: string;
        };
        Returns: string;
      };
      assignment_classroom_id: {
        Args: { _assignment_id: string };
        Returns: string;
      };
      auto_enroll_student_classroom: {
        Args: { p_enrollment_id: string };
        Returns: undefined;
      };
      can_manage_crm: { Args: Record<PropertyKey, never>; Returns: boolean };
      cancel_admin_invite: { Args: { p_email: string }; Returns: undefined };
      classroom_admin_access: {
        Args: { _classroom_id: string };
        Returns: boolean;
      };
      classroom_attendance_access: {
        Args: { _classroom_id: string };
        Returns: boolean;
      };
      classroom_manage_access: {
        Args: { _classroom_id: string };
        Returns: boolean;
      };
      classroom_read_access: {
        Args: { _classroom_id: string };
        Returns: boolean;
      };
      classroom_staff_access: {
        Args: { _classroom_id: string };
        Returns: boolean;
      };
      clone_curriculum_to_cohort: {
        Args: { p_source_curriculum_id: string; p_target_cohort_id: string };
        Returns: string;
      };
      clone_curriculum_v2: {
        Args: {
          p_source_curriculum_id: string;
          p_target_classroom_id: string;
          p_title?: string;
        };
        Returns: string;
      };
      cohort_is_mine: { Args: { _cohort_id: string }; Returns: boolean };
      complete_lead_follow_up: {
        Args: {
          p_follow_up_id: string;
          p_next_due_at?: string;
          p_outcome?: string;
        };
        Returns: undefined;
      };
      compute_cohort_graduation: {
        Args: { p_cohort_id: string };
        Returns: undefined;
      };
      compute_next_recurrence: {
        Args: { _d: string; _freq: string };
        Returns: string;
      };
      confirm_bank_match: {
        Args: { p_bank_transaction_id: string; p_installment_id: string };
        Returns: undefined;
      };
      convert_crm_lead: {
        Args: {
          p_lead_id: string;
          p_program_id: string;
          p_total_amount?: number;
        };
        Returns: string;
      };
      create_admin_invite: { Args: { p_email: string }; Returns: undefined };
      curriculum_add_lesson: {
        Args: {
          p_content?: string;
          p_external_link?: string;
          p_objectives?: string;
          p_title: string;
          p_unit_id: string;
          p_video_url?: string;
        };
        Returns: string;
      };
      curriculum_classroom_id: {
        Args: { _curriculum_id: string };
        Returns: string;
      };
      curriculum_update_lesson: {
        Args: {
          p_content?: string;
          p_external_link?: string;
          p_id: string;
          p_objectives?: string;
          p_order_index?: number;
          p_title?: string;
          p_video_url?: string;
        };
        Returns: undefined;
      };
      enrollment_in_my_hub: {
        Args: { _enrollment_id: string };
        Returns: boolean;
      };
      enrollment_is_mine: {
        Args: { _enrollment_id: string };
        Returns: boolean;
      };
      evaluate_lead_campaigns: {
        Args: { p_lead_id: string };
        Returns: undefined;
      };
      generate_attendance_session:
        | {
            Args: {
              p_classroom_id: string;
              p_cohort_id?: string;
              p_duration_mins?: number;
              p_lesson_id?: string;
            };
            Returns: {
              classroom_id: string;
              closed_at: string | null;
              code: string;
              code_expires_at: string;
              cohort_id: string | null;
              created_at: string;
              duration_mins: number;
              generated_by: string | null;
              id: string;
              late_after_mins: number;
              lesson_id: string | null;
              schedule_id: string | null;
              status: string;
            };
            SetofOptions: {
              from: "*";
              to: "attendance_sessions";
              isOneToOne: true;
              isSetofReturn: false;
            };
          }
        | {
            Args: {
              p_classroom_id: string;
              p_cohort_id?: string;
              p_duration_mins?: number;
              p_late_after_mins?: number;
              p_lesson_id?: string;
              p_schedule_id?: string;
            };
            Returns: {
              classroom_id: string;
              closed_at: string | null;
              code: string;
              code_expires_at: string;
              cohort_id: string | null;
              created_at: string;
              duration_mins: number;
              generated_by: string | null;
              id: string;
              late_after_mins: number;
              lesson_id: string | null;
              schedule_id: string | null;
              status: string;
            };
            SetofOptions: {
              from: "*";
              to: "attendance_sessions";
              isOneToOne: true;
              isSetofReturn: false;
            };
          };
      generate_class_schedule: {
        Args: {
          p_classroom_id: string;
          p_cohort_id?: string;
          p_days_of_week: number[];
          p_end_date: string;
          p_end_time: string;
          p_module_id: string;
          p_start_date: string;
          p_start_time: string;
        };
        Returns: {
          end_time: string;
          id: string;
          scheduled_date: string;
          start_time: string;
          title: string;
        }[];
      };
      generate_cohort_schedule: {
        Args: {
          p_cohort_id: string;
          p_days: string[];
          p_end_time: string;
          p_instructor_id?: string;
          p_start_time: string;
        };
        Returns: number;
      };
      get_assignment_hub_id: {
        Args: { p_assignment_id: string };
        Returns: string;
      };
      get_classroom_curricula: {
        Args: { p_classroom_id: string };
        Returns: Json;
      };
      get_classroom_curricula_trees: {
        Args: { p_classroom_id: string };
        Returns: Json;
      };
      get_classroom_hub_id: {
        Args: { p_classroom_id: string };
        Returns: string;
      };
      get_classroom_lesson_options: {
        Args: { p_classroom_id: string };
        Returns: {
          curriculum_id: string;
          curriculum_title: string;
          lesson_id: string;
          lesson_title: string;
          module_id: string;
          module_title: string;
          track_id: string;
          track_title: string;
          unit_id: string;
          unit_title: string;
        }[];
      };
      get_classroom_schedules: {
        Args: { p_classroom_id: string };
        Returns: Json;
      };
      get_classroom_staff_hub_id: {
        Args: { p_cs_id: string };
        Returns: string;
      };
      get_cohort_analytics: { Args: { p_cohort_id: string }; Returns: Json };
      get_cohort_classroom_hub_id: {
        Args: { p_cohort_id: string };
        Returns: string;
      };
      get_crm_report: { Args: { p_from: string; p_to: string }; Returns: Json };
      get_curriculum_hub_id: {
        Args: { p_curriculum_id: string };
        Returns: string;
      };
      get_curriculum_tree: { Args: { p_curriculum_id: string }; Returns: Json };
      get_curriculum_week_hub_id: {
        Args: { p_cw_id: string };
        Returns: string;
      };
      get_dashboard_stats: { Args: Record<PropertyKey, never>; Returns: Json };
      get_enrollment_field_values: {
        Args: { p_enrollment_id: string };
        Returns: {
          field_key: string;
          value: string;
        }[];
      };
      get_enrollment_for_completion: {
        Args: { p_enrollment_id: string };
        Returns: {
          email: string;
          full_name: string;
          hub_id: string;
          id: string;
          phone: string;
          profile_requirements_version: number;
          program_name: string;
          user_id: string;
        }[];
      };
      get_enrollment_performance: {
        Args: { p_end_date?: string; p_months?: number; p_start_date?: string };
        Returns: {
          achievement_pct: number;
          actual_count: number;
          month: string;
          target_count: number;
          variance: number;
        }[];
      };
      get_finance_summary: {
        Args: { p_end_date?: string; p_months?: number; p_start_date?: string };
        Returns: {
          expenses_total: number;
          month: string;
          other_income_total: number;
          payroll_total: number;
          profit: number;
          revenue: number;
          revenue_cash: number;
        }[];
      };
      get_lesson_hub_id: { Args: { p_lesson_id: string }; Returns: string };
      get_my_hub_context: {
        Args: Record<PropertyKey, never>;
        Returns: {
          hub_id: string;
          hub_name: string;
          hub_slug: string;
        }[];
      };
      get_my_hub_id: { Args: Record<PropertyKey, never>; Returns: string };
      get_staff_names: {
        Args: { p_ids: string[] };
        Returns: {
          full_name: string;
          id: string;
        }[];
      };
      get_student_progress: {
        Args: { p_cohort_id: string; p_student_id: string };
        Returns: Json;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      invite_admin: { Args: { p_email: string }; Returns: undefined };
      invoice_in_my_hub: { Args: { _invoice_id: string }; Returns: boolean };
      invoice_is_mine: { Args: { _invoice_id: string }; Returns: boolean };
      is_cohort_member: {
        Args: { _cohort_id: string; _user_id: string };
        Returns: boolean;
      };
      is_owner: { Args: { _user_id?: string }; Returns: boolean };
      is_superadmin:
        | { Args: Record<PropertyKey, never>; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean };
      link_enrollment_to_user: {
        Args: { p_enrollment_id: string };
        Returns: undefined;
      };
      list_admins: {
        Args: Record<PropertyKey, never>;
        Returns: {
          email: string;
          is_super: boolean;
          pending: boolean;
          user_id: string;
        }[];
      };
      list_audit_logs: {
        Args: { p_limit?: number };
        Returns: {
          action: string;
          created_at: string;
          details: Json;
          entity_id: string;
          entity_type: string;
          id: string;
          user_email: string;
          user_id: string;
        }[];
      };
      list_crm_owners: {
        Args: Record<PropertyKey, never>;
        Returns: {
          email: string;
          full_name: string;
          user_id: string;
        }[];
      };
      list_hubs: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          name: string;
          slug: string;
        }[];
      };
      list_outstanding_invoices: {
        Args: { p_only_overdue?: boolean };
        Returns: {
          amount_paid: number;
          cohort_label: string;
          days_overdue: number;
          earliest_overdue_date: string;
          email: string;
          enrollment_id: string;
          full_name: string;
          invoice_id: string;
          invoice_number: string;
          invoice_status: string;
          is_overdue: boolean;
          next_due_date: string;
          outstanding: number;
          phone: string;
          program_name: string;
          total_amount: number;
        }[];
      };
      list_staff_users: {
        Args: Record<PropertyKey, never>;
        Returns: {
          classrooms: string[];
          email: string;
          full_name: string;
          user_id: string;
        }[];
      };
      mark_attendance: {
        Args: {
          p_code: string;
          p_student_lat?: number;
          p_student_lng?: number;
        };
        Returns: {
          attendance_status: string;
          classroom_id: string;
          cohort_id: string | null;
          distance_metres: number | null;
          enrollment_id: string | null;
          geofence_passed: boolean | null;
          id: string;
          lesson_id: string | null;
          marked_at: string;
          method: string;
          schedule_id: string | null;
          session_id: string;
          student_id: string;
          student_lat: number | null;
          student_lng: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "attendance_records";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      module_classroom_id: { Args: { _module_id: string }; Returns: string };
      name_match_score: {
        Args: { p_bank_text: string; p_person: string };
        Returns: number;
      };
      post_recurring_expense: {
        Args: { p_id: string; p_payment_date?: string };
        Returns: string;
      };
      post_recurring_income: {
        Args: { p_id: string; p_payment_date?: string };
        Returns: string;
      };
      presentation_classroom_id: {
        Args: { _presentation_id: string };
        Returns: string;
      };
      promote_staff_to_admin: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      recalculate_lead_score: {
        Args: { p_lead_id: string };
        Returns: {
          consent_source: string | null;
          consented_at: string | null;
          converted_at: string | null;
          created_at: string;
          email: string | null;
          enrollment_id: string | null;
          full_name: string;
          hub_id: string;
          id: string;
          lifecycle_status: string;
          marketing_consent: boolean;
          next_follow_up_at: string | null;
          normalized_email: string | null;
          owner_id: string | null;
          phone: string | null;
          program_interest_id: string | null;
          qualification: string;
          qualification_override: string | null;
          qualification_override_reason: string | null;
          referral_detail: string | null;
          score: number;
          source_detail: string | null;
          source_id: string | null;
          suppressed_at: string | null;
          suppression_reason: string | null;
          updated_at: string;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_medium: string | null;
          utm_source: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "crm_leads";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_lead_score_event: {
        Args: {
          p_event_type: string;
          p_external_key?: string;
          p_lead_id: string;
        };
        Returns: undefined;
      };
      reject_invoice_change: {
        Args: { p_reason?: string; p_request_id: string };
        Returns: undefined;
      };
      reject_staff_invoice: {
        Args: { p_id: string; p_reason?: string };
        Returns: undefined;
      };
      request_invoice_change: {
        Args: { p_action: string; p_invoice_id: string; p_payload: Json };
        Returns: string;
      };
      revoke_admin: { Args: { p_email: string }; Returns: undefined };
      run_cohort_graduation_sweep: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      seed_crm_defaults: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      set_graduation_override: {
        Args: {
          p_cohort_student_id: string;
          p_reason?: string;
          p_status: string;
        };
        Returns: undefined;
      };
      submit_enrollment_fields: {
        Args: { p_enrollment_id: string; p_fields: Json };
        Returns: undefined;
      };
      suggest_bank_matches: {
        Args: { p_day_window?: number; p_installment_id: string };
        Returns: {
          amount: number;
          bank_transaction_id: string;
          days_from_due: number;
          name_similarity: number;
          narration: string;
          occurred_at: string;
          payer: string;
        }[];
      };
      switch_hub_context: { Args: { p_hub_id: string }; Returns: undefined };
      switch_student_classroom: {
        Args: {
          p_from_classroom_id: string;
          p_reason?: string;
          p_student_id: string;
          p_to_classroom_id: string;
          p_to_cohort_id?: string;
        };
        Returns: undefined;
      };
      track_classroom_id: { Args: { _track_id: string }; Returns: string };
      unit_classroom_id: { Args: { _unit_id: string }; Returns: string };
      unreconciled_bank_credits: {
        Args: { p_from: string; p_to: string };
        Returns: {
          amount: number;
          id: string;
          narration: string;
          occurred_at: string;
          payer: string;
        }[];
      };
      upsert_crm_lead: {
        Args: {
          p_email?: string;
          p_full_name: string;
          p_marketing_consent?: boolean;
          p_metadata?: Json;
          p_phone?: string;
          p_qualification?: string;
          p_source_slug?: string;
        };
        Returns: {
          consent_source: string | null;
          consented_at: string | null;
          converted_at: string | null;
          created_at: string;
          email: string | null;
          enrollment_id: string | null;
          full_name: string;
          hub_id: string;
          id: string;
          lifecycle_status: string;
          marketing_consent: boolean;
          next_follow_up_at: string | null;
          normalized_email: string | null;
          owner_id: string | null;
          phone: string | null;
          program_interest_id: string | null;
          qualification: string;
          qualification_override: string | null;
          qualification_override_reason: string | null;
          referral_detail: string | null;
          score: number;
          source_detail: string | null;
          source_id: string | null;
          suppressed_at: string | null;
          suppression_reason: string | null;
          updated_at: string;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_medium: string | null;
          utm_source: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "crm_leads";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      app_role: "admin" | "student" | "organization" | "staff" | "marketing";
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "student", "organization", "staff", "marketing"],
    },
  },
} as const;
