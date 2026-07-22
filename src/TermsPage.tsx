import React from 'react';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';

const LOGO = '/checkthishouselogo.png';

type TermsSection = {
  title: string;
  paragraphs?: React.ReactNode[];
  items?: string[];
  afterParagraphs?: React.ReactNode[];
};

const sections: TermsSection[] = [
  {
    title: 'About CheckThisHouse',
    paragraphs: [
      'CheckThisHouse provides online property research and information services. Our service is designed to help users conduct preliminary research into properties they may be considering purchasing, renting, investing in, or otherwise taking an interest in.',
      'We may collect, analyse, summarise and present information from publicly available and third-party sources. We may also use automated systems and artificial intelligence (“AI”) to assist in researching, analysing and generating reports.',
      'CheckThisHouse is an information and research service. Unless expressly stated otherwise, CheckThisHouse is not:',
    ],
    items: [
      'An estate agent',
      'A property surveyor or chartered surveyor',
      'A structural engineer',
      'A solicitor or conveyancer',
      'A financial, mortgage or investment adviser',
      'An environmental or planning consultant',
      'A valuation professional',
      'Any other regulated professional adviser',
    ],
  },
  {
    title: 'Our Services',
    paragraphs: [
      'CheckThisHouse provides property research reports intended to help users conduct preliminary research into a property.',
      'Depending on the report purchased, our services may include research or information relating to:',
    ],
    items: [
      'Property details, history and previous sale prices',
      'Property market information',
      'Local area, transport, schools and nearby amenities',
      'Planning applications and development information',
      'Environmental information and flood risk',
      'Crime and safety information',
      'Energy Performance Certificate (EPC) information',
      'Rental and investment information',
      'Development and infrastructure projects',
      'Publicly available and third-party information',
      'Automated analysis and AI-generated commentary',
      'Potential risks, issues or matters that may warrant further investigation',
    ],
    afterParagraphs: [
      'The exact information included depends on the report package, property, location, availability of information and availability and reliability of third-party data. Service contents and features may change, and we reserve the right to improve, modify, add or remove features.',
    ],
  },
  {
    title: 'Purpose of Our Reports',
    paragraphs: [
      'CheckThisHouse reports are provided for general informational and research purposes. They are intended to help you identify information and potential areas for further investigation when researching a property.',
      'A CheckThisHouse report is not a substitute for professional advice or formal property investigations. Our reports do not constitute:',
    ],
    items: [
      'A property, building or structural survey',
      'A property or mortgage valuation',
      'A legal, conveyancing or local authority search',
      'An environmental, drainage and water, or mining search',
      'Legal, financial, investment or planning advice',
      'Structural engineering or professional environmental advice',
      'Any other form of professional advice',
    ],
  },
  {
    title: 'Property Purchase Decisions',
    paragraphs: [
      'You acknowledge that purchasing a property is a significant financial decision and that you should not rely solely on a CheckThisHouse report when deciding whether to purchase or make an offer on a property.',
      'You remain responsible for carrying out your own investigations and obtaining appropriate professional advice. Depending on your circumstances, this may include advice from a solicitor or conveyancer, chartered surveyor, structural engineer, mortgage adviser, financial adviser, environmental professional, planning professional or another suitably qualified professional.',
      'CheckThisHouse does not guarantee that a property is suitable for you or your intended use. You are responsible for deciding whether a property is suitable for your circumstances.',
    ],
  },
  {
    title: 'Accuracy and Completeness of Information',
    paragraphs: [
      'We aim to provide useful, accurate and relevant information. However, we do not guarantee that all information contained in a report will be accurate, complete, current, error-free, available at all times, correctly interpreted or suitable for your particular circumstances.',
      'Information used in our reports may originate from third-party sources, including public databases, government websites, local authorities, property websites, mapping services and other publicly accessible sources.',
      'Third-party information may contain errors, be incomplete or out of date, change after a report has been generated, be unavailable, be incorrectly associated with a property, be subject to technical limitations or be subject to restrictions imposed by the third-party provider.',
      'We cannot guarantee that every relevant piece of information relating to a property will be identified, discovered or included in a report. The absence of an issue or risk from a report does not mean that the issue or risk does not exist.',
      'The inclusion of an issue, risk or potential concern in a report does not necessarily mean that the issue materially affects the property. You should independently verify any information that is important to your decision.',
    ],
  },
  {
    title: 'Artificial Intelligence and Automated Systems',
    paragraphs: [
      'Some elements of our services may be generated or assisted by artificial intelligence, machine learning, automated software or algorithmic systems.',
      'AI-generated or automated content may contain inaccuracies, omissions, incorrect interpretations or misleading conclusions. It should be treated as an aid to research and not as a definitive statement of fact or professional advice.',
      'Where a report identifies a potential issue or risk, you should independently investigate the matter and, where appropriate, seek advice from a suitably qualified professional.',
      'You acknowledge that automated systems cannot guarantee the identification of every relevant fact, defect, restriction, planning matter, legal issue, environmental risk or other matter affecting a property.',
    ],
  },
  {
    title: 'Third-Party Information and Websites',
    paragraphs: [
      'CheckThisHouse may obtain information from third-party websites, databases and public sources. We do not own or control third-party websites or data sources.',
      'We are not responsible for the accuracy, completeness or availability of third-party information; changes to or removal of that information; errors in third-party databases; or terms imposed by third-party websites.',
      'Our use of publicly available information does not imply any affiliation, endorsement or partnership with the relevant third party unless expressly stated. Third-party trademarks, logos and brand names remain the property of their respective owners.',
    ],
  },
  {
    title: 'Property Listing URLs',
    paragraphs: [
      'Where you provide a property listing URL, property address or other information to identify a property, you authorise CheckThisHouse to use that information for the purpose of providing the service you have purchased.',
      'You are responsible for providing sufficient and accurate information to allow us to identify the correct property. If you provide incorrect information, an incorrect address or an incorrect listing URL, we may be unable to generate a report for the intended property.',
      'Where a report has been generated based on information you provided incorrectly, you may not be entitled to a refund solely because the wrong property was researched. You should carefully check the property information displayed before completing your purchase.',
    ],
  },
  {
    title: 'Purchasing a Report',
    paragraphs: [
      'Before purchasing a report, you will be shown information about the service and the applicable price. By placing an order, you confirm that:',
    ],
    items: [
      'The information you have provided is accurate to the best of your knowledge',
      'You have reviewed the description of the report you are purchasing',
      'You understand that the report will be supplied digitally',
      'You understand that the report is generated for the property identified in your order',
      'You agree to pay the displayed price',
    ],
    afterParagraphs: [
      'Payment may be processed by a third-party payment provider and may be subject to that provider’s terms and privacy policy. An order is accepted when payment has been successfully processed and we have accepted your order.',
      'We may refuse or cancel an order where payment is not authorised; we reasonably suspect fraud or unlawful use; the property cannot reasonably be identified; technical limitations prevent delivery; a required third-party service is unavailable; or circumstances outside our reasonable control prevent us from supplying the service. If we cancel before supplying the report, we will refund the amount paid for that order.',
    ],
  },
  {
    title: 'Immediate Supply of Digital Content',
    paragraphs: [
      'Our property reports are digital content and are normally generated and supplied immediately following successful payment. A report may be supplied by digital download, account access, email or another electronic method specified on the Website.',
      'Because reports are generated specifically in response to your order and supplied immediately, you expressly request that we begin providing the service immediately after purchase.',
      'Before completing your purchase, you will be asked to acknowledge that the report is digital content supplied electronically, will be generated and made available immediately after payment, and that once it has been supplied you may lose your statutory right to cancel under applicable UK consumer law.',
      'By completing the required acknowledgement and placing your order, you expressly consent to the immediate supply of the digital content and acknowledge the consequences of requesting immediate supply.',
    ],
  },
  {
    title: 'Cancellation Rights After Report Supply',
    paragraphs: [
      'Once your report has been successfully generated and made available for download or access, you will not have a statutory 14-day right to cancel solely because you have changed your mind, to the extent permitted by applicable law.',
      'You cannot request a refund solely because you have downloaded, opened, read or reviewed the report; changed your mind; no longer want the report; decided not to purchase the property or make an offer; had an offer rejected; the property was sold to someone else; decided the property is unsuitable; disagreed with an opinion or analysis; or expected content that was not included in the service description.',
      'This does not affect any statutory rights or remedies that cannot legally be excluded or restricted.',
    ],
  },
  {
    title: 'Refunds and Remedies',
    paragraphs: [
      'Because our reports are digital content generated and supplied immediately, purchases are generally non-refundable once the report has been successfully generated and supplied, subject to applicable law.',
      'You may be entitled to a refund, replacement, repair or other appropriate remedy where required by law, including where a paid report was not supplied, cannot be accessed due to a technical fault attributable to us, is materially different from the service described, does not meet applicable legal requirements, is technically defective, or you otherwise have a statutory right to a remedy.',
      <>
        If you experience a technical issue preventing access to your report, contact us promptly at{' '}
        <a className="font-semibold text-brand-green underline underline-offset-2" href="mailto:support@checkthishouse.co.uk">
          support@checkthishouse.co.uk
        </a>
        . We will make reasonable efforts to resolve genuine technical issues.
      </>,
      'Inaccurate or incomplete third-party information will not automatically entitle you to a refund where we supplied the service substantially as described. Differences between a report and information later found through independent research, professional searches or other sources do not automatically constitute a defect.',
      'Nothing in these Terms affects statutory consumer rights that cannot legally be excluded or restricted.',
    ],
  },
  {
    title: 'Report Delivery and Completion of Service',
    paragraphs: [
      'The service is considered supplied when the report has been successfully generated and made available through the method specified on the Website.',
      'Once available, you are responsible for downloading, saving and securely storing your copy. You are also responsible for providing an accurate email address and having a suitable internet connection, device and software to access the report.',
      'If a technical problem prevents access, contact us promptly. We will make reasonable efforts to resolve genuine technical problems.',
    ],
  },
  {
    title: 'Reports Generated for Your Specific Order',
    paragraphs: [
      'Reports are generated in response to the specific property and information submitted by the customer.',
      'Content may depend on the property address, property listing, information supplied by the customer, availability of public and third-party data, availability of external websites, operation of automated systems and other technical factors.',
      'Because reports are generated for individual orders and supplied immediately, we do not accept cancellations based solely on a change of mind once supplied, subject always to applicable statutory consumer rights.',
    ],
  },
  {
    title: 'No Trial or “Try Before You Buy” Service',
    paragraphs: [
      'CheckThisHouse reports are not provided on a trial basis. The report itself is the digital product purchased by the customer.',
      'Once the report has been generated and supplied, you have received the digital content purchased. You cannot subsequently cancel solely because you have read, downloaded or reviewed it and decided that you no longer wish to pay.',
      'Customers should review the report description, features, pricing and relevant information displayed on the Website before purchase. By purchasing, you confirm that you understand what you are purchasing and agree to pay the displayed price.',
    ],
  },
  {
    title: 'Intellectual Property',
    paragraphs: [
      'All intellectual property rights in the CheckThisHouse Website and its original content, including branding, design, software, graphics, logos, text and underlying technology, belong to CheckThisHouse or our licensors unless otherwise stated.',
      'Subject to payment, you receive a limited, non-exclusive, non-transferable right to use your report for personal purposes. You may download, save and print it for personal use.',
      'Unless expressly permitted, you must not:',
    ],
    items: [
      'Resell a report or reproduce it for commercial distribution',
      'Publish a report publicly or redistribute reports in bulk',
      'Use reports to create a competing commercial service',
      'Remove copyright or attribution notices',
      'Systematically extract or scrape Website content',
      'Copy or reproduce the Website',
      'Reverse engineer our software or systems except where permitted by law',
    ],
  },
  {
    title: 'Acceptable Use',
    paragraphs: [
      'You agree not to use the Website or our services:',
    ],
    items: [
      'For an unlawful purpose or to commit or facilitate fraud',
      'To infringe the rights of others',
      'To gain unauthorised access to our systems',
      'To interfere with the Website or introduce malicious software',
      'To scrape, crawl or systematically extract data without permission',
      'To reverse engineer our systems except where permitted by law',
      'To abuse or overload our services',
      'To create a competing commercial database or service from our reports',
    ],
    afterParagraphs: [
      'We may suspend or terminate access where we reasonably believe these Terms have been breached.',
    ],
  },
  {
    title: 'External Links',
    paragraphs: [
      'Our Website and reports may contain links to third-party websites for convenience and informational purposes.',
      'We do not control and are not responsible for the availability, accuracy, content, security or privacy practices of third-party websites. You access them at your own risk and should review their applicable terms and privacy policies.',
    ],
  },
  {
    title: 'Website Availability',
    paragraphs: [
      'We aim to keep the Website and services available but cannot guarantee that they will always be uninterrupted or error-free.',
      'Services may be unavailable due to maintenance, technical problems, software updates, hosting failures, internet or telecommunications failures, cybersecurity incidents, third-party outages, changes to third-party services or circumstances beyond our reasonable control.',
      'We will take reasonable steps to restore services where reasonably possible.',
    ],
  },
  {
    title: 'Limitation of Liability',
    paragraphs: [
      'Nothing in these Terms excludes or limits liability where it would be unlawful, including liability for death or personal injury caused by negligence, fraud or fraudulent misrepresentation, breach of statutory rights that cannot be excluded or limited, or any other liability that cannot lawfully be excluded or limited.',
      'Subject to the above and to the maximum extent permitted by law, CheckThisHouse will not be responsible for losses arising from a decision to purchase, sell, rent, develop, invest in or otherwise transact in relation to a property based solely or primarily on a CheckThisHouse report.',
      'This includes, where legally permitted, losses resulting from property transactions, overpayment or underpayment, missed opportunities, defects, structural problems, planning matters, legal or title issues, environmental risks, flooding, financial or investment decisions, mortgage or rental decisions, renovation or development decisions.',
      'To the extent permitted by law, our total liability arising from or connected with a specific paid report will not exceed the amount paid for that report. This does not affect liability or consumer rights that cannot legally be limited or excluded.',
    ],
  },
  {
    title: 'Indirect and Consequential Loss',
    paragraphs: [
      'To the maximum extent permitted by applicable law, we will not be liable for indirect or consequential losses arising from your use of the Website or our services.',
      'Nothing in these Terms affects rights under applicable consumer protection legislation.',
    ],
  },
  {
    title: 'Events Outside Our Control',
    paragraphs: [
      'We will not be responsible for delays or failures caused by circumstances beyond our reasonable control.',
      'These may include internet or telecommunications failures, third-party outages, government action, changes to public data sources or third-party websites, cyberattacks, natural disasters, fire, flood, industrial disputes, power failures or other events that could not reasonably have been prevented or anticipated.',
    ],
  },
  {
    title: 'Privacy',
    paragraphs: [
      <>
        Our collection and use of personal information is explained in our{' '}
        <a className="font-semibold text-brand-green underline underline-offset-2" href="/privacy">
          Privacy Policy
        </a>
        . By using the Website, you acknowledge that personal information may be processed in
        accordance with that policy.
      </>,
    ],
  },
  {
    title: 'Changes to These Terms',
    paragraphs: [
      'We may update these Terms from time to time. The latest version will be published on the Website and will include its last-updated date.',
      'Changes apply to future use and future purchases. Where required by law, we will provide appropriate notice of material changes.',
    ],
  },
  {
    title: 'Severability',
    paragraphs: [
      'If any provision is invalid, unlawful or unenforceable, it will be interpreted or modified to the minimum extent necessary to make it enforceable where legally possible. Otherwise, it will be removed and the remaining provisions will continue in full force.',
    ],
  },
  {
    title: 'No Waiver',
    paragraphs: [
      'If we do not immediately enforce a provision of these Terms, this does not mean that we waive our right to enforce it in the future.',
    ],
  },
  {
    title: 'Entire Agreement',
    paragraphs: [
      'These Terms, together with our Privacy Policy and any additional terms expressly applicable to a particular service, constitute the agreement between you and CheckThisHouse concerning your use of the Website and purchase of our services.',
    ],
  },
  {
    title: 'Governing Law and Jurisdiction',
    paragraphs: [
      'These Terms are governed by the laws of England and Wales. If you are a consumer, you retain any mandatory rights available under the laws applicable to you.',
      'Subject to mandatory consumer rights, the courts of England and Wales will have jurisdiction over disputes arising in connection with these Terms or your use of our services.',
    ],
  },
  {
    title: 'Contact Us',
    paragraphs: [
      <>
        For questions, complaints or concerns about these Terms or our services, contact CheckThisHouse at{' '}
        <a className="font-semibold text-brand-green underline underline-offset-2" href="mailto:support@checkthishouse.co.uk">
          support@checkthishouse.co.uk
        </a>
        .
      </>,
      'Business correspondence address: Ridgeside, Spennymoor, DL16 7HG.',
      'We aim to respond to enquiries within a reasonable period.',
    ],
  },
];

function TermsSectionBlock({ section, index }: { section: TermsSection; index: number }) {
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

export default function TermsPage() {
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
                Terms &amp; Conditions
              </h1>
              <p className="text-white/75 leading-7 max-w-2xl">
                These terms govern your use of CheckThisHouse and the purchase and use of our
                digital property reports.
              </p>
              <p className="font-mono text-xs text-white/55 mt-6">Last updated: 21 July 2026</p>
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
              <nav aria-label="Terms sections" className="max-h-[58vh] overflow-y-auto pr-2">
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
                These Terms &amp; Conditions (“Terms”) govern your use of the CheckThisHouse website
                at www.checkthishouse.co.uk (“Website”) and your purchase and use of property reports
                and related services provided by CheckThisHouse (“we”, “us” or “our”).
              </p>
              <p className="mt-3">
                By accessing or using the Website, creating an account or purchasing a property
                report, you agree to these Terms. If you do not agree, do not use the Website or
                purchase our services. These Terms should be read with our Privacy Policy and other
                notices displayed on the Website.
              </p>
            </div>

            <div className="space-y-8">
              {sections.map((section, index) => (
                <React.Fragment key={section.title}>
                  <TermsSectionBlock section={section} index={index} />
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
            <a href="/privacy" className="underline underline-offset-4 hover:text-white transition">
              Privacy Policy
            </a>
            <p>© 2026 CheckThisHouse. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
