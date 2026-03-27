'use client';
// src/app/(dashboard)/properties/PropModal.tsx

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import styles from '@/components/ui/ui.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetRow {
  id:     number;
  name:   string;
  amount: number;
  type:   'refundable' | 'recoverable';
}

export interface PropertyFormValues {
  name:         string;
  city:         string;
  state:        string;
  comm:         string;
  commCustom:   string;
  address:      string;
  capital:      string;
  assets:       AssetRow[];
  broker_name:  string;
  broker_pct:   string;
  broker_public: boolean;
}

export interface PropertySavePayload {
  name:          string;
  city:          string;
  state:         string;
  comm:          number;
  address:       string;
  capital:       number;
  assets:        Array<{ name: string; amount: number; type: string }>;
  broker_name:   string;
  broker_pct:    number;
  broker_public: boolean;
}

interface PropModalProps {
  isOpen:         boolean;
  onClose:        () => void;
  editId:         string | null;
  initialValues?: Partial<PropertyFormValues>;
  onSave:         (payload: PropertySavePayload, editId: string | null) => Promise<void>;
  isSaving:       boolean;
}

// ---------------------------------------------------------------------------
// State → City mapping
// ---------------------------------------------------------------------------

const STATE_CITIES: Record<string, string[]> = {
  Maharashtra:        ['Mumbai', 'Pune', 'Nashik', 'Nagpur', 'Aurangabad', 'Thane', 'Lonavala', 'Mahabaleshwar', 'Kolhapur', 'Satara'],
  'Uttar Pradesh':    ['Lucknow', 'Agra', 'Varanasi', 'Kanpur', 'Noida', 'Ghaziabad', 'Mathura', 'Allahabad', 'Meerut', 'Aligarh'],
  Goa:                ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda'],
  Delhi:              ['New Delhi', 'Dwarka', 'Rohini', 'Lajpat Nagar', 'Connaught Place'],
  Karnataka:          ['Bengaluru', 'Mysuru', 'Hubli', 'Mangaluru', 'Belagavi'],
  'Tamil Nadu':       ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'],
  Telangana:          ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam'],
  Rajasthan:          ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner'],
  Gujarat:            ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar'],
  Kerala:             ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam'],
  Uttarakhand:        ['Dehradun', 'Haridwar', 'Rishikesh', 'Nainital', 'Mussoorie'],
  'Himachal Pradesh': ['Shimla', 'Manali', 'Dharamshala', 'Kullu', 'Solan'],
  'West Bengal':      ['Kolkata', 'Howrah', 'Durgapur', 'Siliguri', 'Asansol'],
  Punjab:             ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda'],
  Haryana:            ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal'],
  'Madhya Pradesh':   ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain'],
};

const STATES = Object.keys(STATE_CITIES).sort();

// ---------------------------------------------------------------------------
// Blank form
// ---------------------------------------------------------------------------

const BLANK: PropertyFormValues = {
  name: '', city: '', state: '', comm: '25', commCustom: '',
  address: '', capital: '', assets: [],
  broker_name: '', broker_pct: '0', broker_public: false,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PropModal({ isOpen, onClose, editId, initialValues, onSave, isSaving }: PropModalProps) {
  const [form,         setForm]         = useState<PropertyFormValues>(BLANK);
  const [assetCounter, setAssetCounter] = useState(0);

  useEffect(() => {
    if (isOpen) setForm(initialValues ? { ...BLANK, ...initialValues } : BLANK);
  }, [isOpen, initialValues]);

  function set(field: keyof PropertyFormValues, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleStateChange(newState: string) {
    setForm((f) => ({ ...f, state: newState, city: '' }));
  }

  // Clear broker fields when name is erased
  function handleBrokerNameChange(val: string) {
    if (!val) {
      setForm((f) => ({ ...f, broker_name: '', broker_pct: '0', broker_public: false }));
    } else {
      setForm((f) => ({ ...f, broker_name: val }));
    }
  }

  const availableCities = form.state ? (STATE_CITIES[form.state] ?? []) : [];

  // ── Assets ────────────────────────────────────────────────────────────────
  function addAsset() {
    const id = assetCounter + 1;
    setAssetCounter(id);
    setForm((f) => ({ ...f, assets: [...f.assets, { id, name: '', amount: 0, type: 'refundable' }] }));
  }
  function updateAsset(id: number, field: keyof AssetRow, value: string | number) {
    setForm((f) => ({ ...f, assets: f.assets.map((a) => a.id === id ? { ...a, [field]: value } : a) }));
  }
  function removeAsset(id: number) {
    setForm((f) => ({ ...f, assets: f.assets.filter((a) => a.id !== id) }));
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const resolvedComm = form.comm === 'custom'
      ? parseFloat(form.commCustom) || 25
      : parseInt(form.comm);

    const brokerPct = form.broker_name ? (parseFloat(form.broker_pct) || 0) : 0;

    const payload: PropertySavePayload = {
      name:          form.name.trim(),
      city:          form.city.trim(),
      state:         form.state,
      comm:          resolvedComm,
      address:       form.address.trim(),
      capital:       parseFloat(form.capital) || 0,
      assets:        form.assets.filter((a) => a.name && a.amount > 0).map(({ name, amount, type }) => ({ name, amount, type })),
      broker_name:   form.broker_name.trim(),
      broker_pct:    brokerPct,
      broker_public: form.broker_name ? form.broker_public : false,
    };

    await onSave(payload, editId);
  }

  const assetTotal = form.assets.filter((a) => a.name && a.amount > 0).reduce((s, a) => s + a.amount, 0);
  const fIN = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasBroker = form.broker_name.trim().length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editId ? 'Edit Property' : 'Add Property'} subtitle="Create or update a property in the system">

      {/* Property Name */}
      <div className={styles.fl}>
        <label>Property Name *</label>
        <input className={styles.fi} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Andheri West Studio 2BHK" />
      </div>

      {/* State + City */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>State *</label>
          <div className={styles.sw}>
            <select className={styles.fs} value={form.state} onChange={(e) => handleStateChange(e.target.value)}>
              <option value="">Select State</option>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className={styles.fl}>
          <label>City *</label>
          {availableCities.length > 0 ? (
            <div className={styles.sw}>
              <select className={styles.fs} value={form.city} onChange={(e) => set('city', e.target.value)}>
                <option value="">Select City</option>
                {availableCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ) : (
            <input className={styles.fi} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder={form.state ? 'Type city name' : 'Select a state first'} disabled={!form.state} />
          )}
        </div>
      </div>

      {/* Commission % */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>MHG Commission % *</label>
          <div className={styles.sw}>
            <select className={styles.fs} value={form.comm} onChange={(e) => set('comm', e.target.value)}>
              <option value="20">20%</option>
              <option value="25">25%</option>
              <option value="30">30%</option>
              <option value="custom">Custom…</option>
            </select>
          </div>
        </div>
        {form.comm === 'custom' && (
          <div className={styles.fl}>
            <label>Custom %</label>
            <input className={styles.fi} type="number" value={form.commCustom} onChange={(e) => set('commCustom', e.target.value)} placeholder="e.g. 22" min={1} max={99} />
          </div>
        )}
      </div>

      {/* Address */}
      <div className={styles.fl}>
        <label>Address</label>
        <input className={styles.fi} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Full address" />
      </div>

      {/* Capital Invested */}
      <div style={{ border: '1.5px solid var(--bdr)', borderRadius: '10px', padding: '12px', marginBottom: '12px', background: 'var(--bg)' }}>
        <div className={styles.fl} style={{ marginBottom: '8px' }}>
          <label style={{ fontWeight: 700, fontSize: '12.5px' }}>💰 Capital Invested (₹)</label>
          <input className={styles.fi} type="number" value={form.capital} onChange={(e) => set('capital', e.target.value)} placeholder="e.g. 1000000" style={{ marginTop: '4px' }} />
        </div>
        <div style={{ fontSize: '10px', color: 'var(--t3)' }}>Used for ROI calculation. This is the actual money invested.</div>
      </div>

      {/* Broker / Co-Agent */}
      <div style={{ border: '1.5px solid var(--bdr)', borderRadius: '10px', padding: '12px', marginBottom: '12px', background: 'var(--bg)' }}>
        <div style={{ fontSize: '12.5px', fontWeight: 700, marginBottom: '8px' }}>🤝 Broker / Co-Agent <span style={{ fontWeight: 400, fontSize: '10.5px', color: 'var(--t3)' }}>(optional)</span></div>

        <div className={styles.fl}>
          <label>Broker Name</label>
          <input className={styles.fi} value={form.broker_name} onChange={(e) => handleBrokerNameChange(e.target.value)} placeholder="e.g. Adil" />
        </div>

        {hasBroker && (
          <>
            <div className={styles.fl}>
              <label>Broker Commission %</label>
              <input className={styles.fi} type="number" value={form.broker_pct} onChange={(e) => set('broker_pct', e.target.value)} placeholder="e.g. 10" min={0} max={99} />
            </div>

            {/* Public / Private toggle */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: 'var(--tx)' }}>
              <input
                type="checkbox"
                checked={form.broker_public}
                onChange={(e) => set('broker_public', e.target.checked)}
                style={{ marginTop: '2px', accentColor: 'var(--or)', flexShrink: 0 }}
              />
              <span>
                Show broker commission publicly
                <span style={{ display: 'block', fontSize: '10px', color: 'var(--t3)', marginTop: '2px', fontWeight: 400 }}>
                  When checked, broker % is added to MHG commission in all investor-facing columns and reports. When unchecked, broker is paid internally by MHG and is not visible anywhere.
                </span>
              </span>
            </label>

            {/* Live preview */}
            <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '8px', background: form.broker_public ? 'var(--orp)' : 'var(--s2)', fontSize: '11px', color: form.broker_public ? 'var(--or)' : 'var(--t2)' }}>
              {form.broker_public
                ? `Public: investors see ${(parseFloat(form.comm === 'custom' ? form.commCustom : form.comm) || 0) + (parseFloat(form.broker_pct) || 0)}% total commission (MHG ${form.comm === 'custom' ? form.commCustom : form.comm}% + ${form.broker_name} ${form.broker_pct}%)`
                : `Private: investors see only MHG ${form.comm === 'custom' ? form.commCustom : form.comm}% commission. Broker paid internally.`
              }
            </div>
          </>
        )}
      </div>

      {/* Saved Assets */}
      <div style={{ border: '1.5px solid var(--bdr)', borderRadius: '10px', padding: '12px', marginBottom: '12px', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontWeight: 700, fontSize: '12.5px' }}>💼 Saved Assets <span style={{ fontWeight: 400, fontSize: '10.5px', color: 'var(--t3)' }}>(Recoverable)</span></label>
          <button type="button" className="btn btn-g btn-sm" onClick={addAsset}>+ Add Asset</button>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--t3)', marginBottom: '8px' }}>Security deposits, rent advances, furniture — NOT included in ROI.</div>

        {form.assets.map((asset) => (
          <div key={asset.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px 28px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
            <input className={styles.fi} value={asset.name} onChange={(e) => updateAsset(asset.id, 'name', e.target.value)} placeholder="Asset name" />
            <input className={styles.fi} type="number" value={asset.amount || ''} onChange={(e) => updateAsset(asset.id, 'amount', parseFloat(e.target.value) || 0)} placeholder="₹ Amount" />
            <div className={styles.sw}>
              <select className={styles.fs} value={asset.type} onChange={(e) => updateAsset(asset.id, 'type', e.target.value as 'refundable' | 'recoverable')}>
                <option value="refundable">Refundable</option>
                <option value="recoverable">Recoverable</option>
              </select>
            </div>
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rd)', fontSize: '14px' }} onClick={() => removeAsset(asset.id)}>✕</button>
          </div>
        ))}

        {assetTotal > 0 && (
          <div style={{ fontSize: '11.5px', padding: '8px', background: 'var(--s2)', borderRadius: '8px', marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--bl)' }}>
              <span>Total Secured Assets</span><span>{fIN(assetTotal)}</span>
            </div>
            <div style={{ fontSize: '9.5px', color: 'var(--t3)', marginTop: '3px' }}>Recoverable — not included in ROI or expenses.</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={styles.mf}>
        <button type="button" className={`${styles.mb} ${styles.can}`} onClick={onClose}>Cancel</button>
        <button type="button" className={`${styles.mb} ${styles.sub}`} onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? 'Saving…' : editId ? 'Update Property' : 'Save Property'}
        </button>
      </div>
    </Modal>
  );
}
