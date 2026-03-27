import fs from 'node:fs/promises'
import path from 'node:path'
import { WorkspaceFile, WorkspaceSnapshot } from './types.js'

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  '.turbo'
])

async function collectFiles(
  rootPath: string,
  currentPath: string,
  includeExtensions: string[],
  bucket: WorkspaceFile[]
): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true })

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        await collectFiles(rootPath, absolutePath, includeExtensions, bucket)
      }
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const extension = path.extname(entry.name).toLowerCase()
    if (!includeExtensions.includes(extension)) {
      continue
    }

    const content = await fs.readFile(absolutePath, 'utf8')
    const lines = content.length === 0 ? [] : content.split(/\r?\n/u)
    const lineCount = lines.length
    bucket.push({
      absolutePath,
      relativePath: path.relative(rootPath, absolutePath),
      extension,
      content,
      lines,
      lineCount
    })
  }
}

export async function createWorkspaceSnapshot(
  projectPath: string,
  includeExtensions: string[]
): Promise<WorkspaceSnapshot> {
  const files: WorkspaceFile[] = []
  await collectFiles(projectPath, projectPath, includeExtensions, files)

  const totalLines = files.reduce((sum, item) => sum + item.lineCount, 0)

  return {
    projectPath,
    fileCount: files.length,
    totalLines,
    files
  }
}
