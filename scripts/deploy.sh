#!/usr/bin/env bash
# Deploy tutto o singoli componenti da locale.
#
# Uso:
#   ./scripts/deploy.sh all         — deploya tutto
#   ./scripts/deploy.sh python      — sifter-ai, sifter-mcp → PyPI
#   ./scripts/deploy.sh npm         — @sifter-ai/sdk, @sifter-ai/cli → npm
#   ./scripts/deploy.sh docker      — ghcr.io/sifter-ai/sifter → GitHub Container Registry
#   ./scripts/deploy.sh cloud       — sifter-cloud → Artifact Registry + Cloud Run
#   ./scripts/deploy.sh frontend    — build + deploy su Cloudflare Pages

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLOUD_ROOT="/home/bimbobruno/git/sifter-cloud"
SECRETS="$REPO_ROOT/.secrets"

# ── Carica secrets ────────────────────────────────────────────
if [ ! -f "$SECRETS" ]; then
    echo "ERROR: .secrets non trovato in $SECRETS"
    exit 1
fi

get() { grep "^$1=" "$SECRETS" | cut -d'=' -f2- | tr -d ' '; }

PYPI_TOKEN=$(get PYPI_TOKEN)
GITHUB_PAT=$(get GITHUB_PAT)
NPM_TOKEN=$(get NPM_TOKEN)
CLOUDFLARE_API_TOKEN=$(get CLOUDFLARE_API_TOKEN)
CLOUDFLARE_ACCOUNT_ID=$(get CLOUDFLARE_ACCOUNT_ID)
GCP_PROJECT=$(get GCP_PROJECT_ID)
GCP_REGION=$(get GCP_REGION)
GCP_SA_KEY="$REPO_ROOT/scripts/sifter-ai-493617-5aeefdd4df6d.json"

# ── Versione dal tag git più recente ─────────────────────────
VERSION=$(git -C "$REPO_ROOT" describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo "0.1.0")
echo "▸ Versione: $VERSION"

# ─────────────────────────────────────────────────────────────
deploy_python() {
    echo ""
    echo "── Python (PyPI) ────────────────────────────────────"
    [ -z "$PYPI_TOKEN" ] && echo "ERROR: PYPI_TOKEN mancante in .secrets" && exit 1

    for dir in sdk mcp; do
        echo "  → sifter-$dir"
        (
            cd "$REPO_ROOT/code/$dir"
            rm -rf dist
            uv build
            UV_PUBLISH_TOKEN="$PYPI_TOKEN" uv publish
        )
    done
    echo "  ✓ Python packages pubblicati"
}

# ─────────────────────────────────────────────────────────────
deploy_npm() {
    echo ""
    echo "── npm ──────────────────────────────────────────────"
    [ -z "$NPM_TOKEN" ] && echo "ERROR: NPM_TOKEN mancante in .secrets" && exit 1

    echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc

    echo "  → @sifter-ai/sdk"
    (
        cd "$REPO_ROOT/code/sdk-ts"
        npm ci
        npm run build
        npm publish --access public
    )

    echo "  → @sifter-ai/cli"
    (
        cd "$REPO_ROOT/code/cli"
        # Sostituisce dipendenza locale con versione pubblicata
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
            pkg.dependencies['@sifter-ai/sdk'] = '^$VERSION';
            fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
        "
        npm ci
        npm run build
        npm publish --access public
    )

    rm -f ~/.npmrc
    echo "  ✓ npm packages pubblicati"
}

# ─────────────────────────────────────────────────────────────
deploy_docker() {
    echo ""
    echo "── Docker OSS (ghcr.io/sifter-ai/sifter) ───────────"
    [ -z "$GITHUB_PAT" ] && echo "ERROR: GITHUB_PAT mancante in .secrets" && exit 1

    echo "$GITHUB_PAT" | docker login ghcr.io -u bimbobruno --password-stdin

    docker build \
        -f "$REPO_ROOT/code/docker/Dockerfile.allinone" \
        -t "ghcr.io/sifter-ai/sifter:$VERSION" \
        -t "ghcr.io/sifter-ai/sifter:latest" \
        "$REPO_ROOT"

    docker push "ghcr.io/sifter-ai/sifter:$VERSION"
    docker push "ghcr.io/sifter-ai/sifter:latest"
    echo "  ✓ OSS image pubblicata"
}

# ─────────────────────────────────────────────────────────────
deploy_cloud() {
    echo ""
    echo "── sifter-cloud (Artifact Registry + Cloud Run) ─────"
    [ -z "$GCP_PROJECT" ] && echo "ERROR: GCP_PROJECT_ID mancante in .secrets" && exit 1
    [ -z "$GCP_REGION" ]  && echo "ERROR: GCP_REGION mancante in .secrets" && exit 1
    [ ! -f "$GCP_SA_KEY" ] && echo "ERROR: Service account key non trovato: $GCP_SA_KEY" && exit 1
    [ ! -d "$CLOUD_ROOT" ] && echo "ERROR: sifter-cloud non trovato in $CLOUD_ROOT" && exit 1

    AR_HOST="${GCP_REGION}-docker.pkg.dev"
    AR_IMAGE="${AR_HOST}/${GCP_PROJECT}/sifter/sifter-cloud"
    SERVICE_NAME="sifter-cloud"

    echo "  → Autenticazione GCP"
    gcloud auth activate-service-account --key-file="$GCP_SA_KEY" --quiet
    gcloud config set project "$GCP_PROJECT" --quiet
    gcloud auth configure-docker "$AR_HOST" --quiet

    echo "  → Build image"
    docker build \
        -f "$CLOUD_ROOT/Dockerfile" \
        -t "${AR_IMAGE}:${VERSION}" \
        -t "${AR_IMAGE}:latest" \
        "$CLOUD_ROOT"

    echo "  → Push su Artifact Registry"
    docker push "${AR_IMAGE}:${VERSION}"
    docker push "${AR_IMAGE}:latest"
    echo "  ✓ Image pubblicata: ${AR_IMAGE}:${VERSION}"

    echo "  → Deploy su Cloud Run"
    gcloud run deploy "$SERVICE_NAME" \
        --image "${AR_IMAGE}:${VERSION}" \
        --region "$GCP_REGION" \
        --platform managed \
        --allow-unauthenticated \
        --min-instances 1 \
        --port 8000 \
        --quiet
    echo "  ✓ Cloud Run deploy completato"
}

# ─────────────────────────────────────────────────────────────
deploy_frontend() {
    echo ""
    echo "── Frontend (Cloudflare Pages) ──────────────────────"
    [ -z "$CLOUDFLARE_API_TOKEN" ] && echo "ERROR: CLOUDFLARE_API_TOKEN mancante in .secrets" && exit 1

    echo "  → Build"
    (
        cd "$REPO_ROOT/code/frontend"
        npm ci
        npm run build
    )

    echo "  → Deploy su Cloudflare Pages"
    CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
    CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
    npx wrangler pages deploy "$REPO_ROOT/code/frontend/dist" \
        --project-name sifter \
        --branch main

    echo "  ✓ Frontend deployato"
}

# ─────────────────────────────────────────────────────────────
CMD="${1:-all}"

case "$CMD" in
    python)   deploy_python ;;
    npm)      deploy_npm ;;
    docker)   deploy_docker ;;
    cloud)    deploy_cloud ;;
    frontend) deploy_frontend ;;
    all)
        deploy_python
        deploy_npm
        deploy_docker
        deploy_cloud
        deploy_frontend
        echo ""
        echo "✓ Deploy completo — versione $VERSION"
        ;;
    *)
        echo "Uso: $0 [all|python|npm|docker|cloud|frontend]"
        exit 1
        ;;
esac
