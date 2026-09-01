import { useEffect, useMemo, useState } from 'react';
import { BarChart2, CheckCircle, Clock, Globe, Loader2, MousePointerClick, MonitorSmartphone, Search, Users, XCircle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { getAdminCookieAnalytics } from '../../../lib/api';

function formatSeconds(value = 0) {
  const seconds = Number(value || 0);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatDate(value?: string) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function formatLocation(session: any) {
  if (session.latitude && session.longitude) {
    return `${Number(session.latitude).toFixed(5)}, ${Number(session.longitude).toFixed(5)}`;
  }
  return [session.city, session.country].filter(Boolean).join(', ') || 'Unknown';
}

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];

export default function AdminCookieAnalytics() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [consentFilter, setConsentFilter] = useState('any');

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const data = await getAdminCookieAnalytics();
        setSummary(data.summary);
      } catch (error: any) {
        toast.error(error.message || 'Unable to load cookie analytics.');
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  const sessions = useMemo(() => {
    const rows = summary?.sessions || [];
    return rows.filter((session: any) => {
      const q = search.toLowerCase().trim();
      const matchesSearch = !q || [session.visitor_id, session.page_url, session.browser, session.country, session.city].some(value => String(value || '').toLowerCase().includes(q));
      const matchesDevice = deviceFilter === 'all' || session.device_type === deviceFilter;
      const matchesConsent = consentFilter === 'any' || session.consent_type === consentFilter;
      return matchesSearch && matchesDevice && matchesConsent;
    });
  }, [summary, search, deviceFilter, consentFilter]);

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading cookie analytics...
      </div>
    );
  }

  const statCards = [
    { label: 'Total Visitors', value: summary?.total_visitors || 0, icon: Users, color: '#2563EB' },
    { label: 'Unique Visitors', value: summary?.unique_visitors || 0, icon: Globe, color: '#10B981' },
    { label: 'Returning', value: summary?.returning_visitors || 0, icon: CheckCircle, color: '#8B5CF6' },
    { label: 'Page Views', value: summary?.page_views || 0, icon: BarChart2, color: '#06B6D4' },
    { label: 'Avg Time', value: formatSeconds(summary?.average_time_on_site || 0), icon: Clock, color: '#F59E0B' },
    { label: 'CTA Clicks', value: summary?.cta_clicks || 0, icon: MousePointerClick, color: '#EF4444' },
    { label: 'Accepted', value: summary?.consent_accepted || 0, icon: CheckCircle, color: '#059669' },
    { label: 'Rejected', value: summary?.consent_rejected || 0, icon: XCircle, color: '#DC2626' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Analytics / Cookies</h1>
        <p className="text-gray-500 text-sm mt-0.5">Monitor website visitors, cookie consent, devices, traffic sources, and CTA performance.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {statCards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: `${card.color}14` }}>
              <card.icon className="w-4 h-4" style={{ color: card.color }} />
            </div>
            <div className="text-lg text-gray-800" style={{ fontWeight: 800 }}>{card.value}</div>
            <div className="text-gray-500 text-xs mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-gray-800 mb-4" style={{ fontWeight: 700 }}>Visitors Over Time</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={summary?.timeline || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip />
              <Line type="monotone" dataKey="visitors" stroke="#2563EB" strokeWidth={2} />
              <Line type="monotone" dataKey="page_views" stroke="#10B981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-gray-800 mb-4" style={{ fontWeight: 700 }}>Device Breakdown</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={summary?.top_devices || []} dataKey="value" nameKey="name" outerRadius={86} label>
                {(summary?.top_devices || []).map((_: any, index: number) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {[
          ['Top Pages', summary?.top_pages || []],
          ['Top Browsers', summary?.top_browsers || []],
          ['Locations', summary?.top_locations || []],
          ['Traffic Sources', summary?.traffic_sources || []],
          ['CTA Performance', summary?.cta_performance || []],
        ].map(([title, data]: any) => (
          <div key={title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-gray-800 mb-4" style={{ fontWeight: 700 }}>{title}</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} hide={String(title).length > 12} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search visitor, page, browser, or location..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400" />
        </div>
        <select value={deviceFilter} onChange={event => setDeviceFilter(event.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none">
          <option value="all">All Devices</option>
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
          <option value="tablet">Tablet</option>
        </select>
        <select value={consentFilter} onChange={event => setConsentFilter(event.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none">
          <option value="any">All Consent</option>
          <option value="all">Accept All</option>
          <option value="custom">Custom</option>
          <option value="essential">Essential Only</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Visitor ID', 'Device', 'Browser', 'Location', 'Page Visited', 'Consent', 'Time on Page', 'Last Activity', 'Actions'].map(header => (
                  <th key={header} className="text-left text-xs text-gray-500 px-4 py-3.5 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sessions.map((session: any) => (
                <tr key={`${session.visitor_id}-${session.session_id}`} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3.5 font-mono text-xs text-gray-500">{session.visitor_id.slice(0, 18)}...</td>
                  <td className="px-4 py-3.5">
                    <div className="inline-flex items-center gap-1.5 text-xs capitalize text-gray-700">
                      <MonitorSmartphone className="w-3.5 h-3.5 text-blue-500" />{session.device_type || 'unknown'}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">{session.browser || 'Unknown'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">
                    <div>{formatLocation(session)}</div>
                    {session.location_accuracy && <div className="text-[10px] text-gray-400">±{Math.round(session.location_accuracy)}m</div>}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 max-w-[260px] truncate">{session.page_url}</td>
                  <td className="px-4 py-3.5"><span className="px-2 py-1 rounded-full text-xs capitalize bg-blue-50 text-blue-700">{session.consent_type}</span></td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">{formatSeconds(session.time_on_page)}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{formatDate(session.last_activity_at)}</td>
                  <td className="px-4 py-3.5">
                    <button onClick={() => toast.info(`${session.events_count} event(s), ${session.scroll_depth}% scroll depth.`)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-blue-300 hover:text-blue-600">
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!sessions.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">No visitor sessions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
