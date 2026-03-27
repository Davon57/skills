import path from 'node:path'
import {
  AuditAnalysis,
  AuditFinding,
  AuditPriority,
  AuditResources,
  AuditedFile,
  BusinessOversizedFile,
  CleanupCandidate,
  CleanupRange,
  DirectoryStat,
  DuplicateFunctionGroup,
  DuplicateImportMetric,
  FileDomain,
  FileMetricCount,
  FileMetricNames,
  FileSizeMetric,
  FunctionFingerprintEntry,
  FunctionOccurrence,
  FrameworkObservation,
  IssueCard,
  MixedResponsibilityFile,
  QuickWin,
  RefactorTarget,
  RoadmapItem,
  ReuseCase,
  SimilarFunctionCluster,
  SplitSuggestion,
  ToolingMetadata,
  WorkspaceFile,
  WorkspaceSnapshot
} from './types.js'

const SINGLE_LETTER_WHITELIST = new Set(['i', 'j', 'k', 'x', 'y', 'z'])

function formatTemplate(template: string, values: Array<string | number>): string {
  return values.reduce<string>((result, value, index) => result.replaceAll(`{${index}}`, String(value)), template)
}

function countMatches(content: string, pattern: RegExp): number {
  return Array.from(content.matchAll(pattern)).length
}

function sortByCountDesc<T extends { count: number; file: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => right.count - left.count || left.file.localeCompare(right.file))
}

function sortByRiskDesc<T extends { risk: number; lineCount: number; relativePath: string }>(items: T[]): T[] {
  return [...items].sort(
    (left, right) => right.risk - left.risk || right.lineCount - left.lineCount || left.relativePath.localeCompare(right.relativePath)
  )
}

function sortByLinesDesc<T extends { lines: number; file: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file))
}

function sortByCategoryDesc(items: MixedResponsibilityFile[]): MixedResponsibilityFile[] {
  return [...items].sort((left, right) => right.categoryCount - left.categoryCount || left.file.localeCompare(right.file))
}

function clampScore(value: number): number {
  if (value < 0) {
    return 0
  }

  if (value > 100) {
    return 100
  }

  return Math.round(value)
}

function getGrade(score: number, bands: AuditResources['rubric']['gradeBands']): string {
  return bands.find((band) => score >= band.min && score <= band.max)?.grade ?? 'E'
}

function getDirectoryBucketName(relativePath: string, rootDirectory: string): string {
  const segments = relativePath.split(/[\\/]/u)
  return segments.length <= 1 ? rootDirectory : segments[0]
}

function getFileDomain(relativePath: string): FileDomain {
  const normalizedPath = relativePath.replaceAll('\\', '/').toLowerCase()

  if (/(^|\/)(pages|page|views|view|routes)\//u.test(normalizedPath)) {
    return 'page'
  }

  if (/(^|\/)(components|component)\//u.test(normalizedPath)) {
    return 'component'
  }

  if (/(^|\/)(hooks|composables)\//u.test(normalizedPath)) {
    return 'hooks'
  }

  if (/(^|\/)(services|service|api)\//u.test(normalizedPath)) {
    return 'service'
  }

  if (/(^|\/)(store|stores|state)\//u.test(normalizedPath)) {
    return 'store'
  }

  return 'general'
}

function getResponsibilityTags(file: WorkspaceFile, resources: AuditResources): string[] {
  const tags = new Set<string>()
  const isViewFile = ['.tsx', '.jsx', '.vue'].includes(file.extension)

  if (isViewFile || /return\s*\(.*?</su.test(file.content)) {
    tags.add(resources.locale.responsibilityTags.view)
  }

  if (/\buse(State|Effect|Memo|Callback|Reducer|Ref)\b/u.test(file.content) || /\bset[A-Z]\w+\b/u.test(file.content)) {
    tags.add(resources.locale.responsibilityTags.state)
  }

  if (/\b(fetch|axios|request|get|post|put|delete)\b/u.test(file.content) || /\/api\//u.test(file.content)) {
    tags.add(resources.locale.responsibilityTags.api)
  }

  if (/\b(interface|type)\s+[A-Z]/u.test(file.content) || /\benum\s+[A-Z]/u.test(file.content)) {
    tags.add(resources.locale.responsibilityTags.types)
  }

  if (/\bconst\s+[A-Z0-9_]{2,}\b/u.test(file.content)) {
    tags.add(resources.locale.responsibilityTags.constants)
  }

  if (/\b(format|map|filter|sort|reduce|transform|parse)\b/u.test(file.content)) {
    tags.add(resources.locale.responsibilityTags.utils)
  }

  if (/\buseNavigate\b|\buseRouter\b|\bcreateBrowserRouter\b|\bRoute\b/u.test(file.content)) {
    tags.add(resources.locale.responsibilityTags.routing)
  }

  return [...tags]
}

function getSplitRecommendations(file: WorkspaceFile, resources: AuditResources): string[] {
  const suggestions = new Set<string>()
  const isViewFile = ['.tsx', '.jsx', '.vue'].includes(file.extension)
  const hasJsx = isViewFile && /return\s*\(.*?</su.test(file.content)
  const hasHooks = /\buse(State|Effect|Memo|Callback|Reducer|Ref)\b/u.test(file.content)
  const hasApiCalls = /\b(fetch|axios|request|get|post|put|delete)\b/u.test(file.content) || /\/api\//u.test(file.content)
  const hasTypes = /\b(interface|type)\s+[A-Z]/u.test(file.content)
  const hasConstants = /\bconst\s+[A-Z0-9_]{2,}\b/u.test(file.content) || /\benum\s+[A-Z]/u.test(file.content)
  const hasUtils = /\b(format|map|filter|sort|reduce|transform|parse)\b/u.test(file.content)

  if (!isViewFile) {
    suggestions.add(resources.locale.splitRecommendations.extractAnalysisPhases)
    suggestions.add(resources.locale.splitRecommendations.extractRenderPipeline)
    if (hasUtils || file.lineCount >= 600) {
      suggestions.add(resources.locale.splitRecommendations.extractUtils)
    }
    return [...suggestions]
  }

  if (hasJsx) {
    suggestions.add(resources.locale.splitRecommendations.extractUiSections)
  }

  if (hasHooks) {
    suggestions.add(resources.locale.splitRecommendations.extractHooks)
  }

  if (hasApiCalls) {
    suggestions.add(resources.locale.splitRecommendations.extractServices)
  }

  if (hasTypes) {
    suggestions.add(resources.locale.splitRecommendations.extractTypes)
  }

  if (hasConstants) {
    suggestions.add(resources.locale.splitRecommendations.extractConstants)
  }

  if (hasUtils || file.lineCount >= 600) {
    suggestions.add(resources.locale.splitRecommendations.extractUtils)
  }

  if (suggestions.size === 0) {
    suggestions.add(resources.locale.splitRecommendations.keepEntryLean)
  }

  return [...suggestions]
}

function getSingleLetterVariables(content: string): string[] {
  const matches = Array.from(content.matchAll(/\b(?:const|let|var)\s+([A-Za-z])\b/gmu))
  return matches
    .map((match) => match[1])
    .filter((value) => !SINGLE_LETTER_WHITELIST.has(value))
}

function getDuplicateImports(file: WorkspaceFile): DuplicateImportMetric[] {
  const importMatches = Array.from(file.content.matchAll(/^\s*import\s+.*?from\s+['"]([^'"]+)['"]\s*;?\s*$/gmu))
  const moduleCounts = new Map<string, number>()

  for (const match of importMatches) {
    const moduleName = match[1]
    moduleCounts.set(moduleName, (moduleCounts.get(moduleName) ?? 0) + 1)
  }

  return [...moduleCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([module, count]) => ({
      file: file.relativePath,
      module,
      count
    }))
}

function getCommentedCodeCount(lines: string[]): number {
  return lines.reduce((count, line) => {
    const trimmed = line.trim()
    if (/^\/\//u.test(trimmed) && /\b(const|let|var|function|return|if|for|while|import|export|class)\b/u.test(trimmed)) {
      return count + 1
    }

    return count
  }, 0)
}

function normalizeCommentContent(line: string): string {
  return line
    .trim()
    .replace(/^\/\//u, '')
    .replace(/^\/\*/u, '')
    .replace(/^\*/u, '')
    .replace(/\*\/$/u, '')
    .trim()
}

function isCommentedCodeLine(line: string): boolean {
  const trimmed = line.trim()
  if (!/^(\/\/|\/\*|\*|\*\/)/u.test(trimmed)) {
    return false
  }

  const content = normalizeCommentContent(trimmed)
  if (content.length === 0) {
    return false
  }

  return /(\bconst\b|\blet\b|\bvar\b|\bfunction\b|\breturn\b|\bif\b|\bfor\b|\bwhile\b|\bimport\b|\bexport\b|\bclass\b|\bawait\b|=>|<\/?[A-Za-z][^>]*>|\{|\}|\)|\()/u.test(
    content
  )
}

function extractUnusedCodeRanges(lines: string[]): CleanupRange[] {
  const ranges: CleanupRange[] = []
  let start: number | null = null
  let end = 0

  const pushCurrentRange = (): void => {
    if (start === null) {
      return
    }

    const lineCount = end - start + 1
    if (lineCount >= 3) {
      ranges.push({
        lineStart: start,
        lineEnd: end,
        lineCount,
        reason: '疑似整段注释旧代码'
      })
    }
    start = null
    end = 0
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (isCommentedCodeLine(lines[index])) {
      if (start === null) {
        start = index + 1
      }
      end = index + 1
      continue
    }

    pushCurrentRange()
  }

  pushCurrentRange()
  return ranges
}

function extractFunctionNames(content: string): string[] {
  return [...new Set(extractFunctionOccurrences(content.split(/\r?\n/u)).map((item) => item.name))]
}

function extractFunctionOccurrences(lines: string[]): FunctionOccurrence[] {
  const occurrences: FunctionOccurrence[] = []
  const startPattern = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(|^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>|^\s*([A-Za-z_]\w*)\s*:\s*(?:async\s*)?function\s*\(/u

  for (let index = 0; index < lines.length; index += 1) {
    const match = startPattern.exec(lines[index])
    const functionName = match?.[1] ?? match?.[2] ?? match?.[3]
    if (!functionName || functionName.length < 3) {
      continue
    }

    let lineEnd = index + 1
    let depth = 0
    let started = false

    for (let cursor = index; cursor < Math.min(lines.length, index + 80); cursor += 1) {
      const currentLine = lines[cursor]
      depth += (currentLine.match(/\{/gmu) ?? []).length
      depth -= (currentLine.match(/\}/gmu) ?? []).length
      if (currentLine.includes('{')) {
        started = true
      }

      lineEnd = cursor + 1
      if (started && depth <= 0 && cursor > index) {
        break
      }
    }

    occurrences.push({
      name: functionName,
      lineStart: index + 1,
      lineEnd
    })
  }

  return occurrences
}

function normalizeFunctionSnippet(snippet: string): string {
  return snippet
    .replaceAll(/(['"`])(?:\\.|(?!\1).)*\1/gmu, 'S')
    .replaceAll(/\b\d+\b/gmu, 'N')
    .replaceAll(/\b[a-zA-Z_]\w*\b/gmu, (token) => {
      if (['if', 'for', 'while', 'return', 'const', 'let', 'var', 'function', 'async', 'await', 'try', 'catch', 'switch'].includes(token)) {
        return token
      }

      return token.length <= 2 ? token : 'ID'
    })
    .replaceAll(/\s+/gmu, ' ')
    .trim()
}

function extractFunctionFingerprintEntries(lines: string[]): FunctionFingerprintEntry[] {
  const occurrences = extractFunctionOccurrences(lines)
  const entries: FunctionFingerprintEntry[] = []

  for (const occurrence of occurrences) {
    const snippetLines = lines
      .slice(occurrence.lineStart - 1, Math.min(lines.length, occurrence.lineStart - 1 + 24))
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const fingerprint = normalizeFunctionSnippet(snippetLines.join(' '))
    if (fingerprint.length >= 80) {
      entries.push({
        name: occurrence.name,
        fingerprint,
        lineStart: occurrence.lineStart,
        lineEnd: occurrence.lineEnd
      })
    }
  }

  return entries
}

function extractFunctionFingerprints(lines: string[]): string[] {
  return extractFunctionFingerprintEntries(lines).map((item) => `${item.name}::${item.fingerprint}`)
}

function getBusinessType(file: AuditedFile): string {
  if (file.extension === '.vue') {
    return file.fileDomain === 'page' ? 'Vue 页面' : 'Vue 组件'
  }

  if (file.extension === '.tsx' || file.extension === '.jsx') {
    return file.fileDomain === 'page' ? '页面组件' : '业务组件'
  }

  if (file.fileDomain === 'service') {
    return '服务模块'
  }

  if (file.fileDomain === 'store') {
    return '状态模块'
  }

  if (file.fileDomain === 'hooks') {
    return '复用逻辑'
  }

  if (file.fileDomain === 'page') {
    return '页面脚本'
  }

  if (file.fileDomain === 'component') {
    return '组件脚本'
  }

  return '业务脚本'
}

function isBusinessFile(file: AuditedFile): boolean {
  if (['.vue', '.tsx', '.jsx'].includes(file.extension)) {
    return true
  }

  if (!['.ts', '.js'].includes(file.extension)) {
    return false
  }

  const normalizedPath = file.relativePath.replaceAll('\\', '/').toLowerCase()
  if (/(^|\/)(views|view|pages|page|routes|components|component|features|feature|modules|module|composables|hooks|services|service|api|store|stores|state|src)\//u.test(normalizedPath)) {
    return true
  }

  return file.fileDomain !== 'general'
}

function getBusinessPriority(file: AuditedFile): number {
  if (file.extension === '.vue') {
    return 0
  }

  if (file.extension === '.tsx' || file.extension === '.jsx') {
    return 1
  }

  if (file.extension === '.ts' || file.extension === '.js') {
    return 2
  }

  return 3
}

function createOversizedBusinessFiles(files: AuditedFile[]): BusinessOversizedFile[] {
  return files
    .filter((file) => file.lineCount >= 800 && isBusinessFile(file))
    .sort((left, right) => {
      const priorityGap = getBusinessPriority(left) - getBusinessPriority(right)
      if (priorityGap !== 0) {
        return priorityGap
      }

      return right.lineCount - left.lineCount || left.relativePath.localeCompare(right.relativePath)
    })
    .slice(0, 30)
    .map((file) => ({
      file: file.relativePath,
      lines: file.lineCount,
      extension: file.extension,
      domain: file.fileDomain,
      businessType: getBusinessType(file),
      summary: file.summary.length > 0 ? file.summary : '文件超大，建议优先拆分业务边界'
    }))
}

function createCleanupCandidates(files: AuditedFile[]): CleanupCandidate[] {
  return files
    .map((file) => {
      const ranges = file.cleanupRanges
      const debugCount = file.consoleCount + file.debuggerCount + file.disabledDirectiveCount
      const duplicateImportCount = file.duplicateImports.length
      const unusedBlockLineCount = ranges.reduce((total, item) => total + item.lineCount, 0)
      const cleanupScore =
        unusedBlockLineCount * 3 +
        file.commentedCodeCount * 2 +
        file.todoCount * 2 +
        debugCount * 2 +
        duplicateImportCount * 2

      const parts: string[] = []
      if (ranges.length > 0) {
        parts.push(`疑似未删除代码 ${ranges.map((item) => `L${item.lineStart}-L${item.lineEnd}`).join('、')}`)
      }
      if (file.commentedCodeCount > 0) {
        parts.push(`疑似注释代码 ${file.commentedCodeCount} 行`)
      }
      if (file.todoCount > 0) {
        parts.push(`TODO/FIXME ${file.todoCount} 处`)
      }
      if (debugCount > 0) {
        parts.push(`临时调试或跳过检查 ${debugCount} 处`)
      }
      if (duplicateImportCount > 0) {
        parts.push(`重复导入 ${duplicateImportCount} 组`)
      }

      return {
        file: file.relativePath,
        cleanupScore,
        unusedBlockLineCount,
        commentedCodeCount: file.commentedCodeCount,
        todoCount: file.todoCount,
        consoleCount: file.consoleCount,
        debuggerCount: file.debuggerCount,
        disabledDirectiveCount: file.disabledDirectiveCount,
        debugCount,
        duplicateImportCount,
        ranges,
        summary: parts.join('，')
      }
    })
    .filter((item) => item.cleanupScore > 0 && item.ranges.length > 0)
    .sort((left, right) => right.cleanupScore - left.cleanupScore || left.file.localeCompare(right.file))
    .slice(0, 30)
}

function createDuplicateFunctionGroups(files: AuditedFile[]): DuplicateFunctionGroup[] {
  const functionMap = new Map<string, { files: string[]; locations: string[] }>()

  for (const file of files.filter((item) => isBusinessFile(item))) {
    for (const occurrence of file.functionOccurrences) {
      const current = functionMap.get(occurrence.name) ?? { files: [], locations: [] }
      current.files.push(file.relativePath)
      current.locations.push(`${file.relativePath}:L${occurrence.lineStart}-L${occurrence.lineEnd}`)
      functionMap.set(occurrence.name, current)
    }
  }

  return [...functionMap.entries()]
    .map(([name, data]) => ({
      name,
      fileCount: new Set(data.files).size,
      occurrenceCount: data.locations.length,
      files: [...new Set(data.files)].sort((left, right) => left.localeCompare(right)),
      locations: data.locations.sort((left, right) => left.localeCompare(right)),
      summary: `函数名 ${name} 在 ${new Set(data.files).size} 个文件中重复出现，建议人工核查是否可以抽公共能力`
    }))
    .filter((item) => item.fileCount >= 2)
    .sort((left, right) => right.fileCount - left.fileCount || right.occurrenceCount - left.occurrenceCount || left.name.localeCompare(right.name))
}

function createSimilarFunctionClusters(files: AuditedFile[]): SimilarFunctionCluster[] {
  const fingerprintMap = new Map<string, { name: string; files: string[]; locations: string[] }>()

  for (const file of files.filter((item) => isBusinessFile(item))) {
    for (const block of file.functionFingerprintEntries) {
      const current = fingerprintMap.get(block.fingerprint) ?? { name: block.name, files: [], locations: [] }
      current.files.push(file.relativePath)
      current.locations.push(`${file.relativePath}:L${block.lineStart}-L${block.lineEnd}`)
      fingerprintMap.set(block.fingerprint, current)
    }
  }

  return [...fingerprintMap.values()]
    .map((item) => ({
      name: item.name,
      fileCount: new Set(item.files).size,
      occurrenceCount: item.files.length,
      files: [...new Set(item.files)].sort((left, right) => left.localeCompare(right)),
      locations: item.locations.sort((left, right) => left.localeCompare(right)),
      summary: `函数块 ${item.name} 在多个文件中结构相近，建议人工比对后抽成公共方法或 hooks`
    }))
    .filter((item) => item.fileCount >= 2)
    .sort((left, right) => right.fileCount - left.fileCount || right.occurrenceCount - left.occurrenceCount || left.name.localeCompare(right.name))
}

function createReuseCases(
  duplicateFunctionGroups: DuplicateFunctionGroup[],
  similarFunctionClusters: SimilarFunctionCluster[],
  mixedResponsibilityFiles: MixedResponsibilityFile[]
): ReuseCase[] {
  const duplicateCases: ReuseCase[] = duplicateFunctionGroups.map((item) => ({
    kind: 'duplicate',
    title: `重复函数：${item.name}`,
    locations: item.locations,
    recommendation: '建议评估是否可以抽成公共方法或工具函数',
    summary: item.summary
  }))

  const similarCases: ReuseCase[] = similarFunctionClusters.map((item) => ({
    kind: 'similar',
    title: `相似逻辑：${item.name}`,
    locations: item.locations,
    recommendation: '建议评估是否可以抽成公共 hooks、组合函数或服务层方法',
    summary: item.summary
  }))

  const mixedCases: ReuseCase[] = mixedResponsibilityFiles.slice(0, 10).map((item) => ({
    kind: 'mixed',
    title: `职责混杂：${item.file}`,
    locations: [item.file],
    recommendation: '建议按视图、状态、接口、工具逻辑拆分文件',
    summary: item.summary
  }))

  return [...duplicateCases, ...similarCases, ...mixedCases]
    .sort((left, right) => right.locations.length - left.locations.length || left.title.localeCompare(right.title))
    .slice(0, 30)
}

function createFileAudit(file: WorkspaceFile, resources: AuditResources): {
  auditedFile: AuditedFile
  largeFile?: FileSizeMetric
  veryLargeFile?: FileSizeMetric
  singleLetterMetric?: FileMetricNames
  consoleMetric?: FileMetricCount
  debuggerMetric?: FileMetricCount
  disabledMetric?: FileMetricCount
  todoMetric?: FileMetricCount
  commentedMetric?: FileMetricCount
  longLineMetric?: FileMetricCount
  duplicateImportMetrics: DuplicateImportMetric[]
  splitSuggestion?: SplitSuggestion
  mixedResponsibilityFile?: MixedResponsibilityFile
  frameworkObservations: FrameworkObservation[]
  directoryKey: string
} {
  const thresholds = resources.rubric.thresholds
  const singleLetterVariables = getSingleLetterVariables(file.content)
  const consoleCount = countMatches(file.content, /\bconsole\.(log|debug|info|warn|error|trace)\s*\(/gmu)
  const debuggerCount = countMatches(file.content, /\bdebugger\b/gmu)
  const disabledDirectiveCount = countMatches(file.content, /(eslint-disable|@ts-ignore|@ts-nocheck)/gmu)
  const todoCount = countMatches(file.content, /\b(TODO|FIXME)\b/gimu)
  const commentedCodeCount = getCommentedCodeCount(file.lines)
  const longLineCount = file.lines.filter((line) => line.length > thresholds.longLineLength).length
  const duplicateImportMetrics = getDuplicateImports(file)
  const responsibilityTags = getResponsibilityTags(file, resources)
  const fileDomain = getFileDomain(file.relativePath)
  const functionNames = extractFunctionNames(file.content)
  const functionOccurrences = extractFunctionOccurrences(file.lines)
  const functionFingerprintEntries = extractFunctionFingerprintEntries(file.lines)
  const functionFingerprints = extractFunctionFingerprints(file.lines)
  const cleanupRanges = extractUnusedCodeRanges(file.lines)
  const splitSuggestions = file.lineCount >= thresholds.largeFileLines ? getSplitRecommendations(file, resources) : []
  const duplicateImportCount = duplicateImportMetrics.length

  let risk = 0
  risk += Math.floor(file.lineCount / 120)
  risk += singleLetterVariables.length * 2
  risk += consoleCount * 2
  risk += debuggerCount * 4
  risk += disabledDirectiveCount * 4
  risk += todoCount
  risk += commentedCodeCount * 2
  risk += longLineCount
  risk += duplicateImportCount * 3

  const summaryItems: string[] = []
  if (file.lineCount >= thresholds.largeFileLines) {
    summaryItems.push(resources.locale.summaryTokens.largeFile)
  }
  if (singleLetterVariables.length > 0) {
    summaryItems.push(formatTemplate(resources.locale.summaryTokens.singleLetterVariables, [singleLetterVariables.length]))
  }
  if (disabledDirectiveCount > 0) {
    summaryItems.push(formatTemplate(resources.locale.summaryTokens.disabledRules, [disabledDirectiveCount]))
  }
  if (consoleCount > 0 || debuggerCount > 0) {
    summaryItems.push(formatTemplate(resources.locale.summaryTokens.debugLeftovers, [consoleCount + debuggerCount]))
  }
  if (longLineCount > 0) {
    summaryItems.push(formatTemplate(resources.locale.summaryTokens.longLines, [longLineCount]))
  }
  if (todoCount > 0) {
    summaryItems.push(formatTemplate(resources.locale.summaryTokens.todoFixme, [todoCount]))
  }

  const mixedResponsibilityFile =
    responsibilityTags.length >= 3
      ? {
          file: file.relativePath,
          categoryCount: responsibilityTags.length,
          tags: responsibilityTags,
          summary: formatTemplate(resources.locale.patterns.mixedResponsibilitySummary, [
            file.relativePath,
            responsibilityTags.length,
            responsibilityTags.join(', ')
          ])
        }
      : undefined

  const frameworkObservations: FrameworkObservation[] = []
  const hasViewTag = responsibilityTags.includes(resources.locale.responsibilityTags.view)
  const hasApiTag = responsibilityTags.includes(resources.locale.responsibilityTags.api)
  const pushFrameworkObservation = (rule: string): void => {
    frameworkObservations.push({
      file: file.relativePath,
      rule,
      status: resources.locale.frameworkStatuses.hit,
      summary: formatTemplate(resources.locale.patterns.frameworkRuleSummary, [
        file.relativePath,
        rule,
        resources.locale.frameworkStatuses.hit
      ])
    })
  }

  if ((fileDomain === 'page' || fileDomain === 'component') && hasApiTag) {
    pushFrameworkObservation(resources.locale.frameworkRules.viewWithApi)
  }
  if (fileDomain === 'service' && hasViewTag) {
    pushFrameworkObservation(resources.locale.frameworkRules.serviceWithView)
  }
  if (fileDomain === 'store' && hasViewTag) {
    pushFrameworkObservation(resources.locale.frameworkRules.storeWithView)
  }
  if ((fileDomain === 'page' || fileDomain === 'component') && file.lineCount >= thresholds.largeFileLines) {
    pushFrameworkObservation(resources.locale.frameworkRules.oversizedView)
  }
  if (fileDomain === 'hooks' && !/\buse[A-Z]\w+\b/u.test(file.content)) {
    pushFrameworkObservation(resources.locale.frameworkRules.hookBoundaryWeak)
  }

  return {
    auditedFile: {
      relativePath: file.relativePath,
      lineCount: file.lineCount,
      risk,
      summary: summaryItems.join(', '),
      fileDomain,
      responsibilityTags,
      splitSuggestions,
      singleLetterVariables,
      consoleCount,
      debuggerCount,
      disabledDirectiveCount,
      todoCount,
      commentedCodeCount,
      longLineCount,
      duplicateImports: duplicateImportMetrics,
      functionNames,
      functionFingerprints,
      functionOccurrences,
      functionFingerprintEntries,
      cleanupRanges,
      extension: file.extension
    },
    largeFile:
      file.lineCount >= thresholds.largeFileLines
        ? {
            file: file.relativePath,
            lines: file.lineCount
          }
        : undefined,
    veryLargeFile:
      file.lineCount >= thresholds.veryLargeFileLines
        ? {
            file: file.relativePath,
            lines: file.lineCount
          }
        : undefined,
    singleLetterMetric:
      singleLetterVariables.length > 0
        ? {
            file: file.relativePath,
            count: singleLetterVariables.length,
            names: [...new Set(singleLetterVariables)]
          }
        : undefined,
    consoleMetric: consoleCount > 0 ? { file: file.relativePath, count: consoleCount } : undefined,
    debuggerMetric: debuggerCount > 0 ? { file: file.relativePath, count: debuggerCount } : undefined,
    disabledMetric: disabledDirectiveCount > 0 ? { file: file.relativePath, count: disabledDirectiveCount } : undefined,
    todoMetric: todoCount > 0 ? { file: file.relativePath, count: todoCount } : undefined,
    commentedMetric: commentedCodeCount > 0 ? { file: file.relativePath, count: commentedCodeCount } : undefined,
    longLineMetric: longLineCount > 0 ? { file: file.relativePath, count: longLineCount } : undefined,
    duplicateImportMetrics,
    splitSuggestion:
      splitSuggestions.length > 0
        ? {
            file: file.relativePath,
            lines: file.lineCount,
            suggestions: splitSuggestions
          }
        : undefined,
    mixedResponsibilityFile,
    frameworkObservations,
    directoryKey: getDirectoryBucketName(file.relativePath, resources.locale.general.rootDirectory)
  }
}

function sumCounts(items: FileMetricCount[]): number {
  return items.reduce((total, item) => total + item.count, 0)
}

function createFinding(definition: AuditResources['locale']['findings'][keyof AuditResources['locale']['findings']], severity: AuditFinding['severity'], evidence: string[]): AuditFinding {
  return {
    category: definition.category,
    severity,
    summary: definition.summary,
    evidence,
    impact: definition.impact,
    recommendation: definition.recommendation
  }
}

function createQuickWins(tooling: ToolingMetadata, analysis: Omit<AuditAnalysis, 'quickWins' | 'refactorTargets' | 'issueCards' | 'roadmap'>, resources: AuditResources): QuickWin[] {
  const quickWins: QuickWin[] = []

  sortByCountDesc(analysis.disabledDirectives)
    .slice(0, 3)
    .forEach((item) => {
      quickWins.push({
        priority: 'P0',
        file: item.file,
        action: resources.locale.actions.removeDisable,
        reason: formatTemplate(resources.locale.patterns.disabledDirectives, [item.file, item.count])
      })
    })

  sortByCountDesc(analysis.debuggerStatements)
    .slice(0, 2)
    .forEach((item) => {
      quickWins.push({
        priority: 'P0',
        file: item.file,
        action: resources.locale.actions.clearDebugger,
        reason: formatTemplate(resources.locale.patterns.debuggerStatements, [item.file, item.count])
      })
    })

  sortByCountDesc(analysis.consoleStatements)
    .slice(0, 2)
    .forEach((item) => {
      quickWins.push({
        priority: 'P1',
        file: item.file,
        action: resources.locale.actions.clearConsole,
        reason: formatTemplate(resources.locale.patterns.consoleStatements, [item.file, item.count])
      })
    })

  if (!tooling.hasEslintConfig || !tooling.scripts.includes('lint')) {
    quickWins.push({
      priority: 'P0',
      file: resources.locale.general.rootDirectory,
      action: resources.locale.actions.setupLint,
      reason: resources.locale.patterns.missingLintSummary
    })
  }

  if (tooling.language === 'TypeScript' && (!tooling.hasTsConfig || !tooling.scripts.includes('typecheck'))) {
    quickWins.push({
      priority: 'P0',
      file: resources.locale.general.rootDirectory,
      action: resources.locale.actions.setupTypecheck,
      reason: resources.locale.patterns.missingTypecheckSummary
    })
  }

  return quickWins.slice(0, 8)
}

function getRefactorPriority(risk: number): AuditPriority {
  if (risk >= 30) {
    return 'P0'
  }

  if (risk >= 18) {
    return 'P1'
  }

  return 'P2'
}

function createRefactorTargets(
  hotspots: AuditedFile[],
  splitSuggestions: SplitSuggestion[],
  mixedResponsibilityFiles: MixedResponsibilityFile[],
  resources: AuditResources
): RefactorTarget[] {
  return hotspots.slice(0, 8).map((hotspot) => {
    const splitMatch = splitSuggestions.find((item) => item.file === hotspot.relativePath)
    const mixedMatch = mixedResponsibilityFiles.find((item) => item.file === hotspot.relativePath)
    const nextAction = splitMatch?.suggestions[0] ?? (mixedMatch ? resources.locale.actions.splitByResponsibilities : resources.locale.actions.extractRepeatedLogic)
    const reason = hotspot.summary.length > 0 ? hotspot.summary : resources.locale.general.baseOnly

    return {
      priority: getRefactorPriority(hotspot.risk),
      file: hotspot.relativePath,
      risk: hotspot.risk,
      reason,
      nextAction
    }
  })
}

function createIssueCards(
  refactorTargets: RefactorTarget[],
  quickWins: QuickWin[],
  splitSuggestions: SplitSuggestion[],
  mixedResponsibilityFiles: MixedResponsibilityFile[],
  resources: AuditResources
): IssueCard[] {
  return refactorTargets.slice(0, 4).map((target) => {
    const splitMatch = splitSuggestions.find((item) => item.file === target.file)
    const mixedMatch = mixedResponsibilityFiles.find((item) => item.file === target.file)
    const quickWinMatch = quickWins.find((item) => item.file === target.file)
    const issueTags = target.reason
      .split(/,\s*/u)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    let whyPriority = resources.locale.priorityReasons.default
    if (target.risk >= 30) {
      whyPriority = resources.locale.priorityReasons.critical
    } else if (mixedMatch) {
      whyPriority = resources.locale.priorityReasons.mixed
    } else if (splitMatch) {
      whyPriority = resources.locale.priorityReasons.split
    } else if (quickWinMatch) {
      whyPriority = resources.locale.priorityReasons.quickFix
    }

    return {
      file: target.file,
      priority: target.priority,
      risk: target.risk,
      whyPriority,
      issueTags,
      primaryAction: quickWinMatch?.action ?? target.nextAction,
      splitPlan: splitMatch?.suggestions.slice(0, 3) ?? [target.nextAction]
    }
  })
}

function createRoadmap(quickWins: QuickWin[], refactorTargets: RefactorTarget[], resources: AuditResources): RoadmapItem[] {
  const quickWinFiles = [...new Set(quickWins.slice(0, 2).map((item) => item.file))]
  const refactorFiles = [...new Set(refactorTargets.slice(0, 2).map((item) => item.file))]

  return [
    {
      phase: 'P0',
      goal:
        quickWinFiles.length > 0
          ? formatTemplate(resources.locale.patterns.roadmapP0Summary, [quickWinFiles.join(', ')])
          : resources.locale.roadmap.p0
    },
    {
      phase: 'P1',
      goal:
        refactorFiles.length > 0
          ? formatTemplate(resources.locale.patterns.roadmapP1Summary, [refactorFiles.join(', ')])
          : resources.locale.roadmap.p1
    },
    {
      phase: 'P2',
      goal: resources.locale.roadmap.p2
    }
  ]
}

function createPrimaryRisks(
  largeFiles: FileSizeMetric[],
  singleLetterVariables: FileMetricNames[],
  disabledDirectives: FileMetricCount[],
  duplicateImports: DuplicateImportMetric[],
  resources: AuditResources
): string[] {
  const primaryRisks: string[] = []

  if (largeFiles.length > 0) {
    primaryRisks.push(formatTemplate(resources.locale.patterns.summaryLargeFiles, [largeFiles.length]))
  }

  const singleLetterTotal = singleLetterVariables.reduce((total, item) => total + item.count, 0)
  if (singleLetterTotal > 0) {
    primaryRisks.push(formatTemplate(resources.locale.patterns.summarySingleLetterVariables, [singleLetterTotal]))
  }

  const disabledTotal = sumCounts(disabledDirectives)
  if (disabledTotal > 0) {
    primaryRisks.push(formatTemplate(resources.locale.patterns.summaryDisabledDirectives, [disabledTotal]))
  }

  if (duplicateImports.length > 0) {
    primaryRisks.push(formatTemplate(resources.locale.patterns.summaryDuplicateImports, [duplicateImports.length]))
  }

  if (primaryRisks.length === 0) {
    primaryRisks.push(resources.locale.general.none)
  }

  return primaryRisks
}

function createFindings(
  tooling: ToolingMetadata,
  analysis: Omit<AuditAnalysis, 'findings' | 'quickWins' | 'refactorTargets' | 'issueCards' | 'roadmap'>,
  resources: AuditResources
): AuditFinding[] {
  const findings: AuditFinding[] = []

  if (analysis.veryLargeFiles.length > 0 || analysis.largeFiles.length > 2) {
    const evidenceSource = analysis.veryLargeFiles.length > 0 ? analysis.veryLargeFiles : analysis.largeFiles
    const evidence = sortByLinesDesc(evidenceSource)
      .slice(0, 5)
      .map((item) => formatTemplate(resources.locale.patterns.fileLines, [item.file, item.lines]))
    findings.push(createFinding(resources.locale.findings.architecture, 'high', evidence))
  }

  if (analysis.singleLetterVariables.length > 0) {
    const evidence = sortByCountDesc(analysis.singleLetterVariables)
      .slice(0, 5)
      .map((item) =>
        formatTemplate(resources.locale.patterns.singleLetterFile, [item.file, item.count, [...new Set(item.names)].join(', ')])
      )
    const singleLetterTotal = analysis.singleLetterVariables.reduce((total, item) => total + item.count, 0)
    findings.push(
      createFinding(
        resources.locale.findings.naming,
        singleLetterTotal >= resources.rubric.thresholds.singleLetterVariableCriticalCount ? 'high' : 'medium',
        evidence
      )
    )
  }

  if (
    analysis.consoleStatements.length > 0 ||
    analysis.debuggerStatements.length > 0 ||
    analysis.disabledDirectives.length > 0 ||
    analysis.commentedCode.length > 0
  ) {
    const evidence = [
      ...sortByCountDesc(analysis.consoleStatements)
        .slice(0, 3)
        .map((item) => formatTemplate(resources.locale.patterns.consoleStatements, [item.file, item.count])),
      ...sortByCountDesc(analysis.debuggerStatements)
        .slice(0, 3)
        .map((item) => formatTemplate(resources.locale.patterns.debuggerStatements, [item.file, item.count])),
      ...sortByCountDesc(analysis.disabledDirectives)
        .slice(0, 3)
        .map((item) => formatTemplate(resources.locale.patterns.disabledDirectives, [item.file, item.count])),
      ...sortByCountDesc(analysis.commentedCode)
        .slice(0, 3)
        .map((item) => formatTemplate(resources.locale.patterns.commentedCode, [item.file, item.count]))
    ]
    findings.push(createFinding(resources.locale.findings.hygiene, 'high', evidence))
  }

  if (analysis.duplicateImports.length > 0 || analysis.longLines.length > 0) {
    const evidence = [
      ...sortByCountDesc(analysis.duplicateImports)
        .slice(0, 5)
        .map((item) => formatTemplate(resources.locale.patterns.duplicateImports, [item.file, item.module, item.count])),
      ...sortByCountDesc(analysis.longLines)
        .slice(0, 5)
        .map((item) => formatTemplate(resources.locale.patterns.longLines, [item.file, item.count]))
    ]
    findings.push(createFinding(resources.locale.findings.maintainability, 'medium', evidence))
  }

  const toolingEvidence: string[] = []
  if (!tooling.hasPackageJson) {
    toolingEvidence.push(resources.locale.toolingEvidence.missingPackageJson)
  }
  if (!tooling.hasEslintConfig) {
    toolingEvidence.push(resources.locale.toolingEvidence.missingEslintConfig)
  }
  if (!tooling.hasTsConfig && tooling.language === 'TypeScript') {
    toolingEvidence.push(resources.locale.toolingEvidence.missingTsConfig)
  }
  if (!tooling.scripts.includes('lint')) {
    toolingEvidence.push(resources.locale.toolingEvidence.missingLintScript)
  }
  if (!tooling.scripts.includes('typecheck') && tooling.language === 'TypeScript') {
    toolingEvidence.push(resources.locale.toolingEvidence.missingTypecheckScript)
  }
  if (toolingEvidence.length > 0) {
    findings.push(createFinding(resources.locale.findings.tooling, 'high', toolingEvidence))
  }

  if (analysis.mixedResponsibilityFiles.length > 0) {
    findings.push(
      createFinding(
        resources.locale.findings.mixedResponsibilities,
        'high',
        sortByCategoryDesc(analysis.mixedResponsibilityFiles)
          .slice(0, 5)
          .map((item) => item.summary)
      )
    )
  }

  if (analysis.frameworkObservations.length > 0) {
    findings.push(
      createFinding(
        resources.locale.findings.frameworkSpecific,
        'medium',
        analysis.frameworkObservations.slice(0, 5).map((item) => item.summary)
      )
    )
  }

  return findings
}

function createToolingScore(tooling: ToolingMetadata): number {
  let penalty = 0

  if (!tooling.hasPackageJson) {
    penalty += 25
  }
  if (!tooling.hasTsConfig && tooling.language === 'TypeScript') {
    penalty += 20
  }
  if (!tooling.hasEslintConfig) {
    penalty += 20
  }
  if (!tooling.scripts.includes('lint')) {
    penalty += 15
  }
  if (!tooling.scripts.includes('typecheck') && tooling.language === 'TypeScript') {
    penalty += 12
  }
  if (!tooling.scripts.includes('test')) {
    penalty += 8
  }

  return clampScore(100 - penalty)
}

export function analyzeWorkspaceSnapshot(snapshot: WorkspaceSnapshot, tooling: ToolingMetadata, resources: AuditResources): AuditAnalysis {
  const auditedFiles: AuditedFile[] = []
  const largeFiles: FileSizeMetric[] = []
  const veryLargeFiles: FileSizeMetric[] = []
  const singleLetterVariables: FileMetricNames[] = []
  const consoleStatements: FileMetricCount[] = []
  const debuggerStatements: FileMetricCount[] = []
  const disabledDirectives: FileMetricCount[] = []
  const duplicateImports: DuplicateImportMetric[] = []
  const longLines: FileMetricCount[] = []
  const commentedCode: FileMetricCount[] = []
  const todoFixme: FileMetricCount[] = []
  const splitSuggestions: SplitSuggestion[] = []
  const mixedResponsibilityFiles: MixedResponsibilityFile[] = []
  const frameworkObservations: FrameworkObservation[] = []
  const directoryStats = new Map<string, DirectoryStat>()

  for (const file of snapshot.files) {
    const analysis = createFileAudit(file, resources)
    auditedFiles.push(analysis.auditedFile)

    if (analysis.largeFile) {
      largeFiles.push(analysis.largeFile)
      splitSuggestions.push(analysis.splitSuggestion ?? { file: file.relativePath, lines: file.lineCount, suggestions: [] })
    }
    if (analysis.veryLargeFile) {
      veryLargeFiles.push(analysis.veryLargeFile)
    }
    if (analysis.singleLetterMetric) {
      singleLetterVariables.push(analysis.singleLetterMetric)
    }
    if (analysis.consoleMetric) {
      consoleStatements.push(analysis.consoleMetric)
    }
    if (analysis.debuggerMetric) {
      debuggerStatements.push(analysis.debuggerMetric)
    }
    if (analysis.disabledMetric) {
      disabledDirectives.push(analysis.disabledMetric)
    }
    if (analysis.todoMetric) {
      todoFixme.push(analysis.todoMetric)
    }
    if (analysis.commentedMetric) {
      commentedCode.push(analysis.commentedMetric)
    }
    if (analysis.longLineMetric) {
      longLines.push(analysis.longLineMetric)
    }
    if (analysis.mixedResponsibilityFile) {
      mixedResponsibilityFiles.push(analysis.mixedResponsibilityFile)
    }

    duplicateImports.push(...analysis.duplicateImportMetrics)
    frameworkObservations.push(...analysis.frameworkObservations)

    const currentDirectoryStat = directoryStats.get(analysis.directoryKey) ?? {
      directory: analysis.directoryKey,
      fileCount: 0,
      risk: 0,
      largeFiles: 0
    }
    currentDirectoryStat.fileCount += 1
    currentDirectoryStat.risk += analysis.auditedFile.risk
    if (analysis.largeFile) {
      currentDirectoryStat.largeFiles += 1
    }
    directoryStats.set(analysis.directoryKey, currentDirectoryStat)
  }

  const architecturePenalty = largeFiles.length * 6 + veryLargeFiles.length * 12
  const namingPenalty = singleLetterVariables.reduce((total, item) => total + item.count, 0) * 2
  let hygienePenalty = sumCounts(consoleStatements) * 2
  hygienePenalty += sumCounts(debuggerStatements) * 6
  hygienePenalty += sumCounts(disabledDirectives) * 5
  hygienePenalty += sumCounts(commentedCode) * 2
  hygienePenalty += sumCounts(todoFixme)
  let maintainabilityPenalty = duplicateImports.reduce((total, item) => total + item.count, 0) * 3
  maintainabilityPenalty += sumCounts(longLines)
  maintainabilityPenalty += largeFiles.length * 2

  const architectureScore = clampScore(100 - architecturePenalty)
  const namingScore = clampScore(100 - namingPenalty)
  const hygieneScore = clampScore(100 - hygienePenalty)
  const maintainabilityScore = clampScore(100 - maintainabilityPenalty)
  const toolingScore = createToolingScore(tooling)
  const overallScore = clampScore(
    architectureScore * resources.rubric.weights.architecture +
      namingScore * resources.rubric.weights.naming +
      hygieneScore * resources.rubric.weights.hygiene +
      maintainabilityScore * resources.rubric.weights.maintainability +
      toolingScore * resources.rubric.weights.tooling
  )
  const grade = getGrade(overallScore, resources.rubric.gradeBands)

  const hotspots = sortByRiskDesc(auditedFiles).slice(0, 15)
  const oversizedBusinessFiles = createOversizedBusinessFiles(auditedFiles)
  const cleanupCandidates = createCleanupCandidates(auditedFiles)
  const duplicateFunctionGroups = createDuplicateFunctionGroups(auditedFiles)
  const similarFunctionClusters = createSimilarFunctionClusters(auditedFiles)
  const reuseCases = createReuseCases(duplicateFunctionGroups, similarFunctionClusters, sortByCategoryDesc(mixedResponsibilityFiles))
  const directoryHotspots = [...directoryStats.values()]
    .sort((left, right) => right.risk - left.risk || right.largeFiles - left.largeFiles || right.fileCount - left.fileCount)
    .slice(0, 10)
  const primaryRisks = createPrimaryRisks(largeFiles, singleLetterVariables, disabledDirectives, duplicateImports, resources)
  const executiveSummary = formatTemplate(resources.locale.patterns.executiveSummary, [
    path.basename(snapshot.projectPath),
    primaryRisks.join(', '),
    overallScore,
    grade
  ])

  const baseAnalysis = {
    projectPath: snapshot.projectPath,
    fileCount: snapshot.fileCount,
    totalLines: snapshot.totalLines,
    tooling,
    scores: {
      architecture: architectureScore,
      naming: namingScore,
      hygiene: hygieneScore,
      maintainability: maintainabilityScore,
      tooling: toolingScore,
      overall: overallScore,
      grade
    },
    primaryRisks,
    executiveSummary,
    highRiskFileCount: auditedFiles.filter((item) => item.risk >= 18).length,
    largeFiles: sortByLinesDesc(largeFiles),
    veryLargeFiles: sortByLinesDesc(veryLargeFiles),
    singleLetterVariables: sortByCountDesc(singleLetterVariables),
    consoleStatements: sortByCountDesc(consoleStatements),
    debuggerStatements: sortByCountDesc(debuggerStatements),
    disabledDirectives: sortByCountDesc(disabledDirectives),
    duplicateImports: sortByCountDesc(duplicateImports),
    longLines: sortByCountDesc(longLines),
    commentedCode: sortByCountDesc(commentedCode),
    todoFixme: sortByCountDesc(todoFixme),
    oversizedBusinessFiles,
    cleanupCandidates,
    duplicateFunctionGroups,
    similarFunctionClusters,
    reuseCases,
    hotspots,
    directoryHotspots,
    splitSuggestions: sortByLinesDesc(splitSuggestions),
    mixedResponsibilityFiles: sortByCategoryDesc(mixedResponsibilityFiles),
    frameworkObservations
  }

  const findings = createFindings(tooling, baseAnalysis, resources)
  const quickWins = createQuickWins(tooling, { ...baseAnalysis, findings }, resources)
  const refactorTargets = createRefactorTargets(hotspots, baseAnalysis.splitSuggestions, baseAnalysis.mixedResponsibilityFiles, resources)
  const issueCards = createIssueCards(refactorTargets, quickWins, baseAnalysis.splitSuggestions, baseAnalysis.mixedResponsibilityFiles, resources)
  const roadmap = createRoadmap(quickWins, refactorTargets, resources)

  return {
    ...baseAnalysis,
    findings,
    quickWins,
    refactorTargets,
    issueCards,
    roadmap
  }
}
