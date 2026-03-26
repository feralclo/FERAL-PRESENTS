import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";
import { escapeHtml, resolveUrl } from "@/lib/email-templates";

export interface GuestListOutreachEmailOpts {
  eventName: string;
  eventDate: string;
  venue: string;
  applyUrl: string;
  orgName: string;
  accentColor?: string;
  logoUrl?: string;
  logoHeight?: number;
  logoAspectRatio?: number;
  footerText?: string;
  customSubject?: string;
  price?: number;
  currencySymbol?: string;
}

/**
 * Build a guest list outreach email for promoters to send via their ESP.
 *
 * Dark hero design (matches announcement/abandoned-cart emails):
 * accent bar → logo → badge → heading → event mini-card → CTA → scarcity copy.
 *
 * Copy: premium restraint. Exclusivity + urgency, no hype.
 */
export function buildGuestListOutreachEmail(
  settings: EmailSettings,
  opts: GuestListOutreachEmailOpts,
): { subject: string; html: string; text: string } {
  const s = { ...DEFAULT_EMAIL_SETTINGS, ...settings };
  const accent = opts.accentColor || s.accent_color || "#8B5CF6";
  const logoUrl = resolveUrl(opts.logoUrl || s.logo_url);

  // Logo dimensions
  const configuredH = Math.min(s.logo_height || 48, 100);
  let logoH = configuredH;
  let logoW: number | undefined;
  if (s.logo_aspect_ratio && logoUrl) {
    logoW = Math.round(configuredH * s.logo_aspect_ratio);
    if (logoW > 280) {
      logoW = 280;
      logoH = Math.round(280 / s.logo_aspect_ratio);
    }
  }

  const subject = opts.customSubject || `Guest List — ${opts.eventName}`;
  const eventDetails = [opts.eventDate, opts.venue].filter(Boolean).join(" · ");
  const orgName = escapeHtml(opts.orgName);
  const eventName = escapeHtml(opts.eventName);

  // Price line (only for paid campaigns)
  const priceLine =
    opts.price && opts.price > 0
      ? `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
                            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: ${accent};">
                              From ${escapeHtml(opts.currencySymbol || "£")}${opts.price}
                            </div>
                          </div>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-font-smoothing: antialiased; color-scheme: light only;">
  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.12);">

          <!-- DARK HERO BLOCK -->
          <tr>
            <td style="background-color: #0e0e0e; background-image: linear-gradient(#0e0e0e, #111111); padding: 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                <!-- Accent bar -->
                <tr>
                  <td style="height: 4px; background-color: ${accent};"></td>
                </tr>

                <!-- Logo -->
                <tr>
                  <td style="padding: 40px 40px 0; text-align: center;">
                    ${
                      logoUrl
                        ? `<img src="${escapeHtml(logoUrl)}" alt="${orgName}"${logoW ? ` width="${logoW}"` : ""} height="${logoH}" style="${logoW ? `width: ${logoW}px` : "width: auto"}; height: ${logoH}px; display: inline-block;">`
                        : `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #ffffff;">${orgName}</div>`
                    }
                  </td>
                </tr>

                <!-- Badge -->
                <tr>
                  <td style="padding: 24px 40px 0; text-align: center;">
                    <div style="display: inline-block; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${accent}; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 6px 16px;">
                      GUEST LIST
                    </div>
                  </td>
                </tr>

                <!-- Heading -->
                <tr>
                  <td style="padding: 20px 40px 12px; text-align: center;">
                    <h1 style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 26px; font-weight: 700; color: #ffffff; line-height: 1.25;">
                      Guest list for ${eventName} is now open.
                    </h1>
                  </td>
                </tr>

                <!-- Message -->
                <tr>
                  <td style="padding: 0 40px 36px; text-align: center;">
                    <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #999999;">
                      Apply now to secure your spot.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- WHITE CONTENT AREA -->
          <tr>
            <td style="background-color: #ffffff; padding: 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                <!-- Event Details — dark mini-card -->
                <tr>
                  <td style="padding: 32px 40px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius: 10px; overflow: hidden;">
                      <tr>
                        <td style="background-color: #111111; background-image: linear-gradient(135deg, #111111, #1a1a1a); border-radius: 10px; padding: 20px 24px;">
                          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${accent}; margin-bottom: 10px;">
                            GUEST LIST
                          </div>
                          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 6px; line-height: 1.3;">
                            ${eventName}
                          </div>
                          ${
                            eventDetails
                              ? `<div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #888888; margin-bottom: 2px;">${escapeHtml(eventDetails)}</div>`
                              : ""
                          }${priceLine}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CTA Button -->
                <tr>
                  <td style="padding: 32px 40px 0; text-align: center;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(opts.applyUrl)}" style="height:52px;v-text-anchor:middle;width:100%;" arcsize="14%" fill="t">
                      <v:fill type="tile" color="${accent}" />
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:bold;letter-spacing:0.5px;">Apply Now</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${escapeHtml(opts.applyUrl)}" style="display: block; background-color: ${accent}; color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 15px; font-weight: 700; letter-spacing: 0.5px; text-decoration: none; padding: 16px 24px; border-radius: 10px; text-align: center; mso-padding-alt: 0;">
                      Apply Now
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>

                <!-- Scarcity copy -->
                <tr>
                  <td style="padding: 20px 40px 36px; text-align: center;">
                    <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.6; color: #999999;">
                      Spaces are limited. Applications are reviewed on a first-come basis.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #fafafa; padding: 24px 40px; text-align: center;">
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #bbbbbb; margin-bottom: 8px;">
                ${escapeHtml(opts.footerText || s.footer_text || opts.orgName)}
              </div>
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; line-height: 1.6; color: #bbbbbb;">
                You\u2019re receiving this because you\u2019re on the ${orgName} mailing list.
              </div>
            </td>
          </tr>

        </table>
        <!-- /Container -->

      </td>
    </tr>
  </table>
  <!-- /Wrapper -->
</body>
</html>`;

  const text = `Guest list for ${opts.eventName} is now open.

Apply now to secure your spot.

${opts.eventName}
${eventDetails}${opts.price && opts.price > 0 ? `\nFrom ${opts.currencySymbol || "£"}${opts.price}` : ""}

Apply: ${opts.applyUrl}

Spaces are limited. Applications are reviewed on a first-come basis.

${opts.orgName}`;

  return { subject, html, text };
}
