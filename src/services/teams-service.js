import logger from "../logger.js";
import { postJson } from "../utils.js";

/**
 * Sends an Adaptive Card notification to Microsoft Teams.
 *
 * The webhook URL is read from context (passed from TEAMS_WEBHOOK input/secret).
 * Skips gracefully when the webhook URL is not configured.
 *
 * @param {object} context - Notification context
 * @param {string} context.repository - GitHub repository name
 * @param {string} context.enterprise - Enterprise slug
 * @param {string} context.workflowName - Workflow name
 * @param {string} context.runUrl - Workflow run URL
 * @param {string} context.executionTime - ISO timestamp of execution
 * @param {string} context.teamsWebhook - Microsoft Teams Incoming Webhook URL
 * @param {object} result - Sync result containing created, updated, skipped, failed arrays
 * @returns {Promise<void>}
 */
async function sendTeams(context, result) {
  const webhookUrl = (context.teamsWebhook || "").trim();

  if (!webhookUrl) {
    logger.warning(
      "TEAMS_WEBHOOK is not configured. Skipping Teams notification."
    );
    return;
  }

  const statusColor =
    result.failed.length > 0
      ? "Attention"
      : result.created.length + result.updated.length > 0
      ? "Good"
      : "Default";

  const userStatusRows = [
    ...result.created.map((u) =>
      buildStatusRow(u.username || u.user, "Created", "—", u.budget ?? "—", "Good")
    ),
    ...result.updated.map((u) =>
      buildStatusRow(u.user, "Updated", u.from ?? "—", u.to ?? "—", "Accent")
    ),
    ...result.failed.map((u) =>
      buildStatusRow(u.user, `Failed: ${u.error}`, "—", "—", "Attention")
    )
  ];

  const statusSection =
    userStatusRows.length > 0
      ? [
          {
            type: "TextBlock",
            text: "User Budget Status",
            weight: "Bolder",
            spacing: "Medium"
          },
          buildHeaderRow(),
          ...userStatusRows
        ]
      : [];

  const payload = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: "GitHub Copilot Budget Synchronization Completed",
              weight: "Bolder",
              size: "Large",
              color: statusColor
            },
            {
              type: "FactSet",
              facts: [
                { title: "Repository", value: context.repository },
                { title: "Enterprise", value: context.enterprise },
                { title: "Workflow", value: context.workflowName },
                { title: "Execution Time", value: context.executionTime },
                { title: "Created", value: String(result.created.length) },
                { title: "Updated", value: String(result.updated.length) },
                { title: "Skipped", value: String(result.skipped.length) },
                { title: "Failed", value: String(result.failed.length) }
              ]
            },
            ...statusSection,
            {
              type: "TextBlock",
              text: "Full reports are available in GitHub Actions Artifacts (budget-sync-report).",
              isSubtle: true,
              wrap: true,
              spacing: "Medium"
            }
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "View Workflow Run",
              url: context.runUrl
            }
          ]
        }
      }
    ]
  };

  await postJson(webhookUrl, payload);

  logger.success("Microsoft Teams notification sent.");
}

/**
 * Builds an Adaptive Card header row using ColumnSet for Teams compatibility.
 *
 * @returns {object} Adaptive Card ColumnSet
 */
function buildHeaderRow() {
  return {
    type: "ColumnSet",
    spacing: "Small",
    columns: [
      {
        type: "Column",
        width: 2,
        items: [{ type: "TextBlock", text: "User", weight: "Bolder", wrap: true }]
      },
      {
        type: "Column",
        width: 2,
        items: [{ type: "TextBlock", text: "Status", weight: "Bolder", wrap: true }]
      },
      {
        type: "Column",
        width: 1,
        items: [{ type: "TextBlock", text: "Previous", weight: "Bolder", wrap: true }]
      },
      {
        type: "Column",
        width: 1,
        items: [{ type: "TextBlock", text: "New", weight: "Bolder", wrap: true }]
      }
    ]
  };
}

/**
 * Builds a Teams-compatible status row using ColumnSet.
 *
 * @param {string} user - Username
 * @param {string} statusText - Status description
 * @param {string|number} previousBudget - Previous budget display value
 * @param {string|number} newBudget - New budget display value
 * @param {string} color - Adaptive Card color token
 * @returns {object} Adaptive Card ColumnSet
 */
function buildStatusRow(user, statusText, previousBudget, newBudget, color) {
  return {
    type: "ColumnSet",
    spacing: "Small",
    columns: [
      {
        type: "Column",
        width: 2,
        items: [{ type: "TextBlock", text: String(user), wrap: true }]
      },
      {
        type: "Column",
        width: 2,
        items: [{ type: "TextBlock", text: String(statusText), color, wrap: true }]
      },
      {
        type: "Column",
        width: 1,
        items: [{ type: "TextBlock", text: String(previousBudget), wrap: true }]
      },
      {
        type: "Column",
        width: 1,
        items: [{ type: "TextBlock", text: String(newBudget), wrap: true }]
      }
    ]
  };
}

export { sendTeams };
