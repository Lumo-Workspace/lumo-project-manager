# Reviewed team memory — `lumo judgment`

A **judgment** is a team memory entry that takes effect only after a person approves it: what the team holds, why, when it applies, who judged it. You can propose a candidate, propose a revision and read. **You cannot approve, reject, request changes or withdraw** — there is no CLI command for those; a person does them in the web app, and an API key is refused there with 403.

Opened workspace by workspace. Everywhere else every `judgment` command fails with `Team memory review is not turned on for this workspace` (HTTP 409) — relay it; nothing to retry. In this phase judgments change nothing a session receives: session start, `memory sync` and `task show` still deliver the `lumo memory` entries ([memory.md](memory.md)).

## Commands

```bash
lumo judgment propose <name> --file <path>                              # new entry, as a candidate
lumo judgment revise <judgment> --file <path> --base <revision-id|none> # a new revision of an entry
lumo judgment list [--all] [-n N] [--cursor <cursor>] [--json]           # entries with a revision in effect
lumo judgment show <judgment> [--history] [--json]                       # in effect + waiting for review
lumo judgment inbox [--json]                                             # candidates waiting, conflicts first
```

- `<name>`: 2–80 lowercase letters, digits and hyphens, unique in the workspace (`tests-live-under-tests-dir`). An existing name is refused (409) — use `revise`.
- `<judgment>`: the name or the id.
- `--file`: a JSON file (below); `-` reads stdin. Keep it outside the repository.
- `propose --project <ref>` (after the command words) scopes the entry to one project; without it the entry is workspace-wide. A revision keeps its entry's project.
- `list` prints `NAME  STATUS  DESCRIPTION` (TAB-separated); `--all` adds entries with nothing in effect. `--json`: `{ version, judgments, total, nextCursor }`; `inbox --json`: `{ version, candidates, total, nextCursor }`.

`propose` and `revise` print the revision id, its digest, the stored origin and the review link — give the link to the user.

## The content file

```json
{
  "description": "Change the source schema, not the generated client",
  "statement": "Change the source schema and regenerate the client instead of editing generated SDK files.",
  "kind": "CONDITIONAL_GUIDANCE",
  "rationale": "The next generator run overwrites hand edits.",
  "limits": [
    "Does not decide whether a file is generated; establish that from the repository."
  ],
  "polarity": "PREFER",
  "assertion": { "key": "generated-files.edit", "value": "regenerate" },
  "scope": {
    "repo": "acme/app",
    "pathGlobs": ["src/generated/**"],
    "topic": "codegen"
  },
  "when": [{ "field": "agent", "equals": "CLAUDE_CODE" }],
  "origin": "AGENT_JUDGMENT",
  "judgedByLabel": "said by the owner in the task thread",
  "sourceTaskId": "LUM-42",
  "sourceRefs": ["task:LUM-42#decision-3"],
  "evidence": [
    {
      "reference": "pr:1744",
      "role": "supports",
      "summary": "The hand edit was overwritten."
    }
  ]
}
```

Required: `description` (one line, the index line), `statement`, `kind`, `limits` (at least one; prose, where it stops applying). Everything else is optional.

- `kind`: `CONDITIONAL_GUIDANCE` | `CASE` (one thing that happened) | `HYPOTHESIS` (not yet confirmed) | `CONSTRAINT`.
- `rationale`: the recorded reason. **Unknown → `null`; never invent one.** A revision without a reason cannot be approved until a later revision supplies it.
- `origin`: for a CLI key the server stores `AGENT_ASSUMPTION` when you send that, and `AGENT_JUDGMENT` for anything else — a human origin cannot be written from the CLI. When a person said it, say so in `judgedByLabel` and `sourceRefs`; the reviewer confirms the origin on the web.
- `assertion`: an optional key and scalar value for the deterministic conflict check (below).
- `scope.repo` is `owner/name`; `scope.pathGlobs` are path globs; `scope.topic` is a label for people. `when[].field` is one of `repo`, `agent`, `task.tag`, `path`, matched by equality. `validFrom` / `validUntil` are ISO dates (the end is exclusive).
- `evidence[].role`: `supports` | `challenges` | `context`. `alternatives`: `[{ "option", "whyNot" }]`; `context`: `{ "situation" }`; `expectedOutcome`: `{ "description" }`.
- The CLI fills `recordedByAgent` and `sourceSessionId` from the session when the file omits them. Unknown keys are refused (400).

The text is screened like any memory write: prompt-injection signals, standing orders to future agents ("from now on always …") and contradictions of a project rule are rejected (422). Describe what the team holds; do not address a future agent.

## Revisions

A revision is a full new version, never an edit in place. `--base` is the id of the revision in effect that you read with `judgment show` (`none` when nothing is in effect). If another revision was approved meanwhile the server answers 409 `The revision in effect has changed` — read again and base on the current one. Several candidates on the same base may wait side by side; a person approves one and the others must be proposed again. A candidate leaves the revision in effect untouched.

States: `proposed` → `approved` | `rejected` | `changes_requested` | `expired` (30 days without review; not deleted, propose again); `approved` → `superseded` (a newer revision approved) | `withdrawn`. After `changes_requested`, propose a new revision. A withdrawn entry has nothing in effect — earlier revisions do not come back.

`show` lists why a candidate cannot be approved as it stands: origin unknown, no reason recorded, an assertion conflict, or a base that is no longer in effect.

## Conflicts

Two entries conflict when they are **different** entries, carry the same `assertion.key` with different values, and could apply to the same work (same project or either workspace-wide; same repository or either unset; overlapping paths; no contradicting `when`; overlapping validity). Revisions of one entry never conflict with each other.

A conflict blocks the candidate's approval **and pauses the approved entry** (`[paused — assertion conflict]` in `show`, `paused (conflict)` in `list`) until a person resolves it: rejects the candidate, withdraws one side, or approves a revision that no longer conflicts. So do not propose a contradicting assertion to "see what happens" — it pauses someone's approved entry. To change an entry, `revise` it.

## When to suggest

- The user makes a ruling, corrects you, or states an exception that should outlive the task → propose a candidate with their words in `statement` / `rationale`, the source in `sourceRefs`, and tell them it waits for their review at the printed link.
- You relied on a consequential assumption → propose it with `origin: "AGENT_ASSUMPTION"` and `kind: "HYPOTHESIS"`.
- An approved entry looks wrong → `revise` it (or tell the user it needs withdrawing); never work around it silently.
- The user asks what is waiting → `judgment inbox`. Asked to approve → say it is done in the web app and give the link.
- Do not turn every message into an entry or widen a local preference into a team rule.
