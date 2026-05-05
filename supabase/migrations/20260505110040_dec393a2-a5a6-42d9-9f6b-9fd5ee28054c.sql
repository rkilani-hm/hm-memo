-- Backfill memos.created_by_user_id from audit_log
-- For each memo missing created_by_user_id, find the earliest audit_log entry
-- with action 'memo_drafted' or 'memo_submitted' and use that user_id.

WITH creator_candidates AS (
  SELECT DISTINCT ON (al.memo_id)
    al.memo_id,
    al.user_id,
    al.created_at
  FROM public.audit_log al
  WHERE al.memo_id IS NOT NULL
    AND al.user_id IS NOT NULL
    AND al.action IN ('memo_drafted', 'memo_submitted')
  ORDER BY al.memo_id, al.created_at ASC
)
UPDATE public.memos m
SET created_by_user_id = cc.user_id
FROM creator_candidates cc
WHERE m.id = cc.memo_id
  AND m.created_by_user_id IS NULL;

-- Fallback: for any memos still without a creator, use from_user_id
UPDATE public.memos
SET created_by_user_id = from_user_id
WHERE created_by_user_id IS NULL
  AND from_user_id IS NOT NULL;