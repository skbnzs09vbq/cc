import { respond, complete } from '../_shared/complete.js'

const CRON_JOBS = [
  {
    cron: '3,18,33,48 * * * *',
    prompt: '.claude/skills/auto-dev/roadmap-workflow.js を Workflow ツールで実行してください（仕様・実装状況の把握、ロードマップ更新、issue作成）。',
  },
  {
    cron: '6,26,46 * * * *',
    prompt: 'auto-dev スキルを実行してください（新規 issue・PR コメントの検知と自律対応）。',
  },
  {
    cron: '10,25,40,55 * * * *',
    prompt: '.claude/skills/auto-dev/pr-review-workflow.js を Workflow ツールで実行してください（open PR のレビュー・指摘投稿・マージ）。',
  },
]

for (const job of CRON_JOBS) {
  const alreadyScheduled = complete(
    `CronList() で既存の cron ジョブ一覧を取得してください。prompt が "${job.prompt}" と一致するジョブが既にあるか判定してください。`,
    { type: 'boolean' }
  )
  if (!alreadyScheduled) {
    CronCreate({ cron: job.cron, prompt: job.prompt, recurring: true })
  }
}

respond(Workflow({ scriptPath: '.claude/skills/auto-dev/workflow.js' }))
