import fs from 'node:fs/promises'
import path from 'node:path'
import { AuditAnalysis, AuditCliOptions, AuditFinding, AuditResources, FrameworkObservation, QuickWin, RefactorTarget, SplitSuggestion } from './types.js'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeMarkdownTable(value: string): string {
  return value.replaceAll('|', '\\|')
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.join('、') : '无'
}

function getSeverityClass(severity: string): string {
  if (severity === 'critical') {
    return 'critical'
  }

  if (severity === 'high') {
    return 'high'
  }

  if (severity === 'medium') {
    return 'medium'
  }

  return 'low'
}

function getRiskSeverity(risk: number): 'critical' | 'high' | 'medium' | 'low' {
  if (risk >= 30) {
    return 'critical'
  }

  if (risk >= 18) {
    return 'high'
  }

  if (risk >= 10) {
    return 'medium'
  }

  return 'low'
}

function buildStackItems(analysis: AuditAnalysis, resources: AuditResources): string[] {
  const eslintStatus = analysis.tooling.hasEslintConfig ? resources.locale.general.present : resources.locale.general.missing
  const tsStatus = analysis.tooling.hasTsConfig ? resources.locale.general.present : resources.locale.general.missing

  return [
    `${resources.locale.labels.framework}：${analysis.tooling.framework === 'unknown' ? resources.locale.general.unknown : analysis.tooling.framework}`,
    `${resources.locale.labels.language}：${analysis.tooling.language === 'unknown' ? resources.locale.general.unknown : analysis.tooling.language}`,
    `${resources.locale.labels.bundler}：${analysis.tooling.bundler === 'unknown' ? resources.locale.general.unknown : analysis.tooling.bundler}`,
    `${resources.locale.labels.packageManager}：${analysis.tooling.packageManager === 'unknown' ? resources.locale.general.unknown : analysis.tooling.packageManager}`,
    `${resources.locale.labels.eslintConfig}：${eslintStatus}`,
    `${resources.locale.labels.tsConfig}：${tsStatus}`
  ]
}

function renderMarkdownQuickWins(quickWins: QuickWin[], resources: AuditResources): string[] {
  const lines = [
    `| ${resources.locale.markdown.quickWinTablePriority} | ${resources.locale.markdown.quickWinTableFile} | ${resources.locale.markdown.quickWinTableAction} | ${resources.locale.markdown.quickWinTableReason} |`,
    '| --- | --- | --- | --- |'
  ]

  if (quickWins.length === 0) {
    lines.push(`| - | - | - | ${resources.locale.general.none} |`)
    return lines
  }

  for (const quickWin of quickWins) {
    lines.push(
      `| ${quickWin.priority} | ${escapeMarkdownTable(quickWin.file)} | ${escapeMarkdownTable(quickWin.action)} | ${escapeMarkdownTable(quickWin.reason)} |`
    )
  }

  return lines
}

function renderMarkdownRefactorTargets(refactorTargets: RefactorTarget[], resources: AuditResources): string[] {
  const lines = [
    `| ${resources.locale.markdown.refactorTablePriority} | ${resources.locale.markdown.refactorTableFile} | ${resources.locale.markdown.refactorTableRisk} | ${resources.locale.markdown.refactorTableReason} | ${resources.locale.markdown.refactorTableNextAction} |`,
    '| --- | --- | ---: | --- | --- |'
  ]

  if (refactorTargets.length === 0) {
    lines.push(`| - | - | 0 | ${resources.locale.general.none} | ${resources.locale.general.none} |`)
    return lines
  }

  for (const target of refactorTargets) {
    lines.push(
      `| ${target.priority} | ${escapeMarkdownTable(target.file)} | ${target.risk} | ${escapeMarkdownTable(target.reason)} | ${escapeMarkdownTable(target.nextAction)} |`
    )
  }

  return lines
}

function renderMarkdownFindings(findings: AuditFinding[], resources: AuditResources): string[] {
  const lines: string[] = []

  if (findings.length === 0) {
    lines.push(`- ${resources.locale.general.none}`)
    return lines
  }

  for (const finding of findings) {
    lines.push(`### ${finding.category}`)
    lines.push('')
    lines.push(`- ${resources.locale.markdown.findingSeverity}: ${resources.locale.severity[finding.severity]}`)
    lines.push(`- ${resources.locale.markdown.findingSummary}: ${finding.summary}`)
    lines.push(`- ${resources.locale.markdown.findingEvidence}: ${formatList(finding.evidence)}`)
    lines.push(`- ${resources.locale.markdown.findingImpact}: ${finding.impact}`)
    lines.push(`- ${resources.locale.markdown.findingRecommendation}: ${finding.recommendation}`)
    lines.push('')
  }

  return lines
}

function renderMarkdownHotspots(analysis: AuditAnalysis, resources: AuditResources): string[] {
  const lines = [
    `| ${resources.locale.markdown.hotspotTableFile} | ${resources.locale.markdown.hotspotTableLines} | ${resources.locale.markdown.hotspotTableRisk} | ${resources.locale.markdown.hotspotTableSummary} |`,
    '| --- | ---: | ---: | --- |'
  ]

  if (analysis.hotspots.length === 0) {
    lines.push(`| - | 0 | 0 | ${resources.locale.general.none} |`)
    return lines
  }

  for (const hotspot of analysis.hotspots) {
    lines.push(
      `| ${escapeMarkdownTable(hotspot.relativePath)} | ${hotspot.lineCount} | ${hotspot.risk} | ${escapeMarkdownTable(hotspot.summary || resources.locale.general.baseOnly)} |`
    )
  }

  return lines
}

function renderMarkdownDirectoryHotspots(analysis: AuditAnalysis, resources: AuditResources): string[] {
  const lines = [
    `| ${resources.locale.markdown.directoryTableDirectory} | ${resources.locale.markdown.directoryTableFiles} | ${resources.locale.markdown.directoryTableRisk} | ${resources.locale.markdown.directoryTableLargeFiles} | ${resources.locale.markdown.directoryTableSummary} |`,
    '| --- | ---: | ---: | ---: | --- |'
  ]

  if (analysis.directoryHotspots.length === 0) {
    lines.push(`| - | 0 | 0 | 0 | ${resources.locale.general.none} |`)
    return lines
  }

  for (const directory of analysis.directoryHotspots) {
    const summary = `${directory.directory}：文件 ${directory.fileCount} 个，累计风险 ${directory.risk}，超大文件 ${directory.largeFiles} 个`
    lines.push(`| ${escapeMarkdownTable(directory.directory)} | ${directory.fileCount} | ${directory.risk} | ${directory.largeFiles} | ${escapeMarkdownTable(summary)} |`)
  }

  return lines
}

function renderMarkdownSplitSuggestions(splitSuggestions: SplitSuggestion[], resources: AuditResources): string[] {
  const lines: string[] = []

  if (splitSuggestions.length === 0) {
    lines.push(`- ${resources.locale.general.none}`)
    return lines
  }

  for (const splitSuggestion of splitSuggestions.slice(0, 5)) {
    lines.push(`### ${splitSuggestion.file}`)
    lines.push('')
    lines.push(`- ${resources.locale.markdown.splitLineCount}: ${splitSuggestion.lines}`)
    lines.push(`- ${resources.locale.markdown.splitRecommendation}: ${formatList(splitSuggestion.suggestions)}`)
    lines.push('')
  }

  return lines
}

function renderMarkdownMixedResponsibilities(analysis: AuditAnalysis, resources: AuditResources): string[] {
  const lines = [
    `| ${resources.locale.markdown.mixedTableFile} | ${resources.locale.markdown.mixedTableCategories} | ${resources.locale.markdown.mixedTableTags} | ${resources.locale.markdown.mixedTableSummary} |`,
    '| --- | ---: | --- | --- |'
  ]

  if (analysis.mixedResponsibilityFiles.length === 0) {
    lines.push(`| - | 0 | - | ${resources.locale.general.none} |`)
    return lines
  }

  for (const item of analysis.mixedResponsibilityFiles.slice(0, 10)) {
    lines.push(
      `| ${escapeMarkdownTable(item.file)} | ${item.categoryCount} | ${escapeMarkdownTable(item.tags.join(', '))} | ${escapeMarkdownTable(item.summary)} |`
    )
  }

  return lines
}

function renderMarkdownFrameworkObservations(frameworkObservations: FrameworkObservation[], resources: AuditResources): string[] {
  const lines = [
    `| ${resources.locale.markdown.frameworkTableFile} | ${resources.locale.markdown.frameworkTableRule} | ${resources.locale.markdown.frameworkTableStatus} | ${resources.locale.markdown.frameworkTableSummary} |`,
    '| --- | --- | --- | --- |'
  ]

  if (frameworkObservations.length === 0) {
    lines.push(`| - | - | ${resources.locale.frameworkStatuses.clean} | ${resources.locale.general.none} |`)
    return lines
  }

  for (const item of frameworkObservations.slice(0, 10)) {
    lines.push(
      `| ${escapeMarkdownTable(item.file)} | ${escapeMarkdownTable(item.rule)} | ${escapeMarkdownTable(item.status)} | ${escapeMarkdownTable(item.summary)} |`
    )
  }

  return lines
}

function renderMarkdownRoadmap(analysis: AuditAnalysis, resources: AuditResources): string[] {
  const lines = [`| ${resources.locale.markdown.roadmapPhase} | ${resources.locale.markdown.roadmapGoal} |`, '| --- | --- |']

  for (const item of analysis.roadmap) {
    lines.push(`| ${item.phase} | ${escapeMarkdownTable(item.goal)} |`)
  }

  return lines
}

function generateMarkdownReport(projectName: string, auditDate: string, analysis: AuditAnalysis, resources: AuditResources): string {
  const lines: string[] = []

  lines.push(resources.locale.markdown.title)
  lines.push('')
  lines.push('## 摘要')
  lines.push('')
  lines.push(`- 项目：${projectName}`)
  lines.push(`- 日期：${auditDate}`)
  lines.push(`- 结论：按“超大文件 → 冗余代码 → 重复逻辑”的顺序处理即可开始修复`)
  lines.push(`- 风险摘要：${analysis.primaryRisks.join('，')}`)
  lines.push('')
  lines.push('## 第一步：超过 800 行的业务文件（前 30）')
  lines.push('')
  lines.push('| 文件 | 行数 | 类型 | 职责域 | 说明 |')
  lines.push('| --- | ---: | --- | --- | --- |')
  if (analysis.oversizedBusinessFiles.length === 0) {
    lines.push(`| - | 0 | - | - | ${resources.locale.general.none} |`)
  } else {
    for (const item of analysis.oversizedBusinessFiles) {
      lines.push(`| ${escapeMarkdownTable(item.file)} | ${item.lines} | ${escapeMarkdownTable(item.businessType)} | ${escapeMarkdownTable(formatDomainLabel(item.domain))} | ${escapeMarkdownTable(item.summary)} |`)
    }
  }
  lines.push('')
  lines.push('## 第二步：疑似未删除的大段代码（前 30 个文件）')
  lines.push('')
  lines.push('| 文件 | 区间 | 疑似旧代码行数 | TODO/FIXME | console | debugger | 跳过检查 | 说明 |')
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |')
  if (analysis.cleanupCandidates.length === 0) {
    lines.push(`| - | - | 0 | 0 | 0 | 0 | 0 | ${resources.locale.general.none} |`)
  } else {
    for (const item of analysis.cleanupCandidates) {
      lines.push(
        `| ${escapeMarkdownTable(item.file)} | ${escapeMarkdownTable(item.ranges.map((range) => `L${range.lineStart}-L${range.lineEnd}`).join(' / '))} | ${item.unusedBlockLineCount} | ${item.todoCount} | ${item.consoleCount} | ${item.debuggerCount} | ${item.disabledDirectiveCount} | ${escapeMarkdownTable(item.summary)} |`
      )
    }
  }
  lines.push('')
  lines.push('## 第三步：重复函数和逻辑案例（前 30 个案例）')
  lines.push('')
  lines.push('| 案例 | 位置 | 建议动作 | 总结 |')
  lines.push('| --- | --- | --- | --- |')
  if (analysis.reuseCases.length === 0) {
    lines.push(`| - | - | - | ${resources.locale.general.none} |`)
  } else {
    for (const item of analysis.reuseCases) {
      lines.push(
        `| ${escapeMarkdownTable(item.title)} | ${escapeMarkdownTable(item.locations.join(' / '))} | ${escapeMarkdownTable(item.recommendation)} | ${escapeMarkdownTable(item.summary)} |`
      )
    }
  }
  lines.push('')
  lines.push('## 第四步：报告产物')
  lines.push('')
  lines.push('- 本次审计已经生成报告产物，可直接保存并分发给开发者按顺序修复')
  lines.push('- 如需补充评分卡、风险地图、治理路线图，可在后续扩展模式下再启用')

  return `${lines.join('\n')}\n`
}

function buildOverviewCards(analysis: AuditAnalysis, resources: AuditResources): string {
  const normalizedCards = [
    { label: resources.locale.html.overviewFiles, value: String(analysis.fileCount) },
    { label: resources.locale.html.overviewHotspots, value: String(analysis.highRiskFileCount) },
    { label: resources.locale.html.overviewDirectories, value: String(analysis.directoryHotspots.length) },
    { label: resources.locale.html.overviewLargeFiles, value: String(analysis.largeFiles.length) }
  ]

  return normalizedCards
    .map(
      (card) => `<div class="metric-card"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></div>`
    )
    .join('\n')
}

function buildScoreGauge(analysis: AuditAnalysis, resources: AuditResources): string {
  const circumference = 408
  const progress = Math.max(0, Math.min(100, analysis.scores.overall))
  const offset = circumference - (circumference * progress) / 100

  return `<div class="gauge-shell">
  <div class="gauge-visual" style="--gauge-offset:${offset};">
    <svg class="gauge-svg" viewBox="0 0 160 160" aria-hidden="true">
      <defs>
        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#47d9a3"></stop>
          <stop offset="55%" stop-color="#8cb4ff"></stop>
          <stop offset="100%" stop-color="#ffbf69"></stop>
        </linearGradient>
      </defs>
      <circle class="gauge-track" cx="80" cy="80" r="65"></circle>
      <circle class="gauge-progress" cx="80" cy="80" r="65"></circle>
    </svg>
    <div class="gauge-center">
      <div>
        <div class="gauge-score">${escapeHtml(String(analysis.scores.overall))}</div>
        <div class="gauge-grade">${escapeHtml(`Grade ${analysis.scores.grade}`)}</div>
      </div>
    </div>
  </div>
  <div class="gauge-copy">
    <div class="aside-kicker">Audit Signal</div>
    <h3>${escapeHtml(analysis.scores.grade === 'A' || analysis.scores.grade === 'B' ? '当前可继续推进，但需要控制热点扩散' : '当前更适合先治理，再继续堆需求')}</h3>
    <p>${escapeHtml(analysis.executiveSummary)}</p>
    <div class="chip-row">
      <span class="chip">${escapeHtml(resources.locale.html.hotspotChartRisk)} ${escapeHtml(String(analysis.highRiskFileCount))}</span>
      <span class="chip">${escapeHtml(resources.locale.html.signalLargeFiles)} ${escapeHtml(String(analysis.largeFiles.length))}</span>
      <span class="chip">${escapeHtml(resources.locale.html.signalMixedFiles)} ${escapeHtml(String(analysis.mixedResponsibilityFiles.length))}</span>
    </div>
  </div>
</div>`
}

function buildScoreBars(analysis: AuditAnalysis): string {
  const items = [
    { label: '架构', value: analysis.scores.architecture },
    { label: '命名', value: analysis.scores.naming },
    { label: '代码卫生', value: analysis.scores.hygiene },
    { label: '可维护性', value: analysis.scores.maintainability },
    { label: '工具链', value: analysis.scores.tooling }
  ]

  return items
    .map(
      (item) => `<div class="score-bar">
  <div class="score-bar-head">
    <span>${escapeHtml(item.label)}</span>
    <strong>${escapeHtml(String(item.value))}</strong>
  </div>
  <div class="score-track">
    <div class="score-fill" style="--bar-width:${item.value}%;"></div>
  </div>
</div>`
    )
    .join('\n')
}

function buildSignalCards(analysis: AuditAnalysis, resources: AuditResources): string {
  const disabledDirectives = analysis.disabledDirectives.reduce((total, item) => total + item.count, 0)
  const items = [
    {
      label: resources.locale.html.signalLargeFiles,
      value: analysis.largeFiles.length,
      meta: analysis.largeFiles.length > 0 ? `最大 ${analysis.largeFiles[0]?.lines ?? 0} 行` : '当前未发现'
    },
    {
      label: resources.locale.html.signalMixedFiles,
      value: analysis.mixedResponsibilityFiles.length,
      meta: analysis.mixedResponsibilityFiles.length > 0 ? '存在职责边界混入' : '边界相对稳定'
    },
    {
      label: resources.locale.html.signalDisabledRules,
      value: disabledDirectives,
      meta: disabledDirectives > 0 ? '静态检查可信度被削弱' : '未发现绕过'
    },
    {
      label: resources.locale.html.signalRefactorTargets,
      value: analysis.refactorTargets.length,
      meta: analysis.refactorTargets.length > 0 ? '建议纳入下一轮治理' : resources.locale.general.none
    }
  ]

  return items
    .map(
      (item) => `<article class="signal-card">
  <div class="label">${escapeHtml(item.label)}</div>
  <div class="signal-value">${escapeHtml(String(item.value))}</div>
  <div class="signal-meta">${escapeHtml(item.meta)}</div>
</article>`
    )
    .join('\n')
}

function buildHotspotChart(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.hotspots.length === 0) {
    return `<div class="mini-card"><p>${escapeHtml(resources.locale.general.none)}</p></div>`
  }

  const hotspots = analysis.hotspots.slice(0, 6)
  const maxRisk = Math.max(...hotspots.map((item) => item.risk), 1)

  return `<div class="skyline-columns">
${hotspots
  .map((hotspot) => {
    const height = Math.max(24, Math.round((hotspot.risk / maxRisk) * 180))
    const riskSeverity = getRiskSeverity(hotspot.risk)
    const barClass = riskSeverity === 'critical' || riskSeverity === 'high' ? 'skyline-bar is-critical' : 'skyline-bar'
    return `<div class="skyline-column">
  <div class="skyline-bar-wrap">
    <div class="${barClass}" style="--column-height:${height}px;"></div>
  </div>
  <div class="skyline-meta">
    <div class="skyline-name">${escapeHtml(hotspot.relativePath)}</div>
    <div class="skyline-caption">${escapeHtml(resources.locale.html.hotspotChartRisk)} ${hotspot.risk} · ${escapeHtml(resources.locale.html.hotspotChartLines)} ${hotspot.lineCount}</div>
  </div>
</div>`
  })
  .join('\n')}
</div>`
}

function buildDirectoryHeatRows(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.directoryHotspots.length === 0) {
    return `<div class="mini-card"><p>${escapeHtml(resources.locale.general.none)}</p></div>`
  }

  const directories = analysis.directoryHotspots.slice(0, 6)
  const maxRisk = Math.max(...directories.map((item) => item.risk), 1)

  return directories
    .map((directory) => {
      const width = Math.max(10, Math.round((directory.risk / maxRisk) * 100))
      return `<div class="heat-row">
  <div class="heat-row-head">
    <span>${escapeHtml(directory.directory)}</span>
    <span class="muted">${escapeHtml(String(directory.risk))}</span>
  </div>
  <div class="heat-track">
    <div class="heat-fill" style="--heat-width:${width}%;"></div>
  </div>
  <div class="skyline-caption">${escapeHtml(resources.locale.html.signalLargeFiles)} ${directory.largeFiles} · 文件 ${directory.fileCount}</div>
</div>`
    })
    .join('\n')
}

function formatDomainLabel(domain: string): string {
  switch (domain) {
    case 'page':
      return '页面'
    case 'component':
      return '组件'
    case 'hooks':
      return 'Hooks'
    case 'service':
      return '服务'
    case 'store':
      return '状态'
    default:
      return '通用'
  }
}

function buildOversizedBusinessRows(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.oversizedBusinessFiles.length === 0) {
    return `<tr><td>-</td><td>0</td><td>-</td><td>-</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return analysis.oversizedBusinessFiles
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.file)}</td><td>${item.lines}</td><td>${escapeHtml(item.businessType)}</td><td>${escapeHtml(formatDomainLabel(item.domain))}</td><td>${escapeHtml(item.summary)}</td></tr>`
    )
    .join('\n')
}

function buildCleanupRows(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.cleanupCandidates.length === 0) {
    return `<tr><td>-</td><td>-</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return analysis.cleanupCandidates
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.file)}</td><td>${escapeHtml(
          item.ranges.map((range) => `L${range.lineStart}-L${range.lineEnd}`).join(' / ')
        )}</td><td>${item.unusedBlockLineCount}</td><td>${item.todoCount}</td><td>${item.consoleCount}</td><td>${item.debuggerCount}</td><td>${item.disabledDirectiveCount}</td><td>${escapeHtml(item.summary)}</td></tr>`
    )
    .join('\n')
}

function buildReuseCaseRows(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.reuseCases.length === 0) {
    return `<tr><td>-</td><td>-</td><td>-</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return analysis.reuseCases
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.locations.join(' / '))}</td><td>${escapeHtml(item.recommendation)}</td><td>${escapeHtml(item.summary)}</td></tr>`
    )
    .join('\n')
}

function buildDuplicateFunctionRows(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.duplicateFunctionGroups.length === 0) {
    return `<tr><td>-</td><td>0</td><td>0</td><td>-</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return analysis.duplicateFunctionGroups
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td>${item.fileCount}</td><td>${item.occurrenceCount}</td><td>${escapeHtml(item.locations.join(' / '))}</td><td>${escapeHtml(item.summary)}</td></tr>`
    )
    .join('\n')
}

function buildSimilarFunctionRows(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.similarFunctionClusters.length === 0) {
    return `<tr><td>-</td><td>0</td><td>0</td><td>-</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return analysis.similarFunctionClusters
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td>${item.fileCount}</td><td>${item.occurrenceCount}</td><td>${escapeHtml(item.locations.join(' / '))}</td><td>${escapeHtml(item.summary)}</td></tr>`
    )
    .join('\n')
}

function buildHtmlQuickWinRows(quickWins: QuickWin[], resources: AuditResources): string {
  if (quickWins.length === 0) {
    return `<tr><td>-</td><td>-</td><td>-</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return quickWins
    .map(
      (quickWin) =>
        `<tr><td>${escapeHtml(quickWin.priority)}</td><td>${escapeHtml(quickWin.file)}</td><td>${escapeHtml(quickWin.action)}</td><td>${escapeHtml(quickWin.reason)}</td></tr>`
    )
    .join('\n')
}

function buildHtmlIssueCards(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.issueCards.length === 0) {
    return `<article class="action-card"><p>${escapeHtml(resources.locale.general.none)}</p></article>`
  }

  return analysis.issueCards
    .map((issueCard) => {
      const severityClass = getSeverityClass(issueCard.priority === 'P0' ? 'critical' : issueCard.priority === 'P1' ? 'high' : 'medium')
      const issueTags = issueCard.issueTags.length > 0 ? issueCard.issueTags : [resources.locale.general.none]
      const splitPlan = issueCard.splitPlan.length > 0 ? issueCard.splitPlan : [resources.locale.general.none]

      return [
        '<article class="action-card">',
        '  <div class="action-card-head">',
        '    <div class="action-card-title">',
        `      <h3>${escapeHtml(issueCard.file)}</h3>`,
        '      <div class="chip-row">',
        `        <span class="tag ${severityClass}">${escapeHtml(issueCard.priority)}</span>`,
        `        <span class="chip">${escapeHtml(resources.locale.html.issueCardRisk)}: ${escapeHtml(String(issueCard.risk))}</span>`,
        '      </div>',
        '    </div>',
        '  </div>',
        '  <dl>',
        `    <div><dt>${escapeHtml(resources.locale.html.issueCardWhy)}</dt><dd>${escapeHtml(issueCard.whyPriority)}</dd></div>`,
        `    <div><dt>${escapeHtml(resources.locale.html.issueCardIssues)}</dt><dd><div class="chip-row">${issueTags
          .map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`)
          .join('')}</div></dd></div>`,
        `    <div><dt>${escapeHtml(resources.locale.html.issueCardAction)}</dt><dd>${escapeHtml(issueCard.primaryAction)}</dd></div>`,
        `    <div><dt>${escapeHtml(resources.locale.html.issueCardSplit)}</dt><dd><ul>${splitPlan
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join('')}</ul></dd></div>`,
        '  </dl>',
        '</article>'
      ].join('\n')
    })
    .join('\n')
}

function buildHtmlDirectoryRows(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.directoryHotspots.length === 0) {
    return `<tr><td>-</td><td>0</td><td>0</td><td>0</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return analysis.directoryHotspots
    .map((directory) => {
      const summary = `${directory.directory}：文件 ${directory.fileCount} 个，累计风险 ${directory.risk}，超大文件 ${directory.largeFiles} 个`
      return `<tr><td>${escapeHtml(directory.directory)}</td><td>${directory.fileCount}</td><td>${directory.risk}</td><td>${directory.largeFiles}</td><td>${escapeHtml(summary)}</td></tr>`
    })
    .join('\n')
}

function buildHtmlSplitSections(splitSuggestions: SplitSuggestion[], resources: AuditResources): string {
  if (splitSuggestions.length === 0) {
    return `<div class="mini-card"><p>${escapeHtml(resources.locale.general.none)}</p></div>`
  }

  return splitSuggestions.slice(0, 5)
    .map(
      (item) => `<div class="mini-card"><h3>${escapeHtml(`${item.file}（${item.lines} 行）`)}</h3><ul>${(item.suggestions.length > 0 ? item.suggestions : [resources.locale.general.none])
        .map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`)
        .join('')}</ul></div>`
    )
    .join('\n')
}

function buildHtmlMixedRows(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.mixedResponsibilityFiles.length === 0) {
    return `<tr><td>-</td><td>0</td><td>-</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return analysis.mixedResponsibilityFiles.slice(0, 10)
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.file)}</td><td>${item.categoryCount}</td><td>${escapeHtml(item.tags.join(', '))}</td><td>${escapeHtml(item.summary)}</td></tr>`
    )
    .join('\n')
}

function buildHtmlFrameworkRows(frameworkObservations: FrameworkObservation[], resources: AuditResources): string {
  if (frameworkObservations.length === 0) {
    return `<tr><td>-</td><td>-</td><td>${escapeHtml(resources.locale.frameworkStatuses.clean)}</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return frameworkObservations
    .slice(0, 10)
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.file)}</td><td>${escapeHtml(item.rule)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.summary)}</td></tr>`
    )
    .join('\n')
}

function buildHtmlRoadmapRows(analysis: AuditAnalysis): string {
  return analysis.roadmap.map((item) => `<tr><td>${escapeHtml(item.phase)}</td><td>${escapeHtml(item.goal)}</td></tr>`).join('\n')
}

function buildHtmlHotspotRows(analysis: AuditAnalysis, resources: AuditResources): string {
  if (analysis.hotspots.length === 0) {
    return `<tr><td>-</td><td>0</td><td><span class="tag low">${escapeHtml(resources.locale.severity.low)}</span></td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return analysis.hotspots
    .map((hotspot) => {
      const riskSeverity = getRiskSeverity(hotspot.risk)
      return `<tr><td>${escapeHtml(hotspot.relativePath)}</td><td>${hotspot.lineCount}</td><td><span class="tag ${getSeverityClass(riskSeverity)}">${escapeHtml(
        resources.locale.severity[riskSeverity]
      )}</span></td><td>${escapeHtml(hotspot.summary || resources.locale.general.baseOnly)}</td></tr>`
    })
    .join('\n')
}

function buildHtmlFindingSections(findings: AuditFinding[], resources: AuditResources): string {
  if (findings.length === 0) {
    return `<article class="finding-card"><h3>${escapeHtml(resources.locale.general.none)}</h3></article>`
  }

  return findings
    .map(
      (finding) => `<article class="finding-card">
  <div class="finding-head">
    <h3>${escapeHtml(finding.category)}</h3>
    <span class="tag ${getSeverityClass(finding.severity)}">${escapeHtml(resources.locale.severity[finding.severity])}</span>
  </div>
  <p>${escapeHtml(finding.summary)}</p>
  <div class="finding-meta">
    <strong>${escapeHtml(resources.locale.html.impact)}</strong>
    <p>${escapeHtml(finding.impact)}</p>
  </div>
  <div class="finding-meta">
    <strong>${escapeHtml(resources.locale.html.recommendation)}</strong>
    <p>${escapeHtml(finding.recommendation)}</p>
  </div>
  <ul>${(finding.evidence.length > 0 ? finding.evidence : [resources.locale.general.none])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ul>
</article>`
    )
    .join('\n')
}

function buildHtmlRefactorRows(refactorTargets: RefactorTarget[], resources: AuditResources): string {
  if (refactorTargets.length === 0) {
    return `<tr><td>-</td><td>-</td><td>0</td><td>${escapeHtml(resources.locale.general.none)}</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`
  }

  return refactorTargets
    .map(
      (target) =>
        `<tr><td>${escapeHtml(target.priority)}</td><td>${escapeHtml(target.file)}</td><td>${target.risk}</td><td>${escapeHtml(target.reason)}</td><td>${escapeHtml(target.nextAction)}</td></tr>`
    )
    .join('\n')
}

function generateHtmlReport(projectName: string, auditDate: string, analysis: AuditAnalysis, resources: AuditResources): string {
  const replacements = new Map<string, string>([
    ['{{PROJECT_NAME}}', escapeHtml(projectName)],
    ['{{AUDIT_DATE}}', escapeHtml(auditDate)],
    ['{{OVERALL_SCORE}}', escapeHtml(String(analysis.scores.overall))],
    ['{{GRADE}}', escapeHtml(analysis.scores.grade)],
    ['{{EXECUTIVE_SUMMARY}}', escapeHtml(analysis.executiveSummary)],
    ['{{OVERVIEW_HEADING}}', escapeHtml(resources.locale.html.overviewHeading)],
    ['{{OVERVIEW_CARDS}}', buildOverviewCards(analysis, resources)],
    ['{{MANUAL_REPAIR_HEADING}}', escapeHtml(resources.locale.html.manualRepairHeading)],
    ['{{MANUAL_REPAIR_SUMMARY}}', escapeHtml(resources.locale.html.manualRepairSummary)],
    ['{{OVERSIZED_BUSINESS_HEADING}}', escapeHtml(resources.locale.html.oversizedBusinessHeading)],
    ['{{OVERSIZED_BUSINESS_SUMMARY}}', escapeHtml(resources.locale.html.oversizedBusinessSummary)],
    ['{{OVERSIZED_BUSINESS_FILE}}', escapeHtml(resources.locale.html.oversizedBusinessFile)],
    ['{{OVERSIZED_BUSINESS_LINES}}', escapeHtml(resources.locale.html.oversizedBusinessLines)],
    ['{{OVERSIZED_BUSINESS_TYPE}}', escapeHtml(resources.locale.html.oversizedBusinessType)],
    ['{{OVERSIZED_BUSINESS_DOMAIN}}', escapeHtml(resources.locale.html.oversizedBusinessDomain)],
    ['{{OVERSIZED_BUSINESS_SUMMARY_COLUMN}}', escapeHtml(resources.locale.html.oversizedBusinessSummaryColumn)],
    ['{{OVERSIZED_BUSINESS_ROWS}}', buildOversizedBusinessRows(analysis, resources)],
    ['{{CLEANUP_HEADING}}', escapeHtml(resources.locale.html.cleanupHeading)],
    ['{{CLEANUP_SUMMARY}}', escapeHtml(resources.locale.html.cleanupSummary)],
    ['{{CLEANUP_FILE}}', escapeHtml(resources.locale.html.cleanupFile)],
    ['{{CLEANUP_SCORE}}', escapeHtml(resources.locale.html.cleanupScore)],
    ['{{CLEANUP_COMMENTED}}', escapeHtml(resources.locale.html.cleanupCommented)],
    ['{{CLEANUP_TODO}}', escapeHtml(resources.locale.html.cleanupTodo)],
    ['{{CLEANUP_CONSOLE}}', escapeHtml(resources.locale.html.cleanupConsole)],
    ['{{CLEANUP_DEBUGGER}}', escapeHtml(resources.locale.html.cleanupDebugger)],
    ['{{CLEANUP_SKIPPED_CHECKS}}', escapeHtml(resources.locale.html.cleanupSkippedChecks)],
    ['{{CLEANUP_DUPLICATE_IMPORTS}}', escapeHtml(resources.locale.html.cleanupDuplicateImports)],
    ['{{CLEANUP_SUMMARY_COLUMN}}', escapeHtml(resources.locale.html.cleanupSummaryColumn)],
    ['{{CLEANUP_ROWS}}', buildCleanupRows(analysis, resources)],
    ['{{REUSE_CASE_ROWS}}', buildReuseCaseRows(analysis, resources)],
    ['{{DUPLICATE_FUNCTIONS_HEADING}}', escapeHtml(resources.locale.html.duplicateFunctionsHeading)],
    ['{{DUPLICATE_FUNCTIONS_SUMMARY}}', escapeHtml(resources.locale.html.duplicateFunctionsSummary)],
    ['{{DUPLICATE_FUNCTION_NAME}}', escapeHtml(resources.locale.html.duplicateFunctionName)],
    ['{{DUPLICATE_FUNCTION_FILES}}', escapeHtml(resources.locale.html.duplicateFunctionFiles)],
    ['{{DUPLICATE_FUNCTION_OCCURRENCES}}', escapeHtml(resources.locale.html.duplicateFunctionOccurrences)],
    ['{{DUPLICATE_FUNCTION_LOCATIONS}}', escapeHtml(resources.locale.html.duplicateFunctionLocations)],
    ['{{DUPLICATE_FUNCTION_SUMMARY_COLUMN}}', escapeHtml(resources.locale.html.duplicateFunctionSummaryColumn)],
    ['{{DUPLICATE_FUNCTION_ROWS}}', buildDuplicateFunctionRows(analysis, resources)],
    ['{{SIMILAR_FUNCTIONS_HEADING}}', escapeHtml(resources.locale.html.similarFunctionsHeading)],
    ['{{SIMILAR_FUNCTIONS_SUMMARY}}', escapeHtml(resources.locale.html.similarFunctionsSummary)],
    ['{{SIMILAR_FUNCTION_NAME}}', escapeHtml(resources.locale.html.similarFunctionName)],
    ['{{SIMILAR_FUNCTION_FILES}}', escapeHtml(resources.locale.html.similarFunctionFiles)],
    ['{{SIMILAR_FUNCTION_OCCURRENCES}}', escapeHtml(resources.locale.html.similarFunctionOccurrences)],
    ['{{SIMILAR_FUNCTION_LOCATIONS}}', escapeHtml(resources.locale.html.similarFunctionLocations)],
    ['{{SIMILAR_FUNCTION_SUMMARY_COLUMN}}', escapeHtml(resources.locale.html.similarFunctionSummaryColumn)],
    ['{{SIMILAR_FUNCTION_ROWS}}', buildSimilarFunctionRows(analysis, resources)],
    ['{{COCKPIT_HEADING}}', escapeHtml(resources.locale.html.cockpitHeading)],
    ['{{COCKPIT_SUMMARY}}', escapeHtml(resources.locale.html.cockpitSummary)],
    ['{{SCORE_GAUGE}}', buildScoreGauge(analysis, resources)],
    ['{{SCORE_BARS_HEADING}}', escapeHtml(resources.locale.html.scoreBarsHeading)],
    ['{{SCORE_BARS}}', buildScoreBars(analysis)],
    ['{{SIGNAL_HEADING}}', escapeHtml(resources.locale.html.signalHeading)],
    ['{{SIGNAL_CARDS}}', buildSignalCards(analysis, resources)],
    ['{{ARCHITECTURE_SCORE}}', String(analysis.scores.architecture)],
    ['{{NAMING_SCORE}}', String(analysis.scores.naming)],
    ['{{HYGIENE_SCORE}}', String(analysis.scores.hygiene)],
    ['{{MAINTAINABILITY_SCORE}}', String(analysis.scores.maintainability)],
    ['{{TOOLING_SCORE}}', String(analysis.scores.tooling)],
    ['{{QUICK_WINS_HEADING}}', escapeHtml(resources.locale.html.quickWinsHeading)],
    ['{{QUICK_WIN_TABLE_PRIORITY}}', escapeHtml(resources.locale.html.quickWinTablePriority)],
    ['{{QUICK_WIN_TABLE_FILE}}', escapeHtml(resources.locale.html.quickWinTableFile)],
    ['{{QUICK_WIN_TABLE_ACTION}}', escapeHtml(resources.locale.html.quickWinTableAction)],
    ['{{QUICK_WIN_TABLE_REASON}}', escapeHtml(resources.locale.html.quickWinTableReason)],
    ['{{QUICK_WIN_ROWS}}', buildHtmlQuickWinRows(analysis.quickWins, resources)],
    ['{{ISSUE_CARDS_HEADING}}', escapeHtml(resources.locale.html.issueCardsHeading)],
    ['{{ISSUE_CARDS}}', buildHtmlIssueCards(analysis, resources)],
    ['{{RISK_MAP_HEADING}}', escapeHtml(resources.locale.html.riskMapHeading)],
    ['{{RISK_MAP_SUMMARY}}', escapeHtml(resources.locale.html.riskMapSummary)],
    ['{{HOTSPOT_CHART_HEADING}}', escapeHtml(resources.locale.html.hotspotChartHeading)],
    ['{{HOTSPOT_CHART}}', buildHotspotChart(analysis, resources)],
    ['{{DIRECTORY_HEAT_HEADING}}', escapeHtml(resources.locale.html.directoryHeatHeading)],
    ['{{DIRECTORY_HEAT_ROWS}}', buildDirectoryHeatRows(analysis, resources)],
    ['{{DIRECTORY_HEADING}}', escapeHtml(resources.locale.html.directoryHeading)],
    ['{{DIRECTORY_TABLE_DIRECTORY}}', escapeHtml(resources.locale.html.directoryTableDirectory)],
    ['{{DIRECTORY_TABLE_FILES}}', escapeHtml(resources.locale.html.directoryTableFiles)],
    ['{{DIRECTORY_TABLE_RISK}}', escapeHtml(resources.locale.html.directoryTableRisk)],
    ['{{DIRECTORY_TABLE_LARGE_FILES}}', escapeHtml(resources.locale.html.directoryTableLargeFiles)],
    ['{{DIRECTORY_TABLE_SUMMARY}}', escapeHtml(resources.locale.html.directoryTableSummary)],
    ['{{DIRECTORY_ROWS}}', buildHtmlDirectoryRows(analysis, resources)],
    ['{{SPLIT_HEADING}}', escapeHtml(resources.locale.html.splitHeading)],
    ['{{SPLIT_SECTIONS}}', buildHtmlSplitSections(analysis.splitSuggestions, resources)],
    ['{{MIXED_HEADING}}', escapeHtml(resources.locale.html.mixedHeading)],
    ['{{MIXED_TABLE_FILE}}', escapeHtml(resources.locale.html.mixedTableFile)],
    ['{{MIXED_TABLE_CATEGORIES}}', escapeHtml(resources.locale.html.mixedTableCategories)],
    ['{{MIXED_TABLE_TAGS}}', escapeHtml(resources.locale.html.mixedTableTags)],
    ['{{MIXED_TABLE_SUMMARY}}', escapeHtml(resources.locale.html.mixedTableSummary)],
    ['{{MIXED_ROWS}}', buildHtmlMixedRows(analysis, resources)],
    ['{{EXTERNAL_HEADING}}', escapeHtml(resources.locale.html.externalHeading)],
    ['{{EXTERNAL_TOOL}}', escapeHtml(resources.locale.html.externalTool)],
    ['{{EXTERNAL_STATUS}}', escapeHtml(resources.locale.html.externalStatus)],
    ['{{EXTERNAL_ERRORS}}', escapeHtml(resources.locale.html.externalErrors)],
    ['{{EXTERNAL_WARNINGS}}', escapeHtml(resources.locale.html.externalWarnings)],
    ['{{EXTERNAL_SUMMARY}}', escapeHtml(resources.locale.html.externalSummary)],
    ['{{EXTERNAL_ROWS}}', `<tr><td>-</td><td>${escapeHtml(resources.locale.general.none)}</td><td>0</td><td>0</td><td>${escapeHtml(resources.locale.general.none)}</td></tr>`],
    ['{{REFACTOR_HEADING}}', escapeHtml(resources.locale.html.refactorHeading)],
    ['{{REFACTOR_TABLE_PRIORITY}}', escapeHtml(resources.locale.html.refactorTablePriority)],
    ['{{REFACTOR_TABLE_FILE}}', escapeHtml(resources.locale.html.refactorTableFile)],
    ['{{REFACTOR_TABLE_RISK}}', escapeHtml(resources.locale.html.refactorTableRisk)],
    ['{{REFACTOR_TABLE_REASON}}', escapeHtml(resources.locale.html.refactorTableReason)],
    ['{{REFACTOR_TABLE_NEXT_ACTION}}', escapeHtml(resources.locale.html.refactorTableNextAction)],
    ['{{REFACTOR_ROWS}}', buildHtmlRefactorRows(analysis.refactorTargets, resources)],
    ['{{FRAMEWORK_HEADING}}', escapeHtml(resources.locale.html.frameworkHeading)],
    ['{{FRAMEWORK_TABLE_FILE}}', escapeHtml(resources.locale.html.frameworkTableFile)],
    ['{{FRAMEWORK_TABLE_RULE}}', escapeHtml(resources.locale.html.frameworkTableRule)],
    ['{{FRAMEWORK_TABLE_STATUS}}', escapeHtml(resources.locale.html.frameworkTableStatus)],
    ['{{FRAMEWORK_TABLE_SUMMARY}}', escapeHtml(resources.locale.html.frameworkTableSummary)],
    ['{{FRAMEWORK_ROWS}}', buildHtmlFrameworkRows(analysis.frameworkObservations, resources)],
    ['{{ROADMAP_HEADING}}', escapeHtml(resources.locale.html.roadmapHeading)],
    ['{{ROADMAP_PHASE}}', escapeHtml(resources.locale.markdown.roadmapPhase)],
    ['{{ROADMAP_GOAL}}', escapeHtml(resources.locale.markdown.roadmapGoal)],
    ['{{ROADMAP_ROWS}}', buildHtmlRoadmapRows(analysis)],
    ['{{STACK_ITEMS}}', buildStackItems(analysis, resources).map((item) => `<li>${escapeHtml(item)}</li>`).join('')],
    ['{{PRIORITY_ITEMS}}', resources.rubric.recommendationOrder.map((item) => `<li>${escapeHtml(item)}</li>`).join('')],
    ['{{HOTSPOT_ROWS}}', buildHtmlHotspotRows(analysis, resources)],
    ['{{FINDING_SECTIONS}}', buildHtmlFindingSections(analysis.findings, resources)]
  ])

  let html = resources.htmlTemplate
  for (const [placeholder, replacement] of replacements) {
    html = html.replaceAll(placeholder, replacement)
  }

  return html
}

export async function writeAuditReports(
  options: AuditCliOptions,
  analysis: AuditAnalysis,
  resources: AuditResources
): Promise<string[]> {
  const projectName = path.basename(options.projectPath)
  const auditDate = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const outputRoot = options.outputDirectory ?? options.projectPath
  const outputBasePath = path.resolve(outputRoot, options.outputBaseName ?? resources.rubric.report.defaultFileName)
  const outputDirectory = path.dirname(outputBasePath)

  await fs.mkdir(outputDirectory, { recursive: true })

  const generatedFiles: string[] = []
  if (options.outputFormat === 'md' || options.outputFormat === 'both') {
    const markdownPath = `${outputBasePath}.md`
    const markdown = generateMarkdownReport(projectName, auditDate, analysis, resources)
    await fs.writeFile(markdownPath, markdown, 'utf8')
    generatedFiles.push(markdownPath)
  }

  if (options.outputFormat === 'html' || options.outputFormat === 'both') {
    const htmlPath = `${outputBasePath}.html`
    const html = generateHtmlReport(projectName, auditDate, analysis, resources)
    await fs.writeFile(htmlPath, html, 'utf8')
    generatedFiles.push(htmlPath)
  }

  return generatedFiles
}
