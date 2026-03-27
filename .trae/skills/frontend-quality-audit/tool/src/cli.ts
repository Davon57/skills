import { analyzeWorkspaceSnapshot } from './analysis.js'
import { parseCliArgs } from './args.js'
import { writeAuditReports } from './render.js'
import { loadAuditResources } from './resources.js'
import { createAuditSummary } from './summary.js'
import { detectToolingMetadata } from './tooling.js'
import { createWorkspaceSnapshot } from './workspace.js'

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2))
  const resources = await loadAuditResources()
  const snapshot = await createWorkspaceSnapshot(options.projectPath, options.includeExtensions)
  const tooling = await detectToolingMetadata(options.projectPath, snapshot.files)
  const analysis = analyzeWorkspaceSnapshot(snapshot, tooling, resources)
  const generatedFiles = await writeAuditReports(options, analysis, resources)

  const summary = createAuditSummary(options, resources, snapshot, analysis, generatedFiles)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
