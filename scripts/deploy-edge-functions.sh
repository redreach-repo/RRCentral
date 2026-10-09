#!/usr/bin/env bash
# Deploy RRCentral Edge Functions to production Supabase.
# Prerequisites: supabase CLI logged in (`npx supabase login`) and linked, or pass --project-ref.
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-pszjylxrpvlumldtptrr}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Deploying Edge Functions to project-ref=$REF"

npx supabase functions deploy zoho-proxy --project-ref "$REF"
npx supabase functions deploy manage-auth-user --project-ref "$REF"
# Shop checkout is called without a user JWT from the static Pages shop.
npx supabase functions deploy create-checkout-session --project-ref "$REF" --no-verify-jwt

echo
echo "Optional secrets (set once):"
echo "  npx supabase secrets set --project-ref $REF STRIPE_SECRET_KEY=sk_live_..."
echo "  npx supabase secrets set --project-ref $REF ALLOWED_ORIGINS=https://redreach-repo.github.io,https://www.redreach.ae,https://tee-tribe.com,https://www.tee-tribe.com"
echo
echo "Do NOT deploy bootstrap-admin unless BOOTSTRAP_ADMIN_SECRET + BOOTSTRAP_ADMIN_PASSWORD are set."
echo "Done."
