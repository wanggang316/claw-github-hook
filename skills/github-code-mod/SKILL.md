---
name: github-code-mod
description: Make code modifications in a GitHub repository using the gh CLI.
user-invocable: false
---

# GitHub Code Modification

You received a request to modify code in a GitHub repository. Your job is to understand the request fully, make the changes, and submit a PR.

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

## Input Format

The message starts with `[GitHub Code Modification]` and contains:
- **Repo**: the repository name (owner/repo)
- **Requested by**: who requested the change
- **Issue/PR reference**: context for the modification
- **Instruction**: what needs to be done
- **gh command hints**: commands for cloning and creating PRs

## Context Gathering (CRITICAL — Do NOT Skip)

You MUST fully understand the request and the codebase before writing any code. Coding based solely on the triggering comment leads to wrong solutions that miss constraints and conventions.

### Step 1: Read the full issue/PR thread

Understand the full discussion, prior decisions, and any rejected approaches:

```bash
# For issues:
gh issue view <number> --repo <owner/repo> --comments

# For PRs:
gh pr view <number> --repo <owner/repo> --comments
```

### Step 2: If the issue/PR references commits or other PRs, read them

Understand what has already been tried or changed:

```bash
# PR diff
gh pr diff <number> --repo <owner/repo>

# Specific commit
gh api repos/<owner>/<repo>/commits/<sha> --jq '{message: .commit.message, files: [.files[] | {filename, status, additions, deletions}]}'

# Referenced issue
gh issue view <referenced-number> --repo <owner/repo> --comments
```

### Step 3: Clone the repo

```bash
gh repo clone <owner/repo>
cd <repo>
```

### Step 4: Read project docs BEFORE writing any code

This is essential — the project may have specific conventions, golden rules, or architecture constraints:

1. **`README.md`** — project overview, tech stack, build/test commands, dependencies
2. **`CLAUDE.md` / `AGENTS.md`** — AI agent conventions, golden rules, coding standards. **You MUST follow these if present.**
3. **`docs/` directory** — architecture docs, design docs, guides
4. **`package.json` / `Makefile` / `Cargo.toml`** etc. — build commands, test commands, dependencies

### Step 5: Read source code in the area you'll modify

Understand the existing patterns before changing anything:

```bash
# Read the files you'll modify
cat <file-path>

# Read adjacent files to understand patterns and imports
cat <related-file-path>

# Search for usage of functions/types you'll change
grep -r "<function-name>" src/
```

Understand:
- How the code you'll change is called by other code
- Existing naming conventions and code style
- Import/export patterns
- Error handling patterns
- Test file locations and testing patterns

## Steps

1. **Gather context** following all steps above

2. **Identify the base branch**:
   ```bash
   git remote show origin | grep 'HEAD branch'
   ```

3. **Create a new branch** from the base branch:
   ```bash
   git checkout -b claw/<short-description>
   ```

4. **Plan your changes** — before editing, list the files you'll modify and why

5. **Make the changes** — keep them minimal and focused on the request

6. **Verify your changes**:
   ```bash
   # Review what you changed
   git diff

   # Run type checks if available
   npm run check 2>/dev/null || npx tsc --noEmit 2>/dev/null || true

   # Run tests if available (check README or package.json for the command)
   npm test 2>/dev/null || make test 2>/dev/null || cargo test 2>/dev/null || true

   # Run linting if available
   npm run lint 2>/dev/null || true
   ```

7. **Commit and push**:
   ```bash
   git add <changed-files>
   git commit -m "<type>: <description>"
   git push -u origin claw/<short-description>
   ```
   Use conventional commit types: `fix:`, `feat:`, `refactor:`, `docs:`, `test:`, `chore:`

8. **Create a PR**:
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
   🤖 Automated by [OpenClaw](https://openclaw.ai)
   EOF
   )"
   ```

9. **Post a comment** on the original issue/PR linking to the new PR:
   ```bash
   gh issue comment <number> --repo <owner/repo> --body "I've created PR #<pr-number> to address this: <pr-url>"
   ```

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
