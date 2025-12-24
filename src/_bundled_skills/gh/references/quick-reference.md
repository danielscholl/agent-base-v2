# gh Quick Reference Guide

A condensed reference for the most commonly used GitHub CLI commands.

## Authentication

```bash
gh auth login                      # Interactive login
gh auth status                     # Check auth status
gh auth logout                     # Log out
gh auth token                      # Print auth token
```

## Pull Requests

```bash
# Listing
gh pr list                         # All open PRs
gh pr list --assignee @me          # PRs assigned to me
gh pr list --search "review-requested:@me"  # PRs needing my review

# Creating
gh pr create                       # Interactive creation
gh pr create --fill                # Fill from commits
gh pr create --title "Fix" --body "Desc"
gh pr create --draft               # Create draft PR
gh pr create --reviewer alice,bob

# Viewing & Managing
gh pr view 123                     # View PR details
gh pr diff 123                     # View PR diff
gh pr checkout 123                 # Checkout PR branch
gh pr checks 123                   # View CI status
gh pr review 123 --approve         # Approve PR
gh pr merge 123                    # Merge PR
gh pr comment 123 --body "Comment" # Add comment
```

## Issues

```bash
# Listing
gh issue list                      # All issues
gh issue list --assignee @me       # Assigned to me
gh issue list --label bug          # With label

# Creating & Managing
gh issue create                    # Interactive
gh issue create --title "Bug" --label bug
gh issue view 456                  # View issue
gh issue close 456                 # Close issue
gh issue comment 456 --body "Text" # Add comment
```

## GitHub Actions

```bash
# Workflow Runs
gh run list                        # List runs
gh run view 123456                 # View run
gh run watch                       # Watch in progress
gh run view 123456 --log           # View logs
gh run rerun 123456 --failed       # Rerun failed

# Workflows
gh workflow list                   # List workflows
gh workflow run deploy.yml         # Trigger workflow
gh workflow run deploy.yml -f env=prod  # With input
```

## Repository

```bash
gh repo clone owner/repo           # Clone repository
gh repo view                       # View repo details
gh repo view --web                 # Open in browser
gh repo fork                       # Fork repository
gh repo create my-repo             # Create repository
```

## API

```bash
gh api repos/owner/repo/pulls      # GET request
gh api repos/owner/repo/issues \
  --method POST -f title="Bug"     # POST with data
gh api graphql -f query='{ viewer { login } }'  # GraphQL
```

## Releases

```bash
gh release list                    # List releases
gh release create v1.0.0           # Create release
gh release download v1.0.0         # Download assets
```

## Search

```bash
gh search repos "language:go"      # Search repos
gh search issues "label:bug"       # Search issues
gh search prs "author:username"    # Search PRs
```

## Common Flags

```bash
--help, -h                         # Show help
--repo, -R owner/repo              # Specify repository
--web, -w                          # Open in browser
--json field1,field2               # JSON output
--jq '.[] | .title'                # JQ filter
```

## Environment Variables

```bash
GH_TOKEN=xxx                       # Authentication token
GH_HOST=github.example.com         # GitHub Enterprise host
GH_REPO=owner/repo                 # Default repository
GH_EDITOR=vim                      # Editor preference
GITHUB_TOKEN=xxx                   # Alternative token var
```

## Configuration

```bash
gh config list                     # View configuration
gh config get editor               # Get config value
gh config set editor vim           # Set config value
gh config set git_protocol ssh     # Use SSH for git
```

## Complete Command List

- `gh auth` - Authentication management
- `gh browse` - Open in browser
- `gh codespace` - Manage codespaces
- `gh gist` - Manage gists
- `gh issue` - Issue tracking
- `gh pr` - Pull request operations
- `gh project` - GitHub Projects
- `gh release` - Release management
- `gh repo` - Repository operations
- `gh run` - View workflow runs
- `gh workflow` - Workflow operations
- `gh cache` - Manage Actions caches
- `gh alias` - Create shortcuts
- `gh api` - Make API requests
- `gh completion` - Shell completion
- `gh config` - Configuration
- `gh extension` - Manage extensions
- `gh gpg-key` - Manage GPG keys
- `gh label` - Manage labels
- `gh search` - Search GitHub
- `gh secret` - Manage secrets
- `gh ssh-key` - Manage SSH keys
- `gh status` - Show notifications
- `gh variable` - Manage variables

## Tips

1. Use `gh <command> --help` for detailed help
2. Commands auto-detect repository from git remote
3. Use `-R owner/repo` when outside a repository
4. Most commands have `--web` flag to open in browser
5. Use `--json` for scripting with structured output
6. Enable completion: `gh completion --shell bash`
7. Use `gh alias set` for frequently used commands
