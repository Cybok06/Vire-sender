import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Mail, MessageSquareText, Phone, WandSparkles } from 'lucide-react';
import { emailCostLabel, formatMoney, plainTextFromHtml } from './assistantUi.js';

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      {children}
    </section>
  );
}

function Field({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,110px)_1fr] gap-3 text-sm">
      <div className="text-slate-500">{label}</div>
      <div className={`min-w-0 break-words text-slate-900 ${strong ? 'font-semibold' : ''}`}>{value}</div>
    </div>
  );
}

function Warning({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{message}</div>
    </div>
  );
}

function CardShell({
  icon,
  title,
  badge,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">{icon}</div>
          <div>
            <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          </div>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">{badge}</span>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

export function SmsCampaignPreviewCard({ preview }: { preview: Record<string, any> }) {
  const recipientType = preview.recipient_type === 'direct_phone_numbers' ? 'Direct Number' : preview.recipient_type === 'mixed' ? 'Group and Direct Numbers' : 'Contact Group';
  const recipientSummary = preview.recipient_phone || (preview.valid_recipient_count === 1 ? (preview.direct_phone_numbers || [])[0] : `${preview.valid_recipient_count} recipients`);
  return (
    <CardShell icon={<MessageSquareText className="h-5 w-5" />} title="SMS Campaign Preview" badge="Ready for Review">
      <Section label="Recipients">
        {preview.recipient_type === 'contact_group' || preview.recipient_type === 'mixed' ? <Field label="Group" value={preview.contact_group_name || 'Not selected'} strong /> : null}
        {preview.recipient_type !== 'contact_group' ? <Field label="Recipient" value={recipientSummary} strong /> : null}
        <Field label="Type" value={recipientType} />
        <Field label="Valid" value={preview.valid_recipient_count || 0} strong />
        {(preview.invalid_recipient_count || 0) > 0 ? <Field label="Invalid" value={preview.invalid_recipient_count} /> : null}
        {(preview.duplicate_recipient_count || 0) > 0 ? <Field label="Duplicates" value={`${preview.duplicate_recipient_count} removed`} /> : null}
      </Section>
      <Section label="Message">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-slate-800">{preview.message}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm"><div className="text-xs text-slate-500">Characters</div><div className="font-semibold text-slate-900">{preview.character_count || 0}</div></div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm"><div className="text-xs text-slate-500">Segments</div><div className="font-semibold text-slate-900">{preview.segments_per_recipient || 1}</div></div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm col-span-2 sm:col-span-1"><div className="text-xs text-slate-500">Billable Units</div><div className="font-semibold text-slate-900">{preview.total_billable_segments || 0}</div></div>
        </div>
      </Section>
      <Section label="Sender">
        <Field label="Sender ID" value={preview.sender_id || 'Select Sender ID'} strong />
        <Field label="SMS Service" value="Ready" />
      </Section>
      <Section label="Cost">
        <Field label="Required" value={`${Number(preview.estimated_cost || 0).toLocaleString()} SMS credits`} strong />
        <Field label="SMS balance" value={Number(preview.sms_balance ?? preview.wallet_balance ?? 0).toLocaleString()} strong />
        <Field label="Remaining" value={`${Number(preview.expected_balance || 0).toLocaleString()} SMS credits`} strong />
      </Section>
      <Section label="Schedule">
        <Field label="Delivery" value="Send now" />
      </Section>
      <Warning message={preview.warning} />
    </CardShell>
  );
}

export function EmailCampaignPreviewCard({ preview }: { preview: Record<string, any> }) {
  return (
    <CardShell icon={<Mail className="h-5 w-5" />} title="Email Campaign Preview" badge="Ready for Review">
      <Section label="Recipients">
        {Array.isArray(preview.recipient_emails) && preview.recipient_emails.length ? (
          <Field label={preview.recipient_emails.length > 1 ? 'Emails' : 'Email'} value={preview.recipient_emails.join(', ')} strong />
        ) : <Field label="Group" value={preview.contact_group_name || 'Not selected'} strong />}
        <Field label="Valid" value={preview.valid_recipient_count || 0} strong />
        {(preview.invalid_recipient_count || 0) > 0 ? <Field label="Invalid" value={preview.invalid_recipient_count} /> : null}
      </Section>
      <Section label="Sending">
        <Field label="Account" value={preview.sending_account_email || 'Select Email Account'} strong />
        <Field label="Subject" value={preview.subject || 'Untitled'} strong />
      </Section>
      <Section label="Message">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-slate-800">{plainTextFromHtml(preview.message)}</div>
      </Section>
      <Section label="Cost">
        <Field label="Estimated" value={emailCostLabel(preview)} strong />
        {Number(preview.estimated_cost || 0) > 0 ? <Field label="Wallet" value={formatMoney(preview.wallet_balance)} strong /> : null}
      </Section>
      <Section label="Schedule">
        <Field label="Delivery" value="Send now" />
      </Section>
      <Warning message={preview.warning} />
    </CardShell>
  );
}

export function MessageDraftCard({ draft, onAction }: { draft: Record<string, any>; onAction: (action: string, prompt?: string) => void }) {
  const options = Array.isArray(draft.options) && draft.options.length ? draft.options : [{ label: 'Draft', body: draft.body }];
  return (
    <CardShell icon={<WandSparkles className="h-5 w-5" />} title="Message Draft" badge="Not Sent">
      <Section label="Details">
        <Field label="Type" value={draft.category || 'Message'} strong />
        <Field label="Tone" value={draft.tone || 'Natural'} />
        {draft.channel ? <Field label="Format" value={String(draft.channel).toUpperCase()} /> : null}
        {draft.subject ? <Field label="Subject" value={draft.subject} strong /> : null}
      </Section>
      <Section label={options.length > 1 ? 'Options' : 'Message'}>
        <div className="space-y-3">
          {options.map((option: any, index: number) => (
            <div key={`${option.label}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              {options.length > 1 ? <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">{option.label || `Option ${index + 1}`}</div> : null}
              <div className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{option.body}</div>
              <button type="button" onClick={() => navigator.clipboard?.writeText(option.body || '')} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700"><Copy className="h-3.5 w-3.5" /> Copy</button>
            </div>
          ))}
        </div>
        <div className="text-xs text-slate-500">{draft.character_count || String(draft.body || '').length} characters{draft.sms_segments ? ` • ${draft.sms_segments} SMS segment${draft.sms_segments === 1 ? '' : 's'}` : ''}</div>
      </Section>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onAction('refine', 'Make it shorter.')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Make shorter</button>
        <button onClick={() => onAction('refine', 'Make it friendlier.')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Make friendlier</button>
        <button onClick={() => onAction('refine', 'Make it more professional.')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Professional</button>
        <button onClick={() => onAction('refine', 'Give me another version.')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Another version</button>
        <button onClick={() => onAction('refine', 'Make it suitable for SMS.')} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">Use for SMS</button>
        <button onClick={() => onAction('refine', 'Turn it into an email and add a subject line.')} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">Use for email</button>
        <button onClick={() => onAction('edit')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Edit</button>
        <button onClick={() => onAction('prepare')} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white">Prepare to send</button>
      </div>
    </CardShell>
  );
}

export function AiResultCard({ data }: { data: Record<string, any> }) {
  if (data.kind === 'error') {
    return (
      <div className="w-full rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          <div className="text-base font-semibold">{data.title || 'Unable to Complete Request'}</div>
        </div>
        <p className="mt-3 leading-6">{data.message}</p>
      </div>
    );
  }
  if (data.kind !== 'campaign_result') return null;
  return (
    <div className="w-full rounded-[24px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5" />
        <div className="text-base font-semibold">{data.title || 'Completed'}</div>
      </div>
      <div className="mt-4 space-y-2">
        {data.channel === 'sms' ? (
          <>
            {data.recipient ? <Field label="Recipient" value={data.recipient} strong /> : <Field label="Recipients" value={data.recipients || 0} strong />}
            <Field label="Sender ID" value={data.sender_id || '-'} />
            {data.amount_charged != null ? <Field label="Amount Charged" value={formatMoney(data.amount_charged)} strong /> : null}
            <Field label="Status" value="Submitted" />
          </>
        ) : (
          <>
            <Field label="Group" value={data.group || '-'} strong />
            <Field label="Recipients" value={data.recipients || 0} strong />
            <Field label="Account" value={data.sending_account || '-'} />
          </>
        )}
      </div>
    </div>
  );
}

export function DiscoveryTooltip({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <div
      className="fixed bottom-24 right-4 z-[69] max-w-[280px] rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-left shadow-[0_18px_40px_rgba(15,23,42,0.18)] motion-reduce:transition-none"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Phone className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpen} className="text-left">
            <div className="text-sm font-semibold text-slate-950">Hey! I can help you send emails and SMS.</div>
          </button>
          <div className="mt-1 text-xs leading-5 text-slate-600">Tell me who you want to contact.</div>
        </div>
        <button type="button" onClick={onDismiss} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Dismiss VireSend AI tip">
          <span className="block h-4 w-4 text-center leading-4">×</span>
        </button>
      </div>
    </div>
  );
}
