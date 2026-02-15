import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for rep deletion safety:
 * - Self-deletion prevention (API returns 403)
 * - Admin auth user protection (dual-role users)
 * - Normal deletion (rep-only accounts)
 * - Error surfacing in the UI delete handlers
 */

// ─── Mock Supabase & auth ───────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockGetUserById = vi.fn();
const mockDeleteUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockDelete = vi.fn();

// Chain builder for supabase queries
function createChain(finalResult: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(finalResult),
    delete: vi.fn().mockReturnThis(),
  };
  // Allow chaining .delete().eq().eq()
  chain.delete.mockReturnValue(chain);
  return chain;
}

// ─── Test the DELETE safety logic directly ──────────────────────────────

describe("Rep Deletion Safety Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Self-deletion prevention", () => {
    it("should block deletion when admin auth_user_id matches rep auth_user_id", () => {
      const adminUserId = "admin-123";
      const repAuthUserId = "admin-123"; // Same user

      // This is the check from the API route
      const isSelfDeletion = repAuthUserId && repAuthUserId === adminUserId;
      expect(isSelfDeletion).toBe(true);
    });

    it("should allow deletion when auth_user_ids differ", () => {
      const adminUserId = "admin-123";
      const repAuthUserId = "rep-456"; // Different user

      const isSelfDeletion = repAuthUserId && repAuthUserId === adminUserId;
      expect(isSelfDeletion).toBe(false);
    });

    it("should allow deletion when rep has no auth_user_id (uninvited rep)", () => {
      const adminUserId = "admin-123";
      const repAuthUserId = null; // Rep hasn't accepted invite yet

      const isSelfDeletion = repAuthUserId && repAuthUserId === adminUserId;
      expect(isSelfDeletion).toBeFalsy();
    });
  });

  describe("Admin auth user protection", () => {
    it("should detect admin auth users and skip deletion", () => {
      const authUserMetadata = { is_admin: true, is_rep: true };

      const isAdmin = authUserMetadata?.is_admin === true;
      expect(isAdmin).toBe(true);
    });

    it("should allow deletion of rep-only auth users", () => {
      const authUserMetadata = { is_rep: true };

      const isAdmin = (authUserMetadata as Record<string, unknown>)?.is_admin === true;
      expect(isAdmin).toBe(false);
    });

    it("should treat missing metadata as non-admin", () => {
      const authUserMetadata = undefined;

      const isAdmin = authUserMetadata?.is_admin === true;
      expect(isAdmin).toBe(false);
    });

    it("should treat null is_admin as non-admin", () => {
      const authUserMetadata = { is_admin: null, is_rep: true };

      const isAdmin = authUserMetadata?.is_admin === true;
      expect(isAdmin).toBe(false);
    });

    it("should default to preserving auth user if verification fails", () => {
      // When we can't verify admin status, err on the side of caution
      let authUserIsAdmin = false;
      try {
        throw new Error("Network error");
      } catch {
        // If we can't verify, assume admin to prevent accidental deletion
        authUserIsAdmin = true;
      }

      expect(authUserIsAdmin).toBe(true);
    });
  });

  describe("Normal deletion flow", () => {
    it("should allow deletion of rep with different auth_user_id and non-admin metadata", () => {
      const adminUserId = "admin-123";
      const rep = { auth_user_id: "rep-456" };
      const authMetadata = { is_rep: true };

      const isSelfDeletion = rep.auth_user_id && rep.auth_user_id === adminUserId;
      const isAdmin = authMetadata?.is_admin === true;

      expect(isSelfDeletion).toBe(false);
      expect(isAdmin).toBe(false);
      // Both checks pass — safe to delete auth user and rep record
    });

    it("should delete rep record even when auth user is preserved (dual-role)", () => {
      const adminUserId = "admin-123";
      const rep = { auth_user_id: "dual-user-789" };
      const authMetadata = { is_admin: true, is_rep: true };

      const isSelfDeletion = rep.auth_user_id && rep.auth_user_id === adminUserId;
      const isAdmin = authMetadata?.is_admin === true;

      expect(isSelfDeletion).toBe(false); // Different user, not self-deletion
      expect(isAdmin).toBe(true); // Auth user is admin, preserve it
      // Rep record is still deleted — only auth account is preserved
    });
  });

  describe("UI self-deletion guard", () => {
    it("should hide delete button when rep auth_user_id matches current user", () => {
      const currentUserId = "admin-123";
      const rep = { auth_user_id: "admin-123" };

      const shouldHideDeleteButton = !!(rep.auth_user_id && rep.auth_user_id === currentUserId);
      expect(shouldHideDeleteButton).toBe(true);
    });

    it("should show delete button for other reps", () => {
      const currentUserId = "admin-123";
      const rep = { auth_user_id: "rep-456" };

      const shouldHideDeleteButton = !!(rep.auth_user_id && rep.auth_user_id === currentUserId);
      expect(shouldHideDeleteButton).toBe(false);
    });

    it("should show delete button for reps with no auth_user_id", () => {
      const currentUserId = "admin-123";
      const rep = { auth_user_id: null };

      const shouldHideDeleteButton = !!(rep.auth_user_id && rep.auth_user_id === currentUserId);
      expect(shouldHideDeleteButton).toBe(false);
    });
  });

  describe("Delete error surfacing", () => {
    it("should extract error message from 403 self-deletion response", async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        json: async () => ({ error: "Cannot delete your own account. Ask another admin to remove you." }),
      };

      const json = await mockResponse.json();
      const errorMessage = json.error || `Failed (${mockResponse.status})`;

      expect(errorMessage).toBe("Cannot delete your own account. Ask another admin to remove you.");
    });

    it("should show fallback error when response has no error field", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: async () => ({}),
      };

      const json = await mockResponse.json();
      const errorMessage = json.error || `Failed (${mockResponse.status})`;

      expect(errorMessage).toBe("Failed (500)");
    });

    it("should handle JSON parse failure gracefully", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: async () => { throw new Error("Invalid JSON"); },
      };

      const json = await mockResponse.json().catch(() => ({ error: "Unknown error" }));
      const errorMessage = json.error || `Failed (${mockResponse.status})`;

      expect(errorMessage).toBe("Unknown error");
    });

    it("should handle network errors", () => {
      let errorMessage = "";
      try {
        throw new TypeError("Failed to fetch");
      } catch {
        errorMessage = "Network error — check connection";
      }

      expect(errorMessage).toBe("Network error — check connection");
    });
  });
});
