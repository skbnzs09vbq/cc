import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

function parseAddedLines(diffText) {
  const addedLines = new Map()
  let currentFile = null
  let newLineNo = null
  for (const line of diffText.split('\n')) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/)
    if (fileMatch) {
      currentFile = fileMatch[1]
      if (!addedLines.has(currentFile)) addedLines.set(currentFile, new Set())
      continue
    }
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      newLineNo = Number(hunkMatch[1])
      continue
    }
    if (currentFile && newLineNo != null && line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.get(currentFile).add(newLineNo)
      newLineNo++
    }
  }
  return addedLines
}

const diffFile = process.argv[2]
const addedLines = parseAddedLines(readFileSync(diffFile, 'utf-8'))

let raw = ''
process.stdin.on('data', (chunk) => {
  raw += chunk
})
process.stdin.on('end', () => {
  const results = raw.trim() ? JSON.parse(raw) : []
  const lines = []
  for (const file of results) {
    const relPath = relative(process.cwd(), file.filePath)
    const added = addedLines.get(relPath)
    if (!added) continue
    for (const msg of file.messages) {
      if (added.has(msg.line)) {
        lines.push(`${relPath}:${msg.line} ${msg.message}`)
      }
    }
  }
  console.log(lines.length === 0 ? 'Tailwind arbitrary value: 指摘なし ✓' : lines.join('\n'))
})
