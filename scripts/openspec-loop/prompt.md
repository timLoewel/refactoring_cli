# Autonomous Execution Mode

You are running headless — no user interaction possible.

## Step 1: Get openspec instructions

Run:

```bash
openspec instructions apply --change "$CHANGE_NAME" --json
```

Parse the JSON. Read all files from `contextFiles`. Check `progress.remaining` —
if 0, output `<promise>COMPLETE</promise>` and stop.

## Step 2: Read learnings

If a learnings file path was provided, read it. Use it to avoid repeating
mistakes from previous iterations.

## Step 3: Implement ONE task

Find the first task where `done: false`. Implement ONLY that task.
- Use `roam context <symbol>` and `roam preflight <symbol>` to find relevant files before reading them
- Make the code changes
- Mark complete: `- [ ]` to `- [x]` in the tasks file

## Step 4: Quality checks

Run: `npm run lint`, `npm run build`, `npm test`
Fix any failures. Do not commit broken code.

## Step 5: Commit

Commit with semantic message: `feat(<scope>): <task description>`
Stage specific files, not `git add -A`.

## Step 6: Write learnings

Output a `<learnings>` block at the end of your response:

```
<learnings>
## Task N.M: <title>
### Patterns
- [codebase patterns discovered]
### Gotchas
- [unexpected issues]
### Failed Approaches
- [what didn't work and why]
</learnings>
```

## Step 7: Check completion

If all tasks are now done, output: `<promise>COMPLETE</promise>`
Otherwise, end normally.

## Rules
- ONE task per session. Stop after completing it.
- Never ask for user input.
- If blocked after 2 attempts, log the blocker in learnings and stop.
- Follow existing code patterns.
- Always run quality checks before committing.
- Always write learnings before stopping.
