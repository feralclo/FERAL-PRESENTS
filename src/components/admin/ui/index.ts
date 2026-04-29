/**
 * Admin design-language wrappers.
 *
 * Inside `/admin/*` always import from here, never reach for `@/components/ui/*`
 * directly. The wrappers lock in our patterns (typography, spacing, focus rings,
 * loading states) so a new admin surface can be built without designer input
 * and stays consistent as the language evolves.
 *
 * Migration tracker lives at the bottom of `docs/admin-ux-design.md`. Add the
 * page when you migrate it.
 */

export { AdminButton, adminButtonVariants } from "./button";
export type { AdminButtonProps } from "./button";

export {
  AdminCard,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminCardContent,
  AdminCardFooter,
  AdminPanel,
} from "./card";
export type { AdminCardProps } from "./card";

export { AdminEmptyState } from "./empty-state";

export { AdminPageHeader } from "./page-header";

export { AdminSkeleton } from "./skeleton";

export { AdminBadge, AdminStatusBadge } from "./badge";
export type { AdminBadgeProps } from "./badge";
