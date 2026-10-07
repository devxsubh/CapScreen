import { Resend } from "resend";
import {
  buildPasswordResetEmail,
  buildReviewInviteEmail,
  buildVerificationEmail,
  buildWorkflowInviteEmail,
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

export async function sendWorkflowInviteEmail(params: {
  to: string;
  inviterLabel: string;
  workflowTitle: string;
  workflowId: string;
  allowEdit: boolean;
}): Promise<void> {
  const { html, text } = buildWorkflowInviteEmail({
    inviterLabel: params.inviterLabel,
    workflowTitle: params.workflowTitle,
    workflowId: params.workflowId,
    allowEdit: params.allowEdit,
  });
  await dispatchEmail({
    to: params.to,
    subject: `${params.inviterLabel} shared a workflow with you`,
    html,
    text,
    devLogLabel: "Workflow invite",
  });
}

export async function sendReviewInviteEmail(params: {
  to: string;
  inviterLabel: string;
  reviewTitle: string;
  reviewId: string;
  projectId?: string | null;
}): Promise<void> {
  const { html, text } = buildReviewInviteEmail({
    inviterLabel: params.inviterLabel,
    reviewTitle: params.reviewTitle,
    reviewId: params.reviewId,
    projectId: params.projectId,
  });
  await dispatchEmail({
    to: params.to,
    subject: `${params.inviterLabel} invited you to a tabular review`,
    html,
    text,
    devLogLabel: "Review invite",
  });
}

/** Fire-and-forget helper — never blocks the HTTP response on email failure. */
export function sendEmailSafe(task: () => Promise<void>): void {
  void task().catch((err) => {
    console.error(
      "[email] send failed:",
      err instanceof Error ? err.message : String(err),
    );
  });
}
