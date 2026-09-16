import logger from "../logger.js";
import { postJson } from "../utils.js";

/**
 * Sends a Block Kit notification to Slack.
 *
 * The webhook URL is read from context (passed from SLACK_WEBHOOK input/secret).
 * Skips gracefully when the webhook URL is not configured.
 *
 * @param {object} context - Notification context
 * @param {string} context.repository - GitHub repository name
 * @param {string} context.enterprise - Enterprise slug
 * @param {string} context.workflowName - Workflow name
 * @param {string} context.runUrl - Workflow run URL
 * @param {string} context.executionTime - ISO timestamp of execution
 * @param {string} context.slackWebhook - Slack Incoming Webhook URL
 * @param {object} result - Sync result containing created, updated, skipped, failed arrays
 * @returns {Promise<void>}
 */
async function sendSlack(context, result) {
  const webhookUrl = (context.slackWebhook || "").trim();

  if (!webhookUrl) {
    logger.warning(
      "SLACK_WEBHOOK is not configured. Skipping Slack notification."
    );
    return;
  }

  const statusEmoji =
    result.failed.length > 0
      ? ":x:"
      : result.created.length + result.updated.length > 0
      ? ":white_check_mark:"
      : ":information_source:";

  const changedUsersText =
    [
      ...result.created.map(
        (u) => `• ${u.username || u.user} — Created`
      ),
      ...result.updated.map(
        (u) => `• ${u.user} — Updated (${u.from} → ${u.to})`
      ),
      ...result.failed.map(
        (u) => `• ${u.user} — Failed: ${u.error}`
      )
    ].join("\n") || "None";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${statusEmoji} GitHub Copilot Budget Synchronization Completed`,
        emoji: true
      }
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Repository:*\n${context.repository}` },
        { type: "mrkdwn", text: `*Enterprise:*\n${context.enterprise}` },
        { type: "mrkdwn", text: `*Workflow:*\n${context.workflowName}` },
        {
          type: "mrkdwn",
          text: `*Execution Time:*\n${context.executionTime}`
        }
      ]
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Created:*\n${result.created.length}` },
        { type: "mrkdwn", text: `*Updated:*\n${result.updated.length}` },
        { type: "mrkdwn", text: `*Skipped:*\n${result.skipped.length}` },
        { type: "mrkdwn", text: `*Failed:*\n${result.failed.length}` }
      ]
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Changed Users:*\n${changedUsersText}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":package: Full reports are available in *GitHub Actions Artifacts* (`budget-sync-report`)."
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Workflow Run", emoji: true },
          url: context.runUrl,
          action_id: "view_run"
        }
      ]
    }
  ];

  await postJson(webhookUrl, { blocks });

  logger.success("Slack notification sent.");
}

export { sendSlack };
