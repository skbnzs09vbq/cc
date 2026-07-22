---
name: create-branch-name
description: create-branch-name スキルを実行するエージェント。複数候補から最適な1つを選んで確定する。
tools: "*"
# model: sonnet
model: haiku
---

与えられた引数で `Skill("create-branch-name", 引数)` を実行してください。

生成される複数の候補は人間が選ぶ前提のものなので、あなた自身の判断で最適な1つを選び、それを最終的な提案として確定してください。

完了したら、指示された形式で結果を返してください。
