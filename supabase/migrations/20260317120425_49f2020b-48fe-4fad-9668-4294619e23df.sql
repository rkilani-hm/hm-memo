
-- Add revision_count to memos for tracking resubmissions
ALTER TABLE public.memos ADD COLUMN IF NOT EXISTS revision_count integer NOT NULL DEFAULT 0;

-- Add stage_level to approval_steps for labeling L1/L2a/L2b/L3/L4
ALTER TABLE public.memos ADD COLUMN IF NOT EXISTS stage_level text NULL;

-- Wait, stage_level goes on approval_steps not memos
ALTER TABLE public.approval_steps ADD COLUMN IF NOT EXISTS stage_level text NULL;

-- Drop the wrong one
ALTER TABLE public.memos DROP COLUMN IF EXISTS stage_level;
