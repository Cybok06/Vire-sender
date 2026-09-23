import { useEffect, useMemo, useState } from 'react';
import { Search, Download, Trash2, Eye, Users, BookOpen, Upload, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { deleteAdminContact, getAdminContacts } from '../../../lib/api.js';

type AdminContact = {
  id: string;
  user: string;
  user_email?: string;
  name: string;
  phone: string;
  email: string;
  group: string;
  added: string;
  created_at?: string;
};

export default function AdminContacts() {
  const [contacts, setContacts] = useState<AdminContact[]>([]);
  const [stats, setStats] = useState({ total: 0, groups: 0, users: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [previewContact, setPreviewContact] = useState<AdminContact | null>(null);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const response = await getAdminContacts();
      setContacts(response.contacts || []);
      setStats(response.stats || { total: 0, groups: 0, users: 0 });
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load contacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const users = useMemo(() => ['all', ...Array.from(new Set(contacts.map(c => c.user).filter(Boolean)))], [contacts]);
  const groups = useMemo(() => ['all', ...Array.from(new Set(contacts.map(c => c.group).filter(Boolean)))], [contacts]);

  const filtered = contacts.filter(c => {
    const query = search.toLowerCase();
    const matchSearch = !query
      || c.name.toLowerCase().includes(query)
      || (c.email || '').toLowerCase().includes(query)
      || c.phone.includes(search)
      || c.user.toLowerCase().includes(query)
      || (c.user_email || '').toLowerCase().includes(query);
    const matchUser = userFilter === 'all' || c.user === userFilter;
    const matchGroup = groupFilter === 'all' || c.group === groupFilter;
    return matchSearch && matchUser && matchGroup;
  });

  const handleDelete = async (contact: AdminContact) => {
    try {
      const response = await deleteAdminContact(contact.id);
      setContacts(prev => prev.filter(item => item.id !== contact.id));
      toast.success(response.message || 'Contact deleted successfully.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to delete contact.');
    }
  };

  const exportCsv = () => {
    const rows = [
      ['User', 'User Email', 'Contact Name', 'Phone', 'Email', 'Group', 'Date Added'],
      ...filtered.map(c => [c.user, c.user_email || '', c.name, c.phone, c.email || '', c.group, c.added || '']),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'viresend-admin-contacts.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Contacts Management</h1>
          <p className="text-gray-500 text-sm mt-0.5">View contacts and groups created by users.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadContacts} className="hidden sm:flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button onClick={exportCsv} className="hidden sm:flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm">
            <Download className="w-4 h-4" />Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Contacts', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
          { label: 'Total Groups', value: stats.groups, icon: BookOpen, color: 'text-purple-600', bg: 'bg-purple-100' },
          { label: 'Users With Contacts', value: stats.users, icon: Upload, color: 'text-emerald-600', bg: 'bg-emerald-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <div className={`text-xl ${s.color}`} style={{ fontWeight: 700 }}>{s.value}</div>
              <div className="text-gray-500 text-xs">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search user, name, email, phone..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 text-gray-600">
          {users.map(u => <option key={u} value={u}>{u === 'all' ? 'All Users' : u}</option>)}
        </select>
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 text-gray-600">
          {groups.map(g => <option key={g} value={g}>{g === 'all' ? 'All Groups' : g}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['User','Company/Sender ID','Phone','Email','Group','Date Added','Actions'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 px-5 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading contacts...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">No contacts found.</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3.5">
                    <div className="text-sm text-gray-600">{c.user}</div>
                    {c.user_email && <div className="text-xs text-gray-400">{c.user_email}</div>}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-800" style={{ fontWeight: 500 }}>{c.name}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-gray-600">{c.phone}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{c.email || '-'}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>{c.group}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-400">{c.added ? new Date(c.added).toLocaleDateString() : '-'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPreviewContact(c)} className="p-1.5 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50 text-sm text-gray-500">
          Showing {filtered.length} of {contacts.length} contacts
        </div>
      </div>

      {previewContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPreviewContact(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-gray-800" style={{ fontWeight: 700 }}>Contact Details</h2>
              <button onClick={() => setPreviewContact(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-3">
              {[
                ['User', previewContact.user],
                ['User Email', previewContact.user_email || '-'],
                ['Company/Sender ID', previewContact.name],
                ['Phone', previewContact.phone],
                ['Email', previewContact.email || '-'],
                ['Group', previewContact.group],
                ['Date Added', previewContact.added ? new Date(previewContact.added).toLocaleString() : '-'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-28 flex-shrink-0 pt-0.5" style={{ fontWeight: 600 }}>{k}</span>
                  <span className="text-sm text-gray-700">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
