import { Resend } from "resend";
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
} from "./emailTemplates";
import {
  emailConfigured,
  getFrontendUrl,
  getResendFromEmail,
} from "./emailConfig";

let resendClient: Resend | null = null;

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

async function dispatchEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  devLogLabel: string;
  devLogLink?: string;
}): Promise<void> {
  if (!emailConfigured()) {
    console.log(
      `[email] ${params.devLogLabel} for ${params.to}${params.devLogLink ? `: ${params.devLogLink}` : ""}`,
    );
    return;
  }

  const client = getClient();
  const { error } = await client.emails.send({
    from: getResendFromEmail(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<void> {
  const { html, text } = buildVerificationEmail(token);
  const link = `${getFrontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  await dispatchEmail({
    to: email,
    subject: "Verify your CapScreen account",
    html,
    text,
    devLogLabel: "Verification link",
    devLogLink: link,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
): Promise<void> {
  const { html, text } = buildPasswordResetEmail(token);
  await dispatchEmail({
    to: email,
    subject: "Reset your CapScreen password",
    html,
    text,
    devLogLabel: "Password reset link",
    devLogLink: `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(token)}`,
  });
}
