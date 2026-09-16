import { jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";

jest.unstable_mockModule("../src/logger.js", () => ({
  default: {
    info: jest.fn(),
    success: jest.fn(),
    startGroup: jest.fn(),
    endGroup: jest.fn()
  }
}));

const logger = (await import("../src/logger.js")).default;
const budgetService = (await import("../src/budget-service.js")).default;

describe("budget-service", () => {
  let tempDir;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-service-"));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("loads and maps budgets from CSV", () => {
    const filePath = path.join(tempDir, "budgets.csv");
    fs.writeFileSync(
      filePath,
      [
        "username,budget,reason,team",
        "alice,100,Onboarding,Platform",
        "bob,200,,"
      ].join("\n")
    );

    const budgets = budgetService.loadBudgets(filePath);

    expect(budgets).toEqual([
      {
        username: "alice",
        budget: 100,
        reason: "Onboarding",
        team: "Platform"
      },
      {
        username: "bob",
        budget: 200,
        reason: "",
        team: ""
      }
    ]);
    expect(logger.success).toHaveBeenCalledWith("2 budget records loaded.");
  });

  test("throws when file does not exist", () => {
    const missing = path.join(tempDir, "missing.csv");

    expect(() => budgetService.loadBudgets(missing)).toThrow(
      /Budget file not found/
    );
  });

  test("handles edge case with only header row", () => {
    const filePath = path.join(tempDir, "empty.csv");
    fs.writeFileSync(filePath, "username,budget,reason,team\n");

    const budgets = budgetService.loadBudgets(filePath);

    expect(budgets).toEqual([]);
    expect(logger.success).toHaveBeenCalledWith("0 budget records loaded.");
  });

  test("prints summary for every budget record", () => {
    const budgets = [
      { username: "alice", budget: 100, team: "Platform" },
      { username: "bob", budget: 50, team: "DevOps" }
    ];

    budgetService.printSummary(budgets);

    expect(logger.startGroup).toHaveBeenCalledWith("Budget Summary");
    expect(logger.info).toHaveBeenCalledWith("alice | Budget=100 | Team=Platform");
    expect(logger.info).toHaveBeenCalledWith("bob | Budget=50 | Team=DevOps");
    expect(logger.endGroup).toHaveBeenCalled();
  });
});
