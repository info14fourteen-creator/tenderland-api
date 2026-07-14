# Tenderland API

Backend foundation for the Tenderland app.

## Environment

Copy `.env.example` to `.env` and fill the required values:

```bash
DATABASE_URL=
JWT_SECRET=
ADMIN_EMAIL=admin@kortex.capital
ADMIN_BOOTSTRAP_INVITE_CODE=
```

`DATABASE_URL` must point to a Postgres database.

## Development

```bash
npm install
npm run migrate
npm run dev
```

## Auth API

Users have a separate access category and business role.

Access categories:

- `user`
- `admin`
- `super_admin`

Business roles:

- `Менеджер`
- `Специалист по работе с государственным сегментом`
- `Специалист юридической службы`
- `Финансовый контроллер`
- `Бухгалтер`
- `Специалист службы безопасности`
- `Специалист отдела закупок`
- `Специалист отдела продаж`
- `Специалист отдела делопроизводства`
- `Специалист отдела логистики`

### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "passwordConfirm": "password123",
  "inviteCode": "invite-code"
}
```

Registration requires an invitation code tied to the same email address.
The first admin account uses `ADMIN_EMAIL` plus `ADMIN_BOOTSTRAP_INVITE_CODE`.

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

### Create Invitation

```http
POST /api/admin/invitations
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "email": "user@example.com",
  "category": "user",
  "role": "Менеджер",
  "expiresInDays": 14
}
```

The returned invite code can only be used with the email it was created for.
Only `super_admin` can create invitations for `admin` and `super_admin` categories.
