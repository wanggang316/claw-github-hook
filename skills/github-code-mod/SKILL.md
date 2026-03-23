---
name: github-code-mod
description: Make code modifications in a GitHub repository. Triggered by @claw /fix or @claw /implement commands.
user-invocable: false
---

# GitHub Code Modification

You received a request to modify code in a GitHub repository.

## Input Format

The message starts with `[GitHub Code Modification]` and contains:
- **Repo**: the repository name
- **Requested by**: who requested the change
- **Issue/PR reference**: context for the modification
- **Instruction**: what needs to be done

## Steps

1. Read the instruction carefully to understand the scope
2. Clone the repository if you haven't already
3. Read the relevant source files to understand the current code
4. Create a new branch named `claw/<short-description>`
5. Make the requested code changes — keep changes minimal and focused
6. Run tests if a test command is available
7. Commit with a clear message describing what was changed and why
8. Push the branch and open a PR that:
   - Has a descriptive title
   - Links back to the original issue/PR in the body
   - Explains the changes made

## Constraints

- Never push directly to main or master
- Keep changes minimal — only modify what the instruction asks for
- Do not refactor surrounding code unless explicitly requested
- If the instruction is ambiguous, post a clarifying comment instead of guessing
- If tests fail, report the failure rather than skipping tests
