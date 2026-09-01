import { ArrowRight, CheckCircle2, Mail, MessageSquare, ShieldCheck, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import SeoPage from '../components/public/SeoPage';
import {
  aiAssistantPageMeta,
  aiCapabilities,
  aiFaqs,
  buildFaqSchema,
  buildOrganizationGraph,
} from '../marketing/siteContent.js';
import { useAuth } from '../contexts/AuthContext';

function useAiCtas() {
  const { isAuthenticated, user } = useAuth();
  const signedIn = isAuthenticated || Boolean(user);
  return {
    tryAi: signedIn ? '/user/dashboard' : '/login?next=/user/dashboard&intent=ai',
    signup: signedIn ? '/user/dashboard' : '/signup?next=/user/dashboard&intent=ai',
  };
}

export default function AiAssistantLandingPage() {
  const ctas = useAiCtas();
  const schema = buildOrganizationGraph({
    faqSchema: buildFaqSchema(aiFaqs.slice(0, 6)),
    pageUrl: aiAssistantPageMeta.canonical,
  });

  return (
    <div className="w-full max-w-full overflow-x-hidden" style={{ fontFamily: "'Poppins', 'Inter', sans-serif", background: '#F8FAFC' }}>
      <SeoPage config={{ ...aiAssistantPageMeta, schema }} />
      <main>
        <section className="relative overflow-hidden bg-slate-950 px-5 py-20 text-white md:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-cyan-200">
              <img src="/images/viresend_ai.png" alt="" className="h-5 w-5 rounded object-contain" />
              VireSend AI
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-tight md:text-6xl">Send SMS and Email Through Conversation</h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
              Tell VireSend AI your audience and communication goal. It prepares the campaign, validates the details and waits for your confirmation.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={ctas.tryAi} className="rounded-2xl bg-blue-600 px-6 py-4 text-center text-sm font-bold text-white">
                Try VireSend AI
              </Link>
              <Link to={ctas.signup} className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-sm font-bold text-white">
                Create an Account
              </Link>
            </div>
          </div>
        </section>

        <section className="px-5 py-16 md:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-[32px] border border-slate-200 bg-white p-7 shadow-sm">
                <h2 className="text-3xl font-black tracking-tight text-slate-950">How VireSend AI Works</h2>
                <div className="mt-6 grid gap-3">
                  {[
                    'Give an instruction',
                    'Review the generated campaign',
                    'Confirm and send',
                    'Track the results',
                  ].map((step, index) => (
                    <div key={step} className="flex items-center gap-4 rounded-2xl bg-slate-50 px-4 py-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">{index + 1}</div>
                      <div className="text-sm font-semibold text-slate-800">{step}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-7 shadow-sm">
                <h2 className="text-3xl font-black tracking-tight text-slate-950">Example prompts</h2>
                <div className="mt-6 grid gap-3">
                  {[
                    'Send a birthday SMS to 0530393625.',
                    'Send a holiday email to the Premium Users group.',
                    'Write a promotional SMS for my customers.',
                    'Tell the Workers group that tomorrow’s meeting starts at 8 AM.',
                  ].map((prompt) => (
                    <div key={prompt} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800">
                      {prompt}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 md:pb-24">
          <div className="mx-auto max-w-6xl rounded-[36px] bg-slate-950 p-6 text-white md:p-8">
            <h2 className="text-3xl font-black tracking-tight">Review Before You Send</h2>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
              VireSend AI converts a simple request into a structured campaign while VireSender handles recipient validation, Sender ID checks, SMS pricing, wallet verification and message delivery.
            </p>
            <div className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="grid gap-3">
                {[
                  'User instruction',
                  'Contact group or direct number found',
                  'Message generated',
                  'Campaign preview shown',
                  'User confirms',
                  'Campaign result displayed',
                ].map((step) => (
                  <div key={step} className="rounded-2xl bg-white/5 px-4 py-4 text-sm font-semibold text-slate-100">{step}</div>
                ))}
              </div>
              <div className="rounded-[28px] bg-white p-5 text-slate-900">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-blue-700">
                  <img src="/images/viresend_ai.png" alt="" className="h-5 w-5 rounded object-contain" />
                  VireSend AI preview
                </div>
                <div className="rounded-3xl bg-slate-50 p-4 text-sm leading-7">
                  Send a birthday SMS to 0530393625.
                </div>
                <div className="mt-4 grid gap-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Recipients</div>
                    <div className="mt-2 font-bold">1 direct number</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Message</div>
                    <div className="mt-2 text-sm leading-6">Happy birthday! Wishing you a joyful day and a wonderful year ahead.</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      ['Segments', '1'],
                      ['Estimated Cost', 'GHS 0.04'],
                      ['Action', 'Confirm and Send'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-xs text-slate-500">{label}</div>
                        <div className="mt-2 font-bold">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 md:pb-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl font-black tracking-tight text-slate-950">What VireSend AI Can Do</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {aiCapabilities.map((capability) => (
                <div key={capability} className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-800 shadow-sm">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <span>{capability}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 md:pb-24">
          <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-3xl font-black tracking-tight text-slate-950">Built for Business Communication</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { icon: Users, title: 'Contact-group messaging' },
                { icon: Phone, title: 'Direct-number SMS' },
                { icon: Mail, title: 'Email campaigns' },
                { icon: Wallet, title: 'Cost estimation and confirmation' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl bg-slate-50 p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                      <Icon size={20} />
                    </div>
                    <div className="mt-4 text-base font-bold text-slate-900">{item.title}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-8 rounded-[24px] border border-emerald-100 bg-emerald-50 p-5 text-sm leading-7 text-slate-700">
              <div className="flex items-center gap-2 text-base font-bold text-slate-950">
                <ShieldCheck size={18} className="text-emerald-600" />
                Safety and control
              </div>
              <p className="mt-2">
                VireSend AI does not send campaigns without confirmation. Recipient validation, pricing, wallet checks, Sender ID approval and message delivery are handled securely by VireSender.
              </p>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 md:pb-24">
          <div className="mx-auto max-w-6xl rounded-[32px] bg-slate-950 p-8 text-white">
            <h2 className="text-3xl font-black tracking-tight">Frequently Asked Questions</h2>
            <div className="mt-6 grid gap-4">
              {aiFaqs.slice(0, 6).map((faq) => (
                <div key={faq.question} className="rounded-2xl bg-white/5 p-5">
                  <div className="text-base font-bold">{faq.question}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-300">{faq.answer}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-20">
          <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-3xl font-black tracking-tight text-slate-950">Prepare and send after confirmation</h2>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-8 text-slate-600">
              Use VireSend AI to prepare SMS and email campaigns through natural-language conversation, then review recipients, message details and estimated SMS costs before sending.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to={ctas.tryAi} className="rounded-2xl bg-blue-600 px-6 py-4 text-sm font-bold text-white">
                Try VireSend AI
              </Link>
              <Link to={ctas.signup} className="rounded-2xl border border-slate-200 px-6 py-4 text-sm font-bold text-slate-900">
                Create Free Account
              </Link>
              <Link to="/pricing" className="rounded-2xl border border-slate-200 px-6 py-4 text-sm font-bold text-slate-900">
                View Pricing
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm font-semibold text-blue-700">
              <Link to="/services">Bulk SMS</Link>
              <Link to="/services">Email campaigns</Link>
              <Link to="/services">OTP</Link>
              <Link to="/login">Login</Link>
              <Link to="/signup">Signup</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
