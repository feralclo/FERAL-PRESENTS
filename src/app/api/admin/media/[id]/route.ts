import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";
import * as Sentry from "@sentry/nextjs";

const BUCKET = "tenant-media";

/**
 * DELETE /api/admin/media/[id] — soft-delete a tenant_media row.
 *
 * Refuses if the URL is in use by any rep_quest. Pass ?force=true to
 * delete anyway (the quest covers stay valid because the storage object
 * isn't removed until the soft-delete is sweeped).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const orgId = auth.orgId;
    const { id } = await params;

    const db = await getSupabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: row, error: fetchError } = await db
      .from("tenant_media")
      .select("id, org_id, url, storage_key, source")
      .eq("id", id)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (row.org_id !== orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const force = request.nextUrl.searchParams.get("force") === "true";
    if (!force) {
      const { count } = await db
        .from("rep_quests")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("cover_image_url", row.url);

      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error: "Image is in use",
            in_use_count: count,
            hint: "Pass ?force=true to delete anyway. Quests already using the URL keep working until you reassign.",
          },
          { status: 409 }
        );
      }
    }

    // Soft-delete the row first (fast). Storage cleanup happens after — if
    // it fails we log it; the row stays soft-deleted, the orphan can be
    // cleaned up by a future sweeper.
    const { error: updateError } = await db
      .from("tenant_media")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      Sentry.captureException(updateError, { extra: { id, orgId } });
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    if (row.source === "upload" && row.storage_key) {
      const { error: storageError } = await db.storage
        .from(BUCKET)
        .remove([row.storage_key]);
      if (storageError) {
        Sentry.captureException(storageError, {
          extra: { id, orgId, storage_key: row.storage_key },
        });
      }
    }

    return NextResponse.json({ data: { id, deleted: true } });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
