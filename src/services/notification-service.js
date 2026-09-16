import logger from "../logger.js";
import { sendEmail } from "./email-service.js";
import { sendTeams } from "./teams-service.js";
import { sendSlack } from "./slack-service.js";

function getErrorMessage(err) {
  if (err instanceof Error && err.message) {
    return err.message;
  }

  if (typeof err === "string") {
    return err;
  }

  if (err === null || err === undefined) {
    return "Unknown error";
  }

  try {
    return JSON.stringify(err);
  } catch (_) {
    return String(err);
  }
}

/**
 * Runs all notification channels independently.
 *
 * Each channel (Email, Teams, Slack) is executed in parallel.
 * A failure in one channel never affects the others or the synchronization result.
 *
 * When notify-on is "changes-only" and no budgets were created, updated, or failed,
 * all notifications are skipped. Reports are still generated regardless of this setting.
 *
 * @param {object} context - Notification context
 * @param {string} context.repository - GitHub repository name
 * @param {string} context.enterprise - Enterprise slug
 * @param {string} context.workflowName - Workflow name
 * @param {string} context.runUrl - Workflow run URL
 * @param {string} context.executionTime - ISO timestamp of execution
 * @param {string} context.slackWebhook - Slack Incoming Webhook URL
 * @param {string} context.teamsWebhook - Microsoft Teams Incoming Webhook URL
 * @param {object} result - Sync result containing created, updated, skipped, failed arrays
 * @param {string} notifyOn - Notification policy: "always" | "changes-only"
 * @returns {Promise<void>}
 */
async function runNotifications(context, result, notifyOn) {
  const hasChanges =
    result.created.length > 0 ||
    result.updated.length > 0 ||
    result.failed.length > 0;

  if (notifyOn === "changes-only" && !hasChanges) {
    logger.info(
      "No changes detected. Skipping notifications (notify-on: changes-only)."
    );
    return;
  }

  logger.startGroup("Notifications");

  const channels = [
    { name: "Email", fn: () => sendEmail(context, result) },
    { name: "Teams", fn: () => sendTeams(context, result) },
    { name: "Slack", fn: () => sendSlack(context, result) }
  ];

  await Promise.all(
    channels.map(async ({ name, fn }) => {
      try {
        await fn();
      } catch (err) {
        logger.warning(
          `${name} notification failed: ${getErrorMessage(err)}`
        );
      }
    })
  );

  logger.endGroup();
}

export { runNotifications };
