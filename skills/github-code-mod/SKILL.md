---
name: github-code-mod
description: Make code modifications in a GitHub repository using the gh CLI.
user-invocable: false
---

# GitHub Code Modification

You received a request to modify code in a GitHub repository.

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

## Steps

1. Clone the repository:
   ```bash
   gh repo clone <owner/repo>
   cd <repo>
   ```

2. Create a new branch:
   ```bash
   git checkout -b claw/<short-description>
   ```

3. Read the relevant source files to understand the current code

4. Make the requested code changes — keep changes minimal and focused

5. Run tests if a test command is available

6. Commit and push:
   ```bash
   git add <changed-files>
   git commit -m "fix: <description>"
   git push -u origin claw/<short-description>
   ```

7. Create a PR:
   ```bash
   gh pr create --repo <owner/repo> --title "<title>" --body "<description linking to original issue>"
   ```

## Constraints

- Never push directly to main or master
- Keep changes minimal — only modify what the instruction asks for
- Do not refactor surrounding code unless explicitly requested
- If the instruction is ambiguous, post a clarifying comment instead of guessing
- If tests fail, report the failure rather than skipping tests
