"use client";

import { useState, useCallback, useRef } from "react";
import { subscribeToKlaviyo } from "@/lib/klaviyo";
import { useBranding } from "@/hooks/useBranding";

export function ContactSection() {
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email) return;

      setStatus("> TRANSMITTING...");
      setIsSuccess(false);

      const result = await subscribeToKlaviyo(email);

      // Fire-and-forget: capture to DB as a customer record
      fetch("/api/popup/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing_contact" }),
      }).catch(() => {});

      if (result.success) {
        setStatus("> TRANSMISSION RECEIVED. STAND BY.");
        setIsSuccess(true);
        setEmail("");
      } else {
        setStatus("> CONNECTION FAILED. TRY AGAIN.");
        setIsSuccess(false);
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setStatus("");
        setIsSuccess(false);
      }, 4000);
    },
    [email]
  );

  // Build social links from branding settings
  const socialLinks = [
    branding.social_links?.instagram && { href: branding.social_links.instagram, label: "Instagram", text: "IG" },
    branding.social_links?.tiktok && { href: branding.social_links.tiktok, label: "TikTok", text: "TK" },
    branding.social_links?.facebook && { href: branding.social_links.facebook, label: "Facebook", text: "FB" },
  ].filter(Boolean) as { href: string; label: string; text: string }[];

  return (
    <section id="contact" className="py-20 max-md:py-14 bg-background">
      {/* Top divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent mb-14 max-md:mb-10" />

      <div
        className="max-w-[560px] mx-auto px-6 max-md:px-4 text-center"
        data-reveal=""
      >
        <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.25em] uppercase text-primary mb-4 block">
          [TRANSMISSION]
        </span>

        <h2 className="font-[family-name:var(--font-mono)] text-[clamp(28px,4vw,44px)] font-bold tracking-[0.12em] uppercase mt-4 mb-4">
          Stay connected
          <span className="text-primary">_</span>
        </h2>

        <p className="font-[family-name:var(--font-display)] text-[15px] text-foreground/50 mb-8 leading-[1.7]">
          Get early access to tickets and event intel before anyone else.
        </p>

        <form className="mb-10" onSubmit={handleSubmit}>
          <div className="flex max-md:flex-col border border-foreground/[0.12] bg-foreground/[0.03] overflow-hidden transition-colors duration-300 focus-within:border-primary">
            <input
              type="email"
              placeholder="enter_email@"
              required
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-transparent border-none px-5 py-4 font-[family-name:var(--font-mono)] text-[13px] tracking-[0.05em] text-foreground outline-none placeholder:text-foreground/30"
            />
            <button
              type="submit"
              className="whitespace-nowrap px-7 py-4 max-md:w-full bg-primary text-foreground font-[family-name:var(--font-sans)] text-xs font-bold tracking-[0.02em] uppercase transition-all duration-300 hover:brightness-110 cursor-pointer"
            >
              SUBMIT
            </button>
          </div>
          <p
            className={`font-[family-name:var(--font-mono)] text-xs tracking-[0.05em] mt-3 min-h-[20px] ${
              isSuccess ? "text-primary" : "text-foreground/40"
            }`}
          >
            {status}
          </p>
        </form>

        {socialLinks.length > 0 && (
          <div className="flex justify-center gap-6">
            {socialLinks.map((link) => (
              <a
                key={link.text}
                href={link.href}
                className="font-[family-name:var(--font-mono)] text-xs tracking-[0.25em] text-foreground/40 px-3 py-2 border border-foreground/[0.08] transition-all duration-300 hover:text-primary hover:border-primary hover:shadow-[0_0_20px_rgba(255,0,51,0.15)]"
                aria-label={link.label}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.text}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
