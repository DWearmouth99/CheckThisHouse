import React from 'react';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';

const LOGO = '/checkthishouselogo.png';

type PrivacySection = {
  title: string;
  paragraphs?: React.ReactNode[];
  items?: string[];
  afterParagraphs?: React.ReactNode[];
};

const sections: PrivacySection[] = [
  {
    title: 'Who We Are',
    paragraphs: [
      'CheckThisHouse (“CheckThisHouse”, “we”, “us” or “our”) provides online property research reports through www.checkthishouse.co.uk (the “Website”).',
      'For UK GDPR purposes, CheckThisHouse is the data controller of personal data processed through the Website and our paid report service.',
      <>
        Contact: {' '}
        <a className="font-semibold text-brand-green underline underline-offset-2" href="mailto:support@checkthishouse.co.uk">
          support@checkthishouse.co.uk
        </a>
        . Correspondence address: Ridgeside, Spennymoor, DL16 7HG.
      </>,
    ],
  },
  {
    title: 'Scope of This Policy',
    paragraphs: [
      'This Privacy Policy explains how we collect, use, store, share and protect personal data when you visit the Website, request a preview, purchase a report, contact us, or otherwise interact with our services.',
      'It should be read together with our Terms & Conditions. If you do not agree with this policy, please do not use the Website or purchase our services.',
    ],
  },
  {
    title: 'Personal Data We Collect',
    paragraphs: ['Depending on how you use the service, we may process:'],
    items: [
      'Property details you submit, such as a listing URL, UK address, postcode or buyer goal',
      'Payment-related information processed by Stripe (for example name, email and card details held by Stripe)',
      'Order and checkout session identifiers needed to verify payment and deliver your report',
      'Technical data such as IP address, browser type, device information, approximate location derived from IP, and pages viewed',
      'Communications you send us, such as support emails',
      'Cookie and advertising measurement data from Google Ads / Google tags where enabled',
    ],
    afterParagraphs: [
      'We do not ask you to create a long-term account to buy a report. Payment details are collected and processed by Stripe; we do not store full card numbers on our servers.',
    ],
  },
  {
    title: 'How We Collect Data',
    paragraphs: ['We collect personal data:'],
    items: [
      'Directly from you when you enter a listing link, address, buyer goal or contact us',
      'Automatically through the Website, server logs, security controls and cookies/tags',
      'From payment providers when you complete checkout',
      'From third-party data sources used to research the property you asked us to analyse (these sources usually contain property/public information rather than your personal identity)',
    ],
  },
  {
    title: 'How We Use Personal Data',
    paragraphs: ['We use personal data to:'],
    items: [
      'Provide previews and generate the property report you requested',
      'Process payments, prevent fraud and verify that a report has been paid for',
      'Deliver digital content and resolve access or technical issues',
      'Operate, secure, maintain and improve the Website and services',
      'Respond to enquiries, complaints and support requests',
      'Measure advertising performance and understand whether ads lead to purchases',
      'Comply with legal obligations and enforce our Terms',
    ],
  },
  {
    title: 'Legal Bases for Processing',
    paragraphs: ['Where UK GDPR applies, we rely on one or more of the following bases:'],
    items: [
      'Contract — to provide the report and related services you purchase or request',
      'Legitimate interests — to secure the Website, prevent abuse, improve services and measure marketing effectiveness in a proportionate way',
      'Consent — where required for non-essential cookies/advertising technologies, or where you choose to provide optional information',
      'Legal obligation — where we must retain or disclose information to meet applicable law',
    ],
  },
  {
    title: 'Cookies, Tags and Advertising Measurement',
    paragraphs: [
      'We use cookies and similar technologies that are necessary for the Website to function, and may use advertising/measurement tags such as the Google tag (gtag.js) linked to our Google Ads account.',
      'These technologies help us understand site visits, measure campaign performance, reduce fraud risk and, where enabled, improve conversion measurement. Google may use cookies or similar identifiers and receive technical event data from our Website.',
      'Where Enhanced Conversions is enabled, Google may receive hashed first-party customer data (such as an email address when available) to improve conversion matching. We configure this only for measurement and advertising optimisation purposes.',
      'You can control cookies through your browser settings. Blocking some cookies may affect Website functionality or measurement accuracy. For more information about Google advertising, see Google’s privacy materials and ad settings.',
    ],
  },
  {
    title: 'Payments',
    paragraphs: [
      'Payments are processed by Stripe. When you pay, Stripe collects and processes payment information under its own terms and privacy policy.',
      'We receive limited payment status information (such as whether checkout succeeded and a session identifier) so we can unlock and generate your report. We do not receive or store your full card number.',
    ],
  },
  {
    title: 'Property Research and Third-Party Sources',
    paragraphs: [
      'To produce a report, we may send the property address, listing URL or related research queries to service providers and public sources. This can include AI providers, address-lookup providers, planning portals and other publicly available property or area datasets.',
      'Those sources are used to research the property you identified. Please only submit information you are authorised to use for that purpose.',
    ],
  },
  {
    title: 'Who We Share Data With',
    paragraphs: ['We may share personal data with:'],
    items: [
      'Stripe — payment processing',
      'Google — advertising tags, conversion measurement and related analytics tools we enable',
      'Hosting and infrastructure providers that operate our Website and servers',
      'AI and research providers used to generate or enrich reports',
      'Address and property-data providers used for lookup or research features',
      'Professional advisers or authorities where required by law or to protect our legal rights',
    ],
    afterParagraphs: [
      'We do not sell your personal data. Service providers are engaged to process data on our instructions or under their own controller responsibilities where they provide independent services (for example Stripe as payment provider).',
    ],
  },
  {
    title: 'International Transfers',
    paragraphs: [
      'Some providers we use may process data outside the UK. Where that happens, we take steps designed to ensure appropriate safeguards are in place, such as relying on providers’ standard contractual clauses, adequacy decisions or equivalent transfer mechanisms where required.',
    ],
  },
  {
    title: 'Data Retention',
    paragraphs: [
      'We keep personal data only for as long as reasonably needed for the purposes above.',
      'Order, payment verification and support records may be retained for accounting, fraud prevention, dispute handling and legal compliance. Temporary browser storage (such as pending checkout details in session storage) is generally cleared when the purchase flow completes or the session ends.',
      'Server logs and security records are retained for a limited period unless a longer period is needed to investigate abuse or incidents.',
    ],
  },
  {
    title: 'Security',
    paragraphs: [
      'We use appropriate technical and organisational measures to protect personal data, including HTTPS transport and access controls on our systems and provider accounts.',
      'No online service can guarantee absolute security. Please keep any downloaded report and payment confirmation secure on your own devices.',
    ],
  },
  {
    title: 'Your Rights',
    paragraphs: [
      'Under UK data protection law, you may have rights to access, rectify, erase, restrict or object to certain processing, and to data portability, subject to legal exceptions.',
      <>
        To exercise these rights, email{' '}
        <a className="font-semibold text-brand-green underline underline-offset-2" href="mailto:support@checkthishouse.co.uk">
          support@checkthishouse.co.uk
        </a>
        . You also have the right to complain to the Information Commissioner’s Office (ICO) if you are unhappy with how we handle your data.
      </>,
    ],
  },
  {
    title: 'Children',
    paragraphs: [
      'Our services are intended for adults researching property purchases and related decisions. We do not knowingly collect personal data from children. If you believe a child has provided personal data to us, contact us and we will take appropriate steps.',
    ],
  },
  {
    title: 'Third-Party Websites',
    paragraphs: [
      'The Website and reports may link to third-party sites. Those sites have their own privacy practices. We are not responsible for their content or data handling.',
    ],
  },
  {
    title: 'Changes to This Policy',
    paragraphs: [
      'We may update this Privacy Policy from time to time. The latest version will be published on this page with an updated date. Continued use of the Website after changes means you acknowledge the updated policy.',
    ],
  },
  {
    title: 'Contact Us',
    paragraphs: [
      <>
        For privacy questions or requests, contact CheckThisHouse at{' '}
        <a className="font-semibold text-brand-green underline underline-offset-2" href="mailto:support@checkthishouse.co.uk">
          support@checkthishouse.co.uk
        </a>
        .
      </>,
      'Business correspondence address: Ridgeside, Spennymoor, DL16 7HG.',
      'We aim to respond within a reasonable period.',
    ],
  },
];

function PrivacySectionBlock({ section, index }: { section: PrivacySection; index: number }) {
  const id = `section-${index + 1}`;
  return (
    <section id={id} className="scroll-mt-24 border-b border-brand-line pb-8 last:border-b-0">
      <div className="flex gap-3 items-start mb-4">
        <span className="font-mono text-xs font-bold text-brand-green bg-brand-green-soft rounded-md px-2 py-1 shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h2 className="font-display text-xl sm:text-2xl font-bold leading-tight text-brand-navy">
          {section.title}
        </h2>
      </div>
      <div className="space-y-3 text-[15px] leading-7 text-brand-muted">
        {section.paragraphs?.map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex}>{paragraph}</p>
        ))}
        {section.items && (
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 pl-1 py-1">
            {section.items.map((item) => (
              <li key={item} className="flex gap-2.5 items-start">
                <span className="w-1.5 h-1.5 mt-[10px] rounded-full bg-brand-green shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        {section.afterParagraphs?.map((paragraph, paragraphIndex) => (
          <p key={`after-${paragraphIndex}`}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-brand-paper text-brand-ink">
      <header className="bg-white/95 backdrop-blur border-b border-brand-line sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 h-16 sm:h-20 flex items-center justify-between gap-4">
          <a href="/" aria-label="CheckThisHouse home">
            <img src={LOGO} alt="CheckThisHouse" className="h-9 sm:h-11 w-auto object-contain" />
          </a>
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-navy hover:text-brand-green transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </a>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-brand-navy text-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-5 py-14 sm:py-20">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/70 mb-5">
                <ShieldCheck className="w-4 h-4 text-brand-green-mid" />
                Legal information
              </div>
              <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-5">
                Privacy Policy
              </h1>
              <p className="text-white/75 leading-7 max-w-2xl">
                How CheckThisHouse collects, uses and protects personal data when you use our
                Website and purchase property reports.
              </p>
              <p className="font-mono text-xs text-white/55 mt-6">Last updated: 22 July 2026</p>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-10 sm:py-14 grid lg:grid-cols-[250px_minmax(0,1fr)] gap-10 lg:gap-14">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="brand-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-brand-green" />
                <p className="brand-label">On this page</p>
              </div>
              <nav aria-label="Privacy sections" className="max-h-[58vh] overflow-y-auto pr-2">
                <ol className="space-y-2.5 text-xs">
                  {sections.map((section, index) => (
                    <li key={section.title}>
                      <a
                        href={`#section-${index + 1}`}
                        className="flex gap-2 text-brand-muted hover:text-brand-green transition leading-snug"
                      >
                        <span className="font-mono text-[10px] text-brand-green shrink-0">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span>{section.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          </aside>

          <article className="brand-card p-5 sm:p-8 lg:p-10">
            <div className="rounded-xl border border-brand-line bg-brand-cream p-4 sm:p-5 mb-9 text-sm leading-6 text-brand-muted">
              <p>
                This Privacy Policy explains how CheckThisHouse handles personal data in connection
                with www.checkthishouse.co.uk and our paid digital property reports. It covers
                payments via Stripe, advertising measurement via Google Ads tags, property research
                processing and your rights under UK data protection law.
              </p>
              <p className="mt-3">
                Related documents:{' '}
                <a className="font-semibold text-brand-green underline underline-offset-2" href="/terms">
                  Terms &amp; Conditions
                </a>
                .
              </p>
            </div>

            <div className="space-y-8">
              {sections.map((section, index) => (
                <React.Fragment key={section.title}>
                  <PrivacySectionBlock section={section} index={index} />
                </React.Fragment>
              ))}
            </div>
          </article>
        </div>
      </main>

      <footer className="bg-brand-navy text-white/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LOGO} alt="" className="h-8 w-auto brightness-0 invert opacity-90" />
            <p className="text-xs">Advisory property intelligence only.</p>
          </div>
          <div className="text-xs space-y-1 sm:text-right">
            <a href="/terms" className="underline underline-offset-4 hover:text-white transition">
              Terms &amp; Conditions
            </a>
            <p>© 2026 CheckThisHouse. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
