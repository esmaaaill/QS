# Quick Stay demo backend and UI

This repository contains the Quick Stay marketing site plus a lightweight Express server that adds authentication and authorization basics. The backend intentionally stays file-based so it can run anywhere without a database while still letting you sign up with an email address, log in, and verify protected routes.

## Features
- **Static marketing pages** served directly from the repository root (`index.html`, `places.html`, `about.html`, etc.).
- **Illustration-based hero/recommendation images** stored locally in `assets/images` so the homepage visuals always load without relying on third-party CDNs.
- **Authentication API** with sign-up, login, and token verification powered by JSON Web Tokens (JWT).
- **Demo session UI** on `booking.html` that lets you create an account, log in, verify your token, and log out. Tokens are persisted in `localStorage` for convenience.
- **Accessible, documented JavaScript** (`assets/app.js`) with comments explaining each part of the client-side logic.

## Prerequisites
- Node.js 18+ and npm installed on your machine.
- Network access for npm to install dependencies.

## Getting started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server (serves the static site and the API):
   ```bash
   npm start
   ```
   The server defaults to `http://localhost:3000`. Set `PORT` to override.
3. Open the site in your browser at the server URL and navigate to **Booking** to try the auth flows.
4. (Optional) Seed the demo Supabase user used in QA:
   ```bash
   cp .env.example .env # fill in your Supabase keys
   npm run seed:user
   ```

### Environment variables
- `PORT`: Optional. Port for the Express server (defaults to `3000`).
- `JWT_SECRET`: Optional. Secret for signing JWT tokens (defaults to a development string). Always override this in production.

## API reference
All endpoints are prefixed with `/api` and return JSON.

### `POST /api/auth/signup`
Create a new user.
- Body: `{ "name": "string", "email": "string", "password": "string" }`
- Success: `201` with `{ message, token, user }`.
- Errors: `400` (missing fields) or `409` (email already exists).

### `POST /api/auth/login`
Authenticate an existing user.
- Body: `{ "email": "string", "password": "string" }`
- Success: `200` with `{ message, token, user }`.
- Errors: `400` (missing fields) or `401` (invalid credentials).

### `GET /api/auth/me`
Protected route that validates the provided token.
- Header: `Authorization: Bearer <token>`.
- Success: `200` with `{ message, user }`.
- Errors: `401` when the token is missing, expired, or invalid.

## Data storage
- User records are stored in `data/users.json`. The file is created automatically on first run.
- Passwords are hashed with `bcryptjs`; only the hash is persisted.
- The server uses `randomUUID` to generate unique user IDs.

## Front-end integrations
- `booking.html` contains sign-up and login forms plus a session status card. All controls call the Express API via `fetch`.
- Tokens are saved to `localStorage` under the key `qs_token` so refreshing the page keeps you signed in.
- The search, booking, and contact interactions remain unchanged; extra comments in `assets/app.js` describe each initializer.

## Notes and recommendations
- This demo is intentionally minimal. For production, add HTTPS, input rate limiting, password complexity checks, and persistent storage such as PostgreSQL or MongoDB.
- Clear `data/users.json` to reset accounts while testing.
- Replace `JWT_SECRET` with a strong, unique value before exposing the server publicly.
