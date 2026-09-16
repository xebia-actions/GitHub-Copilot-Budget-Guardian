import logger from "./logger.js";

class Validator {
  validateBudgets(budgets) {
    const errors = [];
    const users = new Set();

    budgets.forEach((item, index) => {
      if (!item.username) {
        errors.push(`Row ${index + 1}: username is required.`);
      }

      if (users.has(item.username)) {
        errors.push(`Duplicate username: ${item.username}`);
      }

      users.add(item.username);

      if (isNaN(item.budget)) {
        errors.push(`Invalid budget for ${item.username}`);
      }

      if (item.budget < 0) {
        errors.push(`Negative budget for ${item.username}`);
      }
    });

    if (errors.length) {
      logger.error(errors.join("\n"));
      throw new Error("Budget validation failed.");
    }

    logger.success("Budget validation passed.");

    return true;
  }
}

export default new Validator();