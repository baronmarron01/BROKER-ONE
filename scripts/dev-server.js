import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 3000);
const api = {
  '/api/health': (await import('../api/health.js')).default,
  '/api/classify': (await import('../api/classify.js')).default,
  '/api/match': (await import('../api/match.js')).default,
  '/api/search': (await import('../api/search.js')).default,
  '/api/ai': (await import('../api/ai.js')).default
};
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };

function adapter(response) {
  return {
    setHeader: (...args) => response.setHeader(...args),
    status(code) { response.statusCode = code; return this; },
    json(value) { response.setHeader('Content-Type','application/json; charset=utf-8'); response.end(JSON.stringify(value)); return this; },
    end(value) { response.end(value); return this; }
  };
}

async function parseBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, `http://${req.headers.host}`).pathname;
    if (api[path]) {
      req.body = await parseBody(req);
      req.socket = req.socket || {};
      return api[path](req, adapter(res));
    }
    const file = path === '/' ? 'index.html' : path.replace(/^\//,'');
    if (!['index.html','app.js','db.js','styles.css','workspace.css','search.css'].includes(file)) { res.statusCode=404; return res.end('Not found'); }
    const data = await readFile(join(root,'public',file));
    res.setHeader('Content-Type',mime[extname(file)] || 'application/octet-stream');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://qcymqanttwaoliksosui.supabase.co; frame-ancestors 'none'");
    res.end(data);
  } catch (error) {
    res.statusCode = 400;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ error:{ code:'LOCAL_SERVER_ERROR', message:error.message } }));
  }
});

server.listen(port, () => console.log(`BROKER-ONE local server: http://localhost:${port}`));
