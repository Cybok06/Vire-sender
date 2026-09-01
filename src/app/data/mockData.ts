export const SERVICES = [
  { id: 'whatsapp', name: 'WhatsApp', emoji: '💬', markup: 0.10 },
  { id: 'telegram', name: 'Telegram', emoji: '✈️', markup: 0.08 },
  { id: 'google', name: 'Google', emoji: '🔍', markup: 0.12 },
  { id: 'facebook', name: 'Facebook', emoji: '👤', markup: 0.10 },
  { id: 'instagram', name: 'Instagram', emoji: '📷', markup: 0.10 },
  { id: 'twitter', name: 'Twitter / X', emoji: '🐦', markup: 0.09 },
  { id: 'tiktok', name: 'TikTok', emoji: '🎵', markup: 0.11 },
  { id: 'discord', name: 'Discord', emoji: '🎮', markup: 0.08 },
  { id: 'netflix', name: 'Netflix', emoji: '🎬', markup: 0.15 },
  { id: 'uber', name: 'Uber', emoji: '🚗', markup: 0.12 },
  { id: 'amazon', name: 'Amazon', emoji: '📦', markup: 0.10 },
  { id: 'microsoft', name: 'Microsoft', emoji: '💻', markup: 0.10 },
  { id: 'snapchat', name: 'Snapchat', emoji: '👻', markup: 0.08 },
  { id: 'linkedin', name: 'LinkedIn', emoji: '💼', markup: 0.12 },
  { id: 'paypal', name: 'PayPal', emoji: '💳', markup: 0.15 },
  { id: 'binance', name: 'Binance', emoji: '₿', markup: 0.20 },
  { id: 'airbnb', name: 'Airbnb', emoji: '🏠', markup: 0.10 },
  { id: 'spotify', name: 'Spotify', emoji: '🎧', markup: 0.09 },
];

export const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸', basePrice: 0.50, available: true, stock: 142 },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', basePrice: 0.80, available: true, stock: 87 },
  { code: 'RU', name: 'Russia', flag: '🇷🇺', basePrice: 0.30, available: true, stock: 342 },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', basePrice: 0.70, available: true, stock: 65 },
  { code: 'FR', name: 'France', flag: '🇫🇷', basePrice: 0.70, available: true, stock: 48 },
  { code: 'IN', name: 'India', flag: '🇮🇳', basePrice: 0.20, available: true, stock: 519 },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', basePrice: 0.40, available: true, stock: 93 },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', basePrice: 0.60, available: true, stock: 127 },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', basePrice: 0.50, available: true, stock: 78 },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', basePrice: 0.40, available: true, stock: 54 },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', basePrice: 0.55, available: true, stock: 39 },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', basePrice: 0.60, available: true, stock: 72 },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', basePrice: 0.75, available: true, stock: 31 },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', basePrice: 0.65, available: false, stock: 0 },
  { code: 'CN', name: 'China', flag: '🇨🇳', basePrice: 0.25, available: true, stock: 201 },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', basePrice: 0.35, available: true, stock: 88 },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', basePrice: 0.22, available: true, stock: 144 },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦', basePrice: 0.28, available: true, stock: 67 },
];

export interface Order {
  id: string;
  service: string;
  serviceEmoji: string;
  country: string;
  countryFlag: string;
  number: string;
  status: 'active' | 'completed' | 'expired' | 'cancelled';
  otp?: string;
  cost: number;
  createdAt: string;
  userId: string;
  userName: string;
}

export const MOCK_ORDERS: Order[] = [
  { id: 'ORD-001', service: 'WhatsApp', serviceEmoji: '💬', country: 'US', countryFlag: '🇺🇸', number: '+1 (555) 234-5678', status: 'completed', otp: '234567', cost: 0.60, createdAt: '2024-01-15 14:32', userId: '2', userName: 'John Mensah' },
  { id: 'ORD-002', service: 'Telegram', serviceEmoji: '✈️', country: 'RU', countryFlag: '🇷🇺', number: '+7 916 123-4567', status: 'active', cost: 0.38, createdAt: '2024-01-15 15:10', userId: '2', userName: 'John Mensah' },
  { id: 'ORD-003', service: 'Google', serviceEmoji: '🔍', country: 'GB', countryFlag: '🇬🇧', number: '+44 7911 123456', status: 'expired', cost: 0.92, createdAt: '2024-01-14 09:20', userId: '2', userName: 'John Mensah' },
  { id: 'ORD-004', service: 'Facebook', serviceEmoji: '👤', country: 'DE', countryFlag: '🇩🇪', number: '+49 1512 3456789', status: 'completed', otp: '857392', cost: 0.80, createdAt: '2024-01-14 11:45', userId: '2', userName: 'John Mensah' },
  { id: 'ORD-005', service: 'Instagram', serviceEmoji: '📷', country: 'IN', countryFlag: '🇮🇳', number: '+91 98765 43210', status: 'completed', otp: '123456', cost: 0.32, createdAt: '2024-01-13 16:20', userId: '3', userName: 'Ama Owusu' },
  { id: 'ORD-006', service: 'Discord', serviceEmoji: '🎮', country: 'NG', countryFlag: '🇳🇬', number: '+234 801 234 5678', status: 'cancelled', cost: 0.68, createdAt: '2024-01-13 10:05', userId: '3', userName: 'Ama Owusu' },
  { id: 'ORD-007', service: 'TikTok', serviceEmoji: '🎵', country: 'US', countryFlag: '🇺🇸', number: '+1 (555) 987-6543', status: 'completed', otp: '445512', cost: 0.61, createdAt: '2024-01-12 08:30', userId: '4', userName: 'Kwame Asante' },
  { id: 'ORD-008', service: 'Netflix', serviceEmoji: '🎬', country: 'CA', countryFlag: '🇨🇦', number: '+1 (416) 555-0198', status: 'expired', cost: 0.75, createdAt: '2024-01-11 21:15', userId: '4', userName: 'Kwame Asante' },
  { id: 'ORD-009', service: 'Binance', serviceEmoji: '₿', country: 'GH', countryFlag: '🇬🇭', number: '+233 24 567 8901', status: 'completed', otp: '983421', cost: 0.70, createdAt: '2024-01-11 13:00', userId: '2', userName: 'John Mensah' },
  { id: 'ORD-010', service: 'PayPal', serviceEmoji: '💳', country: 'US', countryFlag: '🇺🇸', number: '+1 (555) 111-2233', status: 'completed', otp: '776654', cost: 0.65, createdAt: '2024-01-10 17:40', userId: '5', userName: 'Efua Darko' },
];

export interface Transaction {
  id: string;
  type: 'deposit' | 'debit' | 'refund';
  method: string;
  amount: number;
  status: 'success' | 'pending' | 'failed';
  date: string;
  reference?: string;
}

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'TXN-001', type: 'deposit', method: 'Paystack', amount: 20.00, status: 'success', date: '2024-01-15 12:00', reference: 'PSK_20240115_001' },
  { id: 'TXN-002', type: 'debit', method: 'OTP Purchase (WhatsApp)', amount: -0.60, status: 'success', date: '2024-01-15 14:32', reference: 'ORD-001' },
  { id: 'TXN-003', type: 'debit', method: 'OTP Purchase (Telegram)', amount: -0.38, status: 'success', date: '2024-01-15 15:10', reference: 'ORD-002' },
  { id: 'TXN-004', type: 'deposit', method: 'Mobile Money (MTN)', amount: 10.00, status: 'success', date: '2024-01-14 08:00', reference: 'MM_20240114_001' },
  { id: 'TXN-005', type: 'debit', method: 'OTP Purchase (Google)', amount: -0.92, status: 'success', date: '2024-01-14 09:20', reference: 'ORD-003' },
  { id: 'TXN-006', type: 'refund', method: 'Refund (Discord cancelled)', amount: 0.68, status: 'success', date: '2024-01-13 10:30', reference: 'REF-ORD-006' },
  { id: 'TXN-007', type: 'deposit', method: 'Paystack', amount: 5.00, status: 'pending', date: '2024-01-12 20:00', reference: 'PSK_20240112_002' },
];

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  status: 'active' | 'suspended';
  totalOrders: number;
  totalSpent: number;
  joinedAt: string;
}

export const ADMIN_USERS: AdminUser[] = [
  { id: '2', name: 'John Mensah', email: 'john@example.com', phone: '+233 50 123 4567', balance: 25.50, status: 'active', totalOrders: 47, totalSpent: 32.40, joinedAt: '2024-01-10' },
  { id: '3', name: 'Ama Owusu', email: 'ama@example.com', phone: '+233 24 987 6543', balance: 12.80, status: 'active', totalOrders: 23, totalSpent: 18.60, joinedAt: '2024-01-08' },
  { id: '4', name: 'Kwame Asante', email: 'kwame@example.com', phone: '+233 57 765 4321', balance: 5.20, status: 'active', totalOrders: 15, totalSpent: 9.75, joinedAt: '2024-01-05' },
  { id: '5', name: 'Efua Darko', email: 'efua@example.com', phone: '+233 20 111 2222', balance: 0.00, status: 'suspended', totalOrders: 8, totalSpent: 5.20, joinedAt: '2023-12-28' },
  { id: '6', name: 'Kofi Boateng', email: 'kofi@example.com', phone: '+233 55 333 4444', balance: 50.00, status: 'active', totalOrders: 102, totalSpent: 78.50, joinedAt: '2023-12-01' },
  { id: '7', name: 'Abena Sarpong', email: 'abena@example.com', phone: '+233 24 555 6666', balance: 8.30, status: 'active', totalOrders: 31, totalSpent: 22.10, joinedAt: '2024-01-12' },
];

export const REVENUE_DATA = [
  { month: 'Jul', revenue: 1240, orders: 48, profit: 310 },
  { month: 'Aug', revenue: 1820, orders: 72, profit: 455 },
  { month: 'Sep', revenue: 1650, orders: 60, profit: 413 },
  { month: 'Oct', revenue: 2380, orders: 88, profit: 595 },
  { month: 'Nov', revenue: 2910, orders: 112, profit: 728 },
  { month: 'Dec', revenue: 3480, orders: 128, profit: 870 },
  { month: 'Jan', revenue: 3120, orders: 116, profit: 780 },
];

export const DAILY_ORDERS = [
  { day: 'Mon', orders: 24, revenue: 18.40 },
  { day: 'Tue', orders: 38, revenue: 29.60 },
  { day: 'Wed', orders: 29, revenue: 22.10 },
  { day: 'Thu', orders: 45, revenue: 35.30 },
  { day: 'Fri', orders: 52, revenue: 41.80 },
  { day: 'Sat', orders: 18, revenue: 13.50 },
  { day: 'Sun', orders: 12, revenue: 9.20 },
];

export const SERVICE_BREAKDOWN = [
  { name: 'WhatsApp', value: 34, color: '#25D366' },
  { name: 'Telegram', value: 22, color: '#0088CC' },
  { name: 'Google', value: 18, color: '#4285F4' },
  { name: 'Facebook', value: 12, color: '#1877F2' },
  { name: 'Others', value: 14, color: '#94A3B8' },
];

export const PRICING_OVERRIDES: { serviceId: string; countryCode: string; markupType: 'percent' | 'fixed'; markupValue: number }[] = [
  { serviceId: 'whatsapp', countryCode: 'US', markupType: 'percent', markupValue: 20 },
  { serviceId: 'telegram', countryCode: 'RU', markupType: 'fixed', markupValue: 0.05 },
  { serviceId: 'binance', countryCode: 'GH', markupType: 'percent', markupValue: 40 },
];
