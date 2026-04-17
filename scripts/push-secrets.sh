#!/usr/bin/env bash
# Carica tutti i GitHub Actions secrets via gh CLI
# Richiede: gh auth login (già autenticato)
set -euo pipefail

SIFTER_REPO="sifter-ai/sifter"
CLOUD_REPO="sifter-ai/sifter-cloud"

# Legge il file .secrets dalla root del repo
SECRETS_FILE="$(cd "$(dirname "$0")/.." && pwd)/.secrets"

if [ ! -f "$SECRETS_FILE" ]; then
    echo "ERROR: .secrets file not found at $SECRETS_FILE"
    exit 1
fi

# Carica una variabile dal file .secrets (ignora commenti e righe vuote)
get_secret() {
    grep "^$1=" "$SECRETS_FILE" | cut -d'=' -f2-
}

echo "→ sifter repo ($SIFTER_REPO)"
gh secret set CLOUDFLARE_API_TOKEN  --repo "$SIFTER_REPO" --body "$(get_secret CLOUDFLARE_API_TOKEN)"
gh secret set CLOUDFLARE_ACCOUNT_ID --repo "$SIFTER_REPO" --body "$(get_secret CLOUDFLARE_ACCOUNT_ID)"
gh secret set NPM_TOKEN             --repo "$SIFTER_REPO" --body "$(get_secret NPM_TOKEN)"
echo "   ✓ 3 secrets caricati"

echo "→ sifter-cloud repo ($CLOUD_REPO)"
gh secret set RAILWAY_TOKEN --repo "$CLOUD_REPO" --body "$(get_secret RAILWAY_TOKEN)"
echo "   ✓ 1 secret caricato  (ghcr.io usa GITHUB_TOKEN automatico)"

echo ""
echo "Fatto. Verifica su:"
echo "  https://github.com/$SIFTER_REPO/settings/secrets/actions"
echo "  https://github.com/$CLOUD_REPO/settings/secrets/actions"
