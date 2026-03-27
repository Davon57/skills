import fs from 'node:fs/promises'
import path from 'node:path'
import { ToolingMetadata, WorkspaceFile } from './types.js'

const ESLINT_CANDIDATES = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs'
]

const TS_CONFIG_CANDIDATES = ['tsconfig.json', 'tsconfig.app.json']

interface PackageJsonShape {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function readPackageJson(projectPath: string): Promise<PackageJsonShape | null> {
  const packageJsonPath = path.join(projectPath, 'package.json')
  if (!(await pathExists(packageJsonPath))) {
    return null
  }

  const raw = await fs.readFile(packageJsonPath, 'utf8')
  return JSON.parse(raw) as PackageJsonShape
}

function getPackageManager(projectPath: string): Promise<string> {
  return (async () => {
    if (await pathExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
      return 'pnpm'
    }

    if (await pathExists(path.join(projectPath, 'yarn.lock'))) {
      return 'yarn'
    }

    if (await pathExists(path.join(projectPath, 'package-lock.json'))) {
      return 'npm'
    }

    return 'unknown'
  })()
}

function inferLanguage(packageNames: Set<string>, files: WorkspaceFile[]): string {
  if (packageNames.has('typescript') || files.some((file) => file.extension === '.ts' || file.extension === '.tsx')) {
    return 'TypeScript'
  }

  return 'JavaScript'
}

function inferFramework(packageNames: Set<string>): string {
  if (packageNames.has('react') || packageNames.has('react-dom')) {
    return 'React'
  }

  if (packageNames.has('vue')) {
    return 'Vue'
  }

  if (packageNames.has('@angular/core')) {
    return 'Angular'
  }

  return 'unknown'
}

function inferBundler(packageNames: Set<string>): string {
  if (packageNames.has('vite')) {
    return 'Vite'
  }

  if (packageNames.has('webpack')) {
    return 'Webpack'
  }

  if (packageNames.has('@angular/cli')) {
    return 'Angular CLI'
  }

  return 'unknown'
}

export async function detectToolingMetadata(projectPath: string, files: WorkspaceFile[]): Promise<ToolingMetadata> {
  const packageJson = await readPackageJson(projectPath)
  const dependencies = Object.keys(packageJson?.dependencies ?? {})
  const devDependencies = Object.keys(packageJson?.devDependencies ?? {})
  const packageNames = new Set([...dependencies, ...devDependencies])
  const scripts = Object.keys(packageJson?.scripts ?? {})

  const [packageManager, hasTsConfig, hasEslintConfig] = await Promise.all([
    getPackageManager(projectPath),
    Promise.all(TS_CONFIG_CANDIDATES.map((name) => pathExists(path.join(projectPath, name)))).then((results) => results.some(Boolean)),
    Promise.all(ESLINT_CANDIDATES.map((name) => pathExists(path.join(projectPath, name)))).then((results) => results.some(Boolean))
  ])

  return {
    packageManager,
    framework: inferFramework(packageNames),
    language: inferLanguage(packageNames, files),
    bundler: inferBundler(packageNames),
    hasPackageJson: packageJson !== null,
    hasTsConfig,
    hasEslintConfig,
    scripts
  }
}
