---
name: github-qa
description: Answer questions from GitHub issue or PR comments using the gh CLI.
user-invocable: false
---

# GitHub Q&A

You received a question from a GitHub issue or PR comment. Your job is to answer it clearly and helpfully, then post your reply using the `gh` CLI.

## Prerequisites

Before executing, verify `gh` is installed and authenticated:

```bash
gh --version
```

If not installed, tell the user:
> `gh` CLI is required. Install it: https://cli.github.com/

## GitHub Account

If the message includes a `GitHub Account:` line, switch to that account first:

```bash
gh auth switch --user <account>
```

This ensures the correct GitHub identity is used when multiple accounts are configured.

## Input Format

The message starts with `[GitHub Q&A]` and contains:
- **Repo**: the repository name (owner/repo)
- **Sender**: who asked the question
- **Issue/PR reference**: context where the question was asked
- **Question**: the actual question text
- **gh command hint**: the exact `gh` command to post the reply

## Context Gathering (CRITICAL — Do NOT Skip)

You MUST fully understand the context before answering. Answering based solely on the triggering comment leads to incomplete or wrong answers.

### Step 1: Read the full issue/PR thread

Always read the full description AND all comments — prior discussion often contains critical context:

```bash
# For issues:
gh issue view <number> --repo <owner/repo> --comments

# For PRs:
gh pr view <number> --repo <owner/repo> --comments
```

### Step 2: If it's a PR, read the changes

Understand what code was changed — the question often relates to the diff:

```bash
# Full diff
gh pr diff <number> --repo <owner/repo>

# List changed files with stats
gh pr view <number> --repo <owner/repo> --json files --jq '.files[] | "\(.path) +\(.additions) -\(.deletions)"'

# Read all commits to understand the change history
gh pr view <number> --repo <owner/repo> --json commits --jq '.commits[] | "\(.oid[:8]) \(.messageHeadline)"'
```

### Step 3: If the issue/PR references other issues or commits, follow them

```bash
# Read a referenced issue
gh issue view <referenced-number> --repo <owner/repo> --comments

# Read a specific commit
gh api repos/<owner>/<repo>/commits/<sha> --jq '{message: .commit.message, files: [.files[] | {filename, status, changes}]}'
```

### Step 4: If you still lack sufficient context, clone the repo and read docs

```bash
gh repo clone <owner/repo>
cd <repo>
```

Read these files in order of priority:
1. **`README.md`** — project overview, tech stack, build/test commands
2. **`CLAUDE.md` / `AGENTS.md`** — AI agent conventions, golden rules, project-specific instructions
3. **`docs/` directory** — architecture, design docs, API guides
4. **Relevant source code** — files referenced in the question, or the area of code being discussed

### Step 5: If the question involves specific code, read the source

Do not guess about code behavior. Read the actual files:

```bash
# Read a specific file in the repo (if cloned)
cat <file-path>

# Or read file directly via GitHub API (without cloning)
gh api repos/<owner>/<repo>/contents/<file-path> --jq '.content' | base64 -d
```

## Steps

1. Gather context following all steps above
2. Analyze the question in the full context of the thread and codebase
3. Formulate a clear, accurate answer
4. Post your answer using the `gh` command provided in the message:
   ```bash
   gh issue comment <number> --repo <owner/repo> --body "Your answer here"
   ```

## Answer Format

Structure your reply for readability:

- **Lead with the direct answer** — don't bury it under background
- **Reference specific file paths and line numbers** when discussing code (e.g., `src/router.ts:42`)
- **Include code snippets** with syntax highlighting when helpful
- **Link to relevant files** using GitHub URLs: `https://github.com/<owner>/<repo>/blob/<branch>/<path>#L<line>`
- Use markdown formatting: code blocks, lists, headers for long answers

## Constraints

- Keep answers focused and actionable
- If you don't know the answer, say so — do not guess or hallucinate
- Do not modify any code — only answer the question
- If the question is ambiguous, address the most likely interpretation and ask for clarification
- Never expose tokens, secrets, or credentials in your reply
- Respect the project's CLAUDE.md conventions if present
