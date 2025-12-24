# gh Commands - Detailed Reference

This is a comprehensive reference for all gh commands. This file is loaded when detailed command information is needed.

## Pull Requests (PR)

### Listing Pull Requests
```bash
# List open PRs
gh pr list

# List PRs with specific state
gh pr list --state open
gh pr list --state closed
gh pr list --state merged
gh pr list --state all

# List PRs assigned to you
gh pr list --assignee @me

# List PRs you need to review
gh pr list --search "review-requested:@me"

# List PRs by author
gh pr list --author username

# List PRs with specific label
gh pr list --label bug

# List PRs with JSON output
gh pr list --json number,title,author,labels

# Limit results
gh pr list --limit 10
```

### Creating Pull Requests
```bash
# Create PR interactively
gh pr create

# Create PR with title and body
gh pr create --title "Add feature" --body "Description here"

# Create PR filling from commit messages
gh pr create --fill

# Create draft PR
gh pr create --draft

# Create PR with reviewers
gh pr create --reviewer username1,username2

# Create PR with labels
gh pr create --label "bug,priority:high"

# Create PR with assignees
gh pr create --assignee username

# Create PR to specific base branch
gh pr create --base develop

# Create PR with milestone
gh pr create --milestone "v1.0"

# Create PR linking to issue
gh pr create --title "Fix bug" --body "Closes #123"

# Create PR and open in browser
gh pr create --web
```

### Viewing and Interacting with PRs
```bash
# View PR details
gh pr view 123

# View PR in terminal (no browser)
gh pr view 123 --web=false

# View PR with comments
gh pr view 123 --comments

# View PR diff
gh pr diff 123

# Checkout PR branch locally
gh pr checkout 123

# Check PR CI status
gh pr checks 123

# Watch PR checks in progress
gh pr checks 123 --watch

# Merge PR
gh pr merge 123

# Merge with squash
gh pr merge 123 --squash

# Merge with rebase
gh pr merge 123 --rebase

# Merge and delete branch
gh pr merge 123 --delete-branch

# Auto-merge when checks pass
gh pr merge 123 --auto

# Close PR without merging
gh pr close 123

# Reopen closed PR
gh pr reopen 123

# Mark PR as ready for review
gh pr ready 123

# Convert to draft
gh pr ready 123 --undo

# Edit PR title/body
gh pr edit 123 --title "New title"
gh pr edit 123 --body "New body"
gh pr edit 123 --add-label bug
gh pr edit 123 --add-reviewer username
```

### PR Reviews
```bash
# Approve PR
gh pr review 123 --approve

# Request changes
gh pr review 123 --request-changes --body "Please fix X"

# Add comment review
gh pr review 123 --comment --body "Consider this approach"

# Add comment to PR
gh pr comment 123 --body "Great work!"

# Add comment to specific line (via web)
gh pr comment 123 --web
```

## Issues

### Listing Issues
```bash
# List all open issues
gh issue list

# List issues with specific state
gh issue list --state open
gh issue list --state closed
gh issue list --state all

# List issues assigned to you
gh issue list --assignee @me

# List issues with specific label
gh issue list --label bug

# List issues with multiple labels
gh issue list --label "bug,priority:high"

# Search issues
gh issue list --search "login error"

# List issues by author
gh issue list --author username

# List issues with JSON output
gh issue list --json number,title,labels,assignees

# Limit results
gh issue list --limit 20
```

### Creating and Managing Issues
```bash
# Create issue interactively
gh issue create

# Create issue with title and body
gh issue create --title "Bug in login" --body "Description"

# Create issue with labels
gh issue create --title "Feature request" --label "enhancement"

# Create issue with assignee
gh issue create --assignee username

# Create issue with milestone
gh issue create --milestone "v1.0"

# Create issue from template
gh issue create --template bug_report.md

# View issue details
gh issue view 456

# View issue in browser
gh issue view 456 --web

# Close issue
gh issue close 456

# Close with comment
gh issue close 456 --comment "Fixed in PR #123"

# Reopen issue
gh issue reopen 456

# Edit issue
gh issue edit 456 --title "New title"
gh issue edit 456 --body "New body"
gh issue edit 456 --add-label "confirmed"
gh issue edit 456 --add-assignee username

# Delete issue
gh issue delete 456

# Pin issue
gh issue pin 456

# Unpin issue
gh issue unpin 456

# Transfer issue to another repo
gh issue transfer 456 owner/other-repo

# Create branch for issue
gh issue develop 456 --checkout
```

### Issue Comments
```bash
# Add comment to issue
gh issue comment 456 --body "Comment text"

# Add comment and open editor
gh issue comment 456 --editor

# View comments
gh issue view 456 --comments
```

## GitHub Actions

### Workflow Runs
```bash
# List recent workflow runs
gh run list

# List runs for specific workflow
gh run list --workflow deploy.yml

# List runs with specific status
gh run list --status failure
gh run list --status success
gh run list --status in_progress

# List runs for specific branch
gh run list --branch main

# List runs with JSON output
gh run list --json databaseId,status,conclusion,name

# View specific run
gh run view 123456

# View run with logs
gh run view 123456 --log

# View failed logs only
gh run view 123456 --log-failed

# Watch run in progress
gh run watch 123456

# Watch most recent run
gh run watch

# Download run artifacts
gh run download 123456

# Download specific artifact
gh run download 123456 --name artifact-name

# Rerun failed jobs
gh run rerun 123456 --failed

# Rerun all jobs
gh run rerun 123456

# Cancel running workflow
gh run cancel 123456

# Delete run
gh run delete 123456
```

### Workflows
```bash
# List all workflows
gh workflow list

# List workflows with JSON output
gh workflow list --json id,name,state

# View workflow details
gh workflow view deploy.yml

# Run/trigger workflow
gh workflow run deploy.yml

# Run workflow with inputs
gh workflow run deploy.yml -f environment=production

# Run workflow on specific branch
gh workflow run deploy.yml --ref feature-branch

# Enable disabled workflow
gh workflow enable deploy.yml

# Disable workflow
gh workflow disable deploy.yml
```

## Repository Operations

### Cloning Repositories
```bash
# Clone repository
gh repo clone owner/repo

# Clone to specific directory
gh repo clone owner/repo target-dir

# Clone your own repo
gh repo clone my-repo

# Clone from GitHub Enterprise
GH_HOST=github.example.com gh repo clone owner/repo
```

### Repository Information and Management
```bash
# View repository details
gh repo view

# View specific repository
gh repo view owner/repo

# View in browser
gh repo view --web

# View README
gh repo view --branch main

# Create repository
gh repo create my-repo

# Create private repository
gh repo create my-repo --private

# Create from template
gh repo create my-repo --template owner/template-repo

# Create and clone
gh repo create my-repo --clone

# Fork repository
gh repo fork owner/repo

# Fork and clone
gh repo fork owner/repo --clone

# Sync fork with upstream
gh repo sync

# Archive repository
gh repo archive owner/repo

# Unarchive repository
gh repo unarchive owner/repo

# Delete repository
gh repo delete owner/repo --yes

# Rename repository
gh repo rename new-name

# Edit repository settings
gh repo edit --default-branch main
gh repo edit --visibility private
gh repo edit --enable-issues
gh repo edit --enable-wiki=false

# Set default repository
gh repo set-default owner/repo

# List your repositories
gh repo list

# List organization repositories
gh repo list org-name

# List with JSON output
gh repo list --json name,isPrivate,pushedAt
```

## API Access

### REST API
```bash
# GET request
gh api repos/owner/repo

# GET with specific endpoint
gh api repos/owner/repo/pulls

# POST request
gh api repos/owner/repo/issues --method POST \
  -f title="Bug report" \
  -f body="Description"

# PUT request
gh api repos/owner/repo/issues/123 --method PATCH \
  -f state="closed"

# DELETE request
gh api repos/owner/repo/issues/123 --method DELETE

# Paginated results
gh api repos/owner/repo/issues --paginate

# With query parameters
gh api repos/owner/repo/issues -f state=closed -f per_page=100

# Include response headers
gh api repos/owner/repo --include

# Silent mode
gh api repos/owner/repo --silent

# JQ filtering
gh api repos/owner/repo/pulls --jq '.[].title'
```

### GraphQL API
```bash
# Simple query
gh api graphql -f query='{ viewer { login } }'

# Query with variables
gh api graphql -f query='
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      issues(first: 10) {
        nodes { title }
      }
    }
  }
' -f owner='owner' -f repo='repo'

# Mutation
gh api graphql -f query='
  mutation($id: ID!) {
    closeIssue(input: {issueId: $id}) {
      issue { title }
    }
  }
' -f id='ISSUE_NODE_ID'
```

## Secrets and Variables

### Repository Secrets
```bash
# List secrets
gh secret list

# Set secret
gh secret set SECRET_NAME

# Set secret from file
gh secret set SECRET_NAME < secret.txt

# Set secret with value
echo "value" | gh secret set SECRET_NAME

# Set secret for specific environment
gh secret set SECRET_NAME --env production

# Delete secret
gh secret delete SECRET_NAME
```

### Repository Variables
```bash
# List variables
gh variable list

# Set variable
gh variable set VAR_NAME --body "value"

# Set variable for environment
gh variable set VAR_NAME --body "value" --env production

# Delete variable
gh variable delete VAR_NAME
```

## Releases

```bash
# List releases
gh release list

# View specific release
gh release view v1.0.0

# Create release
gh release create v1.0.0

# Create release with title
gh release create v1.0.0 --title "Version 1.0.0"

# Create release with notes
gh release create v1.0.0 --notes "Release notes here"

# Create release from file
gh release create v1.0.0 --notes-file CHANGELOG.md

# Create draft release
gh release create v1.0.0 --draft

# Create prerelease
gh release create v1.0.0-beta --prerelease

# Upload assets
gh release create v1.0.0 ./dist/*.zip

# Upload asset to existing release
gh release upload v1.0.0 ./new-asset.zip

# Download release assets
gh release download v1.0.0

# Download specific asset
gh release download v1.0.0 --pattern "*.zip"

# Delete release
gh release delete v1.0.0

# Edit release
gh release edit v1.0.0 --title "New title"
```

## Gists

```bash
# List your gists
gh gist list

# View gist
gh gist view GIST_ID

# Create gist from file
gh gist create file.txt

# Create public gist
gh gist create file.txt --public

# Create gist with description
gh gist create file.txt --desc "My gist"

# Create gist from multiple files
gh gist create file1.txt file2.txt

# Edit gist
gh gist edit GIST_ID

# Delete gist
gh gist delete GIST_ID

# Clone gist
gh gist clone GIST_ID
```

## Search

```bash
# Search repositories
gh search repos "language:typescript stars:>1000"

# Search issues
gh search issues "label:bug is:open"

# Search PRs
gh search prs "author:username is:merged"

# Search code
gh search code "function login"

# Search with JSON output
gh search repos "cli" --json name,description,stars

# Limit results
gh search repos "cli" --limit 20
```

## Labels

```bash
# List labels
gh label list

# Create label
gh label create "bug" --color "FF0000"

# Create label with description
gh label create "feature" --color "00FF00" --description "New features"

# Edit label
gh label edit "bug" --name "bug-confirmed" --color "FF0000"

# Delete label
gh label delete "old-label"

# Clone labels from another repo
gh label clone owner/source-repo
```

## SSH Keys

```bash
# List SSH keys
gh ssh-key list

# Add SSH key
gh ssh-key add ~/.ssh/id_ed25519.pub

# Add SSH key with title
gh ssh-key add ~/.ssh/id_ed25519.pub --title "Work laptop"

# Delete SSH key
gh ssh-key delete KEY_ID
```

## Configuration

```bash
# View all configuration
gh config list

# Get specific config value
gh config get editor

# Set configuration value
gh config set editor vim

# Set git protocol
gh config set git_protocol ssh

# Common config keys:
# - editor: preferred text editor
# - browser: web browser to use
# - git_protocol: https or ssh
# - prompt: enable/disable prompts
```

## Extensions

```bash
# List installed extensions
gh extension list

# Install extension
gh extension install owner/gh-extension

# Upgrade extension
gh extension upgrade owner/gh-extension

# Upgrade all extensions
gh extension upgrade --all

# Remove extension
gh extension remove owner/gh-extension

# Browse extensions
gh extension browse

# Create new extension
gh extension create my-extension
```

## Common Flags Across Commands

Most gh commands support these common flags:

- `--help`, `-h` - Show help for command
- `--repo`, `-R` - Specify repository (format: [HOST/]OWNER/REPO)
- `--web`, `-w` - Open in web browser
- `--json` - Output as JSON with specified fields
- `--jq` - Filter JSON output with jq expression
- `--template`, `-t` - Format output using Go template

## Completion

```bash
# Generate completion script for bash
gh completion --shell bash

# For zsh
gh completion --shell zsh

# For fish
gh completion --shell fish

# For PowerShell
gh completion --shell powershell

# Install completion (bash example)
gh completion --shell bash > /etc/bash_completion.d/gh
```

## Version and Updates

```bash
# Show gh version
gh --version

# Check for updates
gh extension upgrade gh
```
