---
name: sync-claude
description: 指定した project フォルダ配下の .claude と、今の project の .claude の差分（git管理下ファイルのみ）を検出し、指定側の内容を今の .claude に取り込む。WSL・Windows どちらのパス表記でも指定できる。他の project 環境（WSLの別プロジェクト等）で行った .claude 側の変更を、今の環境に反映したい時に使う。
argument-hint: "path: <比較対象 project のフォルダパス>"
user-invocable: true
model: sonnet
---

`skill.ts` を読み、その内容に従って実行する。
