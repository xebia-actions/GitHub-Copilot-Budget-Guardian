import { jest } from "@jest/globals";

jest.unstable_mockModule("../src/logger.js", () => ({
  default: {
    error: jest.fn(),
    success: jest.fn()
  }
}));

const logger = (await import("../src/logger.js")).default;
const validator = (await import("../src/validator.js")).default;

describe("validator.validateBudgets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns true for valid budgets", () => {
    const budgets = [
      { username: "alice", budget: 100 },
      { username: "bob", budget: 200 }
    ];

    const result = validator.validateBudgets(budgets);

    expect(result).toBe(true);
    expect(logger.success).toHaveBeenCalledWith("Budget validation passed.");
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("throws for validation failures and logs combined errors", () => {
    const budgets = [
      { username: "", budget: 100 },
      { username: "alice", budget: "abc" },
      { username: "alice", budget: -1 }
    ];

    expect(() => validator.validateBudgets(budgets)).toThrow(
      "Budget validation failed."
    );

    expect(logger.error).toHaveBeenCalledTimes(1);
    const message = logger.error.mock.calls[0][0];
    expect(message).toContain("Row 1: username is required.");
    expect(message).toContain("Invalid budget for alice");
    expect(message).toContain("Duplicate username: alice");
    expect(message).toContain("Negative budget for alice");
  });

  test("passes edge case with empty budget list", () => {
    const result = validator.validateBudgets([]);

    expect(result).toBe(true);
    expect(logger.success).toHaveBeenCalledWith("Budget validation passed.");
  });
});
