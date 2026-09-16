import logger from "./logger.js";
import validator from "./validator.js";
import reportService from "./report-service.js";

class SyncService {
  async sync(budgets, githubClient, config) {
    logger.startGroup("Budget Synchronization");

    validator.validateBudgets(budgets);

    const result = {
      total: budgets.length,
      created: [],
      updated: [],
      skipped: [],
      failed: []
    };

    let existingBudgets = [];
    let fetchFailed = false;

    // Fetch existing budgets
    if (githubClient && config.enterpriseSlug) {
      try {

        logger.info(
  `Enterprise Slug: ${config.enterpriseSlug}`
);
        
        existingBudgets =
          await githubClient.getExistingBudgets(
            config.enterpriseSlug
          );

        logger.success(
`Fetched ${existingBudgets.length} existing budgets.`
        );
          } catch (err) {
        logger.error(
          "Failed to fetch existing budgets."
        );

        logger.error(
          `Message: ${err.message}`
        );

        if (err.status) {
          logger.error(
            `Status: ${err.status}`
          );
        }

        if (
          err.request?.method &&
          err.request?.url
        ) {
          logger.error(
            `Request: ${err.request.method} ${err.request.url}`
          );
        }

        if (err.response?.url) {
          logger.error(
            `URL: ${err.response.url}`
          );
        }

        if (err.response?.data) {
          logger.error(
            `Response: ${JSON.stringify(
              err.response.data,
              null,
              2
            )}`
          );
        }

        fetchFailed = true;

        // CRITICAL SAFETY CHECK: In production mode (dry-run = false),
        // we must not proceed without knowing the existing Enterprise state.
        // Continuing with an empty list would cause the Action to attempt
        // CREATE operations for all users, which is unsafe.
        if (!config.dryRun) {
          throw new Error(
            "Unable to retrieve existing Copilot budgets from GitHub Enterprise. " +
            "Synchronization was stopped to prevent changes based on incomplete Enterprise state. " +
            "Please verify GitHub Enterprise connectivity and PAT permissions, then retry."
          );
        }

        // In dry-run mode, we can continue with validation-only behavior.
        logger.warning(
          "Unable to fetch existing budgets. Proceeding in validation-only mode. " +
          "Actual budget operations will not be performed."
        );
      }
    }

    for (const budget of budgets) {
      try {
       const existing = existingBudgets.find(
          (item) =>
            (
              item.budget_entity_name ||
              item.user ||
              ""
            ).toLowerCase() ===
            budget.username.toLowerCase()
        );

        // ------------------------
        // CREATE
        // ------------------------
        if (!existing) {
          logger.info(
            `CREATE -> ${budget.username}`
          );

          if (
            githubClient &&
            config.enterpriseSlug &&
            !config.dryRun
          ) {
            await githubClient.createBudget(
              config.enterpriseSlug,
              {
                budget_amount: budget.budget,
                budget_scope: "user",
                user: budget.username,
                prevent_further_usage: true
              }
            );
          }

          result.created.push(budget);

          continue;
        }

        // ------------------------
        // UPDATE
        // ------------------------
        if (
          Number(existing.budget_amount) !==
          Number(budget.budget)
        ) {
          logger.info(
            `UPDATE -> ${budget.username} (${existing.budget_amount} → ${budget.budget})`
          );

          if (
            githubClient &&
            config.enterpriseSlug &&
            !config.dryRun
          ) {
            await githubClient.updateBudget(
              config.enterpriseSlug,
              existing.id,
              {
                budget_amount: budget.budget,
                user: budget.username,
                prevent_further_usage: true
              }
            );
          }

          result.updated.push({
            user: budget.username,
            from: existing.budget_amount,
            to: budget.budget
          });
        } else {
          // ------------------------
          // SKIP
          // ------------------------
          result.skipped.push(budget);

          logger.info(
            `SKIP -> ${budget.username}`
          );
        }
      } catch (err) {
        result.failed.push({
          user: budget.username,
          error: err.message
        });

        logger.error(
          `${budget.username}: ${err.message}`
        );
      }
    }

    // Generate Reports
    reportService.generate(
      budgets,
      result
    );

    logger.success(
      "Synchronization completed."
    );

    logger.info(
      `Create : ${result.created.length}`
    );

    logger.info(
      `Update : ${result.updated.length}`
    );

    logger.info(
      `Skip   : ${result.skipped.length}`
    );

    logger.info(
      `Failed : ${result.failed.length}`
    );

    // GitHub Action Outputs
    logger.setOutput(
      "created",
      result.created.length
    );

    logger.setOutput(
      "updated",
      result.updated.length
    );

    logger.setOutput(
      "skipped",
      result.skipped.length
    );

    logger.setOutput(
      "failed",
      result.failed.length
    );

    logger.endGroup();

    return result;
  }
}

export default new SyncService();
