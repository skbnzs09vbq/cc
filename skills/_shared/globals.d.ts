// skill.ts が「未実行の仕様」として前提にしているグローバルのアンビエント宣言。
// Workflow の args / phase() を模した書き方（CLAUDE.md「JS参照ファイル形式のスキルで使う共通規約」参照）で、
// 実際に注入・実行されるものではない。宣言がないと TypeScript が
// 「Cannot find name」を誤検出してしまうため、ここで明示的に型を与える。

declare const args: any

declare function phase(title: string): void

// 他スキル・サブエージェント・Workflow の実際の呼び出しを表す（リテラルな呼び出し表現として
// そのまま実行される。complete() のような自己生成とは異なる）
declare function Skill(name: string, arg?: any): any
declare function Agent(options: any): any
declare function Workflow(options: any): any
declare function CronCreate(options: any): any
declare function CronList(): any

// ファイル・ディレクトリの存在確認（実行者が Read/Glob ツールで確認する）
declare function exists(path: string): boolean
