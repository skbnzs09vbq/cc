const ZERO_WIDTH = /[​-‏︀-️̀-ͯ]/u
const FULL_WIDTH =
  /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}/u

export function displayWidth(text: string): number {
  return [...text].reduce((width, char) => {
    if (ZERO_WIDTH.test(char)) return width
    return width + (FULL_WIDTH.test(char) ? 2 : 1)
  }, 0)
}

export function truncate(text: string, max: number): string {
  const chars = [...text]
  let width = 0
  let cut = 0

  while (cut < chars.length && width + displayWidth(chars[cut]) <= max - 1) {
    width += displayWidth(chars[cut])
    cut++
  }

  return cut === chars.length ? text : `${chars.slice(0, cut).join('')}…`
}

const NUMERIC = /^[\d.,%+-]+$/

export function boxTable(header: string[], rows: string[][], separatorBefore: number[] = []): string {
  const all = [header, ...rows]
  const widths = header.map((_, col) => Math.max(...all.map((r) => displayWidth(r[col] ?? ''))))

  const pad = (text: string, col: number) => {
    const space = ' '.repeat(widths[col] - displayWidth(text))
    return NUMERIC.test(text.trim()) ? `${space}${text}` : `${text}${space}`
  }
  const line = (left: string, mid: string, right: string) =>
    left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right
  const row = (cells: string[]) =>
    `│ ${cells.map((c, i) => pad(c ?? '', i)).join(' │ ')} │`

  return [
    line('┌', '┬', '┐'),
    row(header),
    line('├', '┼', '┤'),
    ...rows.flatMap((r, i) =>
      separatorBefore.includes(i) ? [line('├', '┼', '┤'), row(r)] : [row(r)],
    ),
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
