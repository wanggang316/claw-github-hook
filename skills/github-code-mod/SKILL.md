---
name: github-code-mod
description: Make code modifications in a GitHub repository using the gh CLI.
user-invocable: false
---

# GitHub Code Modification

You received a request to modify code in a GitHub repository. Your job is to understand the request fully, make the changes, and submit a PR.

## Capabilities and Limitations

**What you CAN do:**
- Clone the repo, create a branch, make changes, push, and create a PR
- Run tests, type checks, and linting
- Post comments linking to the PR

**What you CANNOT do:**
- Push directly to main or master
- Merge or close PRs
- Delete branches
- Modify files outside the scope of the request

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
| `<event_type>` | Event type: `pr_comment`, `issue_comment`, etc. |
| `<trigger_context>` | Human-readable description of what triggered this |
| `<trigger_username>` | Who requested the change |
| `<is_pr>` | `true` if triggered from a PR, `false` if from an issue |
| `<repo>` | Repository name (owner/repo) |
| `<gh_account>` | GitHub account for `gh auth switch` (optional) |
| `<comment_id>` | ID of the triggering comment (optional) |
| `<pr_metadata>` | PR summary: number, title, state, stats, branch, URL (if PR) |
| `<issue_metadata>` | Issue summary: number, title, state, labels, URL (if issue) |
| `<pr_body>` | Full PR description (pre-fetched, if PR) |
| `<issue_body>` | Full issue description (pre-fetched, if issue) |
| `<trigger_comment>` | The modification instruction (mention and command stripped) |
| `<instructions>` | Step-by-step instructions and gh command hints |

## Immediate Feedback

If `<comment_id>` is present, add a reaction to acknowledge receipt:

```bash
gh api repos/<owner>/<repo>/issues/comments/<comment_id>/reactions \
  --method POST --field content=eyes
```

## Context Gathering (CRITICAL — Do NOT Skip)

You MUST fully understand the request and the codebase before writing any code.

### What you already have (from XML tags):
- `<pr_body>` or `<issue_body>` — the full description, no need to re-fetch
- `<pr_metadata>` or `<issue_metadata>` — summary stats
- `<trigger_comment>` — the specific instruction

### What you still need to fetch:

#### Step 1: Read the full comment thread

```bash
# For issues:
gh issue view <number> --repo <owner/repo> --comments

# For PRs:
gh pr view <number> --repo <owner/repo> --comments
```

#### Step 2: If the issue/PR references commits or other PRs, read them

```bash
gh pr diff <number> --repo <owner/repo>
gh api repos/<owner>/<repo>/commits/<sha> --jq '{message: .commit.message, files: [.files[] | {filename, status, additions, deletions}]}'
gh issue view <referenced-number> --repo <owner/repo> --comments
```

#### Step 3: Clone the repo

```bash
gh repo clone <owner/repo>
cd <repo>
```

#### Step 4: Read project docs BEFORE writing any code

1. **`README.md`** — project overview, tech stack, build/test commands, dependencies
2. **`CLAUDE.md` / `AGENTS.md`** — AI agent conventions, golden rules, coding standards. **You MUST follow these if present.**
3. **`docs/` directory** — architecture docs, design docs, guides
4. **`package.json` / `Makefile` / `Cargo.toml`** etc. — build commands, test commands

#### Step 5: Read source code in the area you'll modify

```bash
cat <file-path>
cat <related-file-path>
grep -r "<function-name>" src/
```

Understand: how the code is called, naming conventions, import/export patterns, error handling, test patterns.

## Steps

1. **Add 👀 reaction** (if `<comment_id>` available)

2. **Gather context** following all steps above

3. **Set up your branch** — check the `<branch_strategy>` tag:
   - If `checkout_pr`: check out the existing PR branch:
     ```bash
     gh pr checkout <number> --repo <owner/repo>
     ```
   - If `new_branch`: identify the base branch and create a new one:
     ```bash
     git remote show origin | grep 'HEAD branch'
     git checkout -b claw/<short-description>
     ```

5. **Plan your changes** — list the files you'll modify and why

6. **Make the changes** — keep them minimal and focused on the request

7. **Verify your changes**:
   ```bash
   git diff
   npm run check 2>/dev/null || npx tsc --noEmit 2>/dev/null || true
   npm test 2>/dev/null || make test 2>/dev/null || cargo test 2>/dev/null || true
   npm run lint 2>/dev/null || true
   ```

8. **Commit and push**:
   ```bash
   git add <changed-files>
   git commit -m "<type>: <description>"
   git push -u origin claw/<short-description>
   ```
   Use conventional commit types: `fix:`, `feat:`, `refactor:`, `docs:`, `test:`, `chore:`

9. **Create a PR**:
   ```bash
   gh pr create --repo <owner/repo> \
     --title "<concise title>" \
     --body "$(cat <<'EOF'
   ## Summary
   <What this PR does and why>

   ## Changes
   - <list of changes>

   ## Related
   Closes #<issue-number>

   ---
   Automated by [OpenClaw](https://openclaw.ai)
   EOF
   )"
   ```

10. **Post a comment** on the original issue/PR linking to the new PR:
    ```bash
    gh issue comment <number> --repo <owner/repo> --body "I've created PR #<pr-number> to address this: <pr-url>"
    ```

11. **Add 🚀 reaction** when done (if `<comment_id>` available)

## Constraints

- **Never push directly to main or master** — always use a feature branch
- **Keep changes minimal** — only modify what the instruction asks for
- **Do not refactor surrounding code** unless explicitly requested
- **Follow project conventions** — match existing code style, patterns, and CLAUDE.md rules
- **If the instruction is ambiguous**, post a clarifying comment instead of guessing
- **If tests fail**, report the failure in the PR description rather than skipping tests
- **Never commit secrets, tokens, or credentials**
- **Never commit `.env` files** or other sensitive configuration
- **If the change is complex**, break it into logical commits with clear messages
