import type { Metadata } from "next";
import Script from "next/script";
import { CookieConsent } from "@/components/layout/CookieConsent";
import { Scanlines } from "@/components/layout/Scanlines";
import { GTM_ID, TABLES, marketingKey } from "@/lib/constants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgId } from "@/lib/org";
import { OrgProvider } from "@/components/OrgProvider";
import type { MarketingSettings } from "@/types/marketing";
import "@/styles/base.css";
import "@/styles/effects.css";
import "@/styles/cookie.css";

export const metadata: Metadata = {
  title: "Entry — Events & Tickets",
  description:
    "Events, tickets, and experiences. Powered by Entry.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const orgId = await getOrgId();

  // Fetch marketing settings — Meta Pixel + GTM ID per tenant.
  // Single lightweight query, cached for the request lifecycle.
  let pixelId: string | null = null;
  let gtmId: string | null = GTM_ID || null;
  try {
    const supabase = await getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", marketingKey(orgId))
        .single();
      const marketing = data?.data as MarketingSettings | null;
      if (marketing?.meta_tracking_enabled && marketing.meta_pixel_id) {
        pixelId = marketing.meta_pixel_id;
      }
      if (marketing?.gtm_id) {
        gtmId = marketing.gtm_id;
      }
    }
  } catch {
    // Silent — pixel/GTM are non-critical, page must still render
  }

  return (
    <html lang="en">
      <head>
        {/* Meta Pixel — MUST be in <head> for Pixel Helper + Test Events detection.
            Raw <script> tag (not Next.js <Script>) so it renders as a synchronous
            inline script in the initial HTML, exactly like Shopify does it.
            The Pixel Helper Chrome extension specifically looks in <head>. */}
        {pixelId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');var pvId='pv-'+Date.now()+'-'+Math.random().toString(36).substr(2,9);fbq('track','PageView',{},{eventID:pvId});window.__META_HTML_PAGEVIEW_ID=pvId;`,
            }}
          />
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
        {gtmId && (
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
        )}

        {/* Google Tag Manager — per-tenant ID from marketing settings */}
        {gtmId && (
          <Script id="gtm-script" strategy="afterInteractive">
            {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmId}');
            `}
          </Script>
        )}
      </head>
      <body>
        {/* GTM noscript fallback */}
        {gtmId && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}

        <Scanlines />
        <OrgProvider orgId={orgId}>
          {children}
        </OrgProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
