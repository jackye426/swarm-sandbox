'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const TODOS_FILE = process.env.TODOS_FILE || path.join(__dirname, 'data/todos.json');

// Ensure data directory exists on startup
fs.mkdirSync(path.dirname(TODOS_FILE), { recursive: true });

function loadTodos() {
  if (!fs.existsSync(TODOS_FILE)) return [];
  return JSON.parse(fs.readFileSync(TODOS_FILE, 'utf8'));
}

function saveTodos(todos) {
  const tmp = path.join(path.dirname(TODOS_FILE), '.todos.tmp');
  fs.writeFileSync(tmp, JSON.stringify(todos, null, 2));
  fs.renameSync(tmp, TODOS_FILE);
}

// AC-10: persist [] to disk when the todos file is missing
if (!fs.existsSync(TODOS_FILE)) {
  saveTodos([]);
}

const app = express();

// ---------------------------------------------------------------------------
// AI analysis endpoint (T-013): POST /api/ai
// ---------------------------------------------------------------------------

const MAX_BODY = 1024 * 1024; // 1 MB request body limit (AC-6)
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'deepseek/deepseek-v4-pro';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const AI_SYSTEM_PROMPT = [
  'You are a task-prioritization assistant.',
  'Given a JSON object with "tasks" (array of task strings) and "thoughts" (free-form context from the user),',
  'assign each task a priority from 1 (lowest) to 10 (highest) with a one-sentence reason,',
  'and write one short growth-mindset encouragement message for the user.',
  'Respond with STRICT JSON only, no markdown, in exactly this shape:',
  '{"tasks":[{"text":"<original task>","priority":<1-10>,"reason":"<one sentence>"}],"message":"<encouragement>"}',
  'Include every input task exactly once, preserving its original text.',
].join(' ');

function validateAiPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'body must be a JSON object';
  }
  const { tasks, thoughts } = payload;
  if (!Array.isArray(tasks)) return 'tasks must be an array of strings';
  if (tasks.length === 0) return 'tasks must not be empty';
  if (!tasks.every((t) => typeof t === 'string' && t.trim().length > 0)) {
    return 'tasks must contain only non-empty strings';
  }
  if (typeof thoughts !== 'string') return 'thoughts must be a string';
  return null;
}

// Strip optional markdown code fences (e.g. ```json ... ```) before parsing.
function parseAiContent(content) {
  if (typeof content !== 'string') return null;
  const stripped = content
    .replace(/^\s*```[a-zA-Z]*\s*/, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

function isValidAiResult(result, taskCount) {
  return (
    result !== null &&
    typeof result === 'object' &&
    Array.isArray(result.tasks) &&
    result.tasks.length === taskCount &&
    result.tasks.every(
      (t) =>
        t !== null &&
        typeof t === 'object' &&
        typeof t.text === 'string' &&
        typeof t.priority === 'number' &&
        typeof t.reason === 'string'
    ) &&
    typeof result.message === 'string'
  );
}

async function handleAiRequest(payload, res) {
  try {

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({ tasks: payload.tasks, thoughts: payload.thoughts }) },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      return res.status(500).json({ error: 'AI service unavailable' });
    }
    const data = await response.json();
    const content =
      data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : null;
    const result = parseAiContent(content);
    if (!isValidAiResult(result, payload.tasks.length)) {
      return res.status(500).json({ error: 'AI response parse error' });
    }
    return res.json(result);
  } catch {
    return res.status(500).json({ error: 'AI service unavailable' });
  }
}

// Registered BEFORE express.json() so the raw stream is read here, allowing
// explicit 1 MB enforcement on both the Content-Length header and the actual
// streamed bytes (AC-6).
app.post('/api/ai', (req, res) => {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY) {
    req.resume(); // drain without buffering
    return res.status(413).json({ error: 'Payload too large (limit 1 MB)' });
  }

  const chunks = [];
  let received = 0;
  let limited = false;

  req.on('data', (chunk) => {
    if (limited) return;
    received += chunk.length;
    if (received > MAX_BODY) {
      limited = true;
      chunks.length = 0;
      res.status(413).json({ error: 'Payload too large (limit 1 MB)' });
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (limited) return;
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    const validationError = validateAiPayload(payload);
    if (validationError) {
      return res.status(422).json({ error: validationError });
    }
    handleAiRequest(payload, res);
  });

  req.on('error', () => {
    if (!res.headersSent) res.status(400).json({ error: 'Request stream error' });
  });
});

app.all('/api/ai', (req, res) => {
  res.status(405).json({ error: 'Method not allowed' });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/todos', (req, res) => {
  res.json(loadTodos());
});

app.post('/api/todos', (req, res) => {
  const { text } = req.body;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text required' });
  }
  const todo = {
    id: crypto.randomUUID(),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
  const todos = loadTodos();
  todos.push(todo);
  saveTodos(todos);
  res.status(201).json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
  const todos = loadTodos();
  const filtered = todos.filter(t => t.id !== req.params.id);
  if (filtered.length === todos.length) {
    return res.status(404).json({ error: 'not found' });
  }
  saveTodos(filtered);
  res.status(204).end();
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
  });
}

module.exports = { app };
