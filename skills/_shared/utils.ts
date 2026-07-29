export function dedent(strings: TemplateStringsArray, ...values: any[]): string {
  const bodyLines = strings.flatMap((s) => s.split('\n').slice(1)).filter((l) => l.trim())
  const indent = bodyLines.length ? Math.min(...bodyLines.map((l) => l.match(/^ */)![0].length)) : 0
  const strip = (s: string) =>
    s
      .split('\n')
      .map((l, i) => (i === 0 ? l : l.startsWith(' '.repeat(indent)) ? l.slice(indent) : l))
      .join('\n')
  return strings
    .reduce((acc: string, s, i) => acc + strip(s) + (i < values.length ? values[i] : ''), '')
    .trim()
}
