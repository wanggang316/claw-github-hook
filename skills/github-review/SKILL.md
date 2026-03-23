---
name: github-review
description: Perform code review on a GitHub pull request using the gh CLI.
user-invocable: false
---

# GitHub Code Review

You received a request to review a GitHub pull request.

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

The message starts with `[GitHub Code Review]` and contains:
- **Repo**: the repository name (owner/repo)
- **Author**: who opened the PR
- **PR number, title, URL**: the pull request to review
- **Branch info**: source and target branches
- **gh command hints**: commands to fetch diff and post review

## Steps

1. Fetch the PR diff:
   ```bash
   gh pr diff <number> --repo <owner/repo>
   ```

2. Read relevant source files for full context if needed

3. Review the changes for:
   - **Correctness**: logic errors, off-by-one, null handling
   - **Security**: injection, auth bypass, secrets exposure
   - **Code quality**: naming, structure, duplication
   - **Tests**: missing test coverage for new behavior

4. Post your review:
   ```bash
   gh pr review <number> --repo <owner/repo> --comment --body "Your review here"
   ```

## Constraints

- Focus on substantive issues, not style nitpicks
- Be constructive — suggest fixes, not just problems
- If the code looks good, say so briefly
- Do not modify any code — only review
