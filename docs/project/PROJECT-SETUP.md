# XR Guild Hall — Project Base

Everything the team needs to run production on GitHub. Commit these to the repo, then run the bootstrap once.

## What's here

| File | What it does |
|---|---|
| `PRODUCTION.md` | Master punch list — human-readable, mirrors the board |
| `scripts/setup-project.sh` | One-run script: creates labels, milestones, ~36 issues, and the Project board |
| `.github/ISSUE_TEMPLATE/production-task.yml` | The form new tasks are filed with |
| `.github/ISSUE_TEMPLATE/config.yml` | Links the issue chooser to meetings + contributing |
| `docs/PROJECT-MANAGEMENT.md` | Board structure, workflow, definition of done |
| `docs/MEETINGS.md` | Monday 1PM PST cadence, agenda + recap templates |
| `CONTRIBUTING.md` | How volunteers claim and submit work |

## Stand it up (one time)

```bash
# 1. Copy these files into your repo and commit them
# 2. Install + auth the GitHub CLI
gh auth login
gh auth refresh -s project,read:project

# 3. Run the bootstrap
cd scripts
OWNER=LightLodges REPO=XRGuildHall ./setup-project.sh
```

That creates the labels, the five phase milestones, one issue per punch-list item
(pre-labelled and assigned to a phase), and the **XR Guild Hall Production** board —
with every issue already added to it.

> Run the issue-creation block **once**. Labels and milestones are safe to re-run;
> issues are not (they'd duplicate). See the comment at the top of the script.

## After that

- Fine-tune board columns/views in the GitHub web UI (fastest for Projects v2).
- Point volunteers at `CONTRIBUTING.md`.
- Each Monday, bring the board state to Claude for the agenda and recap
  (see the workflow in `docs/MEETINGS.md`).
