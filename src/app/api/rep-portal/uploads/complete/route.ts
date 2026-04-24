import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";
import { REP_MEDIA_PREFIX_CAPS } from "@/lib/uploads/rep-media-config";

/**
 * POST /api/rep-portal/uploads/complete
 *
 * Called by the client after it finishes PUT-ing bytes to the signed
 * upload URL. Server verifies:
 *   1. The object actually exists in storage (client didn't fake it)
 *   2. The key path matches this rep's id prefix (no key-substitution attack)
 *   3. The stored object's size is within per-kind caps
 *
 * Returns the final { public_url } the client should save against the
 * relevant row (rep.photo_url, quest submission.proof_url, etc).
 *
 * Request: { key: string }
 * Response: { data: { public_url: string } }
 */

const BUCKET = "rep-media";

// Per-prefix upload caps. Single source of truth in
// lib/uploads/rep-media-config.ts — updating either the signed-URL
// endpoint or this file without also updating the config would cause
// a silent size-check drift.
const KIND_CAPS = REP_MEDIA_PREFIX_CAPS;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    let body: { key?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const key = typeof body.key === "string" ? body.key : "";
    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    // Key format: {kind_prefix}/{rep_id}/{uuid}.{ext}
    const parts = key.split("/");
    if (parts.length !== 3) {
      return NextResponse.json(
        { error: "Invalid key format" },
        { status: 400 }
      );
    }
    const [kindPrefix, repIdInKey, filename] = parts;

    // Ownership: the key's rep_id segment must match the caller
    if (repIdInKey !== auth.rep.id) {
      return NextResponse.json(
        { error: "Key does not belong to this rep" },
        { status: 403 }
      );
    }

    if (!(kindPrefix in KIND_CAPS)) {
      return NextResponse.json(
        { error: "Invalid kind prefix" },
        { status: 400 }
      );
    }

    // Basic filename sanity — UUID + extension
    if (!/^[0-9a-f-]{36}\.[a-z]{3,5}$/i.test(filename)) {
      return NextResponse.json(
        { error: "Invalid filename" },
        { status: 400 }
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Verify object exists in storage
    const { data: list, error: listError } = await db.storage
      .from(BUCKET)
      .list(`${kindPrefix}/${repIdInKey}`, {
        search: filename,
        limit: 1,
      });

    if (listError) {
      Sentry.captureException(listError, { extra: { key } });
      return NextResponse.json(
        { error: "Failed to verify upload" },
        { status: 500 }
      );
    }

    const obj = list?.find((o) => o.name === filename);
    if (!obj) {
      return NextResponse.json(
        { error: "Upload not found — complete the PUT before calling this endpoint" },
        { status: 404 }
      );
    }

    const size =
      typeof obj.metadata === "object" && obj.metadata !== null
        ? (obj.metadata as { size?: number }).size ?? 0
        : 0;
    const cap = KIND_CAPS[kindPrefix];
    if (size > cap) {
      // Clean up the oversized object so the rep can re-upload
      await db.storage.from(BUCKET).remove([key]);
      return NextResponse.json(
        { error: `Uploaded file exceeds ${Math.round(cap / 1024 / 1024)}MB cap for this kind.` },
        { status: 413 }
      );
    }

    const publicUrl = db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

    return NextResponse.json({
      data: { public_url: publicUrl, key, size_bytes: size },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/uploads/complete] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
