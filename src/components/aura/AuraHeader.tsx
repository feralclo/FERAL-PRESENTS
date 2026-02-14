"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useBranding } from "@/hooks/useBranding";
import { Menu, X } from "lucide-react";

interface AuraHeaderProps {
  eventName?: string;
}

export function AuraHeader({ eventName }: AuraHeaderProps) {
  const branding = useBranding();
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding?.logo_url || "/images/FERAL%20LOGO.svg"}
            alt={branding?.org_name || "FERAL PRESENTS"}
            className="h-5"
            data-branding="logo"
            style={branding?.logo_width ? { width: branding.logo_width, height: "auto" } : undefined}
          />
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => scrollTo("tickets")}>
            Tickets
          </Button>
          <Button variant="ghost" size="sm" onClick={() => scrollTo("about")}>
            About
          </Button>
          <Button variant="ghost" size="sm" onClick={() => scrollTo("lineup")}>
            Lineup
          </Button>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => scrollTo("tickets")}>
            Get Tickets
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="border-t border-border bg-background md:hidden">
          <nav className="mx-auto max-w-5xl flex flex-col px-4 py-2">
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => scrollTo("tickets")}>
              Tickets
            </Button>
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => scrollTo("about")}>
              About
            </Button>
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => scrollTo("lineup")}>
              Lineup
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
