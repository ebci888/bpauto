'use client';

import { useMemo, useState } from 'react';
import type { BlockedTime, DashboardData, BookingRequest, QueueItem, ShopHour } from '@/types/database';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type Props = {
  initialData: DashboardData;
  staffEmail: string;
  staffRole: string;
};

type Tab = 'schedule' | 'availability' | 'queue' | 'bookings' | 'customers' | 'vehicles' | 'cleanup' | 'notifications';
type ScheduleMode = 'day' | 'week' | 'month';
type ScheduleEntry = {
  id: string;
  date: string;
  time: string;
  title: string;
  body: string;
  tone: 'requested' | 'confirmed';
  bookingId: string | null;
  appointmentId: string | null;
  jobStatus: string;
  estimatedHours: number | null;
  actualHours: number | null;
  billableHours: number | null;
  internalNotes: string;
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'availability', label: 'Availability' },
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

function monthDays(anchorKey: string) {
  const anchor = dateFromKey(anchorKey);
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startOffset = firstOfMonth.getDay();
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, index) => dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)));
}

function shortDateLabel(key: string) {
  return dateFromKey(key).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function longDateLabel(key: string) {
  return dateFromKey(key).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function monthLabel(key: string) {
  return dateFromKey(key).toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function scheduleTitle(mode: ScheduleMode, key: string) {
  if (mode === 'day') return longDateLabel(key);
  if (mode === 'week') return 'This Week';
  return monthLabel(key);
}

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DashboardShell({ initialData, staffEmail, staffRole }: Props) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>('schedule');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('day');
  const [scheduleDate, setScheduleDate] = useState(todayKey());
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [quickStatus, setQuickStatus] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null);
  const [bookingConfirmStatus, setBookingConfirmStatus] = useState('');
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [selectedShopHour, setSelectedShopHour] = useState<ShopHour | null>(null);
  const [availabilityStatus, setAvailabilityStatus] = useState('');

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

  function openQuickCapture() {
    setQuickStatus('');
    setQuickCaptureOpen(true);
  }

  function closeQuickCapture() {
    setQuickCaptureOpen(false);
  }

  function openBlockModal() {
    setAvailabilityStatus('');
    setBlockModalOpen(true);
  }

  function closeBlockModal() {
    setBlockModalOpen(false);
  }

  function openShopHourModal(hour: ShopHour) {
    setAvailabilityStatus('');
    setSelectedShopHour(hour);
  }

  function closeShopHourModal() {
    setSelectedShopHour(null);
    setAvailabilityStatus('');
  }

  function openBookingConfirm(booking: BookingRequest) {
    setBookingConfirmStatus('');
    setSelectedBooking(booking);
  }

  function closeBookingConfirm() {
    setSelectedBooking(null);
    setBookingConfirmStatus('');
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

  async function confirmBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBooking) return;
    setConfirming(selectedBooking.id);
    setBookingConfirmStatus('Confirming...');
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      appointment_date: String(formData.get('appointment_date') || ''),
      appointment_time: String(formData.get('appointment_time') || ''),
      notify_customer: formData.get('notify_customer') === 'on',
      job_status: String(formData.get('job_status') || 'scheduled'),
      estimated_hours: String(formData.get('estimated_hours') || ''),
      actual_hours: String(formData.get('actual_hours') || ''),
      billable_hours: String(formData.get('billable_hours') || ''),
      internal_notes: String(formData.get('internal_notes') || '')
    };
    try {
      await submitConfirmBooking(selectedBooking.id, payload);
      setBookingConfirmStatus('Appointment confirmed.');
      closeBookingConfirm();
    } catch (error) {
      setBookingConfirmStatus(error instanceof Error ? error.message : 'Could not confirm appointment.');
    }
    setConfirming(null);
  }

  async function addBlockedTime(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAvailabilityStatus('Saving...');
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch('/api/availability/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      form.reset();
      setAvailabilityStatus('Blocked time saved.');
      setBlockModalOpen(false);
      await refresh();
    } else {
      const result = await response.json().catch(() => ({}));
      setAvailabilityStatus(result.error || 'Could not block time.');
    }
  }

  async function removeBlockedTime(id: string) {
    const response = await fetch(`/api/availability/blocks/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      alert(result.error || 'Could not remove blocked time.');
      return;
    }
    await refresh();
  }

  async function updateShopHours(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedShopHour) return;
    setAvailabilityStatus('Saving...');
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      is_open: formData.get('is_open') === 'on',
      opens_at: String(formData.get('opens_at') || ''),
      closes_at: String(formData.get('closes_at') || ''),
      slot_interval_minutes: String(formData.get('slot_interval_minutes') || '60')
    };
    const response = await fetch(`/api/availability/hours/${selectedShopHour.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      setAvailabilityStatus('Shop hours saved.');
      setSelectedShopHour(null);
      await refresh();
    } else {
      const result = await response.json().catch(() => ({}));
      setAvailabilityStatus(result.error || 'Could not save shop hours.');
    }
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
            onOpen={openQuickCapture}
            onClose={closeQuickCapture}
            onSubmit={handleQuickCapture}
          />
        </>
      )}

      {tab === 'queue' && (
        <QuickCapturePanel
          quickStatus={quickStatus}
          open={quickCaptureOpen}
          onOpen={openQuickCapture}
          onClose={closeQuickCapture}
          onSubmit={handleQuickCapture}
        />
      )}

      {tab === 'availability' && (
        <AvailabilityPanel
          shopHours={data.shopHours}
          blockedTimes={data.blockedTimes}
          modalOpen={blockModalOpen}
          selectedShopHour={selectedShopHour}
          status={availabilityStatus}
          onOpen={openBlockModal}
          onClose={closeBlockModal}
          onEditHour={openShopHourModal}
          onCloseHour={closeShopHourModal}
          onSubmitHour={updateShopHours}
          onSubmit={addBlockedTime}
          onDelete={removeBlockedTime}
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
                    <div className="record-actions">
                      <button type="button" onClick={() => openBookingConfirm(booking)}>
                        Review / Confirm
                      </button>
                    </div>
                  )}
                </article>
              ))
            ) : (
              <EmptyState text="No booking requests yet." />
            )}
          </div>
          {selectedBooking && (
            <div className="modal-backdrop" role="presentation" onMouseDown={closeBookingConfirm}>
              <section className="job-modal" role="dialog" aria-modal="true" aria-labelledby="booking-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
                <div className="job-modal-header">
                  <div>
                    <p>Confirm request</p>
                    <h3 id="booking-confirm-title">
                      {selectedBooking.customer_name} · {selectedBooking.reference}
                    </h3>
                    <span>
                      {selectedBooking.service_needed} for {selectedBooking.vehicle_description}
                    </span>
                  </div>
                  <button type="button" aria-label="Close booking confirmation" onClick={closeBookingConfirm}>
                    Close
                  </button>
                </div>
                <form className="job-modal-form" onSubmit={confirmBooking}>
                  <label>
                    <span>Date</span>
                    <input name="appointment_date" type="date" defaultValue={selectedBooking.preferred_date} required />
                  </label>
                  <label>
                    <span>Time</span>
                    <input name="appointment_time" defaultValue={selectedBooking.preferred_time} required />
                  </label>
                  <label>
                    <span>Job status</span>
                    <select name="job_status" defaultValue="scheduled">
                      <option value="scheduled">Scheduled</option>
                      <option value="checked_in">Checked in</option>
                      <option value="in_progress">In progress</option>
                      <option value="waiting_parts">Waiting for parts</option>
                      <option value="paused">Paused</option>
                      <option value="ready">Ready</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                  <label>
                    <span>Estimated hours</span>
                    <input name="estimated_hours" type="number" min="0" step="0.25" />
                  </label>
                  <label>
                    <span>Actual hours</span>
                    <input name="actual_hours" type="number" min="0" step="0.25" />
                  </label>
                  <label>
                    <span>Billable hours</span>
                    <input name="billable_hours" type="number" min="0" step="0.25" />
                  </label>
                  <label className="wide-field">
                    <span>Internal notes</span>
                    <textarea name="internal_notes" defaultValue={selectedBooking.notes || ''} placeholder="Confirm details, special instructions, estimate notes..." />
                  </label>
                  <label className="notify-toggle">
                    <input name="notify_customer" type="checkbox" defaultChecked />
                    <span>Notify customer when providers are configured</span>
                  </label>
                  <div className="job-modal-actions">
                    <button type="submit" disabled={confirming === selectedBooking.id}>
                      {confirming === selectedBooking.id ? 'Confirming...' : 'Confirm Appointment'}
                    </button>
                    <button type="button" onClick={closeBookingConfirm}>
                      Cancel
                    </button>
                  </div>
                  <p role="status">{bookingConfirmStatus}</p>
                </form>
              </section>
            </div>
          )}
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
  const dates = mode === 'day' ? [selectedDate] : mode === 'week' ? weekDays(selectedDate) : monthDays(selectedDate);
  const step = mode === 'day' ? 1 : mode === 'week' ? 7 : 0;
  const selectedMonth = dateFromKey(selectedDate).getMonth();

  function moveSchedule(direction: -1 | 1) {
    if (mode === 'month') {
      const date = dateFromKey(selectedDate);
      date.setMonth(date.getMonth() + direction);
      onDateChange(dateKey(date));
      return;
    }
    onDateChange(addDays(selectedDate, step * direction));
  }

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
      appointmentId: null,
      jobStatus: 'scheduled',
      estimatedHours: null,
      actualHours: null,
      billableHours: null,
      internalNotes: ''
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
        appointmentId: appointment.id,
        jobStatus: appointment.job_status,
        estimatedHours: appointment.estimated_hours,
        actualHours: appointment.actual_hours,
        billableHours: appointment.billable_hours,
        internalNotes: appointment.internal_notes || ''
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
      notify_customer: formData.get('notify_customer') === 'on',
      job_status: String(formData.get('job_status') || 'scheduled'),
      estimated_hours: String(formData.get('estimated_hours') || ''),
      actual_hours: String(formData.get('actual_hours') || ''),
      billable_hours: String(formData.get('billable_hours') || ''),
      internal_notes: String(formData.get('internal_notes') || '')
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
          <h2>{scheduleTitle(mode, selectedDate)}</h2>
        </div>
        <div className="schedule-controls">
          <button type="button" onClick={() => moveSchedule(-1)}>
            Prev
          </button>
          <button type="button" onClick={() => onDateChange(todayKey())}>
            Today
          </button>
          <button type="button" onClick={() => moveSchedule(1)}>
            Next
          </button>
          <div className="mode-toggle" aria-label="Schedule view">
            <button type="button" className={mode === 'day' ? 'active' : ''} onClick={() => onModeChange('day')}>
              Day
            </button>
            <button type="button" className={mode === 'week' ? 'active' : ''} onClick={() => onModeChange('week')}>
              Week
            </button>
            <button type="button" className={mode === 'month' ? 'active' : ''} onClick={() => onModeChange('month')}>
              Month
            </button>
          </div>
        </div>
      </div>

      {mode === 'month' && (
        <div className="month-weekdays" aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
      )}

      <div className={mode === 'day' ? 'schedule-grid day' : mode === 'week' ? 'schedule-grid week' : 'schedule-grid month'}>
        {dates.map((date) => {
          const dayEntries = entries.filter((entry) => entry.date === date);
          const dayQueue = date === todayKey() ? unscheduledWalkIns : [];
          const isOutsideMonth = mode === 'month' && dateFromKey(date).getMonth() !== selectedMonth;

          return (
            <article
              className={`schedule-day ${isOutsideMonth ? 'outside-month' : ''}`}
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
                      {entry.tone === 'confirmed' && (
                        <em>
                          {entry.jobStatus.replace('_', ' ')}
                          {entry.estimatedHours ? ` · ${entry.estimatedHours}h est` : ''}
                        </em>
                      )}
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
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedEntry(null)}>
          <section className="job-modal" role="dialog" aria-modal="true" aria-labelledby="job-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="job-modal-header">
              <div>
                <p>{selectedEntry.tone === 'requested' ? 'Confirm request' : 'Job details'}</p>
                <h3 id="job-modal-title">{selectedEntry.title}</h3>
                <span>{selectedEntry.body}</span>
              </div>
              <button type="button" aria-label="Close job details" onClick={() => setSelectedEntry(null)}>
                Close
              </button>
            </div>
            <form className="job-modal-form" onSubmit={handleScheduleAction}>
              <label>
                <span>Date</span>
                <input name="appointment_date" type="date" defaultValue={selectedEntry.date} required />
              </label>
              <label>
                <span>Time</span>
                <input name="appointment_time" defaultValue={selectedEntry.time} required />
              </label>
              <label>
                <span>Job status</span>
                <select name="job_status" defaultValue={selectedEntry.jobStatus}>
                  <option value="scheduled">Scheduled</option>
                  <option value="checked_in">Checked in</option>
                  <option value="in_progress">In progress</option>
                  <option value="waiting_parts">Waiting for parts</option>
                  <option value="paused">Paused</option>
                  <option value="ready">Ready</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label>
                <span>Estimated hours</span>
                <input name="estimated_hours" type="number" min="0" step="0.25" defaultValue={selectedEntry.estimatedHours ?? ''} />
              </label>
              <label>
                <span>Actual hours</span>
                <input name="actual_hours" type="number" min="0" step="0.25" defaultValue={selectedEntry.actualHours ?? ''} />
              </label>
              <label>
                <span>Billable hours</span>
                <input name="billable_hours" type="number" min="0" step="0.25" defaultValue={selectedEntry.billableHours ?? ''} />
              </label>
              <label className="wide-field">
                <span>Internal notes</span>
                <textarea name="internal_notes" defaultValue={selectedEntry.internalNotes} placeholder="Diagnosis, parts delay, work done, next step..." />
              </label>
              <label className="notify-toggle">
                <input name="notify_customer" type="checkbox" defaultChecked />
                <span>Notify customer</span>
              </label>
              <div className="job-modal-actions">
                <button type="submit">{selectedEntry.tone === 'requested' ? 'Confirm' : 'Save Change'}</button>
                <button type="button" onClick={() => setSelectedEntry(null)}>
                  Cancel
                </button>
              </div>
              <p role="status">{actionStatus}</p>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function AvailabilityPanel({
  shopHours,
  blockedTimes,
  modalOpen,
  selectedShopHour,
  status,
  onOpen,
  onClose,
  onEditHour,
  onCloseHour,
  onSubmitHour,
  onSubmit,
  onDelete
}: {
  shopHours: ShopHour[];
  blockedTimes: BlockedTime[];
  modalOpen: boolean;
  selectedShopHour: ShopHour | null;
  status: string;
  onOpen: () => void;
  onClose: () => void;
  onEditHour: (hour: ShopHour) => void;
  onCloseHour: () => void;
  onSubmitHour: (event: React.FormEvent<HTMLFormElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Panel title="Availability" subtitle="Public booking slots come from shop hours minus confirmed appointments and blocked time.">
      <div className="availability-toolbar">
        <div>
          <h3>Shop Hours</h3>
          <p>Default hours are used for public booking slots.</p>
        </div>
        <button type="button" onClick={onOpen}>
          Block Time
        </button>
      </div>
      <div className="availability-grid">
        {shopHours.map((hour) => (
          <article key={hour.id}>
            <strong>{weekdayNames[hour.day_of_week]}</strong>
            <span>{hour.is_open ? `${hour.opens_at?.slice(0, 5)}-${hour.closes_at?.slice(0, 5)}` : 'Closed'}</span>
            <button type="button" onClick={() => onEditHour(hour)}>
              Edit
            </button>
          </article>
        ))}
      </div>
      <div className="availability-section">
        <h3>Blocked Time</h3>
        {blockedTimes.length ? (
          <div className="record-list compact">
            {blockedTimes.map((block) => (
              <article className="record-card" key={block.id}>
                <div className="record-top">
                  <div>
                    <h3>{block.block_date}</h3>
                    <p>
                      {block.start_time.slice(0, 5)}-{block.end_time.slice(0, 5)}
                      {block.reason ? ` · ${block.reason}` : ''}
                    </p>
                  </div>
                  <button type="button" className="plain-danger" onClick={() => onDelete(block.id)}>
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState text="No blocked time yet." />
        )}
      </div>
      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
          <section className="job-modal availability-modal" role="dialog" aria-modal="true" aria-labelledby="availability-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="job-modal-header">
              <div>
                <p>Availability</p>
                <h3 id="availability-modal-title">Block Time</h3>
                <span>Hide time from public booking when the shop is full, closed, waiting on parts, or the owner is unavailable.</span>
              </div>
              <button type="button" aria-label="Close availability modal" onClick={onClose}>
                Close
              </button>
            </div>
            <form className="job-modal-form" onSubmit={onSubmit}>
              <label>
                <span>Date</span>
                <input name="block_date" type="date" defaultValue={todayKey()} required />
              </label>
              <label>
                <span>Start</span>
                <input name="start_time" type="time" defaultValue="12:00" required />
              </label>
              <label>
                <span>End</span>
                <input name="end_time" type="time" defaultValue="13:00" required />
              </label>
              <label className="wide-field">
                <span>Reason</span>
                <textarea name="reason" placeholder="Lunch, parts run, fully booked, owner away..." />
              </label>
              <div className="job-modal-actions">
                <button type="submit">Save Block</button>
                <button type="button" onClick={onClose}>
                  Cancel
                </button>
              </div>
              <p role="status">{status}</p>
            </form>
          </section>
        </div>
      )}
      {selectedShopHour && (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCloseHour}>
          <section className="job-modal availability-modal" role="dialog" aria-modal="true" aria-labelledby="shop-hours-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="job-modal-header">
              <div>
                <p>Regular hours</p>
                <h3 id="shop-hours-modal-title">{weekdayNames[selectedShopHour.day_of_week]}</h3>
                <span>These hours control what public booking slots can appear on this weekday.</span>
              </div>
              <button type="button" aria-label="Close shop hours modal" onClick={onCloseHour}>
                Close
              </button>
            </div>
            <form className="job-modal-form" onSubmit={onSubmitHour}>
              <label className="notify-toggle">
                <input name="is_open" type="checkbox" defaultChecked={selectedShopHour.is_open} />
                <span>Open this day</span>
              </label>
              <label>
                <span>Opens</span>
                <input name="opens_at" type="time" defaultValue={selectedShopHour.opens_at?.slice(0, 5) || '08:00'} />
              </label>
              <label>
                <span>Closes</span>
                <input name="closes_at" type="time" defaultValue={selectedShopHour.closes_at?.slice(0, 5) || '17:00'} />
              </label>
              <label>
                <span>Slot interval</span>
                <select name="slot_interval_minutes" defaultValue={selectedShopHour.slot_interval_minutes}>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                  <option value="120">120 minutes</option>
                </select>
              </label>
              <div className="job-modal-actions">
                <button type="submit">Save Hours</button>
                <button type="button" onClick={onCloseHour}>
                  Cancel
                </button>
              </div>
              <p role="status">{status}</p>
            </form>
          </section>
        </div>
      )}
    </Panel>
  );
}

function QuickCapturePanel({
  quickStatus,
  open,
  onOpen,
  onClose,
  onSubmit
}: {
  quickStatus: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="quick-capture-panel">
      <div className="quick-capture-heading">
        <div>
          <p>Fast intake</p>
          <h2>Quick Capture</h2>
        </div>
        <button type="button" onClick={onOpen}>
          + Quick Add
        </button>
      </div>
      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
          <section className="job-modal quick-capture-modal" role="dialog" aria-modal="true" aria-labelledby="quick-capture-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="job-modal-header">
              <div>
                <p>Fast intake</p>
                <h3 id="quick-capture-title">Quick Capture</h3>
                <span>Capture what is known now. Complete the record later.</span>
              </div>
              <button type="button" aria-label="Close quick capture" onClick={onClose}>
                Close
              </button>
            </div>
            <form className="quick-capture-form" onSubmit={onSubmit}>
              <label className="wide">
                <span>Quick note</span>
                <textarea name="quick_note" placeholder="Say or type: John, 604-555-1234, red Civic, oil change, waiting" required />
              </label>
              <details className="quick-details">
                <summary>Optional details</summary>
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
              <div className="quick-capture-actions">
                <button type="submit">Save</button>
                <button type="button" onClick={onClose}>
                  Cancel
                </button>
              </div>
              <p role="status">{quickStatus}</p>
            </form>
          </section>
        </div>
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
