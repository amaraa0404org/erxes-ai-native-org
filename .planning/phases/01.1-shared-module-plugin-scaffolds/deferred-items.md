# Deferred Items — Phase 01.1

## Pre-existing TypeScript errors in `frontend/libs/erxes-ui/`

Discovered during Plan 01.1-03 Task 2 verification (running `tsc --noEmit -p frontend/plugins/ai_ui/tsconfig.app.json`).
These errors exist in the codebase BEFORE this plan's changes and are unrelated to the ai_ui scaffold.

**Files with pre-existing TS errors (not caused by this plan):**
- `frontend/libs/erxes-ui/src/components/charts.tsx` — recharts type mismatch (payload, label, item types, Legend prop omit)
- `frontend/libs/erxes-ui/src/components/date-picker.tsx` — duplicate JSX attribute
- `frontend/libs/erxes-ui/src/modules/blocks/components/ImageStyleButton.tsx` — blocknote prop type
- `frontend/libs/erxes-ui/src/modules/inputs/contexts/PhoneFieldsContext.tsx` — missing IPhoneStatus export
- `frontend/libs/erxes-ui/src/modules/motion/components/TextEffect.tsx` — motion preset blur prop

These predate the AI Kernel work. Out of scope for Plan 01.1-03 per executor scope rules.

