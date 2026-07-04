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

app.listen(PORT, () => {
  console.log(`server listening on port ${PORT}`);
});
