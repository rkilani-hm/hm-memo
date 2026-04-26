DROP VIEW IF EXISTS public.v_memo_fraud_summary;
CREATE VIEW public.v_memo_fraud_summary
WITH (security_invoker = true) AS
SELECT
  s.memo_id,
  s.run_id,
  COUNT(*)                                          AS total_signals,
  COUNT(*) FILTER (WHERE s.severity = 'high')       AS high_count,
  COUNT(*) FILTER (WHERE s.severity = 'medium')     AS medium_count,
  COUNT(*) FILTER (WHERE s.severity = 'low')        AS low_count,
  MAX(s.detected_at)                                AS last_detected_at
FROM public.memo_fraud_signals s
GROUP BY s.memo_id, s.run_id;