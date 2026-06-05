'use client';

import { useMemo, useState } from 'react';
import type { DashboardData, BookingRequest, QueueItem } from '@/types/database';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type Props = {
  initialData: DashboardData;
  staffEmail: string;
  staffRole: string;
};

type Tab = 'schedule' | 'queue' | 'bookings' | 'customers' | 'vehicles' | 'cleanup' | 'notifications';
type ScheduleMode = 'day' | 'week';
type ScheduleEntry = {
  id: string;
  date: string;
  time: string;
  title: string;
  body: string;
  tone: 'requested' | 'confirmed';
  bookingId: string | null;
  appointmentId: string | null;
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'queue', label: 'Today Queue' },
  { id: 'bookings', label: 'Booking Requests' },
  { id: 'customers', label: 'Customers' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'cleanup', label: 'End-of-Day' },
  { id: 'notifications', label: 'Notifications' }
];

function dateText(value: string) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return dateKey(new Date());
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key: string, days: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function weekDays(anchorKey: string) {
  const anchor = dateFromKey(anchorKey);
  const day = anchor.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  anchor.setDate(anchor.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, index) => dateKey(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + index)));
}

function shortDateLabel(key: string) {
  return dateFromKey(key).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function longDateLabel(key: string) {
  return dateFromKey(key).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export function DashboardShell({ initialData, staffEmail, staffRole }: Props) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>('schedule');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('day');
  const [scheduleDate, setScheduleDate] = useState(todayKey());
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [quickStatus, setQuickStatus] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const todayQueue = useMemo(() => data.queueItems.filter((item) => item.queue_date === todayKey()), [data.queueItems]);
  const incomplete = useMemo(() => data.queueItems.filter((item) => item.is_incomplete), [data.queueItems]);
  const requestedBookings = useMemo(() => data.bookings.filter((booking) => booking.status === 'requested'), [data.bookings]);

  async function refresh() {
    const response = await fetch('/api/dashboard');
    if (response.status === 401) {
      window.location.href = '/dashboard/login';
      return;
    }
    setData(await response.json());
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase?.auth.signOut();
    window.location.href = '/dashboard/login';
  }

  async function handleQuickCapture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuickStatus('Saving...');
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch('/api/quick-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      form.reset();
      setQuickStatus('Saved to today queue.');
      await refresh();
    } else {
      const result = await response.json().catch(() => ({}));
      setQuickStatus(result.error || 'Could not save quick capture.');
    }
  }

  async function updateQueue(id: string, updates: Record<string, unknown>) {
    await fetch(`/api/queue/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    await refresh();
  }

  async function submitConfirmBooking(bookingId: string, payload: Record<string, unknown>) {
    const response = await fetch(`/api/booking-requests/${bookingId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Could not confirm appointment.');
    }
    await refresh();
  }

  async function submitRescheduleAppointment(appointmentId: string, payload: Record<string, unknown>) {
    const response = await fetch(`/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Could not reschedule appointment.');
    }
    await refresh();
  }

  async function confirmBooking(event: React.FormEvent<HTMLFormElement>, booking: BookingRequest) {
    event.preventDefault();
    setConfirming(booking.id);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await submitConfirmBooking(booking.id, { ...payload, notify_customer: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not confirm appointment.');
    }
    setConfirming(null);
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p>BP Auto Repair OS</p>
          <h1>Shop Dashboard</h1>
          <span>
            {staffEmail} · {staffRole}
          </span>
        </div>
        <div className="dashboard-actions">
          <a href="/" target="_blank" rel="noreferrer">
            View Website
          </a>
          <button type="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Dashboard summary">
        <Metric label="Confirmed" value={data.appointments.filter((appointment) => appointment.status === 'confirmed').length} />
        <Metric label="Booking requests" value={requestedBookings.length} />
        <Metric label="Today queue" value={todayQueue.length} />
        <Metric label="Incomplete" value={incomplete.length} />
      </section>

      <nav className="dashboard-tabs" aria-label="Dashboard views">
        {tabs.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'schedule' && (
        <>
          <ScheduleView
            bookings={data.bookings}
            appointments={data.appointments}
            queueItems={todayQueue}
            mode={scheduleMode}
            selectedDate={scheduleDate}
            onModeChange={setScheduleMode}
            onDateChange={setScheduleDate}
            onConfirmBooking={submitConfirmBooking}
            onRescheduleAppointment={submitRescheduleAppointment}
          />
          <QuickCapturePanel
            quickStatus={quickStatus}
            open={quickCaptureOpen}
            onToggle={() => setQuickCaptureOpen((open) => !open)}
            onSubmit={handleQuickCapture}
          />
        </>
      )}

      {tab === 'queue' && (
        <QuickCapturePanel
          quickStatus={quickStatus}
          open={quickCaptureOpen}
          onToggle={() => setQuickCaptureOpen((open) => !open)}
          onSubmit={handleQuickCapture}
        />
      )}

      {tab === 'queue' && (
        <Panel title="Today Queue" subtitle="Bookings and walk-ins the owner needs to handle today.">
          <QueueList items={todayQueue} onUpdate={updateQueue} />
        </Panel>
      )}

      {tab === 'bookings' && (
        <Panel title="Booking Requests" subtitle="Customer requests are not confirmed until the owner confirms the time.">
          <div className="record-list">
            {data.bookings.length ? (
              data.bookings.map((booking) => (
                <article className="record-card" key={booking.id}>
                  <div className="record-top">
                    <div>
                      <h3>
                        {booking.customer_name} · {booking.reference}
                      </h3>
                      <p>
                        {booking.service_needed} for {booking.vehicle_description}
                      </p>
                    </div>
                    <span className={`status ${booking.status}`}>{booking.status}</span>
                  </div>
                  <div className="meta-row">
                    <span>{booking.phone}</span>
                    <span>{booking.email}</span>
                    <span>
                      Requested {booking.preferred_date} at {booking.preferred_time}
                    </span>
                  </div>
                  {booking.status === 'requested' && (
                    <form className="confirm-form" onSubmit={(event) => confirmBooking(event, booking)}>
                      <input name="appointment_date" type="date" defaultValue={booking.preferred_date} required />
                      <input name="appointment_time" defaultValue={booking.preferred_time} required />
                      <button type="submit" disabled={confirming === booking.id}>
                        {confirming === booking.id ? 'Confirming...' : 'Confirm Appointment'}
                      </button>
                    </form>
                  )}
                </article>
              ))
            ) : (
              <EmptyState text="No booking requests yet." />
            )}
          </div>
        </Panel>
      )}

      {tab === 'customers' && (
        <Panel title="Customers" subtitle="Created automatically from bookings and quick captures.">
          <SimpleList
            empty="No customers yet."
            rows={data.customers.map((customer) => ({
              id: customer.id,
              title: customer.name || 'Temporary customer',
              body: `${customer.phone || 'No phone'} · ${customer.email || 'No email'}`
            }))}
          />
        </Panel>
      )}

      {tab === 'vehicles' && (
        <Panel title="Vehicles" subtitle="Loose vehicle descriptions are allowed; VIN and plate are optional.">
          <SimpleList
            empty="No vehicles yet."
            rows={data.vehicles.map((vehicle) => ({
              id: vehicle.id,
              title: vehicle.description || vehicle.license_plate || vehicle.vin || 'Unspecified vehicle',
              body: `Plate: ${vehicle.license_plate || 'none'} · VIN: ${vehicle.vin || 'none'}`
            }))}
          />
        </Panel>
      )}

      {tab === 'cleanup' && (
        <Panel title="End-of-Day Cleanup" subtitle="Incomplete records are suggestions, not blockers during the rush.">
          <QueueList items={incomplete} onUpdate={updateQueue} cleanup />
        </Panel>
      )}

      {tab === 'notifications' && (
        <Panel title="Notification Log" subtitle="Every owner alert, customer email, and customer SMS is tracked.">
          <SimpleList
            empty="No notifications yet."
            rows={data.notifications.map((notification) => ({
              id: notification.id,
              title: `${notification.channel} · ${notification.status}`,
              body: `${notification.recipient} · ${notification.subject || notification.body}`
            }))}
          />
        </Panel>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="dashboard-panel">
      <div className="panel-heading">
        <div>
          <p>{subtitle}</p>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function ScheduleView({
  bookings,
  appointments,
  queueItems,
  mode,
  selectedDate,
  onModeChange,
  onDateChange,
  onConfirmBooking,
  onRescheduleAppointment
}: {
  bookings: DashboardData['bookings'];
  appointments: DashboardData['appointments'];
  queueItems: QueueItem[];
  mode: ScheduleMode;
  selectedDate: string;
  onModeChange: (mode: ScheduleMode) => void;
  onDateChange: (date: string) => void;
  onConfirmBooking: (bookingId: string, payload: Record<string, unknown>) => Promise<void>;
  onRescheduleAppointment: (appointmentId: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [draggedEntry, setDraggedEntry] = useState<ScheduleEntry | null>(null);
  const [actionStatus, setActionStatus] = useState('');
  const bookingMap = new Map(bookings.map((booking) => [booking.id, booking]));
  const dates = mode === 'day' ? [selectedDate] : weekDays(selectedDate);
  const step = mode === 'day' ? 1 : 7;

  const requestedEntries: ScheduleEntry[] = bookings
    .filter((booking) => booking.status === 'requested')
    .map((booking) => ({
      id: booking.id,
      date: booking.preferred_date,
      time: booking.preferred_time,
      title: booking.customer_name,
      body: `${booking.service_needed} · ${booking.vehicle_description}`,
      tone: 'requested',
      bookingId: booking.id,
      appointmentId: null
    }));

  const confirmedEntries: ScheduleEntry[] = appointments
    .filter((appointment) => appointment.status === 'confirmed')
    .map((appointment) => {
      const booking = appointment.booking_request_id ? bookingMap.get(appointment.booking_request_id) : null;
      return {
        id: appointment.id,
        date: appointment.appointment_date,
        time: appointment.appointment_time,
        title: booking?.customer_name || 'Confirmed job',
        body: booking ? `${booking.service_needed} · ${booking.vehicle_description}` : 'Appointment confirmed',
        tone: 'confirmed',
        bookingId: appointment.booking_request_id,
        appointmentId: appointment.id
      };
    });

  const entries = [...requestedEntries, ...confirmedEntries].sort((a, b) => a.time.localeCompare(b.time));
  const unscheduledWalkIns = queueItems.filter((item) => !item.booking_request_id);

  async function handleScheduleAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEntry) return;

    setActionStatus(selectedEntry.tone === 'requested' ? 'Confirming...' : 'Rescheduling...');
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      appointment_date: String(formData.get('appointment_date') || ''),
      appointment_time: String(formData.get('appointment_time') || ''),
      notify_customer: formData.get('notify_customer') === 'on'
    };

    try {
      if (selectedEntry.tone === 'requested' && selectedEntry.bookingId) {
        await onConfirmBooking(selectedEntry.bookingId, payload);
      } else if (selectedEntry.tone === 'confirmed' && selectedEntry.appointmentId) {
        await onRescheduleAppointment(selectedEntry.appointmentId, payload);
      }
      setSelectedEntry(null);
      setActionStatus('');
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'Could not update schedule.');
    }
  }

  return (
    <section className="dashboard-panel schedule-panel">
      <div className="schedule-header">
        <div>
          <p>Calendar</p>
          <h2>{mode === 'day' ? longDateLabel(selectedDate) : 'This Week'}</h2>
        </div>
        <div className="schedule-controls">
          <button type="button" onClick={() => onDateChange(addDays(selectedDate, -step))}>
            Prev
          </button>
          <button type="button" onClick={() => onDateChange(todayKey())}>
            Today
          </button>
          <button type="button" onClick={() => onDateChange(addDays(selectedDate, step))}>
            Next
          </button>
          <div className="mode-toggle" aria-label="Schedule view">
            <button type="button" className={mode === 'day' ? 'active' : ''} onClick={() => onModeChange('day')}>
              Day
            </button>
            <button type="button" className={mode === 'week' ? 'active' : ''} onClick={() => onModeChange('week')}>
              Week
            </button>
          </div>
        </div>
      </div>

      <div className={mode === 'day' ? 'schedule-grid day' : 'schedule-grid week'}>
        {dates.map((date) => {
          const dayEntries = entries.filter((entry) => entry.date === date);
          const dayQueue = date === todayKey() ? unscheduledWalkIns : [];

          return (
            <article
              className="schedule-day"
              key={date}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedEntry) {
                  setSelectedEntry({ ...draggedEntry, date });
                  setDraggedEntry(null);
                }
              }}
            >
              <div className="schedule-day-heading">
                <strong>{shortDateLabel(date)}</strong>
                <span>{dayEntries.length + dayQueue.length} jobs</span>
              </div>
              {dayEntries.length || dayQueue.length ? (
                <div className="schedule-events">
                  {dayEntries.map((entry) => (
                    <button
                      type="button"
                      className={`schedule-event ${entry.tone}`}
                      draggable
                      key={`${entry.tone}-${entry.id}`}
                      onClick={() => setSelectedEntry(entry)}
                      onDragStart={() => setDraggedEntry(entry)}
                      onDragEnd={() => setDraggedEntry(null)}
                    >
                      <span>{entry.time}</span>
                      <strong>{entry.title}</strong>
                      <p>{entry.body}</p>
                    </button>
                  ))}
                  {dayQueue.map((item) => (
                    <div className="schedule-event walk-in" key={item.id}>
                      <span>Walk-in</span>
                      <strong>{item.customer_name || item.vehicle_description || item.phone || 'Quick capture'}</strong>
                      <p>{item.service_needed || item.quick_note}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="schedule-empty">Open day</div>
              )}
            </article>
          );
        })}
      </div>
      {selectedEntry && (
        <div className="schedule-action-panel">
          <div>
            <p>{selectedEntry.tone === 'requested' ? 'Confirm request' : 'Reschedule appointment'}</p>
            <h3>{selectedEntry.title}</h3>
            <span>{selectedEntry.body}</span>
          </div>
          <form onSubmit={handleScheduleAction}>
            <label>
              <span>Date</span>
              <input name="appointment_date" type="date" defaultValue={selectedEntry.date} required />
            </label>
            <label>
              <span>Time</span>
              <input name="appointment_time" defaultValue={selectedEntry.time} required />
            </label>
            <label className="notify-toggle">
              <input name="notify_customer" type="checkbox" defaultChecked />
              <span>Notify customer</span>
            </label>
            <div className="schedule-action-buttons">
              <button type="submit">{selectedEntry.tone === 'requested' ? 'Confirm' : 'Save Change'}</button>
              <button type="button" onClick={() => setSelectedEntry(null)}>
                Cancel
              </button>
            </div>
            <p role="status">{actionStatus}</p>
          </form>
        </div>
      )}
    </section>
  );
}

function QuickCapturePanel({
  quickStatus,
  open,
  onToggle,
  onSubmit
}: {
  quickStatus: string;
  open: boolean;
  onToggle: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className={`quick-capture-panel ${open ? 'open' : 'closed'}`}>
      <div className="quick-capture-heading">
        <div>
          <p>Fast intake</p>
          <h2>Quick Capture</h2>
        </div>
        <button type="button" onClick={onToggle}>
          {open ? 'Close' : '+ Quick Add'}
        </button>
      </div>
      {open && (
        <form className="quick-capture-form" onSubmit={onSubmit}>
          <label className="wide">
            <span>Quick note</span>
            <textarea name="quick_note" placeholder="Say or type: John, 604-555-1234, red Civic, oil change, waiting" required />
          </label>
          <details className="quick-details">
            <summary>Details</summary>
            <div>
              <label>
                <span>Name</span>
                <input name="customer_name" />
              </label>
              <label>
                <span>Phone</span>
                <input name="phone" type="tel" />
              </label>
              <label>
                <span>Email</span>
                <input name="email" type="email" />
              </label>
              <label>
                <span>Vehicle</span>
                <input name="vehicle_description" />
              </label>
              <label>
                <span>Plate</span>
                <input name="license_plate" />
              </label>
              <label>
                <span>VIN</span>
                <input name="vin" />
              </label>
              <label>
                <span>Service</span>
                <input name="service_needed" />
              </label>
              <label>
                <span>Status</span>
                <select name="waiting_status">
                  <option value="">Unknown</option>
                  <option value="waiting">Waiting</option>
                  <option value="dropped_off">Dropped off</option>
                </select>
              </label>
              <label>
                <span>Priority</span>
                <select name="priority">
                  <option value="">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
            </div>
          </details>
          <button type="submit">Save</button>
          <p role="status">{quickStatus}</p>
        </form>
      )}
    </section>
  );
}

function QueueList({ items, cleanup = false, onUpdate }: { items: QueueItem[]; cleanup?: boolean; onUpdate: (id: string, updates: Record<string, unknown>) => void }) {
  if (!items.length) return <EmptyState text={cleanup ? 'No incomplete records.' : 'No queue items for today.'} />;

  return (
    <div className="record-list">
      {items.map((item) => (
        <article className="record-card" key={item.id}>
          <div className="record-top">
            <div>
              <h3>{item.customer_name || item.vehicle_description || item.phone || 'Unassigned queue item'}</h3>
              <p>{item.quick_note}</p>
            </div>
            <span className={`status ${item.is_incomplete ? 'requested' : 'confirmed'}`}>{item.is_incomplete ? 'incomplete' : 'complete'}</span>
          </div>
          <div className="meta-row">
            {item.phone && <span>{item.phone}</span>}
            {item.vehicle_description && <span>{item.vehicle_description}</span>}
            {item.service_needed && <span>{item.service_needed}</span>}
            {item.waiting_status && <span>{item.waiting_status}</span>}
            {item.priority && <span>{item.priority}</span>}
          </div>
          {!!item.missing_fields?.length && (
            <div className="missing-row">
              {item.missing_fields.map((field) => (
                <span key={field}>{field}</span>
              ))}
            </div>
          )}
          <div className="record-actions">
            {!item.payment_status && (
              <button type="button" onClick={() => onUpdate(item.id, { payment_status: 'paid' })}>
                Mark Paid
              </button>
            )}
            {!item.follow_up_scheduled && (
              <button type="button" onClick={() => onUpdate(item.id, { follow_up_scheduled: true })}>
                Follow-up Set
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function SimpleList({ rows, empty }: { rows: Array<{ id: string; title: string; body: string }>; empty: string }) {
  if (!rows.length) return <EmptyState text={empty} />;

  return (
    <div className="record-list">
      {rows.map((row) => (
        <article className="record-card" key={row.id}>
          <h3>{row.title}</h3>
          <p>{row.body}</p>
        </article>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}
