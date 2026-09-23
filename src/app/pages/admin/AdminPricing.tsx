import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Edit2, Loader2, Plus, RefreshCw, Save, Search, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteAdminSmsmanOverride,
  getAdminSmsmanCountries,
  getAdminSmsmanPricing,
  getAdminSmsmanServices,
  saveAdminSmsmanGlobalPricing,
  saveAdminSmsmanOverride,
} from '../../../lib/api.js';

interface SmsmanCountry {
  country_id: string;
  title: string;
  code: string;
  flag?: string;
  flag_url?: string;
  flag_svg_url?: string;
  flag_png_url?: string;
}

interface SmsmanService {
  service_id: string;
  title: string;
  name: string;
  code: string;
  icon_code?: string;
  image?: string;
  image_url?: string;
}

interface PricingRule {
  id: string;
  scope: 'global' | 'country_service';
  country_id: string | null;
  country_title: string | null;
  country_code: string | null;
  country_flag_url?: string | null;
  service_id: string | null;
  service_title: string | null;
  service_code: string | null;
  service_image_url?: string | null;
  price: number;
  currency: string;
  is_active: boolean;
}

const currency = 'GHS';
const LOOKUP_LIMIT = 30;

function formatPrice(value?: number | null) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function ServiceIcon({ imageUrl, label }: { imageUrl?: string | null; label: string }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="w-8 h-8 rounded-lg object-cover border border-gray-100 bg-white"
        loading="lazy"
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-xs" style={{ fontWeight: 700 }}>
      {(label || '?').slice(0, 1).toUpperCase()}
    </div>
  );
}

function CountryFlag({ imageUrl, label }: { imageUrl?: string | null; label: string }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="w-8 h-8 rounded-lg object-cover border border-gray-100 bg-white"
        loading="lazy"
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center text-xs" style={{ fontWeight: 700 }}>
      {(label || '?').slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function AdminPricing() {
  const [countries, setCountries] = useState<SmsmanCountry[]>([]);
  const [services, setServices] = useState<SmsmanService[]>([]);
  const [globalRule, setGlobalRule] = useState<PricingRule | null>(null);
  const [overrides, setOverrides] = useState<PricingRule[]>([]);
  const [globalPrice, setGlobalPrice] = useState('');
  const [newOverride, setNewOverride] = useState({ service_id: '', country_id: '', price: '' });
  const [serviceSearch, setServiceSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [preview, setPreview] = useState({ service_id: '', country_id: '' });
  const [loading, setLoading] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadServices = useCallback(async (q = '') => {
    setLoadingServices(true);
    const response = await getAdminSmsmanServices({ q, page: '1', limit: String(LOOKUP_LIMIT) });
    const loadedServices = response.services || [];
    setServices(loadedServices);
    return loadedServices;
  }, []);

  const loadCountries = useCallback(async (q = '') => {
    setLoadingCountries(true);
    const response = await getAdminSmsmanCountries({ q, page: '1', limit: String(LOOKUP_LIMIT) });
    const loadedCountries = response.countries || [];
    setCountries(loadedCountries);
    return loadedCountries;
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [countriesResponse, servicesResponse, pricingResponse] = await Promise.all([
        getAdminSmsmanCountries({ page: '1', limit: String(LOOKUP_LIMIT) }),
        getAdminSmsmanServices({ page: '1', limit: String(LOOKUP_LIMIT) }),
        getAdminSmsmanPricing(),
      ]);
      const loadedCountries = countriesResponse.countries || [];
      const loadedServices = servicesResponse.services || [];
      const loadedGlobal = pricingResponse.global_rule || null;
      setCountries(loadedCountries);
      setServices(loadedServices);
      setGlobalRule(loadedGlobal);
      setOverrides(pricingResponse.overrides || []);
      setGlobalPrice(loadedGlobal?.price ? String(loadedGlobal.price) : '');
      setPreview({
        service_id: loadedServices[0]?.service_id || '',
        country_id: loadedCountries[0]?.country_id || '',
      });
    } catch (err: any) {
      setError(err?.data?.message || err?.message || 'Unable to load SMS-MAN pricing data.');
    } finally {
      setLoading(false);
      setLoadingServices(false);
      setLoadingCountries(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedPreviewOverride = useMemo(() => {
    return overrides.find(rule => rule.service_id === preview.service_id && rule.country_id === preview.country_id) || null;
  }, [overrides, preview]);

  const previewService = services.find(service => service.service_id === preview.service_id);
  const previewCountry = countries.find(country => country.country_id === preview.country_id);
  const previewPrice = selectedPreviewOverride?.price ?? globalRule?.price ?? null;
  const selectedOverrideService = services.find(service => service.service_id === newOverride.service_id);
  const selectedOverrideCountry = countries.find(country => country.country_id === newOverride.country_id);

  const runServiceSearch = async () => {
    try {
      const loadedServices = await loadServices(serviceSearch.trim());
      if (!loadedServices.some(service => service.service_id === preview.service_id)) {
        setPreview(prev => ({ ...prev, service_id: loadedServices[0]?.service_id || '' }));
      }
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Unable to search services.');
    } finally {
      setLoadingServices(false);
    }
  };

  const clearServiceSearch = () => {
    setServiceSearch('');
    loadServices('').finally(() => setLoadingServices(false));
  };

  const runCountrySearch = async () => {
    try {
      const loadedCountries = await loadCountries(countrySearch.trim());
      if (!loadedCountries.some(country => country.country_id === preview.country_id)) {
        setPreview(prev => ({ ...prev, country_id: loadedCountries[0]?.country_id || '' }));
      }
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Unable to search countries.');
    } finally {
      setLoadingCountries(false);
    }
  };

  const clearCountrySearch = () => {
    setCountrySearch('');
    loadCountries('').finally(() => setLoadingCountries(false));
  };

  const saveGlobal = async () => {
    const price = Number(globalPrice);
    if (!price || price <= 0) {
      toast.error('Enter a valid fixed global price.');
      return;
    }

    try {
      setSaving(true);
      const response = await saveAdminSmsmanGlobalPricing({ price, currency });
      setGlobalRule(response.global_rule);
      toast.success(response.message || 'Global price saved.');
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Unable to save global price.');
    } finally {
      setSaving(false);
    }
  };

  const saveOverride = async (payload = newOverride, closeEdit = false) => {
    const price = Number(payload.price);
    if (!payload.service_id || !payload.country_id || !price || price <= 0) {
      toast.error('Select service, country, and enter a valid fixed price.');
      return;
    }

    try {
      setSaving(true);
      const response = await saveAdminSmsmanOverride({
        service_id: payload.service_id,
        country_id: payload.country_id,
        price,
        currency,
      });
      const saved = response.override;
      setOverrides(prev => [saved, ...prev.filter(rule => rule.id !== saved.id && !(rule.service_id === saved.service_id && rule.country_id === saved.country_id))]);
      setNewOverride({ service_id: '', country_id: '', price: '' });
      if (closeEdit) setEditId(null);
      toast.success(response.message || 'Override saved.');
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Unable to save override.');
    } finally {
      setSaving(false);
    }
  };

  const deleteOverride = async (id: string) => {
    try {
      setSaving(true);
      const response = await deleteAdminSmsmanOverride(id);
      setOverrides(prev => prev.filter(rule => rule.id !== id));
      toast.success(response.message || 'Override deleted.');
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Unable to delete override.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Pricing Management</h1>
          <p className="text-gray-500 text-sm mt-0.5">Set fixed SMS-MAN selling prices for all users.</p>
        </div>
        <button onClick={loadData} disabled={loading} className="p-2.5 border border-gray-200 hover:border-gray-300 text-gray-600 rounded-xl transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="border border-red-100 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
          <Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin" />
          Loading SMS-MAN pricing data...
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                <Tag className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Global Fixed Price</h2>
                <p className="text-gray-400 text-xs">Default SMS-MAN selling price unless a country/service override exists.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-sm text-gray-700 mb-2" style={{ fontWeight: 500 }}>Fixed Price (GHS)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={globalPrice}
                  onChange={event => setGlobalPrice(event.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                  placeholder="Example: 12.00"
                />
              </div>
              <button onClick={saveGlobal} disabled={saving} className="flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}>
                <Save className="w-4 h-4" />
                Save Global Price
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-gray-800 mb-4" style={{ fontWeight: 600 }}>Preview</h2>
            <div className="mb-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={event => setServiceSearch(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') runServiceSearch(); }}
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                  placeholder="Search service by name, code, or ID"
                />
              </div>
              <button onClick={runServiceSearch} disabled={loadingServices} className="flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}>
                {loadingServices ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
              {serviceSearch && (
                <button onClick={clearServiceSearch} className="flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-600 px-4 py-2.5 rounded-xl text-sm transition-colors">
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>
            <div className="mb-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={countrySearch}
                  onChange={event => setCountrySearch(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') runCountrySearch(); }}
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                  placeholder="Search country by name, code, or ID"
                />
              </div>
              <button onClick={runCountrySearch} disabled={loadingCountries} className="flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}>
                {loadingCountries ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
              {countrySearch && (
                <button onClick={clearCountrySearch} className="flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-600 px-4 py-2.5 rounded-xl text-sm transition-colors">
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="flex items-center gap-2">
                <ServiceIcon imageUrl={previewService?.image_url || previewService?.image} label={previewService?.title || previewService?.name || 'Service'} />
                <select value={preview.service_id} onChange={event => setPreview(prev => ({ ...prev, service_id: event.target.value }))} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400">
                  {services.map(service => <option key={service.service_id} value={service.service_id}>{service.title || service.name} ({service.code})</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <CountryFlag imageUrl={previewCountry?.flag_url || previewCountry?.flag || previewCountry?.flag_png_url || previewCountry?.flag_svg_url} label={previewCountry?.code || previewCountry?.title || 'Country'} />
                <select value={preview.country_id} onChange={event => setPreview(prev => ({ ...prev, country_id: event.target.value }))} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400">
                  {countries.map(country => <option key={country.country_id} value={country.country_id}>{country.title} ({country.code})</option>)}
                </select>
              </div>
              <div className="border border-blue-100 bg-blue-50 rounded-xl px-4 py-3">
                <div className="text-xs text-blue-700" style={{ fontWeight: 600 }}>{selectedPreviewOverride ? 'Override price' : 'Global default price'}</div>
                <div className="text-lg text-blue-950" style={{ fontWeight: 700 }}>{previewPrice ? formatPrice(previewPrice) : 'No price set'}</div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {previewService?.title || previewService?.name || 'Service'} in {previewCountry?.title || 'country'} uses {selectedPreviewOverride ? 'the specific override.' : 'the global default.'}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Country / Service Overrides</h2>
              <p className="text-gray-400 text-xs mt-0.5">Overrides take priority over the global fixed price.</p>
            </div>

            <div className="px-5 py-4 border-b border-gray-100 bg-blue-50/50">
              <div className="grid md:grid-cols-[1fr_1fr_160px_auto] gap-3 items-end">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block" style={{ fontWeight: 500 }}>Service</label>
                  <div className="flex items-center gap-2">
                    <ServiceIcon imageUrl={selectedOverrideService?.image_url || selectedOverrideService?.image} label={selectedOverrideService?.title || selectedOverrideService?.name || 'Service'} />
                    <select value={newOverride.service_id} onChange={event => setNewOverride(prev => ({ ...prev, service_id: event.target.value }))} className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">
                      <option value="">Select service...</option>
                      {services.map(service => <option key={service.service_id} value={service.service_id}>{service.title || service.name} ({service.code})</option>)}
                    </select>
                  </div>
                  {services.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">No services match this search.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block" style={{ fontWeight: 500 }}>Country</label>
                  <div className="flex items-center gap-2">
                    <CountryFlag imageUrl={selectedOverrideCountry?.flag_url || selectedOverrideCountry?.flag || selectedOverrideCountry?.flag_png_url || selectedOverrideCountry?.flag_svg_url} label={selectedOverrideCountry?.code || selectedOverrideCountry?.title || 'Country'} />
                    <select value={newOverride.country_id} onChange={event => setNewOverride(prev => ({ ...prev, country_id: event.target.value }))} className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">
                      <option value="">Select country...</option>
                      {countries.map(country => <option key={country.country_id} value={country.country_id}>{country.title} ({country.code})</option>)}
                    </select>
                  </div>
                  {countries.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">No countries match this search.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block" style={{ fontWeight: 500 }}>Fixed Price GHS</label>
                  <input type="number" min="0" step="0.01" value={newOverride.price} onChange={event => setNewOverride(prev => ({ ...prev, price: event.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="12.00" />
                </div>
                <button onClick={() => saveOverride()} disabled={saving} className="flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm transition-colors" style={{ fontWeight: 500 }}>
                  <Plus className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {overrides.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <Tag className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No SMS-MAN overrides configured.
                </div>
              ) : overrides.map(rule => {
                const service = services.find(item => item.service_id === rule.service_id);
                const country = countries.find(item => item.country_id === rule.country_id);
                const imageUrl = rule.service_image_url || service?.image_url || service?.image;
                const serviceLabel = rule.service_title || service?.title || service?.name || 'Unknown service';
                const countryFlagUrl = rule.country_flag_url || country?.flag_url || country?.flag || country?.flag_png_url || country?.flag_svg_url;
                return (
                <div key={rule.id} className="flex flex-col lg:flex-row lg:items-center gap-3 px-5 py-4 hover:bg-gray-50/50">
                  <div className="flex items-center gap-3 flex-1">
                    <ServiceIcon imageUrl={imageUrl} label={serviceLabel} />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-800" style={{ fontWeight: 600 }}>{serviceLabel}</span>
                      <span className="text-xs text-gray-400">{rule.service_code || '-'}</span>
                      <span className="text-gray-300">/</span>
                      <CountryFlag imageUrl={countryFlagUrl} label={rule.country_code || rule.country_title || 'Country'} />
                      <span className="text-sm text-gray-700">{rule.country_title || 'Unknown country'}</span>
                      <span className="text-xs text-gray-400">{rule.country_code || '-'}</span>
                    </div>
                  </div>

                  {editId === rule.id ? (
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" step="0.01" value={editPrice} onChange={event => setEditPrice(event.target.value)} className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-400" autoFocus />
                      <button onClick={() => saveOverride({ service_id: rule.service_id || '', country_id: rule.country_id || '', price: editPrice }, true)} disabled={saving} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditId(null)} className="p-1.5 hover:bg-gray-100 text-gray-400 rounded-lg transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full text-sm bg-emerald-100 text-emerald-700" style={{ fontWeight: 600 }}>{formatPrice(rule.price)}</span>
                      <button onClick={() => { setEditId(rule.id); setEditPrice(String(rule.price)); }} className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteOverride(rule.id)} disabled={saving} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors disabled:opacity-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
