import { jest } from "@jest/globals";

jest.unstable_mockModule("@actions/core", () => ({
  getInput: jest.fn()
}));

const core = await import("@actions/core");
const config = (await import("../src/config.js")).default;

describe("config.load notify-on validation", () => {
  const originalGithubActions = process.env.GITHUB_ACTIONS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_ACTIONS = "true";
  });

  afterAll(() => {
    process.env.GITHUB_ACTIONS = originalGithubActions;
  });

  function mockInputs(notifyOnValue) {
    core.getInput.mockImplementation((name) => {
      const values = {
        "github-token": "token",
        "enterprise-slug": "enterprise",
        "budget-file": "budgets.csv",
        "dry-run": "false",
        "slack-webhook": "",
        "teams-webhook": "",
        "notify-on": notifyOnValue
      };
      return values[name] || "";
    });
  }

  test("accepts notify-on changes-only", () => {
    mockInputs("changes-only");

    const cfg = config.load();

    expect(cfg.notifyOn).toBe("changes-only");
  });

  test("accepts notify-on always", () => {
    mockInputs("always");

    const cfg = config.load();

    expect(cfg.notifyOn).toBe("always");
  });

  test("trims notify-on changes-only before validation", () => {
    mockInputs("changes-only ");

    const cfg = config.load();

    expect(cfg.notifyOn).toBe("changes-only");
  });

  test("trims notify-on always before validation", () => {
    mockInputs(" always ");

    const cfg = config.load();

    expect(cfg.notifyOn).toBe("always");
  });

  test("rejects invalid notify-on value", () => {
    mockInputs("sometimes");

    expect(() => config.load()).toThrow(
      "Invalid notify-on value: sometimes. Supported values are: changes-only, always."
    );
  });
});
