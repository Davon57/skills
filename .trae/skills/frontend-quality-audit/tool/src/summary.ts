import { AuditAnalysis, AuditCliOptions, AuditResources, AuditSummary, WorkspaceSnapshot } from './types.js'

export function createAuditSummary(
  options: AuditCliOptions,
  resources: AuditResources,
  snapshot: WorkspaceSnapshot,
  analysis: AuditAnalysis,
  generatedFiles: string[]
): AuditSummary {
  return {
    projectPath: snapshot.projectPath,
    outputFormat: options.outputFormat,
    defaultReportBaseName: options.outputBaseName ?? resources.rubric.report.defaultFileName,
    generatedFiles,
    fileCount: snapshot.fileCount,
    totalLines: snapshot.totalLines,
    scores: analysis.scores,
    primaryRisks: analysis.primaryRisks,
    executiveSummary: analysis.executiveSummary,
    tooling: analysis.tooling,
    counts: {
      highRiskFiles: analysis.highRiskFileCount,
      largeFiles: analysis.largeFiles.length,
      veryLargeFiles: analysis.veryLargeFiles.length,
      mixedResponsibilityFiles: analysis.mixedResponsibilityFiles.length,
      frameworkObservations: analysis.frameworkObservations.length,
      quickWins: analysis.quickWins.length,
      refactorTargets: analysis.refactorTargets.length
    },
    topFiles: analysis.hotspots.slice(0, 10).map((item) => ({
      relativePath: item.relativePath,
      lineCount: item.lineCount,
      risk: item.risk,
      summary: item.summary
    })),
    oversizedBusinessFiles: analysis.oversizedBusinessFiles,
    cleanupCandidates: analysis.cleanupCandidates,
    duplicateFunctionGroups: analysis.duplicateFunctionGroups,
    similarFunctionClusters: analysis.similarFunctionClusters,
    quickWins: analysis.quickWins,
    refactorTargets: analysis.refactorTargets,
    issueCards: analysis.issueCards,
    findings: analysis.findings,
    directoryHotspots: analysis.directoryHotspots,
    frameworkObservations: analysis.frameworkObservations.slice(0, 10)
  }
}
