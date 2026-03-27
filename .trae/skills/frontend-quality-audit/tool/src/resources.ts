import fs from 'node:fs/promises'
import path from 'node:path'
import { AuditResources } from './types.js'

const RESOURCE_DIRECTORY = path.resolve(process.cwd(), '..', 'resources')

async function readText(fileName: string): Promise<string> {
  return fs.readFile(path.join(RESOURCE_DIRECTORY, fileName), 'utf8')
}

export async function loadAuditResources(): Promise<AuditResources> {
  const [localeRaw, rubricRaw, markdownTemplate, htmlTemplate] = await Promise.all([
    readText('locale.zh-CN.json'),
    readText('rubric.json'),
    readText('report-template.md'),
    readText('report-template.html')
  ])

  return {
    locale: JSON.parse(localeRaw) as AuditResources['locale'],
    rubric: JSON.parse(rubricRaw) as AuditResources['rubric'],
    markdownTemplate,
    htmlTemplate
  }
}
