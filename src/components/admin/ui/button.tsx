"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * AdminButton — the canonical admin action.
 *
 * Wraps shadcn's button primitive with the admin design language locked in:
 * predictable variants, baked-in loading state, optional left/right icons.
 * Inside `/admin/*`, prefer this over the raw `Button` from `components/ui`.
 *
 * Quality bar: matches the primary CTA in `FinishSection.tsx` — solid violet,
 * subtle shadow, 1px hover lift, never a rotating gradient.
 */
const buttonVariants = cva(
  // Base — focus ring + sizing baseline. The :focus-visible ring is non-negotiable;
  // it's the single most-broken interaction in the legacy admin and we fix it here.
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200 outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-[0_8px_28px_-8px_rgba(139,92,246,0.55),inset_0_1px_0_rgba(255,255,255,0.18)] hover:translate-y-[-1px] hover:shadow-[0_14px_32px_-10px_rgba(139,92,246,0.7),inset_0_1px_0_rgba(255,255,255,0.22)] active:translate-y-0",
        secondary:
          "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.09]",
        outline:
          "border border-border/60 bg-transparent text-foreground hover:border-primary/40 hover:bg-foreground/[0.03]",
        ghost:
          "bg-transparent text-foreground hover:bg-foreground/[0.04]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_8px_24px_-10px_rgba(244,63,94,0.45)] hover:bg-destructive/90 hover:translate-y-[-1px] active:translate-y-0",
        link:
          "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-sm [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface AdminButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof buttonVariants> {
  /** When true, shows a spinner in place of the left icon and disables the button. Width stays stable. */
  loading?: boolean;
  /** Render an icon on the leading edge. Pass a lucide-react element. */
  leftIcon?: React.ReactNode;
  /** Render an icon on the trailing edge. Pass a lucide-react element. */
  rightIcon?: React.ReactNode;
  /** Render as a child (e.g. `<Link>`) — uses Radix Slot. Loading state is ignored when asChild. */
  asChild?: boolean;
}

export const AdminButton = React.forwardRef<HTMLButtonElement, AdminButtonProps>(
  function AdminButton(
    {
      className,
      variant,
      size,
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      asChild = false,
      children,
      ...props
    },
    ref
  ) {
    const Comp = asChild ? Slot.Root : "button";

    if (asChild) {
      return (
        <Comp
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={loading || disabled}
        data-loading={loading || undefined}
        {...props}
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </Comp>
    );
  }
);

export { buttonVariants as adminButtonVariants };
