const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// watchFolders must cover the monorepo root so Metro can reach the real package
// files that pnpm symlinks point to inside node_modules/.pnpm/.
// Narrowing this (e.g. to packages/types only) breaks @babel/runtime and all
// other packages because their symlink targets fall outside Metro's file map.
config.watchFolders = [monorepoRoot]

// Follow pnpm symlinks — pnpm stores real files in node_modules/.pnpm/ and
// symlinks them from each workspace's node_modules directory.
config.resolver.unstable_enableSymlinks = true

// Escape a path string for use in a RegExp literal.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Exclude server code and task files from Metro's module graph.
// Metro still indexes node_modules for package resolution, but it never
// transforms server-side TypeScript, Prisma, Express routes, etc.
// This keeps the initial bundle graph small and fast.
config.resolver.blockList = [
  new RegExp(`^${esc(path.resolve(monorepoRoot, 'apps', 'server'))}[/\\\\].*`),
  new RegExp(`^${esc(path.resolve(monorepoRoot, '.tmp'))}[/\\\\].*`),
]

// Resolve workspace packages from both mobile's and the monorepo root's node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

module.exports = config
