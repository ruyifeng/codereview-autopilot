# codereview-autopilot

> Your team's code review wisdom, automatically distilled into rules — so AI reviewers learn from your history instead of starting from scratch.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-Ready-2088FF?logo=github-actions&logoColor=white)](https://github.com/features/actions)
[![Powered by Claude](https://img.shields.io/badge/Powered%20by-Claude%20API-orange)](https://anthropic.com)

---

## What it does

Every time a PR is merged, `codereview-autopilot` reads the review comments, extracts discrete coding rules using Claude, and maintains a `SKILL.md` file in your repo.

That file is automatically picked up as context by any AI code review tool — BugBot, Cursor, GitHub Copilot, Claude Code — so your team's conventions are enforced on every future PR without anyone having to repeat themselves.

```
Dev leaves comment: "use optional chaining here instead of null checks"
  → PR merges
  → codereview-autopilot extracts rule: "Prefer optional chaining over explicit null checks"
  → rule is added to SKILL.md
  → next PR: AI reviewer catches the pattern before any human sees it
  → Dev never has to leave that comment again
```

**The core idea:** code review comments are institutional knowledge. Right now that knowledge lives in closed PR threads nobody reads. `codereview-autopilot` surfaces it into a living document that compounds over time.

---

## How it works

```
PR merged
  └─→ GitHub Action fires
        └─→ Fetch all review comments via GitHub API
              └─→ Send to Claude: "extract rules from these comments"
                    └─→ Merge rules into SKILL.md + SKILL_CANDIDATES.md
                          └─→ Open a new PR for human review
                                └─→ Human merges → SKILL.md updated
                                      └─→ All future AI reviewers read it
```

Two files are maintained automatically:

| File | Purpose |
|---|---|
| `SKILL.md` | Promoted rules (seen 3+ times). Read by all AI tools. |
| `SKILL_CANDIDATES.md` | New rules under observation. Promoted when they recur. |

A candidate rule is only promoted to `SKILL.md` after appearing in **3 separate PRs** — so one-off comments don't pollute your rule set.

---

## Quickstart

### 1. Copy the files into your repo

```
your-repo/
├── .github/
│   ├── workflows/
│   │   └── update-skill.yml
│   └── scripts/
│       └── update-skill.js
```

### 2. Add your Anthropic API key or any AI assitant API key as a GitHub secret

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key from [console.anthropic.com](https://console.anthropic.com) |

`GITHUB_TOKEN` is provided automatically by GitHub Actions — no setup needed.

### 3. Optional: add `node-fetch` to your package.json

If your repo already has a `package.json`, add the dependency there:

```json
{
  "dependencies": {
    "node-fetch": "^3.0.0"
  }
}
```

If you don't have a `package.json`, the workflow installs it on the fly — no change needed.

### 4. Merge any PR with review comments

The workflow fires automatically. It will:
- Extract rules from the review comments
- Open a new PR titled `chore: SKILL.md update from PR #N`
- Show you a diff of what changed

Review it, edit if needed, and merge.

---

## What SKILL.md looks like

```markdown
# Code Review Rules

## Naming
- Use camelCase for all React component props
- Prefix private class methods with underscore

## Error handling
- All async functions must have a try/catch; never swallow errors silently
- HTTP errors must log the status code and request path

## Testing
- Every new utility function requires a corresponding unit test
- Mock external API calls in tests; never hit real endpoints

## Style
- Prefer optional chaining over explicit null checks
```

This file lives at the root of your repo. Most AI review tools (Cursor, BugBot, Copilot, Claude Code) automatically include repo files as context — no further configuration needed.

---

## Configuration

Edit the top of `.github/scripts/update-skill.js` to tune behaviour:

```js
const CANDIDATE_THRESHOLD = 3;   // how many occurrences before a rule is promoted
const MODEL           = 'claude-sonnet-4-20250514';
const MAX_TOKENS      = 4096;
```

---

## Running locally

You can run the script locally to bootstrap `SKILL.md` from a specific PR before the Action has any history.

**Prerequisites:** Node.js 18+

```bash
# Clone your repo (or this one to test)
git clone https://github.com/YOUR_USERNAME/codereview-autopilot
cd codereview-autopilot

# Install dependency
npm install node-fetch@3

# Set environment variables
export ANTHROPIC_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...          # personal access token with repo scope
export PR_NUMBER=42                  # the PR you want to learn from
export PR_TITLE="My feature PR"
export REPO=your-org/your-repo

# Run
node .github/scripts/update-skill.js
```

After running, `SKILL.md` and `SKILL_CANDIDATES.md` will be created or updated in the current directory.

**Getting a GitHub personal access token:**
1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Generate new token with `repo` scope
3. Copy and use as `GITHUB_TOKEN` above

---

## Compatibility

Works alongside any AI code review tool that reads repo context:

| Tool | How it picks up SKILL.md |
|---|---|
| **Cursor / BugBot** | Reads repo files as context automatically |
| **GitHub Copilot** | Includes repo files in workspace context |
| **Claude Code** | Reads `SKILL.md` as a skill file natively |
| **Coderabbit** | Configure as a knowledge file in `.coderabbit.yml` |
| **Any custom LLM reviewer** | Pass `SKILL.md` contents in your system prompt |

---

## FAQ

**What if a review comment is a question or praise, not a rule?**
Claude is prompted to ignore non-rule content. Questions, approvals, and conversational replies are filtered out.

**What if two rules conflict?**
Conflicting rules are flagged with `⚠️ conflict — review manually` in the update PR. A human resolves it before it merges.

**What if the PR has no review comments?**
The workflow exits early with no changes and no PR is opened.

**Can I run this on multiple repos?**
Yes — copy the workflow and script into each repo. Each repo builds its own independent `SKILL.md` reflecting that team's conventions.

**Does this send my code to Anthropic?**
Only review comment text and `SKILL.md` are sent — not your source code. The diff is never transmitted.

---

## Contributing

PRs welcome. Particularly interested in:
- Aggregating rules across multiple repos into a shared org-level `SKILL.md`

---

## License

MIT — use it, fork it, build on it.
