import { jest } from "@jest/globals";
import fs from "fs";
import path from "path";

jest.unstable_mockModule("../src/logger.js", () => ({
  default: {
    success: jest.fn(),
    info: jest.fn()
  }
}));

const logger = (await import("../src/logger.js")).default;
const reportService = (await import("../src/report-service.js")).default;

describe("report-service.generate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fs, "mkdirSync").mockImplementation(() => {});
    jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    jest.useFakeTimers().setSystemTime(new Date("2026-06-26T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
    fs.mkdirSync.mockRestore();
    fs.writeFileSync.mockRestore();
  });

  test("generates markdown, json, and csv reports with synchronization results", () => {
    const budgets = [
      { username: "alice", budget: 100, team: "Platform", reason: "Init" }
    ];
    const result = {
      created: [budgets[0]],
      updated: [],
      skipped: [],
      failed: []
    };

    reportService.generate(budgets, result);

    expect(fs.mkdirSync).toHaveBeenCalledWith("artifacts", { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledTimes(3);

    // Check markdown includes synchronization results section
    const markdownCall = fs.writeFileSync.mock.calls[0];
    expect(markdownCall[0]).toEqual(path.join("artifacts", "budget-report.md"));
    expect(markdownCall[1]).toContain("| Created | 1 |");
    expect(markdownCall[1]).toContain("## Synchronization Results");
    expect(markdownCall[1]).toContain("| CREATED |");

    // Check JSON includes synchronization array
    const jsonCall = fs.writeFileSync.mock.calls[1];
    expect(jsonCall[1]).toContain('"synchronization"');
    expect(jsonCall[1]).toContain('"action": "CREATED"');

    // Check CSV has action column
    const csvCall = fs.writeFileSync.mock.calls[2];
    expect(csvCall[1]).toContain("action,requested_budget");
    expect(csvCall[1]).toContain("CREATED,100");

    expect(logger.success).toHaveBeenCalledTimes(3);
  });

  test("handles edge case with empty budget list and default result", () => {
    reportService.generate([]);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(3);
    const markdown = fs.writeFileSync.mock.calls[0][1];
    expect(markdown).toContain("| Total Budgets | 0 |");
    expect(markdown).toContain("| Created | 0 |");
  });

  test("throws when write fails", () => {
    fs.writeFileSync.mockImplementationOnce(() => {
      throw new Error("Disk full");
    });

    expect(() => reportService.generate([])).toThrow("Disk full");
  });

  test("neutralizes CSV formula-injection values in synchronization results", () => {
    const budgets = [
      {
        username: "=cmd|'/C calc'!A0",
        budget: 100,
        team: "-Ops",
        reason: "@alert"
      }
    ];

    reportService.generate(budgets, {
      created: [budgets[0]],
      updated: [],
      skipped: [],
      failed: []
    });

    const csvOutput = fs.writeFileSync.mock.calls[2][1];
    // Username should be escaped
    expect(csvOutput).toContain("'=cmd|'/C calc'!A0,CREATED,100");
  });

  test("neutralizes CSV formula-injection values in username with leading whitespace", () => {
    const budgets = [
      {
        username: " =1+1",
        budget: 100,
        team: " -10",
        reason: " @test"
      }
    ];

    reportService.generate(budgets, {
      created: [budgets[0]],
      updated: [],
      skipped: [],
      failed: []
    });

    const csvOutput = fs.writeFileSync.mock.calls[2][1];
    // Username should be escaped when it contains formula injection characters
    expect(csvOutput).toContain("' =1+1,CREATED,100");
  });

  test("escapes dynamic markdown report row values in synchronization results", () => {
    const budgets = [
      {
        username: "alice|admin\nroot",
        budget: 10,
        team: "Platform|Core",
        reason: "hello\nworld"
      }
    ];

    reportService.generate(budgets, {
      created: [budgets[0]],
      updated: [],
      skipped: [],
      failed: []
    });

    const markdownOutput = fs.writeFileSync.mock.calls[0][1];
    // Check that synchronization results are properly escaped
    expect(markdownOutput).toContain("## Synchronization Results");
    expect(markdownOutput).toContain("alice\\|admin root");
    expect(markdownOutput).toContain("| CREATED |");
  });
});

describe("report-service.writeJobSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_STEP_SUMMARY = "/tmp/summary.md";
    jest.spyOn(fs.promises, "appendFile").mockResolvedValue();
  });

  afterEach(() => {
    delete process.env.GITHUB_STEP_SUMMARY;
    fs.promises.appendFile.mockRestore();
  });

  test("escapes markdown table values in summary fields and changed users", async () => {
    const result = {
      created: [{ username: "alice|admin\nroot", budget: "5\r" }],
      updated: [{ user: "bob|ops", from: "1\n2", to: "3\r4" }],
      skipped: [{ username: "carol\nteam", budget: "10|11" }],
      failed: [{ user: "dave\r|x", error: "boom" }]
    };

    const context = {
      repository: "acme/repo|prod",
      enterprise: "ent\nname",
      workflowName: "Budget\rSync",
      executionTime: "2026-01-01T00:00:00.000Z"
    };

    await reportService.writeJobSummary(result, context);

    expect(fs.promises.appendFile).toHaveBeenCalledTimes(1);
    const summary = fs.promises.appendFile.mock.calls[0][1];
    expect(summary).toContain("acme/repo\\|prod");
    expect(summary).toContain("ent name");
    expect(summary).toContain("Budget Sync");
    expect(summary).toContain("alice\\|admin root");
    expect(summary).toContain("bob\\|ops");
    expect(summary).toContain("dave \\|x");
    expect(summary).toContain("## User Budget Status");
    expect(summary).not.toContain("## Changed Users");
  });
});
