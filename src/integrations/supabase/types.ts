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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _rls_policy_backup_20260705: {
        Row: {
          backed_up_at: string | null
          cmd: string | null
          policyname: unknown
          qual: string | null
          roles: unknown[] | null
          schemaname: unknown
          tablename: unknown
          with_check: string | null
        }
        Insert: {
          backed_up_at?: string | null
          cmd?: string | null
          policyname?: unknown
          qual?: string | null
          roles?: unknown[] | null
          schemaname?: unknown
          tablename?: unknown
          with_check?: string | null
        }
        Update: {
          backed_up_at?: string | null
          cmd?: string | null
          policyname?: unknown
          qual?: string | null
          roles?: unknown[] | null
          schemaname?: unknown
          tablename?: unknown
          with_check?: string | null
        }
        Relationships: []
      }
      _rls_policy_backup_classroom: {
        Row: {
          captured_at: string
          cmd: string | null
          permissive: string | null
          policyname: unknown
          qual: string | null
          roles: unknown[] | null
          schemaname: unknown
          tablename: unknown
          with_check: string | null
        }
        Insert: {
          captured_at?: string
          cmd?: string | null
          permissive?: string | null
          policyname: unknown
          qual?: string | null
          roles?: unknown[] | null
          schemaname: unknown
          tablename: unknown
          with_check?: string | null
        }
        Update: {
          captured_at?: string
          cmd?: string | null
          permissive?: string | null
          policyname?: unknown
          qual?: string | null
          roles?: unknown[] | null
          schemaname?: unknown
          tablename?: unknown
          with_check?: string | null
        }
        Relationships: []
      }
      assignment_resources: {
        Row: {
          assignment_id: string
          created_at: string
          file_url: string | null
          id: string
          resource_type: string
          title: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          file_url?: string | null
          id?: string
          resource_type?: string
          title: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          file_url?: string | null
          id?: string
          resource_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_resources_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          created_at: string
          enrollment_id: string | null
          feedback: string | null
          file_url: string | null
          grade: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          image_url: string | null
          link_url: string | null
          score: number | null
          status: string
          student_id: string
          submission_text: string | null
          submitted_at: string | null
        }
        Insert: {
          assignment_id: string
          created_at?: string
          enrollment_id?: string | null
          feedback?: string | null
          file_url?: string | null
          grade?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          score?: number | null
          status?: string
          student_id: string
          submission_text?: string | null
          submitted_at?: string | null
        }
        Update: {
          assignment_id?: string
          created_at?: string
          enrollment_id?: string | null
          feedback?: string | null
          file_url?: string | null
          grade?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          score?: number | null
          status?: string
          student_id?: string
          submission_text?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          classroom_id: string
          cohort_id: string | null
          created_at: string
          created_by: string | null
          curriculum_lesson_id: string | null
          due_date: string | null
          id: string
          instructions: string | null
          lesson_id: string | null
          max_score: number | null
          pass_score: number | null
          status: string
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          classroom_id: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          curriculum_lesson_id?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          lesson_id?: string | null
          max_score?: number | null
          pass_score?: number | null
          status?: string
          title: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          curriculum_lesson_id?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          lesson_id?: string | null
          max_score?: number | null
          pass_score?: number | null
          status?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_curriculum_lesson_id_fkey"
            columns: ["curriculum_lesson_id"]
            isOneToOne: false
            referencedRelation: "curriculum_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "old_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_status: string
          classroom_id: string
          cohort_id: string | null
          distance_metres: number | null
          enrollment_id: string | null
          geofence_passed: boolean | null
          id: string
          lesson_id: string | null
          marked_at: string
          method: string
          schedule_id: string | null
          session_id: string
          student_id: string
          student_lat: number | null
          student_lng: number | null
        }
        Insert: {
          attendance_status?: string
          classroom_id: string
          cohort_id?: string | null
          distance_metres?: number | null
          enrollment_id?: string | null
          geofence_passed?: boolean | null
          id?: string
          lesson_id?: string | null
          marked_at?: string
          method?: string
          schedule_id?: string | null
          session_id: string
          student_id: string
          student_lat?: number | null
          student_lng?: number | null
        }
        Update: {
          attendance_status?: string
          classroom_id?: string
          cohort_id?: string | null
          distance_metres?: number | null
          enrollment_id?: string | null
          geofence_passed?: boolean | null
          id?: string
          lesson_id?: string | null
          marked_at?: string
          method?: string
          schedule_id?: string | null
          session_id?: string
          student_id?: string
          student_lat?: number | null
          student_lng?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "old_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          classroom_id: string
          closed_at: string | null
          code: string
          code_expires_at: string
          cohort_id: string | null
          created_at: string
          duration_mins: number
          generated_by: string | null
          id: string
          lesson_id: string | null
          schedule_id: string | null
          status: string
        }
        Insert: {
          classroom_id: string
          closed_at?: string | null
          code: string
          code_expires_at: string
          cohort_id?: string | null
          created_at?: string
          duration_mins?: number
          generated_by?: string | null
          id?: string
          lesson_id?: string | null
          schedule_id?: string | null
          status?: string
        }
        Update: {
          classroom_id?: string
          closed_at?: string | null
          code?: string
          code_expires_at?: string
          cohort_id?: string | null
          created_at?: string
          duration_mins?: number
          generated_by?: string | null
          id?: string
          lesson_id?: string | null
          schedule_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "old_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
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
      classroom_permissions: {
        Row: {
          can_create_assignments: boolean
          can_create_lessons: boolean
          can_edit_cohorts: boolean
          can_schedule: boolean
          can_start_attendance: boolean
          can_view_students: boolean
          classroom_staff_id: string
          id: string
        }
        Insert: {
          can_create_assignments?: boolean
          can_create_lessons?: boolean
          can_edit_cohorts?: boolean
          can_schedule?: boolean
          can_start_attendance?: boolean
          can_view_students?: boolean
          classroom_staff_id: string
          id?: string
        }
        Update: {
          can_create_assignments?: boolean
          can_create_lessons?: boolean
          can_edit_cohorts?: boolean
          can_schedule?: boolean
          can_start_attendance?: boolean
          can_view_students?: boolean
          classroom_staff_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_permissions_classroom_staff_id_fkey"
            columns: ["classroom_staff_id"]
            isOneToOne: true
            referencedRelation: "classroom_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_staff: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          classroom_id: string
          id: string
          staff_id: string
          staff_type: string
          status: string
          user_id: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          classroom_id: string
          id?: string
          staff_id: string
          staff_type?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          classroom_id?: string
          id?: string
          staff_id?: string
          staff_type?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classroom_staff_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_staff_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_students: {
        Row: {
          classroom_id: string
          enrollment_id: string | null
          id: string
          joined_at: string
          student_id: string
        }
        Insert: {
          classroom_id: string
          enrollment_id?: string | null
          id?: string
          joined_at?: string
          student_id: string
        }
        Update: {
          classroom_id?: string
          enrollment_id?: string | null
          id?: string
          joined_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_students_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_students_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      classrooms: {
        Row: {
          attendance_radius_metres: number
          created_at: string
          created_by: string | null
          description: string | null
          geofencing_enabled: boolean
          gps_lat: number | null
          gps_lng: number | null
          hub_id: string | null
          id: string
          location: string | null
          name: string
          program_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attendance_radius_metres?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          geofencing_enabled?: boolean
          gps_lat?: number | null
          gps_lng?: number | null
          hub_id?: string | null
          id?: string
          location?: string | null
          name: string
          program_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attendance_radius_metres?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          geofencing_enabled?: boolean
          gps_lat?: number | null
          gps_lng?: number | null
          hub_id?: string | null
          id?: string
          location?: string | null
          name?: string
          program_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classrooms_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classrooms_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_students: {
        Row: {
          auto_graduation_status: string
          cohort_id: string
          enrollment_id: string | null
          final_graduation_status: string | null
          graduation_override: string | null
          graduation_override_at: string | null
          graduation_override_by: string | null
          graduation_override_reason: string | null
          id: string
          joined_at: string
          status: string
          student_id: string
        }
        Insert: {
          auto_graduation_status?: string
          cohort_id: string
          enrollment_id?: string | null
          final_graduation_status?: string | null
          graduation_override?: string | null
          graduation_override_at?: string | null
          graduation_override_by?: string | null
          graduation_override_reason?: string | null
          id?: string
          joined_at?: string
          status?: string
          student_id: string
        }
        Update: {
          auto_graduation_status?: string
          cohort_id?: string
          enrollment_id?: string | null
          final_graduation_status?: string | null
          graduation_override?: string | null
          graduation_override_at?: string | null
          graduation_override_by?: string | null
          graduation_override_reason?: string | null
          id?: string
          joined_at?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_students_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_students_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          capacity: number | null
          classroom_id: string | null
          cohort_label: string
          created_at: string
          end_date: string | null
          hub_id: string | null
          id: string
          program_id: string
          scope_id: string | null
          scope_type: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          classroom_id?: string | null
          cohort_label: string
          created_at?: string
          end_date?: string | null
          hub_id?: string | null
          id?: string
          program_id: string
          scope_id?: string | null
          scope_type?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          classroom_id?: string | null
          cohort_label?: string
          created_at?: string
          end_date?: string | null
          hub_id?: string | null
          id?: string
          program_id?: string
          scope_id?: string | null
          scope_type?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohorts_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohorts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      curricula: {
        Row: {
          classroom_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curricula_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_lessons: {
        Row: {
          created_at: string
          curriculum_week_id: string
          id: string
          lesson_order: number
          objectives: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          curriculum_week_id: string
          id?: string
          lesson_order?: number
          objectives?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          curriculum_week_id?: string
          id?: string
          lesson_order?: number
          objectives?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_lessons_curriculum_week_id_fkey"
            columns: ["curriculum_week_id"]
            isOneToOne: false
            referencedRelation: "curriculum_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_weeks: {
        Row: {
          created_at: string
          curriculum_id: string
          id: string
          objectives: string | null
          start_date: string | null
          title: string
          week_number: number
        }
        Insert: {
          created_at?: string
          curriculum_id: string
          id?: string
          objectives?: string | null
          start_date?: string | null
          title: string
          week_number: number
        }
        Update: {
          created_at?: string
          curriculum_id?: string
          id?: string
          objectives?: string | null
          start_date?: string | null
          title?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_weeks_curriculum_id_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "curriculums"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculums: {
        Row: {
          classroom_id: string | null
          cohort_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          classroom_id?: string | null
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          classroom_id?: string | null
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculums_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculums_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          active: boolean
          created_at: string
          field_type: string
          hub_id: string | null
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
          hub_id?: string | null
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
          hub_id?: string | null
          id?: string
          key?: string
          label?: string
          options?: Json | null
          required?: boolean
          sort_order?: number
          visible_to_organization?: boolean
          visible_to_student?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_targets: {
        Row: {
          created_at: string
          created_by: string | null
          hub_id: string
          id: string
          notes: string | null
          target_count: number
          target_month: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hub_id: string
          id?: string
          notes?: string | null
          target_count?: number
          target_month: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hub_id?: string
          id?: string
          notes?: string | null
          target_count?: number
          target_month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_targets_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          address: string | null
          amount_paid: number
          cohort_id: string | null
          created_at: string
          email: string
          enrollment_status: string
          first_payment_date: string | null
          full_name: string
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          last_payment_date: string | null
          organization_id: string | null
          outstanding_balance: number | null
          payment_evidence_url: string | null
          payment_status: string | null
          payment_type: string
          phone: string | null
          program_id: string
          total_amount: number
          updated_at: string
          user_id: string | null
          verification_status: string
        }
        Insert: {
          address?: string | null
          amount_paid?: number
          cohort_id?: string | null
          created_at?: string
          email: string
          enrollment_status?: string
          first_payment_date?: string | null
          full_name: string
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          last_payment_date?: string | null
          organization_id?: string | null
          outstanding_balance?: number | null
          payment_evidence_url?: string | null
          payment_status?: string | null
          payment_type?: string
          phone?: string | null
          program_id: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
          verification_status?: string
        }
        Update: {
          address?: string | null
          amount_paid?: number
          cohort_id?: string | null
          created_at?: string
          email?: string
          enrollment_status?: string
          first_payment_date?: string | null
          full_name?: string
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          last_payment_date?: string | null
          organization_id?: string | null
          outstanding_balance?: number | null
          payment_evidence_url?: string | null
          payment_status?: string | null
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
          hub_id: string | null
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
          hub_id?: string | null
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
          hub_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
          recorded_by?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
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
      hub_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          hub_id: string
          hub_role: string
          id: string
          is_demo: boolean
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          hub_id: string
          hub_role?: string
          id?: string
          is_demo?: boolean
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          hub_id?: string
          hub_role?: string
          id?: string
          is_demo?: boolean
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_invitations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_members: {
        Row: {
          created_at: string
          demo_expires_at: string | null
          hub_id: string
          hub_role: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          demo_expires_at?: string | null
          hub_id: string
          hub_role?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          demo_expires_at?: string | null
          hub_id?: string
          hub_role?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_members_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      hubs: {
        Row: {
          contact_email: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          plan: string
          slug: string
          status: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          slug: string
          status?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          slug?: string
          status?: string
        }
        Relationships: []
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
      invoice_change_requests: {
        Row: {
          action: string
          created_at: string
          id: string
          invoice_id: string
          payload: Json | null
          reason: string | null
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          invoice_id: string
          payload?: Json | null
          reason?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          invoice_id?: string
          payload?: Json | null
          reason?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_change_requests_invoice_id_fkey"
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
      lesson_materials: {
        Row: {
          created_at: string
          curriculum_lesson_id: string | null
          file_url: string | null
          id: string
          lesson_id: string | null
          material_type: string
          title: string
        }
        Insert: {
          created_at?: string
          curriculum_lesson_id?: string | null
          file_url?: string | null
          id?: string
          lesson_id?: string | null
          material_type?: string
          title: string
        }
        Update: {
          created_at?: string
          curriculum_lesson_id?: string | null
          file_url?: string | null
          id?: string
          lesson_id?: string | null
          material_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_materials_curriculum_lesson_id_fkey"
            columns: ["curriculum_lesson_id"]
            isOneToOne: false
            referencedRelation: "curriculum_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_materials_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "old_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          external_link: string | null
          id: string
          objectives: string | null
          order_index: number
          resources: Json | null
          title: string
          unit_id: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          external_link?: string | null
          id?: string
          objectives?: string | null
          order_index?: number
          resources?: Json | null
          title: string
          unit_id: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          external_link?: string | null
          id?: string
          objectives?: string | null
          order_index?: number
          resources?: Json | null
          title?: string
          unit_id?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_index: number
          title: string
          track_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          title: string
          track_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          title?: string
          track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          enrollment_id: string | null
          hub_id: string | null
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
          hub_id?: string | null
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
          hub_id?: string | null
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
          {
            foreignKeyName: "notifications_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      old_lessons: {
        Row: {
          attendance_session_status: string
          classroom_id: string
          cohort_id: string | null
          created_at: string
          created_by: string | null
          curriculum_lesson_id: string | null
          description: string | null
          end_time: string
          id: string
          lesson_date: string
          location: string | null
          start_time: string
          status: string
          title: string
          tutor_id: string | null
          updated_at: string
          week_number: number | null
        }
        Insert: {
          attendance_session_status?: string
          classroom_id: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          curriculum_lesson_id?: string | null
          description?: string | null
          end_time: string
          id?: string
          lesson_date: string
          location?: string | null
          start_time: string
          status?: string
          title: string
          tutor_id?: string | null
          updated_at?: string
          week_number?: number | null
        }
        Update: {
          attendance_session_status?: string
          classroom_id?: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          curriculum_lesson_id?: string | null
          description?: string | null
          end_time?: string
          id?: string
          lesson_date?: string
          location?: string | null
          start_time?: string
          status?: string
          title?: string
          tutor_id?: string | null
          updated_at?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_curriculum_lesson_id_fkey"
            columns: ["curriculum_lesson_id"]
            isOneToOne: false
            referencedRelation: "curriculum_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
          hub_id: string | null
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
          hub_id?: string | null
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
          hub_id?: string | null
          id?: string
          organization_name?: string
          organization_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      other_income: {
        Row: {
          amount: number
          category: string
          created_at: string
          hub_id: string | null
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
          hub_id?: string | null
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
          hub_id?: string | null
          id?: string
          notes?: string | null
          payer_name?: string
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "other_income_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
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
      presentation_grades: {
        Row: {
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          presentation_id: string
          score: number | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          presentation_id: string
          score?: number | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          presentation_id?: string
          score?: number | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentation_grades_presentation_id_fkey"
            columns: ["presentation_id"]
            isOneToOne: false
            referencedRelation: "presentations"
            referencedColumns: ["id"]
          },
        ]
      }
      presentations: {
        Row: {
          classroom_id: string
          cohort_id: string
          created_at: string
          created_by: string | null
          id: string
          instructions: string | null
          max_score: number
          pass_score: number
          schedule_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          classroom_id: string
          cohort_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          instructions?: string | null
          max_score?: number
          pass_score?: number
          schedule_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          cohort_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          instructions?: string | null
          max_score?: number
          pass_score?: number
          schedule_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentations_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presentations_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presentations_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: true
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
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
          hub_id: string | null
          id: string
          program_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          hub_id?: string | null
          id?: string
          program_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          hub_id?: string | null
          id?: string
          program_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          created_by: string | null
          end_date: string | null
          frequency: string
          hub_id: string | null
          id: string
          last_posted_date: string | null
          next_due_date: string
          notes: string | null
          payment_method: string | null
          start_date: string
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          active?: boolean
          amount?: number
          category: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency?: string
          hub_id?: string | null
          id?: string
          last_posted_date?: string | null
          next_due_date?: string
          notes?: string | null
          payment_method?: string | null
          start_date?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency?: string
          hub_id?: string | null
          id?: string
          last_posted_date?: string | null
          next_due_date?: string
          notes?: string | null
          payment_method?: string | null
          start_date?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_income: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          created_by: string | null
          end_date: string | null
          frequency: string
          hub_id: string | null
          id: string
          last_posted_date: string | null
          next_due_date: string
          notes: string | null
          overdue_sent_at: string | null
          payer_email: string | null
          payer_name: string
          payer_phone: string | null
          payment_method: string | null
          reminder_1d_sent_at: string | null
          reminder_3d_sent_at: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          category: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency?: string
          hub_id?: string | null
          id?: string
          last_posted_date?: string | null
          next_due_date?: string
          notes?: string | null
          overdue_sent_at?: string | null
          payer_email?: string | null
          payer_name: string
          payer_phone?: string | null
          payment_method?: string | null
          reminder_1d_sent_at?: string | null
          reminder_3d_sent_at?: string | null
          start_date?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency?: string
          hub_id?: string | null
          id?: string
          last_posted_date?: string | null
          next_due_date?: string
          notes?: string | null
          overdue_sent_at?: string | null
          payer_email?: string | null
          payer_name?: string
          payer_phone?: string | null
          payment_method?: string | null
          reminder_1d_sent_at?: string | null
          reminder_3d_sent_at?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_income_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          classroom_id: string
          cohort_id: string | null
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          instructor_id: string | null
          lesson_id: string | null
          location: string | null
          meeting_link: string | null
          module_id: string | null
          scheduled_date: string
          start_time: string
          status: string
          title: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          classroom_id: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          instructor_id?: string | null
          lesson_id?: string | null
          location?: string | null
          meeting_link?: string | null
          module_id?: string | null
          scheduled_date: string
          start_time: string
          status?: string
          title?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          instructor_id?: string | null
          lesson_id?: string | null
          location?: string | null
          meeting_link?: string | null
          module_id?: string | null
          scheduled_date?: string
          start_time?: string
          status?: string
          title?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          account_number: string | null
          active: boolean
          bank_name: string | null
          base_salary: number
          created_at: string
          email: string | null
          externally_funded: boolean
          full_name: string
          funder_name: string | null
          hub_id: string | null
          id: string
          phone: string | null
          program_id: string | null
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
          externally_funded?: boolean
          full_name: string
          funder_name?: string | null
          hub_id?: string | null
          id?: string
          phone?: string | null
          program_id?: string | null
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
          externally_funded?: boolean
          full_name?: string
          funder_name?: string | null
          hub_id?: string | null
          id?: string
          phone?: string | null
          program_id?: string | null
          role_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          classroom_id: string
          created_at: string
          expires_at: string
          id: string
          invited_by: string | null
          staff_id: string
          staff_type: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          classroom_id: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          staff_id: string
          staff_type: string
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          classroom_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          staff_id?: string
          staff_type?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invoices: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          evidence_url: string | null
          expense_id: string | null
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string | null
          staff_name: string
          status: string
          submitted_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          evidence_url?: string | null
          expense_id?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string | null
          staff_name: string
          status?: string
          submitted_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          evidence_url?: string | null
          expense_id?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string | null
          staff_name?: string
          status?: string
          submitted_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      superadmins: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
        Relationships: []
      }
      tracks: {
        Row: {
          created_at: string
          curriculum_id: string
          description: string | null
          id: string
          order_index: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          curriculum_id: string
          description?: string | null
          id?: string
          order_index?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          curriculum_id?: string
          description?: string | null
          id?: string
          order_index?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_curriculum_id_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string
          description: string | null
          id: string
          module_id: string
          order_index: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          module_id: string
          order_index?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          module_id?: string
          order_index?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
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
      _get_classroom_hub_id: {
        Args: { p_classroom_id: string }
        Returns: string
      }
      _get_hub_id_for_cs: { Args: { p_cs_id: string }; Returns: string }
      accept_hub_invitation: {
        Args: { p_token: string; p_user_id: string }
        Returns: undefined
      }
      accept_staff_invitation: {
        Args: { p_token: string; p_user_id: string }
        Returns: Json
      }
      add_student_to_cohort: {
        Args: {
          p_cohort_id: string
          p_enrollment_id?: string
          p_student_id: string
        }
        Returns: undefined
      }
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
          p_installments?: Json
          p_invoice_id: string
          p_total_amount: number
        }
        Returns: undefined
      }
      approve_invoice_change: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      approve_staff_invoice: {
        Args: { p_id: string; p_payment_date?: string }
        Returns: string
      }
      assign_staff_to_classroom: {
        Args: {
          p_classroom_id: string
          p_staff_id: string
          p_staff_type: string
        }
        Returns: string
      }
      assignment_classroom_id: {
        Args: { _assignment_id: string }
        Returns: string
      }
      auto_enroll_student_classroom: {
        Args: { p_enrollment_id: string }
        Returns: undefined
      }
      cancel_admin_invite: { Args: { p_email: string }; Returns: undefined }
      classroom_admin_access: {
        Args: { _classroom_id: string }
        Returns: boolean
      }
      classroom_attendance_access: {
        Args: { _classroom_id: string }
        Returns: boolean
      }
      classroom_manage_access: {
        Args: { _classroom_id: string }
        Returns: boolean
      }
      classroom_read_access: {
        Args: { _classroom_id: string }
        Returns: boolean
      }
      classroom_staff_access: {
        Args: { _classroom_id: string }
        Returns: boolean
      }
      clone_curriculum_to_cohort: {
        Args: { p_source_curriculum_id: string; p_target_cohort_id: string }
        Returns: string
      }
      clone_curriculum_v2: {
        Args: {
          p_source_curriculum_id: string
          p_target_classroom_id: string
          p_title?: string
        }
        Returns: string
      }
      cohort_is_mine: { Args: { _cohort_id: string }; Returns: boolean }
      compute_cohort_graduation: {
        Args: { p_cohort_id: string }
        Returns: undefined
      }
      compute_next_recurrence: {
        Args: { _d: string; _freq: string }
        Returns: string
      }
      create_admin_invite: { Args: { p_email: string }; Returns: undefined }
      create_curriculum_from_structure: {
        Args: { p_classroom_id: string; p_structure: Json }
        Returns: string
      }
      curriculum_add_lesson:
        | {
            Args: {
              p_content?: string
              p_objectives?: string
              p_title: string
              p_unit_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_content?: string
              p_external_link?: string
              p_objectives?: string
              p_title: string
              p_unit_id: string
              p_video_url?: string
            }
            Returns: string
          }
      curriculum_add_module: {
        Args: { p_description?: string; p_title: string; p_track_id: string }
        Returns: string
      }
      curriculum_add_track: {
        Args: {
          p_curriculum_id: string
          p_description?: string
          p_title: string
        }
        Returns: string
      }
      curriculum_add_unit: {
        Args: { p_description?: string; p_module_id: string; p_title: string }
        Returns: string
      }
      curriculum_classroom_id: {
        Args: { _curriculum_id: string }
        Returns: string
      }
      curriculum_delete_lesson: { Args: { p_id: string }; Returns: undefined }
      curriculum_delete_module: { Args: { p_id: string }; Returns: undefined }
      curriculum_delete_track: { Args: { p_id: string }; Returns: undefined }
      curriculum_delete_unit: { Args: { p_id: string }; Returns: undefined }
      curriculum_update_lesson:
        | {
            Args: {
              p_content?: string
              p_id: string
              p_objectives?: string
              p_order_index?: number
              p_title?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_content?: string
              p_external_link?: string
              p_id: string
              p_objectives?: string
              p_order_index?: number
              p_title?: string
              p_video_url?: string
            }
            Returns: undefined
          }
      curriculum_update_module: {
        Args: {
          p_description?: string
          p_id: string
          p_order_index?: number
          p_title?: string
        }
        Returns: undefined
      }
      curriculum_update_track: {
        Args: {
          p_description?: string
          p_id: string
          p_order_index?: number
          p_title?: string
        }
        Returns: undefined
      }
      curriculum_update_unit: {
        Args: {
          p_description?: string
          p_id: string
          p_order_index?: number
          p_title?: string
        }
        Returns: undefined
      }
      enrollment_in_my_hub: {
        Args: { _enrollment_id: string }
        Returns: boolean
      }
      enrollment_is_mine: { Args: { _enrollment_id: string }; Returns: boolean }
      generate_attendance_session: {
        Args: {
          p_classroom_id: string
          p_cohort_id?: string
          p_duration_mins?: number
          p_lesson_id?: string
          p_schedule_id?: string
        }
        Returns: {
          classroom_id: string
          closed_at: string | null
          code: string
          code_expires_at: string
          cohort_id: string | null
          created_at: string
          duration_mins: number
          generated_by: string | null
          id: string
          lesson_id: string | null
          schedule_id: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_class_schedule: {
        Args: {
          p_classroom_id: string
          p_cohort_id?: string
          p_days_of_week: number[]
          p_end_date: string
          p_end_time: string
          p_module_id: string
          p_start_date: string
          p_start_time: string
        }
        Returns: {
          end_time: string
          id: string
          scheduled_date: string
          start_time: string
          title: string
        }[]
      }
      generate_cohort_schedule:
        | {
            Args: {
              p_cohort_id: string
              p_days: string[]
              p_end_time: string
              p_instructor_id?: string
              p_start_time: string
            }
            Returns: number
          }
        | {
            Args: {
              p_cohort_id: string
              p_days: string[]
              p_end_time: string
              p_instructor_id?: string
              p_start_time: string
            }
            Returns: number
          }
      get_assignment_hub_id: {
        Args: { p_assignment_id: string }
        Returns: string
      }
      get_classroom_curricula: {
        Args: { p_classroom_id: string }
        Returns: Json
      }
      get_classroom_curricula_trees: {
        Args: { p_classroom_id: string }
        Returns: Json
      }
      get_classroom_hub_id: {
        Args: { p_classroom_id: string }
        Returns: string
      }
      get_classroom_lesson_options: {
        Args: { p_classroom_id: string }
        Returns: {
          curriculum_id: string
          curriculum_title: string
          lesson_id: string
          lesson_title: string
          module_id: string
          module_title: string
          track_id: string
          track_title: string
          unit_id: string
          unit_title: string
        }[]
      }
      get_classroom_schedules: {
        Args: { p_classroom_id: string }
        Returns: Json
      }
      get_classroom_scope_options: {
        Args: { p_classroom_id: string }
        Returns: Json
      }
      get_classroom_staff_hub_id: { Args: { p_cs_id: string }; Returns: string }
      get_classroom_students: {
        Args: { p_classroom_id: string }
        Returns: {
          cohort_id: string
          cohort_label: string
          email: string
          enrollment_status: string
          full_name: string
          id: string
          user_id: string
        }[]
      }
      get_cohort_analytics: { Args: { p_cohort_id: string }; Returns: Json }
      get_cohort_classroom_hub_id: {
        Args: { p_cohort_id: string }
        Returns: string
      }
      get_cohort_members: {
        Args: { p_cohort_id: string }
        Returns: {
          cohort_id: string
          email: string
          enrollment_id: string
          full_name: string
          id: string
          joined_at: string
          status: string
          student_id: string
        }[]
      }
      get_curriculum_hub_id: {
        Args: { p_curriculum_id: string }
        Returns: string
      }
      get_curriculum_tree: { Args: { p_curriculum_id: string }; Returns: Json }
      get_curriculum_week_hub_id: { Args: { p_cw_id: string }; Returns: string }
      get_dashboard_stats: { Args: never; Returns: Json }
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
      get_enrollment_performance: {
        Args: { p_end_date?: string; p_months?: number; p_start_date?: string }
        Returns: {
          achievement_pct: number
          actual_count: number
          month: string
          target_count: number
          variance: number
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
      get_lesson_hub_id: { Args: { p_lesson_id: string }; Returns: string }
      get_my_hub_context: {
        Args: never
        Returns: {
          hub_id: string
          hub_name: string
          hub_slug: string
        }[]
      }
      get_my_hub_id: { Args: never; Returns: string }
      get_staff_names: {
        Args: { p_ids: string[] }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_student_progress: {
        Args: { p_cohort_id: string; p_student_id: string }
        Returns: Json
      }
      get_unit_lessons: {
        Args: { p_unit_id: string }
        Returns: {
          content: string
          external_link: string
          id: string
          objectives: string
          order_index: number
          resources: Json
          title: string
          unit_id: string
          video_url: string
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
      invoice_in_my_hub: { Args: { _invoice_id: string }; Returns: boolean }
      invoice_is_mine: { Args: { _invoice_id: string }; Returns: boolean }
      is_superadmin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
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
      list_hubs: {
        Args: never
        Returns: {
          id: string
          name: string
          slug: string
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
      list_staff_users: {
        Args: never
        Returns: {
          classrooms: string[]
          email: string
          full_name: string
          user_id: string
        }[]
      }
      mark_attendance: {
        Args: { p_code: string; p_student_lat?: number; p_student_lng?: number }
        Returns: {
          attendance_status: string
          classroom_id: string
          cohort_id: string | null
          distance_metres: number | null
          enrollment_id: string | null
          geofence_passed: boolean | null
          id: string
          lesson_id: string | null
          marked_at: string
          method: string
          schedule_id: string | null
          session_id: string
          student_id: string
          student_lat: number | null
          student_lng: number | null
        }
        SetofOptions: {
          from: "*"
          to: "attendance_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      module_classroom_id: { Args: { _module_id: string }; Returns: string }
      post_recurring_expense: {
        Args: { p_id: string; p_payment_date?: string }
        Returns: string
      }
      post_recurring_income: {
        Args: { p_id: string; p_payment_date?: string }
        Returns: string
      }
      presentation_classroom_id: {
        Args: { _presentation_id: string }
        Returns: string
      }
      promote_staff_to_admin: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      reject_invoice_change: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: undefined
      }
      reject_staff_invoice: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      remove_student_from_cohort: { Args: { p_id: string }; Returns: undefined }
      request_invoice_change: {
        Args: { p_action: string; p_invoice_id: string; p_payload: Json }
        Returns: string
      }
      revoke_admin: { Args: { p_email: string }; Returns: undefined }
      run_cohort_graduation_sweep: { Args: never; Returns: undefined }
      set_graduation_override: {
        Args: {
          p_cohort_student_id: string
          p_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      staff_mark_attendance_manual: {
        Args: { p_session_id: string; p_status?: string; p_student_id: string }
        Returns: {
          attendance_status: string
          classroom_id: string
          cohort_id: string | null
          distance_metres: number | null
          enrollment_id: string | null
          geofence_passed: boolean | null
          id: string
          lesson_id: string | null
          marked_at: string
          method: string
          schedule_id: string | null
          session_id: string
          student_id: string
          student_lat: number | null
          student_lng: number | null
        }
        SetofOptions: {
          from: "*"
          to: "attendance_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stop_recurring_income: { Args: { p_id: string }; Returns: undefined }
      submit_enrollment_fields: {
        Args: { p_enrollment_id: string; p_fields: Json }
        Returns: undefined
      }
      switch_hub_context: { Args: { p_hub_id: string }; Returns: undefined }
      switch_student_classroom: {
        Args: {
          p_from_classroom_id: string
          p_reason?: string
          p_student_id: string
          p_to_classroom_id: string
          p_to_cohort_id?: string
        }
        Returns: undefined
      }
      track_classroom_id: { Args: { _track_id: string }; Returns: string }
      unit_classroom_id: { Args: { _unit_id: string }; Returns: string }
      upsert_enrollment_target: {
        Args: { p_month: string; p_notes?: string; p_target_count: number }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "student" | "organization" | "staff"
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
      app_role: ["admin", "student", "organization", "staff"],
    },
  },
} as const
