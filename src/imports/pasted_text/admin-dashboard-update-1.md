Update the EXISTING admin dashboard of the current app.

IMPORTANT:
This is NOT a new app.
Do NOT redesign the whole interface.
Extend the existing admin side to capture the new modules:
- OTP / Virtual Number system
- SMS Sending via Arkesel
- Email Sending via Gmail OAuth and SMTP
- Campaigns
- Contacts
- Templates
- Logs
- Billing / wallet usage

Keep the current blue and white dashboard style, sidebar layout, rounded cards, clean tables, and responsive design.

==================================================
ADMIN SIDEBAR UPDATE
==================================================

Add or update admin sidebar menu items:

1. Admin Dashboard
2. Users
3. OTP Orders
4. SMS Management
5. Email Management
6. Campaigns
7. Contacts
8. Templates
9. Message Logs
10. Wallet & Billing
11. Provider Settings
12. Reports & Analytics
13. System Settings

Do not remove existing OTP-related pages. Add SMS and Email modules beside them.

==================================================
1. ADMIN DASHBOARD PAGE
==================================================

Update admin dashboard so it represents the full platform, not only OTP.

Top summary cards:
- Total Users
- Wallet Balance Held
- OTP Orders
- SMS Sent
- Emails Sent
- Total Revenue
- Total Profit
- Failed Deliveries

Add quick analytics cards:
- OTP success rate
- SMS delivery rate
- Email success rate
- Active campaigns

Add charts:
- Revenue trend
- SMS vs Email vs OTP usage
- Failed vs successful deliveries

Add Recent Activity table:
Columns:
- Type: OTP / SMS / Email
- User
- Action
- Status
- Amount / Cost
- Date

==================================================
2. USERS MANAGEMENT PAGE
==================================================

Update users page to include messaging usage.

Table columns:
- User name
- Email
- Phone
- Wallet balance
- OTP orders count
- SMS sent count
- Emails sent count
- Account status
- Date joined

Actions:
- View user
- Add wallet balance
- Deduct wallet balance
- Suspend user
- View user activity
- View user logs

User details modal/page should show:
- Wallet summary
- OTP history
- SMS usage
- Email usage
- Campaigns created
- Connected email accounts
- Recent transactions

==================================================
3. OTP ORDERS MANAGEMENT PAGE
==================================================

Keep existing OTP order management but make it consistent.

Table columns:
- Order ID
- User
- Service
- Country
- Number
- OTP status
- Cost
- Profit
- Date

Filters:
- User
- Service
- Country
- Status
- Date

Actions:
- View details
- Refund
- Cancel
- Mark completed if needed

==================================================
4. SMS MANAGEMENT PAGE
==================================================

Create admin page for monitoring all SMS sent by users.

Top cards:
- Total SMS Sent
- Delivered SMS
- Failed SMS
- Pending SMS
- SMS Revenue
- SMS Cost
- SMS Profit

Table columns:
- SMS ID
- User
- Recipient number
- Sender ID
- Message preview
- Type: Single / Bulk / Campaign
- Status: Pending / Sent / Delivered / Failed
- Cost
- Date

Filters:
- User
- Status
- Sender ID
- Date
- Type

Actions:
- View full message
- Retry failed SMS
- Refund SMS
- Export logs

==================================================
5. BULK SMS / SMS CAMPAIGNS ADMIN PAGE
==================================================

Create campaign monitoring page for SMS campaigns.

Cards:
- Total campaigns
- Running campaigns
- Completed campaigns
- Failed campaigns

Campaign table:
- Campaign name
- User
- Total recipients
- Sent
- Delivered
- Failed
- Estimated cost
- Actual cost
- Status
- Created date

Actions:
- View campaign
- Pause campaign
- Resume campaign
- Cancel campaign
- Export report

==================================================
6. EMAIL MANAGEMENT PAGE
==================================================

Create admin page for email sender monitoring.

Top cards:
- Total Emails Sent
- Successful Emails
- Failed Emails
- Connected Gmail Accounts
- Connected SMTP Accounts

Table columns:
- Email ID
- User
- From email
- To email
- Subject
- Type: Single / Bulk / Campaign
- Provider: Gmail / SMTP
- Status: Sent / Failed / Scheduled
- Date

Filters:
- User
- Provider
- Status
- Date
- Type

Actions:
- View email
- View HTML preview
- Retry failed email
- Export logs

==================================================
7. EMAIL ACCOUNTS ADMIN PAGE
==================================================

Admin should see connected email accounts.

Table columns:
- User
- Email address
- Provider: Gmail / SMTP
- Status: Connected / Error / Revoked
- Last used
- Date connected

Actions:
- View details
- Disable account
- Remove account
- Check connection status

Important:
Do not show private passwords directly.
For SMTP password, show masked field only.

==================================================
8. EMAIL CAMPAIGNS ADMIN PAGE
==================================================

Admin should monitor bulk email campaigns.

Campaign table:
- Campaign name
- User
- From account
- Total recipients
- Sent
- Failed
- Opened optional
- Scheduled time
- Status
- Created date

Actions:
- View campaign
- Pause
- Cancel
- Export report
- View HTML preview

==================================================
9. CONTACTS MANAGEMENT PAGE
==================================================

Admin should monitor user contacts and groups.

Top cards:
- Total contacts
- Total groups
- CSV imports

Table columns:
- User
- Contact name
- Phone
- Email
- Group
- Date added

Filters:
- User
- Group
- Date

Actions:
- View contact
- Delete suspicious contact if needed
- Export

==================================================
10. TEMPLATES MANAGEMENT PAGE
==================================================

Admin should see SMS and Email templates created by users.

Table columns:
- Template name
- User
- Type: SMS / Email
- Preview
- Created date

Actions:
- View
- Edit if admin has permission
- Disable template
- Delete abusive template

Email template view must support:
- HTML preview button
- Desktop preview
- Mobile preview

==================================================
11. MESSAGE LOGS PAGE
==================================================

Create one unified log page for OTP, SMS, and Email.

Table columns:
- Log ID
- Type: OTP / SMS / Email
- User
- Recipient / Number
- Message preview
- Provider
- Status
- Cost
- Date

Filters:
- Type
- Status
- User
- Provider
- Date

Status badges:
- Delivered: green
- Sent: blue
- Pending: yellow
- Failed: red
- Refunded: gray

==================================================
12. WALLET & BILLING ADMIN PAGE
==================================================

Admin should track money usage across OTP, SMS, and Email.

Top cards:
- Total deposits
- Total spending
- OTP revenue
- SMS revenue
- Email revenue
- Total profit

Transaction table:
- Transaction ID
- User
- Type: Deposit / OTP Purchase / SMS Send / Email Send / Refund
- Amount
- Balance before
- Balance after
- Date

Actions:
- Add balance
- Deduct balance
- Refund transaction
- Export report

==================================================
13. PROVIDER SETTINGS PAGE
==================================================

Admin manages external integrations here.

Sections:

A. SMS Provider Settings
- Arkesel API key
- Default Sender ID
- Test SMS connection button
- SMS price per unit
- Admin markup
- Delivery callback URL display

B. Email Provider Settings
- Gmail OAuth status
- Google Client ID
- Google Client Secret masked
- Redirect URL display
- SMTP test settings
- Default system email

C. OTP Provider Settings
- SMS-MAN API key
- Test connection
- Sync services
- Sync countries
- Markup settings

Important:
All sensitive keys must be masked.
Use “show/hide” icon.

==================================================
14. REPORTS & ANALYTICS PAGE
==================================================

Admin should see platform-wide reports.

Charts:
- Daily revenue
- OTP orders by country
- SMS delivery rate
- Email sending trend
- Top users by spending
- Failed messages by provider

Export buttons:
- Export CSV
- Export PDF

==================================================
15. ABUSE / COMPLIANCE MONITORING
==================================================

Add admin monitoring section or page.

Show:
- High-volume users
- Repeated failed SMS
- Suspicious bulk campaigns
- Blocked keywords
- Suspended accounts

Actions:
- Suspend user
- Pause campaign
- Review message content
- Add blocked keyword

==================================================
DESIGN RULES
==================================================

- Match existing admin dashboard style
- Blue and white theme
- Rounded cards
- Clean tables
- Professional SaaS dashboard feel
- Mobile responsive
- Use icons, not emojis
- Do not overcrowd pages
- Use tabs where needed
- Use modals for details and previews
- Keep admin interface powerful but organized

==================================================
FINAL GOAL
==================================================

The admin side must clearly control and monitor the full platform:

1. OTP number purchases
2. SMS sending through Arkesel
3. Bulk SMS campaigns
4. Email sending through Gmail and SMTP
5. Email campaigns
6. Contacts and templates
7. Wallet billing
8. Provider settings
9. Reports and abuse monitoring

Make the admin panel feel like a professional communication SaaS control center, not only an OTP dashboard.