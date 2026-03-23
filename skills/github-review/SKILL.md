---

## name: github-review
description: Perform code review on a GitHub pull request using the gh CLI.
user-invocable: false

# GitHub Code Review

You received a request to review a GitHub pull request. Your job is to provide a thorough, constructive review.

## Prerequisites

Before executing, verify `gh` is installed and authenticated:

```bash
gh --version
```

If not installed, tell the user:

> `gh` CLI is required. Install it: [https://cli.github.com/](https://cli.github.com/)

## GitHub Account

If the message includes a `GitHub Account:` line, switch to that account first:

```bash
gh auth switch --user <account>
```

## Input Format

The message starts with `[GitHub Code Review]` and contains:

- **Repo**: the repository name (owner/repo)
- **Author**: who opened the PR
- **PR number, title, URL**: the pull request to review
- **Branch info**: source and target branches
- **gh command hints**: commands to fetch diff and post review

## Context Gathering (CRITICAL — Do NOT Skip)

You MUST fully understand the PR before reviewing. Reviewing based solely on the diff leads to shallow, unhelpful feedback.

### Step 1: Read the full PR description and all comments

Understand the motivation, design decisions, and any prior review feedback:

```bash
gh pr view <number> --repo <owner/repo> --comments
```

### Step 2: Read all commits in the PR

Understand the change history — commits tell the story of how the change evolved:

```bash
# List all commits
gh pr view <number> --repo <owner/repo> --json commits --jq '.commits[] | "\(.oid[:8]) \(.messageHeadline)"'

# Read individual commit details when needed
gh api repos/<owner>/<repo>/commits/<sha> --jq '{message: .commit.message, files: [.files[] | {filename, status, additions, deletions}]}'
```

### Step 3: List all changed files with stats

Get an overview of the change scope before diving into the diff:

```bash
gh pr view <number> --repo <owner/repo> --json files --jq '.files[] | "\(.path) (\(.status)) +\(.additions) -\(.deletions)"'
```

### Step 4: Read existing review comments

Avoid duplicating feedback that's already been given:

```bash
gh api repos/<owner>/<repo>/pulls/<number>/reviews --jq '.[] | "\(.user.login) (\(.state)): \(.body)"'
gh api repos/<owner>/<repo>/pulls/<number>/comments --jq '.[] | "\(.user.login) on \(.path):\(.line): \(.body)"'
```

### Step 5: If the PR references an issue, read it

The linked issue contains the requirements — review against them:

```bash
gh issue view <issue-number> --repo <owner/repo> --comments
```

### Step 6: Clone the repo and read project docs

This is essential for understanding conventions and architecture:

```bash
gh repo clone <owner/repo>
cd <repo>
```

Read these files in order of priority:

1. `**README.md**` — project overview, tech stack, build/test commands
2. `**CLAUDE.md` / `AGENTS.md**` — AI agent conventions, golden rules, coding standards
3. `**docs/` directory** — architecture docs, design docs, golden rules
4. **Source files adjacent to the changed files** — understand the surrounding code

### Step 7: Read source files beyond the diff

The diff alone doesn't show the full picture. Read the complete files being modified to understand:

- How changed functions are called by other code
- Whether the change is consistent with surrounding patterns
- Whether imports/exports are properly updated

```bash
# Read complete file (if cloned)
cat <file-path>

# Or via API (without cloning)
gh api repos/<owner>/<repo>/contents/<file-path> --jq '.content' | base64 -d
```

## Steps

1. Gather context following all steps above
2. Fetch the full PR diff:
  ```bash
   gh pr diff <number> --repo <owner/repo>
  ```
3. Review the changes against these criteria:
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
4. Post your review:
  ```bash
   gh pr review <number> --repo <owner/repo> --comment --body "Your review here"
  ```

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

- **Reference specific file paths and line numbers** for every issue (e.g., `src/router.ts:42`)
- **Provide concrete fix suggestions** in code blocks, not just descriptions of problems
- **Link to relevant files** when helpful: `https://github.com/<owner>/<repo>/blob/<branch>/<path>#L<line>`
- **Categorize severity**: Critical (must fix), Major (should fix), Minor (consider fixing)

## Constraints

- Focus on substantive issues, not style nitpicks (formatting, whitespace)
- Be constructive — always suggest a fix when pointing out a problem
- If the code looks good, say so briefly — don't invent issues
- Do not modify any code — only review
- Never expose tokens, secrets, or credentials in your review
- Respect the project's conventions — don't push personal style preferences
- If a change is large, prioritize the most impactful feedback

