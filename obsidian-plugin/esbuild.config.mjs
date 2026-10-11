import esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const watch = process.argv.includes('--watch')

const externals = [
  'obsidian',
  'electron',
  '@codemirror/autocomplete',
  '@codemirror/collab',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/lint',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/view',
  '@lezer/common',
  '@lezer/highlight',
  '@lezer/lr',
]

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: externals,
  format: 'cjs',
  target: 'es2020',
  outfile: 'main.js',
  jsx: 'automatic',
  logLevel: 'info',
  // Một bản React duy nhất (lấy từ root) — 2 bản React sẽ vỡ hooks
  // + alias `@` → `src/` (dùng chung code app: types, lib, features)
  alias: {
    '@': path.join(root, 'src'),
    react: path.join(root, 'node_modules', 'react'),
    'react-dom': path.join(root, 'node_modules', 'react-dom'),
  },
  plugins: [
    {
      name: 'excalidraw-stub',
      setup(build) {
        // Plugin Obsidian không ship engine Excalidraw (1MB+, không dùng tới)
        build.onResolve({ filter: /^@excalidraw\/excalidraw(\/.*)?$/ }, () => ({
          path: path.join(__dirname, 'src', 'excalidraw-stub.ts'),
        }))
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: {
    '.css': 'css',
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
    '.eot': 'file',
  },
})

if (watch) {
  await ctx.watch()
  console.log('watching obsidian-plugin...')
} else {
  await ctx.rebuild()
  await ctx.dispose()
  console.log('plugin bundled → main.js (+ chunks nếu có)')
}
