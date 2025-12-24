# gh Troubleshooting Guide

Comprehensive troubleshooting guide for common gh CLI issues and errors.

## Installation Issues

### Command Not Found

**Error:**
```
command not found: gh
```
or
```
gh: command not found
```

**Causes:**
- gh is not installed
- gh is not in PATH

**Solutions:**
1. Verify installation:
   ```bash
   which gh
   ```

2. Install gh if missing:
   ```bash
   # macOS
   brew install gh

   # Windows
   winget install GitHub.cli

   # Linux (Debian/Ubuntu)
   sudo apt install gh

   # Linux (Fedora)
   sudo dnf install gh
   ```

3. If installed but not in PATH, add to PATH:
   ```bash
   # Find where gh is installed
   find / -name gh 2>/dev/null

   # Add to PATH in ~/.bashrc or ~/.zshrc
   export PATH="$PATH:/path/to/gh"
   ```

### Version Conflicts

**Error:**
```
gh: this command requires a newer version
```

**Solution:**
Update to the latest version:
```bash
# macOS
brew upgrade gh

# Windows
winget upgrade GitHub.cli

# Linux
sudo apt update && sudo apt upgrade gh
```

## Authentication Issues

### Not Authenticated

**Error:**
```
To get started with GitHub CLI, please run: gh auth login
```
or
```
error: authentication required
```

**Causes:**
- Not authenticated
- Token expired
- Wrong GitHub host

**Solutions:**
1. Authenticate:
   ```bash
   gh auth login
   ```

2. Check authentication status:
   ```bash
   gh auth status
   ```

3. Re-authenticate:
   ```bash
   gh auth logout
   gh auth login
   ```

4. For GitHub Enterprise:
   ```bash
   gh auth login --hostname github.example.com
   ```

### Token Permissions

**Error:**
```
HTTP 403: Must have admin rights to Repository
```
or
```
Resource not accessible by integration
```

**Causes:**
- Token lacks required scopes
- User doesn't have repository permissions

**Solutions:**
1. Refresh token with additional scopes:
   ```bash
   gh auth refresh --scopes repo,read:org
   ```

2. Check current scopes:
   ```bash
   gh auth status
   ```

3. Common required scopes:
   - `repo` - Full repository access
   - `read:org` - Read organization data
   - `workflow` - Update GitHub Actions workflows
   - `admin:org` - Manage organization settings

### Multiple Accounts

**Issue:** Working with multiple GitHub accounts or Enterprise

**Solution:**
gh supports multiple authenticated hosts:

```bash
# Authenticate with github.com
gh auth login

# Authenticate with GitHub Enterprise
gh auth login --hostname github.example.com

# Check all authenticated accounts
gh auth status

# Switch between accounts
gh auth switch

# Use specific host for command
gh repo list -R github.example.com/owner/repo
```

### Token via Environment Variable

**Issue:** Need to use token in CI/CD

**Solution:**
```bash
# Set token via environment variable
export GH_TOKEN=ghp_xxxxxxxxxxxx

# Or use GITHUB_TOKEN (also supported)
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Verify authentication
gh auth status
```

## Repository Context Issues

### Not a Git Repository

**Error:**
```
could not determine current directory
```
or
```
fatal: not a git repository
```

**Causes:**
- Running gh outside a Git repository
- Git repository not initialized

**Solutions:**
1. Navigate to a Git repository:
   ```bash
   cd /path/to/your/repo
   ```

2. Or specify repository explicitly:
   ```bash
   gh pr list -R owner/repo
   ```

3. Initialize Git repository if needed:
   ```bash
   git init
   git remote add origin https://github.com/owner/repo.git
   ```

### Wrong Repository Detected

**Issue:** gh operating on wrong repository

**Solution:**
1. Check current repository remote:
   ```bash
   git remote -v
   ```

2. Specify correct repository:
   ```bash
   gh pr list -R owner/correct-repo
   ```

3. Set default repository:
   ```bash
   gh repo set-default owner/repo
   ```

4. Update Git remote if wrong:
   ```bash
   git remote set-url origin https://github.com/owner/correct-repo.git
   ```

### Repository Not Found

**Error:**
```
Could not resolve to a Repository with the name 'owner/repo'
```
or
```
HTTP 404: Not Found
```

**Causes:**
- Repository doesn't exist
- Wrong owner/repo name
- No access permissions
- Private repository without access

**Solutions:**
1. Verify repository name:
   ```bash
   # Check in GitHub web UI
   # Correct format: owner/repo
   ```

2. Check you have access to the repository

3. Verify authentication:
   ```bash
   gh auth status
   ```

4. For private repos, ensure token has `repo` scope

## Pull Request Issues

### PR Already Exists

**Error:**
```
a]pull request for branch "feature" already exists
```

**Cause:**
A pull request already exists for this branch

**Solutions:**
1. List existing PRs to find it:
   ```bash
   gh pr list
   gh pr list --head feature-branch
   ```

2. View the existing PR:
   ```bash
   gh pr view
   ```

3. Update existing PR instead of creating new one

### Cannot Merge: Conflicts

**Error:**
```
Pull request is not mergeable: merge conflict
```

**Solutions:**
1. Checkout PR locally:
   ```bash
   gh pr checkout 123
   ```

2. Fetch latest base branch:
   ```bash
   git fetch origin main
   ```

3. Merge or rebase:
   ```bash
   git merge origin/main
   # or
   git rebase origin/main
   ```

4. Resolve conflicts and push:
   ```bash
   git add .
   git commit
   git push
   ```

### Checks Must Pass

**Error:**
```
Pull request is not mergeable: failing checks
```

**Cause:**
Required status checks are failing

**Solutions:**
1. Check PR status:
   ```bash
   gh pr checks 123
   ```

2. View failed check details:
   ```bash
   gh pr checks 123 --watch
   ```

3. View workflow run logs:
   ```bash
   gh run view --log
   ```

4. Fix issues and push updates

5. Auto-merge when checks pass:
   ```bash
   gh pr merge 123 --auto
   ```

### Required Reviews Missing

**Error:**
```
Pull request is not mergeable: review required
```

**Solutions:**
1. Check PR review status:
   ```bash
   gh pr view 123
   ```

2. Request reviews:
   ```bash
   gh pr edit 123 --add-reviewer username
   ```

3. After approval, merge:
   ```bash
   gh pr merge 123
   ```

## GitHub Actions Issues

### Workflow Not Found

**Error:**
```
could not find any workflows named "deploy.yml"
```

**Solutions:**
1. List available workflows:
   ```bash
   gh workflow list
   ```

2. Use correct workflow file name or ID

3. Check if workflow is disabled:
   ```bash
   gh workflow view deploy.yml
   ```

4. Enable if disabled:
   ```bash
   gh workflow enable deploy.yml
   ```

### Cannot Trigger Workflow

**Error:**
```
workflow does not have 'workflow_dispatch' trigger
```

**Cause:**
Workflow doesn't have manual trigger enabled

**Solution:**
Add `workflow_dispatch` trigger to workflow file:
```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
```

### Run Not Found

**Error:**
```
run 123456 not found
```

**Solutions:**
1. List recent runs:
   ```bash
   gh run list
   ```

2. Verify run ID is correct

3. Check if run was deleted

4. Ensure you have access to the repository

### Cannot Download Artifacts

**Error:**
```
no artifacts found for run 123456
```

**Causes:**
- Run didn't produce artifacts
- Artifacts expired (default 90 days)
- Run is still in progress

**Solutions:**
1. Check if run has artifacts:
   ```bash
   gh run view 123456
   ```

2. Wait for run to complete

3. Check artifact retention settings in repository

## Network and Connection Issues

### Connection Timeout

**Error:**
```
dial tcp: i/o timeout
```
or
```
connection refused
```

**Causes:**
- Network connectivity issues
- Firewall blocking connection
- GitHub is down

**Solutions:**
1. Check network connection:
   ```bash
   ping github.com
   ```

2. Check GitHub status:
   ```bash
   curl -I https://api.github.com
   ```

3. Visit https://www.githubstatus.com

4. Check firewall/proxy settings

### SSL/TLS Issues

**Error:**
```
x509: certificate signed by unknown authority
```

**Causes:**
- Corporate proxy intercepting HTTPS
- Self-signed certificate
- Invalid SSL certificate

**Solutions:**
1. For development only (NOT production):
   ```bash
   export GIT_SSL_NO_VERIFY=true
   ```

2. Add certificate to system trust store

3. Configure Git to use specific CA bundle:
   ```bash
   git config --global http.sslCAInfo /path/to/cert.pem
   ```

### Rate Limiting

**Error:**
```
API rate limit exceeded
```

**Causes:**
- Too many API requests
- Using unauthenticated requests

**Solutions:**
1. Ensure you're authenticated:
   ```bash
   gh auth status
   ```

2. Wait for rate limit reset (usually 1 hour)

3. Check current rate limit:
   ```bash
   gh api rate_limit
   ```

4. Use conditional requests for polling

## Environment Variable Issues

### GH_TOKEN Not Working

**Issue:** Token set but authentication still failing

**Solutions:**
1. Verify token is exported:
   ```bash
   echo $GH_TOKEN
   ```

2. Ensure no extra spaces or quotes:
   ```bash
   export GH_TOKEN=ghp_xxxxxxxxxxxx
   ```

3. Verify token is valid:
   ```bash
   gh auth status
   ```

4. Check token permissions on GitHub

### GH_HOST Not Recognized

**Issue:** Commands still using github.com instead of Enterprise

**Solutions:**
1. Export variable in current shell:
   ```bash
   export GH_HOST=github.example.com
   ```

2. Add to shell profile:
   ```bash
   echo 'export GH_HOST=github.example.com' >> ~/.bashrc
   source ~/.bashrc
   ```

3. Or use flag per command:
   ```bash
   gh repo list -R github.example.com/owner/repo
   ```

## Output and Display Issues

### JSON Parsing Errors

**Issue:** Cannot parse JSON output

**Solutions:**
1. Specify JSON fields:
   ```bash
   gh pr list --json number,title,author
   ```

2. Use jq for filtering:
   ```bash
   gh pr list --json number,title | jq '.[] | .title'
   ```

3. Use built-in jq filter:
   ```bash
   gh pr list --json number,title --jq '.[].title'
   ```

### Template Errors

**Issue:** Go template syntax errors

**Solutions:**
1. Check template syntax:
   ```bash
   gh pr list --template '{{range .}}{{.number}}{{end}}'
   ```

2. Use JSON output instead:
   ```bash
   gh pr list --json number --jq '.[].number'
   ```

## Configuration Issues

### Config File Corruption

**Error:**
```
failed to load config
```

**Solutions:**
1. Check config location:
   ```bash
   gh config list
   ```

2. Reset config:
   ```bash
   rm -rf ~/.config/gh
   gh auth login
   ```

3. Config file locations:
   - Linux/macOS: `~/.config/gh/config.yml`
   - Windows: `%APPDATA%\gh\config.yml`

## General Troubleshooting Steps

When encountering any error:

1. **Check version:**
   ```bash
   gh --version
   ```

2. **Update gh:**
   ```bash
   # macOS
   brew upgrade gh
   ```

3. **Check authentication:**
   ```bash
   gh auth status
   ```

4. **Verify repository context:**
   ```bash
   git remote -v
   ```

5. **Use verbose mode:**
   ```bash
   GH_DEBUG=1 gh <command>
   ```

6. **Use --help:**
   ```bash
   gh <command> --help
   ```

7. **Check API directly:**
   ```bash
   gh api repos/owner/repo
   ```

## Getting Additional Help

If issues persist:

1. Check gh documentation: https://cli.github.com/manual
2. Search gh issues: https://github.com/cli/cli/issues
3. Check GitHub status: https://www.githubstatus.com
4. Create a new issue with:
   - gh version (`gh --version`)
   - Operating system
   - Full error message
   - Steps to reproduce
   - Debug output (`GH_DEBUG=1 gh <command>`)
