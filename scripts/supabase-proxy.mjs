// Local stand-in for a Supabase project URL, used by the "supabase" E2E
// project: /rest/v1 goes to the PostgREST started by integration-env.sh,
// a few /auth/v1 endpoints are answered here, realtime is refused.
// Usage: node scripts/supabase-proxy.mjs   (PROXY_PORT, REST_PORT)
import http from 'node:http'

const PORT = Number(process.env.PROXY_PORT ?? 54331)
const REST = `http://localhost:${process.env.REST_PORT ?? 54330}`

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range, content-profile, x-client-info',
}

function userFromAuth(header) {
  const token = (header ?? '').replace(/^Bearer /, '')
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return { id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.email, app_metadata: {}, user_metadata: {} }
  } catch {
    return null
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end()
    return
  }
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/favicon.ico') {
    res.writeHead(204, cors).end()
    return
  }
  if (url.pathname === '/health') {
    res.writeHead(200, cors).end('ok')
    return
  }

  if (url.pathname.startsWith('/rest/v1')) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const headers = { ...req.headers }
    delete headers.host
    delete headers.origin
    const upstream = await fetch(REST + url.pathname.replace('/rest/v1', '') + url.search, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    })
    const out = { ...cors }
    upstream.headers.forEach((value, key) => {
      if (!key.startsWith('access-control') && key !== 'content-encoding' && key !== 'content-length' && key !== 'transfer-encoding') out[key] = value
    })
    res.writeHead(upstream.status, out).end(Buffer.from(await upstream.arrayBuffer()))
    return
  }

  if (url.pathname === '/auth/v1/user') {
    const user = userFromAuth(req.headers.authorization)
    res.writeHead(user ? 200 : 401, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(user ?? { message: 'invalid token' }))
    return
  }
  if (url.pathname === '/auth/v1/logout') {
    res.writeHead(204, cors).end()
    return
  }
  if (url.pathname === '/auth/v1/authorize') {
    res.writeHead(200, { ...cors, 'content-type': 'text/html' }).end(`<h1>OAuth ${url.searchParams.get('provider')}</h1>`)
    return
  }

  res.writeHead(404, { ...cors, 'content-type': 'application/json' }).end('{"message":"not found"}')
})

// Realtime websockets are not emulated.
server.on('upgrade', (_req, socket) => socket.destroy())
server.listen(PORT, () => console.log(`Supabase proxy on http://localhost:${PORT} → ${REST}`))
