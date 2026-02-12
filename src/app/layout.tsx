import type { Metadata } from "next";
import Script from "next/script";
import { CookieConsent } from "@/components/layout/CookieConsent";
import { Scanlines } from "@/components/layout/Scanlines";
import { GTM_ID } from "@/lib/constants";
import "@/styles/base.css";
import "@/styles/effects.css";
import "@/styles/cookie.css";

export const metadata: Metadata = {
  title: "FERAL PRESENTS",
  description:
    "Underground events, curated experiences. Tickets, merch, and more.",
  icons: {
    icon: "/images/FERAL LOGO.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Fonts — loaded via Google Fonts CDN (same as existing site) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />

        {/* GTM Consent Mode defaults — track by default, revoke on explicit opt-out */}
        <Script id="gtm-consent-defaults" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
              'ad_storage': 'granted',
              'ad_user_data': 'granted',
              'ad_personalization': 'granted',
              'analytics_storage': 'granted',
              'functionality_storage': 'granted',
              'security_storage': 'granted'
            });
          `}
        </Script>

        {/* Google Tag Manager */}
        <Script id="gtm-script" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
      </head>
      <body>
        {/* GTM noscript fallback */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>

        <Scanlines />
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
