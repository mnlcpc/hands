@progress.txt

# Async Instructions

Complete **ONE task** (meaning issue or sub-issue) per iteration.

**DO:** Complete one task → Commit → Mark sub-issue Done, or issue In Review in Linear → Update progress.txt → STOP
**DON'T:** Continue to another task, loop, add Co-Authored-By trailers, skip Linear updates

---

## Step 0: INIT (every session)

1. Ensure dev branch is synced:
   ```
   git fetch origin
   git checkout dev
   git merge origin/main --no-edit
   git merge origin/staging --no-edit 2>/dev/null || true
   ```

2. Find matching Linear project (fuzzy match: "harker-app" → "Harker App" or "Harker") by using Linear MCP

3. Use Linead MCP to fetch all issues from that project with status "Todo" or "In Progress"

**If no issues with "Todo" or "In Progress" status exist:**
```
<promise>COMPLETE</promise>
```
Then **STOP**. All work is done.

---

## Step 1: SELECT

From the fetched issues, determine highest priority task:

**Priority order:**
1. Issues with status "In Progress" or "Todo" with partially completed sub-issues (some Done, some not) — continue these first
2. Issues with status "In Progress" or "Todo" with no sub-issues
3. Issues with status "Todo" (by priority field, then by creation date)

Once you've selected the issue to work on:
- If it has sub-issues: pick the next incomplete sub-issue
- If no sub-issues: work on the issue directly

**State clearly:**
```
Selected issue: <title> (<ISSUE-ID>)
Selected task: <sub-issue title or "main issue">
Sub-task ID: <ID or "N/A">
```
When you start working on an issue or sub-issue, update the main issue status to "In Progress" in Linear.
---

## Step 2: ORIENT

1. Read CLAUDE.md (project conventions override general practices)
2. Read progress.txt
3. Fetch full details of selected issue
4. `git status && git log --oneline -5`
5. Run tests if available

If progress.txt doesn't exist, create it with: project name, datetime.

---

## Step 3: BUILD

Implement the task following CLAUDE.md conventions. Keep changes small and focused.

---

## Step 4: VERIFY

Run checks (typecheck, tests, lint). Fix failures before proceeding. Never commit broken code.

---

## Step 5: DOCUMENT

Append to progress.txt:
```
### <datetime>
Issue: <ISSUE-ID>
Task: <what you did>
Sub-task ID: <ID or N/A>
Files changed: <list>
Status: Complete
```

---

## Step 6: COMMIT

```
git add -A && git commit -m "<type>: <description>"
```
Types: feat, fix, refactor, test, docs, chore. No trailers.

---

## Step 7: UPDATE LINEAR (mandatory)

- If sub-task: mark sub-task as Done
- If main issue (no sub-issues): mark issue as In Review
- If main issue has sub-issues and **all sub-issues** are now Done: mark main issue as In Review

---

## Step 8: CHECK COMPLETION

Say "✓ Iteration complete. Task '<name>' (<ID>) marked (<status>)."

Then **STOP**. The bash script will invoke you again for the next task.
