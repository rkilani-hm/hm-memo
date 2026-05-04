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
      approval_steps: {
        Row: {
          action_type: Database["public"]["Enums"]["step_action_type"]
          approver_user_id: string
          comments: string | null
          created_at: string
          date_of_physical_signing: string | null
          deadline: string | null
          dispatched_at: string | null
          dispatched_notes: string | null
          dispatched_to_user_ids: string[] | null
          id: string
          is_dispatcher: boolean
          is_required: boolean
          memo_id: string
          mfa_auth_time: string | null
          mfa_method: string | null
          mfa_provider: string | null
          mfa_token_jti: string | null
          mfa_verified: boolean | null
          mfa_verified_at: string | null
          parallel_group: number | null
          parent_dispatch_step_id: string | null
          password_verified: boolean | null
          registered_by_user_id: string | null
          registration_notes: string | null
          scan_attachment_url: string | null
          signature_image_url: string | null
          signed_at: string | null
          signer_roles_at_signing: Json | null
          signing_method: string | null
          stage_level: string | null
          status: Database["public"]["Enums"]["approval_status"]
          step_order: number
          updated_at: string
        }
        Insert: {
          action_type?: Database["public"]["Enums"]["step_action_type"]
          approver_user_id: string
          comments?: string | null
          created_at?: string
          date_of_physical_signing?: string | null
          deadline?: string | null
          dispatched_at?: string | null
          dispatched_notes?: string | null
          dispatched_to_user_ids?: string[] | null
          id?: string
          is_dispatcher?: boolean
          is_required?: boolean
          memo_id: string
          mfa_auth_time?: string | null
          mfa_method?: string | null
          mfa_provider?: string | null
          mfa_token_jti?: string | null
          mfa_verified?: boolean | null
          mfa_verified_at?: string | null
          parallel_group?: number | null
          parent_dispatch_step_id?: string | null
          password_verified?: boolean | null
          registered_by_user_id?: string | null
          registration_notes?: string | null
          scan_attachment_url?: string | null
          signature_image_url?: string | null
          signed_at?: string | null
          signer_roles_at_signing?: Json | null
          signing_method?: string | null
          stage_level?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          step_order: number
          updated_at?: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["step_action_type"]
          approver_user_id?: string
          comments?: string | null
          created_at?: string
          date_of_physical_signing?: string | null
          deadline?: string | null
          dispatched_at?: string | null
          dispatched_notes?: string | null
          dispatched_to_user_ids?: string[] | null
          id?: string
          is_dispatcher?: boolean
          is_required?: boolean
          memo_id?: string
          mfa_auth_time?: string | null
          mfa_method?: string | null
          mfa_provider?: string | null
          mfa_token_jti?: string | null
          mfa_verified?: boolean | null
          mfa_verified_at?: string | null
          parallel_group?: number | null
          parent_dispatch_step_id?: string | null
          password_verified?: boolean | null
          registered_by_user_id?: string | null
          registration_notes?: string | null
          scan_attachment_url?: string | null
          signature_image_url?: string | null
          signed_at?: string | null
          signer_roles_at_signing?: Json | null
          signing_method?: string | null
          stage_level?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          step_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_payment_handoff_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_parent_dispatch_step_id_fkey"
            columns: ["parent_dispatch_step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          action_detail: string | null
          browser: string | null
          created_at: string
          details: Json | null
          device_type: string | null
          id: string
          ip_address: string | null
          ip_geolocation_city: string | null
          ip_geolocation_country: string | null
          memo_id: string | null
          new_status: string | null
          notes: string | null
          on_behalf_of_name: string | null
          on_behalf_of_user_id: string | null
          os: string | null
          password_verified: boolean | null
          previous_status: string | null
          scan_attachment_url: string | null
          session_id: string | null
          signing_method: string | null
          transmittal_no: string | null
          user_agent_raw: string | null
          user_id: string
        }
        Insert: {
          action: string
          action_detail?: string | null
          browser?: string | null
          created_at?: string
          details?: Json | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          ip_geolocation_city?: string | null
          ip_geolocation_country?: string | null
          memo_id?: string | null
          new_status?: string | null
          notes?: string | null
          on_behalf_of_name?: string | null
          on_behalf_of_user_id?: string | null
          os?: string | null
          password_verified?: boolean | null
          previous_status?: string | null
          scan_attachment_url?: string | null
          session_id?: string | null
          signing_method?: string | null
          transmittal_no?: string | null
          user_agent_raw?: string | null
          user_id: string
        }
        Update: {
          action?: string
          action_detail?: string | null
          browser?: string | null
          created_at?: string
          details?: Json | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          ip_geolocation_city?: string | null
          ip_geolocation_country?: string | null
          memo_id?: string | null
          new_status?: string | null
          notes?: string | null
          on_behalf_of_name?: string | null
          on_behalf_of_user_id?: string | null
          os?: string | null
          password_verified?: boolean | null
          previous_status?: string | null
          scan_attachment_url?: string | null
          session_id?: string | null
          signing_method?: string | null
          transmittal_no?: string | null
          user_agent_raw?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_payment_handoff_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_department_rules: {
        Row: {
          access_level: string
          created_at: string
          id: string
          is_active: boolean
          memo_type_filter: Database["public"]["Enums"]["memo_type"][]
          name: string
          scope: string
          source_department_ids: string[]
          updated_at: string
          viewer_department_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          id?: string
          is_active?: boolean
          memo_type_filter?: Database["public"]["Enums"]["memo_type"][]
          name: string
          scope?: string
          source_department_ids?: string[]
          updated_at?: string
          viewer_department_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
          is_active?: boolean
          memo_type_filter?: Database["public"]["Enums"]["memo_type"][]
          name?: string
          scope?: string
          source_department_ids?: string[]
          updated_at?: string
          viewer_department_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cross_department_rules_viewer_department_id_fkey"
            columns: ["viewer_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      delegate_assignments: {
        Row: {
          assigned_by_user_id: string
          created_at: string
          delegate_user_id: string
          id: string
          is_active: boolean
          principal_user_id: string
          revoked_at: string | null
          scope: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          assigned_by_user_id: string
          created_at?: string
          delegate_user_id: string
          id?: string
          is_active?: boolean
          principal_user_id: string
          revoked_at?: string | null
          scope?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          assigned_by_user_id?: string
          created_at?: string
          delegate_user_id?: string
          id?: string
          is_active?: boolean
          principal_user_id?: string
          revoked_at?: string | null
          scope?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      department_permissions: {
        Row: {
          created_at: string
          department_id: string
          id: string
          is_allowed: boolean
          resource_key: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          is_allowed?: boolean
          resource_key: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          is_allowed?: boolean
          resource_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_permissions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          head_user_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          head_user_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          head_user_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_reminder_settings: {
        Row: {
          id: string
          notify_procurement: boolean
          notify_vendor: boolean
          reminder_days: number[]
          updated_at: string
        }
        Insert: {
          id?: string
          notify_procurement?: boolean
          notify_vendor?: boolean
          reminder_days?: number[]
          updated_at?: string
        }
        Update: {
          id?: string
          notify_procurement?: boolean
          notify_vendor?: boolean
          reminder_days?: number[]
          updated_at?: string
        }
        Relationships: []
      }
      document_types: {
        Row: {
          ai_check_hints: string | null
          code: string
          created_at: string
          description_ar: string | null
          description_en: string | null
          display_order: number
          has_expiry: boolean
          id: string
          is_active: boolean
          label_ar: string
          label_en: string
        }
        Insert: {
          ai_check_hints?: string | null
          code: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          has_expiry?: boolean
          id?: string
          is_active?: boolean
          label_ar: string
          label_en: string
        }
        Update: {
          ai_check_hints?: string | null
          code?: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          has_expiry?: boolean
          id?: string
          is_active?: boolean
          label_ar?: string
          label_en?: string
        }
        Relationships: []
      }
      fraud_settings: {
        Row: {
          azure_authority_url: string | null
          azure_client_id: string | null
          azure_tenant_id: string | null
          block_high_severity: boolean
          duplicate_lookback_days: number
          enabled: boolean
          id: number
          mfa_required_for_high_risk: boolean
          mfa_required_for_payments: boolean
          scan_on_approval_view: boolean
          scan_on_submit: boolean
          split_threshold_kwd: number
          split_window_days: number
          updated_at: string
          updated_by: string | null
          vendor_new_threshold_days: number
        }
        Insert: {
          azure_authority_url?: string | null
          azure_client_id?: string | null
          azure_tenant_id?: string | null
          block_high_severity?: boolean
          duplicate_lookback_days?: number
          enabled?: boolean
          id?: number
          mfa_required_for_high_risk?: boolean
          mfa_required_for_payments?: boolean
          scan_on_approval_view?: boolean
          scan_on_submit?: boolean
          split_threshold_kwd?: number
          split_window_days?: number
          updated_at?: string
          updated_by?: string | null
          vendor_new_threshold_days?: number
        }
        Update: {
          azure_authority_url?: string | null
          azure_client_id?: string | null
          azure_tenant_id?: string | null
          block_high_severity?: boolean
          duplicate_lookback_days?: number
          enabled?: boolean
          id?: number
          mfa_required_for_high_risk?: boolean
          mfa_required_for_payments?: boolean
          scan_on_approval_view?: boolean
          scan_on_submit?: boolean
          split_threshold_kwd?: number
          split_window_days?: number
          updated_at?: string
          updated_by?: string | null
          vendor_new_threshold_days?: number
        }
        Relationships: []
      }
      kpi_sla_settings: {
        Row: {
          id: string
          reminder_time_hour: number
          sla_hours: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          reminder_time_hour?: number
          sla_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          reminder_time_hour?: number
          sla_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      memo_attachments: {
        Row: {
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          memo_id: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          memo_id: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          memo_id?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "memo_attachments_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_attachments_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_payment_handoff_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      memo_fraud_runs: {
        Row: {
          ai_summary: string | null
          attachments_scanned: number
          error_message: string | null
          finished_at: string | null
          high_count: number
          id: string
          low_count: number
          medium_count: number
          memo_id: string
          overall_risk: string | null
          raw_response: Json | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          ai_summary?: string | null
          attachments_scanned?: number
          error_message?: string | null
          finished_at?: string | null
          high_count?: number
          id?: string
          low_count?: number
          medium_count?: number
          memo_id: string
          overall_risk?: string | null
          raw_response?: Json | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          ai_summary?: string | null
          attachments_scanned?: number
          error_message?: string | null
          finished_at?: string | null
          high_count?: number
          id?: string
          low_count?: number
          medium_count?: number
          memo_id?: string
          overall_risk?: string | null
          raw_response?: Json | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memo_fraud_runs_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_fraud_runs_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_payment_handoff_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      memo_fraud_signals: {
        Row: {
          attachment_id: string | null
          created_at: string
          description: string | null
          detected_at: string
          evidence: Json | null
          id: string
          layer: string
          memo_id: string
          run_id: string | null
          severity: string
          signal_type: string
          title: string
        }
        Insert: {
          attachment_id?: string | null
          created_at?: string
          description?: string | null
          detected_at?: string
          evidence?: Json | null
          id?: string
          layer: string
          memo_id: string
          run_id?: string | null
          severity: string
          signal_type: string
          title: string
        }
        Update: {
          attachment_id?: string | null
          created_at?: string
          description?: string | null
          detected_at?: string
          evidence?: Json | null
          id?: string
          layer?: string
          memo_id?: string
          run_id?: string | null
          severity?: string
          signal_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "memo_fraud_signals_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "memo_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_fraud_signals_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_fraud_signals_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_payment_handoff_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      memo_sequences: {
        Row: {
          department_id: string
          id: string
          last_sequence: number
          year: number
        }
        Insert: {
          department_id: string
          id?: string
          last_sequence?: number
          year: number
        }
        Update: {
          department_id?: string
          id?: string
          last_sequence?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "memo_sequences_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      memo_versions: {
        Row: {
          changed_by_user_id: string
          changes: Json
          created_at: string
          id: string
          ip_address: string | null
          memo_id: string
          previous_values: Json
          user_agent: string | null
          version_number: number
        }
        Insert: {
          changed_by_user_id: string
          changes?: Json
          created_at?: string
          id?: string
          ip_address?: string | null
          memo_id: string
          previous_values?: Json
          user_agent?: string | null
          version_number: number
        }
        Update: {
          changed_by_user_id?: string
          changes?: Json
          created_at?: string
          id?: string
          ip_address?: string | null
          memo_id?: string
          previous_values?: Json
          user_agent?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "memo_versions_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_versions_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_payment_handoff_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      memos: {
        Row: {
          action_comments: string | null
          continuation_pages: number | null
          copies_to: string[] | null
          created_at: string
          created_by_user_id: string | null
          current_step: number | null
          date: string
          department_id: string
          description: string | null
          from_user_id: string
          id: string
          initials: string | null
          memo_types: Database["public"]["Enums"]["memo_type"][]
          originals_received_at: string | null
          originals_received_by: string | null
          originals_received_notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: string | null
          payment_notes: string | null
          payment_reference: string | null
          reviewer_user_id: string | null
          revision_count: number
          status: Database["public"]["Enums"]["memo_status"]
          subject: string
          to_user_id: string | null
          transmittal_no: string
          updated_at: string
          workflow_template_id: string | null
        }
        Insert: {
          action_comments?: string | null
          continuation_pages?: number | null
          copies_to?: string[] | null
          created_at?: string
          created_by_user_id?: string | null
          current_step?: number | null
          date?: string
          department_id: string
          description?: string | null
          from_user_id: string
          id?: string
          initials?: string | null
          memo_types?: Database["public"]["Enums"]["memo_type"][]
          originals_received_at?: string | null
          originals_received_by?: string | null
          originals_received_notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_reference?: string | null
          reviewer_user_id?: string | null
          revision_count?: number
          status?: Database["public"]["Enums"]["memo_status"]
          subject: string
          to_user_id?: string | null
          transmittal_no: string
          updated_at?: string
          workflow_template_id?: string | null
        }
        Update: {
          action_comments?: string | null
          continuation_pages?: number | null
          copies_to?: string[] | null
          created_at?: string
          created_by_user_id?: string | null
          current_step?: number | null
          date?: string
          department_id?: string
          description?: string | null
          from_user_id?: string
          id?: string
          initials?: string | null
          memo_types?: Database["public"]["Enums"]["memo_type"][]
          originals_received_at?: string | null
          originals_received_by?: string | null
          originals_received_notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_reference?: string | null
          reviewer_user_id?: string | null
          revision_count?: number
          status?: Database["public"]["Enums"]["memo_status"]
          subject?: string
          to_user_id?: string | null
          transmittal_no?: string
          updated_at?: string
          workflow_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memos_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memos_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          memo_id: string | null
          message: string
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          memo_id?: string | null
          message: string
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          memo_id?: string | null
          message?: string
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_payment_handoff_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_resources: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          label: string
          resource_key: string
          sort_order: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
          resource_key: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          resource_key?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          azure_ad_oid: string | null
          azure_ad_upn: string | null
          created_at: string
          department_id: string | null
          email: string
          force_password_reset: boolean
          full_name: string
          id: string
          initials: string | null
          initials_image_url: string | null
          is_active: boolean
          job_title: string | null
          print_blank_back_pages: boolean
          print_color_mode: string
          print_confidentiality_line: string | null
          print_duplex_mode: string
          print_include_attachments: boolean
          print_page_number_style: string
          print_watermark: boolean
          signature_image_url: string | null
          signature_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          azure_ad_oid?: string | null
          azure_ad_upn?: string | null
          created_at?: string
          department_id?: string | null
          email: string
          force_password_reset?: boolean
          full_name: string
          id?: string
          initials?: string | null
          initials_image_url?: string | null
          is_active?: boolean
          job_title?: string | null
          print_blank_back_pages?: boolean
          print_color_mode?: string
          print_confidentiality_line?: string | null
          print_duplex_mode?: string
          print_include_attachments?: boolean
          print_page_number_style?: string
          print_watermark?: boolean
          signature_image_url?: string | null
          signature_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          azure_ad_oid?: string | null
          azure_ad_upn?: string | null
          created_at?: string
          department_id?: string | null
          email?: string
          force_password_reset?: boolean
          full_name?: string
          id?: string
          initials?: string | null
          initials_image_url?: string | null
          is_active?: boolean
          job_title?: string | null
          print_blank_back_pages?: boolean
          print_color_mode?: string
          print_confidentiality_line?: string | null
          print_duplex_mode?: string
          print_include_attachments?: boolean
          print_page_number_style?: string
          print_watermark?: boolean
          signature_image_url?: string | null
          signature_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders_log: {
        Row: {
          approver_user_id: string
          created_at: string
          delivery_method: string
          id: string
          memo_ids: string[]
          sent_at: string
        }
        Insert: {
          approver_user_id: string
          created_at?: string
          delivery_method?: string
          id?: string
          memo_ids?: string[]
          sent_at?: string
        }
        Update: {
          approver_user_id?: string
          created_at?: string
          delivery_method?: string
          id?: string
          memo_ids?: string[]
          sent_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          is_allowed: boolean
          resource_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_allowed?: boolean
          resource_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_allowed?: boolean
          resource_key?: string
          user_id?: string
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
      vendor_attachments: {
        Row: {
          ai_analysed_at: string | null
          ai_findings: Json | null
          ai_model_used: string | null
          ai_rejection_reason: string | null
          ai_summary: string | null
          ai_verdict: Database["public"]["Enums"]["doc_ai_verdict"]
          document_type_id: string | null
          expiry_date: string | null
          expiry_source: string | null
          extracted_expiry_date: string | null
          file_mime_type: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          last_reminder_sent_at: string | null
          last_reminder_window: number | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          vendor_id: string
        }
        Insert: {
          ai_analysed_at?: string | null
          ai_findings?: Json | null
          ai_model_used?: string | null
          ai_rejection_reason?: string | null
          ai_summary?: string | null
          ai_verdict?: Database["public"]["Enums"]["doc_ai_verdict"]
          document_type_id?: string | null
          expiry_date?: string | null
          expiry_source?: string | null
          extracted_expiry_date?: string | null
          file_mime_type?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          last_reminder_sent_at?: string | null
          last_reminder_window?: number | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          vendor_id: string
        }
        Update: {
          ai_analysed_at?: string | null
          ai_findings?: Json | null
          ai_model_used?: string | null
          ai_rejection_reason?: string | null
          ai_summary?: string | null
          ai_verdict?: Database["public"]["Enums"]["doc_ai_verdict"]
          document_type_id?: string | null
          expiry_date?: string | null
          expiry_source?: string | null
          extracted_expiry_date?: string | null
          file_mime_type?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          last_reminder_sent_at?: string | null
          last_reminder_window?: number | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_attachments_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_attachments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_audit_log: {
        Row: {
          action: string
          actor_kind: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          notes: string | null
          vendor_id: string
        }
        Insert: {
          action: string
          actor_kind?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          vendor_id: string
        }
        Update: {
          action?: string
          actor_kind?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_audit_log_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_change_requests: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          id: string
          proposed_changes: Json
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sap_reference: string | null
          status: string
          submitted_at: string
          submitted_by_kind: string | null
          submitted_by_user_id: string | null
          vendor_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          id?: string
          proposed_changes: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sap_reference?: string | null
          status?: string
          submitted_at?: string
          submitted_by_kind?: string | null
          submitted_by_user_id?: string | null
          vendor_id: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          id?: string
          proposed_changes?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sap_reference?: string | null
          status?: string
          submitted_at?: string
          submitted_by_kind?: string | null
          submitted_by_user_id?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_change_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_document_requirements: {
        Row: {
          condition_label_ar: string | null
          condition_label_en: string | null
          display_order: number
          document_type_id: string
          id: string
          is_conditional: boolean
          is_required: boolean
          vendor_type_id: string
        }
        Insert: {
          condition_label_ar?: string | null
          condition_label_en?: string | null
          display_order?: number
          document_type_id: string
          id?: string
          is_conditional?: boolean
          is_required?: boolean
          vendor_type_id: string
        }
        Update: {
          condition_label_ar?: string | null
          condition_label_en?: string | null
          display_order?: number
          document_type_id?: string
          id?: string
          is_conditional?: boolean
          is_required?: boolean
          vendor_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_document_requirements_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_document_requirements_vendor_type_id_fkey"
            columns: ["vendor_type_id"]
            isOneToOne: false
            referencedRelation: "vendor_types"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_sap_events: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          error_message: string | null
          id: string
          kind: Database["public"]["Enums"]["vendor_sap_event_kind"]
          payload_snapshot: Json | null
          requested_at: string
          sap_reference: string | null
          status: Database["public"]["Enums"]["vendor_sap_event_status"]
          vendor_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          kind: Database["public"]["Enums"]["vendor_sap_event_kind"]
          payload_snapshot?: Json | null
          requested_at?: string
          sap_reference?: string | null
          status?: Database["public"]["Enums"]["vendor_sap_event_status"]
          vendor_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["vendor_sap_event_kind"]
          payload_snapshot?: Json | null
          requested_at?: string
          sap_reference?: string | null
          status?: Database["public"]["Enums"]["vendor_sap_event_status"]
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_sap_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          label_ar: string
          label_en: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          label_ar: string
          label_en: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          label_ar?: string
          label_en?: string
        }
        Relationships: []
      }
      vendor_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          user_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          user_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_users_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          attestation_accepted: boolean
          attestation_accepted_at: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_currency: string | null
          bank_iban: string | null
          bank_name: string | null
          bank_swift_bic: string | null
          blocked_reason: string | null
          city: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          contact_position: string | null
          country: string
          created_at: string
          created_by: string | null
          has_iso_qms: boolean | null
          has_tax_exemption: boolean | null
          id: string
          industry_activity: string | null
          iso_certifying_body: string | null
          legal_name_ar: string | null
          legal_name_en: string
          payment_terms_preference: string | null
          postal_code: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sap_account_group: string | null
          sap_company_code: string | null
          sap_created_at: string | null
          sap_created_by: string | null
          sap_creation_status: string | null
          sap_last_update_at: string | null
          sap_last_update_by: string | null
          sap_last_update_reference: string | null
          sap_purchasing_organization: string | null
          sap_vendor_code: string | null
          signatory_civil_id_or_passport: string | null
          signatory_name: string | null
          signatory_position: string | null
          state_region: string | null
          status: Database["public"]["Enums"]["vendor_status"]
          submitted_at: string | null
          tax_registration_no: string | null
          trading_name: string | null
          updated_at: string
          vendor_reference_no: string
          vendor_type_id: string
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          attestation_accepted?: boolean
          attestation_accepted_at?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_currency?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_swift_bic?: string | null
          blocked_reason?: string | null
          city?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          contact_position?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          has_iso_qms?: boolean | null
          has_tax_exemption?: boolean | null
          id?: string
          industry_activity?: string | null
          iso_certifying_body?: string | null
          legal_name_ar?: string | null
          legal_name_en: string
          payment_terms_preference?: string | null
          postal_code?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sap_account_group?: string | null
          sap_company_code?: string | null
          sap_created_at?: string | null
          sap_created_by?: string | null
          sap_creation_status?: string | null
          sap_last_update_at?: string | null
          sap_last_update_by?: string | null
          sap_last_update_reference?: string | null
          sap_purchasing_organization?: string | null
          sap_vendor_code?: string | null
          signatory_civil_id_or_passport?: string | null
          signatory_name?: string | null
          signatory_position?: string | null
          state_region?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          submitted_at?: string | null
          tax_registration_no?: string | null
          trading_name?: string | null
          updated_at?: string
          vendor_reference_no: string
          vendor_type_id: string
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          attestation_accepted?: boolean
          attestation_accepted_at?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_currency?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_swift_bic?: string | null
          blocked_reason?: string | null
          city?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          contact_position?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          has_iso_qms?: boolean | null
          has_tax_exemption?: boolean | null
          id?: string
          industry_activity?: string | null
          iso_certifying_body?: string | null
          legal_name_ar?: string | null
          legal_name_en?: string
          payment_terms_preference?: string | null
          postal_code?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sap_account_group?: string | null
          sap_company_code?: string | null
          sap_created_at?: string | null
          sap_created_by?: string | null
          sap_creation_status?: string | null
          sap_last_update_at?: string | null
          sap_last_update_by?: string | null
          sap_last_update_reference?: string | null
          sap_purchasing_organization?: string | null
          sap_vendor_code?: string | null
          signatory_civil_id_or_passport?: string | null
          signatory_name?: string | null
          signatory_position?: string | null
          state_region?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          submitted_at?: string | null
          tax_registration_no?: string | null
          trading_name?: string | null
          updated_at?: string
          vendor_reference_no?: string
          vendor_type_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_vendor_type_id_fkey"
            columns: ["vendor_type_id"]
            isOneToOne: false
            referencedRelation: "vendor_types"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          is_default: boolean | null
          memo_type: Database["public"]["Enums"]["memo_type"] | null
          name: string
          pdf_layout: Json
          steps: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          is_default?: boolean | null
          memo_type?: Database["public"]["Enums"]["memo_type"] | null
          name: string
          pdf_layout?: Json
          steps?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          is_default?: boolean | null
          memo_type?: Database["public"]["Enums"]["memo_type"] | null
          name?: string
          pdf_layout?: Json
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_memo_fraud_summary: {
        Row: {
          high_count: number | null
          last_detected_at: string | null
          low_count: number | null
          medium_count: number | null
          memo_id: string | null
          run_id: string | null
          total_signals: number | null
        }
        Relationships: [
          {
            foreignKeyName: "memo_fraud_signals_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_fraud_signals_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_payment_handoff_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      v_payment_handoff_queue: {
        Row: {
          date: string | null
          department_id: string | null
          from_user_id: string | null
          handoff_stage: string | null
          id: string | null
          memo_types: Database["public"]["Enums"]["memo_type"][] | null
          originals_received_at: string | null
          originals_received_by: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: string | null
          payment_reference: string | null
          status: string | null
          subject: string | null
          transmittal_no: string | null
          updated_at: string | null
        }
        Insert: {
          date?: string | null
          department_id?: string | null
          from_user_id?: string | null
          handoff_stage?: never
          id?: string | null
          memo_types?: Database["public"]["Enums"]["memo_type"][] | null
          originals_received_at?: string | null
          originals_received_by?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          status?: never
          subject?: string | null
          transmittal_no?: string | null
          updated_at?: string | null
        }
        Update: {
          date?: string | null
          department_id?: string | null
          from_user_id?: string | null
          handoff_stage?: never
          id?: string | null
          memo_types?: Database["public"]["Enums"]["memo_type"][] | null
          originals_received_at?: string | null
          originals_received_by?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          status?: never
          subject?: string | null
          transmittal_no?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memos_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_diagnose_memo_visibility: {
        Args: never
        Returns: {
          caller_is_admin: boolean
          caller_user_id: string
          total_in_db: number
          visible_to_caller: number
        }[]
      }
      effective_finance_dispatcher: { Args: never; Returns: string }
      generate_vendor_reference: { Args: never; Returns: string }
      get_finance_reviewer_pool: {
        Args: never
        Returns: {
          email: string
          full_name: string
          is_active: boolean
          job_title: string
          roles: string[]
          user_id: string
        }[]
      }
      get_next_transmittal_no: { Args: { dept_id: string }; Returns: string }
      has_cross_dept_access:
        | {
            Args: {
              _memo_dept_id: string
              _memo_types: Database["public"]["Enums"]["memo_type"][]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _memo_id: string; _user_id: string }; Returns: boolean }
      has_permission: {
        Args: { _resource_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approver_for_memo: {
        Args: { _memo_id: string; _user_id: string }
        Returns: boolean
      }
      is_delegate_for: {
        Args: { _delegate_id: string; _principal_id: string }
        Returns: boolean
      }
      is_delegate_for_memo: {
        Args: { _delegate_id: string; _memo_id: string }
        Returns: boolean
      }
      is_dispatcher_parent_of_step: {
        Args: { _parent_step_id: string; _user_id: string }
        Returns: boolean
      }
      is_memo_owner: {
        Args: { _memo_id: string; _user_id: string }
        Returns: boolean
      }
      is_same_department: {
        Args: { _dept_id: string; _user_id: string }
        Returns: boolean
      }
      simulate_workflow_chain: {
        Args: { p_template_id: string }
        Returns: {
          action_type: string
          effective_approver_id: string
          effective_approver_name: string
          is_dispatcher: boolean
          label: string
          rewrite_reason: string
          step_order: number
          template_approver_id: string
          template_approver_name: string
          warnings: string[]
          was_rewritten: boolean
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "department_head"
        | "staff"
        | "approver"
        | "finance_dispatcher"
        | "finance_manager"
        | "ap_accountant"
        | "ar_accountant"
        | "budget_controller"
        | "finance"
        | "general_manager"
        | "ceo"
        | "vendor_reviewer"
        | "vendor_master_admin"
        | "vendor"
      approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "rework"
        | "skipped"
      doc_ai_verdict: "pending" | "accepted" | "rejected" | "soft_pending"
      memo_status:
        | "draft"
        | "submitted"
        | "in_review"
        | "approved"
        | "rejected"
        | "rework"
      memo_type:
        | "action"
        | "announcement"
        | "review_comments"
        | "payments"
        | "information"
        | "filing"
        | "use_return"
        | "request"
        | "other"
      step_action_type: "signature" | "initial" | "review" | "acknowledge"
      vendor_sap_event_kind: "creation" | "update"
      vendor_sap_event_status: "pending" | "completed" | "failed"
      vendor_status:
        | "draft"
        | "submitted"
        | "approved_pending_sap_creation"
        | "active_in_sap"
        | "update_submitted"
        | "update_approved_pending_sap_update"
        | "sap_update_completed"
        | "sap_update_failed_needs_correction"
        | "rejected"
        | "inactive"
        | "blocked_documents_expired"
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
      app_role: [
        "admin",
        "department_head",
        "staff",
        "approver",
        "finance_dispatcher",
        "finance_manager",
        "ap_accountant",
        "ar_accountant",
        "budget_controller",
        "finance",
        "general_manager",
        "ceo",
        "vendor_reviewer",
        "vendor_master_admin",
        "vendor",
      ],
      approval_status: ["pending", "approved", "rejected", "rework", "skipped"],
      doc_ai_verdict: ["pending", "accepted", "rejected", "soft_pending"],
      memo_status: [
        "draft",
        "submitted",
        "in_review",
        "approved",
        "rejected",
        "rework",
      ],
      memo_type: [
        "action",
        "announcement",
        "review_comments",
        "payments",
        "information",
        "filing",
        "use_return",
        "request",
        "other",
      ],
      step_action_type: ["signature", "initial", "review", "acknowledge"],
      vendor_sap_event_kind: ["creation", "update"],
      vendor_sap_event_status: ["pending", "completed", "failed"],
      vendor_status: [
        "draft",
        "submitted",
        "approved_pending_sap_creation",
        "active_in_sap",
        "update_submitted",
        "update_approved_pending_sap_update",
        "sap_update_completed",
        "sap_update_failed_needs_correction",
        "rejected",
        "inactive",
        "blocked_documents_expired",
      ],
    },
  },
} as const
