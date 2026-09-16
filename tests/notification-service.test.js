import { jest } from "@jest/globals";

jest.unstable_mockModule("../src/logger.js", () => ({
  default: {
    startGroup: jest.fn(),
    endGroup: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    success: jest.fn()
  }
}));

jest.unstable_mockModule("../src/services/email-service.js", () => ({
  sendEmail: jest.fn()
}));

jest.unstable_mockModule("../src/services/teams-service.js", () => ({
  sendTeams: jest.fn()
}));

jest.unstable_mockModule("../src/services/slack-service.js", () => ({
  sendSlack: jest.fn()
}));

const logger = (await import("../src/logger.js")).default;
const { sendEmail } = await import("../src/services/email-service.js");
const { sendTeams } = await import("../src/services/teams-service.js");
const { sendSlack } = await import("../src/services/slack-service.js");
const { runNotifications } = await import("../src/services/notification-service.js");

const baseContext = {
  repository: "acme/copilot",
  enterprise: "acme-enterprise",
  workflowName: "Budget Sync",
  runUrl: "https://github.com/acme/copilot/actions/runs/1",
  executionTime: "2026-01-01T00:00:00.000Z",
  slackWebhook: "https://hooks.slack.com/services/T00/B00/test",
  teamsWebhook: "https://outlook.office.com/webhook/test"
};

const resultWithChanges = {
  created: [{ username: "alice", budget: 100 }],
  updated: [{ user: "bob", from: 100, to: 200 }],
  skipped: [],
  failed: []
};

const resultNoChanges = {
  created: [],
  updated: [],
  skipped: [{ username: "alice", budget: 100 }],
  failed: []
};

describe("notification-service.runNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendEmail.mockResolvedValue();
    sendTeams.mockResolvedValue();
    sendSlack.mockResolvedValue();
  });

  test("runs all three channels when notify-on is always", async () => {
    await runNotifications(baseContext, resultNoChanges, "always");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendTeams).toHaveBeenCalledTimes(1);
    expect(sendSlack).toHaveBeenCalledTimes(1);
  });

  test("runs all three channels when there are changes and notify-on is changes-only", async () => {
    await runNotifications(baseContext, resultWithChanges, "changes-only");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendTeams).toHaveBeenCalledTimes(1);
    expect(sendSlack).toHaveBeenCalledTimes(1);
  });

  test("skips all channels when no changes and notify-on is changes-only", async () => {
    await runNotifications(baseContext, resultNoChanges, "changes-only");

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendTeams).not.toHaveBeenCalled();
    expect(sendSlack).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "No changes detected. Skipping notifications (notify-on: changes-only)."
    );
  });

  test("treats failed entries as changes for notification purposes", async () => {
    const resultWithFailures = {
      created: [],
      updated: [],
      skipped: [],
      failed: [{ user: "dave", error: "API error" }]
    };

    await runNotifications(baseContext, resultWithFailures, "changes-only");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendTeams).toHaveBeenCalledTimes(1);
    expect(sendSlack).toHaveBeenCalledTimes(1);
  });

  test("continues when Email notification throws", async () => {
    sendEmail.mockRejectedValue(new Error("SMTP failure"));

    await runNotifications(baseContext, resultWithChanges, "always");

    expect(logger.warning).toHaveBeenCalledWith(
      "Email notification failed: SMTP failure"
    );
    expect(sendTeams).toHaveBeenCalledTimes(1);
    expect(sendSlack).toHaveBeenCalledTimes(1);
  });

  test("continues when Teams notification throws", async () => {
    sendTeams.mockRejectedValue(new Error("Webhook unreachable"));

    await runNotifications(baseContext, resultWithChanges, "always");

    expect(logger.warning).toHaveBeenCalledWith(
      "Teams notification failed: Webhook unreachable"
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendSlack).toHaveBeenCalledTimes(1);
  });

  test("continues when Slack notification throws", async () => {
    sendSlack.mockRejectedValue(new Error("Connection refused"));

    await runNotifications(baseContext, resultWithChanges, "always");

    expect(logger.warning).toHaveBeenCalledWith(
      "Slack notification failed: Connection refused"
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendTeams).toHaveBeenCalledTimes(1);
  });

  test("continues even when all channels throw", async () => {
    sendEmail.mockRejectedValue(new Error("SMTP failure"));
    sendTeams.mockRejectedValue(new Error("Teams failure"));
    sendSlack.mockRejectedValue(new Error("Slack failure"));

    await expect(
      runNotifications(baseContext, resultWithChanges, "always")
    ).resolves.not.toThrow();

    expect(logger.warning).toHaveBeenCalledTimes(3);
  });

  test("handles non-Error rejections safely", async () => {
    sendEmail.mockRejectedValue(null);
    sendTeams.mockRejectedValue("service unavailable");
    sendSlack.mockRejectedValue({ code: 503, reason: "timeout" });

    await expect(
      runNotifications(baseContext, resultWithChanges, "always")
    ).resolves.not.toThrow();

    expect(logger.warning).toHaveBeenCalledWith(
      "Email notification failed: Unknown error"
    );
    expect(logger.warning).toHaveBeenCalledWith(
      "Teams notification failed: service unavailable"
    );
    expect(logger.warning).toHaveBeenCalledWith(
      'Slack notification failed: {"code":503,"reason":"timeout"}'
    );
  });

  test("passes context and result to each channel", async () => {
    await runNotifications(baseContext, resultWithChanges, "always");

    expect(sendEmail).toHaveBeenCalledWith(baseContext, resultWithChanges);
    expect(sendTeams).toHaveBeenCalledWith(baseContext, resultWithChanges);
    expect(sendSlack).toHaveBeenCalledWith(baseContext, resultWithChanges);
  });
});
