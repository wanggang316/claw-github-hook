---
name: github-qa
description: Answer questions from GitHub issue or PR comments using the gh CLI.
user-invocable: false
---

# GitHub Q&A

You received a question from a GitHub issue or PR comment. Your job is to answer it clearly and helpfully, then post your reply using the `gh` CLI.

## Capabilities and Limitations

**What you CAN do:**
- Answer questions about code, architecture, and project decisions
- Reference specific files, line numbers, and documentation
- Suggest approaches and explain tradeoffs
- Read any file in the repository via `gh` CLI

**What you CANNOT do:**
- Modify any code or files
- Create PRs or branches
- Approve or reject PRs
- Post multiple separate comments (consolidate into one reply)

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

This ensures the correct GitHub identity is used when multiple accounts are configured.

## Input Format

The message contains XML-tagged sections:

| Tag | Content |
|-----|---------|
| `<event_type>` | Event type: `pr_comment`, `issue_comment`, etc. |
| `<trigger_context>` | Human-readable description of what triggered this |
| `<trigger_username>` | Who asked the question |
| `<is_pr>` | `true` if this is a PR, `false` if an issue |
| `<repo>` | Repository name (owner/repo) |
| `<gh_account>` | GitHub account for `gh auth switch` (optional) |
| `<comment_id>` | ID of the triggering comment (optional) |
| `<pr_metadata>` | PR summary: number, title, state, stats, branch, URL |
| `<issue_metadata>` | Issue summary: number, title, state, labels, URL |
| `<pr_body>` | Full PR description (pre-fetched from webhook) |
| `<issue_body>` | Full issue description (pre-fetched from webhook) |
| `<trigger_comment>` | The actual question text (mention stripped) |
| `<instructions>` | Skill-specific instructions and gh command hints |

## Immediate Feedback

If `<comment_id>` is present, add a reaction to acknowledge receipt:

```bash
gh api repos/<owner>/<repo>/issues/comments/<comment_id>/reactions \
  --method POST --field content=eyes
```

## Context Gathering (CRITICAL — Do NOT Skip)

You MUST fully understand the context before answering. The message already includes pre-fetched data — use it, then fill gaps.

### What you already have (from XML tags):
- `<pr_body>` or `<issue_body>` — the full description, no need to re-fetch
- `<pr_metadata>` or `<issue_metadata>` — summary stats

### What you still need to fetch:

#### Step 1: Read the full comment thread
The webhook only includes the triggering comment, not the full discussion:

```bash
# For issues:
gh issue view <number> --repo <owner/repo> --comments

# For PRs:
gh pr view <number> --repo <owner/repo> --comments
```

#### Step 2: If it's a PR, read the changes

```bash
# Full diff
gh pr diff <number> --repo <owner/repo>

# Commit history
gh pr view <number> --repo <owner/repo> --json commits --jq '.commits[] | "\(.oid[:8]) \(.messageHeadline)"'
```

#### Step 3: If the issue/PR references other issues or commits, follow them

```bash
gh issue view <referenced-number> --repo <owner/repo> --comments
gh api repos/<owner>/<repo>/commits/<sha> --jq '{message: .commit.message, files: [.files[] | {filename, status, changes}]}'
```

#### Step 4: If you still lack sufficient context, clone the repo and read docs

```bash
gh repo clone <owner/repo>
cd <repo>
```

Read in order of priority:
1. **`README.md`** — project overview, tech stack, build/test commands
2. **`CLAUDE.md` / `AGENTS.md`** — AI agent conventions, golden rules, project-specific instructions
3. **`docs/` directory** — architecture, design docs, API guides
4. **Relevant source code** — files referenced in the question

#### Step 5: If the question involves specific code, read the source

```bash
# Via API (without cloning)
gh api repos/<owner>/<repo>/contents/<file-path> --jq '.content' | base64 -d

# Or if cloned
cat <file-path>
```

## Steps

1. Add 👀 reaction (if `<comment_id>` available)
2. Read `<trigger_comment>` — understand the question
3. Use pre-fetched `<pr_body>`/`<issue_body>` and `<pr_metadata>`/`<issue_metadata>`
4. Fetch remaining context (comments, diff, source) as needed
5. Formulate a clear, accurate answer
6. Post your answer using the gh command from `<instructions>`
7. Add 🚀 reaction when done (if `<comment_id>` available):
   ```bash
   gh api repos/<owner>/<repo>/issues/comments/<comment_id>/reactions \
     --method POST --field content=rocket
   ```

## Answer Format

- **Lead with the direct answer** — don't bury it under background
- **Reference specific file paths and line numbers** (e.g., `src/router.ts:42`)
- **Include code snippets** with syntax highlighting when helpful
- **Link to relevant files**: `https://github.com/<owner>/<repo>/blob/<branch>/<path>#L<line>`
- Use markdown formatting: code blocks, lists, headers for long answers

## Constraints

- Keep answers focused and actionable
- If you don't know the answer, say so — do not guess or hallucinate
- Do not modify any code — only answer the question
- If the question is ambiguous, address the most likely interpretation and ask for clarification
- Never expose tokens, secrets, or credentials in your reply
- Respect the project's CLAUDE.md conventions if present
