---
name: github-review
description: Perform code review on a GitHub pull request using the gh CLI.
user-invocable: false
---

# GitHub Code Review

You received a request to review a GitHub pull request. Your job is to provide a thorough, constructive review.

## Capabilities and Limitations

**What you CAN do:**
- Review code for correctness, security, architecture, and quality
- Post a review comment with detailed feedback
- Reference specific files, line numbers, and code patterns
- Read any file in the repository via `gh` CLI

**What you CANNOT do:**
- Approve or request changes (use `--comment` only, not `--approve` or `--request-changes`)
- Modify the PR code directly
- Merge, close, or reopen PRs
- Post multiple review comments (consolidate into one review)

## Prerequisites

Before executing, verify `gh` is installed and authenticated:

```bash
gh --version
```

If not installed, tell the user:
> `gh` CLI is required. Install it: https://cli.github.com/

## GitHub Account

If the message includes a `<gh_account>` tag, switch to that account first:

```bash
gh auth switch --user <account>
```

## Input Format

The message contains XML-tagged sections:

| Tag | Content |
|-----|---------|
| `<event_type>` | Event type: `pr_opened`, `pr_comment`, `pr_review`, etc. |
| `<trigger_context>` | Human-readable description of what triggered this |
| `<trigger_username>` | Who requested the review |
| `<is_pr>` | Always `true` for code reviews |
| `<repo>` | Repository name (owner/repo) |
| `<gh_account>` | GitHub account for `gh auth switch` (optional) |
| `<comment_id>` | ID of the triggering comment (optional) |
| `<pr_metadata>` | PR summary: number, title, state, +additions/-deletions, files, commits, branch, URL |
| `<pr_body>` | Full PR description (pre-fetched from webhook) |
| `<trigger_comment>` | Specific review instructions (optional, for comment-triggered reviews) |
| `<instructions>` | gh command hints for fetching diff and posting review |

## Immediate Feedback

If `<comment_id>` is present, add a reaction to acknowledge receipt:

```bash
gh api repos/<owner>/<repo>/issues/comments/<comment_id>/reactions \
  --method POST --field content=eyes
```

## Context Gathering (CRITICAL — Do NOT Skip)

You MUST fully understand the PR before reviewing. The message includes pre-fetched data — use it, then fill gaps.

### What you already have (from XML tags):
- `<pr_body>` — full PR description, no need to re-fetch
- `<pr_metadata>` — PR stats (additions, deletions, files, commits, branch info)

### What you still need to fetch:

#### Step 1: Read the full PR comment thread

```bash
gh pr view <number> --repo <owner/repo> --comments
```

#### Step 2: Read all commits in the PR

```bash
gh pr view <number> --repo <owner/repo> --json commits --jq '.commits[] | "\(.oid[:8]) \(.messageHeadline)"'

# For individual commit details:
gh api repos/<owner>/<repo>/commits/<sha> --jq '{message: .commit.message, files: [.files[] | {filename, status, additions, deletions}]}'
```

#### Step 3: List all changed files with stats

```bash
gh pr view <number> --repo <owner/repo> --json files --jq '.files[] | "\(.path) (\(.status)) +\(.additions) -\(.deletions)"'
```

#### Step 4: Read existing review comments (avoid duplication)

```bash
gh api repos/<owner>/<repo>/pulls/<number>/reviews --jq '.[] | "\(.user.login) (\(.state)): \(.body)"'
gh api repos/<owner>/<repo>/pulls/<number>/comments --jq '.[] | "\(.user.login) on \(.path):\(.line): \(.body)"'
```

#### Step 5: If the PR references an issue, read it

```bash
gh issue view <issue-number> --repo <owner/repo> --comments
```

#### Step 6: Clone the repo and read project docs

```bash
gh repo clone <owner/repo>
cd <repo>
```

Read in order of priority:
1. **`README.md`** — project overview, tech stack
2. **`CLAUDE.md` / `AGENTS.md`** — AI agent conventions, golden rules, coding standards
3. **`docs/` directory** — architecture docs, design docs
4. **Source files adjacent to the changed files** — understand surrounding code

#### Step 7: Read source files beyond the diff

Read complete files being modified to understand:
- How changed functions are called by other code
- Whether the change is consistent with surrounding patterns
- Whether imports/exports are properly updated

```bash
# Via API (without cloning)
gh api repos/<owner>/<repo>/contents/<file-path> --jq '.content' | base64 -d
```

## Steps

1. Add 👀 reaction (if `<comment_id>` available)
2. Use pre-fetched `<pr_body>` and `<pr_metadata>` — skip re-fetching these
3. Fetch remaining context (comments, commits, diff, reviews, source)
4. Fetch the full PR diff:
   ```bash
   gh pr diff <number> --repo <owner/repo>
   ```
5. Review the changes against these criteria:

   **Correctness**
   - Logic errors, off-by-one, null/undefined handling
   - Edge cases not covered
   - Race conditions or async issues
   - Whether the change actually solves the linked issue

   **Security**
   - Injection vulnerabilities (SQL, XSS, command injection)
   - Auth/authz bypass
   - Secrets or credentials exposure
   - Input validation at system boundaries

   **Architecture & Design**
   - Consistency with existing patterns and project conventions
   - Compliance with CLAUDE.md / AGENTS.md guidelines if present
   - Proper separation of concerns
   - Whether the approach is the simplest that works

   **Code Quality**
   - Clear naming and structure
   - Unnecessary duplication
   - Dead code or unused imports
   - Proper error handling

   **Tests**
   - Missing test coverage for new behavior
   - Whether existing tests still pass conceptually
   - Edge cases that should be tested

6. Post your review using the gh command from `<instructions>`
7. Add 🚀 reaction when done (if `<comment_id>` available)

## Review Format

Structure your review for clarity and actionability:

```markdown
## Summary
[1-2 sentence overall assessment]

## Issues

### [Critical/Major/Minor]: [Short title]
**File:** `path/to/file.ts:42`
**Description:** [What's wrong and why it matters]
**Suggestion:**
\`\`\`ts
// suggested fix
\`\`\`

[Repeat for each issue]

## Positive Notes
- [Things done well — reinforce good practices]
```

- **Reference specific file paths and line numbers** for every issue
- **Provide concrete fix suggestions** in code blocks
- **Link to relevant files**: `https://github.com/<owner>/<repo>/blob/<branch>/<path>#L<line>`
- **Categorize severity**: Critical (must fix), Major (should fix), Minor (consider fixing)

## Constraints

- Focus on substantive issues, not style nitpicks (formatting, whitespace)
- Be constructive — always suggest a fix when pointing out a problem
- If the code looks good, say so briefly — don't invent issues
- Do not modify any code — only review
- Never expose tokens, secrets, or credentials in your review
- Respect the project's conventions — don't push personal style preferences
- If a change is large, prioritize the most impactful feedback
