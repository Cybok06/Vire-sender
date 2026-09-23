import { Download, TrendingUp, Users, MessageSquare, Mail, Hash } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { toast } from 'sonner';

const dailyRevenue = [
  { day: 'Jan 9',  revenue: 284 }, { day: 'Jan 10', revenue: 312 }, { day: 'Jan 11', revenue: 189 },
  { day: 'Jan 12', revenue: 410 }, { day: 'Jan 13', revenue: 387 }, { day: 'Jan 14', revenue: 521 },
  { day: 'Jan 15', revenue: 463 },
];

const otpByCountry = [
  { country: 'US',  orders: 89 }, { country: 'RU', orders: 74 }, { country: 'GB', orders: 52 },
  { country: 'DE',  orders: 41 }, { country: 'FR', orders: 38 }, { country: 'CA', orders: 29 },
];

const smsDelivery = [
  { week: 'W1', delivered: 2840, failed: 62 }, { week: 'W2', delivered: 3210, failed: 48 },
  { week: 'W3', delivered: 2980, failed: 71 }, { week: 'W4', delivered: 3440, failed: 54 },
];

const emailTrend = [
  { month: 'Aug', sent: 280 }, { month: 'Sep', sent: 390 }, { month: 'Oct', sent: 510 },
  { month: 'Nov', sent: 720 }, { month: 'Dec', sent: 960 }, { month: 'Jan', sent: 3840 },
];

const topSpenders = [
  { name: 'John Mensah',   otp: 42, sms: 1247, email: 384, total: 156.80 },
  { name: 'Sarah Connor',  otp: 18, sms: 842,  email: 680, total:  98.40 },
  { name: 'Alice Johnson', otp: 31, sms: 421,  email: 120, total:  62.10 },
  { name: 'Bob Smith',     otp: 12, sms: 198,  email:  45, total:  28.90 },
];

const failuresByProvider = [
  { name: 'SMS-MAN',  value: 14, color: '#8B5CF6' },
  { name: 'Arkesel',  value: 38, color: '#3B82F6' },
  { name: 'Gmail',    value: 12, color: '#EF4444'  },
  { name: 'SMTP',     value: 24, color: '#6B7280'  },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-gray-100 shadow-lg rounded-xl px-4 py-3">
        <div className="text-xs text-gray-500 mb-1" style={{ fontWeight: 600 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} className="text-sm" style={{ color: p.color || p.fill, fontWeight: 600 }}>
            {p.name}: {p.name === 'revenue' ? `$${p.value}` : p.value}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function AdminReportsAnalytics() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>Reports &amp; Analytics</h1>
          <p className="text-gray-500 text-sm mt-0.5">Platform-wide performance insights across all channels.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => toast.success('Exporting CSV...')} className="flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm hover:border-gray-300">
            <Download className="w-4 h-4" />CSV
          </button>
          <button onClick={() => toast.success('Generating PDF...')} className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-sm">
            <Download className="w-4 h-4" />PDF
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Monthly Revenue',  value: 'GHS 3,120', change: '+12%',  icon: TrendingUp,    color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { label: 'Active Users',     value: '6',      change: '+2',     icon: Users,         color: 'text-blue-600',   bg: 'bg-blue-100'    },
          { label: 'SMS Sent (Month)', value: '12,470', change: '+24%',  icon: MessageSquare, color: 'text-cyan-600',   bg: 'bg-cyan-100'    },
          { label: 'Emails (Month)',   value: '3,840',  change: '+310%', icon: Mail,          color: 'text-indigo-600', bg: 'bg-indigo-100'  },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>{s.change}</span>
            </div>
            <div className="text-2xl text-gray-800" style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-gray-500 text-sm mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Daily revenue */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4"><h2 className="text-gray-800" style={{ fontWeight: 600 }}>Daily Revenue</h2><p className="text-gray-400 text-xs">Last 7 days (GHS)</p></div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyRevenue} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} fill="url(#revGrad2)" name="revenue" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* OTP orders by country */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4"><h2 className="text-gray-800" style={{ fontWeight: 600 }}>OTP Orders by Country</h2><p className="text-gray-400 text-xs">Top 6 countries</p></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={otpByCountry} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="country" type="category" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="orders" fill="#8B5CF6" radius={[0,4,4,0]} name="orders" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* SMS delivery rate */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4"><h2 className="text-gray-800" style={{ fontWeight: 600 }}>SMS Delivery Rate</h2><p className="text-gray-400 text-xs">Weekly delivered vs failed</p></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={smsDelivery} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="delivered" fill="#10B981" radius={[4,4,0,0]} name="delivered" />
              <Bar dataKey="failed"    fill="#EF4444" radius={[4,4,0,0]} name="failed"    />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Email sending trend */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4"><h2 className="text-gray-800" style={{ fontWeight: 600 }}>Email Sending Trend</h2><p className="text-gray-400 text-xs">Monthly emails sent</p></div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={emailTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="emailGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2} /><stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="sent" stroke="#8B5CF6" strokeWidth={2} fill="url(#emailGrad)" name="sent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row: Top users + Failed by provider */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Top users */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-gray-800" style={{ fontWeight: 600 }}>Top Users by Spending</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['User','OTP Orders','SMS Sent','Emails Sent','Total Spent'].map(h => (
                    <th key={h} className="text-left text-xs text-gray-500 px-5 py-3 uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topSpenders.map((u, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 text-xs" style={{ fontWeight: 600 }}>{u.name.split(' ').map(n => n[0]).join('')}</div>
                        <span className="text-sm text-gray-700" style={{ fontWeight: 500 }}>{u.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-purple-600" style={{ fontWeight: 600 }}>{u.otp}</td>
                    <td className="px-5 py-3.5 text-sm text-blue-600" style={{ fontWeight: 600 }}>{u.sms.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-sm text-indigo-600" style={{ fontWeight: 600 }}>{u.email}</td>
                    <td className="px-5 py-3.5 text-sm text-emerald-600" style={{ fontWeight: 700 }}>GHS {u.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Failed by provider */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4"><h2 className="text-gray-800" style={{ fontWeight: 600 }}>Failed Messages</h2><p className="text-gray-400 text-xs">By provider</p></div>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={failuresByProvider} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                {failuresByProvider.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v) => [v, 'Failures']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-3">
            {failuresByProvider.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-gray-600">{item.name}</span>
                </div>
                <span className="text-xs text-gray-800" style={{ fontWeight: 600 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}



