
-- Reminders log table
CREATE TABLE public.reminders_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approver_user_id uuid NOT NULL,
  memo_ids uuid[] NOT NULL DEFAULT '{}',
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivery_method text NOT NULL DEFAULT 'in_app',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reminders_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view reminders log" ON public.reminders_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service insert reminders log" ON public.reminders_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- KPI SLA settings table (single row config)
CREATE TABLE public.kpi_sla_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_hours integer NOT NULL DEFAULT 48,
  reminder_time_hour integer NOT NULL DEFAULT 8,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.kpi_sla_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage SLA settings" ON public.kpi_sla_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read SLA settings" ON public.kpi_sla_settings
  FOR SELECT TO authenticated
  USING (true);

-- Seed default SLA settings
INSERT INTO public.kpi_sla_settings (sla_hours, reminder_time_hour) VALUES (48, 8);

-- Add index on notifications for fast unread queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read);
