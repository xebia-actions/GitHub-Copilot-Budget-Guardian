import { jest } from "@jest/globals";

jest.unstable_mockModule("../src/logger.js", () => ({
  default: {
    success: jest.fn(),
    warning: jest.fn()
  }
}));

jest.unstable_mockModule("../src/utils.js", () => ({
  postJson: jest.fn()
}));

const logger = (await import("../src/logger.js")).default;
const { postJson } = await import("../src/utils.js");
const { sendSlack } = await import("../src/services/slack-service.js");

const baseContext = {
  repository: "acme/copilot",
  enterprise: "acme-enterprise",
  workflowName: "Budget Sync",
  runUrl: "https://github.com/acme/copilot/actions/runs/1",
  executionTime: "2026-01-01T00:00:00.000Z",
  slackWebhook: "https://hooks.slack.com/services/T00/B00/test"
};

const baseResult = {
  created: [{ username: "alice", budget: 100 }],
  updated: [{ user: "bob", from: 100, to: 200 }],
  skipped: [{ username: "carol", budget: 300 }],
  failed: []
};

describe("slack-service.sendSlack", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    postJson.mockResolvedValue();
  });

  test("skips gracefully when slackWebhook is not configured", async () => {
    const context = { ...baseContext, slackWebhook: "" };
    await sendSlack(context, baseResult);

    expect(postJson).not.toHaveBeenCalled();
    expect(logger.warning).toHaveBeenCalledWith(
      "SLACK_WEBHOOK is not configured. Skipping Slack notification."
    );
  });

  test("skips gracefully when slackWebhook is whitespace only", async () => {
    const context = { ...baseContext, slackWebhook: "   " };
    await sendSlack(context, baseResult);

    expect(postJson).not.toHaveBeenCalled();
    expect(logger.warning).toHaveBeenCalledWith(
      "SLACK_WEBHOOK is not configured. Skipping Slack notification."
    );
  });

  test("sends Block Kit payload to the webhook URL", async () => {
    await sendSlack(baseContext, baseResult);

    expect(postJson).toHaveBeenCalledTimes(1);
    const [url, payload] = postJson.mock.calls[0];
    expect(url).toBe(baseContext.slackWebhook);
    expect(payload.blocks).toBeDefined();
    expect(Array.isArray(payload.blocks)).toBe(true);
  });

  test("includes repository and enterprise in section fields", async () => {
    await sendSlack(baseContext, baseResult);

    const [, payload] = postJson.mock.calls[0];
    const sectionBlock = payload.blocks.find(
      (b) => b.type === "section" && b.fields
    );
    const fieldTexts = sectionBlock.fields.map((f) => f.text);
    expect(fieldTexts.some((t) => t.includes("acme/copilot"))).toBe(true);
    expect(fieldTexts.some((t) => t.includes("acme-enterprise"))).toBe(true);
  });

  test("includes created, updated, skipped, failed counts", async () => {
    await sendSlack(baseContext, baseResult);

    const [, payload] = postJson.mock.calls[0];
    const allText = JSON.stringify(payload.blocks);
    expect(allText).toContain("Created");
    expect(allText).toContain("Updated");
    expect(allText).toContain("Skipped");
    expect(allText).toContain("Failed");
  });

  test("includes changed users in output", async () => {
    await sendSlack(baseContext, baseResult);

    const [, payload] = postJson.mock.calls[0];
    const allText = JSON.stringify(payload.blocks);
    expect(allText).toContain("alice");
    expect(allText).toContain("bob");
  });

  test("uses error emoji when there are failures", async () => {
    const resultWithFailure = {
      ...baseResult,
      failed: [{ user: "dave", error: "API error" }]
    };

    await sendSlack(baseContext, resultWithFailure);

    const [, payload] = postJson.mock.calls[0];
    const headerBlock = payload.blocks.find((b) => b.type === "header");
    expect(headerBlock.text.text).toContain(":x:");
  });

  test("uses success emoji when there are changes and no failures", async () => {
    await sendSlack(baseContext, baseResult);

    const [, payload] = postJson.mock.calls[0];
    const headerBlock = payload.blocks.find((b) => b.type === "header");
    expect(headerBlock.text.text).toContain(":white_check_mark:");
  });

  test("includes View Workflow Run button with correct URL", async () => {
    await sendSlack(baseContext, baseResult);

    const [, payload] = postJson.mock.calls[0];
    const actionsBlock = payload.blocks.find((b) => b.type === "actions");
    expect(actionsBlock.elements[0].url).toBe(baseContext.runUrl);
  });

  test("logs success after successful send", async () => {
    await sendSlack(baseContext, baseResult);

    expect(logger.success).toHaveBeenCalledWith("Slack notification sent.");
  });
});
