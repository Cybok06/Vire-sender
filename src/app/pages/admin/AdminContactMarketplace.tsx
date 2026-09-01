import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle, DollarSign, Edit2, FileSpreadsheet, ImagePlus, Loader2, PackagePlus, Plus, RefreshCw, ShoppingCart, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  createAdminContactPackage,
  deleteAdminContactPackage,
  getAdminContactMarketplacePurchases,
  getAdminContactMarketplaceStats,
  getAdminContactPackageContacts,
  getAdminContactPackageUploadStatus,
  getAdminContactPackages,
  updateAdminContactPackage,
  uploadAdminContactPackageContacts,
  uploadAdminContactPackageCoverImage,
  uploadAdminContactPackageManual,
} from '../../../lib/api.js';
import { formatCurrency } from '../../utils/currency';

type PackageStatus = 'active' | 'inactive';
type ContactPackage = {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  total_contacts: number;
  status: PackageStatus;
  created_at?: string;
  cover_image_url?: string;
};
type Purchase = {
  id: string;
  user_name: string;
  user_email?: string;
  package_title: string;
  total_contacts: number;
  price: number;
  created_at?: string;
  status: string;
};

const emptyForm = {
  title: '',
  description: '',
  category: '',
  price: '',
  status: 'active' as PackageStatus,
};

function looksLikePhone(value: string) {
  return /^(?:\+?233|0)\d{8,12}$/.test(value.replace(/[^\d+]/g, ''));
}

function compactCount(value: number) {
  if (value < 1000) return value.toLocaleString();
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function parseManualContactLine(line: string) {
  const cleanLine = line.trim();
  if (!cleanLine) return null;

  if (cleanLine.includes(',')) {
    const [first = '', second = '', email = '', location = '', notes = ''] = cleanLine.split(',').map(cell => cell.trim());
    const firstIsPhone = looksLikePhone(first);
    return {
      name: firstIsPhone ? second : first,
      phone: firstIsPhone ? first : second,
      email,
      location,
      notes,
    };
  }

  const parts = cleanLine.split(/\s+/);
  const phoneIndex = parts.findIndex(looksLikePhone);
  if (phoneIndex < 0) return null;

  const phone = parts[phoneIndex];
  const name = [...parts.slice(0, phoneIndex), ...parts.slice(phoneIndex + 1)].join(' ').trim();
  return { name, phone, email: '', location: '', notes: '' };
}

export default function AdminContactMarketplace() {
  const [packages, setPackages] = useState<ContactPackage[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ContactPackage | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [bulkAddPackage, setBulkAddPackage] = useState<ContactPackage | null>(null);
  const [manualContacts, setManualContacts] = useState('');
  const [contactFile, setContactFile] = useState<File | null>(null);
  const [addingContacts, setAddingContacts] = useState(false);
  const [contactsModal, setContactsModal] = useState<{ title: string; contacts: any[] } | null>(null);
  const [deletePackage, setDeletePackage] = useState<ContactPackage | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState({ status: 'idle', processed: 0, total: 0, imported: 0 });
  const [uploadLimit, setUploadLimit] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [packageResponse, statsResponse, purchaseResponse] = await Promise.all([
        getAdminContactPackages(),
        getAdminContactMarketplaceStats(),
        getAdminContactMarketplacePurchases(),
      ]);
      setPackages(packageResponse.packages || []);
      setStats(statsResponse.stats || {});
      setPurchases(purchaseResponse.purchases || []);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load contact marketplace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totals = useMemo(() => ({
    packages: stats.total_packages ?? packages.length,
    active: stats.active_packages ?? packages.filter(item => item.status === 'active').length,
    contacts: stats.total_contacts_uploaded ?? packages.reduce((sum, item) => sum + item.total_contacts, 0),
    revenue: stats.total_revenue ?? purchases.filter(item => item.status === 'completed').reduce((sum, item) => sum + item.price, 0),
    purchases: stats.total_purchases ?? purchases.length,
  }), [packages, purchases, stats]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setCoverImageFile(null);
    setCoverImagePreview('');
    setShowModal(true);
  };

  const openEdit = (item: ContactPackage) => {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description || '',
      category: item.category || '',
      price: String(item.price || 0),
      status: item.status || 'inactive',
    });
    setCoverImageFile(null);
    setCoverImagePreview(item.cover_image_url || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.category.trim()) {
      toast.error('Package name and category are required.');
      return;
    }
    try {
      setSaving(true);
      const payload = { ...form, price: Number(form.price || 0) };
      const response = editing
        ? await updateAdminContactPackage(editing.id, payload)
        : await createAdminContactPackage(payload);
      const savedPackage = response.package;
      if (coverImageFile && savedPackage?.id) {
        await uploadAdminContactPackageCoverImage(savedPackage.id, coverImageFile);
      }
      toast.success(coverImageFile ? 'Package and cover image saved.' : response.message || 'Package saved.');
      setShowModal(false);
      await loadData();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to save package.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (item: ContactPackage) => {
    try {
      const response = await deleteAdminContactPackage(item.id, 'deactivate');
      toast.success(response.message || 'Package deactivated.');
      await loadData();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to deactivate package.');
    }
  };

  const openDeleteConfirmation = (item: ContactPackage) => {
    setDeletePackage(item);
    setDeleteConfirmation('');
  };

  const handleDelete = async () => {
    if (!deletePackage) return;
    const expected = `Delete ${deletePackage.title}`;
    if (deleteConfirmation !== expected) {
      toast.error(`Type “${expected}” exactly to continue.`);
      return;
    }
    try {
      setDeleting(true);
      const response = await deleteAdminContactPackage(deletePackage.id, 'delete', deleteConfirmation);
      toast.success(response.message || 'Contact package deleted.');
      setDeletePackage(null);
      setDeleteConfirmation('');
      await loadData();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to delete package.');
    } finally {
      setDeleting(false);
    }
  };

  const openBulkAdd = (item: ContactPackage) => {
    setBulkAddPackage(item);
    setManualContacts('');
    setContactFile(null);
    setUploadProgress({ status: 'idle', processed: 0, total: 0, imported: 0 });
    setUploadLimit('');
  };

  const uploadManual = async () => {
    if (!bulkAddPackage) return;
    const rows = manualContacts.split(/\r?\n/).map(parseManualContactLine).filter(Boolean);
    if (!rows.length) {
      toast.error('Add at least one valid phone number.');
      return;
    }
    try {
      setAddingContacts(true);
      const response = await uploadAdminContactPackageManual(bulkAddPackage.id, rows);
      const summary = response.summary || {};
      toast.success(response.message || 'Contacts added.', {
        description: `${summary.imported_contacts || 0} added, ${summary.duplicate_skipped || 0} duplicates skipped.`,
      });
      setManualContacts('');
      setBulkAddPackage(null);
      await loadData();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to add contacts.');
    } finally {
      setAddingContacts(false);
    }
  };

  const uploadFile = async () => {
    if (!bulkAddPackage || !contactFile) return;
    const numericLimit = uploadLimit ? Number(uploadLimit) : 0;
    if (uploadLimit && (!Number.isInteger(numericLimit) || numericLimit < 1 || numericLimit > 10000)) {
      toast.error('Maximum contacts must be a whole number between 1 and 10,000.');
      return;
    }
    const jobId = crypto.randomUUID();
    let polling = true;
    let timer: number | undefined;
    const pollProgress = async () => {
      if (!polling) return;
      try {
        const progress = await getAdminContactPackageUploadStatus(jobId);
        setUploadProgress({ status: progress.status || 'processing', processed: progress.processed || 0, total: progress.total || 0, imported: progress.imported || 0 });
      } catch {
        // The upload response remains authoritative if a progress poll is interrupted.
      }
    };
    try {
      setAddingContacts(true);
      setUploadProgress({ status: 'uploading', processed: 0, total: 0, imported: 0 });
      timer = window.setInterval(pollProgress, 350);
      const response = await uploadAdminContactPackageContacts(bulkAddPackage.id, contactFile, jobId, uploadLimit);
      polling = false;
      window.clearInterval(timer);
      const summary = response.summary || {};
      setUploadProgress({ status: 'completed', processed: summary.imported_contacts || 0, total: summary.imported_contacts || 0, imported: summary.imported_contacts || 0 });
      toast.success(response.message || 'Contacts uploaded.', {
        description: `${summary.imported_contacts || 0} added, ${summary.duplicate_skipped || 0} duplicates skipped, ${summary.failed_contacts || 0} failed.`,
      });
      setContactFile(null);
      setBulkAddPackage(null);
      await loadData();
    } catch (error: any) {
      polling = false;
      toast.error(error?.data?.message || error?.message || 'Unable to upload contacts.');
    } finally {
      polling = false;
      if (timer) window.clearInterval(timer);
      setAddingContacts(false);
    }
  };

  const viewContacts = async (item: ContactPackage) => {
    try {
      const response = await getAdminContactPackageContacts(item.id);
      setContactsModal({ title: item.title, contacts: response.contacts || [] });
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load package contacts.');
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Contact Marketplace</h1>
          <p className="text-gray-500 text-sm mt-0.5">Create and sell contact groups to SMS users.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="hidden sm:flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl text-sm" style={{ fontWeight: 600 }}>
            <PackagePlus className="w-4 h-4" /> New Package
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Packages" value={totals.packages} icon={PackagePlus} color="text-blue-600" bg="bg-blue-100" />
        <Stat label="Active" value={totals.active} icon={CheckCircle} color="text-emerald-600" bg="bg-emerald-100" />
        <Stat label="Contacts" value={totals.contacts} icon={Users} color="text-purple-600" bg="bg-purple-100" />
        <Stat label="Purchases" value={totals.purchases} icon={ShoppingCart} color="text-amber-600" bg="bg-amber-100" />
        <Stat label="Revenue" value={formatCurrency(totals.revenue)} icon={DollarSign} color="text-emerald-600" bg="bg-emerald-100" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Packages</h2>
          <span className="text-xs text-gray-400">Use the plus button to bulk add contacts to a package.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Package', 'Category', 'Contacts', 'Price', 'Status', 'Created', 'Actions'].map(head => (
                  <th key={head} className="text-left text-xs text-gray-500 px-5 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading packages...</td></tr>
              ) : packages.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">No contact packages yet.</td></tr>
              ) : packages.map(item => (
                <tr key={item.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {item.cover_image_url ? <img src={item.cover_image_url} alt="" className="h-10 w-14 shrink-0 rounded-lg bg-gray-100 object-cover" /> : <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100"><ImagePlus className="h-4 w-4 text-gray-400" /></div>}
                      <div className="min-w-0"><div className="text-sm text-gray-800" style={{ fontWeight: 700 }}>{item.title}</div><div className="text-xs text-gray-400 max-w-[280px] truncate">{item.description || '-'}</div></div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{item.category}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-700" style={{ fontWeight: 600 }}>{item.total_contacts.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-800" style={{ fontWeight: 700 }}>{formatCurrency(item.price)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs ${item.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`} style={{ fontWeight: 600 }}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-400">{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openBulkAdd(item)} className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-lg" title="Bulk add contacts"><Plus className="w-3.5 h-3.5" /></button>
                      <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => viewContacts(item)} className="p-1.5 hover:bg-purple-50 text-purple-500 rounded-lg"><Users className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDeactivate(item)} className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg" title="Deactivate package"><Archive className="w-3.5 h-3.5" /></button>
                      <button onClick={() => openDeleteConfirmation(item)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg" title="Delete package permanently"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Recent Purchases</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['User', 'Package', 'Contacts', 'Amount', 'Date', 'Status'].map(head => (
                    <th key={head} className="text-left text-xs text-gray-500 px-5 py-3 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {purchases.slice(0, 12).map(item => (
                  <tr key={item.id}>
                    <td className="px-5 py-3.5">
                      <div className="text-sm text-gray-700">{item.user_name || 'User'}</div>
                      <div className="text-xs text-gray-400">{item.user_email || '-'}</div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700">{item.package_title}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{item.total_contacts.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-800" style={{ fontWeight: 700 }}>{formatCurrency(item.price)}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">{item.created_at ? new Date(item.created_at).toLocaleString() : '-'}</td>
                    <td className="px-5 py-3.5"><span className="px-2.5 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700" style={{ fontWeight: 600 }}>{item.status}</span></td>
                  </tr>
                ))}
                {!purchases.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">No purchases yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>{editing ? 'Edit Package' : 'Create Package'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Package Name" value={form.title} onChange={value => setForm(prev => ({ ...prev, title: value }))} placeholder="Market Women" />
              <Field label="Category" value={form.category} onChange={value => setForm(prev => ({ ...prev, category: value }))} placeholder="Business / Marketing" />
              <Field label="Price (GHS)" value={form.price} onChange={value => setForm(prev => ({ ...prev, price: value }))} placeholder="50.00" type="number" />
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Cover Image</label>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 p-3 hover:border-blue-400 hover:bg-blue-50/40">
                  {coverImagePreview ? <img src={coverImagePreview} alt="Cover preview" className="h-16 w-24 shrink-0 rounded-lg bg-gray-100 object-cover" /> : <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-gray-100"><ImagePlus className="h-5 w-5 text-gray-400" /></div>}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-700">{coverImageFile?.name || (coverImagePreview ? 'Change cover image' : 'Choose cover image')}</span><span className="block text-xs text-gray-400">JPG, PNG, WebP or GIF · maximum 5 MB</span></span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={event => { const file = event.target.files?.[0] || null; setCoverImageFile(file); if (file) setCoverImagePreview(URL.createObjectURL(file)); }} />
                </label>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Description</label>
                <textarea value={form.description} onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none" />
              </div>
              <select value={form.status} onChange={event => setForm(prev => ({ ...prev, status: event.target.value as PackageStatus }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 text-gray-600">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 hover:border-gray-300 py-2.5 rounded-xl text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm" style={{ fontWeight: 600 }}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Package'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletePackage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Delete Contact Package</h2>
                <p className="text-xs text-red-500 mt-1">This permanently deletes the package and all its uploaded contacts.</p>
              </div>
              <button disabled={deleting} onClick={() => setDeletePackage(null)} className="p-2 hover:bg-gray-100 rounded-xl disabled:opacity-50"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">To confirm, type <span className="font-semibold text-gray-900">Delete {deletePackage.title}</span></p>
              <input
                value={deleteConfirmation}
                onChange={event => setDeleteConfirmation(event.target.value)}
                placeholder={`Delete ${deletePackage.title}`}
                autoComplete="off"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50"
              />
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button disabled={deleting} onClick={() => setDeletePackage(null)} className="flex-1 border border-gray-200 text-gray-600 hover:border-gray-300 disabled:opacity-50 py-2.5 rounded-xl text-sm">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirmation !== `Delete ${deletePackage.title}`}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm"
                style={{ fontWeight: 600 }}
              >
                {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" /> Delete Package</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkAddPackage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Bulk Add Contacts</h2>
                <p className="text-xs text-gray-400 mt-1">Adding contacts to {bulkAddPackage.title}</p>
              </div>
              <button
                onClick={() => !addingContacts && setBulkAddPackage(null)}
                className="p-2 hover:bg-gray-100 rounded-xl"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500">
                Enter one contact per line. A name is optional; only a valid Ghana phone number is required.
              </p>
              <textarea
                rows={9}
                value={manualContacts}
                onChange={event => setManualContacts(event.target.value)}
                placeholder={'0241234567\nAma Store, 0559876525\nKojo Market 233241234567'}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none"
              />
              <div className="flex items-center gap-3 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-100" />OR<span className="h-px flex-1 bg-gray-100" /></div>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 p-4 hover:border-blue-400 hover:bg-blue-50/40">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-700">{contactFile?.name || 'Upload CSV or Excel file'}</span>
                  <span className="block text-xs text-gray-400">Use a column headed “Phone number”. Names are optional.</span>
                </span>
                <input type="file" accept=".csv,.xlsx" className="hidden" onChange={event => setContactFile(event.target.files?.[0] || null)} />
              </label>
              {contactFile && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Maximum contacts to upload <span className="font-normal text-gray-400">(optional)</span></label>
                  <input type="number" min="1" max="10000" step="1" value={uploadLimit} onChange={event => setUploadLimit(event.target.value)} disabled={addingContacts} placeholder="All contacts, e.g. 2000" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 disabled:bg-gray-50" />
                  <p className="mt-1 text-xs text-gray-400">Leave empty to upload every row, up to 10,000 contacts.</p>
                </div>
              )}
              {addingContacts && contactFile && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-blue-800">
                    <span className="font-semibold">{uploadProgress.total ? `${compactCount(uploadProgress.imported)} uploaded` : 'Preparing contacts...'}</span>
                    {uploadProgress.total > 0 && <span>{compactCount(uploadProgress.processed)} / {compactCount(uploadProgress.total)}</span>}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                    <div className={`h-full rounded-full bg-blue-600 transition-all duration-300 ${uploadProgress.total ? '' : 'w-1/3 animate-pulse'}`} style={uploadProgress.total ? { width: `${Math.min(100, Math.round((uploadProgress.processed / uploadProgress.total) * 100))}%` } : undefined} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button
                onClick={() => setBulkAddPackage(null)}
                disabled={addingContacts}
                className="flex-1 border border-gray-200 text-gray-600 hover:border-gray-300 disabled:opacity-50 py-2.5 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={contactFile ? uploadFile : uploadManual}
                disabled={addingContacts || (!contactFile && !manualContacts.trim())}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm"
                style={{ fontWeight: 600 }}
              >
                {addingContacts ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</> : contactFile ? 'Upload Contacts' : 'Add Contacts'}
              </button>
            </div>
          </div>
        </div>
      )}

      {contactsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setContactsModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>{contactsModal.title} Contacts</h2>
              <button onClick={() => setContactsModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="overflow-auto max-h-[64vh]">
              <table className="w-full">
                <thead><tr className="bg-gray-50">{['Name', 'Phone', 'Email', 'Location'].map(head => <th key={head} className="text-left text-xs text-gray-500 px-5 py-3">{head}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {contactsModal.contacts.map(contact => (
                    <tr key={contact.id}>
                      <td className="px-5 py-3 text-sm text-gray-700">{contact.name}</td>
                      <td className="px-5 py-3 text-sm font-mono text-gray-600">{contact.phone}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{contact.email || '-'}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{contact.location || '-'}</td>
                    </tr>
                  ))}
                  {!contactsModal.contacts.length && <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400">No contacts added.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, color, bg }: { label: string; value: number | string; icon: any; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <div className={`text-lg ${color} truncate`} style={{ fontWeight: 700 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
        <div className="text-gray-500 text-xs">{label}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>{label}</label>
      <input type={type} step={type === 'number' ? '0.01' : undefined} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50" />
    </div>
  );
}
