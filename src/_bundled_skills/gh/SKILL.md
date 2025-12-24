---
name: gh
description: Expert guidance for using the GitHub CLI (gh) to manage GitHub issues, pull requests, Actions workflows, repositories, and other GitHub operations from the command line. Use this skill when the user needs to interact with GitHub resources or perform GitHub workflows.
license: MIT
compatibility: Requires gh CLI to be installed. Works with github.com and GitHub Enterprise Server instances.
metadata:
  author: Agent Framework Team
  version: 1.0.0
  tags: github gh cli pr pull-request issue actions workflow cicd
allowed-tools: Bash Read Grep Glob
---

# GitHub CLI (gh) Skill

Provides guidance for using `gh`, the official GitHub CLI, to perform GitHub operations from the terminal.

## When to Use This Skill

Invoke when the user needs to:
- Create, review, or manage pull requests
- Work with GitHub issues
- Monitor or trigger GitHub Actions workflows
- Clone or manage repositories
- Perform any GitHub operation from the command line

## Prerequisites and Tool Selection

Before performing any GitHub operations, follow this workflow:

### 1. Check for GH_TOKEN

**CRITICAL**: Verify that authentication is available:

```bash
# Check if GH_TOKEN is set
echo $GH_TOKEN

# Or check gh auth status
gh auth status
```

**If not authenticated**, inform the user:
```
GitHub operations require authentication. Either:
1. Run: gh auth login
2. Or set: export GH_TOKEN="your_token_here"

Create a token at: https://github.com/settings/tokens
```

### 2. Check for gh CLI

```bash
which gh
gh --version
```

**If gh is not available**: Use direct API calls with curl. See **references/curl-api.md** for REST API commands.

## Authentication Quick Start

```bash
# Interactive authentication (opens browser)
gh auth login

# Check authentication status
gh auth status

# For GitHub Enterprise Server
gh auth login --hostname github.example.com

# Using environment variable (for CI/CD or scripting)
export GH_TOKEN=ghp_xxxxxxxxxxxx
```

## Core Workflows

### Creating a Pull Request

```bash
# 1. Ensure branch is pushed
git push -u origin feature-branch

# 2. Create PR interactively
gh pr create

# Create PR with title and body
gh pr create --title "Add feature" --body "Implements X"

# Create PR with reviewers and labels
gh pr create --title "Fix bug" --reviewer alice,bob --label "bug,urgent"

# Create draft PR
gh pr create --draft
```

### Reviewing Pull Requests

```bash
# 1. List PRs needing your review
gh pr list --search "review-requested:@me"

# 2. Checkout PR locally to test
gh pr checkout 123

# 3. View PR details and diff
gh pr view 123
gh pr diff 123

# 4. Approve PR
gh pr review 123 --approve

# 5. Request changes
gh pr review 123 --request-changes --body "Please fix X"

# 6. Add comment
gh pr comment 123 --body "Looks good!"
```

### Reading PR Comments

GitHub has several types of PR comments:
- **Regular comments**: General discussion on the PR
- **Review comments**: Inline code comments on specific lines
- **Review summaries**: Top-level review with approve/request changes

```bash
# Get all comments and reviews
gh pr view 123 --comments

# Get as structured JSON
gh pr view 123 --json comments,reviews
```

### Managing Issues

```bash
# Create issue with labels
gh issue create --title "Bug in login" --label bug

# Link PR to issue (closes on merge)
gh pr create --title "Fix login" --body "Closes #123"

# List your assigned issues
gh issue list --assignee @me

# View issue details
gh issue view 456
```

### Working with GitHub Actions

```bash
# List recent workflow runs
gh run list

# Watch a run in progress
gh run watch

# View run details
gh run view 123456

# Trigger a workflow
gh workflow run deploy.yml

# View workflow run logs
gh run view 123456 --log

# Rerun failed jobs
gh run rerun 123456 --failed
```

### Diagnosing CI/CD Failures

When a PR has failing checks, use this workflow:

```bash
# 1. Check PR status
gh pr checks 123

# 2. Get the most recent workflow run for the PR's branch
gh pr view 123 --json headRefName --jq '.headRefName' | \
  xargs -I {} gh run list --branch {} --limit 1

# 3. View failed job logs
gh run view RUN_ID --log-failed

# Or watch and wait for completion
gh run watch RUN_ID
```

## Common Patterns

### Working Outside Repository Context

When not in a Git repository, specify the repository:
```bash
gh pr list -R owner/repo
gh issue list -R owner/repo
```

### GitHub Enterprise Server

Set hostname via environment variable:
```bash
export GH_HOST=github.example.com
gh repo clone owner/repo
```

### Automation and Scripting

Use JSON output for parsing:
```bash
gh pr list --json number,title,author | jq '.[] | .title'
```

### Extracting Repository from URL

When given a GitHub URL, extract owner and repo:
```bash
URL="https://github.com/owner/repo/issues/123"
OWNER_REPO=$(echo "$URL" | sed -E 's|https://github.com/([^/]+/[^/]+)/.*|\1|')
# Result: owner/repo
```

### Using the API Command

The `gh api` command provides direct GitHub API access:

```bash
# GET request
gh api repos/owner/repo/pulls

# POST request with data
gh api repos/owner/repo/issues --method POST -f title="Bug" -f body="Details"

# GraphQL query
gh api graphql -f query='{ viewer { login } }'

# Paginated results
gh api repos/owner/repo/issues --paginate
```

## Best Practices

1. **Verify authentication** before executing commands: `gh auth status`
2. **Use `--help`** to explore command options: `gh <command> --help`
3. **Link PRs to issues** using "Closes #123" in PR body
4. **Check PR status** before merging: `gh pr checks 123`
5. **Use JSON output** for scripting: `gh pr list --json number,title`

## Common Commands Quick Reference

**Pull Requests:**
- `gh pr list` - List open PRs
- `gh pr create` - Create new PR
- `gh pr checkout <number>` - Checkout PR locally
- `gh pr view <number>` - View PR details
- `gh pr review <number> --approve` - Approve PR
- `gh pr merge <number>` - Merge PR

**Issues:**
- `gh issue list` - List all issues
- `gh issue create` - Create new issue
- `gh issue view <number>` - View issue
- `gh issue close <number>` - Close issue

**Actions:**
- `gh run list` - List workflow runs
- `gh run view <id>` - View run details
- `gh run watch` - Watch run in progress
- `gh workflow run <file>` - Trigger workflow

**Repository:**
- `gh repo clone owner/repo` - Clone repository
- `gh repo view` - View repo details
- `gh repo fork` - Fork repository

## Progressive Disclosure

For detailed command documentation, refer to:
- **references/commands-detailed.md** - Comprehensive gh CLI command reference
- **references/curl-api.md** - REST API with curl (when gh CLI unavailable)
- **references/quick-reference.md** - Condensed command cheat sheet
- **references/troubleshooting.md** - Detailed error scenarios and solutions

Load these references when:
- User needs specific flag or option details
- gh CLI is not available (use curl-api.md)
- Troubleshooting authentication or connection issues
- Working with advanced features (API, GraphQL, extensions, etc.)

## Common Issues Quick Fixes

**"command not found: gh"** - Install gh or verify PATH

**"authentication required"** - Run `gh auth login`

**"repository not found"** - Verify repository name and access permissions

**"not a git repository"** - Navigate to repo or use `-R owner/repo` flag

**"pull request already exists"** - Use `gh pr list` to find existing PR

For detailed troubleshooting, load **references/troubleshooting.md**.

## Notes

- gh auto-detects repository context from Git remote
- Most commands have `--web` flag to open in browser
- Use `--json` for structured output in scripts
- Multiple GitHub accounts can be authenticated simultaneously
- Commands respect Git configuration and current repository context
