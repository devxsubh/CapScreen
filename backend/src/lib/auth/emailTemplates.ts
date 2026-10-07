import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAppName, getEmailLogoUrl, getFrontendUrl } from "./emailConfig";
import { escapeHtml } from "../escapeHtml";

const BLACK = "#000000";
const WHITE = "#ffffff";
const GRAY_BG = "#f5f5f5";
const GRAY_BORDER = "#e5e5e5";
const GRAY_MUTED = "#737373";
const GRAY_BODY = "#404040";
const GRAY_FOOTER_BG = "#fafafa";

let cachedLogoSvgMarkup: string | null = null;

function prepareSvgForEmail(raw: string): string {
  return raw
    .replace(/<\?xml[^?]*\?>\s*/gi, "")
    .replace(/<!--[\s\S]*?-->\s*/g, "")
    .replace(/<style[\s\S]*?<\/style>\s*/gi, "")
    .replace(/\sclass="st0"/g, ' fill="#FFFFFF"')
    .replace(/<path(?![^>]*\bfill=)/g, '<path fill="#000000"')
    .replace(
      /<svg([^>]*)>/,
      '<svg$1 width="140" height="55" role="img" aria-label="CapScreen" style="display:inline-block;max-width:140px;width:140px;height:auto;border:0;">',
    )
    .trim();
}

function getInlineLogoSvgMarkup(): string | null {
  if (cachedLogoSvgMarkup) return cachedLogoSvgMarkup;
  try {
    const svgCandidates = [
      join(__dirname, "../../assets/capscreen-email-logo.svg"),
      join(process.cwd(), "src/assets/capscreen-email-logo.svg"),
      join(process.cwd(), "dist/assets/capscreen-email-logo.svg"),
      join(__dirname, "../../assets/email-logo.svg"),
      join(process.cwd(), "src/assets/email-logo.svg"),
    ];
    const svgPath = svgCandidates.find((path) => existsSync(path));
    if (!svgPath) return null;
    cachedLogoSvgMarkup = prepareSvgForEmail(readFileSync(svgPath, "utf-8"));
    return cachedLogoSvgMarkup;
  } catch {
    return null;
  }
}

function renderLogoBlock(): string {
  const inlineSvg = getInlineLogoSvgMarkup();
  const remoteLogo = getEmailLogoUrl();
  const imgFallback = `
      <img
        src="${remoteLogo}"
        alt="CapScreen"
        width="140"
        height="55"
        style="display:inline-block;max-width:140px;width:140px;height:auto;border:0;"
      />`;
  return `
    <div style="text-align:center;padding-bottom:28px;border-bottom:1px solid ${GRAY_BORDER};margin-bottom:28px;">
      <!--[if mso]>
      ${imgFallback}
      <![endif]-->
      <!--[if !mso]><!-->
      ${inlineSvg ?? imgFallback}
      <!--<![endif]-->
    </div>
  `;
}

function renderButton(label: string, href: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="margin:32px 0 8px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0">
            <tr>
              <td style="border-radius:6px;background:${BLACK};">
                <a
                  href="${href}"
                  style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;letter-spacing:0.02em;color:${WHITE};text-decoration:none;border-radius:6px;"
                >
                  ${escapeHtml(label)}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function renderLayout(params: {
  preheader: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
}): { html: string; text: string } {
  const appName = getAppName();
  const cta =
    params.ctaLabel && params.ctaHref
      ? renderButton(params.ctaLabel, params.ctaHref)
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:${GRAY_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BLACK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(params.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${GRAY_BG};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:${WHITE};border:1px solid ${GRAY_BORDER};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:36px 36px 12px;">
              ${renderLogoBlock()}
              <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',Times,serif;font-size:26px;line-height:1.25;font-weight:400;color:${BLACK};text-align:left;">
                ${escapeHtml(params.title)}
              </h1>
              <div style="font-size:15px;line-height:1.65;color:${GRAY_BODY};">
                ${params.bodyHtml}
              </div>
              ${cta}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 32px;background:${GRAY_FOOTER_BG};border-top:1px solid ${GRAY_BORDER};">
              <p style="margin:0 0 10px;font-size:11px;line-height:1.55;color:${GRAY_MUTED};letter-spacing:0.01em;">
                ${escapeHtml(params.footerNote ?? "This message was sent by CapScreen's compliance screening platform.")}
              </p>
              <p style="margin:0;font-size:11px;line-height:1.55;color:${GRAY_MUTED};letter-spacing:0.01em;">
                &copy; ${new Date().getFullYear()} ${escapeHtml(appName)} &middot; Screening aids human review, not a legal determination.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    params.title,
    "",
    params.preheader,
    "",
    params.ctaHref ? `${params.ctaLabel ?? "Open link"}: ${params.ctaHref}` : "",
    "",
    params.footerNote ?? "This message was sent by CapScreen's compliance screening platform.",
  ].filter(Boolean);

  return { html, text: textParts.join("\n") };
}

export function buildVerificationEmail(token: string) {
  const link = `${getFrontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return renderLayout({
    preheader: "Confirm your email to activate your VC Screener account.",
    title: "Verify your email",
    bodyHtml: `
      <p style="margin:0 0 14px;">Welcome to <strong style="color:${BLACK};font-weight:600;">${escapeHtml(getAppName())}</strong>.</p>
      <p style="margin:0 0 14px;">Confirm your email address to activate your account and access cap-table sanctions screening.</p>
      <p style="margin:0;color:${GRAY_MUTED};font-size:13px;line-height:1.55;">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
    `,
    ctaLabel: "Verify email address",
    ctaHref: link,
  });
}

export function buildPasswordResetEmail(token: string) {
  const link = `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return renderLayout({
    preheader: "Reset your VC Screener password.",
    title: "Reset your password",
    bodyHtml: `
      <p style="margin:0 0 14px;">We received a request to reset the password for your <strong style="color:${BLACK};font-weight:600;">${escapeHtml(getAppName())}</strong> account.</p>
      <p style="margin:0 0 14px;">Choose a new password using the button below.</p>
      <p style="margin:0;color:${GRAY_MUTED};font-size:13px;line-height:1.55;">This link expires in 1 hour. If you did not request a reset, you can safely ignore this email.</p>
    `,
    ctaLabel: "Reset password",
    ctaHref: link,
  });
}

export function buildWorkflowInviteEmail(params: {
  inviterLabel: string;
  workflowTitle: string;
  workflowId: string;
  allowEdit: boolean;
}) {
  const link = `${getFrontendUrl()}/workflows/${encodeURIComponent(params.workflowId)}`;
  const permission = params.allowEdit
    ? "view and edit this workflow"
    : "view this workflow";
  return renderLayout({
    preheader: `${params.inviterLabel} shared a compliance workflow with you.`,
    title: "Workflow shared with you",
    bodyHtml: `
      <p style="margin:0 0 14px;"><strong style="color:${BLACK};font-weight:600;">${escapeHtml(params.inviterLabel)}</strong> shared the workflow <strong style="color:${BLACK};font-weight:600;">${escapeHtml(params.workflowTitle)}</strong> with you.</p>
      <p style="margin:0 0 14px;">You can ${escapeHtml(permission)}. Sign in with this email address to access it.</p>
      <p style="margin:0;color:${GRAY_MUTED};font-size:13px;line-height:1.55;">If you do not have an account yet, sign up using this email first.</p>
    `,
    ctaLabel: "Open workflow",
    ctaHref: link,
  });
}

export function buildReviewInviteEmail(params: {
  inviterLabel: string;
  reviewTitle: string;
  reviewId: string;
  projectId?: string | null;
}) {
  const path = params.projectId
    ? `/startups/${encodeURIComponent(params.projectId)}/tabular-reviews/${encodeURIComponent(params.reviewId)}`
    : `/tabular-reviews/${encodeURIComponent(params.reviewId)}`;
  const link = `${getFrontendUrl()}${path}`;
  return renderLayout({
    preheader: `${params.inviterLabel} invited you to a tabular review.`,
    title: "You've been invited to a review",
    bodyHtml: `
      <p style="margin:0 0 14px;"><strong style="color:${BLACK};font-weight:600;">${escapeHtml(params.inviterLabel)}</strong> added you to the tabular review <strong style="color:${BLACK};font-weight:600;">${escapeHtml(params.reviewTitle)}</strong>.</p>
      <p style="margin:0 0 14px;">Sign in with this email address to collaborate on screening and compliance review.</p>
      <p style="margin:0;color:${GRAY_MUTED};font-size:13px;line-height:1.55;">If you do not have an account yet, sign up using this email first.</p>
    `,
    ctaLabel: "Open review",
    ctaHref: link,
  });
}
