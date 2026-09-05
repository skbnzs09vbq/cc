export function displayWidth(text: string): number {
  return [...text].reduce(
    (width, char) =>
      width + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]|[✅❌⏱⚠]/.test(char) ? 2 : 1),
    0,
  )
}

export function boxTable(header: string[], rows: string[][], separatorBefore: number[] = []): string {
  const all = [header, ...rows]
  const widths = header.map((_, col) => Math.max(...all.map((r) => displayWidth(r[col] ?? ''))))

  const pad = (text: string, col: number, alignRight: boolean) => {
    const space = ' '.repeat(widths[col] - displayWidth(text))
    return alignRight ? `${space}${text}` : `${text}${space}`
  }
  const line = (left: string, mid: string, right: string) =>
    left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right
  const row = (cells: string[], alignRight: boolean) =>
    `│ ${cells.map((c, i) => pad(c ?? '', i, alignRight && i > 0)).join(' │ ')} │`

  return [
    line('┌', '┬', '┐'),
    row(header, false),
    line('├', '┼', '┤'),
    ...rows.flatMap((r, i) => (separatorBefore.includes(i) ? [line('├', '┼', '┤'), row(r, true)] : [row(r, true)])),
    line('└', '┴', '┘'),
  ].join('\n')
}

export function dedent(strings: TemplateStringsArray, ...values: any[]): string {
  const bodyLines = strings.flatMap((s) => s.split('\n').slice(1)).filter((l) => l.trim())
  const indent = bodyLines.length
    ? Math.min(...bodyLines.map((l) => (l.match(/^ */)?.[0] ?? '').length))
    : 0
  const strip = (s: string) =>
    s
      .split('\n')
      .map((l, i) => (i === 0 ? l : l.startsWith(' '.repeat(indent)) ? l.slice(indent) : l))
      .join('\n')
  return strings
    .reduce((acc: string, s, i) => acc + strip(s) + (i < values.length ? values[i] : ''), '')
    .trim()
}
