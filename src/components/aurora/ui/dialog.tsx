"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const AuroraDialog = DialogPrimitive.Root;
const AuroraDialogTrigger = DialogPrimitive.Trigger;
const AuroraDialogClose = DialogPrimitive.Close;
const AuroraDialogPortal = DialogPrimitive.Portal;

function AuroraDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "aurora-dialog-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
        className
      )}
      {...props}
    />
  );
}

function AuroraDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <AuroraDialogPortal>
      <AuroraDialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "aurora-dialog-content fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
          "aurora-glass-strong rounded-2xl p-6 shadow-xl",
          "focus:outline-none",
          "max-md:bottom-0 max-md:top-auto max-md:left-0 max-md:translate-x-0 max-md:translate-y-0",
          "max-md:max-w-full max-md:rounded-b-none max-md:aurora-sheet-content",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </AuroraDialogPortal>
  );
}

function AuroraDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function AuroraDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold text-aurora-text", className)}
      {...props}
    />
  );
}

function AuroraDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-aurora-text-secondary", className)}
      {...props}
    />
  );
}

export {
  AuroraDialog,
  AuroraDialogTrigger,
  AuroraDialogClose,
  AuroraDialogPortal,
  AuroraDialogOverlay,
  AuroraDialogContent,
  AuroraDialogHeader,
  AuroraDialogTitle,
  AuroraDialogDescription,
};
