# Tenderland API

Backend foundation for the Tenderland app.

## Environment

Copy `.env.example` to `.env` and fill the required values:

```bash
DATABASE_URL=
JWT_SECRET=
```

`DATABASE_URL` must point to a Postgres database.

## Development

```bash
npm install
npm run migrate
npm run dev
```

## Auth API

### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "User Name"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Current User

```http
GET /api/auth/me
Authorization: Bearer <token>
```
