import { LoginForm } from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">BP</div>
        <h1>Shop Dashboard</h1>
        <p>Private booking intake, queue, cleanup, and customer records.</p>
        <LoginForm />
      </section>
    </main>
  );
}
