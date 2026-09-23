import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Eye, Loader2, Search, ShoppingCart, Tag, Users, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { buyMarketplacePackage, getMarketplacePackages } from '../../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext';
import { useServiceAvailability } from '../../contexts/ServiceAvailabilityContext';
import { ServiceLockedOverlay } from '../../components/ServiceLockedOverlay';
import { formatCurrency } from '../../utils/currency';

type PreviewContact = { name: string; phone: string; location?: string };
type ContactPackage = {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  total_contacts: number;
  sample_contacts_preview: PreviewContact[];
  purchased: boolean;
  cover_image_url?: string;
};

export default function ContactMarketplacePage() {
  const { updateBalance } = useAuth();
  const { isEnabled } = useServiceAvailability();
  const [packages, setPackages] = useState<ContactPackage[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [previewPackage, setPreviewPackage] = useState<ContactPackage | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<ContactPackage | null>(null);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const response = await getMarketplacePackages({ search, category });
      setPackages(response.packages || []);
      setCategories(response.categories || []);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load contact marketplace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  const stats = useMemo(() => ({
    packages: packages.length,
    contacts: packages.reduce((sum, item) => sum + item.total_contacts, 0),
    purchased: packages.filter(item => item.purchased).length,
  }), [packages]);

  const handleSearch = () => {
    loadPackages();
  };

  const handleBuy = async () => {
    if (!pendingPurchase) return;
    try {
      const item = pendingPurchase;
      setBuyingId(item.id);
      const response = await buyMarketplacePackage(item.id);
      setPackages(prev => prev.map(pkg => pkg.id === item.id ? { ...pkg, purchased: true } : pkg));
      setPendingPurchase(null);
      if (typeof response.wallet_balance === 'number') updateBalance(response.wallet_balance);
      const summary = response.import_summary || {};
      toast.success(response.message || `Purchased ${item.title}.`, {
        description: `${summary.imported_contacts || 0} imported, ${summary.duplicate_skipped || 0} duplicates skipped.`,
      });
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to buy contact package.');
    } finally {
      setBuyingId(null);
    }
  };

  if (!isEnabled('buy_contacts')) return <ServiceLockedOverlay serviceKey="buy_contacts" />;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Contact Marketplace</h1>
          <p className="text-gray-500 text-sm mt-0.5">Buy curated contact groups and use them in SMS campaigns.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Available Packages" value={stats.packages.toLocaleString()} icon={ShoppingCart} color="text-blue-600" bg="bg-blue-100" />
        <Stat label="Contacts Listed" value={stats.contacts.toLocaleString()} icon={Users} color="text-emerald-600" bg="bg-emerald-100" />
        <Stat label="Purchased Groups" value={stats.purchased.toLocaleString()} icon={CheckCircle} color="text-purple-600" bg="bg-purple-100" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && handleSearch()}
              placeholder="Search packages by name, category, or description..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </div>
          <select value={category} onChange={event => setCategory(event.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 text-gray-600">
            <option value="">All Categories</option>
            {categories.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <button onClick={handleSearch} className="px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-sm" style={{ fontWeight: 600 }}>
            Search
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading packages...
        </div>
      ) : packages.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" /> No active contact packages found.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {packages.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              {item.cover_image_url && <img src={item.cover_image_url} alt={`${item.title} cover`} className="h-40 w-full bg-gray-100 object-cover" />}
              <div className="p-5 flex flex-1 flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-gray-800 truncate" style={{ fontWeight: 700 }}>{item.title}</h2>
                  <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700" style={{ fontWeight: 600 }}>
                    <Tag className="w-3 h-3" /> {item.category}
                  </span>
                </div>
                {item.purchased && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700" style={{ fontWeight: 700 }}>
                    <CheckCircle className="w-3 h-3" /> Purchased
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-500 leading-relaxed min-h-[42px]">{item.description || 'No description provided.'}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Contacts</div>
                  <div className="text-gray-800 mt-1" style={{ fontWeight: 700 }}>{item.total_contacts.toLocaleString()}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-xs text-gray-400">Price</div>
                  <div className="text-blue-700 mt-1" style={{ fontWeight: 800 }}>{formatCurrency(item.price)}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-gray-400" style={{ fontWeight: 600 }}>Preview</div>
                {(item.sample_contacts_preview || []).slice(0, 3).map((contact, index) => (
                  <div key={`${contact.phone}-${index}`} className="flex items-center justify-between text-sm bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-gray-600 truncate">{contact.name || 'Contact'}</span>
                    <span className="font-mono text-gray-500">{contact.phone}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-auto">
                <button onClick={() => setPreviewPackage(item)} className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-600 hover:border-gray-300 px-3 py-2.5 rounded-xl text-sm">
                  <Eye className="w-4 h-4" /> Preview
                </button>
                <button
                  onClick={() => setPendingPurchase(item)}
                  disabled={item.purchased || buyingId === item.id}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-500 text-white px-3 py-2.5 rounded-xl text-sm"
                  style={{ fontWeight: 600 }}
                >
                  {buyingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : item.purchased ? <CheckCircle className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                  {item.purchased ? 'Purchased' : 'Buy'}
                </button>
              </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => buyingId ? null : setPendingPurchase(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Confirm Purchase</h2>
                <p className="text-xs text-gray-400 mt-1">Review this contact package before buying.</p>
              </div>
              <button
                onClick={() => !buyingId && setPendingPurchase(null)}
                disabled={!!buyingId}
                className="p-2 hover:bg-gray-100 rounded-xl disabled:opacity-50"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {pendingPurchase.cover_image_url && <img src={pendingPurchase.cover_image_url} alt="" className="h-40 w-full rounded-xl bg-gray-100 object-cover" />}
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="text-sm text-gray-800" style={{ fontWeight: 700 }}>{pendingPurchase.title}</div>
                <div className="text-xs text-gray-500 mt-1">{pendingPurchase.description || 'No description provided.'}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-100 p-3">
                  <div className="text-xs text-gray-400">Contacts</div>
                  <div className="text-gray-800 mt-1" style={{ fontWeight: 700 }}>{pendingPurchase.total_contacts.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <div className="text-xs text-gray-400">Amount</div>
                  <div className="text-blue-700 mt-1" style={{ fontWeight: 800 }}>{formatCurrency(pendingPurchase.price)}</div>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                This will deduct {formatCurrency(pendingPurchase.price)} from your wallet and import the contacts into your Contacts page under {pendingPurchase.title}.
              </p>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button
                onClick={() => setPendingPurchase(null)}
                disabled={!!buyingId}
                className="flex-1 border border-gray-200 text-gray-600 hover:border-gray-300 disabled:opacity-50 py-2.5 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleBuy}
                disabled={!!buyingId}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm"
                style={{ fontWeight: 600 }}
              >
                {buyingId === pendingPurchase.id ? <><Loader2 className="w-4 h-4 animate-spin" /> Buying...</> : <><Wallet className="w-4 h-4" /> Confirm Buy</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPreviewPackage(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            {previewPackage.cover_image_url && <img src={previewPackage.cover_image_url} alt="" className="h-44 w-full rounded-t-2xl bg-gray-100 object-cover" />}
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>{previewPackage.title}</h2>
              <p className="text-xs text-gray-400 mt-1">Phone numbers are masked until purchase.</p>
            </div>
            <div className="p-5 space-y-3">
              {(previewPackage.sample_contacts_preview || []).map((contact, index) => (
                <div key={index} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
                  <div>
                    <div className="text-sm text-gray-700" style={{ fontWeight: 600 }}>{contact.name || 'Contact'}</div>
                    <div className="text-xs text-gray-400">{contact.location || 'Location unavailable'}</div>
                  </div>
                  <div className="font-mono text-sm text-gray-600">{contact.phone}</div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-gray-100">
              <button onClick={() => setPreviewPackage(null)} className="w-full border border-gray-200 text-gray-600 hover:border-gray-300 py-2.5 rounded-xl text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, color, bg }: { label: string; value: string; icon: any; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <div className={`text-xl ${color}`} style={{ fontWeight: 700 }}>{value}</div>
        <div className="text-gray-500 text-xs">{label}</div>
      </div>
    </div>
  );
}
