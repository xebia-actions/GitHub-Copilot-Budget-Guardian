import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import logger from "./logger.js";

class BudgetService {
  loadBudgets(filePath) {
    const fullPath = path.resolve(filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Budget file not found: ${fullPath}`);
    }

    logger.info(`Reading budget file: ${fullPath}`);

    const csv = fs.readFileSync(fullPath, "utf8");

    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const budgets = records.map((row) => ({
      username: row.username,
      budget: Number(row.budget),
      reason: row.reason || "",
      team: row.team || ""
    }));

    logger.success(`${budgets.length} budget records loaded.`);

    return budgets;
  }

  printSummary(budgets) {
    logger.startGroup("Budget Summary");

    budgets.forEach((user) => {
      logger.info(
        `${user.username} | Budget=${user.budget} | Team=${user.team}`
      );
    });

    logger.endGroup();
  }
}

export default new BudgetService();