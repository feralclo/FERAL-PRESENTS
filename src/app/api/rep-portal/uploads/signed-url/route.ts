import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRepAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/rep-portal/uploads/signed-url
 *
 * Mint a short-lived signed upload URL to Supabase Storage, so native
 * clients can push binary image data directly to storage without
 * round-tripping through our Next.js server.
 *
 * Request:
 *   {
 *     kind: 'avatar' | 'banner' | 'quest_proof',
 *     content_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic',
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
 */

const BUCKET = "rep-media";

const KIND_CONFIG = {
  avatar: { prefix: "avatars", max_bytes: 2 * 1024 * 1024 },
  banner: { prefix: "banners", max_bytes: 3 * 1024 * 1024 },
  quest_proof: { prefix: "quest-proofs", max_bytes: 8 * 1024 * 1024 },
} as const;

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type Kind = keyof typeof KIND_CONFIG;

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

    const kind = body.kind as Kind;
    if (!kind || !(kind in KIND_CONFIG)) {
      return NextResponse.json(
        { error: "kind must be one of: avatar, banner, quest_proof" },
        { status: 400 }
      );
    }

    const contentType = typeof body.content_type === "string" ? body.content_type : "";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "content_type must be one of: image/jpeg, image/png, image/webp, image/heic, image/heif" },
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
    const config = KIND_CONFIG[kind];
    if (sizeBytes > config.max_bytes) {
      return NextResponse.json(
        { error: `File too large for ${kind}. Max ${Math.round(config.max_bytes / 1024 / 1024)}MB.` },
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
    const ext = contentType.split("/")[1] ?? "jpg";
    const uuid = crypto.randomUUID();
    const key = `${config.prefix}/${auth.rep.id}/${uuid}.${ext}`;

    // Supabase Storage signed upload URL (expires in ~2 hours by default;
    // client should finish well before)
    const { data: signed, error: signError } = await db.storage
      .from(BUCKET)
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

    const publicUrl = db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

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
