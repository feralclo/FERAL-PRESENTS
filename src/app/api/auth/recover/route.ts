import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/constants";

/**
 * POST /api/auth/recover — Emergency admin account recovery
 *
 * Creates a new Supabase Auth admin user when you've been locked out.
 * Protected by requiring the first 32 characters of the SUPABASE_SERVICE_ROLE_KEY
 * as a token — only someone with access to env vars can use this.
 *
 * Body: { email: string, password: string, token: string }
 *
 * TEMPORARY: Remove this route once admin access is restored.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, token } = await request.json();

    if (!email || !password || !token) {
      return NextResponse.json(
        { error: "email, password, and token are required" },
        { status: 400 }
      );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey || !SUPABASE_URL) {
      return NextResponse.json(
        { error: "Server not configured for recovery" },
        { status: 503 }
      );
    }

    // Verify token matches the first 32 chars of the service role key
    const expectedToken = serviceRoleKey.substring(0, 32);
    if (token !== expectedToken) {
      return NextResponse.json(
        { error: "Invalid recovery token" },
        { status: 403 }
      );
    }

    const adminClient = createClient(SUPABASE_URL, serviceRoleKey);

    // Check if user already exists (might just need password reset)
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (existing) {
      // User exists — update their password and ensure admin flag
      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        existing.id,
        {
          password,
          email_confirm: true,
          app_metadata: { is_admin: true },
        }
      );

      if (updateError) {
        return NextResponse.json(
          { error: `Failed to update user: ${updateError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        recovered: true,
        action: "updated_existing",
        message: "Admin account restored. You can now log in.",
      });
    }

    // Create new admin user
    const { data: newUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { is_admin: true },
      });

    if (createError) {
      return NextResponse.json(
        { error: `Failed to create user: ${createError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      recovered: true,
      action: "created_new",
      userId: newUser.user.id,
      message: "Admin account created. You can now log in.",
    });
  } catch (err) {
    console.error("[auth/recover] Error:", err);
    return NextResponse.json(
      { error: "Recovery failed" },
      { status: 500 }
    );
  }
}
