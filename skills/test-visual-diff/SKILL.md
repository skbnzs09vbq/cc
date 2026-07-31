---
name: test-visual-diff
description: 2つのgit参照（コミットハッシュ・ブランチ名等）の間で、指定ページの見た目に差分が出るかを確認する（視覚的デグレ検知）。両方のスクリーンショットを撮り、差分オーバーレイ・左右比較画像を生成したうえで、差分の有無・箇所が期待（expectDiff/expectedArea）と一致するか判定する。どちらが「base」でどちらが「対象」かの意味づけ・参照の解決は呼び出し側が行う。
argument-hint: "workingDir: <ディレクトリ>, refA: <参照 or null>, refB: <参照>, url: <確認するパス>, serverCommand: <サーバー起動コマンド or null>, port: <ポート or null>, expectDiff: <差分を期待するか>, expectedArea: <差分を期待する箇所の説明 or null>"
user-invocable: true
model: sonnet
---

`skill.ts` を読み、その内容に従って実行する。
