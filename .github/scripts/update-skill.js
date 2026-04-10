// .github/scripts/update-skill.js
//
// Fetches review comments from a merged PR, calls Claude to extract coding
// rules, and merges them into SKILL.md + SKILL_CANDIDATES.md.
//
// Environment variables required:
//   ANTHROPIC_API_KEY  — Claude API key (stored as a GitHub secret)
//   GITHUB_TOKEN       — provided automatically by GitHub Actions
//   PR_NUMBER          — set by the workflow
//   PR_TITLE           — set by the workflow
//   REPO               — set by the workflow (e.g. "org/repo-name")

import fs from 'fs';

// ─── Config ──────────────────────────────────────────────────────────────────

const SKILL_MD        = 'SKILL.md';
const CANDIDATES_MD   = 'SKILL_CANDIDATES.md';
const CANDIDATE_THRESHOLD = 3;   // promote to SKILL.md after this many occurrences
const MODEL           = 'claude-sonnet-4-20250514';
const MAX_TOKENS      = 4096;

const {
  ANTHROPIC_API_KEY,
  GITHUB_TOKEN,
  PR_NUMBER,
  PR_TITLE,
  REPO,
} = process.env;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[update-skill] ${msg}`);
}

function abort(msg) {
  console.error(`[update-skill] ERROR: ${msg}`);
  process.exit(1);
}

function readFileSafe(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8').trim() : '';
}

async function githubGet(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    abort(`GitHub API ${path} returned ${res.status}: ${body}`);
  }
  return res.json();
}

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    abort(`Claude API returned ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.content[0].text.trim();
}

// ─── Step 1: Fetch review comments ───────────────────────────────────────────

log(`Fetching review comments for PR #${PR_NUMBER}…`);

const [reviewComments, prReviews] = await Promise.all([
  githubGet(`/pulls/${PR_NUMBER}/comments`),   // inline diff comments
  githubGet(`/pulls/${PR_NUMBER}/reviews`),    // top-level review bodies
]);

// Combine inline comments and top-level review bodies
const allComments = [
  ...reviewComments.map(c => ({
    author: c.user.login,
    body: c.body,
    file: c.path,
    type: 'inline',
  })),
  ...prReviews
    .filter(r => r.body && r.body.trim().length > 10) // skip empty approvals
    .map(r => ({
      author: r.user.login,
      body: r.body,
      file: null,
      type: 'review',
    })),
];

if (allComments.length === 0) {
  log('No review comments found on this PR. Nothing to learn from — exiting.');
  process.exit(0);
}

log(`Found ${allComments.length} comment(s). Sending to Claude…`);

// ─── Step 2: Format comments for the prompt ──────────────────────────────────

const formattedComments = allComments
  .map((c, i) => {
    const location = c.file ? ` (on \`${c.file}\`)` : '';
    return `Comment ${i + 1}${location}:\n${c.body}`;
  })
  .join('\n\n---\n\n');

// ─── Step 3: Read existing files ─────────────────────────────────────────────

const existingSkill      = readFileSafe(SKILL_MD);
const existingCandidates = readFileSafe(CANDIDATES_MD);

// ─── Step 4: Build prompt ────────────────────────────────────────────────────

const prompt = `
You maintain two files that capture coding rules distilled from PR review comments:

1. **SKILL.md** — established rules the whole team follows. Every AI code review
   tool (BugBot, Cursor, Copilot, Claude Code) reads this file as context, so rules
   here are actively enforced on every future PR.

2. **SKILL_CANDIDATES.md** — candidate rules not yet promoted. Each candidate tracks
   how many times it has been observed. Once a candidate reaches ${CANDIDATE_THRESHOLD}
   or more observations it should be promoted into SKILL.md.

---

CURRENT SKILL.md:
<skill>
${existingSkill || '(empty — this is the first run)'}
</skill>

CURRENT SKILL_CANDIDATES.md:
<candidates>
${existingCandidates || '(empty — this is the first run)'}
</candidates>

NEW REVIEW COMMENTS from PR #${PR_NUMBER} ("${PR_TITLE}"):
<comments>
${formattedComments}
</comments>

---

INSTRUCTIONS:

1. Read every review comment and extract every discrete, actionable coding rule
   it implies. Ignore praise, questions, or discussion that implies no rule.

2. For each extracted rule, check if it already exists in SKILL.md or
   SKILL_CANDIDATES.md (exact match or same intent).

   a. If it matches an existing SKILL.md rule → do nothing (already established).

   b. If it matches a candidate → increment that candidate's count by 1.
      If the count now reaches ${CANDIDATE_THRESHOLD}, promote it: move it out of
      SKILL_CANDIDATES.md and into the correct category in SKILL.md.

   c. If it is genuinely new → add it to SKILL_CANDIDATES.md with count = 1.

3. If a new rule contradicts an existing SKILL.md rule, keep both and append
   "⚠️ conflict — review manually" to the existing rule line.

4. Write every rule as a clear, positive instruction:
   ✅  "Use optional chaining instead of explicit null checks"
   ❌  "Don't forget to use optional chaining"

5. Group SKILL.md rules under descriptive category headings (e.g. Naming,
   Error handling, Testing, Architecture, Performance, Style).

6. Keep SKILL_CANDIDATES.md rules in a simple flat list with their count:
   "- [2/${CANDIDATE_THRESHOLD}] Use optional chaining instead of explicit null checks"

7. Do not invent rules that aren't implied by the comments.

8. Return EXACTLY this format — two clearly delimited sections and nothing else:

<SKILL_MD>
(full updated content of SKILL.md here)
</SKILL_MD>

<CANDIDATES_MD>
(full updated content of SKILL_CANDIDATES.md here)
</CANDIDATES_MD>
`.trim();

// ─── Step 5: Call Claude ──────────────────────────────────────────────────────

const response = await callClaude(prompt);

// ─── Step 6: Parse Claude's response ─────────────────────────────────────────

const skillMatch      = response.match(/<SKILL_MD>([\s\S]*?)<\/SKILL_MD>/);
const candidatesMatch = response.match(/<CANDIDATES_MD>([\s\S]*?)<\/CANDIDATES_MD>/);

if (!skillMatch || !candidatesMatch) {
  log('Unexpected Claude response format. Raw output:');
  console.log(response);
  abort('Could not parse <SKILL_MD> and <CANDIDATES_MD> blocks from response.');
}

const newSkill      = skillMatch[1].trim();
const newCandidates = candidatesMatch[1].trim();

// ─── Step 7: Write files ──────────────────────────────────────────────────────

fs.writeFileSync(SKILL_MD,      newSkill      + '\n', 'utf8');
fs.writeFileSync(CANDIDATES_MD, newCandidates + '\n', 'utf8');

log(`SKILL.md written (${newSkill.split('\n').length} lines)`);
log(`SKILL_CANDIDATES.md written (${newCandidates.split('\n').length} lines)`);
log('Done.');
