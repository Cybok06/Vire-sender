import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle, Info, Loader2, RefreshCw, Search, ShoppingCart, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { getOtpCountriesList, getOtpServicePrices, getOtpServices, purchaseOtp } from '../../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext';
import { useServiceAvailability } from '../../contexts/ServiceAvailabilityContext';
import { ServiceLockedOverlay } from '../../components/ServiceLockedOverlay';
import { formatCurrency } from '../../utils/currency';

const PLACEHOLDER_SERVICE_IMAGE = 'https://imagedelivery.net/cg2aWO7l_BnFQQ6dZHYOSA/services/Frame.png/thumb';
const SERVICE_LIMIT = 24;
const COUNTRY_BATCH_SIZE = 20;
const POPULAR_COUNTRY_CODES = [
  'US', 'GB', 'DE', 'FR', 'CA', 'AU', 'NL', 'ES', 'IT', 'SE',
  'GH', 'NG', 'ZA', 'KE', 'IN', 'BR', 'MX', 'TR', 'AE', 'PL',
];

type OtpService = {
  service_id: string;
  title: string;
  name: string;
  code: string;
  image_url: string;
  is_popular: boolean;
};

type OtpCountry = {
  country_id: string;
  title: string;
  code: string;
  flag_image?: string;
  flag_emoji?: string;
  flag?: string;
  flag_url?: string;
};

type CountryPrice = {
  final_price: number;
};

type PricedCountry = OtpCountry & {
  final_price?: number;
  has_price: boolean;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
};

export default function BuyNumberPage() {
  const { user, updateBalance } = useAuth();
  const navigate = useNavigate();
  const { isEnabled } = useServiceAvailability();

  if (!isEnabled('otp_virtual_numbers')) return <ServiceLockedOverlay serviceKey="otp_virtual_numbers" />;

  const [services, setServices] = useState<OtpService[]>([]);
  const [countries, setCountries] = useState<OtpCountry[]>([]);
  const [selectedService, setSelectedService] = useState<OtpService | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<PricedCountry | null>(null);

  const [serviceSearch, setServiceSearch] = useState('');
  const [appliedServiceSearch, setAppliedServiceSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [countrySort, setCountrySort] = useState('name_asc');
  const [pricesByCountry, setPricesByCountry] = useState<Record<string, CountryPrice>>({});
  const [loadedPriceCountryIds, setLoadedPriceCountryIds] = useState<Set<string>>(new Set());

  const [servicePagination, setServicePagination] = useState<Pagination | null>(null);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingMoreServices, setLoadingMoreServices] = useState(false);
  const [loadingCountryList, setLoadingCountryList] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [loadingMorePrices, setLoadingMorePrices] = useState(false);
  const [buying, setBuying] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const [countryError, setCountryError] = useState('');
  const [serverWalletBalance, setServerWalletBalance] = useState<number | null>(null);

  const walletBalance = Number(serverWalletBalance ?? user?.balance ?? user?.wallet_balance ?? 0);
  const finalPrice = selectedCountry?.final_price ? Number(selectedCountry.final_price || 0) : null;
  const canBuy = !!selectedService && !!selectedCountry && finalPrice !== null && walletBalance >= finalPrice;

  const selectedServiceLabel = selectedService?.title || selectedService?.name || selectedService?.code || '';
  const selectedCountryLabel = selectedCountry?.title || selectedCountry?.code || '';

  const loadServices = useCallback(async (page = 1, append = false) => {
    append ? setLoadingMoreServices(true) : setLoadingServices(true);
    setServiceError('');
    try {
      const response = await getOtpServices({
        q: appliedServiceSearch,
        page: String(page),
        limit: String(SERVICE_LIMIT),
      });
      const nextServices = response.data || [];
      setServices(prev => append ? [...prev, ...nextServices] : nextServices);
      setServicePagination(response.pagination || null);
    } catch (error: any) {
      setServiceError(error?.message || 'Could not load services.');
      if (!append) setServices([]);
    } finally {
      append ? setLoadingMoreServices(false) : setLoadingServices(false);
    }
  }, [appliedServiceSearch]);

  const loadCountryList = useCallback(async () => {
    setLoadingCountryList(true);
    setCountryError('');
    try {
      const response = await getOtpCountriesList();
      setCountries(response.data || []);
    } catch (error: any) {
      setCountryError(error?.message || 'Could not load countries.');
      setCountries([]);
    } finally {
      setLoadingCountryList(false);
    }
  }, []);

  const prioritizedCountries = useMemo(() => {
    return [...countries].sort((a, b) => {
      const aIndex = POPULAR_COUNTRY_CODES.indexOf((a.code || '').toUpperCase());
      const bIndex = POPULAR_COUNTRY_CODES.indexOf((b.code || '').toUpperCase());
      const aRank = aIndex >= 0 ? aIndex : POPULAR_COUNTRY_CODES.length + 1;
      const bRank = bIndex >= 0 ? bIndex : POPULAR_COUNTRY_CODES.length + 1;
      if (aRank !== bRank) return aRank - bRank;
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [countries]);

  const loadServicePrices = useCallback(async (serviceId: string, countryIds: string[], append = false) => {
    append ? setLoadingMorePrices(true) : setLoadingPrices(true);
    setCountryError('');
    try {
      const response = await getOtpServicePrices(serviceId, countryIds);
      setPricesByCountry(prev => append ? { ...prev, ...(response.data || {}) } : (response.data || {}));
      setLoadedPriceCountryIds(prev => {
        const next = append ? new Set(prev) : new Set<string>();
        countryIds.forEach(countryId => next.add(countryId));
        return next;
      });
    } catch (error: any) {
      setCountryError(error?.message || 'Could not load country prices for this service.');
      if (!append) setPricesByCountry({});
    } finally {
      append ? setLoadingMorePrices(false) : setLoadingPrices(false);
    }
  }, []);

  useEffect(() => {
    loadServices(1, false);
  }, [loadServices]);

  useEffect(() => {
    loadCountryList();
  }, [loadCountryList]);

  useEffect(() => {
    setSelectedCountry(null);
    setPricesByCountry({});
    setLoadedPriceCountryIds(new Set());
    if (selectedService?.service_id && prioritizedCountries.length) {
      loadServicePrices(
        selectedService.service_id,
        prioritizedCountries.slice(0, COUNTRY_BATCH_SIZE).map(country => country.country_id),
      );
    }
  }, [selectedService, loadServicePrices, prioritizedCountries]);

  useEffect(() => {
    const query = countrySearch.trim().toLowerCase();
    if (!selectedService?.service_id || !query || loadingPrices) return;

    const timer = window.setTimeout(() => {
      const searchCountryIds = prioritizedCountries
        .filter(country => {
          const text = `${country.title || ''} ${country.code || ''} ${country.country_id || ''}`.toLowerCase();
          return text.includes(query) && !loadedPriceCountryIds.has(country.country_id);
        })
        .slice(0, COUNTRY_BATCH_SIZE)
        .map(country => country.country_id);
      if (searchCountryIds.length) {
        loadServicePrices(selectedService.service_id, searchCountryIds, true);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [countrySearch, selectedService, prioritizedCountries, loadServicePrices]);

  const serviceSkeletons = useMemo(() => Array.from({ length: 9 }), []);
  const countrySkeletons = useMemo(() => Array.from({ length: 6 }), []);

  const displayedCountries = useMemo<PricedCountry[]>(() => {
    const query = countrySearch.trim().toLowerCase();
    const sourceCountries = selectedService ? prioritizedCountries : countries;
    const merged = sourceCountries.map(country => {
      const price = pricesByCountry[country.country_id];
      return {
        ...country,
        final_price: price?.final_price,
        has_price: !!price,
      };
    });

    const filtered = merged.filter(country => {
      const text = `${country.title || ''} ${country.code || ''} ${country.country_id || ''}`.toLowerCase();
      const matchesSearch = !query || text.includes(query);
      if (!matchesSearch) return false;
      if (selectedService && !loadingPrices) {
        return country.has_price || loadedPriceCountryIds.has(country.country_id);
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (!selectedService || countrySort === 'name_asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (countrySort === 'price_asc') {
        return Number(a.final_price || 0) - Number(b.final_price || 0);
      }
      if (countrySort === 'price_desc') {
        return Number(b.final_price || 0) - Number(a.final_price || 0);
      }
      return (a.title || '').localeCompare(b.title || '');
    });

    return filtered;
  }, [countries, countrySearch, countrySort, loadedPriceCountryIds, loadingPrices, pricesByCountry, prioritizedCountries, selectedService]);

  const hasMoreCountryPrices = useMemo(() => {
    return selectedService && prioritizedCountries.some(country => !loadedPriceCountryIds.has(country.country_id));
  }, [loadedPriceCountryIds, prioritizedCountries, selectedService]);

  const loadMoreCountryPrices = () => {
    if (!selectedService) return;
    const nextCountryIds = prioritizedCountries
      .filter(country => !loadedPriceCountryIds.has(country.country_id))
      .slice(0, COUNTRY_BATCH_SIZE)
      .map(country => country.country_id);
    if (nextCountryIds.length) {
      loadServicePrices(selectedService.service_id, nextCountryIds, true);
    }
  };

  const searchServices = (event: FormEvent) => {
    event.preventDefault();
    setAppliedServiceSearch(serviceSearch.trim());
    setSelectedService(null);
    setSelectedCountry(null);
  };

  const handleBuy = async () => {
    if (buying) return;
    if (!selectedService || !selectedCountry || finalPrice === null) return;
    if (walletBalance < finalPrice) {
      toast.error('Insufficient wallet balance. Please deposit funds.');
      return;
    }
    try {
      setBuying(true);
      const response = await purchaseOtp({
        service_id: selectedService.service_id,
        country_id: selectedCountry.country_id,
      });
      if (typeof response.wallet_balance === 'number') updateBalance(response.wallet_balance);
      toast.success(response.message || 'Number purchased successfully');
      navigate('/user/otp-receives');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to buy OTP number.');
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Buy OTP Number</h1>
          <p className="text-gray-500 text-sm mt-1">Select a service and country to preview the price.</p>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Step active={!!selectedService} label="Service" index={1} />
          <div className="flex-1 h-px bg-gray-200" />
          <Step active={!!selectedCountry} label="Country" index={2} />
          <div className="flex-1 h-px bg-gray-200" />
          <Step active={canBuy} label="Confirm" index={3} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-gray-800" style={{ fontWeight: 600 }}>1. Select Service</h2>
                  {selectedService && (
                    <p className="text-sm text-blue-600 mt-1" style={{ fontWeight: 500 }}>{selectedServiceLabel}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400">{servicePagination?.total || 0} services</span>
              </div>

              <form onSubmit={searchServices} className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search services..."
                    value={serviceSearch}
                    onChange={event => setServiceSearch(event.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                  />
                </div>
                <button type="submit" className="px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-sm" style={{ fontWeight: 600 }}>
                  Search
                </button>
              </form>

              {serviceError && <ErrorState message={serviceError} onRetry={() => loadServices(1, false)} />}

              {loadingServices ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {serviceSkeletons.map((_, index) => <SkeletonCard key={index} />)}
                </div>
              ) : services.length === 0 && !serviceError ? (
                <EmptyState message="No services found" />
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                    {services.map(service => (
                      <button
                        key={service.service_id}
                        onClick={() => setSelectedService(service)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all text-left min-h-[56px] ${
                          selectedService?.service_id === service.service_id
                            ? 'bg-blue-900 text-white shadow-md'
                            : 'border border-gray-100 hover:border-blue-200 hover:bg-blue-50 text-gray-700'
                        }`}
                      >
                        <img
                          src={service.image_url || PLACEHOLDER_SERVICE_IMAGE}
                          alt=""
                          className="w-8 h-8 rounded-lg object-cover bg-gray-100 flex-shrink-0"
                          onError={event => { event.currentTarget.src = PLACEHOLDER_SERVICE_IMAGE; }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate" style={{ fontWeight: 600 }}>{service.title || service.name}</span>
                          <span className={`block text-xs truncate ${selectedService?.service_id === service.service_id ? 'text-blue-100' : 'text-gray-400'}`}>
                            {service.code || service.service_id}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {servicePagination?.has_more && (
                    <button
                      onClick={() => loadServices((servicePagination.page || 1) + 1, true)}
                      disabled={loadingMoreServices}
                      className="mt-4 w-full py-2.5 border border-gray-200 hover:border-blue-300 rounded-xl text-sm text-gray-700 disabled:opacity-60 flex items-center justify-center gap-2"
                      style={{ fontWeight: 600 }}
                    >
                      {loadingMoreServices && <Loader2 className="w-4 h-4 animate-spin" />}
                      View More
                    </button>
                  )}
                </>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-gray-800" style={{ fontWeight: 600 }}>2. Select Country</h2>
                  {selectedCountry && (
                    <p className="text-sm text-blue-600 mt-1" style={{ fontWeight: 500 }}>{selectedCountryLabel}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {selectedService && !loadingPrices ? `${displayedCountries.filter(country => country.has_price).length} priced` : `${countries.length} countries`}
                </span>
              </div>

              <div className="grid sm:grid-cols-[1fr_190px] gap-2 mb-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search countries..."
                      value={countrySearch}
                      onChange={event => setCountrySearch(event.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    />
                  </div>
                </div>
                <select
                  value={countrySort}
                  onChange={event => setCountrySort(event.target.value)}
                  disabled={!selectedService}
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 disabled:bg-gray-50"
                >
                  <option value="name_asc">A-Z country name</option>
                  <option value="price_asc">Lowest price first</option>
                  <option value="price_desc">Highest price first</option>
                </select>
              </div>

              {countryError ? (
                <ErrorState
                  message={countryError}
                  onRetry={selectedService ? () => {
                    const retryIds = prioritizedCountries
                      .filter(country => !loadedPriceCountryIds.has(country.country_id))
                      .slice(0, COUNTRY_BATCH_SIZE)
                      .map(country => country.country_id);
                    loadServicePrices(selectedService.service_id, retryIds.length ? retryIds : prioritizedCountries.slice(0, COUNTRY_BATCH_SIZE).map(country => country.country_id), !!loadedPriceCountryIds.size);
                  } : loadCountryList}
                />
              ) : loadingCountryList ? (
                <div className="space-y-2">
                  {countrySkeletons.map((_, index) => <SkeletonRow key={index} />)}
                </div>
              ) : countries.length === 0 ? (
                <EmptyState message="No countries found" />
              ) : !selectedService ? (
                <>
                  <div className="mb-3 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-700">
                    Select a service to see country prices
                  </div>
                  <CountryRows
                    countries={displayedCountries}
                    loadingPrices={false}
                    selectedService={false}
                    selectedCountryId={selectedCountry?.country_id || ''}
                    onSelect={() => {}}
                  />
                </>
              ) : displayedCountries.length === 0 && !loadingPrices ? (
                <EmptyState message="No countries priced for this service" />
              ) : (
                <>
                  <CountryRows
                    countries={displayedCountries}
                    loadingPrices={loadingPrices}
                    selectedService
                    selectedCountryId={selectedCountry?.country_id || ''}
                    onSelect={country => country.has_price && setSelectedCountry(country)}
                  />
                  {hasMoreCountryPrices && (
                    <button
                      onClick={loadMoreCountryPrices}
                      disabled={loadingMorePrices || loadingPrices}
                      className="mt-4 w-full py-2.5 border border-gray-200 hover:border-blue-300 rounded-xl text-sm text-gray-700 disabled:opacity-60 flex items-center justify-center gap-2"
                      style={{ fontWeight: 600 }}
                    >
                      {loadingMorePrices && <Loader2 className="w-4 h-4 animate-spin" />}
                      View More Countries
                    </button>
                  )}
                </>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sticky top-4">
              <h2 className="text-gray-800 mb-4" style={{ fontWeight: 600 }}>Order Summary</h2>

              {!selectedService && !selectedCountry && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ShoppingCart className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-gray-400 text-sm">Select a service and country to see the price</p>
                </div>
              )}

              {(selectedService || selectedCountry) && (
                <div className="space-y-3">
                  <SummaryLine label="Service">
                    {selectedService ? (
                      <span className="flex items-center justify-end gap-2 min-w-0">
                        <img
                          src={selectedService.image_url || PLACEHOLDER_SERVICE_IMAGE}
                          alt=""
                          className="w-6 h-6 rounded-md object-cover bg-gray-100"
                          onError={event => { event.currentTarget.src = PLACEHOLDER_SERVICE_IMAGE; }}
                        />
                        <span className="truncate">{selectedServiceLabel}</span>
                      </span>
                    ) : '—'}
                  </SummaryLine>
                  <SummaryLine label="Country">{selectedCountry ? selectedCountryLabel : '—'}</SummaryLine>
                  <SummaryLine label="Wallet">{formatCurrency(walletBalance)}</SummaryLine>
                  {finalPrice !== null && (
                    <div className="flex items-center justify-between py-2 bg-blue-50 rounded-xl px-3">
                      <span className="text-blue-900" style={{ fontWeight: 600 }}>Final price</span>
                      <span className="text-blue-900 text-lg" style={{ fontWeight: 800 }}>{formatCurrency(finalPrice)}</span>
                    </div>
                  )}
                </div>
              )}

              {finalPrice !== null && walletBalance < finalPrice && (
                <p className="text-xs text-red-500 mt-3">
                  Need {formatCurrency(finalPrice - walletBalance)} more in your wallet.
                </p>
              )}

              <button
                onClick={handleBuy}
                disabled={!canBuy || buying}
                className="w-full mt-4 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
                style={{ fontWeight: 600 }}
              >
                {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {buying ? 'Buying number...' : finalPrice !== null ? `Buy Number - ${formatCurrency(finalPrice)}` : 'Buy Number'}
              </button>

              <div className="flex items-center gap-2 mt-3 p-3 bg-amber-50 rounded-xl">
                <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-700">OTP numbers are valid for 20 minutes. Unused numbers may be refunded.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function CountryRows({
  countries,
  loadingPrices,
  selectedService,
  selectedCountryId,
  onSelect,
}: {
  countries: PricedCountry[];
  loadingPrices: boolean;
  selectedService: boolean;
  selectedCountryId: string;
  onSelect: (country: PricedCountry) => void;
}) {
  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {countries.map(country => {
        const selected = selectedCountryId === country.country_id;
        return (
          <button
            key={country.country_id}
            onClick={() => onSelect(country)}
            disabled={selectedService && !loadingPrices && !country.has_price}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
              selected
                ? 'bg-blue-900 text-white shadow-md'
                : 'border border-gray-100 hover:border-blue-200 hover:bg-blue-50 disabled:hover:bg-white disabled:opacity-70'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <CountryFlag country={country} />
              <div className="text-left min-w-0">
                <div className="truncate" style={{ fontWeight: 600 }}>{country.title}</div>
                <div className={`text-xs mt-0.5 ${selected ? 'text-blue-100' : 'text-gray-400'}`}>
                  {country.code}
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0 min-w-[92px]">
              {!selectedService ? (
                <div className="text-xs text-gray-400">Select service</div>
              ) : loadingPrices ? (
                <div className="space-y-1.5">
                  <div className="h-3 w-16 bg-gray-100 rounded animate-pulse ml-auto" />
                  <div className="h-2 w-12 bg-gray-100 rounded animate-pulse ml-auto" />
                </div>
              ) : country.has_price ? (
                <>
                  <div className={selected ? 'text-white' : 'text-blue-700'} style={{ fontWeight: 800 }}>
                    {formatCurrency(country.final_price)}
                  </div>
                </>
              ) : (
                <div className="text-xs text-gray-400">No price</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CountryFlag({ country }: { country: PricedCountry }) {
  const [failed, setFailed] = useState(false);
  const code = (country.code || '').toLowerCase();
  const generatedFlag = code.length === 2 ? `https://flagcdn.com/w40/${code}.png` : '';
  const imageSrc = country.flag_image || generatedFlag;

  if (!failed && imageSrc) {
    return (
      <img
        src={imageSrc}
        alt=""
        loading="lazy"
        className="w-8 h-6 rounded object-cover bg-gray-100 flex-shrink-0"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="w-8 h-6 text-base flex-shrink-0 inline-flex items-center justify-center">
      {country.flag_emoji || country.code}
    </span>
  );
}

function Step({ active, label, index }: { active: boolean; label: string; index: number }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all ${
      active ? 'bg-blue-900 text-white' : 'bg-white border border-gray-200 text-gray-500'
    }`}>
      <span
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs"
        style={{ borderColor: active ? 'rgba(255,255,255,0.5)' : '#d1d5db', fontWeight: 600 }}
      >
        {index}
      </span>
      {label}
      {active && <CheckCircle className="w-3.5 h-3.5 ml-1" />}
    </div>
  );
}

function SummaryLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-50">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-800 min-w-0 text-right" style={{ fontWeight: 600 }}>{children}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center border border-dashed border-gray-200 rounded-xl">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-center justify-between gap-3">
      <p className="text-sm text-red-600">{message}</p>
      <button onClick={onRetry} className="text-sm text-red-700 flex items-center gap-1" style={{ fontWeight: 700 }}>
        <RefreshCw className="w-3.5 h-3.5" />
        Retry
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="min-h-[56px] rounded-xl border border-gray-100 p-3 flex items-center gap-3 animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-gray-100" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-gray-100 rounded" />
        <div className="h-2 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-xl border border-gray-100 p-4 flex items-center justify-between animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-7 h-5 rounded bg-gray-100" />
        <div className="space-y-2">
          <div className="h-3 bg-gray-100 rounded w-32" />
          <div className="h-2 bg-gray-100 rounded w-20" />
        </div>
      </div>
      <div className="h-4 bg-gray-100 rounded w-16" />
    </div>
  );
}
