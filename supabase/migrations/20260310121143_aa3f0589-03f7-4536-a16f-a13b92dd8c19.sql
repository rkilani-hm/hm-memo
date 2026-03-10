
-- 1. Create step action type enum
CREATE TYPE public.step_action_type AS ENUM ('signature', 'initial', 'review', 'acknowledge');

-- 2. Add initials_image_url to profiles
ALTER TABLE public.profiles ADD COLUMN initials_image_url text;

-- 3. Add action_type, parallel_group, is_required, deadline to approval_steps
ALTER TABLE public.approval_steps 
  ADD COLUMN action_type public.step_action_type NOT NULL DEFAULT 'signature',
  ADD COLUMN parallel_group integer,
  ADD COLUMN is_required boolean NOT NULL DEFAULT true,
  ADD COLUMN deadline timestamp with time zone;
