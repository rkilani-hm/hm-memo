-- Fix memo HM/IT-IM/0046/2026 approval steps to match the workflow template selected by user.
-- Previous deployed submit-memo had a bug that dropped Rami (step 1) and inserted a duplicate Mohamed step.
-- This rebuilds the 4 steps in the correct order.

DO $$
DECLARE
  _memo_id uuid := '5da5ecf9-3a4c-4e0a-a75c-0af8fa9720c5';
BEGIN
  DELETE FROM public.approval_steps WHERE memo_id = _memo_id;

  INSERT INTO public.approval_steps
    (memo_id, approver_user_id, step_order, status, action_type, is_required, is_dispatcher, deadline)
  VALUES
    -- Step 1: Rami Kilani — Department Manager signature
    (_memo_id, '1c4f982a-4b97-4b74-92df-1a13405dff9f', 1, 'pending', 'signature', true, false, '2026-04-29 21:00:00+00'),
    -- Step 2: Mohamed Abdeldayem — Finance dispatcher (initial)
    (_memo_id, '230d19af-af38-474c-9bc8-4686ba55fd4c', 2, 'pending', 'initial',   true, true,  '2026-04-29 21:00:00+00'),
    -- Step 3: Hassan Badreddine — Finance Manager signature
    (_memo_id, '3913668d-16e3-40bd-9db2-c0cac11642c6', 3, 'pending', 'signature', true, false, NULL),
    -- Step 4: Kinan Mardini — IT Director signature
    (_memo_id, '2509089d-43f3-41a2-b9d7-d9033c5c064b', 4, 'pending', 'signature', true, false, NULL);

  -- Reset memo state to point at first step
  UPDATE public.memos
     SET status = 'in_review', current_step = 1
   WHERE id = _memo_id;
END $$;