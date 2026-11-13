import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Eye, EyeOff, ShieldCheck, ShoppingBag, Store,
  Boxes, Activity, ShieldAlert, CheckCircle2, AlertCircle, Key
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { type Role, ROLE_LABELS } from '@verifymart/shared';

const STAKEHOLDERS: Array<{
  role: Role;
  icon: typeof ShoppingBag;
  demoEmail: string;
}> = [
  { role: 'user', icon: ShoppingBag, demoEmail: 'buyer@verifymart.ai' },
  { role: 'merchant', icon: Store, demoEmail: 'merchant@verifymart.ai' },
  { role: 'inventory_manager', icon: Boxes, demoEmail: 'inventory@verifymart.ai' },
  { role: 'operator', icon: Activity, demoEmail: 'auditor@verifymart.ai' },
  { role: 'admin', icon: ShieldAlert, demoEmail: 'admin@verifymart.ai' }
];

export function LoginPage() {
  const { login, demoMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const next = new URLSearchParams(location.search).get('next') ?? '/dashboard';

  const [selectedRole, setSelectedRole] = useState<Role>('admin');
  const [email, setEmail] = useState('admin@verifymart.ai');
  const [password, setPassword] = useState('1234');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    const target = STAKEHOLDERS.find(s => s.role === role);
    if (target && demoMode) {
      setEmail(target.demoEmail);
      setPassword('1234');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const currentRoleInfo = ROLE_LABELS[selectedRole];

  return (
    <main className="min-h-screen grid lg:grid-cols-12 bg-[var(--bg-root)] text-[var(--text-primary)]">
      {/* Left Artwork & Brand Canvas */}
      <section className="lg:col-span-5 relative hidden lg:flex flex-col justify-between p-12 overflow-hidden border-r border-[var(--border-glass)] bg-gradient-to-b from-[#121216] to-[#09090B]">
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#B6FF00_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-3 text-xl font-bold tracking-tight">
            <span className="w-9 h-9 rounded-xl bg-[var(--accent-burnt-orange)] flex items-center justify-center text-white shadow-lg shadow-orange-950/40">
              <ShieldCheck size={20} />
            </span>
            <span>VerifyMart <i className="text-[var(--accent-lime)] font-serif">AI</i></span>
          </Link>
        </div>

        <div className="relative z-10 my-auto py-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-glass)] text-xs font-mono text-[var(--accent-lime)] mb-6">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-lime)] animate-pulse" />
            OPERATIONS COMMAND V14
          </div>
          <h1 className="text-4xl xl:text-5xl font-editorial leading-[1.08] mb-6">
            Proof is not <br />
            <em className="text-[var(--accent-burnt-orange)] italic">an afterthought.</em>
          </h1>
          <p className="text-[var(--text-secondary)] text-base max-w-md leading-relaxed mb-8">
            Global cross-border commerce with mathematical authenticity confidence, deterministic landed costs, and bonded escrow custody across 5 international hubs.
          </p>

          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="text-2xl font-mono font-bold text-[var(--text-primary)]">99.5%</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">Global SLA Target</div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="text-2xl font-mono font-bold text-[var(--accent-lime)]">&lt; 150ms</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">Tariff Calculation p95</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-[var(--text-muted)] font-mono border-t border-[var(--border-subtle)] pt-6">
          <span>SECURE PROTOCOL SHA-256</span>
          <span>ZURICH · DUBAI · NYC</span>
        </div>
      </section>

      {/* Right Login Section */}
      <section className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-12 lg:p-16 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
            <ArrowLeft size={16} /> Back to storefront
          </Link>
          <div className="lg:hidden flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[var(--accent-burnt-orange)] flex items-center justify-center text-white">
              <ShieldCheck size={16} />
            </span>
            <span className="font-bold text-sm">VerifyMart AI</span>
          </div>
        </div>

        <div className="max-w-xl w-full mx-auto my-auto">
          <div className="mb-8">
            <span className="text-xs font-mono font-semibold text-[var(--accent-burnt-orange)] tracking-wider uppercase">
              AUTHENTICATED ACCESS
            </span>
            <h2 className="text-3xl font-editorial mt-1 mb-2">
              Sign in to <span className="italic text-[var(--accent-burnt-orange)]">{currentRoleInfo.workspace}</span>
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {currentRoleInfo.description}
            </p>
          </div>

          {/* 5-Stakeholder Segmented Selector */}
          <div className="mb-8">
            <div className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider mb-3">
              SELECT STAKEHOLDER CONTEXT
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {STAKEHOLDERS.map(({ role, icon: Icon }) => {
                const isSelected = selectedRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleRoleSelect(role)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-[var(--bg-card)] border-[var(--accent-burnt-orange)] text-white shadow-lg shadow-orange-950/20 ring-1 ring-[var(--accent-burnt-orange)]'
                        : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-white'
                    }`}
                  >
                    <Icon size={18} className={isSelected ? 'text-[var(--accent-burnt-orange)]' : 'text-[var(--text-muted)]'} />
                    <span className="text-xs font-medium mt-2 leading-tight">
                      {ROLE_LABELS[role].title.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-[var(--text-muted)] uppercase mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="input-field"
                placeholder="name@organization.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-[var(--text-muted)] uppercase mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="input-field pr-11"
                  placeholder="Password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-white p-1"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="button-brand w-full py-3 text-sm font-semibold tracking-wide"
            >
              {busy ? 'Authenticating...' : `Sign in to ${currentRoleInfo.title}`}
            </button>
          </form>

          {/* Demo Autfill Banner */}
          {demoMode && (
            <div className="mt-8 p-4 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-glass)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-lime)]/10 text-[var(--accent-lime)] flex items-center justify-center">
                  <Key size={16} />
                </div>
                <div>
                  <div className="text-xs font-mono font-medium text-[var(--text-primary)]">
                    Local Demo Mode Active
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    Credentials auto-loaded: password is <span className="text-[var(--accent-lime)]">1234</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRoleSelect(selectedRole)}
                className="text-xs font-mono text-[var(--accent-burnt-orange)] hover:underline"
              >
                Reset demo
              </button>
            </div>
          )}

          <div className="mt-8 text-center text-xs text-[var(--text-secondary)]">
            Don't have an account yet?{' '}
            <Link to="/register" className="text-[var(--accent-burnt-orange)] hover:underline font-semibold">
              Create stakeholder account
            </Link>
          </div>
        </div>

        <div className="text-center text-xs text-[var(--text-muted)] mt-8">
          VerifyMart AI Operations Command V14 · Financial, customs & telemetry services simulated for staging.
        </div>
      </section>
    </main>
  );
}
