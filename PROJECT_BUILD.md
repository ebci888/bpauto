# BP Auto Repair OS - Build Notes

This document tracks what has been built, what is demo-ready, and what should be treated as optional add-on modules for BP Auto Repair in Surrey, BC.

The goal is to show a complete-feeling prototype without pretending every possible shop-management feature has already been fully built.

## Product Positioning

BP Auto Repair OS is a private shop dashboard behind the public BP Auto Repair website.

The public site stays as the public marketing/booking site. The dashboard is the private owner/mechanic system at `/dashboard`.

The MVP is intentionally request-first:

- Customer submits a booking request.
- The request enters the shop system.
- Owner confirms, reschedules, or manages it from the dashboard.
- Customer notifications are logged now and can be sent later through Brevo/Twilio.

## Current Core Build

### Public Website

- Existing public website is preserved at `/`.
- Public booking form posts to `/api/bookings`.
- Public booking is request-first, not auto-confirmed.
- Public form fields map into the backend as:
  - first/last name -> customer and booking customer name
  - phone/email -> customer match/contact details
  - vehicle -> vehicle record and booking vehicle description
  - service -> booking service needed
  - preferred date/time -> requested schedule slot
  - notes -> booking notes
- Booking creates:
  - customer record
  - vehicle record
  - booking request
  - today queue item
  - notification event rows

### Private Dashboard

- Private dashboard lives at `/dashboard`.
- Login is powered by Supabase Auth.
- Owner account is configured through `OWNER_EMAIL`.
- Staff roles exist in schema:
  - owner
  - mechanic
  - staff
- Owner-only actions are protected server-side.

### Supabase Backend

Tables created:

- `profiles`
- `customers`
- `vehicles`
- `booking_requests`
- `queue_items`
- `appointments`
- `notification_events`
- `audit_events`
- `shop_hours`
- `blocked_times`

RLS is enabled. The browser does not directly manage shop data. Server routes use the Supabase service role key.

### Setup Diagnostics

`/api/setup/status` checks:

- public Supabase keys
- service role key
- required database tables
- owner profile readiness
- Brevo/Twilio readiness

This prevents false-positive setup where keys exist but tables do not.

## Dashboard Modules Built

### Schedule

The dashboard now opens to a calendar-first schedule view.

Built views:

- Day
- Week
- Month

Current schedule behavior:

- Requested bookings show as schedule cards.
- Confirmed appointments show as schedule cards.
- Walk-ins/quick captures show as today items.
- Cards can be clicked to open an action panel.
- Week/month cards can be dragged onto another day.
- Dropping a card opens the action panel so the owner confirms exact date/time.

Current appointment actions:

- Confirm a requested booking from the schedule.
- Reschedule a confirmed appointment.
- Optionally log/send customer notification for confirm/reschedule.
- Track lightweight job details:
  - job status
  - estimated hours
  - actual hours
  - billable hours
  - internal notes

Built availability behavior:

- Default shop hours are seeded in Supabase.
- Owner can edit regular shop hours from the Availability tab.
- Owner can mark a weekday closed or adjust open/close times and slot intervals.
- Owner can add special-date hours or closures that override regular weekly hours.
- Public booking time slots are loaded from `/api/availability`.
- Public booking calendar loads month availability from `/api/availability/month`.
- Public calendar visually marks available dates and closed/full dates.
- Slots are removed when there is:
  - an owner blocked-time record
  - a confirmed appointment
  - an existing requested booking for the same date/time
- Same-day slots are removed once that time has already passed in Vancouver time.
- Public booking submit validates the selected slot server-side before creating records.
- Dashboard has an Availability tab where the owner can add or remove blocked time.

Future availability behavior:

- Owner can override or reschedule from the dashboard when shop reality changes.
- Add recurring holiday templates if the shop wants automated annual closures.

### Booking Requests

- Owner can view all booking requests.
- Requested bookings can be reviewed and confirmed in a modal.
- Duplicate confirmed appointment slots are blocked.

### Today Queue

- Queue items are created from public bookings and quick captures.
- Queue items can be incomplete.
- Missing fields are shown as suggestions, not blockers.
- Owner can mark payment status or follow-up status.

### Quick Capture

Quick Capture is now compact instead of taking over the dashboard.

Built behavior:

- Collapsed behind `+ Quick Add`.
- Required field: quick note only.
- Optional structured details are tucked under `Details`.
- Supports phone-first dictation through the phone keyboard.
- Saves incomplete queue items without blocking.

### End-of-Day Cleanup

- Shows incomplete records.
- Missing fields are surfaced as cleanup suggestions.
- Designed for after-rush cleanup rather than blocking the owner during the day.

### Notification Log

- Every notification attempt creates a `notification_events` row.
- Statuses:
  - pending
  - sent
  - failed
  - skipped
- Brevo/Twilio are not required for MVP.
- If providers are missing, events are logged as `skipped`.
- Notification tab includes a provider setup checklist showing Brevo/Twilio readiness and missing env vars.
- Owner can trigger test email/SMS events from the Notification Log after adding provider credentials.
- SMS sending supports either `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID`, and outbound SMS bodies are branded with `BP Auto Repair:`.

## Current Notification Scope

Built now:

- Owner alert event logging.
- Customer request-received event logging.
- Customer appointment-confirmed event logging.
- Customer appointment-rescheduled event logging.

Future provider wiring:

- Brevo for email.
- Twilio for SMS.
- Twilio inbound webhook for customer SMS replies.

## Booking Spam Shield

Built behavior:

- Public booking submissions are scored before customer, vehicle, queue, or notification side effects.
- Obvious bot submissions are blocked and logged in `booking_submission_events`.
- Suspicious submissions are saved as booking requests with `spam_status = suspected`, but do not create customer/vehicle/queue records and do not alert the owner.
- Clean submissions keep the normal flow: customer, vehicle, booking request, queue item, owner alert, and customer confirmation logs.
- Public availability ignores suspected spam bookings, so spam cannot quietly fill the public calendar.
- The public booking form includes hidden honeypot fields and a form timing signal.
- Turnstile server verification is supported when `TURNSTILE_SECRET_KEY` is configured.
- The public booking form loads the Cloudflare Turnstile widget when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` exists.
- Set `TURNSTILE_REQUIRED=true` only after `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are both configured and a real test booking succeeds.
- IP/user-agent/email/phone fingerprints are hashed before storage; raw IP addresses are not stored.

Future hardening:

- Add a dashboard spam filter/release action for suspected bookings.
- Add Netlify edge/function rate limits in production.

## AI Voice Assistant Demo

Built behavior:

- Bottom-right public site assistant is now a real demo chat surface instead of alert placeholders.
- Supports typed questions, quick prompts, browser microphone dictation where supported, and spoken assistant replies.
- Assistant is shop-aware: services, hours, Surrey location, no-start/noise/brake safety triage, towing guidance, booking-request flow, and basic intake questions.
- `/api/ai-assistant` uses OpenAI first when `OPENAI_API_KEY` is configured, Gemini second when `GEMINI_API_KEY` is configured, and local demo replies when no provider key is present.
- Assistant turns collect transcript rows in `ai_assistant_conversations` and `ai_assistant_messages`.
- Assistant extracts a booking draft from chat/voice and can fill the public booking form for customer review.
- When the draft has full name, phone, email, vehicle, service, date, and time, the assistant can submit the booking request directly through `/api/ai-assistant/book`.
- Assistant-originated bookings still use the normal booking engine, spam checks, customer/vehicle creation, queue item creation, and notification event logging.
- Submitted assistant conversations are linked back to the created booking request for follow-up review.
- Demo mode is intentionally safe: it does not confirm appointments, diagnose with certainty, or quote exact repair prices.

Demo provider env vars:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## Demo Controls

Built behavior:

- Private dashboard includes a `Demo Controls` tab for client presentation.
- Presenter switches show which prototype modules are included in the walkthrough:
  - Advanced Calendar
  - AI Assistant
  - Spam Shield
  - Notifications
- Toggles are saved locally in the browser and do not delete data or disable production booking logic.
- Each module card links back to the relevant dashboard area for fast demo navigation.
- Includes a suggested walkthrough script for showing the public site, request-first booking, calendar, job notes, notifications, spam shield, and cleanup.

## Demo Scope

The demo should feel complete around this workflow:

1. Customer submits booking from public site.
2. Owner logs into dashboard.
3. Owner sees booking on schedule/month/week/day.
4. Owner clicks or drags the booking.
5. Owner confirms/reschedules.
6. Queue and notification logs update.
7. Incomplete records can be cleaned up later.

This is enough to show the system idea clearly without needing a full accounting or repair-order system.

## Responsive Standard

Every dashboard module should be checked at phone, tablet, and desktop sizes before demo.

Expected behavior:

- Phone: large tap targets, no horizontal overflow except intentional calendar grids, modal content scrolls cleanly.
- Tablet: schedule controls and cards remain readable.
- Desktop: calendar views use available width without feeling sparse.

Input/review interactions should open in modals instead of expanding the page height.
Current job details, Booking Request confirmation, and Quick Capture interactions use a modal on desktop and a bottom-sheet style modal on mobile.

## Optional Add-On Modules

These should be positioned as optional modules, not part of the basic booking MVP.

### Repair Job Tracking

Useful for multi-day auto repair work where a vehicle may stay in the shop.

Built lightweight fields:

- job status
  - scheduled
  - checked in
  - in progress
  - waiting for parts
  - paused
  - ready
  - completed
- estimated start date
- estimated completion date
- estimated hours
- actual hours
- billable hours
- internal notes

Future additions:

- technician/mechanic assigned
- customer-facing notes
- parts status
- estimated completion date

### Time Tracking

Potential options:

- Manual time entries.
- Start/stop timer per vehicle/job.
- Pause reasons such as waiting for parts or customer approval.
- Daily mechanic time log.

This should stay simple at first. A timer can become distracting if the shop does not naturally work that way.

### Repair Notes / Visit Reports

Each visit could have a running work log:

- diagnosis notes
- work completed
- parts needed
- parts ordered
- customer approved work
- photos/videos
- technician notes
- final summary

This becomes the foundation for customer transparency and future invoices.

### Labor Guide / Book Time

This should be treated as a future estimating module.

Important: BP Auto Repair is in Surrey, BC, Canada, so Canadian availability and shop practice matter.

Potential reference sources:

- ALLDATA Canada
- Mitchell 1 Canada / ProDemand
- MOTOR Estimated Work Times

Manual MVP fields:

- labor guide source
- standard/book hours
- quoted hours
- actual hours
- billable hours
- shop hourly rate
- discount or adjustment reason

Demo value:

- The shop can show a customer: standard time says 2.0 hours, but the shop is billing 1.0 hour.
- This can help explain pricing and build trust.

Do not integrate paid labor guide data until the client confirms what they already use.

### Customer SMS Workflow

Potential SMS interactions:

- request received
- appointment confirmed
- appointment rescheduled
- you are next
- please check in
- approval needed
- vehicle ready
- customer asks to reschedule by SMS

Future technical pieces:

- Twilio inbound webhook.
- Message parser.
- Owner approval before customer-driven schedule changes.
- Notification history attached to customer/vehicle/job.

### Customer Portal

Optional later:

- Customer sees request status.
- Customer confirms/reschedules.
- Customer approves work.
- Customer sees visit notes/photos.
- Customer pays deposit or invoice.

This is likely not required for the first paid version.

## Canada / BC Notes

Use Canadian terminology and assumptions where possible:

- Use labour/labor carefully depending on UI audience. For shop software, `labour` may be more Canadian, but many industry tools still use `labor`.
- Use CAD pricing when pricing is added.
- Do not assume US repair law, US taxes, or US labour-guide access.
- For any consumer-estimate/invoice compliance, confirm BC-specific requirements before building legal/compliance language.

## Source Notes

Relevant industry references checked:

- ALLDATA Canada: OEM repair information, shop management, two-way texting, appointments calendar, time reporting, automated parts/labour lookups.
- ALLDATA Labour Times: OEM labour times as an add-on to ALLDATA Repair.
- Mitchell 1 Canada / ProDemand: repair information, estimating, OEM pricing, parts diagrams, and labour-time guides.
- MOTOR Estimated Work Times: labour time guidance for service and repair operations.

These sources support the product direction, but the MVP should remain manual-entry until the client confirms their preferred labour guide/provider.

## Build History

### Core MVP

- Converted project into Next.js App Router.
- Preserved public website.
- Added Supabase Auth/Postgres backend.
- Added private dashboard.
- Added booking API.
- Added quick capture.
- Added queue, cleanup, and notification log.
- Added setup status endpoint.

### Scheduling MVP

- Added schedule-first dashboard.
- Added day/week/month views.
- Added clickable schedule cards.
- Added drag-to-reschedule interaction.
- Added appointment reschedule API.
- Added optional notification intent for schedule changes.
- Added lightweight job detail fields on appointments.

## Recommended Next Step

Add a simple customer-facing status action set for jobs:

- you are next
- please check in
- waiting for parts
- vehicle ready

For now these can log notification events without requiring Twilio to be fully configured.
