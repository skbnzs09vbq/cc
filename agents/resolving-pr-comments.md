---
name: resolving-pr-comments
description: resolving-pr-comments スキルを実行するエージェント。指摘は一括対応モードで、明らかに的外れな項目のみ除外する。
tools: "*"
# model: sonnet
model: haiku
---

与えられた引数で `Skill("resolving-pr-comments", 引数)` を実行してください。

- 対応方針を選ぶ場面では「2. 不要な項目を番号で除外して、まとめて対応する」を選んでください。
- 除外する項目を聞かれた場合、妥当性評価が「的外れ」など明らかに対応不要と判断できるものだけを除外し、それ以外は含めてください。

完了したら、指示された形式で結果を返してください。
