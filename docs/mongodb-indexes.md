# VireSend MongoDB Indexes

This document describes the indexes created by `scripts/create_mongodb_indexes.py`.

The script is idempotent: it creates missing indexes, skips equivalent existing indexes, does not drop indexes, and does not modify documents.

## Important Warning

Do not over-index every field. Indexes speed reads, filters, sorts, joins, and unique checks, but they also make inserts and updates slower and use storage. These indexes are based on the app's current query patterns across auth, wallet, notifications, SMS, email, OTP, admin, support, marketplace, API, and SMS-MAN modules.

## Collections And Reasons

### users
- `email` unique/sparse: login, registration duplicate checks, local auth.
- `google_id`, `github_id` unique/sparse: OAuth account lookups.
- `reset_token_hash`, `verification_code_expires_at`: password reset and verification flows.
- `role`, `account_status + role`, `created_at`: admin filtering and reporting.
- text index on `email/full_name/name`: admin user search.

### wallet_transactions
- `user_id + created_at`: user wallet history.
- `user_id + type + created_at`: type filters.
- `user_id + status + created_at`: pending/completed checks.
- `reference` unique/sparse: payment verification and callback lookup.
- `status + created_at`, `created_at`: admin billing views.

### notifications
- `notification_id` unique/sparse: notification read/delete lookup.
- `user_id + status + created_at`: unread/read notification list.
- `user_id + type + created_at`, `user_id + category + created_at`: notification filters.
- `created_at`: newest-first maintenance/listing.

### SMS-MAN Data
- `smsman_countries`: provider country identity, active A-Z lists, code lookups, text country search.
- `smsman_services`: provider service identity, active A-Z lists, service code lookups, popular sorting, text service search.
- `smsman_pricing_rules`: global and country-service override lookups.
- `smsman_price_cache`: one cache document per service, expiry checks, future country-split compatibility.
- `smsman_prices`: legacy/imported price upsert and lookup compatibility.
- `smsman_service_cleanup_candidates`: cleanup report upsert and priority/action filters.

### otp_orders
- `user_id + created_at`: user OTP history.
- `user_id + status + expires_at`: active user OTP numbers.
- `user_id + provider + created_at`: provider-specific history.
- `status + expires_at + created_at`: admin active/expired order filters.
- `phone_number`: admin order search.
- `service_id + country_id + created_at`: reporting by service/country.
- `expires_at`, `created_at`: expiry scans and newest-first admin lists.

### Email
- `email_accounts`: account id, user/provider/email uniqueness, default account, connected/default sender lookup, worker polling.
- `email_logs`: email id, user/status/date listing, campaign logs, recipient search, provider/RFC message lookup.
- `email_campaigns`: user/date and status filters.
- `email_copy_paste_drafts`: draft id and user recent drafts.
- `email_send_jobs`: job id, user history, worker pending-job scans.
- `email_send_queue`: queue id, job/status scans, pending queue scans, recipient diagnostics.

### SMS
- `sms_logs`: sms id, user/status/date listing, campaign logs, recipient search, provider callback lookup, admin/abuse filters.
- `sms_campaigns`: user campaign listing and admin status filters.
- `sms_sender_ids`: unique sender id per user and recent sender id listing.

### Contacts And Templates
- `contacts`: user listing, unique user phone, email lookup, group aggregation/filtering, list compatibility, marketplace traceability.
- `contact_lists`: compatibility indexes for list pages if enabled.
- `message_templates`: template id, user type/category/status filters, name lookup, admin filters.
- `templates`: compatibility indexes if this legacy collection is used.

### API
- `api_keys`: API key hash authentication, user key listing, status filters, key prefix usage joins.
- `api_request_logs`: user request history, status/date stats, key-prefix usage, admin revenue/status filters.

### Settings And Controls
- `provider_settings`: provider identity and active filters.
- `platform_settings`: lookup by settings key.
- `payment_settings`: payment provider settings lookup.
- `system_settings`: generic settings key lookup.
- `service_controls`: service availability lookup and admin listing.

### Support, Abuse, Analytics, Marketplace
- `complaints`: ticket id, user ticket list, admin status list, unread badge, priority/type filters.
- `admin_activity_logs`: action/date, target user history, admin audit history.
- `abuse_events`, `abuse_logs`, `abuse_settings`: abuse queue, user trend, module/severity reports, compatibility logs.
- `contact_packages`, `marketplace_contacts`, `contact_package_purchases`: marketplace package identity, slug, category, package contacts, purchases.
- `embed_widgets`, `embed_widget_logs`: widget identity, user/admin listings, widget logs.
- `cookie_analytics`, `analytics_rate_limits`: analytics reports and rate-limit TTL cleanup.
- `ai_usage_logs`: user AI history, provider/model reports, request diagnostics.

## Run Command

```bash
python scripts/create_mongodb_indexes.py
```
