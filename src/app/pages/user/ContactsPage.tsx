import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Upload, Trash2, Edit2, X,
  Tag, Users, Download, Filter, Loader2, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import {
  bulkDeleteContacts,
  bulkImportContacts,
  createContact,
  deleteContact,
  getContacts,
  updateContact,
} from '../../../lib/api.js';

interface Contact {
  id: string;
  name: string;
  sender_id: string;
  contact_name: string;
  phone: string;
  email: string;
  age?: string;
  group: string;
  source?: string;
  custom_fields?: CustomField[];
  addedAt: string;
}

type CustomField = { key: string; value: string };

const DEFAULT_GROUPS = ['All Contacts', 'Premium Users', 'Newsletter', 'Verified', 'Re-engagement'];

const groupColors: Record<string, string> = {
  'Premium Users': 'bg-blue-100 text-blue-700',
  Newsletter: 'bg-purple-100 text-purple-700',
  Verified: 'bg-emerald-100 text-emerald-700',
  'Re-engagement': 'bg-amber-100 text-amber-700',
  'All Contacts': 'bg-gray-100 text-gray-600',
};

const emptyForm = {
  contact_name: '',
  sender_id: '',
  phone: '',
  email: '',
  age: '',
  group: DEFAULT_GROUPS[0],
  new_group: '',
  custom_fields: [] as CustomField[],
};

const CUSTOM_FIELD_STORAGE_KEY = 'viresend_recent_contact_fields';

function csvEscape(value: string) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function parseCsv(text: string) {
  const rows = text.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  if (!rows.length) return [];

  const first = rows[0].toLowerCase();
  const hasHeader = first.includes('name') || first.includes('phone') || first.includes('email');
  const headers = hasHeader
    ? rows[0].split(',').map(item => item.trim().toLowerCase())
    : ['name', 'phone', 'email', 'group'];
  const rawHeaders = hasHeader
    ? rows[0].split(',').map(item => item.trim())
    : ['name', 'phone', 'email', 'group'];
  const body = hasHeader ? rows.slice(1) : rows;
  const knownHeaders = new Set(['name', 'contact_name', 'sender_id', 'phone', 'number', 'recipient', 'mobile', 'email', 'age', 'group']);

  return body.map(row => {
    const cells = row.split(',').map(item => item.trim().replace(/^"|"$/g, ''));
    const get = (key: string, fallbackIndex: number) => {
      const index = headers.indexOf(key);
      return cells[index >= 0 ? index : fallbackIndex] || '';
    };

    return {
      contact_name: get('contact_name', 0) || get('name', 0),
      sender_id: get('sender_id', 4),
      phone: get('phone', 1) || get('number', 1) || get('mobile', 1) || get('recipient', 1),
      email: get('email', 2),
      age: get('age', 5),
      group: get('group', 3) || 'All Contacts',
      custom_fields: rawHeaders
        .map((header, index) => ({ key: header, value: cells[index] || '' }))
        .filter(field => field.key && field.value && !knownHeaders.has(field.key.toLowerCase())),
    };
  }).filter(item => item.phone);
}

function readRecentCustomFields() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_FIELD_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}

export default function ContactsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [customFieldName, setCustomFieldName] = useState('');
  const [recentCustomFields, setRecentCustomFields] = useState<string[]>(readRecentCustomFields);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const groups = useMemo(() => {
    return Array.from(new Set([...DEFAULT_GROUPS, ...contacts.map(contact => contact.group).filter(Boolean)]));
  }, [contacts]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const response = await getContacts();
      setContacts(response.contacts || []);
      setSelected([]);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load contacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const filtered = contacts.filter(c => {
    const query = search.toLowerCase();
    const matchSearch = !query
      || (c.contact_name || '').toLowerCase().includes(query)
      || (c.sender_id || c.name || '').toLowerCase().includes(query)
      || c.phone.includes(search)
      || (c.email || '').toLowerCase().includes(query)
      || (c.age || '').includes(search)
      || (c.custom_fields || []).some(field => field.key.toLowerCase().includes(query) || field.value.toLowerCase().includes(query));
    const matchGroup = groupFilter === 'all' || c.group === groupFilter;
    return matchSearch && matchGroup;
  });

  const groupStats = groups.slice(1).map(g => ({
    name: g,
    count: contacts.filter(c => c.group === g).length,
  }));

  const resetForm = () => {
    setForm(emptyForm);
    setEditingContact(null);
    setShowNewGroup(false);
    setCustomFieldName('');
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setForm({
      contact_name: contact.contact_name || contact.name,
      sender_id: contact.sender_id || contact.name || '',
      phone: contact.phone,
      email: contact.email || '',
      age: contact.age || '',
      group: contact.group || DEFAULT_GROUPS[0],
      new_group: '',
      custom_fields: contact.custom_fields || [],
    });
    setShowNewGroup(false);
    setShowAddModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowAddModal(false);
    resetForm();
  };

  const handleSave = async () => {
    const selectedGroup = showNewGroup && form.new_group.trim() ? form.new_group.trim() : form.group;
    if (!form.phone.trim()) {
      toast.error('Phone number is required.');
      return;
    }

    try {
      setSaving(true);
      const payload = { ...form, group: selectedGroup };
      const fieldNames = form.custom_fields.map(field => field.key.trim()).filter(Boolean);
      if (fieldNames.length) {
        const nextRecent = Array.from(new Set([...fieldNames, ...recentCustomFields])).slice(0, 20);
        setRecentCustomFields(nextRecent);
        localStorage.setItem(CUSTOM_FIELD_STORAGE_KEY, JSON.stringify(nextRecent));
      }
      if (editingContact) {
        const response = await updateContact(editingContact.id, payload);
        setContacts(prev => prev.map(contact => contact.id === editingContact.id ? response.contact : contact));
        toast.success(response.message || 'Contact updated successfully.');
      } else {
        const response = await createContact(payload);
        setContacts(prev => [response.contact, ...prev]);
        toast.success(response.message || 'Contact added successfully.');
      }
      closeModal();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to save contact.');
    } finally {
      setSaving(false);
    }
  };

  const addCustomField = (key = customFieldName) => {
    const cleanKey = key.trim();
    if (!cleanKey) {
      toast.error('Enter a field name first.');
      return;
    }
    const exists = form.custom_fields.some(field => field.key.toLowerCase() === cleanKey.toLowerCase());
    if (exists) {
      toast.error(`${cleanKey} is already added.`);
      return;
    }
    setForm(prev => ({ ...prev, custom_fields: [...prev.custom_fields, { key: cleanKey, value: '' }] }));
    setCustomFieldName('');
  };

  const updateCustomField = (index: number, value: string) => {
    setForm(prev => ({
      ...prev,
      custom_fields: prev.custom_fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, value } : field),
    }));
  };

  const removeCustomField = (index: number) => {
    setForm(prev => ({
      ...prev,
      custom_fields: prev.custom_fields.filter((_, fieldIndex) => fieldIndex !== index),
    }));
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await deleteContact(id);
      setContacts(prev => prev.filter(c => c.id !== id));
      setSelected(prev => prev.filter(s => s !== id));
      toast.success(response.message || 'Contact removed.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to delete contact.');
    }
  };

  const handleBulkDelete = async () => {
    try {
      const response = await bulkDeleteContacts(selected);
      setContacts(prev => prev.filter(c => !selected.includes(c.id)));
      setSelected([]);
      toast.success(response.message || 'Selected contacts removed.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to delete selected contacts.');
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setImporting(true);
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed.length) {
        toast.error('No valid contacts found in the CSV.');
        return;
      }
      const response = await bulkImportContacts(parsed);
      toast.success(response.message || 'Contacts imported.');
      await loadContacts();
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to import contacts.');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    const customKeys = Array.from(new Set(filtered.flatMap(contact => (contact.custom_fields || []).map(field => field.key))));
    const rows = [
      ['Contact Name', 'Sender ID', 'Phone', 'Email', 'Age', 'Group', ...customKeys, 'Added'],
      ...filtered.map(contact => {
        const customMap = new Map((contact.custom_fields || []).map(field => [field.key, field.value]));
        return [
        contact.contact_name || 'Unnamed contact',
          contact.sender_id || contact.name || '',
          contact.phone,
          contact.email || '',
          contact.age || '',
          contact.group,
          ...customKeys.map(key => customMap.get(key) || ''),
          contact.addedAt || '',
        ];
      }),
    ];
    const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'viresend-contacts.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Contacts exported.');
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    setSelected(selected.length === filtered.length ? [] : filtered.map(c => c.id));
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Contacts</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage your contact groups and phone numbers.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="hidden sm:flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-60"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import CSV
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl text-sm transition-colors"
            style={{ fontWeight: 500 }}
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="text-lg text-blue-600" style={{ fontWeight: 700 }}>{contacts.length.toLocaleString()}</div>
          <div className="text-gray-500 text-xs mt-0.5">Total Contacts</div>
        </div>
        {groupStats.slice(0, 3).map(g => (
          <div key={g.name} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="text-lg text-gray-800" style={{ fontWeight: 700 }}>{g.count}</div>
            <div className="text-gray-500 text-xs mt-0.5">{g.name}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by company name, sender ID, phone, or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </div>
          <button
            onClick={loadContacts}
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowFilters(p => !p)}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 border rounded-xl text-sm transition-colors ${
              showFilters ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <Filter className="w-4 h-4" />
            Groups
          </button>
        </div>
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
            {['all', ...groups.slice(1)].map(g => (
              <button
                key={g}
                onClick={() => setGroupFilter(g)}
                className={`px-3 py-1.5 rounded-full text-xs capitalize transition-colors ${
                  groupFilter === g
                    ? 'bg-blue-900 text-white'
                    : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm text-blue-700" style={{ fontWeight: 500 }}>
            {selected.length} contacts selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-sm text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 text-sm text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="w-10 px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={selected.length === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-blue-600"
                  />
                </th>
                {['Contact Name', 'Sender ID', 'Phone', 'Email', 'Age', 'Details', 'Group', 'Added', ''].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading contacts...</span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No contacts found.
                  </td>
                </tr>
              ) : (
                filtered.map(contact => (
                  <tr key={contact.id} className={`hover:bg-gray-50/50 transition-colors ${selected.includes(contact.id) ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selected.includes(contact.id)}
                        onChange={() => toggleSelect(contact.id)}
                        className="rounded border-gray-300 text-blue-600"
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-700 text-xs" style={{ fontWeight: 600 }}>
                            {(contact.contact_name || 'UC').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{contact.contact_name || 'Unnamed contact'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-600">{contact.sender_id || contact.name || '-'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-sm text-gray-600">{contact.phone}</span>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-sm text-gray-500">{contact.email || '-'}</span>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-sm text-gray-500">{contact.age || '-'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {(contact.custom_fields || []).length ? (
                        <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                          {(contact.custom_fields || []).slice(0, 3).map(field => (
                            <span key={field.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]" style={{ fontWeight: 600 }}>
                              {field.key}: <span className="font-normal">{field.value}</span>
                            </span>
                          ))}
                          {(contact.custom_fields || []).length > 3 && (
                            <span className="text-[10px] text-gray-400">+{(contact.custom_fields || []).length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${groupColors[contact.group] || 'bg-gray-100 text-gray-600'}`} style={{ fontWeight: 500 }}>
                        <Tag className="w-3 h-3" />
                        {contact.group}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-xs text-gray-400">{contact.addedAt ? new Date(contact.addedAt).toLocaleDateString() : '-'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditModal(contact)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                          <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                        <button
                          onClick={() => handleDelete(contact.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-sm text-gray-500">Showing {filtered.length} of {contacts.length} contacts</span>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>{editingContact ? 'Edit Contact' : 'Add Contact'}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Contact Name <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. Ama Mensah"
                  value={form.contact_name}
                  onChange={e => setForm(prev => ({ ...prev, contact_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Sender ID <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. MyBrand"
                  value={form.sender_id}
                  onChange={e => setForm(prev => ({ ...prev, sender_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Phone Number *</label>
                <input
                  type="tel"
                  placeholder="+233501234567"
                  value={form.phone}
                  onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Email <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="email"
                  placeholder="john@example.com"
                  value={form.email}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Age <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="number"
                  min="0"
                  max="130"
                  placeholder="e.g. 34"
                  value={form.age}
                  onChange={e => setForm(prev => ({ ...prev, age: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </div>
              <div className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <label className="block text-sm text-gray-700" style={{ fontWeight: 600 }}>More Details</label>
                    <p className="text-xs text-gray-400 mt-0.5">Add custom fields like location, occupation, or region.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      list="recent-contact-fields"
                      type="text"
                      placeholder="Field name, e.g. Location"
                      value={customFieldName}
                      onChange={e => setCustomFieldName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomField();
                        }
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    />
                    <datalist id="recent-contact-fields">
                      {recentCustomFields.map(field => <option key={field} value={field} />)}
                    </datalist>
                  </div>
                  <button
                    type="button"
                    onClick={() => addCustomField()}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-sm hover:bg-blue-100"
                    style={{ fontWeight: 700 }}
                  >
                    <Plus className="w-4 h-4" /> Add More
                  </button>
                </div>
                {recentCustomFields.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {recentCustomFields.slice(0, 6).map(field => (
                      <button
                        key={field}
                        type="button"
                        onClick={() => addCustomField(field)}
                        className="px-2.5 py-1 rounded-full border border-gray-200 text-[10px] text-gray-600 hover:border-blue-300 hover:text-blue-700"
                      >
                        {field}
                      </button>
                    ))}
                  </div>
                )}
                {form.custom_fields.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {form.custom_fields.map((field, index) => (
                      <div key={`${field.key}-${index}`} className="flex items-center gap-2">
                        <div className="w-28 flex-shrink-0 text-xs text-gray-500 truncate" style={{ fontWeight: 700 }}>{field.key}</div>
                        <input
                          type="text"
                          value={field.value}
                          onChange={e => updateCustomField(index, e.target.value)}
                          placeholder={`Enter ${field.key.toLowerCase()}`}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                        />
                        <button
                          type="button"
                          onClick={() => removeCustomField(index)}
                          className="p-2 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Group</label>
                <div className="flex flex-wrap gap-2">
                  {groups.slice(1).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        setShowNewGroup(false);
                        setForm(prev => ({ ...prev, group: g, new_group: '' }));
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                        form.group === g
                          ? 'bg-blue-900 text-white'
                          : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewGroup(false);
                      setForm(prev => ({ ...prev, group: 'All Contacts', new_group: '' }));
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                      form.group === 'All Contacts'
                        ? 'bg-blue-900 text-white'
                        : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    All Contacts
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewGroup(prev => !prev)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                      showNewGroup
                        ? 'bg-emerald-600 text-white'
                        : 'border border-emerald-200 text-emerald-700 hover:border-emerald-300'
                    }`}
                  >
                    + New Group
                  </button>
                </div>
                {showNewGroup && (
                  <input
                    type="text"
                    placeholder="Enter new group name"
                    value={form.new_group}
                    onChange={e => setForm(prev => ({ ...prev, new_group: e.target.value }))}
                    className="mt-3 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50"
                  />
                )}
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button
                onClick={closeModal}
                className="flex-1 border border-gray-200 text-gray-600 hover:border-gray-300 py-2.5 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm"
                style={{ fontWeight: 600 }}
              >
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : editingContact ? 'Save Changes' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
