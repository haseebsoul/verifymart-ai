import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Boxes, CheckCircle2, ClipboardCheck, Clock3,
  ShieldCheck, ShoppingBag, Store, Truck
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { CATEGORIES, type Destination, type DutyQuote, type Product } from '@verifymart/shared';
import { api } from '../lib/api';
import { useCart } from '../context/cart';

type PublicMetrics = {
  api: { status: string; p95LatencyMs: number; requests: number; errors: number };
  database: { products: number; batchProvenanceRecords: number; registeredSuppliers: number; orderRecords: number };
};
type Health = { status: string; database: string; persistence: string; p95LatencyMs: number };
type AtlasVerificationResult = {
  query: string; found: boolean; simulated: true; recordType: 'product' | 'order' | 'not_found';
  authenticityNote: string; authenticityScore?: number;
  product?: { id: string; sku: string; name: string; brand: string; category: string; priceUsd: number; status: string; authenticityScore: number; batchHash: string; hsCode: string; originHubId: string };
  timeline?: Array<{ id: string; stage: string; hubId: string; occurredAt: string; hash: string }>;
};

const destinations = [
  'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi',
  'Faisalabad', 'Multan', 'Peshawar', 'Quetta'
];
const origins = ['China', 'UAE', 'UK', 'USA', 'Turkey', 'Singapore', 'Switzerland'];
const roleSteps = [
  { number: '01', title: 'Supplier registration', text: 'The supplier business profile is stored in Atlas and begins in pending review before published listings are enabled.', icon: Store },
  { number: '02', title: 'Hash-anchored batch record', text: 'A SHA-256 digest identifies the submitted product batch and links its recorded custody events.', icon: ShieldCheck },
  { number: '03', title: 'Customs estimate', text: 'A versioned PCT / HS tariff record powers the published landed-cost estimate.', icon: ClipboardCheck },
  { number: '04', title: 'Delivery evidence', text: 'Order and escrow states make each checkout handoff visible to the permitted workspaces.', icon: Truck }
];

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <span className="eyebrow section-eyebrow">{children}</span>;
}

function VerificationCard() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<AtlasVerificationResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api<AtlasVerificationResult>(`/verify/${encodeURIComponent(value)}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No matching batch record was found.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="certificate-shell">
      <div className="certificate-status">
        <span><i /> Supplier batch record</span>
        <b>VM / PK</b>
      </div>
      <div className="certificate-card">
        <div className="certificate-card-top">
          <span className="certificate-mark"><ShieldCheck size={22} /></span>
          <span className="certificate-label">BATCH PROVENANCE RECORD</span>
        </div>
        <h2>Check a supplier record</h2>
        <p>Inspect the batch digest and its recorded custody trail. Application records are not manufacturer-signed proof.</p>
        <form onSubmit={verify} className="certificate-form">
          <label htmlFor="batch-hash">SHA-256 batch hash</label>
          <input
            id="batch-hash"
            value={query}
            onChange={event => setQuery(event.target.value)}
            maxLength={128}
            placeholder="64 hexadecimal characters"
            autoComplete="off"
          />
          <button className="button button-primary" disabled={busy || !query.trim()}>
            {busy ? 'Verifying…' : 'Verify record'} <ArrowRight size={16} />
          </button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
        {result && (
          <div className="verification-result" role="status">
            <div><BadgeCheck size={18} /><strong>{result.product?.name ?? 'Verification record'}</strong></div>
            <span>{result.authenticityScore ?? result.product?.authenticityScore ?? '—'}/100 · {result.timeline?.length ?? 0} recorded checkpoints</span>
            <small>{result.authenticityNote}</small>
            <Link to={`/verify?query=${encodeURIComponent(result.query)}`}>Open full verification record</Link>
          </div>
        )}
      </div>
      <div className="certificate-caption"><span>RECORD / 01</span><span>PUBLIC VERIFICATION</span></div>
    </div>
  );
}

function CostCalculator({ products }: { products: Product[] }) {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [origin, setOrigin] = useState('China');
  const [city, setCity] = useState('Karachi');
  const [filer, setFiler] = useState<'filer' | 'non-filer'>('filer');
  const [quote, setQuote] = useState<DutyQuote | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const categoryProducts = useMemo(
    () => products.filter(product => product.category === category),
    [products, category]
  );
  const selectedProduct = products.find(product => product.id === productId && product.category === category)
    ?? categoryProducts[0];

  const calculate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProduct) {
      setError('The live product catalogue is required to calculate a quote.');
      return;
    }
    setBusy(true);
    setError('');
    setQuote(null);
    try {
      const result = await api<DutyQuote>('/duty/calculate', {
        method: 'POST',
        body: JSON.stringify({
          destinationCountry: 'PK' satisfies Destination,
          originCountry: origin,
          destinationCity: city,
          taxProfile: filer,
          items: [{ productId: selectedProduct.id, quantity }]
        })
      });
      setQuote(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Atlas tariff service could not calculate this estimate.');
    } finally {
      setBusy(false);
    }
  };

  const rows: Array<[string, number | null]> = [
    ['Assessed item value', quote?.subtotal ?? null],
    ['Customs duty', quote?.duty ?? null],
    ['Additional customs duty (demo)', quote?.additionalCustomsDuty ?? null],
    ['Regulatory duty (demo)', quote?.regulatoryDuty ?? null],
    ['Federal excise duty (demo)', quote?.federalExciseDuty ?? null],
    ['Sales tax / VAT (seeded estimate)', quote?.vat ?? null],
    ['Income tax withholding (demo)', quote?.incomeTaxWithholding ?? null],
    ['Carrier fee (demo)', quote?.carrierFee ?? null],
    ['Platform fee (demo)', quote?.platformFee ?? null]
  ];

  return (
    <div className="cost-calculator-card">
      <div className="cost-card-heading">
        <div><span className="certificate-label">COST BREAKDOWN ESTIMATE</span><span className="estimate-currency">USD estimate · Pakistan destination · placeholder rates</span></div>
        <span className="cost-source"><i /> Atlas demo tariff API</span>
      </div>
      <form className="cost-form" onSubmit={calculate}>
        <label>Product category
          <select value={category} onChange={event => { setCategory(event.target.value); setProductId(''); setQuote(null); }}>
            {CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>Catalog product
          <select value={selectedProduct?.id ?? ''} onChange={event => { setProductId(event.target.value); setQuote(null); }} required>
            {categoryProducts.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <div className="cost-input-pair">
          <label>8-digit PCT / HS code
            <input readOnly value={selectedProduct?.hsCode.replace(/\D/g, '') ?? ''} placeholder="Select a catalog product" />
          </label>
          <label>Price in USD
            <input readOnly value={selectedProduct ? usd(selectedProduct.priceUsd) : ''} placeholder="From live product record" />
          </label>
        </div>
        <div className="cost-input-pair">
          <label>Origin country
            <select value={origin} onChange={event => setOrigin(event.target.value)}>
              {origins.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Destination city
            <select value={city} onChange={event => setCity(event.target.value)}>
              {destinations.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <fieldset className="filer-toggle">
          <legend>Tax profile</legend>
          <button type="button" aria-pressed={filer === 'filer'} className={filer === 'filer' ? 'is-active' : ''} onClick={() => setFiler('filer')}>Filer</button>
          <button type="button" aria-pressed={filer === 'non-filer'} className={filer === 'non-filer' ? 'is-active' : ''} onClick={() => setFiler('non-filer')}>Non-filer</button>
        </fieldset>
        <button className="button button-primary" disabled={busy || !selectedProduct}>
          {busy ? 'Calculating from Atlas…' : 'Calculate landed cost'} <ArrowRight size={16} />
        </button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="cost-breakdown">
        {rows.map(([label, value]) => (
          <div className={value === null ? 'cost-row is-unconfigured' : 'cost-row'} key={label}>
            <span>{label}</span><b>{value === null ? 'Not configured' : usd(value)}</b>
          </div>
        ))}
        <div className="cost-row cost-total">
          <span>Total landed cost (USD)</span><b>{quote ? usd(quote.total) : '—'}</b>
        </div>
        <div className="cost-row cost-total">
          <span>Illustrative total (PKR)</span><b>{quote?.totalPkr !== null && quote?.totalPkr !== undefined ? new Intl.NumberFormat('en-PK',{style:'currency',currency:'PKR',maximumFractionDigits:2}).format(quote.totalPkr) : '—'}</b>
        </div>
      </div>
      <p className="cost-disclaimer">
        Selected context: origin {origin} · destination {city} · {filer === 'filer' ? 'Filer' : 'Non-filer'}.
        Origin, city and filer are retained as quote context. Pakistan ACD/RD/FED, withholding, platform fee and USD/PKR conversion use explicit demo placeholders and illustrative calculation bases. These are not official customs/FBR figures or market foreign-exchange data.
      </p>
    </div>
  );
}

export function HomePage() {
  const addToCart = useCart(state => state.add);
  const [catalogCategory, setCatalogCategory] = useState('All');
  const productsQuery = useQuery({
    queryKey: ['landing-catalog'],
    queryFn: () => api<{ products: Product[]; total: number }>('/products?sort=authenticity'),
    refetchInterval: 30_000
  });
  const metricsQuery = useQuery({
    queryKey: ['landing-metrics'],
    queryFn: () => api<PublicMetrics>('/public/metrics'),
    refetchInterval: 30_000
  });
  const healthQuery = useQuery({
    queryKey: ['landing-health'],
    queryFn: () => api<Health>('/health'),
    refetchInterval: 15_000,
    retry: 1
  });

  const products = productsQuery.data?.products ?? [];
  const filteredProducts = useMemo(
    () => catalogCategory === 'All' ? products : products.filter(product => product.category === catalogCategory),
    [catalogCategory, products]
  );
  const metrics = metricsQuery.data?.database;
  const isApiHealthy = healthQuery.data?.status === 'ok' && healthQuery.data.database === 'ok';

  return (
    <main className="home-page editorial-home">
      <section className="editorial-hero section-shell" id="trusted-imports">
        <div className="editorial-hero-copy">
          <SectionEyebrow>01 / TRUSTED IMPORTS FOR PAKISTAN</SectionEyebrow>
          <h1>Supplier-submitted records. Sourced estimates. Clear order states.</h1>
          <p>
            Inspect published batch records, review versioned landed-cost estimates and follow transparent order states
            from origin to delivery. One record for every important handoff.
          </p>
          <div className="editorial-hero-actions">
            <Link className="button button-primary" to="/store">Browse product catalog <ArrowRight size={17} /></Link>
            <Link className="button button-outline" to="/verify">Check a batch record</Link>
          </div>
          <div className="live-database-counters" aria-live="polite">
            <div><b>{metrics ? metrics.batchProvenanceRecords.toLocaleString() : '—'}</b><span>Batch provenance records</span></div>
            <div><b>{metrics ? metrics.registeredSuppliers.toLocaleString() : '—'}</b><span>Registered suppliers</span></div>
            <div><b>{metrics ? metrics.orderRecords.toLocaleString() : '—'}</b><span>Order records</span></div>
          </div>
          {metricsQuery.isError && <small className="inline-status-error">Live database counters are currently unavailable.</small>}
        </div>
        <div className="editorial-hero-visual"><VerificationCard /></div>
      </section>

      <div className="logistics-ticker" aria-label="Pakistan trade and carrier reference points">
        <span>Karachi Port</span><i>·</i><span>Port Qasim</span><i>·</i><span>Lahore Dry Port</span><i>·</i><span>TCS</span><i>·</i><span>Leopards</span><i>·</i><span>M&amp;P</span>
      </div>
      <p className="ticker-disclaimer">Port, courier and carrier names are reference points only; no live logistics or partner integration is asserted.</p>

      <section className="editorial-section section-shell" id="how-it-works">
        <div className="editorial-section-heading">
          <SectionEyebrow>02 / TRACEABILITY / 4 CHECKPOINTS</SectionEyebrow>
          <h2>Four checkpoints between the factory and your door.</h2>
          <p>Each step leaves a structured record that the next stakeholder can inspect.</p>
        </div>
        <div className="checkpoint-grid">
          {roleSteps.map(step => {
            const Icon = step.icon;
            return (
              <article className="checkpoint-card" key={step.number}>
                <div className="checkpoint-card-top"><span>{step.number}</span><Icon size={22} /></div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="editorial-section cost-section" id="calculator">
        <div className="section-shell cost-layout">
          <div className="editorial-section-heading">
            <SectionEyebrow>03 / PRICE CERTAINTY / LANDED COST</SectionEyebrow>
            <h2>Build an itemised landed-cost estimate.</h2>
            <p>Choose a live product and calculate against the versioned Pakistan tariff records stored in Atlas.</p>
            <div className="cost-assurances">
              <span><CheckCircle2 size={16} /> Product and batch data from Atlas</span>
              <span><CheckCircle2 size={16} /> Published duty and VAT rules</span>
              <span><CheckCircle2 size={16} /> Unconfigured charges stay visible</span>
            </div>
          </div>
          <CostCalculator products={products} />
        </div>
      </section>

      <section className="editorial-section section-shell catalog-section" id="catalog">
        <div className="editorial-section-heading catalog-heading">
          <div>
            <SectionEyebrow>04 / SUPPLIER RECORDS / CATALOG</SectionEyebrow>
            <h2>Published catalog records, traceable to origin.</h2>
          </div>
          <Link className="text-link" to="/store">Open full catalog <ArrowRight size={16} /></Link>
        </div>
        <div className="catalog-filter-row" role="group" aria-label="Filter products by category">
          {['All', ...CATEGORIES].map(category => (
            <button key={category} type="button" className={catalogCategory === category ? 'is-active' : ''} aria-pressed={catalogCategory === category} onClick={() => setCatalogCategory(category)}>
              {category}
            </button>
          ))}
          <span className="catalog-live-count">{productsQuery.data ? `${filteredProducts.length} LIVE RECORDS` : 'ATLAS CATALOG'}</span>
        </div>
        {productsQuery.isLoading && <div className="catalog-state"><span className="status-spinner" /> Connecting to Atlas product records…</div>}
        {productsQuery.isError && <div className="catalog-state catalog-state-error" role="alert">The Atlas catalog could not be loaded. Check the API status below and retry the page.</div>}
        {productsQuery.isSuccess && filteredProducts.length === 0 && <div className="catalog-state">No published products match this category.</div>}
        {filteredProducts.length > 0 && (
          <div className="supplier-record-grid">
            {filteredProducts.map(product => (
              <article className="supplier-record-card" key={product.id}>
                <div className="supplier-record-image">
                  <img src={product.imageUrl || '/product-fallback.svg'} alt={product.name} loading="lazy" />
                  <span className={product.status === 'verified' ? 'record-state state-verified' : 'record-state'}>{product.status.replace('_', ' ')}</span>
                </div>
                <div className="supplier-record-body">
                  <div className="supplier-record-meta"><span>{product.sku}</span><span>{product.category}</span></div>
                  <h3>{product.name}</h3>
                  <p>{product.brand} · Origin hub {product.originHubId.replace('HUB-', '')}</p>
                  <div className="record-hash-label">SHA-256 BATCH HASH</div>
                  <code className="record-hash">{product.batchHash}</code>
                  <div className="record-authenticity"><span>Authenticity score</span><b>{product.authenticityScore}/100</b></div>
                  <div className="record-card-actions">
                    <Link to={`/verify?query=${encodeURIComponent(product.batchHash)}`}>Quick verify</Link>
                    <button type="button" onClick={() => addToCart(product)}><ShoppingBag size={15} /> Add to cart</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="editorial-section reliability-section" id="reliability">
        <div className="section-shell">
          <div className="editorial-section-heading">
            <SectionEyebrow>05 / RELIABILITY / SYSTEM STATUS</SectionEyebrow>
            <h2>Operational status, published.</h2>
            <p>Live API health, request telemetry and aggregate Atlas record counts. No static demo values are substituted when the service is offline.</p>
          </div>
          <div className="reliability-grid">
            <article className="reliability-card">
              <span className="reliability-label">API STATUS</span>
              <strong className={isApiHealthy ? 'status-good' : 'status-down'}>{healthQuery.isLoading ? 'CHECKING' : isApiHealthy ? 'HEALTHY' : 'UNAVAILABLE'}</strong>
              <small>{healthQuery.data?.persistence ?? 'Atlas connection not confirmed'}</small>
            </article>
            <article className="reliability-card">
              <span className="reliability-label">API P95 LATENCY</span>
              <strong>{metricsQuery.data ? `${metricsQuery.data.api.p95LatencyMs} ms` : healthQuery.data ? `${healthQuery.data.p95LatencyMs} ms` : '—'}</strong>
              <small>Rolling sample from the current API process</small>
            </article>
            <article className="reliability-card">
              <span className="reliability-label">PUBLISHED PRODUCTS</span>
              <strong>{metrics ? metrics.products.toLocaleString() : '—'}</strong>
              <small>Published Atlas product records</small>
            </article>
            <article className="reliability-card">
              <span className="reliability-label">REGISTERED SUPPLIERS</span>
              <strong>{metrics ? metrics.registeredSuppliers.toLocaleString() : '—'}</strong>
              <small>Supplier profiles in Atlas</small>
            </article>
          </div>
          <div className="reliability-foot">
            <span><Clock3 size={15} /> Refreshes automatically</span>
            <span><Boxes size={15} /> {metrics ? metrics.database.orderRecords.toLocaleString() : '—'} order records</span>
            <Link to="/api/health" target="_blank">Open health endpoint <ArrowRight size={14} /></Link>
          </div>
          {(healthQuery.isError || metricsQuery.isError) && <p className="inline-status-error">A live telemetry request failed. Values are left blank rather than replaced with sample data.</p>}
        </div>
      </section>

      <section className="final-cta section-shell">
        <div><SectionEyebrow>VERIFYMART AI / PAKISTAN</SectionEyebrow><h2>Make the next handoff<br />a little more certain.</h2></div>
        <div><p>Browse the supplier catalog, or inspect a batch hash before you place an order.</p><div className="editorial-hero-actions"><Link className="button button-primary" to="/store">Browse catalog <ArrowRight size={16} /></Link><Link className="button button-outline" to="/register">Create account</Link></div></div>
      </section>
    </main>
  );
}
