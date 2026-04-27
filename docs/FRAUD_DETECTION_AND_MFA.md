# Fraud Detection & Step-Up MFA — Implementation Notes

This document describes how attachment fraud detection and Microsoft Authenticator
step-up MFA work in the Al Hamra Memo application, what an administrator needs to
configure to turn them on, and the known limitations.

---

## Overview

Three deliverables ship together:

1. **AI agent now reads attachment contents.** Previously the AI summary only saw
   filenames and sizes; the new `memo-ai-summary` edge function downloads each
   PDF/image attachment and feeds it to Gemini 2.5 Flash as multimodal input,
   along with any fraud signals already on file.

2. **Fraud detection across three layers** — forensic, business, AI visual —
   surfaced in the approver's AI panel as a "Fraud & Authenticity" section.

3. **Step-up MFA via Microsoft Authenticator** — payment memos can be configured
   to require a fresh MFA challenge before the approver's signature is applied
   to the memo.

All three are gated by an admin settings page at **Admin → Fraud & MFA**.

---

## Database changes (migration `20260426102137_fraud_detection_and_mfa.sql`)

| Table / column | Purpose |
| --- | --- |
| `memo_fraud_signals` | One row per individual fraud finding (forensic / business / AI). Linked to memo + attachment + run. |
| `memo_fraud_runs`    | One row per fraud-check execution. Stores run-level aggregates and AI summary. |
| `fraud_settings`     | Single-row admin config (toggles, thresholds, Azure AD tenant/client IDs). |
| `approval_steps.mfa_*` | New columns `mfa_verified`, `mfa_verified_at`, `mfa_method`, `mfa_provider`, `mfa_token_jti`, `mfa_auth_time` written by the verify edge function. |
| `profiles.azure_ad_oid` | Binds a Supabase user to their Microsoft Entra ID `oid` so MFA tokens for the wrong account are rejected. |
| `v_memo_fraud_summary` | Helper view used by the UI to roll up signal counts. |

RLS:

- `memo_fraud_signals` and `memo_fraud_runs` — readable by the memo owner, by any
  approver of the memo, and by admins; only writable by the service role.
- `fraud_settings` — readable by any authenticated user (because the frontend
  needs `azure_tenant_id`/`azure_client_id` to initialise MSAL); writable only
  by admins.

After deploying this migration, regenerate the Supabase types:

```
supabase gen types typescript --project-id ndoyllcsqaxskcxmdxjc > src/integrations/supabase/types.ts
```

The frontend code uses `as any` casts on the new tables so it compiles cleanly
even before types are regenerated, but regenerating gives you proper IntelliSense.

---

## Edge functions

### `memo-ai-summary` (modified)

- Now downloads attachments from the `attachments` storage bucket and feeds
  PDFs/images to the model as `image_url` data-URL parts (OpenAI-compatible
  format on the Lovable AI gateway).
- Caps to 8 attachments per call, prioritises PDFs > images > other.
- Text-like attachments (`.txt`, `.csv`, `.json`) are decoded inline up to 4000
  chars.
- Reads up to 40 fraud signals already recorded for the memo and includes them
  in the prompt so the executive summary mentions any concerns.

### `memo-fraud-check` (new)

Three layers, one POST `{ memo_id }`:

**Layer A — Forensic (deterministic, no AI):**
- Magic-byte sniffing → mime mismatch detection
- PDF: `/Producer`, `/Creator`, `/CreationDate`, `/ModDate`, `/Title`, `/Author`
  - **`pdf_content_modified_after_creation` (HIGH — composite headline)**
    Fires when ANY of: incremental updates (multiple `startxref` + `%%EOF`),
    `CreationDate` ≠ `ModDate`, suspicious producer (Acrobat / PDFescape /
    SmallPDF / iLovePDF / Sejda / Foxit Phantom and similar editors not
    matched as legit ERPs), or edit-style annotations
    (`FreeText`/`Stamp`/`Highlight`/`Redact`/`Square`/`Caret`). All
    underlying indicators are listed inline in the signal description and
    in `evidence`. On payment memos, presence of this signal forces the
    overall risk to ≥ HIGH (≥ CRITICAL if two or more attachments show it).
  - Missing producer + creator → `pdf_no_producer` (low)
  - `/Launch` action → `pdf_launch_action` (high)
  - `/JavaScript` → `pdf_javascript` (medium)
  - `/EmbeddedFile` → `pdf_embedded_files` (low)
  - `/Type/Sig` + `/ByteRange` → `pdf_digital_signature_present` (info)
- JPEG: EXIF Make/Model/Software/DateTimeOriginal/ModifyDate via TIFF IFD walk
  - Editing software in EXIF Software/XMP → `image_edited_in_software` (high if no Make/Model, medium otherwise)
  - JPEG with no EXIF → `image_stripped_exif` (low)
  - Multiple APP1 segments → `image_multiple_app1` (low)
  - `ModifyDate` later than `DateTimeOriginal` → `image_modified_after_capture` (medium)
- PNG: IHDR dimensions, tEXt/iTXt chunks
- WEBP/GIF/TIFF: format detected, no deeper analysis

**Layer B — Business (deterministic SQL + AI extracted data):**
- Cross-memo duplicate attachment (same name + same size in lookback window)
  → `duplicate_attachment_filename_size` (medium)
- Submitter account younger than `vendor_new_threshold_days`
  → `submitter_account_new` (low)
- Largest extracted invoice total ≥ 0.85 × `split_threshold_kwd` and < threshold
  → `amount_just_below_threshold` (medium)

**Layer C — AI vision (Gemini 2.5 Flash multimodal):**
The model receives up to 8 PDFs/images plus the memo body and returns strict
JSON with:
- `extracted[]` — structured invoice/PO/DN/GRN data per attachment
- `math_check[]` — per-attachment subtotal+tax=total verification
- `cross_document[]` — vendor / currency / quantity / total consistency across docs
- `visual_tampering[]` — white overlays, font mismatch, misaligned digits, copy-move, smudge-overwrite
- `date_logic[]` — invoice date ≥ PO date, GRN date ≥ delivery, no Kuwait Fri/Sat dates on business documents
- `scope_consistency[]` — does the goods/service description match the memo's stated purpose
- `overall_assessment` — clean / low / medium / high / critical

Each AI finding becomes a signal of the corresponding severity.

**Aggregation:** the run row stores `high_count`, `medium_count`, `low_count`,
and an `overall_risk` of clean/low/medium/high/critical (the AI's own
overall_assessment can only escalate, not downgrade, the deterministic risk).

### `verify-mfa-and-sign` (new)

POST `{ id_token, memo_id, step_id }` from the frontend after MSAL acquires a
fresh MFA-asserted id_token. Validates:

1. JWT signature against Microsoft's public keys
   (`https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`, JWKS cached 1h)
2. `alg === RS256`
3. `exp`/`nbf`/`iat` sane
4. `aud === clientId`
5. `iss` is the expected Microsoft issuer for the tenant
6. `amr` contains `"mfa"` (proof MFA was actually performed)
7. `auth_time` within the last 5 minutes (proof of *fresh* MFA)
8. `jti` not previously used (replay defence — tracked in `approval_steps.mfa_token_jti`)
9. `oid` matches the approver's `profiles.azure_ad_oid` (binds Supabase identity ↔ Entra ID identity). On first use, the oid is auto-recorded to the profile.
10. The step is pending and assigned to the calling user.

On success, writes `mfa_verified=true`, `mfa_method`, `mfa_provider='azure_ad'`,
`mfa_token_jti`, `mfa_auth_time`, plus an `audit_log` entry with `action='mfa_verified_for_approval'`.

The actual signature image is then uploaded by the existing approval-update
mutation in `PendingApprovals.tsx`, which now refuses to apply the signature for
payment memos unless this verification has just succeeded.

---

## Required Supabase secrets

In addition to the existing keys, set whichever AI provider(s) you want to use:

| Secret | Required for | Notes |
| --- | --- | --- |
| `LOVABLE_API_KEY` | Lovable AI provider | Already set if you previously used Lovable AI. |
| `OPENAI_API_KEY` | OpenAI AI provider (new) | Enterprise OpenAI API key. Required if `ai_provider` = openai or openai_then_lovable. |
| `AZURE_TENANT_ID` | `verify-mfa-and-sign` | Optional — falls back to `fraud_settings.azure_tenant_id`. |
| `AZURE_CLIENT_ID` | `verify-mfa-and-sign` | Optional — falls back to `fraud_settings.azure_client_id`. |

At least ONE of `LOVABLE_API_KEY` or `OPENAI_API_KEY` must be set or the
edge functions will refuse to start.

## AI provider configuration

The admin page (Admin → Fraud & MFA → AI Provider section) lets you pick
which AI powers `memo-ai-summary` and `memo-fraud-check`:

- **OpenAI (your enterprise API key)** — uses `OPENAI_API_KEY`. Best
  pick if you have an enterprise ChatGPT subscription, since it counts
  against your existing quota rather than the Lovable Cloud meter.
  Defaults: summary uses `gpt-4o-mini`, fraud-check vision uses `gpt-4o`.
- **Lovable Cloud (default)** — uses `LOVABLE_API_KEY`. Default model
  is `google/gemini-2.5-flash`.
- **OpenAI → Lovable fallback** — tries OpenAI first; if OpenAI
  rate-limits, errors, or its quota is exhausted, automatically retries
  on Lovable. Recommended setting when you want OpenAI as primary but
  don't want a single OpenAI hiccup to break a fraud scan.

**Per-call model override.** The admin page also exposes optional model
overrides — `ai_model_summary` and `ai_model_fraud`. Leave blank to use
each provider's default. Setting them is useful for cost tuning
(e.g. force `gpt-4o-mini` everywhere on OpenAI to save money on the
vision pass).

**Auditability.** Each fraud run row records which provider actually
answered (`memo_fraud_runs.ai_provider_used`, `ai_model_used`) — so when
fallback fired, you have an audit trail.

---

## Azure AD (Entra ID) setup checklist

Have your IT admin do this **before** enabling MFA in fraud settings:

1. **Register an application** in Microsoft Entra ID
   - Name: e.g. `Al Hamra Memo Approvals`
   - Account type: *Single tenant*
   - Redirect URI: *Single-page application (SPA)* —
     - `https://<your-app-domain>/`  (production)
     - `http://localhost:8080/`      (local dev, optional)

2. **API permissions** (Microsoft Graph):
   - `openid`, `profile`, `email`, `User.Read` (delegated). All admin consent.

3. **Token configuration → Optional claims**
   - Add `acr` and `auth_time` to the **ID token** (essential — the verify
     function depends on these claims being present).

4. **Conditional Access policy** (Entra ID → Conditional Access)
   - Assignments → Cloud apps → select the app you registered
   - Conditions → leave defaults
   - Access controls → Grant → *Require multi-factor authentication* (or
     "Authentication strength: MFA" / "Phishing-resistant MFA" if you have a
     P2 license and want stronger guarantees)
   - Enable the policy

5. **Provide the Tenant ID and Application (client) ID** to a memo-app admin.
   They will paste them into Admin → Fraud & MFA → Microsoft Authenticator
   section, OR (recommended) you store them as Supabase secrets
   `AZURE_TENANT_ID` and `AZURE_CLIENT_ID`.

6. **First-time approver onboarding.** Each approver must have a Microsoft
   account in your tenant matching their app email and have the Microsoft
   Authenticator app enrolled. The first MFA approval auto-binds their Azure
   `oid` to their `profiles.azure_ad_oid` row; subsequent approvals will reject
   any token from a different Microsoft account.

---

## Frontend behaviour

### AI panel (`AiApprovalSummary.tsx` + `FraudCheckPanel.tsx`)

- The fraud panel sits directly under the executive summary.
- States:
  - No scan yet → "Run scan" button (one-click).
  - Running → spinner + "Inspecting attachments…"
  - Clean → green shield, "No fraud indicators detected".
  - Has signals → tabs (All / Memo-level / per-attachment) with severity-coloured signal cards; each card has an expandable evidence JSON.
- "Re-scan" re-runs the edge function and replaces the latest run.

### Approve dialog (`PendingApprovals.tsx`)

For payment memos with `mfa_required_for_payments=true`:
- A **MfaStepUp** component appears between the signature pad and the password field.
- Clicking *Verify with Microsoft Authenticator* triggers `acquireTokenPopup` with
  `prompt=login`, `acr=c1`, `acr_values=urn:microsoft:policies:mfa`, `max_age=0` —
  forcing a fresh challenge regardless of session state.
- The verify-mfa-and-sign edge function validates the returned token and writes
  the proof on the approval_steps row.
- The Approve button stays disabled until MFA verification succeeds.
- The mutation in PendingApprovals also refuses to apply the signature if MFA
  was required but not verified — defence in depth.

### Admin settings (`/admin/fraud-settings`)

- **Fraud Scanner**: master enable, scan-on-submit, scan-on-view, ack-required-on-high.
- **Detection Thresholds**: lookback window, split-purchase threshold, split window, new-submitter threshold.
- **MFA**: required-for-payments, required-for-high-risk, tenant ID, client ID, optional authority URL.

---

## Known limitations

1. **Duplicate detection uses `file_name + file_size`**, not SHA-256. A future
   improvement is adding a `sha256` column to `memo_attachments` and indexing
   on it. For now, identical re-uploads with renamed filenames are not caught.

2. **PDF text extraction** during forensic analysis is regex-based pattern
   scanning. It catches `/Producer`, signatures, JS, embedded files, etc., but
   it is not a full PDF parser. Highly compressed object streams won't be
   inspected (the AI vision pass mitigates this).

3. **OpenAI-compat PDF support** depends on the Lovable AI gateway. If the
   gateway rejects PDFs as `image_url`, the fallback is to render PDFs to
   images (would need `pdfjs-dist` in the edge function — not currently
   shipped). Images always work.

4. **Attachment cap** is 8 PDFs/images per AI call to keep cost predictable.
   Memos with more attachments still get all of them analysed for forensic
   metadata; only the AI vision pass is capped.

5. **15 MB per file cap** to keep edge-function memory bounded. Files larger
   than this are skipped and noted in `skip_reasons`.

6. **MFA step-up is a popup**. Browsers with strict popup blockers may need
   the user to click again. We use `acquireTokenPopup` rather than `redirect`
   so the approver doesn't lose dialog state — but redirect is a fallback if
   needed in future.

7. **Once the memo PDF is rendered/printed**, the signature image is read from
   `signature_image_url`. There is no separate "do not embed signature unless
   MFA was verified" check on the print path — the assumption is that the
   approval mutation in `PendingApprovals.tsx` is the only writer of
   `signature_image_url`, and it now refuses to write it without MFA when
   policy requires it. If your team adds another write path (e.g. manual
   registration) it will need the same gate.

---

## Roll-out plan

1. Apply migration `20260426102137_fraud_detection_and_mfa.sql`.
2. Regenerate `src/integrations/supabase/types.ts`.
3. Run `npm install` to bring in `@azure/msal-browser`.
4. Deploy the three edge functions:
   - `memo-ai-summary` (replace existing)
   - `memo-fraud-check` (new)
   - `verify-mfa-and-sign` (new)
5. Open Admin → Fraud & MFA, enable the scanner, save.
6. (Optional, recommended) Set `AZURE_TENANT_ID` and `AZURE_CLIENT_ID`
   secrets in Supabase.
7. Open a memo with attachments → AI panel → "Run scan" to verify everything works.
8. Once happy, enable `mfa_required_for_payments` and have one finance approver
   try a payment-memo approval end-to-end.
