#!/usr/bin/env bash
# CLAUDE.md warden — fires on Stop, nudges Claude to keep CLAUDE.md healthy.
#
# Two triggers (silent if neither fires):
#   1. CLAUDE.md grew over 40,000 chars
#   2. Architectural files changed in this session, but CLAUDE.md / docs/CLAUDE-*.md
#      were NOT touched (likely the doc is now stale)
#
# Returns JSON {"decision":"block","reason":...} when triggered, which keeps
# Claude going with the reason as a system message; Claude can then update
# the doc, or call out that no doc change is needed and stop normally.
#
# Skips if stop_hook_active=true (Claude is already in a re-fire) to avoid loops.

set -e

input=$(cat)
already_active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")
if [[ "$already_active" == "true" ]]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"

trigger=""
SIZE_LIMIT=40000

# 1. Size check
if [[ -f "$CLAUDE_MD" ]]; then
  size=$(wc -c < "$CLAUDE_MD" | tr -d ' ')
  if [[ "$size" -gt "$SIZE_LIMIT" ]]; then
    trigger="CLAUDE.md is ${size} chars (over the ${SIZE_LIMIT} limit it sets for itself). Trim it before stopping — extract overgrown sections to docs/CLAUDE-*.md and link from CLAUDE.md. The current reference docs are: docs/CLAUDE-database.md, docs/CLAUDE-api-routes.md, docs/CLAUDE-admin-pages.md, docs/CLAUDE-rep-platform.md."
  fi
fi

# 2. Architectural-change check (only fires when CLAUDE.md / docs/CLAUDE-*.md unchanged in working tree)
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Working-tree changes (tracked + untracked). git status --porcelain=v1 prints
# "XY <path>" for each entry; sed strips the 3-char status prefix.
# -uall expands untracked directories so individual files surface.
changed_files=$(git status --porcelain=v1 -uall 2>/dev/null | sed 's/^...//' || true)

# grep -c always prints a number (0 if no match) but exits 1 — `|| true` swallows that.
doc_changed=$(printf '%s\n' "$changed_files" | grep -cE '^(CLAUDE\.md|docs/CLAUDE-[a-z-]+\.md)$' || true)
arch_changes=$(printf '%s\n' "$changed_files" | grep -E '^(src/lib/[^/]+\.(ts|tsx)$|src/app/api/.+/route\.(ts|tsx)$|supabase/migrations/.+\.sql$|src/hooks/[^/]+\.(ts|tsx)$|src/components/admin/.+\.(ts|tsx)$)' | head -20 || true)

if [[ -n "$arch_changes" && "${doc_changed:-0}" -eq 0 ]]; then
  arch_msg="Architectural files changed in this session, but CLAUDE.md (and docs/CLAUDE-*.md) weren't touched. Assess whether the changes warrant a doc update before stopping. If yes, update the relevant section + reference doc; if no, just say so and stop. Files changed:
${arch_changes}"
  if [[ -n "$trigger" ]]; then
    trigger="${trigger}

${arch_msg}"
  else
    trigger="$arch_msg"
  fi
fi

# Silent if nothing to flag
if [[ -z "$trigger" ]]; then
  exit 0
fi

# Block stop with reason — Claude receives the reason as a system message and continues
jq -n --arg reason "$trigger" '{"decision":"block","reason":$reason}'
