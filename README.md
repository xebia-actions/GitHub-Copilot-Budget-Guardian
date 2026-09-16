# GitHub Copilot Budget Guardian

GitHub Copilot Budget Guardian is a GitHub Action for managing Copilot Enterprise budgets as code. Define desired budgets in a CSV file, and the Action validates the input, compares it with Enterprise state, applies necessary changes, and produces an audit trail.

[![CI](https://github.com/xebia-actions/GitHub-Copilot-Budget-Guardian/actions/workflows/test.yml/badge.svg)](https://github.com/xebia-actions/GitHub-Copilot-Budget-Guardian/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/xebia-actions/GitHub-Copilot-Budget-Guardian)](https://github.com/xebia-actions/GitHub-Copilot-Budget-Guardian/releases)

## Key Capabilities

- **CSV-driven budgets** - Define and version-control budgets as code.
- **Safe synchronization** - Validate input, fetch all existing budgets with pagination, and compare state.
- **CREATE, UPDATE, and SKIP actions** - Change only users whose desired state differs.
- **Dry-run mode** - Preview intended changes without writing to GitHub.
- **Audit reports** - Generate Markdown, JSON, and CSV results with per-user status.
- **GitHub Job Summary** - Show counts and per-user status in the workflow run.
- **Optional notifications** - Send results by Email, Slack, or Microsoft Teams.

## Quick Start

1. **Create `budgets.csv`:**

   ```csv
   username,budget,team,reason
   alice,50,Engineering,Q1 allocation
   bob,100,Platform,Premium user
   ```

2. **Add repository secrets** in Settings > Secrets and variables > Actions:
   - `ENTERPRISE_ADMIN_PAT` - A PAT with the Enterprise permissions required by the Copilot budget API.
   - `ENTERPRISE_SLUG` - Your GitHub Enterprise slug.

3. **Add `.github/workflows/copilot-budget-sync.yml`:**

   ```yaml
   name: Copilot Budget Sync

   on:
     workflow_dispatch:

   permissions:
     contents: read

   jobs:
     sync:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v7.0.1

         - name: Sync Copilot budgets
           id: guardian
           uses: xebia-actions/GitHub-Copilot-Budget-Guardian@v1.0.0
           with:
             github-token: "${{ secrets.ENTERPRISE_ADMIN_PAT }}"
             enterprise-slug: "${{ secrets.ENTERPRISE_SLUG }}"
             budget-file: budgets.csv
             dry-run: "true"

         - name: Upload reports
           uses: actions/upload-artifact@v7.0.1
           with:
             name: budget-sync-report
             path: artifacts/
   ```

4. Run the workflow manually. Review the Job Summary and reports, then change `dry-run` to `"false"` only after confirming the intended changes.

## How Synchronization Works

1. The Action parses and validates the CSV. `username` and `budget` are required; usernames must be unique and budgets cannot be negative.
2. It fetches all existing Enterprise budgets, requesting up to 100 per page until the final page.
3. It compares each CSV row with the matching Enterprise user budget:
   - **CREATE** - No existing budget was found.
   - **UPDATE** - The existing budget amount differs.
   - **SKIP** - The budget amount already matches.
4. In production, successful CREATE and UPDATE operations write to GitHub. In dry-run mode, intended operations are reported but not written.
5. Per-user operation failures are recorded in the result and reports. If fetching existing budgets fails, production synchronization stops to prevent changes based on incomplete state; dry-run continues in validation-only mode.

## CSV Format

Required columns are `username` and `budget`. `team` and `reason` are optional reporting fields and do not change GitHub configuration.

| Column | Required | Purpose |
|--------|----------|---------|
| `username` | Yes | GitHub username used to identify the user |
| `budget` | Yes | Numeric budget amount; its unit depends on GitHub's pricing model |
| `team` | No | Team or department label for reports |
| `reason` | No | Context for reports |

When creating a budget, the Action uses `budget_scope: user`, `budget_product_sku: premium_requests`, and `budget_type: BundlePricing`; CREATE and UPDATE operations set `prevent_further_usage: true`.

## Recommended Production Workflow

1. Commit the desired CSV and configure the PAT and Enterprise slug secrets.
2. Run with `dry-run: "true"`.
3. Review the Job Summary and `artifacts/budget-report.md`.
4. Verify the proposed changes and obtain any required approval.
5. Change to `dry-run: "false"`, run the workflow, and retain the final reports.

## Inputs and Outputs

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | Yes | - | GitHub PAT for Enterprise budget API access |
| `enterprise-slug` | Yes | - | GitHub Enterprise slug |
| `budget-file` | No | `budgets.csv` | Path to the CSV file |
| `dry-run` | No | `false` | Set to `"true"` to preview without writes |
| `slack-webhook` | No | - | Slack Incoming Webhook URL |
| `teams-webhook` | No | - | Microsoft Teams Incoming Webhook URL |
| `notify-on` | No | `changes-only` | `always` or `changes-only` |

### Outputs

| Output | Description |
|--------|-------------|
| `created` | Number of CREATE results |
| `updated` | Number of UPDATE results |
| `skipped` | Number of SKIP results |
| `failed` | Number of failed budget operations |

## Reports

Successful runs generate these files in `artifacts/`:

- **`budget-report.md`** - Human-readable summary, synchronization status table, and input data.
- **`budget-report.json`** - Structured `summary`, `synchronization`, and `input` data for integrations.
- **`budget-report.csv`** - `username`, `action`, `requested_budget`, `previous_budget`, and `error` columns.

The reports include CREATED, UPDATED, SKIPPED, and FAILED results where applicable. Upload `artifacts/` with `actions/upload-artifact@v7.0.1` to retain them with the workflow run.

## GitHub Job Summary

When running in GitHub Actions, the Action appends a summary to the workflow run. It includes the repository, Enterprise, workflow, execution time, result counts, and a per-user status table with budget comparisons.

## Notifications

Notifications are optional. Email, Teams, and Slack are attempted independently; missing configuration or a channel failure does not fail synchronization.

### Email

Set these environment variables from GitHub Secrets: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `ADMIN_NOTIFICATION_EMAILS` (comma-separated recipients). `SMTP_PORT` is optional and defaults to `587`; port `465` uses a secure connection.

### Slack and Microsoft Teams

Pass a valid HTTPS URL through `slack-webhook` or `teams-webhook`.

### Policy

`notify-on: changes-only` is the default and sends notifications only when budgets were created, updated, or failed. `notify-on: always` sends notifications on every run. Reports and the Job Summary are generated regardless of this setting.

## Scheduling

Use `workflow_dispatch` for manual runs, or combine it with a schedule and CSV-change trigger:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: "0 6 * * 1"
  push:
    paths:
      - budgets.csv
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `403 Forbidden` | Verify the PAT has the Enterprise permissions required by the budget API. |
| `404 Not Found` | Verify `enterprise-slug` matches your GitHub Enterprise slug. |
| Budget validation fails | Ensure every row has a username and numeric, non-negative budget, with no duplicate usernames. |
| Budget file not found | Check `budget-file`; it is resolved relative to the repository working directory. |
| CSV parsing or encoding errors | Save the file as UTF-8 and check its headers and quoting. |
| Reports missing | Add an `actions/upload-artifact@v7.0.1` step with `path: artifacts/`. |
| Notifications not sent | Check the relevant webhook URL or SMTP variables. Missing notification configuration is skipped by design. |
| API rate limit exceeded | Reduce the workflow frequency or space out runs. |
| Production fetch failure | Verify Enterprise connectivity and PAT permissions. No write operations are attempted after this failure. |

## Limitations

- **No deletion:** The Action creates and updates budgets but does not remove them.
- **Best-effort notifications:** External SMTP or webhook failures do not fail synchronization.
- **Dry-run scope:** Dry-run does not test SMTP or webhook connectivity; it validates the CSV, fetches state, compares it, and reports intended operations.
- **Concurrent runs:** Multiple runs against the same Enterprise can race. Use GitHub Actions concurrency controls when needed.
- **Pagination:** Existing budgets are fetched 100 per page until exhausted; API availability and rate limits still apply.

## Security

- Store PATs, SMTP credentials, and webhook URLs in GitHub Secrets; never commit them.
- Use a dedicated PAT with only the required Enterprise budget permissions.
- Use HTTPS webhook URLs and verify they belong to the intended workspace.
- Retain reports and Job Summaries according to your audit requirements.
- Reports do not include PATs, tokens, or SMTP passwords.
- The project also includes GitHub Actions dependency/security checks, pinned and locked Actions for reproducible workflows, and automated SemVer/release consistency validation.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
