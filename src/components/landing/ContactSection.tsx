"use client";

import { useState, useCallback, useRef } from "react";
import { subscribeToKlaviyo } from "@/lib/klaviyo";

export function ContactSection() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [statusClass, setStatusClass] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email) return;

      setStatus("> TRANSMITTING...");
      setStatusClass("");

      const result = await subscribeToKlaviyo(email);

      if (result.success) {
        setStatus("> TRANSMISSION RECEIVED. STAND BY.");
        setStatusClass("contact__status--success");
        setEmail("");
      } else {
        setStatus("> CONNECTION FAILED. TRY AGAIN.");
        setStatusClass("");
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setStatus("");
        setStatusClass("");
      }, 4000);
    },
    [email]
  );

  return (
    <section className="contact" id="contact">
      <div className="container">
        <div className="contact__inner" data-reveal="">
          <span className="section-header__label">[TRANSMISSION]</span>
          <h2 className="contact__title">
            Stay connected<span className="text-red">_</span>
          </h2>
          <p className="contact__text">
            Get early access to tickets and event intel before anyone else.
          </p>
          <form className="contact__form" onSubmit={handleSubmit}>
            <div className="contact__input-wrapper">
              <input
                type="email"
                className="contact__input"
                placeholder="enter_email@"
                required
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" className="btn btn--primary contact__submit">
                SUBMIT
              </button>
            </div>
            <p className={`contact__status ${statusClass}`}>{status}</p>
          </form>
          <div className="contact__socials">
            <a
              href="https://www.instagram.com/feralclo/"
              className="contact__social-link"
              aria-label="Instagram"
              target="_blank"
              rel="noopener"
            >
              IG
            </a>
            <a
              href="https://www.tiktok.com/@feralclo"
              className="contact__social-link"
              aria-label="TikTok"
              target="_blank"
              rel="noopener"
            >
              TK
            </a>
            <a
              href="https://www.facebook.com/feralclo"
              className="contact__social-link"
              aria-label="Facebook"
              target="_blank"
              rel="noopener"
            >
              FB
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
