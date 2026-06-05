'use client';

import { useMemo, useState } from 'react';
import type { DashboardData, BookingRequest, QueueItem } from '@/types/database';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type Props = {
  initialData: DashboardData;
  staffEmail: string;
  staffRole: string;
};

type Tab = 'queue' | 'bookings' | 'customers' | 'vehicles' | 'cleanup' | 'notifications';

const tabs: Array<{ id: Tab; label: string }> = [
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

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function DashboardShell({ initialData, staffEmail, staffRole }: Props) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>('queue');
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

  async function confirmBooking(event: React.FormEvent<HTMLFormElement>, booking: BookingRequest) {
    event.preventDefault();
    setConfirming(booking.id);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(`/api/booking-requests/${booking.id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      alert(result.error || 'Could not confirm appointment.');
    }
    setConfirming(null);
    await refresh();
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
        <Metric label="Booking requests" value={requestedBookings.length} />
        <Metric label="Today queue" value={todayQueue.length} />
        <Metric label="Incomplete" value={incomplete.length} />
        <Metric label="Notifications" value={data.notifications.length} />
      </section>

      <section className="quick-capture-panel">
        <div className="panel-heading">
          <div>
            <p>Phone-first intake</p>
            <h2>Quick Capture</h2>
          </div>
        </div>
        <form className="quick-capture-form" onSubmit={handleQuickCapture}>
          <label className="wide">
            <span>Quick note</span>
            <textarea name="quick_note" placeholder="Say or type: John, 604-555-1234, red Civic, oil change, waiting" required />
          </label>
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
          <button type="submit">+ Quick Add</button>
          <p role="status">{quickStatus}</p>
        </form>
      </section>

      <nav className="dashboard-tabs" aria-label="Dashboard views">
        {tabs.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

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
