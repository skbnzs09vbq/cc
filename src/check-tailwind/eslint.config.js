import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss'
import tseslint from 'typescript-eslint'

const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'dist', '.git', 'out', 'coverage'])
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function findTailwindEntryPoints(dir) {
  const entries = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) {
      if (SKIP_DIRS.has(name.name)) continue
      entries.push(...findTailwindEntryPoints(join(dir, name.name)))
      continue
    }
    if (!name.name.endsWith('.css')) continue
    const filePath = join(dir, name.name)
    if (readFileSync(filePath, 'utf-8').includes('@import "tailwindcss"')) {
      entries.push(filePath)
    }
  }
  return entries
}

function findPackageRoot(cssEntryDir) {
  let dir = cssEntryDir
  while (dir !== REPO_ROOT && dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir
    dir = dirname(dir)
  }
  return REPO_ROOT
}

const entryPoints = findTailwindEntryPoints(REPO_ROOT).map((cssEntry) => {
  const appRootAbs = findPackageRoot(dirname(cssEntry))
  return {
    appRoot: relative(process.cwd(), appRootAbs),
    entryPoint: relative(appRootAbs, cssEntry),
  }
})

export default entryPoints.map(({ appRoot, entryPoint }) => ({
  files: [`${appRoot}/**/*.{ts,tsx}`],
  plugins: { 'better-tailwindcss': eslintPluginBetterTailwindcss },
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  settings: {
    'better-tailwindcss': { cwd: appRoot, entryPoint, rootFontSize: 16 },
  },
  rules: {
    'better-tailwindcss/enforce-canonical-classes': 'warn',
  },
}))
