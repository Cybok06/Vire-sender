# Users SMS

Admins can open **Messaging → Users SMS** at `/admin/users-sms`.
The summary covers all non-admin customer accounts, including suspended accounts
and customers with zero credits. Searching and pagination only affect the table.

- Available SMS counts active, unexpired credit batches.
- Purchased this month counts credits in successful SMS package purchases from
  the first day of the current Ghana calendar month (UTC).
- Purchased all time counts credits in all successful SMS package purchases.
- Used / sent counts finalized successful or partially accepted sending credits,
  less refunds associated with those sends. Pending sends, manual deductions,
  expiry and manual additions are excluded. This is a count of SMS credits,
  including multipart messages, rather than a delivery confirmation count.

Adjustments require a positive whole number, a reason and a unique request UUID.
Added credits do not expire. Deductions use the earliest-expiring credits first,
then credits without expiry. Every adjustment records its administrator, reason,
allocations and before/after balance in `sms_credit_transactions`, with a matching
`admin_activity_logs` entry. Cash wallet balances are unaffected.

## Database requirement

Adjustments use MongoDB transactions to save balances and audit entries together.
Use MongoDB Atlas or a replica set (a single-node replica set works locally).
A standalone MongoDB server cannot apply adjustments; the endpoint reports this
without modifying balances. No collection migration is required.

The reporting aggregation requires MongoDB 5.0 or newer.

## Verification

Run route validation and authorization tests:

```powershell
python -m unittest discover -s backend/tests -p test_admin_sms.py -v
```

To also run database integration tests, point the following variable at an
isolated test replica set, never a production database:

```powershell
$env:SMS_TEST_MONGO_URI = 'mongodb://127.0.0.1:27028/?replicaSet=smsTest'
python -m unittest discover -s backend/tests -p test_admin_sms.py -v
```

Integration tests create and remove a uniquely named `viresend_sms_test_*`
database. They verify report totals, month boundaries, refunds, expiry ordering,
pagination, idempotency, concurrent sending and transaction rollback.
