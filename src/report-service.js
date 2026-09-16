import fs from "fs";
import path from "path";
import logger from "./logger.js";

/**
 * Quotes a value for safe inclusion in a CSV field.
 * Wraps in double quotes and escapes any internal double quotes.
 * Also neutralizes spreadsheet formula execution when a value starts,
 * even after leading whitespace,
 * with a formula trigger character (=, +, -, @).
 *
 * @param {*} value - Raw field value
 * @returns {string} Quoted CSV field
 */
function csvField(value) {
  let str = String(value ?? "");

  if (/^\s*[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ");
}

class ReportService {
  /**
   * Generates budget-report.md, budget-report.csv, and budget-report.json
   * under the artifacts/ directory.
   *
   * Reports include per-user synchronization results (created, updated, skipped, failed).
   * This provides an audit trail of what actions were taken during the synchronization.
   *
   * @param {Array<object>} budgets - Array of budget records from the CSV file
   * @param {object} [result={}] - Sync result containing created, updated, skipped, failed arrays
   * @returns {void}
   */
  generate(budgets, result = {}) {
    const artifactDir = "artifacts";
    fs.mkdirSync(artifactDir, { recursive: true });

    const summary = {
      total: budgets.length,
      created: result.created?.length || 0,
      updated: result.updated?.length || 0,
      skipped: result.skipped?.length || 0,
      failed: result.failed?.length || 0,
      generated: new Date().toISOString()
    };

    // Build per-user status map for detailed reporting
    const userStatus = new Map();

    result.created?.forEach((u) => {
      userStatus.set(u.username, {
        username: u.username,
        requestedBudget: u.budget,
        action: "CREATED",
        error: null
      });
    });

    result.updated?.forEach((u) => {
      userStatus.set(u.user, {
        username: u.user,
        previousBudget: u.from,
        requestedBudget: u.to,
        action: "UPDATED",
        error: null
      });
    });

    result.skipped?.forEach((u) => {
      userStatus.set(u.username, {
        username: u.username,
        requestedBudget: u.budget,
        action: "SKIPPED",
        error: null
      });
    });

    result.failed?.forEach((u) => {
      userStatus.set(u.user, {
        username: u.user,
        action: "FAILED",
        error: u.error
      });
    });

    // Markdown Report
    const markdown = `# GitHub Copilot Budget Guardian Report

## Summary

| Metric | Count |
|--------|------:|
| Total Budgets | ${summary.total} |
| Created | ${summary.created} |
| Updated | ${summary.updated} |
| Skipped | ${summary.skipped} |
| Failed | ${summary.failed} |
| Generated | ${summary.generated} |

## Synchronization Results

| Username | Requested Budget | Previous Budget | Action | Error |
|----------|------------------:|-----------------|--------|-------|
${Array.from(userStatus.values())
  .map(
    (u) => {
      const requestedBudget = u.requestedBudget ? escapeMarkdownCell(u.requestedBudget) : "—";
      const previousBudget = u.previousBudget ? escapeMarkdownCell(u.previousBudget) : "—";
      const error = u.error ? escapeMarkdownCell(u.error) : "—";
      return `| ${escapeMarkdownCell(u.username)} | ${requestedBudget} | ${previousBudget} | ${u.action} | ${error} |`;
    }
  )
  .join("\n")}

## Budget Input Data

| Username | Budget | Team | Reason |
|----------|-------:|------|--------|
${budgets
  .map(
    (u) =>
      `| ${escapeMarkdownCell(u.username)} | ${escapeMarkdownCell(u.budget)} | ${escapeMarkdownCell(u.team)} | ${escapeMarkdownCell(u.reason)} |`
  )
  .join("\n")}
`;

    fs.writeFileSync(path.join(artifactDir, "budget-report.md"), markdown);

    // JSON Report with structured result data
    fs.writeFileSync(
      path.join(artifactDir, "budget-report.json"),
      JSON.stringify(
        {
          summary,
          synchronization: Array.from(userStatus.values()),
          input: budgets
        },
        null,
        2
      )
    );

    // CSV Report with per-user status
    let csv = "username,action,requested_budget,previous_budget,error\n";

    Array.from(userStatus.values()).forEach((u) => {
      const requestedBudget = u.requestedBudget ?? "";
      const previousBudget = u.previousBudget ?? "";
      const error = u.error ?? "";
      csv += `${csvField(u.username)},${csvField(u.action)},${csvField(requestedBudget)},${csvField(previousBudget)},${csvField(error)}\n`;
    });

    fs.writeFileSync(
      path.join(artifactDir, "budget-report.csv"),
      csv
    );

    logger.success("artifacts/budget-report.md generated.");
    logger.success("artifacts/budget-report.json generated.");
    logger.success("artifacts/budget-report.csv generated.");
  }

  /**
   * Writes a professional GitHub Job Summary to GITHUB_STEP_SUMMARY.
   *
   * Includes repository context, execution statistics, and a per-user
   * status table. Skips gracefully when not running inside GitHub Actions.
   *
   * @param {object} result - Sync result containing created, updated, skipped, failed arrays
   * @param {object} [context={}] - Optional execution context
   * @param {string} [context.repository] - GitHub repository name
   * @param {string} [context.enterprise] - Enterprise slug
   * @param {string} [context.workflowName] - Workflow name
   * @param {string} [context.executionTime] - ISO timestamp of execution
   * @returns {Promise<void>}
   */
  async writeJobSummary(result, context = {}) {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;

    if (!summaryFile) {
      logger.info(
        "GITHUB_STEP_SUMMARY is not available. Skipping job summary."
      );
      return;
    }

    const repository = context.repository || "N/A";
    const enterprise = context.enterprise || "N/A";
    const workflowName = context.workflowName || "N/A";
    const executionTime = context.executionTime || new Date().toISOString();

    const detailRows = [
      ...result.created.map(
        (u) =>
          `| ${escapeMarkdownCell(u.username || u.user)} | ✅ Created | — | ${escapeMarkdownCell(u.budget ?? "—")} |`
      ),
      ...result.updated.map(
        (u) =>
          `| ${escapeMarkdownCell(u.user)} | 🔄 Updated | ${escapeMarkdownCell(u.from)} | ${escapeMarkdownCell(u.to)} |`
      ),
      ...result.skipped.map(
        (u) =>
          `| ${escapeMarkdownCell(u.username || u.user)} | ⏭️ Skipped | — | ${escapeMarkdownCell(u.budget ?? "—")} |`
      ),
      ...result.failed.map(
        (u) =>
          `| ${escapeMarkdownCell(u.user)} | ❌ Failed | — | — |`
      )
    ].join("\n");

    const summary = [
      "## GitHub Copilot Budget Guardian — Synchronization Report",
      "",
      "| Field | Value |",
      "|-------|-------|",
      `| **Repository** | ${escapeMarkdownCell(repository)} |`,
      `| **Enterprise** | ${escapeMarkdownCell(enterprise)} |`,
      `| **Workflow** | ${escapeMarkdownCell(workflowName)} |`,
      `| **Execution Time** | ${escapeMarkdownCell(executionTime)} |`,
      `| **Created** | ${result.created.length} |`,
      `| **Updated** | ${result.updated.length} |`,
      `| **Skipped** | ${result.skipped.length} |`,
      `| **Failed** | ${result.failed.length} |`,
      "",
      "## User Budget Status",
      "",
      "| Username | Status | Previous Budget | New Budget |",
      "|----------|--------|----------------:|-----------:|",
      detailRows || "| — | — | — | — |",
      "",
      "> 📦 Full reports are available in **GitHub Actions Artifacts** (`budget-sync-report`).",
      ""
    ].join("\n");

    await fs.promises.appendFile(summaryFile, summary);

    logger.success("GitHub Job Summary written.");
  }
}

export default new ReportService();