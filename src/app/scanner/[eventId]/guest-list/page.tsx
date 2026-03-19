"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GuestListSearch } from "@/components/scanner/GuestListSearch";

export default function ScannerGuestListPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  return (
    <div className="px-4 py-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push(`/scanner/${eventId}`)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Guest List</h1>
      </div>

      <GuestListSearch eventId={eventId} onCheckIn={() => {}} />
    </div>
  );
}
