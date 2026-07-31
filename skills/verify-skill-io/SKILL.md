---
name: verify-skill-io
description: skill.ts（関数化済み。ARGS_SCHEMA と export function の返り値の型が正）と、それを呼び出す workflow.js（agent(prompt, {agentType, schema}) / Skill(name, args)）の間で、入力・出力の型が食い違っていないか確認する。tsc で検出できる直接 import 経由の呼び出しに加え、tsc がチェックしない agent()/Skill() 経由の呼び出しを意味的に突き合わせる。skill.ts や workflow.js を変更した後、または呼び出し関係に不安がある時に使う。
user-invocable: true
model: opus
---

`skill.ts` を読み、その内容に従って実行する
