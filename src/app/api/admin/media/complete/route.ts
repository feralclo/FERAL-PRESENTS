import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";
import {
  TENANT_MEDIA_KINDS,
  TENANT_MEDIA_IMAGE_TYPES,
  isTenantMediaKind,
  type TenantMediaKind,
} from "@/lib/uploads/tenant-media-config";

const BUCKET = "tenant-media";

const PREFIX_TO_KIND: Record<string, TenantMediaKind> = Object.fromEntries(
  Object.entries(TENANT_MEDIA_KINDS).map(([kind, cfg]) => [cfg.prefix, kind as TenantMediaKind])
);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;

    let body: {
      key?: unknown;
      kind?: unknown;
      width?: unknown;
      height?: unknown;
      tags?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const key = typeof body.key === "string" ? body.key : "";
    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    // Key format: {org_id}/{kind_prefix}/{uuid}.{ext}
    const parts = key.split("/");
    if (parts.length !== 3) {
      return NextResponse.json({ error: "Invalid key format" }, { status: 400 });
    }
    const [orgInKey, kindPrefix, filename] = parts;

    if (orgInKey !== orgId) {
      return NextResponse.json(
        { error: "Key does not belong to this org" },
        { status: 403 }
      );
    }

    const kindFromPrefix = PREFIX_TO_KIND[kindPrefix];
    if (!kindFromPrefix) {
      return NextResponse.json({ error: "Invalid kind prefix" }, { status: 400 });
    }

    // If the caller passed an explicit kind, it must agree with the prefix.
    const declaredKind = typeof body.kind === "string" ? body.kind : kindFromPrefix;
    if (!isTenantMediaKind(declaredKind) || declaredKind !== kindFromPrefix) {
      return NextResponse.json({ error: "kind/prefix mismatch" }, { status: 400 });
    }

    if (!/^[0-9a-f-]{36}\.[a-z]{3,5}$/i.test(filename)) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Verify the object exists in storage — protects against clients
    // skipping the PUT and posting a fake key.
    const { data: list, error: listError } = await db.storage
      .from(BUCKET)
      .list(`${orgInKey}/${kindPrefix}`, { search: filename, limit: 1 });

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

    const meta = (typeof obj.metadata === "object" && obj.metadata !== null
      ? (obj.metadata as { size?: number; mimetype?: string })
      : {}) ?? {};
    const size = meta.size ?? 0;
    const mimeType = meta.mimetype ?? "";
    const cap = TENANT_MEDIA_KINDS[declaredKind].maxBytes;
    if (size > cap) {
      await db.storage.from(BUCKET).remove([key]);
      return NextResponse.json(
        { error: `Uploaded file exceeds ${Math.round(cap / 1024 / 1024)}MB cap.` },
        { status: 413 }
      );
    }
    if (mimeType && !(TENANT_MEDIA_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
      await db.storage.from(BUCKET).remove([key]);
      return NextResponse.json({ error: "MIME type not allowed" }, { status: 415 });
    }

    const publicUrl = db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

    // Pull width/height from the client if it measured them — saves us a
    // server-side image-decode step. Defensive parse: ignore if not finite ints.
    const width = Number.isInteger(body.width) ? (body.width as number) : null;
    const height = Number.isInteger(body.height) ? (body.height as number) : null;
    const tags =
      Array.isArray(body.tags) && body.tags.every((t) => typeof t === "string")
        ? (body.tags as string[]).slice(0, 16)
        : [];

    const { data: row, error: insertError } = await db
      .from("tenant_media")
      .insert({
        org_id: orgId,
        kind: declaredKind,
        source: "upload",
        url: publicUrl,
        storage_key: key,
        width,
        height,
        file_size_bytes: size,
        mime_type: mimeType || null,
        tags,
        created_by_user_id: auth.user.id,
      })
      .select("*")
      .single();

    if (insertError || !row) {
      Sentry.captureException(insertError ?? new Error("insert failed"), {
        extra: { key },
      });
      return NextResponse.json(
        { error: "Failed to save media row" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: row });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
