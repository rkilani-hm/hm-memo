
-- Add pdf_layout jsonb column to workflow_templates
ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS pdf_layout jsonb NOT NULL DEFAULT '{"signoff_step":null,"grid":[[null,null,null],[null,null,null]]}'::jsonb;

-- Add workflow_template_id to memos so we know which template was used for PDF layout
ALTER TABLE public.memos
  ADD COLUMN IF NOT EXISTS workflow_template_id uuid REFERENCES public.workflow_templates(id) ON DELETE SET NULL;
