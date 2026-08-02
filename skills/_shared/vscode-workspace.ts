import { VSCODE_WORKSPACE_FILE } from '../../local/project.js'
import { readFile, writeFile } from './complete.js'

type Workspace = { folders: { path: string; name?: string }[] }

function readWorkspace(): Workspace | null {
  if (!VSCODE_WORKSPACE_FILE) return null
  const content = readFile(VSCODE_WORKSPACE_FILE)
  return content ? JSON.parse(content) : null
}

export function addWorkspaceFolder(path: string, name: string): void {
  const workspace = readWorkspace()
  if (!workspace) return

  const alreadyAdded = workspace.folders.some((folder) => folder.path === path)
  if (alreadyAdded) return

  workspace.folders.push({ path, name })
  writeFile(VSCODE_WORKSPACE_FILE, JSON.stringify(workspace, null, 2))
}

export function removeWorkspaceFolder(path: string): void {
  const workspace = readWorkspace()
  if (!workspace) return

  const before = workspace.folders.length
  workspace.folders = workspace.folders.filter((folder) => folder.path !== path)
  if (workspace.folders.length !== before)
    writeFile(VSCODE_WORKSPACE_FILE, JSON.stringify(workspace, null, 2))
}
