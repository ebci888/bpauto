# BP Auto Repair OS TODO

## Scheduling

- Let the owner click schedule cards to confirm or reschedule.
- Let the owner drag cards in week view, then confirm the new day/time.
- Log customer notification intent for confirmation and reschedule changes.

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
