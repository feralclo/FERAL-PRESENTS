import { redirect } from "next/navigation";

/**
 * Redirect old invite URLs to the new standalone route.
 * /admin/invite/[token] → /invite/[token]
 */
export default async function LegacyInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/invite/${token}`);
}
