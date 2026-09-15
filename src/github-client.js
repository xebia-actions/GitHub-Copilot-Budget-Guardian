import * as github from "@actions/github";
import logger from "./logger.js";

class GitHubClient {
  constructor(token) {
    this.octokit = github.getOctokit(token);
  }

  async getExistingBudgets(enterprise) {
    logger.info("Fetching existing Copilot budgets...");

    const allBudgets = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const response = await this.octokit.request(
        "GET /enterprises/{enterprise}/settings/billing/budgets",
        {
          enterprise,
          per_page: 100,
          page
        }
      );

      const budgets = response.data.budgets || [];
      allBudgets.push(...budgets);

      budgets.forEach((budget) => {
        logger.info(
          `${budget.budget_scope} | ${budget.budget_entity_name} | ${budget.budget_amount}`
        );
      });

      hasMorePages = budgets.length === 100;
      page++;
    }

    logger.success(`Fetched ${allBudgets.length} total existing budgets (across all pages).`);
    return allBudgets;
  }

  async createBudget(enterprise, payload) {
    logger.info(`Creating budget for ${payload.user}`);

    const response = await this.octokit.request(
      "POST /enterprises/{enterprise}/settings/billing/budgets",
      {
        enterprise,

        budget_amount: payload.budget_amount,

        budget_scope: "user",

        user: payload.user,

        prevent_further_usage:
          payload.prevent_further_usage ?? true,

        budget_product_sku:
          payload.budget_product_sku ??
          "premium_requests",

        budget_type:
          payload.budget_type ??
          "BundlePricing",

        budget_alerting:
          payload.budget_alerting ?? {
            will_alert: false,
            alert_recipients: []
          }
      }
    );

    logger.success(
      `Budget created for ${payload.user}`
    );

    return response.data;
  }

  async updateBudget(
    enterprise,
    budgetId,
    payload
  ) {
    logger.info(
      `Updating budget ${budgetId}`
    );

    const response = await this.octokit.request(
      "PATCH /enterprises/{enterprise}/settings/billing/budgets/{budget_id}",
      {
        enterprise,

        budget_id: budgetId,

        budget_amount: payload.budget_amount,

        user: payload.user,

        prevent_further_usage:
          payload.prevent_further_usage ?? true,

        budget_alerting:
          payload.budget_alerting ?? {
            will_alert: false,
            alert_recipients: []
          }
      }
    );

    logger.success(
      `Budget updated for ${payload.user}`
    );

    return response.data;
  }
}

export default GitHubClient;