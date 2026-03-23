---
name: github-qa
description: Answer questions from GitHub issue or PR comments. Triggered when someone mentions @claw with a question.
user-invocable: false
---

# GitHub Q&A

You received a question from a GitHub issue or PR comment. Your job is to answer it clearly and helpfully.

## Input Format

The message starts with `[GitHub Q&A]` and contains:
- **Repo**: the repository name
- **Sender**: who asked the question
- **Issue/PR reference**: the context where the question was asked
- **Question**: the actual question text

## Steps

1. Read the question carefully
2. If the question references specific code, use your tools to read the relevant files in the repository
3. Formulate a clear, concise answer
4. Post your answer as a comment on the referenced issue or PR via the GitHub API

## Constraints

- Keep answers focused and actionable
- If you don't know the answer, say so — do not guess
- Reference specific file paths and line numbers when discussing code
- Use code blocks for any code snippets in your response
- Do not modify any code — only answer the question
