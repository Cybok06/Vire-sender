import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  Send, Upload, Loader2, MessageSquare,
  Users, Wallet, Phone, Zap, AlertCircle, CheckCircle, Check, ChevronDown, Search
} from 'lucide-react';
import { toast } from 'sonner';
import { AsYouType, CountryCode, getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { getSmsContactGroups, getSmsCostPreview, getSmsPackages, getSmsSenderIds, sendBulkSms, sendSingleSms } from '../../../lib/api.js';
import { useServiceAvailability } from '../../contexts/ServiceAvailabilityContext';
import { ServiceLockedOverlay } from '../../components/ServiceLockedOverlay';
import { formatCurrency } from '../../utils/currency';

const MAX_CHARS = 160;
const DEFAULT_COST = 0.04;
const PREVIEW_DEFAULT = { sms_parts: 1, sms_units: 1, cost_per_sms: DEFAULT_COST, total_cost: DEFAULT_COST, sms_enabled: true, international: false, requires_sender_id: true, shared_sender: false };
const MESSAGE_CATEGORIES = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'service', label: 'Service' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'authentication', label: 'Authentication' },
];
const countryDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
const SMS_COUNTRIES = getCountries().map(code => ({ code, name: countryDisplayNames.of(code) || code, dialCode: `+${getCountryCallingCode(code)}`, flag: String.fromCodePoint(...code.split('').map(char => 127397 + char.charCodeAt(0))), flagImage: `https://flagcdn.com/w40/${code.toLowerCase()}.png` })).sort((a, b) => a.name.localeCompare(b.name));

type ContactGroup = { name: string; count: number };
type SenderApplication = { id: string; sender_id: string; status: string };

function parseNumbers(value: string) {
  return value.split(/[\n,;]+/).map(n => n.trim()).filter(n => n.length >= 7);
}

function parseCsvPhones(text: string) {
  const rows = text.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  if (!rows.length) return [];
  const headers = rows[0].toLowerCase().split(',').map(item => item.trim());
  const phoneIndex = headers.findIndex(header => ['phone', 'number', 'recipient', 'mobile'].includes(header));
  const start = phoneIndex >= 0 ? 1 : 0;
  const index = phoneIndex >= 0 ? phoneIndex : 0;
  return rows.slice(start).map(row => row.split(',')[index]?.trim()).filter(Boolean);
}

export default function SendSmsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isEnabled } = useServiceAvailability();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [senderIds, setSenderIds] = useState<string[]>([]);
  const [senderApplications, setSenderApplications] = useState<SenderApplication[]>([]);
  const [activeSmsProvider, setActiveSmsProvider] = useState('arkesel');
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [smsBalance, setSmsBalance] = useState(0);

  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>('GH');
  const [countrySelectOpen, setCountrySelectOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [singlePreviewError, setSinglePreviewError] = useState('');
  const [senderId, setSenderId] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('');
  const [singlePreview, setSinglePreview] = useState(PREVIEW_DEFAULT);
  const [sending, setSending] = useState(false);

  const [bulkSenderId, setBulkSenderId] = useState('');
  const [bulkNumbers, setBulkNumbers] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [bulkPreview, setBulkPreview] = useState({ ...PREVIEW_DEFAULT, recipient_count: 0 });
  const [sendingBulk, setSendingBulk] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rawBulkLines = parseNumbers(bulkNumbers);
  const uniqueNumbers = [...new Set(rawBulkLines)];
  const selectedGroupCount = contactGroups.find(group => group.name === selectedGroup)?.count || 0;
  const bulkRecipientCount = uniqueNumbers.length + selectedGroupCount;
  const duplicatesRemoved = rawBulkLines.length - uniqueNumbers.length;
  const moolreActive = activeSmsProvider === 'moolre';
  const noMoolreSenderId = moolreActive && senderIds.length === 0;
  const singleNeedsMoolreSenderId = noMoolreSenderId && !singlePreview.international;
  const bulkNeedsMoolreSenderId = noMoolreSenderId && !!(bulkPreview as any).requires_approved_sender_id;
  const pendingSenderCount = senderApplications.filter(item => item.status === 'pending').length;

  const loadMeta = async () => {
    try {
      const [senderResponse, groupResponse, packageResponse] = await Promise.all([getSmsSenderIds(), getSmsContactGroups(), getSmsPackages()]);
      setSenderIds(senderResponse.sender_ids || []);
      setSenderApplications(senderResponse.applications || []);
      setActiveSmsProvider(senderResponse.active_sms_provider || 'arkesel');
      setContactGroups(groupResponse.groups || []);
      setSmsBalance(packageResponse.sms_balance || 0);
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to load SMS settings.');
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    const templateMessage = (location.state as any)?.templateMessage;
    if (templateMessage) {
      setMessage(templateMessage);
      setBulkMessage(templateMessage);
    }
  }, [location.state]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        const response = await getSmsCostPreview({ message, recipients: phone });
        setSinglePreview(response.preview || PREVIEW_DEFAULT);
        setSinglePreviewError('');
      } catch (error: any) {
        setSinglePreview(PREVIEW_DEFAULT);
        setSinglePreviewError(error?.data?.message || 'Enter a valid mobile phone number.');
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [message, phone]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        const response = await getSmsCostPreview({
          message: bulkMessage,
          recipients: uniqueNumbers.join(','),
          group: selectedGroup,
          recipient_count: bulkRecipientCount || 0,
        });
        setBulkPreview(response.preview || { ...PREVIEW_DEFAULT, recipient_count: bulkRecipientCount });
      } catch {
        setBulkPreview({ ...PREVIEW_DEFAULT, recipient_count: bulkRecipientCount, total_cost: bulkRecipientCount * DEFAULT_COST });
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [bulkMessage, bulkNumbers, selectedGroup, bulkRecipientCount]);

  const singleRequiresSenderId = singlePreview.requires_sender_id !== false;
  const bulkRequiresSenderId = (bulkPreview as any).requires_sender_id !== false;
  const singleDisabled = sending || singleNeedsMoolreSenderId || !phone.trim() || (singleRequiresSenderId && !senderId.trim()) || !message.trim() || (singlePreview.international && !category) || !!singlePreviewError || !singlePreview.sms_enabled || smsBalance < singlePreview.sms_units;
  const bulkDisabled = sendingBulk || bulkNeedsMoolreSenderId || bulkRecipientCount === 0 || (bulkRequiresSenderId && !bulkSenderId.trim()) || !bulkMessage.trim() || ((bulkPreview as any).international && !bulkCategory) || !bulkPreview.sms_enabled || smsBalance < bulkPreview.sms_units;

  const handleSendSingle = async () => {
    if (singleDisabled) {
      toast.error(singleNeedsMoolreSenderId ? 'You need an approved Sender ID before sending Ghana SMS through Moolre.' : smsBalance < singlePreview.sms_units ? 'Insufficient SMS balance.' : 'Complete all required SMS fields.');
      return;
    }

    try {
      setSending(true);
      const response = await sendSingleSms({ recipient: phone, sender_id: singleRequiresSenderId ? senderId : '', message, category });
      setSmsBalance(response.sms_balance ?? smsBalance);
      toast.success(response.message || 'SMS sent successfully.');
      setPhone('');
      setMessage('');
      setCategory('');
      await loadMeta();
      navigate('/user/logs');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to send SMS.');
    } finally {
      setSending(false);
    }
  };

  const handleSendBulk = async () => {
    if (bulkDisabled) {
      toast.error(bulkNeedsMoolreSenderId ? 'You need an approved Sender ID before sending Ghana SMS through Moolre.' : smsBalance < bulkPreview.sms_units ? 'Insufficient SMS balance.' : 'Complete all required bulk SMS fields.');
      return;
    }

    try {
      setSendingBulk(true);
      const response = await sendBulkSms({
        recipients: uniqueNumbers,
        group: selectedGroup,
        sender_id: bulkSenderId,
        message: bulkMessage,
        category: bulkCategory,
      });
      setSmsBalance(response.sms_balance ?? smsBalance);
      if (response.warnings?.length) toast.warning(response.warnings.join(' '));
      toast.success(response.message || `${bulkRecipientCount} SMS messages sent successfully.`);
      setBulkNumbers('');
      setBulkMessage('');
      setBulkCategory('');
      setSelectedGroup('');
      await loadMeta();
      navigate('/user/logs');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to send bulk SMS.');
    } finally {
      setSendingBulk(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      const numbers = parseCsvPhones(await file.text());
      setBulkNumbers(prev => [prev, ...numbers].filter(Boolean).join('\n'));
      toast.success(`Loaded ${numbers.length} numbers from CSV.`);
    } else {
      toast.error('Please upload a .csv file');
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const numbers = parseCsvPhones(await file.text());
    setBulkNumbers(prev => [prev, ...numbers].filter(Boolean).join('\n'));
    toast.success(`Loaded ${numbers.length} numbers from CSV.`);
  };

  const handleCountryChange = (country: CountryCode) => {
    setSelectedCountry(country);
    setCountrySelectOpen(false);
    setCountrySearch('');
    setPhone(`+${getCountryCallingCode(country)}`);
  };

  const handlePhoneChange = (value: string) => {
    const international = value.trim().startsWith('+');
    const formatted = new AsYouType(international ? undefined : selectedCountry).input(value);
    setPhone(formatted);
    if (international) {
      const detected = parsePhoneNumberFromString(value)?.country;
      if (detected) {
        setSelectedCountry(detected);
      }
    }
  };

  if (!isEnabled('sms_sender')) return <ServiceLockedOverlay serviceKey="sms_sender" />;

  const selectedCountryData = SMS_COUNTRIES.find(country => country.code === selectedCountry) || SMS_COUNTRIES[0];
  const filteredCountries = SMS_COUNTRIES.filter(country => `${country.name} ${country.code} ${country.dialCode}`.toLowerCase().includes(countrySearch.trim().toLowerCase()));

  return (
    <div className="p-5 lg:p-7 space-y-5" style={{ fontFamily: "'Poppins','Inter',sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl" style={{ color: '#0F172A', fontWeight: 800 }}>Send SMS</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Send SMS messages to your contacts and customers.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm" style={{ background: 'rgba(37,99,235,0.08)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.15)' }}>
          <Wallet className="w-4 h-4" />
          <span style={{ fontWeight: 700 }}>SMS Balance: {smsBalance.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: '#e2e8f0' }}>
        {([['single', 'Single SMS', Phone], ['bulk', 'Bulk SMS', Users]] as const).map(([tab, label, Icon]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm transition-all"
            style={{
              background: activeTab === tab ? 'white' : 'transparent',
              color: activeTab === tab ? '#0F172A' : '#64748B',
              fontWeight: activeTab === tab ? 700 : 400,
              boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {moolreActive && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${noMoolreSenderId ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
          {noMoolreSenderId ? (
            <span>You need an approved Sender ID before sending SMS through Moolre.{pendingSenderCount ? ` ${pendingSenderCount} pending approval.` : ''} <Link to="/user/sender-ids" className="underline" style={{ fontWeight: 700 }}>Manage Sender IDs</Link></span>
          ) : (
            <span>Moolre is active. Select one of your approved Sender IDs for sending. <Link to="/user/sender-ids" className="underline" style={{ fontWeight: 700 }}>Manage Sender IDs</Link></span>
          )}
        </div>
      )}

      {activeTab === 'single' && (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>Country</label>
                <div className="relative mb-3">
                  <button type="button" onClick={() => setCountrySelectOpen(open => !open)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 text-left text-sm outline-none" style={{ border: '1.5px solid #e2e8f0', color: '#0F172A', fontFamily: 'inherit' }} aria-haspopup="listbox" aria-expanded={countrySelectOpen}>
                    <span className="flex min-w-0 items-center gap-3">
                      <SmsCountryFlag country={selectedCountryData} className="h-5 w-7" />
                      <span className="truncate">{selectedCountryData.name} ({selectedCountryData.code})</span>
                      <span className="shrink-0 text-gray-500">{selectedCountryData.dialCode}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${countrySelectOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {countrySelectOpen && (
                    <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                      <div className="border-b border-gray-100 p-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input autoFocus value={countrySearch} onChange={e => setCountrySearch(e.target.value)} placeholder="Search country, code, or dial code" className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto p-1" role="listbox">
                        {filteredCountries.map(country => (
                          <button key={country.code} type="button" onClick={() => handleCountryChange(country.code)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-50 ${selectedCountry === country.code ? 'bg-blue-50 text-blue-800' : 'text-gray-700'}`} role="option" aria-selected={selectedCountry === country.code}>
                            <SmsCountryFlag country={country} className="h-5 w-7" />
                            <span className="min-w-0 flex-1 truncate">{country.name}</span>
                            <span className="text-xs text-gray-400">{country.code}</span>
                            <span className="w-12 text-right text-xs text-gray-500">{country.dialCode}</span>
                            {selectedCountry === country.code && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                          </button>
                        ))}
                        {filteredCountries.length === 0 && <div className="px-3 py-6 text-center text-sm text-gray-400">No countries found.</div>}
                      </div>
                    </div>
                  )}
                </div>
                <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>Recipient Phone Number</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><SmsCountryFlag country={selectedCountryData} className="h-4 w-6" /></span>
                  <input
                    type="tel"
                    placeholder="0240000000, +233240000000, or +12025550123"
                    value={phone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl outline-none transition-all"
                    style={{ border: `1.5px solid ${singlePreviewError && phone ? '#fca5a5' : '#e2e8f0'}`, color: '#0F172A', fontFamily: 'inherit' }}
                  />
                </div>
                {singlePreviewError && phone && <p className="mt-1 text-xs text-red-600">{singlePreviewError}</p>}
              </div>

              <div>
                <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>Company Name/Sender ID</label>
                {!singleRequiresSenderId ? (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
                    Sender automatically selected for this destination.
                  </div>
                ) : moolreActive && !singlePreview.international ? (
                  <select
                    value={senderId}
                    onChange={e => setSenderId(e.target.value)}
                    disabled={noMoolreSenderId}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all disabled:bg-gray-50"
                    style={{ border: '1.5px solid #e2e8f0', color: '#0F172A' }}
                  >
                    <option value="">{noMoolreSenderId ? 'No approved Sender ID' : 'Select an approved Sender ID'}</option>
                    {senderIds.map(id => <option key={id} value={id}>{id} - Approved</option>)}
                  </select>
                ) : (
                  <>
                    <input
                      list="sender-id-options"
                      maxLength={11}
                      placeholder="e.g. MyBrand"
                      value={senderId}
                      onChange={e => setSenderId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={{ border: '1.5px solid #e2e8f0', color: '#0F172A' }}
                    />
                    <datalist id="sender-id-options">
                      {senderIds.map(id => <option key={id} value={id} />)}
                    </datalist>
                  </>
                )}
                {singleRequiresSenderId && <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>{moolreActive && !singlePreview.international ? 'Only Moolre-approved Sender IDs can be used.' : "Max 11 characters. This appears as the sender on the recipient's phone."}</p>}
              </div>

              {singlePreview.international && (
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>Message Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ border: '1.5px solid #e2e8f0', color: '#0F172A' }}>
                    <option value="">Select message category</option>
                    {MESSAGE_CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">Required by Bird for international SMS.</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm" style={{ color: '#374151', fontWeight: 600 }}>Message</label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: singlePreview.sms_parts > 1 ? '#fef9c3' : '#f1f5f9', color: singlePreview.sms_parts > 1 ? '#92400e' : '#64748b', fontWeight: 600 }}>
                      {singlePreview.sms_parts} SMS {singlePreview.sms_parts > 1 ? 'parts' : 'part'}
                    </span>
                    <span className="text-xs" style={{ color: message.length > MAX_CHARS * 2 ? '#ef4444' : '#94a3b8' }}>
                      {message.length}/{MAX_CHARS * singlePreview.sms_parts}
                    </span>
                  </div>
                </div>
                <textarea
                  placeholder="Type your message here..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2.5 text-sm rounded-xl outline-none resize-none transition-all"
                  style={{ border: '1.5px solid #e2e8f0', color: '#0F172A', fontFamily: 'inherit' }}
                />
              </div>
            </div>

          </div>

          <div className="space-y-4">
            <PreviewCard senderId={senderId} recipient={phone || '-'} message={message} parts={singlePreview.sms_parts} cost={singlePreview.sms_units} />
            <CostCard preview={singlePreview} balance={smsBalance} />
            <button
              onClick={handleSendSingle}
              disabled={singleDisabled}
              className="w-full flex items-center justify-center gap-2 text-white py-3.5 rounded-xl transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', fontWeight: 700, boxShadow: '0 8px 24px rgba(37,99,235,0.35)' }}
            >
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Send className="w-4 h-4" /> Send SMS</>}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'bulk' && (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <h3 className="text-sm mb-3" style={{ color: '#0F172A', fontWeight: 700 }}>Upload Recipients</h3>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl p-6 text-center cursor-pointer transition-all mb-4"
                style={{ border: `2px dashed ${isDragging ? '#2563EB' : '#e2e8f0'}`, background: isDragging ? 'rgba(37,99,235,0.04)' : '#f8faff' }}
              >
                <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: isDragging ? '#2563EB' : '#cbd5e1' }} />
                <p className="text-sm" style={{ color: '#374151', fontWeight: 600 }}>{isDragging ? 'Drop your CSV here' : 'Drag and drop a CSV file, or click to browse'}</p>
                <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>CSV with phone, number, recipient, or mobile column</p>
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
              </div>

              <div className="mb-4">
                <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>Or select a contact group</label>
                <div className="flex gap-2 flex-wrap">
                  {contactGroups.map(g => (
                    <button
                      key={g.name}
                      onClick={() => setSelectedGroup(selectedGroup === g.name ? '' : g.name)}
                      className="px-3 py-1.5 rounded-full text-xs transition-all"
                      style={{
                        background: selectedGroup === g.name ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : 'white',
                        color: selectedGroup === g.name ? 'white' : '#64748B',
                        border: `1px solid ${selectedGroup === g.name ? '#2563EB' : '#e2e8f0'}`,
                        fontWeight: selectedGroup === g.name ? 600 : 400,
                      }}
                    >
                      {g.name} ({g.count})
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>Company Name/Sender ID</label>
                  {!bulkRequiresSenderId ? (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
                      Sender automatically selected for all destinations.
                    </div>
                  ) : moolreActive && !!(bulkPreview as any).requires_approved_sender_id ? (
                    <select
                      value={bulkSenderId}
                      onChange={e => setBulkSenderId(e.target.value)}
                      disabled={noMoolreSenderId}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all disabled:bg-gray-50"
                      style={{ border: '1.5px solid #e2e8f0', color: '#0F172A' }}
                    >
                      <option value="">{noMoolreSenderId ? 'No approved Sender ID' : 'Select an approved Sender ID'}</option>
                      {senderIds.map(id => <option key={id} value={id}>{id} - Approved</option>)}
                    </select>
                  ) : (
                    <>
                      <input
                        list="bulk-sender-id-options"
                        maxLength={11}
                        placeholder="e.g. MyBrand"
                        value={bulkSenderId}
                        onChange={e => setBulkSenderId(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
                        style={{ border: '1.5px solid #e2e8f0', color: '#0F172A' }}
                      />
                      <datalist id="bulk-sender-id-options">{senderIds.map(id => <option key={id} value={id} />)}</datalist>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>Manual entry</label>
                  <textarea
                    placeholder={'0240000000\n+233240000001\n233240000002'}
                    value={bulkNumbers}
                    onChange={e => setBulkNumbers(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2.5 text-sm rounded-xl outline-none resize-none font-mono transition-all"
                    style={{ border: '1.5px solid #e2e8f0', color: '#0F172A', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              {(bulkPreview as any).international && (
                <div className="mb-4">
                  <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>Message Category</label>
                  <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ border: '1.5px solid #e2e8f0', color: '#0F172A' }}>
                    <option value="">Select message category</option>
                    {MESSAGE_CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">Applied only to international recipients. Ghana routing is unchanged.</p>
                </div>
              )}

              {(rawBulkLines.length > 0 || selectedGroup) && (
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ background: '#dcfce7', color: '#065f46' }}>
                    <CheckCircle className="w-3.5 h-3.5" />{bulkRecipientCount} recipients
                  </div>
                  {duplicatesRemoved > 0 && (
                    <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ background: '#fef9c3', color: '#92400e' }}>
                      <AlertCircle className="w-3.5 h-3.5" />{duplicatesRemoved} duplicates removed
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm" style={{ color: '#0F172A', fontWeight: 600 }}>Message</h3>
                <span className="text-xs" style={{ color: '#94a3b8' }}>{bulkMessage.length}/{MAX_CHARS * bulkPreview.sms_parts}</span>
              </div>
              <textarea
                placeholder="Type your message..."
                value={bulkMessage}
                onChange={e => setBulkMessage(e.target.value)}
                rows={4}
                className="w-full px-3 py-2.5 text-sm rounded-xl outline-none resize-none transition-all"
                style={{ border: '1.5px solid #e2e8f0', color: '#0F172A', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <h3 className="text-sm mb-4" style={{ color: '#0F172A', fontWeight: 600 }}>Send Summary</h3>
              <SummaryRow label="Recipients" value={bulkRecipientCount.toLocaleString()} />
              <SummaryRow label="SMS parts" value={String(bulkPreview.sms_parts)} />
              <SummaryRow label="SMS units" value={String(bulkPreview.sms_units)} />
              <SummaryRow label="Cost per SMS" value={bulkPreview.cost_per_sms == null ? 'Varies by destination' : formatCurrency(bulkPreview.cost_per_sms, 3)} />
              {Array.isArray((bulkPreview as any).destinations) && (bulkPreview as any).destinations.map((destination: any) => (
                <SummaryRow key={destination.country_code} label={`${destination.country_name} (${destination.country_code})`} value={`${destination.count} recipient${destination.count === 1 ? '' : 's'}`} />
              ))}
              <div className="border-t border-gray-100 pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Estimated Total</span>
                  <span className="text-blue-900 text-lg" style={{ fontWeight: 700 }}>{bulkPreview.sms_units.toLocaleString()} credits</span>
                </div>
              </div>
              <div className="mt-4 p-3 bg-gray-50 rounded-xl flex justify-between">
                <span className="text-xs text-gray-500">SMS balance</span>
                <span className={`text-xs ${smsBalance < bulkPreview.sms_units && bulkRecipientCount > 0 ? 'text-red-500' : 'text-gray-700'}`} style={{ fontWeight: 600 }}>{smsBalance.toLocaleString()} SMS</span>
              </div>
            </div>

            <button
              onClick={handleSendBulk}
              disabled={bulkDisabled}
              className="w-full flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl transition-all text-sm"
              style={{ fontWeight: 600 }}
            >
              {sendingBulk ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Zap className="w-4 h-4" /> Send Bulk SMS {bulkRecipientCount > 0 && `(${bulkRecipientCount})`}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewCard({ senderId, recipient, message, parts, cost }: { senderId: string; recipient: string; message: string; parts: number; cost: number }) {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
      <h3 className="text-sm mb-4" style={{ color: '#0F172A', fontWeight: 700 }}>Live Preview</h3>
      <div className="rounded-xl p-4" style={{ background: '#f1f5f9' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}>
            <MessageSquare className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <div className="text-xs" style={{ color: '#374151', fontWeight: 700 }}>{senderId || 'Sender ID'}</div>
            <div className="text-[10px]" style={{ color: '#94a3b8' }}>to: {recipient}</div>
          </div>
        </div>
        <div className="text-white rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed" style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}>
          {message || <span className="italic" style={{ color: 'rgba(255,255,255,0.5)' }}>Your message will appear here...</span>}
        </div>
        {message && <div className="mt-2 text-right text-[10px]" style={{ color: '#94a3b8' }}>{message.length} chars - {parts} part{parts > 1 ? 's' : ''} - {cost} SMS credit{cost === 1 ? '' : 's'}</div>}
      </div>
    </div>
  );
}

function CostCard({ preview, balance }: { preview: any; balance: number }) {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
      <h3 className="text-sm mb-3" style={{ color: '#0F172A', fontWeight: 700 }}>SMS Credit Estimate</h3>
      {preview.country_name && <div className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800"><span style={{ fontWeight: 700 }}>{preview.country_name}</span>{preview.international ? ' · International SMS' : ' · Ghana SMS'}</div>}
      <SummaryRow label="Per recipient segment" value="1 SMS credit" />
      <SummaryRow label="SMS parts" value={String(preview.sms_parts)} />
      <div className="flex justify-between pt-2" style={{ borderTop: '1px solid #f1f5f9' }}>
        <span className="text-sm" style={{ color: '#374151', fontWeight: 700 }}>Total</span>
        <span className="text-sm" style={{ color: '#2563EB', fontWeight: 800 }}>{preview.sms_units} credits</span>
      </div>
      <div className="mt-3 p-2.5 rounded-xl flex justify-between text-xs" style={{ background: '#f1f5f9' }}>
        <span style={{ color: '#64748B' }}>SMS balance</span>
        <span style={{ color: balance < preview.sms_units ? '#ef4444' : '#374151', fontWeight: 700 }}>{balance.toLocaleString()} SMS</span>
      </div>
      {!preview.sms_enabled && <div className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">SMS sending is currently disabled.</div>}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm mb-2">
      <span style={{ color: '#64748B' }}>{label}</span>
      <span style={{ color: '#374151', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function SmsCountryFlag({ country, className }: { country: typeof SMS_COUNTRIES[number]; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!failed) return <img src={country.flagImage} alt="" className={`${className} shrink-0 rounded-sm object-cover`} onError={() => setFailed(true)} />;
  return <span className={`${className} shrink-0 text-center text-base leading-none`}>{country.flag}</span>;
}
