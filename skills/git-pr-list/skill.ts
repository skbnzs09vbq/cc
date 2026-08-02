import { TARGET_REPO } from "../../local/project.js";
import { getArgs } from "../_shared/args.js";
import { type Schema, respond, runCommand } from "../_shared/complete.js";
import type { Infer } from "../_shared/infer.js";

export const ARGS_SCHEMA = {
  type: "object",
  properties: {
    assignee: {
      type: ["string", "null"],
      description:
        "string: この GitHub アカウントが作成した PR のみに絞る, null: 未指定（全体）",
    },
    number: {
      type: ["integer", "null"],
      description:
        "integer: 指定した場合、この PR 番号1件だけを取得する（assignee・state は無視）, null: 指定しない場合",
    },
    state: {
      type: ["string", "null"],
      enum: ["open", "closed", "merged", "all", null],
      description: "string: PR の状態フィルタ, null: 未指定（open として扱う）",
    },
  },
  required: ["assignee", "number", "state"],
} as const satisfies Schema;

const RAW_PR_SCHEMA = {
  type: "object",
  properties: {
    number: { type: "integer" },
    title: { type: "string" },
    url: { type: "string" },
    mergeable: { type: "string" },
    state: { type: "string" },
    body: { type: ["string", "null"] },
    headRefName: { type: "string" },
    isDraft: { type: "boolean" },
    author: {
      type: "object",
      properties: { login: { type: "string" } },
      required: ["login"],
    },
    closesIssue: {
      type: ["integer", "null"],
      description:
        'integer: 本文の "Closes #N" から抽出した対応issue番号, null: 無ければ',
    },
  },
  required: [
    "number",
    "title",
    "url",
    "mergeable",
    "state",
    "body",
    "headRefName",
    "isDraft",
    "author",
    "closesIssue",
  ],
} as const satisfies Schema;

export type RawPr = Infer<typeof RAW_PR_SCHEMA>;
type FetchedPr = Omit<RawPr, "closesIssue">;

const FIELDS = Object.keys(RAW_PR_SCHEMA.properties)
  .filter((key) => key !== "closesIssue")
  .join(",");

function withClosesIssue(pr: FetchedPr): RawPr {
  return {
    ...pr,
    closesIssue: Number(pr.body?.match(/closes #(\d+)/i)?.[1]) || null,
  };
}

export function gitPrList(args: Infer<typeof ARGS_SCHEMA>): RawPr[] {
  const raw = args.number
    ? runCommand([`gh pr view ${args.number} --repo ${TARGET_REPO} --json ${FIELDS}`])
    : runCommand([
        `gh pr list --repo ${TARGET_REPO} ${args.assignee ? `--author ${args.assignee} ` : ""}--state ${args.state ?? "open"} --json ${FIELDS}`,
      ]);
  if (!raw) return [];

  const parsed: FetchedPr | FetchedPr[] = JSON.parse(raw);
  return (Array.isArray(parsed) ? parsed : [parsed]).map(withClosesIssue);
}

respond(gitPrList(getArgs(ARGS_SCHEMA)));
