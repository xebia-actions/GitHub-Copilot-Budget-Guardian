import logger from "./logger.js";
import config from "./config.js";
import budgetService from "./budget-service.js";
import SyncService from "./sync-service.js";
import GitHubClient from "./github-client.js";
import reportService from "./report-service.js";
import { runNotifications } from "./services/notification-service.js";

async function run() {
  try {
    logger.startGroup("GitHub Copilot Budget Guardian");

    // Load configuration
    const cfg = config.load();

    // Read budget file
    const budgets = budgetService.loadBudgets(cfg.budgetFile);

    // Initialize GitHub client
    const client = new GitHubClient(cfg.githubToken);

    // Synchronize budgets
    const result = await SyncService.sync(budgets, client, cfg);

    const executionTime = new Date().toISOString();

    // Build execution context for reporting and notifications
    const repository = process.env.GITHUB_REPOSITORY || cfg.enterpriseSlug;
    const serverUrl =
      process.env.GITHUB_SERVER_URL || "https://github.com";
    const runId = process.env.GITHUB_RUN_ID || "";
    const runUrl = runId
      ? `${serverUrl}/${repository}/actions/runs/${runId}`
      : serverUrl;

    const context = {
      repository,
      enterprise: cfg.enterpriseSlug,
      workflowName:
        process.env.GITHUB_WORKFLOW || "GitHub Copilot Budget Guardian",
      runUrl,
      executionTime,
      slackWebhook: cfg.slackWebhook,
      teamsWebhook: cfg.teamsWebhook
    };

    // Write GitHub Job Summary
    await reportService.writeJobSummary(result, context);

    // Run notifications
    await runNotifications(context, result, cfg.notifyOn);

    logger.success("Budget file processed successfully.");

    logger.endGroup();
  } catch (err) {
    logger.fail(err);
  }
}

run();