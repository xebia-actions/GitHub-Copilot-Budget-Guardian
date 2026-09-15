import * as core from "@actions/core";

class Logger {
  info(message) {
    core.info(`ℹ️ ${message}`);
  }

  success(message) {
    core.info(`✅ ${message}`);
  }

  warning(message) {
    core.warning(`⚠️ ${message}`);
  }

  error(message) {
    core.error(`❌ ${message}`);
  }

  debug(message) {
    core.debug(`🔍 ${message}`);
  }

  startGroup(title) {
    core.startGroup(`📂 ${title}`);
  }

  endGroup() {
    core.endGroup();
  }

  setOutput(name, value) {
    // Running inside GitHub Actions
    if (process.env.GITHUB_ACTIONS === "true") {
      core.setOutput(name, value);
      return;
    }

    // Running locally
    this.info(`Output -> ${name}: ${value}`);
  }

  fail(error) {
    core.setFailed(error instanceof Error ? error.message : error);
  }
}

export default new Logger();
