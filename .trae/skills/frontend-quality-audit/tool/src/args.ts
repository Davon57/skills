import path from 'node:path'
import { AuditCliOptions, OutputFormat } from './types.js'

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.css', '.scss']

function normalizeExtension(value: string): string {
  return value.startsWith('.') ? value.toLowerCase() : `.${value.toLowerCase()}`
}

function isSkillDirectory(targetPath: string): boolean {
  const normalizedPath = path.resolve(targetPath).replaceAll('\\', '/').toLowerCase()
  return normalizedPath.includes('/.trae/skills/')
}

function looksLikeDirectoryPath(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  return value.includes('\\') || value.includes('/') || value.startsWith('.')
}

function parseOutputFormat(value: string | undefined): OutputFormat {
  if (value === 'md' || value === 'html' || value === 'both') {
    return value
  }

  return 'both'
}

export function parseCliArgs(argv: string[]): AuditCliOptions {
  const [command = 'audit', ...rest] = argv
  const optionMap = new Map<string, string>()
  const positionalArguments: string[] = []

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index]
    if (!current.startsWith('--')) {
      positionalArguments.push(current)
      continue
    }

    const nextValue = rest[index + 1]
    if (typeof nextValue === 'string' && !nextValue.startsWith('--')) {
      optionMap.set(current, nextValue)
      index += 1
    } else {
      optionMap.set(current, 'true')
    }
  }

  const projectPathInput = optionMap.get('--projectPath') ?? optionMap.get('--project') ?? positionalArguments[0]
  if (!projectPathInput && isSkillDirectory(process.cwd())) {
    throw new Error('请显式传入 --projectPath，被审计项目目录不能默认落到 skills 目录。')
  }

  const projectPath = projectPathInput ?? process.cwd()
  const positionalOutputBaseName = looksLikeDirectoryPath(positionalArguments[2]) && positionalArguments[3] ? positionalArguments[3] : positionalArguments[2]
  const positionalOutputDirectory = looksLikeDirectoryPath(positionalArguments[2]) ? positionalArguments[2] : positionalArguments[3]
  const outputDirectoryInput = optionMap.get('--outputDir') ?? optionMap.get('--reportDir') ?? positionalOutputDirectory
  const includeExtensions = (optionMap.get('--includeExtensions') ?? DEFAULT_EXTENSIONS.join(','))
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map(normalizeExtension)

  return {
    command: command === 'audit' ? 'audit' : 'audit',
    projectPath: path.resolve(projectPath),
    outputFormat: parseOutputFormat(optionMap.get('--outputFormat') ?? positionalArguments[1]),
    outputBaseName: optionMap.get('--outputBaseName') ?? positionalOutputBaseName,
    outputDirectory: outputDirectoryInput ? path.resolve(outputDirectoryInput) : undefined,
    includeExtensions
  }
}
