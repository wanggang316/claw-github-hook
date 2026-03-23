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

## Steps

1. Read the question carefully
2. If the question references specific code, read the relevant files to formulate your answer
3. Post your answer using the `gh` command provided in the message, for example:
   ```bash
   gh issue comment 59 --repo owner/repo --body "Your answer here"
   ```

## Constraints

- Keep answers focused and actionable
- If you don't know the answer, say so — do not guess
- Reference specific file paths and line numbers when discussing code
- Use markdown formatting in your reply (code blocks, lists, etc.)
- Do not modify any code — only answer the question
