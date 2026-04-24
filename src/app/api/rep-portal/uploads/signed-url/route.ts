import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";
import {
  REP_MEDIA_KINDS,
  REP_MEDIA_IMAGE_TYPES,
  REP_MEDIA_VIDEO_TYPES,
  isMimeAllowedForKind,
  type RepMediaKind,
} from "@/lib/uploads/rep-media-config";

/**
 * POST /api/rep-portal/uploads/signed-url
 *
 * Mint a short-lived signed upload URL to Supabase Storage, so native
 * clients can push binary image data directly to storage without
 * round-tripping through our Next.js server.
 *
 * Request:
 *   {
 *     kind: 'avatar' | 'banner' | 'quest_proof' | 'story_image' | 'story_video',
 *     content_type: image/* or (for story_video) video/mp4 | video/quicktime,
 *     size_bytes: int
 *   }
 *
 * Response (200):
 *   {
 *     data: {
 *       upload_url: string,   // signed PUT URL, ~10 minute TTL
 *       public_url: string,   // permanent serving URL once upload completes
 *       key: string,          // storage key to pass to /uploads/complete
 *       expires_at: ISO8601
 *     }
 *   }
 *
 * MIME + size caps are defined in lib/uploads/rep-media-config.ts and
 * MUST match the rep-media bucket's allowed_mime_types / file_size_limit
 * in Supabase. Keeping those in one file prevents the
 * "endpoint mints a signed URL, bucket 415s on PUT" failure mode.
 */

const KIND_NAMES = Object.keys(REP_MEDIA_KINDS) as RepMediaKind[];

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRepAuth({ allowPending: true });
    if (auth.error) return auth.error;

    let body: { kind?: unknown; content_type?: unknown; size_bytes?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const kind = body.kind as RepMediaKind;
    if (!kind || !(kind in REP_MEDIA_KINDS)) {
      return NextResponse.json(
        { error: `kind must be one of: ${KIND_NAMES.join(", ")}` },
        { status: 400 }
      );
    }

    const contentType = typeof body.content_type === "string" ? body.content_type : "";
    if (!isMimeAllowedForKind(kind, contentType)) {
      const allowedStr =
        REP_MEDIA_KINDS[kind].media === "video"
          ? (REP_MEDIA_VIDEO_TYPES as readonly string[]).join(", ")
          : (REP_MEDIA_IMAGE_TYPES as readonly string[]).join(", ");
      return NextResponse.json(
        { error: `content_type for ${kind} must be one of: ${allowedStr}` },
        { status: 400 }
      );
    }

    const sizeBytes = typeof body.size_bytes === "number" ? body.size_bytes : 0;
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      return NextResponse.json(
        { error: "size_bytes must be a positive integer" },
        { status: 400 }
      );
    }

    const config = REP_MEDIA_KINDS[kind];
    if (sizeBytes > config.maxBytes) {
      return NextResponse.json(
        { error: `File too large for ${kind}. Max ${Math.round(config.maxBytes / 1024 / 1024)}MB.` },
        { status: 413 }
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Key layout: {kind_prefix}/{rep_id}/{uuid}.{ext}
    // Rep-id prefix lets us enforce ownership in /uploads/complete later.
    const rawExt = contentType.split("/")[1] ?? "jpg";
    // quicktime maps to .mov; everything else uses the MIME subtype as-is.
    const ext = rawExt === "quicktime" ? "mov" : rawExt;
    const uuid = crypto.randomUUID();
    const key = `${config.prefix}/${auth.rep.id}/${uuid}.${ext}`;

    // Supabase Storage signed upload URL (expires in ~2 hours by default;
    // client should finish well before)
    const { data: signed, error: signError } = await db.storage
      .from("rep-media")
      .createSignedUploadUrl(key);

    if (signError || !signed) {
      Sentry.captureException(signError ?? new Error("no signed url"), {
        extra: { kind, key },
      });
      return NextResponse.json(
        { error: "Failed to create upload URL" },
        { status: 500 }
      );
    }

    const publicUrl = db.storage.from("rep-media").getPublicUrl(key).data.publicUrl;

    return NextResponse.json({
      data: {
        upload_url: signed.signedUrl,
        public_url: publicUrl,
        key,
        token: signed.token,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[rep-portal/uploads/signed-url] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
