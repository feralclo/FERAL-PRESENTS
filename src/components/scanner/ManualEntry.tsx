"use client";

import { useState } from "react";
import { Keyboard, Search } from "lucide-react";

interface ManualEntryProps {
  onSubmit: (code: string) => void;
  loading: boolean;
}

export function ManualEntry({ onSubmit, loading }: ManualEntryProps) {
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed) {
      onSubmit(trimmed);
      setCode("");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/80 backdrop-blur px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all w-full justify-center"
      >
        <Keyboard size={16} />
        Type ticket code manually
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="FERAL-XXXXXXXX"
        className="flex-1 rounded-lg border border-input bg-background/50 px-4 py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/15"
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
      <button
        type="submit"
        disabled={loading || !code.trim()}
        className="rounded-lg bg-primary px-4 py-2.5 text-white transition-all hover:bg-primary/85 disabled:opacity-50"
      >
        <Search size={18} />
      </button>
    </form>
  );
}
