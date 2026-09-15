import { jest } from "@jest/globals";

jest.unstable_mockModule("../src/logger.js", () => ({
  default: {
    startGroup: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    setOutput: jest.fn(),
    endGroup: jest.fn()
  }
}));

jest.unstable_mockModule("../src/validator.js", () => ({
  default: {
    validateBudgets: jest.fn()
  }
}));

jest.unstable_mockModule("../src/report-service.js", () => ({
  default: {
    generate: jest.fn()
  }
}));

const logger = (await import("../src/logger.js")).default;
const validator = (await import("../src/validator.js")).default;
const reportService = (await import("../src/report-service.js")).default;
const syncService = (await import("../src/sync-service.js")).default;

describe("sync-service.sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("creates, updates, and skips based on comparison", async () => {
    const budgets = [
      { username: "alice", budget: 100 },
      { username: "bob", budget: 250 },
      { username: "carol", budget: 300 }
    ];

    const githubClient = {
      getExistingBudgets: jest.fn().mockResolvedValue([
        { id: 1, budget_entity_name: "bob", budget_amount: 200 },
        { id: 2, budget_entity_name: "carol", budget_amount: 300 }
      ]),
      createBudget: jest.fn().mockResolvedValue({}),
      updateBudget: jest.fn().mockResolvedValue({})
    };

    const config = {
      enterpriseSlug: "demo-enterprise",
      dryRun: false
    };

    const result = await syncService.sync(budgets, githubClient, config);

    expect(result.created).toHaveLength(1);
    expect(result.updated).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.failed).toHaveLength(0);

    expect(githubClient.createBudget).toHaveBeenCalledWith("demo-enterprise", {
      budget_amount: 100,
      budget_scope: "user",
      user: "alice",
      prevent_further_usage: true
    });

    expect(githubClient.updateBudget).toHaveBeenCalledWith("demo-enterprise", 1, {
      budget_amount: 250,
      user: "bob",
      prevent_further_usage: true
    });

    expect(reportService.generate).toHaveBeenCalledWith(budgets, result);
    expect(logger.setOutput).toHaveBeenCalledWith("created", 1);
    expect(logger.setOutput).toHaveBeenCalledWith("updated", 1);
    expect(logger.setOutput).toHaveBeenCalledWith("skipped", 1);
    expect(logger.setOutput).toHaveBeenCalledWith("failed", 0);
  });

  test("does not call create/update APIs in dry-run mode", async () => {
    const budgets = [{ username: "alice", budget: 100 }];

    const githubClient = {
      getExistingBudgets: jest.fn().mockResolvedValue([]),
      createBudget: jest.fn(),
      updateBudget: jest.fn()
    };

    const config = {
      enterpriseSlug: "demo-enterprise",
      dryRun: true
    };

    const result = await syncService.sync(budgets, githubClient, config);

    expect(result.created).toHaveLength(1);
    expect(githubClient.createBudget).not.toHaveBeenCalled();
    expect(githubClient.updateBudget).not.toHaveBeenCalled();
  });

  test("fails immediately when fetching existing budgets fails in production mode (dry-run=false)", async () => {
    const budgets = [{ username: "alice", budget: 100 }];

    const githubClient = {
      getExistingBudgets: jest.fn().mockRejectedValue(new Error("API unavailable")),
      createBudget: jest.fn().mockResolvedValue({}),
      updateBudget: jest.fn().mockResolvedValue({})
    };

    const config = {
      enterpriseSlug: "demo-enterprise",
      dryRun: false
    };

    await expect(syncService.sync(budgets, githubClient, config)).rejects.toThrow(
      "Unable to retrieve existing Copilot budgets"
    );

    expect(githubClient.createBudget).not.toHaveBeenCalled();
    expect(githubClient.updateBudget).not.toHaveBeenCalled();
  });

  test("continues in validation-only mode when fetching existing budgets fails in dry-run mode (dry-run=true)", async () => {
    const budgets = [{ username: "alice", budget: 100 }];

    const githubClient = {
      getExistingBudgets: jest.fn().mockRejectedValue(new Error("API unavailable")),
      createBudget: jest.fn().mockResolvedValue({}),
      updateBudget: jest.fn().mockResolvedValue({})
    };

    const config = {
      enterpriseSlug: "demo-enterprise",
      dryRun: true
    };

    const result = await syncService.sync(budgets, githubClient, config);

    expect(logger.warning).toHaveBeenCalledWith(
      expect.stringContaining("validation-only mode")
    );
    expect(result.created).toHaveLength(1);
    expect(githubClient.createBudget).not.toHaveBeenCalled();
    expect(githubClient.updateBudget).not.toHaveBeenCalled();
  });

  test("captures per-budget API failures in result.failed", async () => {
    const budgets = [{ username: "alice", budget: 100 }];

    const githubClient = {
      getExistingBudgets: jest.fn().mockResolvedValue([]),
      createBudget: jest.fn().mockRejectedValue(new Error("Create failed")),
      updateBudget: jest.fn()
    };

    const config = {
      enterpriseSlug: "demo-enterprise",
      dryRun: false
    };

    const result = await syncService.sync(budgets, githubClient, config);

    expect(result.created).toHaveLength(0);
    expect(result.failed).toEqual([
      {
        user: "alice",
        error: "Create failed"
      }
    ]);
    expect(logger.error).toHaveBeenCalledWith("alice: Create failed");
  });

  test("fails fast when validator throws", async () => {
    const validationError = new Error("Budget validation failed.");
    validator.validateBudgets.mockImplementationOnce(() => {
      throw validationError;
    });

    await expect(syncService.sync([], null, {})).rejects.toThrow(
      "Budget validation failed."
    );

    expect(reportService.generate).not.toHaveBeenCalled();
    expect(logger.endGroup).not.toHaveBeenCalled();
  });
});
