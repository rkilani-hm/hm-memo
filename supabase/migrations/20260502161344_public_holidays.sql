-- =====================================================================
-- Public holidays table
--
-- Why
-- ===
-- The working-hours KPI metric (introduced in commit 002813f, used in
-- the "Time by department & stage" report) currently treats every
-- non-weekend day as a working day. This means the day after Eid,
-- National Day, Liberation Day, etc. all count as response time even
-- though everyone was off. The metric is meant to evaluate team
-- performance, so counting holidays as work time is actively misleading.
--
-- This migration adds a holidays table that admins maintain. The
-- working-hours helper already accepts an excludeDates set; the report
-- will fetch this table and pass it through.
--
-- Schema
-- ======
--   date         DATE  (primary key — one entry per holiday day)
--   name         TEXT  (display name, e.g. "Eid Al-Fitr Day 1")
--   description  TEXT  (optional notes — usually empty)
--   created_at   TIMESTAMPTZ
--   updated_at   TIMESTAMPTZ
--   created_by   UUID  (admin who added the entry, for audit)
--
-- Multi-day holidays are stored as one row per day. So Eid Al-Fitr
-- spanning three days = three rows. This keeps the math trivial in
-- the working-hours helper (a single date-key lookup per day).
--
-- RLS
-- ===
--   - Any authenticated user can SELECT. The report needs to read it,
--     and there's nothing sensitive about a holiday list.
--   - Only admins can INSERT / UPDATE / DELETE.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.public_holidays (
  date         DATE PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Updated-at trigger (matches pattern used elsewhere in the schema)
CREATE OR REPLACE FUNCTION public.public_holidays_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_holidays_updated_at ON public.public_holidays;
CREATE TRIGGER public_holidays_updated_at
  BEFORE UPDATE ON public.public_holidays
  FOR EACH ROW EXECUTE FUNCTION public.public_holidays_set_updated_at();

-- RLS
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read. The KPI report needs this; the data
-- is not sensitive.
CREATE POLICY "Authenticated users can view holidays"
  ON public.public_holidays
  FOR SELECT
  TO authenticated
  USING (true);

-- Admins manage (insert, update, delete).
CREATE POLICY "Admins manage holidays"
  ON public.public_holidays
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
