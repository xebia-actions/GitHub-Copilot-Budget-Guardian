import * as core from "@actions/core";

class Config {
  validateNotifyOn(notifyOn) {
    const normalizedNotifyOn = String(notifyOn).trim();
    const supportedValues = ["changes-only", "always"];

    if (!supportedValues.includes(normalizedNotifyOn)) {
      throw new Error(
        `Invalid notify-on value: ${notifyOn}. Supported values are: changes-only, always.`
      );
    }

    return normalizedNotifyOn;
  }

  isGitHubActionsRuntime() {
    return process.env.GITHUB_ACTIONS === "true";
  }

  getLocalArg(name) {
    const flagName = `--${name}=`;
    const arg = process.argv.find((item) =>
      item.startsWith(flagName)
    );

    if (!arg) {
      return "";
    }

    return arg.slice(flagName.length);
  }

  getLocalOverride(name) {
    const envName = `COPILOT_BUDGET_GUARDIAN_${name
      .replace(/-/g, "_")
      .toUpperCase()}`;

    return (
      this.getLocalArg(name) ||
      process.env[envName] ||
      ""
    );
  }

  getInput(name, required = false, defaultValue = "") {
    if (!this.isGitHubActionsRuntime()) {
      const localValue = this.getLocalOverride(name);

      if (localValue) {
        return localValue;
      }

      if (required) {
        throw new Error(
          `Missing required input for local execution: ${name}`
        );
      }

      return defaultValue;
    }

    try {
      return core.getInput(name, { required });
    } catch (_) {
      if (required) {
        throw new Error(`Missing required input: ${name}`);
      }

      return defaultValue;
    }
  }

  load() {
    const localDefaults = this.isGitHubActionsRuntime()
      ? {}
      : {
          githubToken: "local-dev-token",
          enterpriseSlug: "local-enterprise",
          budgetFile: "examples/budgets.csv",
          dryRun: "true"
        };

    const cfg = {
      githubToken: this.getInput(
        "github-token",
        !localDefaults.githubToken,
        localDefaults.githubToken || ""
      ),

      enterpriseSlug: this.getInput(
        "enterprise-slug",
        !localDefaults.enterpriseSlug,
        localDefaults.enterpriseSlug || ""
      ),

      budgetFile: this.getInput(
        "budget-file",
        false,
        localDefaults.budgetFile || "budgets.csv"
      ),

      dryRun:
        this.getInput(
          "dry-run",
          false,
          localDefaults.dryRun || "false"
        ) ===
        "true",

      slackWebhook: this.getInput(
        "slack-webhook"
      ),

      teamsWebhook: this.getInput(
        "teams-webhook"
      ),

      notifyOn: this.getInput(
        "notify-on",
        false,
        "changes-only"
      )
    };

    cfg.notifyOn = this.validateNotifyOn(cfg.notifyOn);

    return cfg;
  }
}

export default new Config();
