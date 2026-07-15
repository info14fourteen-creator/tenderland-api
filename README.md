# Tenderland API

Backend foundation for the Tenderland app.

## Environment

Copy `.env.example` to `.env` and fill the required values:

```bash
DATABASE_URL=
JWT_SECRET=
ADMIN_EMAIL=admin@kortex.capital
ADMIN_BOOTSTRAP_INVITE_CODE=
APP_URL=https://kortex.capital
SMTP_HOST=smtp.mail.me.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=no-reply@kortex.capital
SMTP_PASS=
MAIL_FROM=no-reply@kortex.capital
```

`DATABASE_URL` must point to a Postgres database.
`SMTP_PASS` must be an app-specific password for the mailbox used by `SMTP_USER`.

## Development

```bash
npm install
npm run migrate
npm run dev
```

## Tenderland procedure import

Import no more than 30 procedures from the configured autosearch and report:

```bash
npm run import:procedures -- --limit 30
```

The report must include `tender_id`. The default report and autosearch are both named `Kortex CRM`. Multiple export rows with the same Tenderland ID are grouped into one `procedures` record and retained in `source_payload.rows`.

Shared site chrome is rendered on the server for every public page:

- `src/views/partials/site-header.html` — the single header source
- `src/views/partials/site-footer.html` — the single footer source
- `public/styles/site-chrome.css` — shared header and footer styles

Public page templates live in `src/views/pages`.

## Auth API

Users have a separate access category and business roles.

Access categories:

- `user`
- `admin`
- `super_admin`

Business roles can be combined. A single person usually starts with every role, then company-specific delegation can remove roles in that company's context later.

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
  "inviteCode": "invite-code",
  "acceptedTerms": true
}
```

Registration requires an invitation code tied to the same email address.
Registration also requires acceptance of the current terms and privacy policy. The acceptance date and document versions are stored with the user.
The server generates an 8-character temporary password and sends it to the user's email.
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
  "roles": [
    "Менеджер",
    "Специалист отдела продаж"
  ],
  "expiresInDays": 14
}
```

The returned invite code can only be used with the email it was created for.
Only `super_admin` can create invitations for `admin` and `super_admin` categories.
If `roles` is omitted, the invitation grants all business roles by default. The legacy `role` field is still accepted for a single-role invitation.
