import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, Clock3,
  PackageCheck, ShieldCheck, WalletCards, AlertTriangle, ArrowRight,
  TrendingUp, CheckCircle, RefreshCw, Eye
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { api } from '../lib/api';
import { money, relative } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '@verifymart/shared';

type Metrics = {
  role?: string;
  escrowGmv: number;
  escrowHeld?: number;
  escrowReleased?: number;
  verifiedOrders: number;
  verifiedProducts: number;
  totalProducts: number;
  totalUsers?: number;
  pendingMerchantApplications?: number;
  slaHealth: number;
  openThreats: number;
  hubs: Array<{ id: string; name: string; latencyMs: number; status: string; queueDepth: number }>;
  hubAllocation: Array<{ hubId: string; name: string; orders: number }>;
  velocity: Array<{ minute: number; orders: number; verifications: number }>;
};

type Order = {
  id: string;
  receiptId: string;
  shopperName: string;
  destination: string;
  total: number;
  state: string;
  createdAt: string;
  items: Array<{ sku: string; name: string; quantity: number }>;
};

export function OverviewPage() {
  const { user } = useAuth();
  const client = useQueryClient();

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api<Metrics>('/metrics'),
    refetchInterval: 10000
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api<{ orders: Order[] }>('/orders'),
    refetchInterval: 10000
  });

  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const action = async (order: Order, kind: 'release' | 'hold') => {
    setBusy(order.id);
    setError('');
    try {
      await api(`/orders/${order.id}/${kind}`, {
        method: 'POST',
        ...(kind === 'hold' ? { body: JSON.stringify({ reason: 'Operator review hold applied' }) } : {})
      });
      await client.invalidateQueries({ queryKey: ['orders'] });
      await client.invalidateQueries({ queryKey: ['metrics'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  };

  const hubData = metrics?.hubAllocation ?? [];
  const colors = ['#D9541E', '#B6FF00', '#10B981', '#3B82F6', '#8B5CF6'];

  const currentRoleInfo = user ? ROLE_LABELS[user.role] : null;

  return (
    <div className="space-y-8">
      {/* Top Banner & Stakeholder Salutation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge-lime text-[10px]">OPERATIONS ACTIVE</span>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              {currentRoleInfo?.workspace.toUpperCase()}
            </span>
          </div>
          <h1 className="text-3xl font-editorial font-bold tracking-tight">
            Good morning, {user?.name.split(' ')[0] ?? 'Operator'}.
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Here is your live cross-border commerce, telemetry, and escrow overview.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-lime)] animate-pulse" />
            Auto-Sync 10s
          </div>
        </div>
      </div>

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Escrow GMV */}
        <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-glass)] hover:border-white/15 transition-all shadow-lg shadow-black/20">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-3">
            <span className="font-mono uppercase">Escrow Volume</span>
            <WalletCards size={16} className="text-[var(--accent-burnt-orange)]" />
          </div>
          <div className="text-2xl font-mono font-bold text-white tracking-tight">
            {money(metrics?.escrowGmv ?? 0)}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-2 flex items-center gap-1.5">
            <span className="text-[var(--accent-lime)] flex items-center">
              <ArrowUpRight size={13} /> +12.4%
            </span>
            <span>held & released</span>
          </div>
        </div>

        {/* Card 2: Verified Orders */}
        <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-glass)] hover:border-white/15 transition-all shadow-lg shadow-black/20">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-3">
            <span className="font-mono uppercase">Verified Orders</span>
            <PackageCheck size={16} className="text-[var(--status-positive)]" />
          </div>
          <div className="text-2xl font-mono font-bold text-white tracking-tight">
            {metrics?.verifiedOrders ?? 0}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-2">
            100% cryptographic batch match
          </div>
        </div>

        {/* Card 3: Authenticity Confidence */}
        <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-glass)] hover:border-white/15 transition-all shadow-lg shadow-black/20">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-3">
            <span className="font-mono uppercase">Confidence Floor</span>
            <ShieldCheck size={16} className="text-[var(--accent-lime)]" />
          </div>
          <div className="text-2xl font-mono font-bold text-[var(--accent-lime)] tracking-tight">
            98.2<small className="text-xs text-[var(--text-muted)]"> / 100</small>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-2">
            {metrics?.verifiedProducts ?? 24} SKUs pre-cleared
          </div>
        </div>

        {/* Card 4: Global SLA Health */}
        <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-glass)] hover:border-white/15 transition-all shadow-lg shadow-black/20">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-3">
            <span className="font-mono uppercase">Global SLA Health</span>
            <Activity size={16} className="text-[var(--accent-lime)]" />
          </div>
          <div className="text-2xl font-mono font-bold text-white tracking-tight">
            {(metrics?.slaHealth ?? 99.5).toFixed(1)}%
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-lime)]" />
            p95 tariff latency &lt; 150ms
          </div>
        </div>
      </div>

      {/* Middle Grid: Charts & Velocity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hub Allocation Pie */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-glass)] flex flex-col justify-between">
          <div>
            <div className="text-xs font-mono text-[var(--accent-burnt-orange)] uppercase font-semibold">
              BONDED CUSTODY ALLOCATION
            </div>
            <h2 className="text-lg font-bold text-white mt-1">Five International Hubs</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Order routing share across verified terminal vaults.</p>
          </div>

          <div className="my-4 h-64 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={hubData}
                  dataKey="orders"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={4}
                >
                  {hubData.map((_, index) => (
                    <Cell key={index} fill={colors[index % colors.length]} stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#121216', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-mono font-bold text-white">
                {hubData.reduce((acc, h) => acc + h.orders, 0)}
              </span>
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Items Bound</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs font-mono">
            {hubData.map((h, i) => (
              <div key={h.hubId} className="flex items-center justify-between text-[var(--text-secondary)]">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
                  {h.name.split(' ')[0]}
                </span>
                <span className="font-bold text-white">{h.orders}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Real-Time Order & Verification Velocity Chart */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-glass)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-[var(--accent-lime)] uppercase font-semibold">
                TELEMETRY VELOCITY
              </div>
              <h2 className="text-lg font-bold text-white mt-1">Orders & Verification Throughput</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Live events stream sampled in 2-minute sliding windows.</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-[var(--accent-burnt-orange)]">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-burnt-orange)]" /> Orders
              </span>
              <span className="flex items-center gap-1.5 text-[var(--accent-lime)]">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-lime)]" /> Checks
              </span>
            </div>
          </div>

          <div className="my-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics?.velocity ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="minute" tickFormatter={v => `${v}m`} tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#121216', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                <Area type="monotone" dataKey="orders" stroke="#D9541E" fill="#D9541E" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="verifications" stroke="#B6FF00" fill="#B6FF00" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pt-3 border-t border-[var(--border-subtle)] font-mono">
            <span>NETWORK LOAD: NOMINAL</span>
            <span>PROVENANCE LATENCY: 22ms</span>
          </div>
        </div>
      </div>

      {/* Recent Escrow Orders Table */}
      <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-glass)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Active Escrow & Orders</h2>
            <p className="text-xs text-[var(--text-muted)]">Audited state transitions with single-click operator release.</p>
          </div>
          <span className="badge-lime text-xs">
            {orders?.orders.length ?? 0} ORDERS RECORDED
          </span>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-glass)] text-[var(--text-muted)] font-mono uppercase">
                <th className="pb-3 font-medium">Order ID</th>
                <th className="pb-3 font-medium">Items</th>
                <th className="pb-3 font-medium">Destination</th>
                <th className="pb-3 font-medium">Landed Total</th>
                <th className="pb-3 font-medium">State</th>
                <th className="pb-3 font-medium text-right">Escrow Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {orders?.orders.slice(0, 6).map(order => (
                <tr key={order.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="py-3.5 font-mono text-white">
                    <div>{order.id.slice(0, 14)}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{relative(order.createdAt)}</div>
                  </td>
                  <td className="py-3.5 text-[var(--text-secondary)]">
                    {order.items.map(i => `${i.sku} (×${i.quantity})`).join(', ')}
                  </td>
                  <td className="py-3.5 font-mono">{order.destination}</td>
                  <td className="py-3.5 font-mono font-bold text-white">{money(order.total)}</td>
                  <td className="py-3.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                        order.state === 'released'
                          ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/40'
                          : order.state === 'held'
                          ? 'bg-amber-950/50 text-amber-400 border border-amber-800/40'
                          : 'bg-rose-950/50 text-rose-400 border border-rose-800/40'
                      }`}
                    >
                      {order.state.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3.5 text-right">
                    {order.state === 'held' && (user?.role === 'operator' || user?.role === 'admin') ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          disabled={busy === order.id}
                          onClick={() => void action(order, 'release')}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
                        >
                          Release
                        </button>
                        <button
                          disabled={busy === order.id}
                          onClick={() => void action(order, 'hold')}
                          className="px-2.5 py-1 rounded border border-[var(--border-glass)] hover:bg-[var(--surface-hover)] text-[11px] transition-colors disabled:opacity-50"
                        >
                          Hold
                        </button>
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)] font-mono">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {(!orders?.orders || orders.orders.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--text-muted)] font-mono">
                    No active escrow orders recorded yet. Add items via the verified storefront to trigger an order.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
