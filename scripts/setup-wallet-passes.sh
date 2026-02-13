#!/usr/bin/env bash
# ============================================================================
# FERAL PRESENTS — Wallet Pass Credential Setup
# ============================================================================
#
# This script automates the fiddly parts of setting up Apple Wallet and
# Google Wallet pass credentials. It handles certificate conversions,
# base64 encoding, and generates the environment variables you need.
#
# WHAT YOU NEED BEFORE RUNNING:
#
# For Apple Wallet:
#   1. An Apple Developer account ($99/yr) — https://developer.apple.com
#   2. A Pass Type ID registered in your account
#   3. A .p12 certificate file exported from Keychain Access
#      (See the guided steps below — the script walks you through it)
#
# For Google Wallet:
#   1. A Google Wallet API issuer account — https://pay.google.com/business/console
#   2. A service account JSON key file from Google Cloud Console
#
# USAGE:
#   chmod +x scripts/setup-wallet-passes.sh
#   ./scripts/setup-wallet-passes.sh
#
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

echo ""
echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║${NC}  ${BOLD}FERAL PRESENTS — Wallet Pass Setup${NC}                         ${RED}║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

OUTPUT_FILE=""
ENV_VARS=()

add_env_var() {
  ENV_VARS+=("$1=$2")
}

# ─── Helper: base64 encode a file (cross-platform) ───
base64_encode() {
  if command -v base64 &>/dev/null; then
    # Linux uses -w0 for no line wrapping, macOS uses -b0 or no flag
    if base64 --help 2>&1 | grep -q '\-w'; then
      base64 -w0 "$1"
    else
      base64 -i "$1"
    fi
  else
    openssl base64 -in "$1" -A
  fi
}

# ─── Separator ───
sep() {
  echo ""
  echo -e "${DIM}──────────────────────────────────────────────────────────────${NC}"
  echo ""
}

# ============================================================================
# APPLE WALLET SETUP
# ============================================================================

setup_apple() {
  echo -e "${BOLD}${CYAN}▸ APPLE WALLET SETUP${NC}"
  echo ""
  echo -e "  This requires an Apple Developer account (\$99/yr)."
  echo -e "  If you don't have one yet, sign up at: ${BLUE}https://developer.apple.com${NC}"
  echo ""
  echo -e "  ${YELLOW}Do you want to set up Apple Wallet? (y/n)${NC}"
  read -r -p "  > " do_apple
  echo ""

  if [[ "$do_apple" != "y" && "$do_apple" != "Y" ]]; then
    echo -e "  ${DIM}Skipping Apple Wallet setup.${NC}"
    return
  fi

  # ── Step 1: Check if they already have a .p12 file ──
  echo -e "  ${BOLD}Step 1: Pass Type ID${NC}"
  echo ""
  echo -e "  Go to ${BLUE}https://developer.apple.com/account/resources/identifiers/list/passTypeId${NC}"
  echo -e "  → Click the ${BOLD}+${NC} button → Select ${BOLD}Pass Type IDs${NC}"
  echo -e "  → Description: ${GREEN}FERAL Presents Tickets${NC}"
  echo -e "  → Identifier: ${GREEN}pass.com.yourcompany.tickets${NC} (use your own reverse domain)"
  echo -e "  → Click ${BOLD}Register${NC}"
  echo ""
  echo -e "  ${YELLOW}Enter your Pass Type ID (e.g. pass.com.feralpresents.tickets):${NC}"
  read -r -p "  > " pass_type_id
  echo ""

  if [[ -z "$pass_type_id" ]]; then
    echo -e "  ${RED}No Pass Type ID entered. Skipping Apple setup.${NC}"
    return
  fi

  # ── Step 2: Team ID ──
  echo -e "  ${BOLD}Step 2: Team ID${NC}"
  echo ""
  echo -e "  Find your Team ID at ${BLUE}https://developer.apple.com/account${NC}"
  echo -e "  → Look for ${BOLD}Membership Details${NC} → ${BOLD}Team ID${NC} (10-character string)"
  echo ""
  echo -e "  ${YELLOW}Enter your Team ID (e.g. ABCDE12345):${NC}"
  read -r -p "  > " team_id
  echo ""

  if [[ -z "$team_id" ]]; then
    echo -e "  ${RED}No Team ID entered. Skipping Apple setup.${NC}"
    return
  fi

  # ── Step 3: Certificate ──
  echo -e "  ${BOLD}Step 3: Pass Certificate${NC}"
  echo ""
  echo -e "  ${YELLOW}Do you already have a .p12 certificate file? (y/n)${NC}"
  read -r -p "  > " has_p12
  echo ""

  P12_FILE=""

  if [[ "$has_p12" == "y" || "$has_p12" == "Y" ]]; then
    echo -e "  ${YELLOW}Enter the path to your .p12 file:${NC}"
    read -r -p "  > " P12_FILE

    if [[ ! -f "$P12_FILE" ]]; then
      echo -e "  ${RED}File not found: $P12_FILE${NC}"
      echo -e "  ${RED}Skipping Apple setup.${NC}"
      return
    fi
  else
    echo -e "  Let's create one. Follow these steps:"
    echo ""
    echo -e "  ${BOLD}a)${NC} Open ${BOLD}Keychain Access${NC} on your Mac"
    echo -e "     → Menu: Keychain Access → Certificate Assistant → ${BOLD}Request a Certificate from a CA${NC}"
    echo -e "     → Enter your email, select ${BOLD}Saved to disk${NC}, click Continue"
    echo -e "     → Save the .certSigningRequest file"
    echo ""
    echo -e "  ${BOLD}b)${NC} Go to ${BLUE}https://developer.apple.com/account/resources/identifiers/list/passTypeId${NC}"
    echo -e "     → Click your Pass Type ID (${GREEN}$pass_type_id${NC})"
    echo -e "     → Click ${BOLD}Create Certificate${NC}"
    echo -e "     → Upload the .certSigningRequest file"
    echo -e "     → Download the resulting ${BOLD}pass.cer${NC} file"
    echo ""
    echo -e "  ${BOLD}c)${NC} Double-click ${BOLD}pass.cer${NC} to import it into Keychain Access"
    echo ""
    echo -e "  ${BOLD}d)${NC} In Keychain Access, find the certificate (search for your Pass Type ID)"
    echo -e "     → Right-click → ${BOLD}Export${NC} → Choose ${BOLD}.p12${NC} format"
    echo -e "     → Set a password (or leave empty for no password)"
    echo -e "     → Save the file"
    echo ""

    # ── Alternative: openssl-based flow (no Mac needed) ──
    echo -e "  ${DIM}───── OR: If you're not on a Mac ─────${NC}"
    echo ""
    echo -e "  ${BOLD}Alternative (Linux/CI):${NC}"
    echo -e "    # Generate a private key + CSR"
    echo -e "    openssl req -new -newkey rsa:2048 -nodes \\"
    echo -e "      -keyout pass-key.pem -out pass.csr \\"
    echo -e "      -subj \"/CN=$pass_type_id/O=Your Company\""
    echo ""
    echo -e "    # Upload pass.csr to Apple Developer Portal (same as step b above)"
    echo -e "    # Download pass.cer, then convert to .p12:"
    echo -e "    openssl x509 -inform DER -in pass.cer -out pass-cert.pem"
    echo -e "    openssl pkcs12 -export -inkey pass-key.pem -in pass-cert.pem -out pass.p12"
    echo ""
    echo -e "  ${YELLOW}Enter the path to your .p12 file when ready:${NC}"
    read -r -p "  > " P12_FILE

    if [[ ! -f "$P12_FILE" ]]; then
      echo -e "  ${RED}File not found: $P12_FILE${NC}"
      echo -e "  ${RED}Skipping Apple setup.${NC}"
      return
    fi
  fi

  # ── Step 4: Certificate password ──
  echo -e "  ${YELLOW}Enter the .p12 password (press Enter if none):${NC}"
  read -r -s -p "  > " p12_password
  echo ""
  echo ""

  # ── Step 5: Convert .p12 → PEM and base64 encode ──
  echo -e "  ${DIM}Converting certificate...${NC}"

  TEMP_PEM=$(mktemp /tmp/feral-pass-cert-XXXXX.pem)
  trap "rm -f $TEMP_PEM" EXIT

  if [[ -z "$p12_password" ]]; then
    openssl pkcs12 -in "$P12_FILE" -out "$TEMP_PEM" -nodes -legacy 2>/dev/null || \
    openssl pkcs12 -in "$P12_FILE" -out "$TEMP_PEM" -nodes 2>/dev/null || {
      echo -e "  ${RED}Failed to convert .p12 file. Check the file and password.${NC}"
      rm -f "$TEMP_PEM"
      return
    }
  else
    openssl pkcs12 -in "$P12_FILE" -out "$TEMP_PEM" -nodes -legacy -passin "pass:$p12_password" 2>/dev/null || \
    openssl pkcs12 -in "$P12_FILE" -out "$TEMP_PEM" -nodes -passin "pass:$p12_password" 2>/dev/null || {
      echo -e "  ${RED}Failed to convert .p12 file. Check the file and password.${NC}"
      rm -f "$TEMP_PEM"
      return
    }
  fi

  CERT_BASE64=$(base64_encode "$TEMP_PEM")
  rm -f "$TEMP_PEM"

  echo -e "  ${GREEN}✓ Certificate converted and encoded successfully${NC}"
  echo ""

  # ── Store env vars ──
  add_env_var "APPLE_PASS_CERTIFICATE" "$CERT_BASE64"
  if [[ -n "$p12_password" ]]; then
    add_env_var "APPLE_PASS_CERTIFICATE_PASSWORD" "$p12_password"
  fi

  # These can also be set in the admin UI, but env vars work too
  add_env_var "APPLE_PASS_TYPE_IDENTIFIER" "$pass_type_id"
  add_env_var "APPLE_PASS_TEAM_IDENTIFIER" "$team_id"

  echo -e "  ${GREEN}✓ Apple Wallet setup complete${NC}"
  echo -e "  ${DIM}Note: The WWDR G4 certificate is auto-fetched from Apple at runtime.${NC}"
  echo -e "  ${DIM}Pass Type ID and Team ID can also be configured in the admin UI.${NC}"
}

# ============================================================================
# GOOGLE WALLET SETUP
# ============================================================================

setup_google() {
  echo -e "${BOLD}${CYAN}▸ GOOGLE WALLET SETUP${NC}"
  echo ""
  echo -e "  This requires a Google Wallet API issuer account (free)."
  echo ""
  echo -e "  ${YELLOW}Do you want to set up Google Wallet? (y/n)${NC}"
  read -r -p "  > " do_google
  echo ""

  if [[ "$do_google" != "y" && "$do_google" != "Y" ]]; then
    echo -e "  ${DIM}Skipping Google Wallet setup.${NC}"
    return
  fi

  # ── Step 1: Issuer ID ──
  echo -e "  ${BOLD}Step 1: Issuer ID${NC}"
  echo ""
  echo -e "  Go to ${BLUE}https://pay.google.com/business/console${NC}"
  echo -e "  → Sign in and complete the setup if needed"
  echo -e "  → Go to ${BOLD}Google Wallet API${NC} section"
  echo -e "  → Your Issuer ID is the long number shown (e.g. ${GREEN}3388000000012345678${NC})"
  echo ""
  echo -e "  ${YELLOW}Enter your Issuer ID:${NC}"
  read -r -p "  > " issuer_id
  echo ""

  if [[ -z "$issuer_id" ]]; then
    echo -e "  ${RED}No Issuer ID entered. Skipping Google setup.${NC}"
    return
  fi

  # ── Step 2: Service Account ──
  echo -e "  ${BOLD}Step 2: Service Account Key${NC}"
  echo ""
  echo -e "  You need a Google Cloud service account with the Wallet API enabled."
  echo ""
  echo -e "  ${BOLD}Quick setup:${NC}"
  echo -e "  a) Go to ${BLUE}https://console.cloud.google.com${NC}"
  echo -e "  b) Create or select a project"
  echo -e "  c) Enable the ${BOLD}Google Wallet API${NC}:"
  echo -e "     ${BLUE}https://console.cloud.google.com/apis/library/walletobjects.googleapis.com${NC}"
  echo -e "  d) Go to ${BOLD}IAM & Admin → Service Accounts${NC}"
  echo -e "     ${BLUE}https://console.cloud.google.com/iam-admin/serviceaccounts${NC}"
  echo -e "  e) Create a service account (any name, no special roles needed)"
  echo -e "  f) Click the account → ${BOLD}Keys${NC} tab → ${BOLD}Add Key → Create new key → JSON${NC}"
  echo -e "  g) Save the downloaded JSON file"
  echo ""
  echo -e "  ${BOLD}Then link it to your issuer:${NC}"
  echo -e "  h) Go back to ${BLUE}https://pay.google.com/business/console${NC}"
  echo -e "  i) Go to ${BOLD}Google Wallet API → Manage${NC}"
  echo -e "  j) Add the service account email as a user with ${BOLD}Developer${NC} access"
  echo ""
  echo -e "  ${YELLOW}Enter the path to your service account JSON key file:${NC}"
  read -r -p "  > " sa_key_file
  echo ""

  if [[ ! -f "$sa_key_file" ]]; then
    echo -e "  ${RED}File not found: $sa_key_file${NC}"
    echo -e "  ${RED}Skipping Google setup.${NC}"
    return
  fi

  # Validate it's valid JSON with required fields
  if ! python3 -c "import json; d=json.load(open('$sa_key_file')); assert 'private_key' in d" 2>/dev/null && \
     ! node -e "const d=require('$sa_key_file'); if(!d.private_key) throw 'missing'" 2>/dev/null; then
    echo -e "  ${RED}Invalid service account key file — missing 'private_key' field.${NC}"
    return
  fi

  SA_KEY_BASE64=$(base64_encode "$sa_key_file")

  add_env_var "GOOGLE_WALLET_SERVICE_ACCOUNT_KEY" "$SA_KEY_BASE64"
  add_env_var "GOOGLE_WALLET_ISSUER_ID" "$issuer_id"

  echo -e "  ${GREEN}✓ Google Wallet setup complete${NC}"
  echo -e "  ${DIM}Issuer ID can also be configured in the admin UI.${NC}"
}

# ============================================================================
# OUTPUT
# ============================================================================

output_results() {
  if [[ ${#ENV_VARS[@]} -eq 0 ]]; then
    echo ""
    echo -e "  ${YELLOW}No credentials were configured. Run this script again when you're ready.${NC}"
    echo ""
    return
  fi

  sep
  echo -e "${BOLD}${GREEN}▸ SETUP COMPLETE${NC}"
  echo ""
  echo -e "  Generated ${BOLD}${#ENV_VARS[@]}${NC} environment variable(s)."
  echo ""

  # ── Option 1: Write to .env.local ──
  echo -e "  ${YELLOW}Add to .env.local? (y/n)${NC}"
  echo -e "  ${DIM}This will append to .env.local (won't overwrite existing values)${NC}"
  read -r -p "  > " write_env
  echo ""

  if [[ "$write_env" == "y" || "$write_env" == "Y" ]]; then
    ENV_FILE=".env.local"
    echo "" >> "$ENV_FILE"
    echo "# ── Wallet Pass Credentials (added by setup script) ──" >> "$ENV_FILE"
    for var in "${ENV_VARS[@]}"; do
      key="${var%%=*}"
      value="${var#*=}"
      # Check if already exists
      if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
        echo -e "  ${YELLOW}⚠ ${key} already exists in $ENV_FILE — skipping${NC}"
      else
        echo "${key}=\"${value}\"" >> "$ENV_FILE"
        echo -e "  ${GREEN}✓ Added ${key}${NC}"
      fi
    done
    echo ""
    echo -e "  ${GREEN}✓ Saved to ${ENV_FILE}${NC}"
  fi

  # ── Always show for Vercel ──
  echo ""
  echo -e "  ${BOLD}For Vercel deployment, add these in your project settings:${NC}"
  echo -e "  ${BLUE}https://vercel.com/your-project/settings/environment-variables${NC}"
  echo ""

  for var in "${ENV_VARS[@]}"; do
    key="${var%%=*}"
    value="${var#*=}"
    # Truncate long values for display
    if [[ ${#value} -gt 60 ]]; then
      display_value="${value:0:40}...${value: -10}"
    else
      display_value="$value"
    fi
    echo -e "  ${BOLD}${key}${NC}=${DIM}${display_value}${NC}"
  done

  echo ""
  echo -e "  ${DIM}Tip: For Vercel, copy the full values (not truncated) from .env.local${NC}"

  # ── Write to file for easy copy ──
  OUTPUT_FILE="/tmp/feral-wallet-env-vars.txt"
  echo "# FERAL Wallet Pass Environment Variables" > "$OUTPUT_FILE"
  echo "# Generated: $(date)" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  for var in "${ENV_VARS[@]}"; do
    key="${var%%=*}"
    value="${var#*=}"
    echo "${key}=\"${value}\"" >> "$OUTPUT_FILE"
  done
  echo ""
  echo -e "  ${DIM}Full values also saved to: ${OUTPUT_FILE}${NC}"
  echo -e "  ${RED}⚠ Delete this file after copying to Vercel — it contains secrets!${NC}"
}

# ============================================================================
# NEXT STEPS
# ============================================================================

show_next_steps() {
  sep
  echo -e "${BOLD}${CYAN}▸ NEXT STEPS${NC}"
  echo ""
  echo -e "  1. ${BOLD}Enable wallet passes in the admin UI:${NC}"
  echo -e "     → Go to ${BLUE}/admin/communications${NC} → ${BOLD}Wallet Passes${NC}"
  echo -e "     → Toggle on Apple Wallet and/or Google Wallet"
  echo -e "     → Set Pass Type ID and Team ID (if not set via env vars)"
  echo -e "     → Customize branding (logo, colors, text)"
  echo ""
  echo -e "  2. ${BOLD}Test it:${NC}"
  echo -e "     → Create a test order"
  echo -e "     → Check the confirmation email for wallet buttons"
  echo -e "     → Check the order confirmation page for wallet buttons"
  echo ""
  echo -e "  3. ${BOLD}Deploy:${NC}"
  echo -e "     → Add environment variables to Vercel"
  echo -e "     → Deploy and verify"
  echo ""
}

# ============================================================================
# MAIN
# ============================================================================

setup_apple
sep
setup_google
output_results
show_next_steps

echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║${NC}  ${BOLD}Done!${NC} Your wallet passes are ready to configure.            ${RED}║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
