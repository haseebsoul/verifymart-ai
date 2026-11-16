import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Boxes, Building2, ClipboardCheck, Eye, EyeOff,
  ShieldCheck, ShoppingBag, Store
} from 'lucide-react';
import type { AtlasRole, PublicUser } from '@verifymart/shared';
import { useAuth } from '../context/AuthContext';

const roles: Array<{
  id: AtlasRole;
  title: string;
  icon: typeof ShoppingBag;
  summary: string;
  access: string;
}> = [
  {
    id: 'shopper',
    title: 'Shopper / Buyer',
    icon: ShoppingBag,
    summary: 'Browse verified goods, check batch hashes, estimate import costs and track orders.',
    access: 'Catalog · verification · cart · order tracking'
  },
  {
    id: 'merchant',
    title: 'Merchant / Supplier',
    icon: Store,
    summary: 'Submit your supplier profile, publish products after approval and maintain provenance.',
    access: 'Business profile · listings · batch records · trust ledger'
  },
  {
    id: 'inventory_manager',
    title: 'Inventory Manager',
    icon: Boxes,
    summary: 'Manage warehouse stock, hub levels, inventory adjustments and reorder thresholds.',
    access: 'Inventory · hubs · stock adjustments'
  },
  {
    id: 'operator',
    title: 'Operations Auditor',
    icon: ClipboardCheck,
    summary: 'Review threat signals, provenance trails, compliance activity and escrow states.',
    access: 'Operations · threats · activity · audit review'
  },
  {
    id: 'admin',
    title: 'System Administrator',
    icon: ShieldCheck,
    summary: 'Govern users and roles, approve suppliers and manage platform controls and tariffs.',
    access: 'Governance · approvals · settings · audit oversight'
  }
];

const demoAccounts: Array<{ role: AtlasRole; email: string }> = [
  { role: 'admin', email: 'admin@verifymart.ai' },
  { role: 'merchant', email: 'merchant@verifymart.ai' },
  { role: 'inventory_manager', email: 'inventory@verifymart.ai' },
  { role: 'operator', email: 'auditor@verifymart.ai' },
  { role: 'shopper', email: 'shopper@verifymart.ai' }
];

const countries = [
  ['PK', 'Pakistan'],
  ['CN', 'China'],
  ['AE', 'United Arab Emirates'],
  ['UK', 'United Kingdom'],
  ['US', 'United States'],
  ['TR', 'Türkiye'],
  ['SG', 'Singapore'],
  ['EU', 'European Union']
] as const;

function workspaceFor(user: PublicUser): string {
  const routes:Record<string,string>={shopper:'/dashboard/shopper',merchant:'/dashboard/merchant',inventory_manager:'/dashboard/inventory',operator:'/dashboard/operator',admin:'/dashboard/admin'};
  return routes[user.role]??'/dashboard';
}

export function LoginPage() {
  const { login, register, demoLogin, demoMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const mode = location.pathname === '/register' ? 'register' : 'login';
  const [selectedRole, setSelectedRole] = useState<AtlasRole>(() => {
    const requested = new URLSearchParams(location.search).get('role');
    return roles.some(role => role.id === requested) ? requested as AtlasRole : 'shopper';
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [country, setCountry] = useState('PK');
  const [inviteKey, setInviteKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = roles.find(role => role.id === selectedRole) ?? roles[0];
  const needsInvite = selectedRole === 'inventory_manager' || selectedRole === 'operator' || selectedRole === 'admin';

  const finishSignIn = (user: PublicUser) => navigate(workspaceFor(user), { replace: true });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'login') {
        const user = await login(email, password, selectedRole);
        finishSignIn(user);
      } else {
        const user = await register({
          name,
          email,
          password,
          role: selectedRole,
          ...(selectedRole === 'merchant' ? { businessName, country } : {}),
          ...(needsInvite ? { inviteKey } : {})
        });
        setNotice(
          selectedRole === 'merchant'
            ? 'Your supplier profile was created and is pending administrator approval.'
            : 'Your account is ready. Opening your selected workspace.'
        );
        finishSignIn(user);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const enterDemo = async (role: AtlasRole, accountEmail: string) => {
    setSelectedRole(role);
    setEmail(accountEmail);
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const user = await demoLogin(role);
      finishSignIn(user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Demo account could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page auth-page-editorial">
      <section className="auth-aside">
        <Link to="/" className="brand auth-brand" aria-label="VerifyMart home">
          <span className="brand-mark"><ShieldCheck size={22} /></span>
          <span>VerifyMart <i>AI</i></span>
        </Link>
        <div className="auth-aside-copy">
          <span className="eyebrow">VERIFYMART / PAKISTAN</span>
          <h2>One network.<br /><em>Five accountable roles.</em></h2>
          <p>Supplier records, sourced estimates and clear order states — with each stakeholder working inside the right permissions.</p>
        </div>
        <div className="auth-role-summary">
          <span>01 / TRUST</span>
          <span>02 / TRACE</span>
          <span>03 / TRANSACT</span>
        </div>
        <span className="auth-aside-foot">ATLAS DEVELOPMENT ENVIRONMENT</span>
      </section>

      <section className="auth-form-side">
        <Link className="back-home" to="/"><ArrowLeft size={16} /> Back to storefront</Link>
        <div className="auth-form-wrap auth-form-wrap-wide">
          <span className="eyebrow">{mode === 'login' ? 'SECURE WORKSPACE ACCESS' : 'STAKEHOLDER REGISTRATION'}</span>
          <h1>{mode === 'login' ? 'Sign in to' : 'Create your'}<br /><em>{mode === 'login' ? 'VerifyMart AI.' : 'VerifyMart account.'}</em></h1>
          <p className="auth-intro">
            {mode === 'login'
              ? 'Choose the role registered to your account. Your workspace is selected from the role stored in Atlas.'
              : 'Select your stakeholder role. Privileged workspaces require a server-validated invitation.'}
          </p>

          <div className="role-selector" role="group" aria-label="Select stakeholder role">
            {roles.map(role => {
              const Icon = role.icon;
              return (
                <button
                  className={selectedRole === role.id ? 'role-choice is-selected' : 'role-choice'}
                  type="button"
                  key={role.id}
                  aria-pressed={selectedRole === role.id}
                  onClick={() => { setSelectedRole(role.id); setError(''); }}
                >
                  <span className="role-choice-icon"><Icon size={19} /></span>
                  <span className="role-choice-title">{role.title}</span>
                  <span className="role-choice-check" aria-hidden="true">{selectedRole === role.id ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
          <div className="role-description">
            <strong>{selected.title}</strong>
            <p>{selected.summary}</p>
            <small>{selected.access}</small>
          </div>

          <form className="auth-form auth-form-stacked" onSubmit={submit}>
            {mode === 'register' && (
              <label>Full name
                <input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={80} required placeholder="Your name" autoComplete="name" />
              </label>
            )}

            {mode === 'register' && selectedRole === 'merchant' && (
              <div className="merchant-registration-fields">
                <label><span><Building2 size={15} /> Business name</span>
                  <input value={businessName} onChange={event => setBusinessName(event.target.value)} minLength={2} maxLength={120} required placeholder="Registered supplier business" />
                </label>
                <label>Business country
                  <select value={country} onChange={event => setCountry(event.target.value)}>
                    {countries.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
                  </select>
                </label>
                <p className="field-note">New supplier profiles start as pending and require administrator approval before published listings become available.</p>
              </div>
            )}

            {mode === 'register' && needsInvite && (
              <label>{selectedRole === 'admin' ? 'Administrator invitation key' : 'Stakeholder invitation key'}
                <input value={inviteKey} onChange={event => setInviteKey(event.target.value)} required type="password" autoComplete="off" placeholder="Enter the key configured by your administrator" />
                <small className="field-note">
                  {selectedRole === 'admin'
                    ? 'The backend validates this against ADMIN_INVITE_KEY. It is never stored in the browser.'
                    : 'The backend validates this role against ROLE_INVITE_KEYS.'}
                </small>
              </label>
            )}

            <label>Email address
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@example.com" autoComplete="email" />
            </label>
            <label>Password
              <span className="password-input">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  minLength={mode === 'register' ? 10 : 1}
                  maxLength={128}
                  required
                  placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {error && <div className="form-error" role="alert">{error}</div>}
            {notice && <div className="form-success" role="status">{notice}</div>}
            <button className="button button-primary w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in to selected workspace' : 'Create selected account'}
              <ArrowRight size={16} />
            </button>
          </form>

          {mode === 'login' && (
            <details className="demo-access-panel">
              <summary>
                <span><strong>Quick Demo Evaluator Access</strong><small>Seeded Atlas stakeholder accounts · development only</small></span>
                <span className="demo-panel-indicator">{demoMode ? 'AVAILABLE' : 'NOT CONFIGURED'}</span>
              </summary>
              {demoMode ? (
                <div className="demo-account-list">
                  {demoAccounts.map(account => {
                    const role = roles.find(item => item.id === account.role)!;
                    return (
                      <div className="demo-account" key={account.role}>
                        <span><b>{role.title}</b><small>{account.email}</small></span>
                        <button type="button" disabled={busy} onClick={() => void enterDemo(account.role, account.email)}>
                          Enter <ArrowRight size={14} />
                        </button>
                      </div>
                    );
                  })}
                  <small className="field-note">The backend verifies the configured DEMO_PASSWORD against the seeded account. No demo password is sent to or exposed by the browser.</small>
                </div>
              ) : (
                <p className="field-note">Quick access appears when DEMO_PASSWORD is configured for a non-production backend and the five seed accounts exist.</p>
              )}
            </details>
          )}

          <p className="auth-switch">
            {mode === 'login' ? 'New to VerifyMart?' : 'Already have an account?'}{' '}
            <button type="button" onClick={() => { setError(''); setNotice(''); navigate(mode === 'login' ? '/register' : '/login'); }}>
              {mode === 'login' ? 'Create account' : 'Sign in'}
            </button>
          </p>
        </div>
        <div className="auth-disclaimer">Development environment · Provenance, tariff estimates and escrow are demonstrator workflows.</div>
      </section>
    </main>
  );
}
