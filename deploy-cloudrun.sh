#!/bin/bash
# ═══════════════════════════════════════════════════
# Talent Studio — Cloud Run Deployment Script
# ═══════════════════════════════════════════════════
# Usage: ./deploy-cloudrun.sh
#
# Prerequisites:
#   1. gcloud CLI installed and authenticated
#   2. Cloud Run API enabled in GCP console
#   3. .env.local file with all environment variables
# ═══════════════════════════════════════════════════

set -euo pipefail

PROJECT_ID="talent-consulting-acf16"
REGION="us-east1"
SERVICE_NAME="talent-studio"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "══════════════════════════════════════"

node scripts/production-deploy-preflight.js cloudrun

set -a
. ./.env.production
set +a
echo "  Talent Studio → Cloud Run Deploy"
echo "══════════════════════════════════════"

# Step 1: Build the Docker image via Cloud Build
echo "→ Building Docker image via Cloud Build..."
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --config cloudbuild.yaml \
  --substitutions="_IMAGE_NAME=${IMAGE_NAME},_NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY},_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN},_NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID},_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET},_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID},_NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID},_NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:-},_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}" \
  .

# Step 2: Deploy to Cloud Run
echo "→ Deploying to Cloud Run (${REGION})..."
gcloud run deploy ${SERVICE_NAME} \
  --project="${PROJECT_ID}" \
  --image ${IMAGE_NAME} \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --timeout 300 \
  --env-vars-file .env.cloudrun.yaml

echo ""
echo "══════════════════════════════════════"
echo "  ✅ Deployment complete!"
echo "  Service URL will be shown above."
echo ""
echo "  Next steps:"
echo "  1. Map your custom domain:"
echo "     gcloud run domain-mappings create \\"
echo "       --service=${SERVICE_NAME} \\"
echo "       --domain=talentconsulting.io \\"
echo "       --region=${REGION}"
echo ""
echo "  2. Update DNS records as shown by gcloud"
echo "══════════════════════════════════════"
