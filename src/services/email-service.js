import fs from "fs";
import path from "path";
import logger from "../logger.js";
import nodemailer from "nodemailer";

/**
 * Sends an email notification to Enterprise Administrators.
 *
 * SMTP configuration and administrator email addresses are read from
 * environment variables (GitHub Secrets exposed as env vars in the workflow).
 *
 * Required environment variables:
 *   SMTP_HOST, SMTP_USER, SMTP_PASSWORD, ADMIN_NOTIFICATION_EMAILS
 *
 * Optional environment variable:
 *   SMTP_PORT (defaults to 587 when not provided)
 *
 * @param {object} context - Notification context
 * @param {string} context.repository - GitHub repository name
 * @param {string} context.enterprise - Enterprise slug
 * @param {string} context.workflowName - Workflow name
 * @param {string} context.runUrl - Workflow run URL
 * @param {string} context.executionTime - ISO timestamp of execution
 * @param {object} result - Sync result containing created, updated, skipped, failed arrays
 * @returns {Promise<void>}
 */
async function sendEmail(context, result) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const adminEmails = process.env.ADMIN_NOTIFICATION_EMAILS;

  if (!smtpHost || !smtpUser || !smtpPassword || !adminEmails) {
    logger.warning(
      "SMTP configuration is incomplete. Skipping email notification."
    );
    return;
  }

  const recipients = adminEmails
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    logger.warning(
      "No valid admin email recipients configured. Skipping email notification."
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort) || 587,
    secure: Number(smtpPort) === 465,
    auth: {
      user: smtpUser,
      pass: smtpPassword
    }
  });

  const changedUsers = [
    ...result.created.map(
      (u) => `  - ${u.username || u.user} (Created)`
    ),
    ...result.updated.map(
      (u) => `  - ${u.user} (Updated: ${u.from} → ${u.to})`
    ),
    ...result.failed.map(
      (u) => `  - ${u.user} (Failed: ${u.error})`
    )
  ].join("\n");

  const subject =
    "GitHub Copilot Budget Synchronization Completed";

  const text = [
    "GitHub Copilot Budget Synchronization Completed",
    "",
    `Repository:     ${context.repository}`,
    `Enterprise:     ${context.enterprise}`,
    `Workflow:       ${context.workflowName}`,
    `Run URL:        ${context.runUrl}`,
    `Execution Time: ${context.executionTime}`,
    "",
    "Summary",
    "-------",
    `Created: ${result.created.length}`,
    `Updated: ${result.updated.length}`,
    `Skipped: ${result.skipped.length}`,
    `Failed:  ${result.failed.length}`,
    "",
    "Changed Users",
    "-------------",
    changedUsers || "  None"
  ].join("\n");

  const attachments = [];
  const artifactDir = "artifacts";

  for (const file of [
    "budget-report.csv",
    "budget-report.json",
    "budget-report.md"
  ]) {
    const filePath = path.join(artifactDir, file);
    if (fs.existsSync(filePath)) {
      attachments.push({ filename: file, path: filePath });
    }
  }

  await transporter.sendMail({
    from: smtpUser,
    to: recipients.join(","),
    subject,
    text,
    attachments
  });

  logger.success(
    `Email notification sent to ${recipients.length} administrator(s).`
  );
}

export { sendEmail };
