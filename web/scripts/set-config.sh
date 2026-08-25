#!/bin/bash

# Populates src/config/config.json from AWS SSM before a build.
# Usage: set-config.sh [sandbox|prod|localhost]

set -euo pipefail

ENV="${1:-sandbox}"

if [[ $ENV == "localhost" ]]; then
  export AWS_ENV=sandbox
else
  export AWS_ENV=$ENV
fi

# Only set AWS_PROFILE for local dev. In CI, configure-aws-credentials exports
# AWS_ACCESS_KEY_ID etc. directly, and AWS_PROFILE would override them with a
# profile that does not exist on the runner.
if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
  export AWS_PROFILE=nakom.is-$AWS_ENV
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../src/config/config.json"
cp "$SCRIPT_DIR/../src/config/config.json.template" "$CONFIG_FILE"

param() {
  aws ssm get-parameter --name "$1" --query "Parameter.Value" --output text
}

setValue() {
  local key="$1" value="$2" tmp
  echo "  $key = $value"
  tmp=$(mktemp)
  sed "s|\"$key\": \".*\"|\"$key\": \"$value\"|g" "$CONFIG_FILE" > "$tmp" && mv "$tmp" "$CONFIG_FILE"
}

echo "Configuring for $ENV:"
setValue env "$ENV"

REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-$(aws configure get region)}}"
setValue region "$REGION"

USER_POOL_ID=$(param "/lightning/${AWS_ENV}/cognito/user-pool-id")
setValue authority "https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}"
setValue userPoolId "$USER_POOL_ID"
setValue userPoolClientId "$(param "/lightning/${AWS_ENV}/cognito/client-id")"
setValue cognitoDomain "$(param "/lightning/${AWS_ENV}/cognito/login-domain")"
setValue apiUrl "$(param "/lightning/${AWS_ENV}/api/url")"

# Cognito matches callback URLs exactly, and the client is registered with the
# real origin plus the Vite dev server — so localhost must use the dev origin,
# not the sandbox one whose parameters it otherwise borrows.
case $ENV in
  prod)      ORIGIN="https://lightning.nakomis.com" ;;
  sandbox)   ORIGIN="https://lightning.sandbox.nakomis.com" ;;
  localhost) ORIGIN="http://localhost:5173" ;;
  *) echo "Unknown environment: $ENV" >&2; exit 1 ;;
esac

setValue redirectUri "$ORIGIN/loggedin"
setValue logoutUri "$ORIGIN/logout"
