#!/usr/bin/env bash
#
# Manual deployment of applye.dev to Cloudflare Pages.
#
# The intended path is the `deploy-web` job in .github/workflows/ci.yml, which
# only runs after the CI gate passes, so a red main cannot reach the live site.
# This script exists because GitHub Actions cannot run on this repository: the
# jobs are queued and then fail within seconds with "recent account payments
# have failed or your spending limit needs to be increased". They are not
# absent, which matters - every push leaves a failed run on the branch. This
# script deliberately reproduces
# the same two steps the job performs: build with the measurement ID, then
# upload the built directory to the `applye` project.
#
# The important difference, and the reason this is a stopgap rather than a
# workflow: nothing here stops you deploying a broken build. The job's gate is
# the point of the job. So this script runs the same checks first and refuses
# to upload if any of them fail.
#
# Usage:
#
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run web:deploy
#
# Both values are the ones already stored as GitHub secrets. Keep them out of
# shell history: prefer a leading space, a password manager, or an untracked
# .env you source. GA_MEASUREMENT_ID defaults to the real property; unset it to
# G-PLACEHOLDER to deploy with analytics dormant.

set -euo pipefail

PROJECT="${CLOUDFLARE_PAGES_PROJECT:-applye}"
export GA_MEASUREMENT_ID="${GA_MEASUREMENT_ID:-G-ZY158GV42C}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set." >&2
  echo "       Both are already in GitHub as repository secrets." >&2
  exit 1
fi

echo "==> Checks (the gate the workflow would have applied)"
npm run format:check
npx nx run web:lint
npx nx run web:test

echo "==> Build (GA_MEASUREMENT_ID=${GA_MEASUREMENT_ID})"
npm run web:build

echo "==> Restoring the committed analytics placeholder"
# web:build rewrites measurement-id.ts from the environment. Leaving the real
# ID in the working tree would commit it into source, which is exactly what the
# build-variable arrangement exists to prevent.
GA_MEASUREMENT_ID= npm run web:analytics-config

echo "==> Deploy to Cloudflare Pages project '${PROJECT}'"
npx wrangler pages deploy dist/apps/web/browser \
  --project-name="${PROJECT}" \
  --branch=main

echo
echo "Deployed to https://applye.dev - live, and open to search since 2026-07-29."
echo "The pre-launch 'X-Robots-Tag: noindex' is gone; confirm it stayed gone with:"
echo "  curl -sI https://applye.dev | grep -i x-robots-tag   # expects no output"
