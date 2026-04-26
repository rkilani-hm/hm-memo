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
          id: string
          is_required: boolean
          memo_id: string
          mfa_auth_time: string | null
          mfa_method: string | null
          mfa_provider: string | null
          mfa_token_jti: string | null
          mfa_verified: boolean | null
          mfa_verified_at: string | null
          parallel_group: number | null
          password_verified: boolean | null
          registered_by_user_id: string | null
          registration_notes: string | null
          scan_attachment_url: string | null
          signature_image_url: string | null
          signed_at: string | null
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
          id?: string
          is_required?: boolean
          memo_id: string
          mfa_auth_time?: string | null
          mfa_method?: string | null
          mfa_provider?: string | null
          mfa_token_jti?: string | null
          mfa_verified?: boolean | null
          mfa_verified_at?: string | null
          parallel_group?: number | null
          password_verified?: boolean | null
          registered_by_user_id?: string | null
          registration_notes?: string | null
          scan_attachment_url?: string | null
          signature_image_url?: string | null
          signed_at?: string | null
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
          id?: string
          is_required?: boolean
          memo_id?: string
          mfa_auth_time?: string | null
          mfa_method?: string | null
          mfa_provider?: string | null
          mfa_token_jti?: string | null
          mfa_verified?: boolean | null
          mfa_verified_at?: string | null
          parallel_group?: number | null
          password_verified?: boolean | null
          registered_by_user_id?: string | null
          registration_notes?: string | null
          scan_attachment_url?: string | null
          signature_image_url?: string | null
          signed_at?: string | null
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
        }
        Insert: {
          assigned_by_user_id: string
          created_at?: string
          delegate_user_id: string
          id?: string
          is_active?: boolean
          principal_user_id: string
          revoked_at?: string | null
        }
        Update: {
          assigned_by_user_id?: string
          created_at?: string
          delegate_user_id?: string
          id?: string
          is_active?: boolean
          principal_user_id?: string
          revoked_at?: string | null
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
        ]
      }
      memos: {
        Row: {
          action_comments: string | null
          continuation_pages: number | null
          copies_to: string[] | null
          created_at: string
          current_step: number | null
          date: string
          department_id: string
          description: string | null
          from_user_id: string
          id: string
          initials: string | null
          memo_types: Database["public"]["Enums"]["memo_type"][]
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
          current_step?: number | null
          date?: string
          department_id: string
          description?: string | null
          from_user_id: string
          id?: string
          initials?: string | null
          memo_types?: Database["public"]["Enums"]["memo_type"][]
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
          current_step?: number | null
          date?: string
          department_id?: string
          description?: string | null
          from_user_id?: string
          id?: string
          initials?: string | null
          memo_types?: Database["public"]["Enums"]["memo_type"][]
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
        ]
      }
    }
    Functions: {
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
      is_memo_owner: {
        Args: { _memo_id: string; _user_id: string }
        Returns: boolean
      }
      is_same_department: {
        Args: { _dept_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "department_head" | "staff" | "approver"
      approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "rework"
        | "skipped"
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
      app_role: ["admin", "department_head", "staff", "approver"],
      approval_status: ["pending", "approved", "rejected", "rework", "skipped"],
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
    },
  },
} as const
