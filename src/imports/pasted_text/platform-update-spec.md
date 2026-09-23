Update the EXISTING VireOTP-style platform into a complete communication platform with:

1. OTP / Virtual Numbers
2. SMS Sending via Arkesel
3. Bulk SMS Campaigns
4. Email Sending
5. Bulk Email Campaigns
6. Developer SMS API Access

IMPORTANT:
This is NOT a new app.
Do NOT redesign the whole system.
Extend the existing dashboard and admin system professionally.

The platform must now support BOTH:
- Normal users
- Developers using API integration on third-party systems

The design should feel like:
Twilio + SMS-MAN + Mailchimp in one clean SaaS platform.

==================================================
GLOBAL DESIGN RULES
==================================================

- Keep existing blue and white SaaS theme
- Blue sidebar navigation
- White content area
- Rounded cards
- Soft shadows
- Clean responsive tables
- Mobile-first responsive design
- Professional dashboard feel
- Use tabs/modals where needed
- Use icons instead of emojis

==================================================
USER SIDE UPDATES
==================================================

==================================================
1. USER SIDEBAR UPDATE
==================================================

Sidebar menu items:

- Dashboard
- OTP & Numbers
- Send SMS
- SMS Campaigns
- Email Sender
- Email Campaigns
- Contacts
- Templates
- API Access
- Logs
- Wallet
- Settings

==================================================
2. USER DASHBOARD UPDATE
==================================================

Dashboard must now show:

Top summary cards:
- Wallet Balance
- OTP Orders
- SMS Sent
- Emails Sent
- Active Campaigns
- API Requests

Add analytics section:
- SMS delivery rate
- Email success rate
- OTP success rate

Add quick actions:
- Buy Number
- Send SMS
- Send Email
- Create Campaign
- Generate API Key

Add Recent Activity table:
- OTP purchases
- SMS sends
- Email sends
- API requests

==================================================
3. SEND SMS PAGE
==================================================

Tabs:
- Single SMS
- Bulk SMS

Single SMS:
- Phone number input
- Sender ID dropdown
- Message textarea
- Character counter
- SMS parts counter
- Cost preview
- Send button

Bulk SMS:
- Upload CSV
- Manual number input
- Select contact group
- Duplicate removal
- Recipient count
- Estimated total cost
- Send button

Add:
- Delivery status preview
- Progress bar during sending

==================================================
4. SMS CAMPAIGNS PAGE
==================================================

Features:
- Create campaign
- Schedule campaign
- Campaign analytics

Campaign cards/table:
- Campaign name
- Total recipients
- Sent
- Delivered
- Failed
- Status
- Cost

Actions:
- Pause
- Resume
- Cancel
- Export report

==================================================
5. EMAIL SENDER PAGE
==================================================

Tabs:
- Single Email
- Bulk Email

Single Email:
- Connected email selector
- To email
- Subject
- Message editor
- HTML mode toggle
- HTML preview button

Bulk Email:
- Upload contacts CSV
- Select contact group
- Schedule send
- HTML template support

Features:
- Gmail connection
- SMTP connection
- HTML preview modal
- Desktop/mobile preview tabs

==================================================
6. EMAIL CAMPAIGNS PAGE
==================================================

Campaign table:
- Campaign name
- Recipients
- Sent
- Failed
- Scheduled
- Status

Actions:
- Pause
- Resume
- Cancel
- View HTML preview

==================================================
7. CONTACTS PAGE
==================================================

Features:
- Add contact
- Import CSV
- Create groups

Table:
- Name
- Phone
- Email
- Group

==================================================
8. TEMPLATES PAGE
==================================================

SMS Templates:
- Variables support:
  {{name}}
  {{code}}

Email Templates:
- HTML support
- Preview support

Actions:
- Edit
- Delete
- Use template

==================================================
9. API ACCESS PAGE (VERY IMPORTANT)
==================================================

This is for developers using the SMS API on third-party systems.

Page title:
"Developer API"

Top cards:
- API Requests Today
- Successful Requests
- Failed Requests
- API Balance Usage

Sections:

==================================================
A. API KEY MANAGEMENT
==================================================

Features:
- Generate API key
- Regenerate API key
- Copy API key
- Revoke API key

Show:
- API status
- Last used
- Total requests

Important:
API key must be masked by default.
Use show/hide toggle.

==================================================
B. API DOCUMENTATION PREVIEW
==================================================

Show example endpoints:

POST /api/send-sms

Example request:
{
  "api_key": "xxxxxxxx",
  "to": "+233xxxxxxxxx",
  "message": "Hello world"
}

Example response:
{
  "success": true,
  "message_id": "SMS12345"
}

Add:
- Copy code button
- Tabs:
  - cURL
  - Python
  - JavaScript
  - PHP

==================================================
C. WEBHOOKS SECTION
==================================================

Fields:
- Callback URL
- Delivery webhook URL

Show:
- Delivery updates
- Failed callbacks

==================================================
D. API ANALYTICS
==================================================

Charts:
- Requests per day
- Success rate
- Failed requests
- SMS usage trend

==================================================
E. API LOGS TABLE
==================================================

Columns:
- Request ID
- Endpoint
- Recipient
- Status
- Response code
- Cost
- Date

Filters:
- Status
- Date
- Endpoint

==================================================
10. LOGS PAGE
==================================================

Unified logs for:
- OTP
- SMS
- Email
- API requests

Columns:
- Type
- Recipient
- Status
- Provider
- Cost
- Date

==================================================
11. WALLET PAGE
==================================================

Show:
- Current balance
- Spending breakdown:
  - OTP
  - SMS
  - Email
  - API

Add:
- Deposit button
- Transaction history
- Usage analytics

==================================================
12. SETTINGS PAGE
==================================================

Sections:
- Profile
- Password
- Connected Emails
- Sender IDs
- API Preferences
- Notifications

==================================================
ADMIN SIDE UPDATES
==================================================

==================================================
13. ADMIN DASHBOARD
==================================================

Add monitoring for:
- OTP
- SMS
- Email
- API traffic

Cards:
- Total API Requests
- API Revenue
- SMS Revenue
- Email Revenue
- OTP Revenue
- Failed API Calls

Charts:
- API request trends
- SMS delivery trends
- Email trends

==================================================
14. API MANAGEMENT PAGE (ADMIN)
==================================================

Admin should monitor developer API usage.

Table:
- User
- API Key
- Requests today
- Success rate
- Failed requests
- Total spent
- Last used

Actions:
- Suspend API access
- Regenerate API key
- Limit request rate
- Block abusive users

==================================================
15. PROVIDER SETTINGS PAGE
==================================================

SMS:
- Arkesel API key
- Sender IDs
- SMS pricing
- SMS markup

Email:
- Gmail OAuth
- SMTP settings

OTP:
- SMS-MAN API key
- Country sync
- Service sync

API:
- API rate limits
- API pricing
- Webhook settings

==================================================
16. BILLING & PROFITS PAGE
==================================================

Track profits separately:
- OTP profit
- SMS profit
- Email profit
- API profit

==================================================
17. ABUSE MONITORING
==================================================

Detect:
- Spam campaigns
- Excessive API usage
- Failed SMS abuse
- Suspicious bulk sending

Actions:
- Suspend user
- Pause campaigns
- Disable API access

==================================================
FINAL GOAL
==================================================

The system should feel like a complete communication platform where users can:

- Buy OTP numbers
- Send SMS
- Run bulk campaigns
- Send Emails
- Connect Gmail/SMTP
- Use API on third-party systems
- Track analytics and delivery
- Manage everything from one dashboard

The platform must feel scalable, modern, professional, and production-ready.