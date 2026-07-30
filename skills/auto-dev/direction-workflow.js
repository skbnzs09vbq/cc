export const meta = {
  name: 'auto-dev-direction',
  description:
    'Understand the spec and implementation status, pick one angle, and create issues for what is missing (split into fine-grained, multiple issues)',
  phases: [
    { title: 'Spec & current state' },
    { title: 'Next issue selection' },
    { title: 'Issue creation' },
  ],
}

function dedent(strings, ...values) {
  const bodyLines = strings.flatMap(s => s.split('\n').slice(1)).filter(l => l.trim())
  const indent = bodyLines.length ? Math.min(...bodyLines.map(l => l.match(/^ */)[0].length)) : 0
  const strip = s => s.split('\n').map((l, i) => i === 0 ? l : (l.startsWith(' '.repeat(indent)) ? l.slice(indent) : l)).join('\n')
  return strings.reduce((acc, s, i) => acc + strip(s) + (i < values.length ? values[i] : ''), '').trim()
}

const MAX_ISSUE_COUNT = 15

const GRANULARITY_NOTE = dedent`
  - Pick exactly one missing angle (e.g. a specific feature area, layer, or part of the spec) and search only within that angle (other angles can be left for next time — do not try to turn everything you found this round into issues)
  - Split what you find within the chosen angle into as fine-grained issue candidates as possible
  - Only bundle work into a single issue when it must be implemented together for technical reasons (e.g. a hard dependency)
  - Propose at most ${MAX_ISSUE_COUNT} issue candidates
  - Assign each issue a priority (high/middle/low). A "foundation" issue that other issues depend on (e.g. tech selection, scaffolding) is high; an issue that depends on such a foundation issue being done first is low; everything else (no dependency, can proceed independently) is middle
  - If a technology choice has not been made yet, decide it concretely here (language, framework, internal DB, ORM, migration tool, etc., including versions and library names) and state it in description. Vague instructions like "please choose" that leave the choice to the implementer are forbidden
    - If an existing open issue's body already states a technology choice, follow it for consistency
    - If the spec (e.g. Notion) and .claude/local/project.ts's LINT_COMMAND/TYPECHECK_COMMAND (the language toolchain actually verifiable in this environment) disagree, prefer the verifiable one and state the discrepancy and your reasoning in description
`

const ITEMS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          rationale: { type: 'string', description: 'Why this issue is needed now' },
          priority: {
            type: 'string',
            enum: ['high', 'middle', 'low'],
            description:
              'A foundation issue other issues depend on is high; an issue that depends on another issue being done is low; everything else is middle',
          },
        },
        required: ['title', 'description', 'rationale', 'priority'],
      },
      description: 'List of issue candidates to work on next (empty array if none)',
    },
  },
  required: ['items'],
}

// ─── Phase 1: Spec & current state ──────────────────────────────
phase('Spec & current state')

const specResearch = await agent(
  dedent`
    Run Skill("research", "project-wide spec/requirements") and fetch information about the spec
    Return the fetched content as-is
  `,
  { phase: 'Spec & current state', label: 'Spec research' }
)

const existingIssues = await agent(
  dedent`
    Check TARGET_REPO in .claude/local/project.ts, then run
    gh issue list --repo <TARGET_REPO> --state open --json title,body and return the result as-is
  `,
  { phase: 'Spec & current state', label: 'Existing issues check' }
)

// ─── Phase 2: Next issue selection ──────────────────────────────
phase('Next issue selection')

let implementationStatus = null
let items = (await agent(
  dedent`
    Compare the spec research below with existing open issues, and if there are missing features
    that have not been turned into issues yet, propose them as the next issue candidates (empty items array if none)

    ${GRANULARITY_NOTE}

    Spec research:
    ${specResearch}

    Existing open issues:
    ${existingIssues}
  `,
  { schema: ITEMS_SCHEMA, phase: 'Next issue selection', label: 'Missing feature judgment' }
)).items

if (items.length === 0) {
  implementationStatus = await agent(
    dedent`
      Check PROJECT_ROOT/GUIDELINES in .claude/local/project.ts and investigate the overall implementation status of the project
      (directory structure, implementation status per major feature, unimplemented/TODO/known issues, code quality and design problems —
      not limited to features explicitly stated in the spec; also include problems/technical debt found during investigation)
      Return the investigation result as-is
    `,
    { phase: 'Next issue selection', label: 'Implementation status research' }
  )

  items = (await agent(
    dedent`
      Based on the spec research and implementation status below, if there are parts you judge to be missing,
      propose them as the next issue candidates (empty items array if none)
      Do not duplicate existing open issues

      ${GRANULARITY_NOTE}

      Spec research:
      ${specResearch}

      Implementation status:
      ${implementationStatus}

      Existing open issues:
      ${existingIssues}
    `,
    { schema: ITEMS_SCHEMA, phase: 'Next issue selection', label: 'Implementation gap judgment' }
  )).items
}

if (items.length === 0) {
  const existingPrs = await agent(
    dedent`
      Check TARGET_REPO in .claude/local/project.ts, then run
      gh pr list --repo <TARGET_REPO> --state open --json number,title,mergeable,url and return the result as-is
    `,
    { phase: 'Next issue selection', label: 'Existing PR check' }
  )

  items = (await agent(
    dedent`
      Check the open PR list below, and if there are problems (e.g. conflicts), propose issue candidates
      to resolve them (empty items array if none)
      Propose at most ${MAX_ISSUE_COUNT} issue candidates

      Open PR list:
      ${existingPrs}
    `,
    { schema: ITEMS_SCHEMA, phase: 'Next issue selection', label: 'PR problem judgment' }
  )).items
}

log(`${items.length} next issue candidate(s)`)

// ─── Phase 3: Issue creation ────────────────────────────────────
phase('Issue creation')

const toCreate = items.slice(0, MAX_ISSUE_COUNT)

const created = await pipeline(
  toCreate,

  item =>
    agent(
      dedent`
        Check TARGET_REPO/ASSIGNEE in .claude/local/project.ts, then run gh issue create
        to actually create an issue with the following content.

        Title: [${item.priority}] ${item.title}
        Body (Markdown):
        ## Description
        ${item.description}

        ## Rationale
        ${item.rationale}

        Specify ASSIGNEE via the --add-assignee <ASSIGNEE> flag so it is assigned at creation time
        The body may contain newlines/quotes, so use a safe method such as writing it to a temp file
        Return the URL of the created issue
      `,
      { phase: 'Issue creation', label: `Create: ${item.title}` }
    ).then((url) => `${item.title}: created (${url})`)
)

log(`Processed ${created.filter(Boolean).length} issue(s)`)

return { created: created.filter(Boolean) }
