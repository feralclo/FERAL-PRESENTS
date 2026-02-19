import type { Metadata } from "next";
import Script from "next/script";
import { CookieConsent } from "@/components/layout/CookieConsent";
import { Scanlines } from "@/components/layout/Scanlines";
import { GTM_ID } from "@/lib/constants";
import { fetchMarketingSettings } from "@/lib/meta";
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch Meta Pixel ID server-side so it can be injected directly in the HTML.
  // This makes the pixel available immediately on page load (like Shopify),
  // so Meta's Pixel Helper and Test Events tool detect it instantly.
  const marketing = await fetchMarketingSettings().catch(() => null);
  const pixelId = marketing?.meta_tracking_enabled ? marketing.meta_pixel_id : null;

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

        {/* Meta Pixel — injected server-side for immediate availability.
            Only loads the base code + init. Events (PageView, ViewContent, etc.)
            are fired by useMetaTracking hook with CAPI deduplication. */}
        {pixelId && (
          <Script id="meta-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${pixelId}');
              var pvId='pv-'+Date.now()+'-'+Math.random().toString(36).substr(2,9);
              fbq('track','PageView',{},{eventID:pvId});
              window.__META_HTML_PAGEVIEW_ID=pvId;
            `}
          </Script>
        )}
        {pixelId && (
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        )}

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
