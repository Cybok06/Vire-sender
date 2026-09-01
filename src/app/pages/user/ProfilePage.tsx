import { useEffect, useState } from 'react';
import { User, Mail, Phone, Lock, Eye, EyeOff, Save, Shield, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { changePassword, getCurrentUser, updateProfile } from '../../../lib/api.js';

export default function ProfilePage() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<'profile' | 'password'>('profile');
  const [profileUser, setProfileUser] = useState<any>(user);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Profile form
  const [profile, setProfile] = useState({
    full_name: user?.full_name || user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    profile_picture: user?.profile_picture || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadProfile() {
      if (!token) return;
      setLoadingProfile(true);
      try {
        const response = await getCurrentUser(token);
        if (!mounted) return;
        const nextUser = response.user;
        setProfileUser(nextUser);
        setProfile({
          full_name: nextUser.full_name || '',
          email: nextUser.email || '',
          phone: nextUser.phone || '',
          profile_picture: nextUser.profile_picture || '',
        });
        setLoadError('');
      } catch (error: any) {
        if (mounted) setLoadError(error?.data?.message || error?.message || 'Unable to load profile.');
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    }
    loadProfile();
    return () => { mounted = false; };
  }, [token]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const response = await updateProfile({
        full_name: profile.full_name,
        phone: profile.phone,
        profile_picture: profile.profile_picture,
      });
      setProfileUser(response.user);
      toast.success(response.message || 'Profile updated successfully.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(passwords.newPass)) {
      toast.error('Use at least 8 characters with uppercase, lowercase, number, and special character.');
      return;
    }
    if (passwords.newPass !== passwords.confirm) { toast.error('Passwords do not match'); return; }
    setSavingPassword(true);
    try {
      const response = await changePassword({
        current_password: passwords.current,
        new_password: passwords.newPass,
        confirm_password: passwords.confirm,
      });
      setPasswords({ current: '', newPass: '', confirm: '' });
      toast.success(response.message || 'Password changed successfully.');
    } catch (error: any) {
      toast.error(error?.data?.message || error?.message || 'Unable to change password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const displayName = profileUser?.full_name || profileUser?.name || 'User';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const authProvider = profileUser?.auth_provider || 'local';
  const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Never';

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'password' as const, label: 'Password', icon: Lock },
  ];

  return (
    <div className="p-5 lg:p-7" style={{ fontFamily: "'Poppins','Inter',sans-serif" }}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl" style={{ color: '#0F172A', fontWeight: 800 }}>Account Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Manage your profile, password, and security settings.</p>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4" />
            {loadError}
          </div>
        )}

        {/* Avatar card */}
        <div className="bg-white rounded-2xl p-6 flex items-center gap-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div
            className="w-20 h-20 rounded-2xl flex-shrink-0"
            style={{ overflow: 'hidden', boxShadow: '0 8px 24px rgba(37,99,235,0.2)', border: '3px solid rgba(37,99,235,0.15)' }}
          >
            {profileUser?.profile_picture ? (
              <img src={profileUser.profile_picture} alt="Profile avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-xl" style={{ background: 'linear-gradient(135deg,#2563EB,#06142B)', fontWeight: 800 }}>{initials}</div>
            )}
          </div>
          <div>
            <h2 className="text-xl" style={{ color: '#0F172A', fontWeight: 700 }}>{displayName}</h2>
            <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>{profileUser?.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                style={{ background: profileUser?.email_verified ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: profileUser?.email_verified ? '#059669' : '#b45309', fontWeight: 600 }}
              >
                <CheckCircle className="w-3 h-3" />
                {profileUser?.email_verified ? 'Verified Account' : 'Email Pending'}
              </span>
              <span className="text-xs" style={{ color: '#94a3b8' }}>Member since {formatDate(profileUser?.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="flex" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex items-center gap-2 flex-1 justify-center py-4 text-sm transition-all"
                style={{
                  color: tab === id ? '#2563EB' : '#64748B',
                  fontWeight: tab === id ? 700 : 400,
                  borderBottom: tab === id ? '2px solid #2563EB' : '2px solid transparent',
                  background: tab === id ? 'rgba(37,99,235,0.03)' : 'transparent',
                }}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Profile tab */}
            {tab === 'profile' && (
              <div className="space-y-4">
                {loadingProfile && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: '#64748B' }}>
                    <Loader2 className="w-4 h-4 animate-spin" />Loading profile...
                  </div>
                )}
                {[
                  { label: 'Full Name', key: 'full_name', type: 'text', Icon: User, placeholder: 'Your full name', disabled: false },
                  { label: 'Email Address', key: 'email', type: 'email', Icon: Mail, placeholder: 'you@example.com', disabled: true },
                  { label: 'Phone Number', key: 'phone', type: 'tel', Icon: Phone, placeholder: '+1 555 000 0000' },
                ].map(({ label, key, type, Icon, placeholder, disabled }) => (
                  <div key={key}>
                    <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>{label}</label>
                    <div className="relative">
                      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94a3b8' }} />
                      <input
                        type={type}
                        value={(profile as any)[key]}
                        onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
                        placeholder={placeholder}
                        disabled={disabled}
                        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                        style={{ border: '1.5px solid #e2e8f0', color: '#0F172A', fontFamily: 'inherit', background: disabled ? '#f8fafc' : 'white' }}
                        onFocus={e => (e.currentTarget.style.borderColor = '#2563EB')}
                        onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                      />
                    </div>
                  </div>
                ))}
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>Profile Picture URL</label>
                  <input
                    type="url"
                    value={profile.profile_picture}
                    onChange={e => setProfile(p => ({ ...p, profile_picture: e.target.value }))}
                    placeholder="https://example.com/avatar.png"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{ border: '1.5px solid #e2e8f0', color: '#0F172A', fontFamily: 'inherit' }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    ['Role', profileUser?.role || 'user'],
                    ['Status', profileUser?.account_status || 'active'],
                    ['Provider', authProvider],
                    ['Last Login', formatDate(profileUser?.last_login)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div className="text-xs" style={{ color: '#64748B' }}>{label}</div>
                      <div className="text-sm capitalize" style={{ color: '#0F172A', fontWeight: 700 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="flex items-center gap-2 text-white px-6 py-2.5 rounded-xl text-sm transition-all disabled:opacity-70"
                  style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', fontWeight: 600, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
                >
                  {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}

            {/* Password tab */}
            {tab === 'password' && (
              authProvider !== 'local' ? (
                <div className="p-4 rounded-xl flex items-start gap-2" style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.18)' }}>
                  <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#2563EB' }} />
                  <p className="text-sm" style={{ color: '#1e40af' }}>Password is managed by your social login provider.</p>
                </div>
              ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="p-3 rounded-xl flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                  <p className="text-xs" style={{ color: '#92400e' }}>Use a strong password with at least 8 characters, including numbers and symbols.</p>
                </div>
                {[
                  { label: 'Current Password', key: 'current', show: showCurrent, setShow: setShowCurrent, placeholder: 'Enter current password' },
                  { label: 'New Password', key: 'newPass', show: showNew, setShow: setShowNew, placeholder: 'Enter new password' },
                ].map(({ label, key, show, setShow, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>{label}</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94a3b8' }} />
                      <input
                        type={show ? 'text' : 'password'}
                        value={(passwords as any)[key]}
                        onChange={e => setPasswords(p => ({ ...p, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full pl-10 pr-10 py-3 rounded-xl text-sm outline-none transition-all"
                        style={{ border: '1.5px solid #e2e8f0', color: '#0F172A', fontFamily: 'inherit' }}
                        onFocus={e => (e.currentTarget.style.borderColor = '#2563EB')}
                        onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                      />
                      <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2">
                        {show ? <EyeOff className="w-4 h-4" style={{ color: '#94a3b8' }} /> : <Eye className="w-4 h-4" style={{ color: '#94a3b8' }} />}
                      </button>
                    </div>
                  </div>
                ))}
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: '#374151', fontWeight: 600 }}>Confirm New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94a3b8' }} />
                    <input
                      type="password"
                      value={passwords.confirm}
                      onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                      placeholder="Confirm new password"
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                      style={{ border: '1.5px solid #e2e8f0', color: '#0F172A', fontFamily: 'inherit' }}
                      onFocus={e => (e.currentTarget.style.borderColor = '#2563EB')}
                      onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="flex items-center gap-2 text-white px-6 py-2.5 rounded-xl text-sm transition-all disabled:opacity-70"
                  style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', fontWeight: 600, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
                >
                  {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {savingPassword ? 'Updating...' : 'Change Password'}
                </button>
              </form>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
