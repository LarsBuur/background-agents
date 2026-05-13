#!/usr/bin/env bash
# Deploy the Next.js web app to Vercel production.
#
# The Vercel project intentionally has no GitHub integration (see
# terraform/environments/production/web-vercel.tf), so deploys must be triggered
# from the CLI. Run this script from the repo root after running terraform
# apply (which manages the project's env vars).
#
# Requires:
#   - VERCEL_TOKEN env var (or pass --token)
#   - vercel CLI installed (npm i -g vercel)
#
# Project/org IDs are read from terraform output.

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v vercel >/dev/null 2>&1; then
    echo "Error: vercel CLI not found. Install with: npm i -g vercel" >&2
    exit 1
fi

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
    echo "Error: VERCEL_TOKEN environment variable is required" >&2
    exit 1
fi

VERCEL_PROJECT_ID=$(terraform -chdir=terraform/environments/production output -raw web_app_project_id)
VERCEL_ORG_ID=$(grep -E '^vercel_team_id' terraform/environments/production/terraform.tfvars | sed -E 's/.*= *"([^"]+)".*/\1/')

export VERCEL_PROJECT_ID VERCEL_ORG_ID

echo "Deploying to Vercel project ${VERCEL_PROJECT_ID} (team ${VERCEL_ORG_ID})..."
vercel deploy --prod --token="${VERCEL_TOKEN}"
