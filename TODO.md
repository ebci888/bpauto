# BP Auto Repair OS TODO

## Scheduling

- Let the owner click schedule cards to confirm or reschedule.
- Let the owner drag cards in week/month view, then confirm the new day/time.
- Log customer notification intent for confirmation and reschedule changes.
- Add multi-day jobs for repairs that stay in the shop.
- Add mechanic assignment.
- Add customer-facing visit notes/work notes for each vehicle visit.

## Customer SMS Flow

- Add Twilio inbound webhook for customer replies.
- Support customer reschedule requests by SMS.
- Support queue/status messages such as:
  - request received
  - appointment confirmed
  - appointment rescheduled
  - you are next
  - please check in
  - vehicle is ready
- Keep all inbound/outbound messages in `notification_events`.

## Queue Flow

- Add simple owner actions for daily queue:
  - notify customer they are next
  - ask customer to check in
  - mark vehicle ready
  - request approval for next step

## Labor Guide / Book Time

- Treat "book time" as a reference value, not a hard schedule block.
- Capture:
  - labor guide source
  - standard/book hours
  - quoted hours
  - actual hours
  - billable hours
- Research/integration candidates:
  - ALLDATA parts and labor times
  - Mitchell 1 / ProDemand labor estimating
  - MOTOR labor guide data
- Keep MVP manual-entry first; do not integrate paid labor data until the shop confirms what they already use.
