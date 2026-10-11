import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

function localFileSystemPlugin(): Plugin {
  return {
    name: 'local-fs-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/fs')) return next()

        const url = new URL(req.url, 'http://localhost')
        const endpoint = url.pathname.replace('/api/fs', '')

        // Helper to parse JSON body
        const readBody = async (): Promise<any> => {
          return new Promise((resolve, reject) => {
            let data = ''
            req.on('data', (chunk) => (data += chunk))
            req.on('end', () => {
              try {
                resolve(data ? JSON.parse(data) : {})
              } catch (e) {
                reject(e)
              }
            })
            req.on('error', reject)
          })
        }

        const sendJson = (data: any, status = 200) => {
          res.writeHead(status, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify(data))
        }

        try {
          if (endpoint === '/list' && req.method === 'GET') {
            const targetDir =
              url.searchParams.get('dir') || '/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red'

            if (!fs.existsSync(targetDir)) {
              return sendJson({ error: 'Directory does not exist', path: targetDir }, 404)
            }

            const readDirTree = (dirPath: string, depth = 0, maxDepth = 6): any[] => {
              if (depth > maxDepth) return []
              try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true })
                return entries
                  .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
                  .map((e) => {
                    const fullPath = path.join(dirPath, e.name)
                    const isDir = e.isDirectory()
                    let size = 0
                    if (!isDir) {
                      try {
                        size = fs.statSync(fullPath).size
                      } catch {}
                    }
                    return {
                      name: e.name,
                      path: fullPath,
                      isDirectory: isDir,
                      ext: isDir ? '' : path.extname(e.name).toLowerCase(),
                      size,
                      children: isDir ? readDirTree(fullPath, depth + 1, maxDepth) : undefined,
                    }
                  })
                  .sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1
                    if (!a.isDirectory && b.isDirectory) return 1
                    return a.name.localeCompare(b.name, undefined, { numeric: true })
                  })
              } catch (err) {
                return []
              }
            }

            const items = readDirTree(targetDir, 0, 6)
            return sendJson({ dir: targetDir, items })
          }

          if (endpoint === '/read' && req.method === 'GET') {
            const filePath = url.searchParams.get('path')
            if (!filePath || !fs.existsSync(filePath)) {
              return sendJson({ error: 'File does not exist' }, 404)
            }
            const content = fs.readFileSync(filePath, 'utf-8')
            return sendJson({
              path: filePath,
              name: path.basename(filePath),
              ext: path.extname(filePath).toLowerCase(),
              content,
            })
          }

          if (endpoint === '/raw' && (req.method === 'GET' || req.method === 'HEAD')) {
            const rawPath = decodeURIComponent(url.searchParams.get('path') || '')
            const baseDir =
              decodeURIComponent(url.searchParams.get('dir') || '') ||
              decodeURIComponent(url.searchParams.get('vault') || '') ||
              '/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red'

            if (!rawPath) {
              res.writeHead(400, { 'Content-Type': 'text/plain' })
              return res.end('Path is required')
            }

            const candidates = [
              rawPath,
              path.resolve(baseDir, rawPath),
              path.resolve(baseDir, '0-asset', rawPath),
              path.resolve(baseDir, 'attachments', rawPath),
              path.resolve(baseDir, 'assets', rawPath),
              path.resolve(path.dirname(rawPath), '0-asset', path.basename(rawPath)),
            ]

            let resolvedPath = candidates.find((p) => {
              try {
                return fs.existsSync(p) && fs.statSync(p).isFile()
              } catch {
                return false
              }
            })

            // If not found directly, search vault recursively for filename
            if (!resolvedPath) {
              const targetName = path.basename(rawPath)
              const searchVault = (dir: string, depth = 0): string | null => {
                if (depth > 6) return null
                try {
                  const entries = fs.readdirSync(dir, { withFileTypes: true })
                  for (const entry of entries) {
                    if (entry.name.startsWith('.git') || entry.name === 'node_modules' || entry.name === '.trash') continue
                    const full = path.join(dir, entry.name)
                    if (entry.isFile() && entry.name === targetName) {
                      return full
                    }
                    if (entry.isDirectory()) {
                      const found = searchVault(full, depth + 1)
                      if (found) return found
                    }
                  }
                } catch {}
                return null
              }
              resolvedPath = searchVault(baseDir) || undefined
            }

            if (!resolvedPath || !fs.existsSync(resolvedPath)) {
              res.writeHead(404, { 'Content-Type': 'text/plain' })
              return res.end('Image not found')
            }

            const ext = path.extname(resolvedPath).toLowerCase()
            const mimeMap: Record<string, string> = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.svg': 'image/svg+xml',
              '.webp': 'image/webp',
              '.bmp': 'image/bmp',
              '.ico': 'image/x-icon',
              '.pdf': 'application/pdf',
            }
            const contentType = mimeMap[ext] || 'application/octet-stream'

            res.writeHead(200, {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
              'Access-Control-Allow-Origin': '*',
            })
            return fs.createReadStream(resolvedPath).pipe(res)
          }

          if (endpoint === '/write' && req.method === 'POST') {
            const body = await readBody()
            const { path: filePath, content } = body
            if (!filePath) return sendJson({ error: 'Path is required' }, 400)

            const dir = path.dirname(filePath)
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true })
            }
            fs.writeFileSync(filePath, content ?? '', 'utf-8')
            return sendJson({ success: true, path: filePath })
          }

          if (endpoint === '/create' && req.method === 'POST') {
            const body = await readBody()
            const { path: targetPath, type, content = '' } = body
            if (!targetPath) return sendJson({ error: 'Path is required' }, 400)

            if (fs.existsSync(targetPath)) {
              return sendJson({ error: 'File or folder already exists' }, 409)
            }

            if (type === 'dir') {
              fs.mkdirSync(targetPath, { recursive: true })
            } else {
              const dir = path.dirname(targetPath)
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
              fs.writeFileSync(targetPath, content, 'utf-8')
            }
            return sendJson({ success: true, path: targetPath })
          }

          if (endpoint === '/delete' && req.method === 'POST') {
            const body = await readBody()
            const { path: targetPath } = body
            if (!targetPath || !fs.existsSync(targetPath)) {
              return sendJson({ error: 'Path does not exist' }, 404)
            }
            const stat = fs.statSync(targetPath)
            if (stat.isDirectory()) {
              fs.rmSync(targetPath, { recursive: true, force: true })
            } else {
              fs.unlinkSync(targetPath)
            }
            return sendJson({ success: true })
          }

          if (endpoint === '/rename' && req.method === 'POST') {
            const body = await readBody()
            const { oldPath, newPath } = body
            if (!oldPath || !newPath || !fs.existsSync(oldPath)) {
              return sendJson({ error: 'Invalid path' }, 400)
            }
            fs.renameSync(oldPath, newPath)
            return sendJson({ success: true, newPath })
          }

          if (endpoint === '/search' && req.method === 'GET') {
            const rootDir =
              url.searchParams.get('dir') || '/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red'
            const query = (url.searchParams.get('query') || '').toLowerCase().trim()

            if (!fs.existsSync(rootDir) || !query) {
              return sendJson({ results: [] })
            }

            const results: Array<{ path: string; name: string; isDirectory: boolean }> = []
            const walk = (d: string, depth = 0) => {
              if (depth > 6 || results.length >= 40) return
              try {
                const list = fs.readdirSync(d, { withFileTypes: true })
                for (const item of list) {
                  if (item.name.startsWith('.git') || item.name === '.trash') continue
                  const full = path.join(d, item.name)
                  if (item.name.toLowerCase().includes(query)) {
                    results.push({ path: full, name: item.name, isDirectory: item.isDirectory() })
                  }
                  if (item.isDirectory()) {
                    walk(full, depth + 1)
                  }
                }
              } catch {}
            }

            walk(rootDir)
            return sendJson({ results })
          }

          next()
        } catch (err: any) {
          sendJson({ error: err.message || 'Server error' }, 500)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localFileSystemPlugin()],
  // Giữ port cố định để Tauri devUrl luôn trỏ đúng
  server: {
    port: 5173,
    strictPort: true,
  },
  define: {
    'process.env.IS_PREACT': JSON.stringify('false'),
  },
})
