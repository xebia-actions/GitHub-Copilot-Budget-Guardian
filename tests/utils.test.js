import { jest } from "@jest/globals";

jest.unstable_mockModule("https", () => ({
  default: {
    request: jest.fn()
  }
}));

const https = (await import("https")).default;
const { postJson } = await import("../src/utils.js");

describe("utils.postJson", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uses explicit URL port when provided", async () => {
    https.request.mockImplementation((options, cb) => {
      const res = {
        statusCode: 200,
        resume: jest.fn()
      };

      const req = {
        setTimeout: jest.fn(),
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(() => cb(res)),
        destroy: jest.fn()
      };

      return req;
    });

    await expect(
      postJson("https://example.com:8443/hook", { ok: true })
    ).resolves.toBeUndefined();

    expect(https.request).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "example.com",
        port: "8443",
        path: "/hook",
        method: "POST"
      }),
      expect.any(Function)
    );
  });

  test("rejects with timeout error when request stalls", async () => {
    https.request.mockImplementation((_options, _cb) => {
      let errorHandler;
      let timeoutHandler;

      const req = {
        setTimeout: jest.fn((_ms, handler) => {
          timeoutHandler = handler;
        }),
        on: jest.fn((event, handler) => {
          if (event === "error") {
            errorHandler = handler;
          }
        }),
        write: jest.fn(),
        end: jest.fn(() => {
          timeoutHandler();
        }),
        destroy: jest.fn((err) => {
          errorHandler(err);
        })
      };

      return req;
    });

    await expect(
      postJson("https://example.com/hook", { ok: true })
    ).rejects.toThrow("HTTP request timed out after 10000ms");
  });
});
