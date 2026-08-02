import {
  ASSIGNEE,
  AUTO_DEV_ISSUE_MAX_ITERATIONS,
  AUTO_DEV_MAX_CONCURRENT,
  USE_AUTO_DEV,
} from "../../local/project.js";
import {
  complete,
  exit,
  readFile,
  remember,
  respond,
  writeFile,
} from "../_shared/complete.js";
import { dedent } from "../_shared/utils.js";
import { gitPrList, type RawPr } from "../git-pr-list/skill.js";
import { gitPrReviewStatus } from "../git-pr-review-status/skill.js";
import { gitWorktreeCreate } from "../git-worktree-create/skill.js";
import {
  issueList,
  type RawIssueWithDependencies,
} from "../issue-list/skill.js";

const CRON_PROMPT =
  "auto-dev スキルを実行してください\n前回起動した taskId がまだ running かを確認するだけで終わらせず、必ず skill.ts の Phase 1（状態読み込み・プルーニング）から全フェーズを毎回実行し直すこと";
const STATE_PATH = ".claude/local/running-workflows.json";
const ROADMAP_MAX_OPEN_ISSUES = 5;

type WorkflowType = "implement" | "address-comments" | "review" | "roadmap";
type Priority = "high" | "middle" | "low";

const SCRIPT_PATHS: Record<WorkflowType, string> = {
  implement: ".claude/skills/auto-dev/implement-workflow.js",
  "address-comments": ".claude/skills/auto-dev/address-comments-workflow.js",
  review: ".claude/skills/auto-dev/review-workflow.js",
  roadmap: ".claude/skills/auto-dev/roadmap-workflow.js",
};

type RunningEntry = {
  taskId: string;
  type: WorkflowType;
  target: string;
  worktreePath: string | null;
  launchedAt: string;
};

function isPriority(v: string | undefined): v is Priority {
  return v === "high" || v === "middle" || v === "low";
}

function priorityOf(title: string): Priority {
  const matched = title.match(/^\[(high|middle|low)\]/)?.[1];
  return isPriority(matched) ? matched : "middle";
}

type IssueCandidate = RawIssueWithDependencies & { priority: Priority };
type PrCandidate = RawPr & {
  issueNumber: number;
  priority: Priority;
  hasComments: boolean;
  allResolved: boolean;
};

export function autoDev(): void {
  if (!USE_AUTO_DEV)
    exit(
      "このプロジェクトでは auto-dev が無効化されています（project.ts の USE_AUTO_DEV を確認）",
    );

  remember([
    "このスキルの役割は起動判定・状態管理・workflow の管理（起動先の選定）まで\nissue/PR の実装内容そのものには立ち入らない",
    "Workflow の起動は必ず本物の Workflow() 呼び出しで行う（シミュレーションしない）",
    "既存taskIdの running/completed 確認だけで終わらせない\n呼ばれるたびに必ずPhase 1から全フェーズを再実行し、空き枠と新規対象の有無を毎回判定し直すこと",
    "起動先の選定は比率ではなく決定木（f_issue/f_pr の状態に基づく優先順位ルール）で行う",
    "他スキルの機能を使う場合、export された関数を直接 import して呼ぶ（Skill() 経由の自由文字列往復にしない）",
  ]);

  const cronList = String(CronList());
  const alreadyScheduled = complete(
    dedent`
      以下は CronList() の実行結果です
      prompt に "${CRON_PROMPT}" を含むジョブが既に登録されているか判断してください

      ${cronList}
    `,
    { type: "boolean" } as const,
  );
  if (!alreadyScheduled)
    CronCreate({ cron: "* * * * *", prompt: CRON_PROMPT, recurring: true });

  // ─── Phase 1: 状態読み込み・プルーニング ─────────────────────────
  phase("状態読み込み・プルーニング");

  const raw = readFile(STATE_PATH);
  const running: RunningEntry[] = raw ? JSON.parse(raw).running : [];

  const stillRunning = running.filter((entry) =>
    String(
      TaskOutput({ task_id: entry.taskId, block: false, timeout: 0 }),
    ).includes("<status>running</status>"),
  );

  writeFile(STATE_PATH, JSON.stringify({ running: stillRunning }, null, 2));

  // ─── Phase 2: 起動判定 ────────────────────────────────────
  phase("起動判定");

  if (stillRunning.length >= AUTO_DEV_MAX_CONCURRENT) {
    respond(
      `実行中 ${stillRunning.length}/${AUTO_DEV_MAX_CONCURRENT} 件のため、今回は新規起動しません`,
    );
    exit();
  }

  const claimedIssueNumbers = new Set(
    stillRunning
      .map((entry) => Number(entry.target.match(/issue #(\d+)/)?.[1]))
      .filter((n) => !Number.isNaN(n)),
  );
  const runningRoadmapCount = stillRunning.filter(
    (e) => e.type === "roadmap",
  ).length;

  const openIssues = issueList({
    type: null,
    assigneeOnly: true,
    structured: true,
    withDependencies: true,
  });

  const allPrs = gitPrList({ assignee: null, number: null, state: "all" });
  const issuesWithExistingPr = new Set(
    allPrs
      .filter((pr) => pr.state === "OPEN")
      .map((pr) => pr.closesIssue)
      .filter((n): n is number => n !== null),
  );
  const openPrs = allPrs.filter(
    (pr) => pr.state === "OPEN" && pr.author.login === ASSIGNEE,
  );

  const filteredIssues: IssueCandidate[] = openIssues
    .filter((i) => i.dependsOnOpenIssues.length === 0)
    .filter((i) => !issuesWithExistingPr.has(i.number))
    .filter((i) => !claimedIssueNumbers.has(i.number))
    .map((i) => ({ ...i, priority: priorityOf(i.title) }));

  const issueTitleMap = new Map(openIssues.map((i) => [i.number, i.title]));

  const filteredPrs: PrCandidate[] = [];
  for (const pr of openPrs) {
    const issueNumber = pr.closesIssue;
    if (!issueNumber || claimedIssueNumbers.has(issueNumber)) continue;

    const status = gitPrReviewStatus({ prNumber: pr.number });

    filteredPrs.push({
      ...pr,
      issueNumber,
      priority: priorityOf(issueTitleMap.get(issueNumber) ?? ""),
      hasComments: status.hasComments,
      allResolved: status.allResolved,
    });
  }

  function launchPr(pr: PrCandidate, kind: "review" | "address-comments") {
    const worktreePath = gitWorktreeCreate({
      issueNumber: pr.issueNumber,
      branch: pr.headRefName,
    });
    const label = kind === "review" ? "レビュー" : "コメント対応";
    return {
      type: kind,
      scriptPath: SCRIPT_PATHS[kind],
      args: {
        pr: {
          number: pr.number,
          url: pr.url,
          branch: pr.headRefName,
          issueNumber: pr.issueNumber,
        },
        worktreePath,
      },
      target: `issue #${pr.issueNumber}（PR #${pr.number} ${label}）`,
      worktreePath,
    };
  }

  const isReady = (pr: PrCandidate) => !pr.hasComments || pr.allResolved;

  // ─── Phase 3: workflow 起動────────────────────────────────
  phase("workflow 起動");

  let launched: {
    type: WorkflowType;
    scriptPath: string;
    args: unknown;
    target: string;
    worktreePath: string | null;
  } | null = null;

  const highReadyPr = filteredPrs.find(
    (pr) => pr.priority === "high" && isReady(pr),
  );
  const anyHighPr = filteredPrs.some((pr) => pr.priority === "high");
  const readyPr = filteredPrs.find(isReady);
  const unresolvedPr = [...filteredPrs]
    .filter((pr) => pr.hasComments && !pr.allResolved)
    .sort(
      (a, b) =>
        (a.priority === "high" ? -1 : 1) - (b.priority === "high" ? -1 : 1),
    )[0];

  if (highReadyPr) {
    launched = launchPr(highReadyPr, "review");
  } else if (!anyHighPr && readyPr) {
    launched = launchPr(readyPr, "review");
  } else if (unresolvedPr) {
    launched = launchPr(unresolvedPr, "address-comments");
  } else if (filteredIssues.length > 0) {
    const issue =
      filteredIssues.find((i) => i.priority === "high") ?? filteredIssues[0];
    const worktreePath = gitWorktreeCreate({
      issueNumber: issue.number,
      branch: null,
    });
    launched = {
      type: "implement",
      scriptPath: SCRIPT_PATHS.implement,
      args: {
        issue: {
          number: issue.number,
          url: issue.url,
          title: issue.title,
          blocked: false,
          blockedReason: null,
        },
        worktreePath,
        maxIterations: AUTO_DEV_ISSUE_MAX_ITERATIONS,
      },
      target: `issue #${issue.number}`,
      worktreePath,
    };
  } else if (
    runningRoadmapCount === 0 &&
    openIssues.length < ROADMAP_MAX_OPEN_ISSUES
  ) {
    launched = {
      type: "roadmap",
      scriptPath: SCRIPT_PATHS.roadmap,
      args: undefined,
      target: "roadmap 生成",
      worktreePath: null,
    };
  }

  if (!launched) {
    respond(
      `対応対象が無いため、今回は新規起動しません\n\n実行中 ${stillRunning.length}/${AUTO_DEV_MAX_CONCURRENT}`,
    );
    exit();
  }

  const launch = Workflow({
    scriptPath: launched.scriptPath,
    args: launched.args,
  });
  const taskId = String(launch).match(/Task ID:\s*(\S+)/)?.[1] ?? "";

  stillRunning.push({
    taskId,
    type: launched.type,
    target: launched.target,
    worktreePath: launched.worktreePath,
    launchedAt: new Date().toISOString(),
  });
  writeFile(STATE_PATH, JSON.stringify({ running: stillRunning }, null, 2));

  respond(
    `${launched.type} を起動: ${launched.target}\n\n実行中 ${stillRunning.length}/${AUTO_DEV_MAX_CONCURRENT}`,
  );
}

autoDev();
