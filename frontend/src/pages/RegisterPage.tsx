import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, ShoppingBag, Store, Boxes, Activity,
  AlertCircle, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { type Role, ROLE_LABELS } from '@verifymart/shared';

const ROLES_LIST: Array<{ role: Role; icon: typeof ShoppingBag }> = [
  { role: 'user', icon: ShoppingBag },
  { role: 'merchant', icon: Store },
  { role: 'inventory_manager', icon: Boxes },
  { role: 'operator', icon: Activity }
];

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>('user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('US');
  const [businessName, setBusinessName] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [invitationCode, setInvitationCode] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccessMessage('');

    try {
      const payload: Record<string, unknown> = { role, country };
      if (role === 'merchant') {
        if (businessName) payload.businessName = businessName;
        if (businessDescription) payload.businessDescription = businessDescription;
      }
      if (role === 'inventory_manager' || role === 'operator') {
        if (invitationCode) payload.invitationCode = invitationCode;
      }

      const res = await register(name, email, password, payload as Parameters<typeof register>[3]);

      if (res?.requiresApproval) {
        setSuccessMessage('Merchant application submitted successfully! Your account will be activated upon administrator review.');
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-12 bg-[var(--bg-root)] text-[var(--text-primary)]">
      {/* Left Artwork */}
      <section className="lg:col-span-5 relative hidden lg:flex flex-col justify-between p-12 overflow-hidden border-r border-[var(--border-glass)] bg-gradient-to-b from-[#121216] to-[#09090B]">
        <div>
          <Link to="/" className="inline-flex items-center gap-3 text-xl font-bold tracking-tight">
            <span className="w-9 h-9 rounded-xl bg-[var(--accent-burnt-orange)] flex items-center justify-center text-white">
              <ShieldCheck size={20} />
            </span>
            <span>VerifyMart <i className="text-[var(--accent-lime)] font-serif">AI</i></span>
          </Link>
        </div>

        <div className="my-auto py-12">
          <span className="badge-lime mb-4">JOIN THE VERIFIED NETWORK</span>
          <h1 className="text-4xl font-editorial leading-[1.08] mb-4">
            Unified trust for <br />
            <em className="text-[var(--accent-burnt-orange)] italic">every stakeholder.</em>
          </h1>
          <p className="text-[var(--text-secondary)] text-sm max-w-md leading-relaxed">
            Whether you are sourcing luxury goods, supplying certified hardware, managing customs bonded vaults, or auditing trade lanes, VerifyMart ensures mathematically verified provenance.
          </p>
        </div>

        <div className="text-xs text-[var(--text-muted)] font-mono">
          STAKEHOLDER REGISTRATION GATEWAY · V14
        </div>
      </section>

      {/* Right Registration Form */}
      <section className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-12 lg:p-16 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
            <ArrowLeft size={16} /> Back to Sign in
          </Link>
          <span className="text-xs font-mono text-[var(--text-muted)]">STEP 1 OF 1</span>
        </div>

        <div className="max-w-xl w-full mx-auto my-auto">
          <div className="mb-6">
            <h2 className="text-3xl font-editorial mb-1">
              Create your <span className="italic text-[var(--accent-burnt-orange)]">Account</span>
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Select your role in the VerifyMart ecosystem to initialize your workspace.
            </p>
          </div>

          {/* Role Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
            {ROLES_LIST.map(({ role: r, icon: Icon }) => {
              const active = role === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    active
                      ? 'bg-[var(--bg-card)] border-[var(--accent-burnt-orange)] text-white ring-1 ring-[var(--accent-burnt-orange)]'
                      : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <Icon size={18} className={`mx-auto mb-1.5 ${active ? 'text-[var(--accent-burnt-orange)]' : 'text-[var(--text-muted)]'}`} />
                  <div className="text-xs font-medium">{ROLE_LABELS[r].title.split(' ')[0]}</div>
                </button>
              );
            })}
          </div>

          {successMessage ? (
            <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--accent-lime)]/30 text-center space-y-4">
              <CheckCircle2 size={40} className="text-[var(--accent-lime)] mx-auto" />
              <h3 className="text-lg font-semibold">Application Pending Approval</h3>
              <p className="text-sm text-[var(--text-secondary)]">{successMessage}</p>
              <Link to="/login" className="button-brand inline-flex text-xs">
                Return to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-[var(--text-muted)] uppercase mb-2">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className="input-field"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[var(--text-muted)] uppercase mb-2">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="input-field"
                    placeholder="jane@company.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-[var(--text-muted)] uppercase mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={4}
                  className="input-field"
                  placeholder="At least 4 characters"
                />
              </div>

              {/* Conditional Role Fields */}
              {role === 'merchant' && (
                <div className="p-4 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-3">
                  <div className="text-xs font-mono text-[var(--accent-burnt-orange)] uppercase font-semibold">
                    Merchant Studio Onboarding
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Business / Brand Name</label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={e => setBusinessName(e.target.value)}
                      required
                      className="input-field"
                      placeholder="e.g. Geneva Chronometer Works"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Company Description</label>
                    <textarea
                      value={businessDescription}
                      onChange={e => setBusinessDescription(e.target.value)}
                      rows={2}
                      className="input-field"
                      placeholder="Brief overview of product lines and manufacturing origin..."
                    />
                  </div>
                </div>
              )}

              {(role === 'inventory_manager' || role === 'operator') && (
                <div className="p-4 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-2">
                  <div className="text-xs font-mono text-[var(--accent-lime)] uppercase font-semibold">
                    Internal Staff Authorization
                  </div>
                  <label className="block text-xs text-[var(--text-secondary)]">Staff Invitation Code</label>
                  <input
                    type="text"
                    value={invitationCode}
                    onChange={e => setInvitationCode(e.target.value)}
                    required
                    className="input-field font-mono"
                    placeholder="VERIFYMART-STAFF-2026"
                  />
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Staging demo token: <code className="text-[var(--accent-lime)]">VERIFYMART-STAFF-2026</code>
                  </div>
                </div>
              )}

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
                {busy ? 'Registering...' : `Complete ${ROLE_LABELS[role].title} Registration`}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-xs text-[var(--text-secondary)]">
            Already registered?{' '}
            <Link to="/login" className="text-[var(--accent-burnt-orange)] hover:underline font-semibold">
              Sign in
            </Link>
          </div>
        </div>

        <div className="text-center text-xs text-[var(--text-muted)] mt-8">
          VerifyMart AI · Enterprise Cross-Border Commerce & Audited Escrow Platform.
        </div>
      </section>
    </main>
  );
}
