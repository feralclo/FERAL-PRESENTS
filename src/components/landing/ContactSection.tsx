"use client";

import { useState, useCallback, useRef } from "react";
import { subscribeToKlaviyo } from "@/lib/klaviyo";

export function ContactSection() {
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

  return (
    <section id="contact" className="py-28 max-md:py-20 bg-background">
      {/* Top divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent mb-20 max-md:mb-14" />

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

        <div className="flex justify-center gap-6">
          {[
            {
              href: "https://www.instagram.com/feralclo/",
              label: "Instagram",
              text: "IG",
            },
            {
              href: "https://www.tiktok.com/@feralclo",
              label: "TikTok",
              text: "TK",
            },
            {
              href: "https://www.facebook.com/feralclo",
              label: "Facebook",
              text: "FB",
            },
          ].map((link) => (
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
      </div>
    </section>
  );
}
