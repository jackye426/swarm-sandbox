'use strict';

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --- helpers ---

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const options = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function waitForServer(port, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function poll() {
      request(port, 'GET', '/api/todos').then((res) => {
        if (res.status === 200) return resolve();
        retry();
      }).catch(retry);
    }
    function retry() {
      if (Date.now() - start > timeout) return reject(new Error('Server startup timeout'));
      setTimeout(poll, 100);
    }
    poll();
  });
}

// --- test runner ---

const results = [];

function assert(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    results.push({ name, ok: true });
  } else {
    console.log(`fail ${name}${detail ? ': ' + detail : ''}`);
    results.push({ name, ok: false, detail });
  }
}

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todos-api-'));
  const TODOS_FILE = path.join(tmpDir, 'todos.json');
  const port = await findFreePort();

  const serverPath = path.join(__dirname, '..', 'server.js');
  const proc = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port), TODOS_FILE },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  try {
    await waitForServer(port);

    // T1: GET /api/todos → 200, body []
    const t1 = await request(port, 'GET', '/api/todos');
    assert('T1 GET /api/todos returns 200', t1.status === 200, `status=${t1.status}`);
    assert('T1 body is empty array', Array.isArray(t1.body) && t1.body.length === 0, JSON.stringify(t1.body));

    // T2: POST /api/todos { text: "buy milk" } → 201
    const t2 = await request(port, 'POST', '/api/todos', { text: 'buy milk' });
    assert('T2 POST returns 201', t2.status === 201, `status=${t2.status}`);
    assert('T2 body has id (string)', typeof t2.body.id === 'string' && t2.body.id.length > 0);
    assert('T2 body text equals "buy milk"', t2.body.text === 'buy milk');
    assert('T2 body has valid createdAt', typeof t2.body.createdAt === 'string' && !isNaN(Date.parse(t2.body.createdAt)));
    const createdId = t2.body.id;

    // T3: POST /api/todos {} → 400
    const t3 = await request(port, 'POST', '/api/todos', {});
    assert('T3 POST without text returns 400', t3.status === 400, `status=${t3.status}`);

    // T4: POST /api/todos { text: "   " } → 400
    const t4 = await request(port, 'POST', '/api/todos', { text: '   ' });
    assert('T4 POST whitespace text returns 400', t4.status === 400, `status=${t4.status}`);

    // T7a: GET after POST contains created todo
    const t7a = await request(port, 'GET', '/api/todos');
    assert('T7a GET after POST contains todo', Array.isArray(t7a.body) && t7a.body.some(t => t.id === createdId));

    // T5: DELETE /api/todos/:id → 204
    const t5 = await request(port, 'DELETE', `/api/todos/${createdId}`);
    assert('T5 DELETE existing returns 204', t5.status === 204, `status=${t5.status}`);

    // T6: DELETE /api/todos/<nonexistent> → 404
    const t6 = await request(port, 'DELETE', '/api/todos/00000000-0000-0000-0000-000000000000');
    assert('T6 DELETE nonexistent returns 404', t6.status === 404, `status=${t6.status}`);

    // T7b: GET after DELETE returns []
    const t7b = await request(port, 'GET', '/api/todos');
    assert('T7b GET after DELETE returns empty array', Array.isArray(t7b.body) && t7b.body.length === 0, JSON.stringify(t7b.body));

  } finally {
    proc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }

  const failures = results.filter(r => !r.ok);
  if (failures.length === 0) {
    console.log(`\ntest:api: PASS (${results.length}/${results.length})`);
    process.exit(0);
  } else {
    console.log(`\ntest:api: FAIL (${failures.length} of ${results.length} failed)`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('test:api: ERROR', err);
  process.exit(1);
});
