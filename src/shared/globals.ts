declare const args: any

declare function phase(title: string): void

declare function Skill(name: string, arg?: any): any
declare function Agent(options: any): any
declare function Workflow(options: any): any
declare function CronCreate(options: any): any
declare function CronList(): any

declare function TaskOutput(options: { task_id: string; block: boolean; timeout: number }): any

declare function exists(path: string): boolean
