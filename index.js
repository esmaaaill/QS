// Basic Express server exposing authentication/authorization helpers for the Quick Stay demo UI.
// The goal is to provide simple, file-based storage so the site can create accounts and log in locally
// without needing a separate database service.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Ensure the data file exists so read/write operations do not fail.
fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}

// Helper: read all users from disk.
function readUsers() {
  const raw = fs.readFileSync(USERS_FILE, 'utf8');
  return JSON.parse(raw);
}

// Helper: persist updated users back to disk.
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Helper: create a signed JSON Web Token for a user payload.
function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '1d' });
}

// Middleware: verify Authorization header and attach user payload if valid.
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing token.' });
  }

  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

app.use(express.json());

// Serve the existing static site assets from the repository root.
app.use(express.static(path.join(__dirname)));

// API: register a new user account.
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  const users = readUsers();
  const emailExists = users.some((user) => user.email.toLowerCase() === email.toLowerCase());
  if (emailExists) {
    return res.status(409).json({ message: 'An account with that email already exists.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { id: randomUUID(), email, name, password: hashedPassword, createdAt: new Date().toISOString() };
  users.push(newUser);
  writeUsers(users);

  const token = createToken(newUser);
  return res.status(201).json({
    message: 'Account created successfully.',
    token,
    user: { id: newUser.id, email: newUser.email, name: newUser.name },
  });
});

// API: log in with an existing email/password combination.
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const users = readUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = createToken(user);
  return res.json({ message: 'Login successful.', token, user: { id: user.id, email: user.email, name: user.name } });
});

// API: protected route to verify token ownership.
app.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json({
    message: 'Token is valid.',
    user: { id: req.user.id, email: req.user.email, name: req.user.name },
  });
});

// Fallback for unknown API routes to avoid serving index.html for API mistakes.
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API route not found.' });
});

app.listen(PORT, () => {
  console.log(`Quick Stay server running on http://localhost:${PORT}`);
});
