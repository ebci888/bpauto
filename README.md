# BP Auto Repair OS

Private shop operating system behind the BP Auto Repair public website.

The public website is preserved at `/`. The private owner dashboard lives at `/dashboard` and is intended to be gated with Supabase Auth.

## Stack

- Next.js App Router
- Supabase Postgres/Auth
- Brevo transactional email
- Twilio SMS
- Netlify deployment

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OWNER_EMAIL`
- Brevo and Twilio keys when messaging is ready

Run the app:

```bash
npm run dev
```

Open:

- Public site: `http://localhost:3000`
- Dashboard login: `http://localhost:3000/dashboard/login`
- Setup status: `http://localhost:3000/api/setup/status`

## Database

Apply the Supabase migration:

```bash
supabase/migrations/001_bp_auto_os.sql
```

After adding Supabase environment variables and applying the migration, check:

```bash
curl http://localhost:3000/api/setup/status
```

The response should show `readyForLogin: true`.

It creates:

- profiles
- customers
- vehicles
- booking_requests
- queue_items
- appointments
- notification_events
- audit_events

## MVP Flows

- Public booking form submits to `/api/bookings`
- Dashboard is protected by Supabase Auth
- Quick Capture can create an incomplete queue item with only a quick note
- Owner can review booking requests and confirm appointments
- Notification events are logged even when providers are not configured

## Scripts

```bash
npm run dev
npm run typecheck
npm run build
```
