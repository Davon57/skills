export type OutputFormat = 'md' | 'html' | 'both'
export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low'
export type FileDomain = 'page' | 'component' | 'hooks' | 'service' | 'store' | 'general'
export type AuditPriority = 'P0' | 'P1' | 'P2'

export interface AuditCliOptions {
  command: 'audit'
  projectPath: string
  outputFormat: OutputFormat
  outputBaseName?: string
  outputDirectory?: string
  includeExtensions: string[]
}

export interface LocalizedFindingDefinition {
  category: string
  summary: string
  impact: string
  recommendation: string
}

export interface AuditLocale {
  general: Record<'none' | 'unknown' | 'present' | 'missing' | 'baseOnly' | 'rootDirectory', string>
  labels: Record<'framework' | 'language' | 'bundler' | 'packageManager' | 'eslintConfig' | 'tsConfig', string>
  responsibilityTags: Record<'view' | 'state' | 'api' | 'types' | 'constants' | 'utils' | 'routing', string>
  frameworkRules: Record<'viewWithApi' | 'serviceWithView' | 'storeWithView' | 'oversizedView' | 'hookBoundaryWeak', string>
  severity: Record<AuditSeverity, string>
  frameworkStatuses: Record<'hit' | 'clean', string>
  summaryTokens: Record<'largeFile' | 'singleLetterVariables' | 'disabledRules' | 'debugLeftovers' | 'longLines' | 'todoFixme', string>
  actions: Record<'removeDisable' | 'clearDebugger' | 'clearConsole' | 'setupLint' | 'setupTypecheck' | 'splitByResponsibilities' | 'extractRepeatedLogic', string>
  priorityReasons: Record<'critical' | 'mixed' | 'split' | 'quickFix' | 'default', string>
  patterns: Record<
    | 'noSourceFiles'
    | 'fileLines'
    | 'singleLetterFile'
    | 'consoleStatements'
    | 'debuggerStatements'
    | 'disabledDirectives'
    | 'commentedCode'
    | 'duplicateImports'
    | 'longLines'
    | 'toolingItem'
    | 'summaryLargeFiles'
    | 'summarySingleLetterVariables'
    | 'summaryDisabledDirectives'
    | 'summaryDuplicateImports'
    | 'executiveSummary'
    | 'directorySummary'
    | 'mixedResponsibilitySummary'
    | 'frameworkRuleSummary'
    | 'missingLintSummary'
    | 'missingTypecheckSummary'
    | 'roadmapP0Summary'
    | 'roadmapP1Summary',
    string
  >
  findings: Record<
    'architecture' | 'naming' | 'hygiene' | 'maintainability' | 'tooling' | 'mixedResponsibilities' | 'frameworkSpecific',
    LocalizedFindingDefinition
  >
  splitRecommendations: Record<
    | 'extractUiSections'
    | 'extractHooks'
    | 'extractServices'
    | 'extractTypes'
    | 'extractConstants'
    | 'extractUtils'
    | 'extractAnalysisPhases'
    | 'extractRenderPipeline'
    | 'keepEntryLean',
    string
  >
  roadmap: Record<'p0' | 'p1' | 'p2', string>
  toolingEvidence: Record<'missingPackageJson' | 'missingEslintConfig' | 'missingTsConfig' | 'missingLintScript' | 'missingTypecheckScript', string>
  markdown: Record<string, string>
  html: Record<string, string>
  result: Record<string, string>
}

export interface AuditGradeBand {
  grade: string
  min: number
  max: number
}

export interface AuditRubric {
  report: {
    defaultFileName: string
    defaultFormats: string[]
  }
  weights: Record<'architecture' | 'naming' | 'hygiene' | 'maintainability' | 'tooling', number>
  thresholds: {
    largeFileLines: number
    veryLargeFileLines: number
    longLineLength: number
    singleLetterVariableWarningCount: number
    singleLetterVariableCriticalCount: number
    consoleStatementWarningCount: number
    duplicateImportWarningCount: number
    commentedCodeWarningCount: number
  }
  gradeBands: AuditGradeBand[]
  recommendationOrder: string[]
}

export interface AuditResources {
  locale: AuditLocale
  rubric: AuditRubric
  markdownTemplate: string
  htmlTemplate: string
}

export interface WorkspaceFile {
  absolutePath: string
  relativePath: string
  extension: string
  content: string
  lines: string[]
  lineCount: number
}

export interface WorkspaceSnapshot {
  projectPath: string
  fileCount: number
  totalLines: number
  files: WorkspaceFile[]
}

export interface FileMetricCount {
  file: string
  count: number
}

export interface FileMetricNames extends FileMetricCount {
  names: string[]
}

export interface DuplicateImportMetric extends FileMetricCount {
  module: string
}

export interface FileSizeMetric {
  file: string
  lines: number
}

export interface FrameworkObservation {
  file: string
  rule: string
  status: string
  summary: string
}

export interface MixedResponsibilityFile {
  file: string
  categoryCount: number
  tags: string[]
  summary: string
}

export interface SplitSuggestion {
  file: string
  lines: number
  suggestions: string[]
}

export interface DirectoryStat {
  directory: string
  fileCount: number
  risk: number
  largeFiles: number
}

export interface BusinessOversizedFile {
  file: string
  lines: number
  extension: string
  domain: FileDomain
  businessType: string
  summary: string
}

export interface CleanupCandidate {
  file: string
  cleanupScore: number
  commentedCodeCount: number
  todoCount: number
  consoleCount: number
  debuggerCount: number
  disabledDirectiveCount: number
  debugCount: number
  duplicateImportCount: number
  summary: string
}

export interface DuplicateFunctionGroup {
  name: string
  fileCount: number
  occurrenceCount: number
  files: string[]
  locations: string[]
  summary: string
}

export interface SimilarFunctionCluster {
  name: string
  fileCount: number
  occurrenceCount: number
  files: string[]
  locations: string[]
  summary: string
}

export interface FunctionOccurrence {
  name: string
  lineStart: number
  lineEnd: number
}

export interface FunctionFingerprintEntry {
  name: string
  fingerprint: string
  lineStart: number
  lineEnd: number
}

export interface ToolingMetadata {
  packageManager: string
  framework: string
  language: string
  bundler: string
  hasPackageJson: boolean
  hasTsConfig: boolean
  hasEslintConfig: boolean
  scripts: string[]
}

export interface AuditedFile {
  relativePath: string
  lineCount: number
  risk: number
  summary: string
  fileDomain: FileDomain
  responsibilityTags: string[]
  splitSuggestions: string[]
  singleLetterVariables: string[]
  consoleCount: number
  debuggerCount: number
  disabledDirectiveCount: number
  todoCount: number
  commentedCodeCount: number
  longLineCount: number
  duplicateImports: DuplicateImportMetric[]
  functionNames: string[]
  functionFingerprints: string[]
  functionOccurrences: FunctionOccurrence[]
  functionFingerprintEntries: FunctionFingerprintEntry[]
  extension: string
}

export interface AuditFinding {
  category: string
  severity: AuditSeverity
  summary: string
  evidence: string[]
  impact: string
  recommendation: string
}

export interface QuickWin {
  priority: AuditPriority
  file: string
  action: string
  reason: string
}

export interface RefactorTarget {
  priority: AuditPriority
  file: string
  risk: number
  reason: string
  nextAction: string
}

export interface IssueCard {
  file: string
  priority: AuditPriority
  risk: number
  whyPriority: string
  issueTags: string[]
  primaryAction: string
  splitPlan: string[]
}

export interface AuditScores {
  architecture: number
  naming: number
  hygiene: number
  maintainability: number
  tooling: number
  overall: number
  grade: string
}

export interface RoadmapItem {
  phase: AuditPriority
  goal: string
}

export interface AuditAnalysis {
  projectPath: string
  fileCount: number
  totalLines: number
  tooling: ToolingMetadata
  scores: AuditScores
  primaryRisks: string[]
  executiveSummary: string
  highRiskFileCount: number
  largeFiles: FileSizeMetric[]
  veryLargeFiles: FileSizeMetric[]
  singleLetterVariables: FileMetricNames[]
  consoleStatements: FileMetricCount[]
  debuggerStatements: FileMetricCount[]
  disabledDirectives: FileMetricCount[]
  duplicateImports: DuplicateImportMetric[]
  longLines: FileMetricCount[]
  commentedCode: FileMetricCount[]
  todoFixme: FileMetricCount[]
  oversizedBusinessFiles: BusinessOversizedFile[]
  cleanupCandidates: CleanupCandidate[]
  duplicateFunctionGroups: DuplicateFunctionGroup[]
  similarFunctionClusters: SimilarFunctionCluster[]
  hotspots: AuditedFile[]
  directoryHotspots: DirectoryStat[]
  splitSuggestions: SplitSuggestion[]
  mixedResponsibilityFiles: MixedResponsibilityFile[]
  frameworkObservations: FrameworkObservation[]
  findings: AuditFinding[]
  quickWins: QuickWin[]
  refactorTargets: RefactorTarget[]
  issueCards: IssueCard[]
  roadmap: RoadmapItem[]
}

export interface AuditSummary {
  projectPath: string
  outputFormat: OutputFormat
  defaultReportBaseName: string
  generatedFiles: string[]
  fileCount: number
  totalLines: number
  scores: AuditScores
  primaryRisks: string[]
  executiveSummary: string
  tooling: ToolingMetadata
  counts: {
    highRiskFiles: number
    largeFiles: number
    veryLargeFiles: number
    mixedResponsibilityFiles: number
    frameworkObservations: number
    quickWins: number
    refactorTargets: number
  }
  topFiles: Array<Pick<AuditedFile, 'relativePath' | 'lineCount' | 'risk' | 'summary'>>
  oversizedBusinessFiles: BusinessOversizedFile[]
  cleanupCandidates: CleanupCandidate[]
  duplicateFunctionGroups: DuplicateFunctionGroup[]
  similarFunctionClusters: SimilarFunctionCluster[]
  quickWins: QuickWin[]
  refactorTargets: RefactorTarget[]
  issueCards: IssueCard[]
  findings: AuditFinding[]
  directoryHotspots: DirectoryStat[]
  frameworkObservations: FrameworkObservation[]
}
