# LARPABLE — Backend Architecture

## Overview

Full backend for a student opportunity platform. Node.js/Express server serving the frontend and a JSON-file-based data store. All sensitive data is hashed (SHA-256) or encrypted (AES-256-GCM) at rest. Sessions persist across browser tabs via httpOnly cookies.

---

## 1. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js 22 | Fast, built-in crypto |
| Framework | Express 4 | Lightweight, proven |
| Hashing | SHA-256 (crypto module) | Passwords, usernames, sensitive fields |
| Encryption | AES-256-GCM (crypto module) | Reversible data (names, emails for display) |
| Storage | JSON files on disk | Simple, no DB dependency |
| Sessions | Signed httpOnly cookies | Persistent across tabs, secure |
| Frontend | Static HTML + fetch() | Already built, just needs API calls |

---

## 2. Directory Structure

```
larpable/
├── BACKEND_ARCHITECTURE.md          ← this file
├── server.js                        ← Express entry point
├── package.json
├── backend/
│   ├── crypto.js                    ← hash + encrypt/decrypt utilities
│   ├── store.js                     ← JSON file CRUD with auto-encrypt
│   ├── auth.js                      ← signup, login, session management
│   ├── routes/
│   │   ├── auth.routes.js           ← POST /api/auth/signup, /login, /logout, /me
│   │   ├── opportunity.routes.js    ← CRUD /api/opportunities
│   │   └── user.routes.js           ← GET/PATCH /api/users/me
│   └── data/                        ← JSON storage (gitignored)
│       ├── users.json               ← encrypted user records
│       ├── sessions.json            ← active session tokens
│       └── opportunities.json       ← encrypted opportunity records
├── web_app/                         ← frontend (served statically)
│   ├── index.html
│   ├── loading_page.html
│   ├── login.html
│   ├── signup.html
│   ├── feed.html
│   ├── opportunity_student.html
│   ├── opportunity_nonprofit.html
│   ├── opportunity_company.html
│   ├── create_student.html
│   ├── create_nonprofit.html
│   └── create_company.html
└── template/                        ← design system reference
```

---

## 3. Security Model

### 3.1 What Gets Hashed (SHA-256, irreversible)

| Field | Purpose |
|-------|---------|
| `password` | Password verification — never stored in plaintext |
| `username` | Login lookup — hash-first, then find |
| `contact_email` | Opportunity contact info — hashed for lookup, encrypted for display |
| `session_token` | Session cookie value — only the hash is stored in sessions.json |
| `opportunity_id` | ID generation — deterministic from content hash |

### 3.2 What Gets Encrypted (AES-256-GCM, reversible)

| Field | Why |
|-------|-----|
| `display_name` (first + last) | Need to show on cards |
| `email` | Need to show in contact, send notifications later |
| `school` / `org_name` / `company_name` | Display on cards and detail pages |
| `description` | Must display in full |
| `location` | Display on cards |
| `mission_statement` | Display on profile |
| `about_company` | Display on profile |
| All other free-text user content | Displayable but protected |

### 3.3 Encryption Scheme

```
Encrypt(plaintext, key):
  1. Generate random 12-byte IV
  2. AES-256-GCM encrypt with key + IV
  3. Get 16-byte auth tag
  4. Return: base64(iv) + ":" + base64(authTag) + ":" + base64(ciphertext)

Decrypt(encrypted, key):
  1. Split on ":"
  2. Decode IV, authTag, ciphertext from base64
  3. AES-256-GCM decrypt with key + IV + authTag
  4. Return plaintext
```

The encryption key is stored in an env variable `ENCRYPTION_KEY` (64 hex chars = 32 bytes).

### 3.4 Hashing Scheme

```
SHA-256(password + salt)
```

Each user gets a random 16-byte salt at signup. Stored alongside the hash.

---

## 4. Data Models

### 4.1 User Record (users.json)

```json
{
  "id": "usr_<sha256-of-username-hash>",
  "username_hash": "sha256(salt + username)",
  "username_salt": "base64(16 bytes)",
  "password_hash": "sha256(salt + password)",
  "password_salt": "base64(16 bytes)",
  "type": "student|nonprofit|business",
  "created_at": "ISO timestamp",
  
  "encrypted_fields": {
    "first_name": "enc:...",
    "last_name": "enc:...",
    "email": "enc:...",
    
    "student": {
      "age": 16,
      "grade": "11th — Junior",
      "school": "enc:...",
      "location": "enc:...",
      "interests": ["enc:...", "enc:..."],
      "skills": ["enc:...", "enc:..."]
    },
    
    "nonprofit": {
      "org_name": "enc:...",
      "location": "enc:...",
      "team_size": "enc:...",
      "founded": "enc:...",
      "website": "enc:...",
      "mission": "enc:...",
      "field": "Education"
    },
    
    "business": {
      "company_name": "enc:...",
      "location": "enc:...",
      "company_size": "enc:...",
      "stage": "enc:...",
      "website": "enc:...",
      "about": "enc:...",
      "industry": "Technology / SaaS"
    }
  }
}
```

### 4.2 Session Record (sessions.json)

```json
{
  "<session_token_hash>": {
    "user_id": "usr_...",
    "created_at": "ISO timestamp",
    "expires_at": "ISO timestamp",
    "user_agent": "Mozilla/5.0...",
    "ip_hash": "sha256(ip)"
  }
}
```

- Session tokens: 32-byte random, stored as SHA-256 hash
- Cookie: `session_token=<plaintext_token>; HttpOnly; SameSite=Strict; Path=/`
- TTL: 30 days
- One session per browser (new login replaces old)

### 4.3 Opportunity Record (opportunities.json)

```json
{
  "id": "opp_<content-hash>",
  "type": "student|nonprofit|company",
  "created_by": "usr_...",
  "created_at": "ISO timestamp",
  
  "encrypted_fields": {
    "title": "enc:...",
    "description": "enc:...",
    "issuer_name": "enc:...",
    "issuer_context": "enc:...",
    "location": "enc:...",
    "time_commitment": "enc:...",
    "duration": "enc:...",
    "compensation": "enc:...",
    "contact": "enc:...",
    
    "student": {
      "looking_for": "enc:...",
      "team_size": "enc:...",
      "skills": ["enc:...", "enc:..."]
    },
    
    "nonprofit": {
      "field": "enc:...",
      "skills": ["enc:...", "enc:..."]
    },
    
    "company": {
      "industry": "enc:...",
      "company_size": "enc:...",
      "skills": ["enc:...", "enc:..."]
    }
  }
}
```

---

## 5. API Endpoints

### 5.1 Auth Routes (`/api/auth`)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| POST | `/api/auth/signup` | `{ username, password, type, ...profile }` | `{ user_id, token }` | Hash username+password, encrypt profile, set cookie |
| POST | `/api/auth/login` | `{ username, password }` | `{ user_id, token }` | Hash username to find user, hash password to verify |
| POST | `/api/auth/logout` | — | `{ ok: true }` | Delete session from sessions.json, clear cookie |
| GET | `/api/auth/me` | — | `{ user }` | Read session cookie, decrypt profile, return user |

### 5.2 Opportunity Routes (`/api/opportunities`)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| GET | `/api/opportunities` | query: `?type=student` | `{ opportunities: [...] }` | Decrypt all for display, filter by type if provided |
| GET | `/api/opportunities/:id` | — | `{ opportunity }` | Decrypt single opportunity |
| POST | `/api/opportunities` | `{ type, ...fields }` | `{ id }` | Create, encrypt fields, require auth |
| DELETE | `/api/opportunities/:id` | — | `{ ok: true }` | Only owner can delete |

### 5.3 User Routes (`/api/users`)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| GET | `/api/users/me` | — | `{ user }` | Same as /api/auth/me |
| PATCH | `/api/users/me` | `{ ...fields }` | `{ ok: true }` | Update profile fields, re-encrypt |

---

## 6. Middleware

### 6.1 `requireAuth`

```js
// Reads session cookie → looks up session in sessions.json → attaches req.user
// Returns 401 if no valid session
```

### 6.2 CORS

```
Allow localhost:9194 (dev), configurable for production
```

### 6.3 Static File Serving

```
Express serves web_app/ at root (/)
API routes mounted at /api/*
```

---

## 7. Frontend Integration

### 7.1 Session Persistence

The frontend relies on httpOnly cookies — no localStorage for auth tokens.

```js
// Every page checks session on load:
const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
if (!res.ok) → redirect to login.html
if (res.ok) → attach user data to page
```

### 7.2 Login Flow

```
login.html:
  POST /api/auth/login → sets httpOnly cookie → redirect to feed.html

signup.html:
  POST /api/auth/signup → sets httpOnly cookie → redirect to feed.html
```

### 7.3 Feed Flow

```
feed.html:
  GET /api/opportunities → decrypt server-side → return plaintext JSON
  Render cards with real data
```

### 7.4 Create Flow

```
create_student.html / create_nonprofit.html / create_company.html:
  POST /api/opportunities → encrypt server-side → redirect to feed.html
```

### 7.5 Opportunity Detail Flow

```
opportunity_student.html?id=xxx:
  GET /api/opportunities/:id → decrypt → populate data-field elements
```

### 7.6 Logout

```
Any page:
  POST /api/auth/logout → clear cookie → redirect to loading_page.html
```

---

## 8. Encryption Key Management

- Key stored in `.env` file as `ENCRYPTION_KEY=<64 hex chars>`
- Generated on first run if not present
- Never committed to git
- Same key used for all AES operations

---

## 9. File Locking (Concurrency)

- JSON files are small-scale storage
- Use a simple write-lock: only one write at a time per file
- Read operations are lock-free (atomic reads)
- Acceptable for single-server deployment

---

## 10. Error Handling

| Code | Meaning |
|------|---------|
| 400 | Bad request / missing fields |
| 401 | Not authenticated |
| 403 | Not authorized (not your resource) |
| 404 | Resource not found |
| 409 | Conflict (username taken) |
| 500 | Server error |

All errors return `{ error: "message" }`.

---

## 11. Future Considerations

| Area | Current | Future |
|------|---------|--------|
| Storage | JSON files | SQLite → PostgreSQL |
| Auth | Cookie + session file | JWT + Redis |
| Encryption | AES-256-GCM | Field-level DB encryption |
| Search | In-memory filter | Full-text search (SQLite FTS5) |
| Real-time | None | WebSocket (Socket.io) |
| Upload | None | File upload (S3) |
