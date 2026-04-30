import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";
import {
  TENANT_MEDIA_KINDS,
  TENANT_MEDIA_IMAGE_TYPES,
  isMimeAllowedForTenantMedia,
  isTenantMediaKind,
} from "@/lib/uploads/tenant-media-config";

const BUCKET = "tenant-media";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    let body: { kind?: unknown; content_type?: unknown; size_bytes?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const kind = typeof body.kind === "string" ? body.kind : "";
    if (!isTenantMediaKind(kind)) {
      return NextResponse.json(
        { error: `kind must be one of: ${Object.keys(TENANT_MEDIA_KINDS).join(", ")}` },
        { status: 400 }
      );
    }

    const contentType = typeof body.content_type === "string" ? body.content_type : "";
    if (!isMimeAllowedForTenantMedia(contentType)) {
      return NextResponse.json(
        { error: `content_type must be one of: ${TENANT_MEDIA_IMAGE_TYPES.join(", ")}` },
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

    const config = TENANT_MEDIA_KINDS[kind];
    if (sizeBytes > config.maxBytes) {
      return NextResponse.json(
        { error: `File too large. Max ${Math.round(config.maxBytes / 1024 / 1024)}MB.` },
        { status: 413 }
      );
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Key layout: {org_id}/{kind_prefix}/{uuid}.{ext}
    // Org-id segment lets /complete enforce ownership and lets us purge a
    // tenant's media in one bucket prefix if we ever need to.
    const rawExt = contentType.split("/")[1] ?? "jpg";
    const ext = rawExt === "jpeg" ? "jpg" : rawExt;
    const uuid = crypto.randomUUID();
    const key = `${orgId}/${config.prefix}/${uuid}.${ext}`;

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
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
