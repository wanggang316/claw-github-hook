---
name: github-review
description: Perform code review on a GitHub pull request. Triggered by @claw /review or auto-review on PR open.
user-invocable: false
---

# GitHub Code Review

You received a request to review a GitHub pull request.

## Input Format

The message starts with `[GitHub Code Review]` and contains:
- **Repo**: the repository name
- **Author**: who opened the PR
- **PR number, title, URL**: the pull request to review
- **Branch info**: source and target branches

## Steps

1. Fetch the PR diff using the GitHub API
2. Read relevant source files for full context where needed
3. Review the changes for:
   - **Correctness**: logic errors, off-by-one, null handling
   - **Security**: injection, auth bypass, secrets exposure
   - **Code quality**: naming, structure, duplication
   - **Tests**: missing test coverage for new behavior
4. Post a PR review via GitHub API with:
   - Line-level comments on specific issues
   - A summary comment with overall assessment
   - Use COMMENT (not APPROVE or REQUEST_CHANGES) as the review event

## Constraints

- Focus on substantive issues, not style nitpicks
- Be constructive — suggest fixes, not just problems
- If the code looks good, say so briefly
- Do not modify any code — only review
