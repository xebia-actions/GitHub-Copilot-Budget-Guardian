import https from "https";
import { URL } from "url";

/**
 * Posts a JSON payload to a URL over HTTPS.
 *
 * @param {string} urlString - Target URL
 * @param {object} payload - JSON payload to send
 * @returns {Promise<void>}
 */
function postJson(urlString, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(urlString);
    const timeoutMs = 10000;

    const options = {
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      res.resume();
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`HTTP request failed with status ${res.statusCode}`));
      }
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`HTTP request timed out after ${timeoutMs}ms`));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export { postJson };
