# GitHub REST API with curl

This reference provides curl commands for GitHub API operations when gh CLI is not available.

## Prerequisites

Ensure `GH_TOKEN` environment variable is set:
```bash
echo $GH_TOKEN
```

If not set, create a token at https://github.com/settings/tokens

## Common Headers

All requests should include these headers:
```bash
-H "Accept: application/vnd.github+json" \
-H "Authorization: token $GH_TOKEN" \
-H "X-GitHub-Api-Version: 2022-11-28"
```

## Pull Requests

### Get Pull Request
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/pulls/PR_NUMBER
```

### List Pull Requests
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/OWNER/REPO/pulls?state=open&per_page=30"
```

### Search Pull Requests
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/search/issues?q=QUERY+repo:OWNER/REPO+type:pr"
```

### Get PR Comments

GitHub has several types of PR comments:

```bash
# Regular comments (general discussion)
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/issues/PR_NUMBER/comments

# Review comments (inline code comments)
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/pulls/PR_NUMBER/comments

# Reviews (approve/request changes with summary)
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/pulls/PR_NUMBER/reviews
```

### Get PR Diff
```bash
curl -L \
  -H "Accept: application/vnd.github.diff" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/pulls/PR_NUMBER
```

### Get PR Files
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/pulls/PR_NUMBER/files
```

### Get PR Check Status
```bash
# First get PR to find HEAD SHA
PR_DATA=$(curl -s -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/pulls/PR_NUMBER)

HEAD_SHA=$(echo "$PR_DATA" | jq -r '.head.sha')

# Get check runs for that SHA
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/commits/$HEAD_SHA/check-runs
```

### Create Pull Request
```bash
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/pulls \
  -d '{"title":"TITLE","body":"BODY","head":"HEAD_BRANCH","base":"BASE_BRANCH"}'
```

### Merge Pull Request
```bash
curl -L \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/pulls/PR_NUMBER/merge \
  -d '{"merge_method":"squash"}'
# merge_method: "merge", "squash", or "rebase"
```

### Add Comment to PR
```bash
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/issues/PR_NUMBER/comments \
  -d '{"body":"COMMENT_TEXT"}'
```

## Issues

### Get Issue
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/issues/ISSUE_NUMBER
```

### List Issues
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/OWNER/REPO/issues?state=open&labels=bug&per_page=30"
```

### Search Issues
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/search/issues?q=QUERY+repo:OWNER/REPO+type:issue+is:open"
```

### Create Issue
```bash
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/issues \
  -d '{"title":"TITLE","body":"BODY","labels":["bug"]}'
```

### Update Issue
```bash
curl -L \
  -X PATCH \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/issues/ISSUE_NUMBER \
  -d '{"state":"closed"}'
```

### Add Comment to Issue
```bash
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/issues/ISSUE_NUMBER/comments \
  -d '{"body":"COMMENT_TEXT"}'
```

## GitHub Actions

### List Workflows
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/actions/workflows
```

### List Workflow Runs
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/OWNER/REPO/actions/runs?status=failure&per_page=10"
```

### Get Workflow Run
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/actions/runs/RUN_ID
```

### Get Failed Jobs for Run
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/OWNER/REPO/actions/runs/RUN_ID/jobs?filter=failed"
```

### Get Job Logs
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/actions/jobs/JOB_ID/logs
```

### Trigger Workflow
```bash
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/actions/workflows/WORKFLOW_ID/dispatches \
  -d '{"ref":"main","inputs":{"key":"value"}}'
```

### Rerun Failed Jobs
```bash
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/actions/runs/RUN_ID/rerun-failed-jobs
```

### Cancel Workflow Run
```bash
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/actions/runs/RUN_ID/cancel
```

### Download Artifact
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/actions/artifacts/ARTIFACT_ID/zip \
  -o artifact.zip
```

## Diagnosing CI Failures

Complete workflow to diagnose failing PR checks:

```bash
# 1. Get PR details to find HEAD SHA
PR_DATA=$(curl -s -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/pulls/PR_NUMBER)

HEAD_SHA=$(echo "$PR_DATA" | jq -r '.head.sha')

# 2. Get check runs for that SHA
curl -s -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/commits/$HEAD_SHA/check-runs \
  | jq '.check_runs[] | {name, status, conclusion}'

# 3. Get workflow runs for the HEAD SHA
RUNS=$(curl -s -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/OWNER/REPO/actions/runs?head_sha=$HEAD_SHA")

# 4. Get first failed run ID
FAILED_RUN_ID=$(echo "$RUNS" | jq -r '.workflow_runs[] | select(.conclusion == "failure") | .id' | head -1)

# 5. Get failed jobs
curl -s -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/OWNER/REPO/actions/runs/$FAILED_RUN_ID/jobs?filter=failed"

# 6. Get logs for first failed job
JOB_ID=$(curl -s -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/OWNER/REPO/actions/runs/$FAILED_RUN_ID/jobs?filter=failed" \
  | jq -r '.jobs[0].id')

curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/actions/jobs/$JOB_ID/logs
```

## Discussions (GraphQL)

GitHub Discussions require GraphQL API:

### List Discussions
```bash
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/graphql \
  -d '{
    "query": "query($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { discussions(first: 10) { nodes { id title body number } } } }",
    "variables": {"owner": "OWNER", "repo": "REPO"}
  }'
```

### Get Discussion with Comments
```bash
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/graphql \
  -d '{
    "query": "query($owner: String!, $repo: String!, $number: Int!) { repository(owner: $owner, name: $repo) { discussion(number: $number) { id title body comments(first: 10) { nodes { body author { login } } } } } }",
    "variables": {"owner": "OWNER", "repo": "REPO", "number": DISCUSSION_NUMBER}
  }'
```

## Common Patterns

### Extract Owner/Repo from URL
```bash
URL="https://github.com/owner/repo/issues/123"
OWNER_REPO=$(echo "$URL" | sed -E 's|https://github.com/([^/]+/[^/]+)/.*|\1|')
OWNER=$(echo "$OWNER_REPO" | cut -d'/' -f1)
REPO=$(echo "$OWNER_REPO" | cut -d'/' -f2)
```

### Pagination
```bash
# Use per_page and page parameters
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/OWNER/REPO/issues?per_page=100&page=2"

# Check Link header for next page
curl -I -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/OWNER/REPO/issues" | grep -i "link:"
```

### Check Rate Limit
```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: token $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/rate_limit
```

## Tips

- Always include the three standard headers (Accept, Authorization, X-GitHub-Api-Version)
- Use `jq` to parse JSON responses
- The `-L` flag follows redirects (important for log downloads)
- Use `-s` for silent mode (no progress bar)
- Search queries use special syntax: `is:open`, `label:bug`, `author:username`
- For binary content (artifacts), use `-o filename` to save to file

## Authorization Header Formats

Both formats work for personal access tokens:
- `Authorization: token $GH_TOKEN` - Legacy format
- `Authorization: Bearer $GH_TOKEN` - OAuth 2.0 standard

This reference uses `token` format for consistency.
