// shared.jsx — atoms used by both directions

const NAV = [
  { id: 'home',     label: 'Home' },
  { id: 'about',    label: 'About' },
  { id: 'services', label: 'Services' },
  { id: 'testimonials', label: 'Testimonials' },
  { id: 'press',    label: 'Press' },
  { id: 'blog',     label: 'Insights' },
  { id: 'contact',  label: 'Contact' },
];

const SERVICES_EMPLOYMENT = [
  { id: 'o1a',   tag: 'O-1A', name: 'Extraordinary Ability',          blurb: 'For individuals at the top of their field in sciences, business, or athletics.', flagship: true },
  { id: 'eb1a',  tag: 'EB-1A', name: 'Extraordinary Ability Green Card', blurb: 'Self-petition permanent residence — no employer sponsorship required.', flagship: true },
  { id: 'o1b',   tag: 'O-1B', name: 'Arts, Film & Entertainment',     blurb: 'Extraordinary achievement in the arts or motion picture/television industries.' },
  { id: 'eb1b',  tag: 'EB-1B', name: 'Outstanding Researchers',        blurb: 'Permanent residence for internationally recognized academic researchers.' },
  { id: 'eb1c',  tag: 'EB-1C', name: 'Multinational Managers',          blurb: 'Permanent residence for senior executives transferring within a company.' },
  { id: 'eb2',   tag: 'EB-2 NIW', name: 'National Interest Waiver',     blurb: 'Self-petition green card for professionals whose work serves the national interest.' },
  { id: 'h1b',   tag: 'H-1B', name: 'Specialty Occupation',             blurb: 'Work visa for specialty roles requiring at least a bachelor\u2019s degree.' },
  { id: 'l1',    tag: 'L-1',  name: 'Intracompany Transferee',          blurb: 'Managers, executives, and specialized knowledge transfers within a company.' },
  { id: 'e2',    tag: 'E-2',  name: 'Treaty Investor',                  blurb: 'For nationals of treaty countries investing substantial capital in a U.S. enterprise.' },
  { id: 'tn',    tag: 'TN',   name: 'Canadian & Mexican Professionals', blurb: 'Nonimmigrant status for Canadian and Mexican citizens under USMCA.' },
];

const SERVICES_FAMILY = [
  { id: 'marriage', tag: 'I-130', name: 'Marriage-Based Green Card', blurb: 'Family-based immigration for spouses of U.S. citizens and permanent residents.' },
  { id: 'natz',     tag: 'N-400', name: 'Naturalization & Citizenship', blurb: 'Guidance through becoming a U.S. citizen for eligible permanent residents.' },
  { id: 'other',    tag: 'I-130', name: 'Other Family Petitions',     blurb: 'Petitions for parents, children, and siblings of U.S. citizens and LPRs.' },
];

const REVIEWS = [
  { name: 'Saba Chachanidze', date: '2 years ago', tag: 'O-1A',
    body: 'Ana built a compelling case and guided me through every step with professionalism. Her deep expertise in extraordinary ability cases truly sets her apart. Approved on first submission.' },
  { name: 'Julien David',  date: '1 year ago', tag: 'O-1A',
    body: 'As someone with international achievements, I needed an attorney who truly understood how to present complex evidence \u2014 Ana delivered exactly that.' },
  { name: 'Kristina Burkhan', date: '1 year ago', tag: 'EB-1A',
    body: 'Her knowledge of immigration law is exceptional, and she approaches each case with precision and genuine care. Truly one of the best in the field.' },
  { name: 'Nino Tvalchrelidze', date: '2 years ago', tag: 'NIW',
    body: 'Incredibly knowledgeable, always responsive, and truly dedicated. Her strategic guidance was invaluable and the outcome exceeded my expectations.' },
  { name: 'Mariami Topuria', date: '3 years ago', tag: 'EB-1A',
    body: 'She stands out with her professionalism, knowledge, and attention to detail. We had a somewhat complicated case and she was able to get it resolved for us.' },
  { name: 'Lasha Gongadze', date: '3 years ago', tag: 'O-1A',
    body: 'Her strategic thinking and meticulous preparation are truly impressive. She helped me achieve results I did not think were possible.' },
];

const PRESS = [
  { source: 'Entrepreneur',  title: 'How Talent Visas Are Reshaping U.S. Innovation', date: 'OCT 2024' },
  { source: 'Yahoo Finance', title: 'The Rise of the Self-Petition Green Card',         date: 'AUG 2024' },
  { source: 'Benzinga',      title: 'Why Founders Choose the O-1A Over the H-1B',       date: 'JUN 2024' },
  { source: 'VoyageMIA',     title: 'Hidden Gems of South Florida Legal Talent',        date: 'MAR 2024' },
  { source: 'Marketer.ge',   title: 'Building a U.S. Practice from Hollywood Beach',    date: 'JAN 2024' },
  { source: 'TV Interview',  title: 'Inside the EB-1A: A Conversation with Counsel',    date: 'NOV 2023' },
];

const INSIGHTS = [
  { kicker: 'O-1A Strategy', title: 'Documenting "Sustained National Acclaim" \u2014 A Practical Framework', read: '8 min', date: 'May 2026' },
  { kicker: 'EB-1A',         title: 'The Three-Step Final Merits: How USCIS Really Decides',                read: '12 min', date: 'Apr 2026' },
  { kicker: 'NIW',           title: 'Matter of Dhanasar in Practice: Lessons From Recent Approvals',      read: '10 min', date: 'Mar 2026' },
  { kicker: 'Founders',      title: 'When Equity Counts as "Critical Role": A Note for Startup CEOs',     read: '6 min',  date: 'Feb 2026' },
  { kicker: 'Researchers',   title: 'Citation Metrics Beyond H-Index \u2014 What Adjudicators Look For',    read: '9 min',  date: 'Jan 2026' },
  { kicker: 'Practice Note', title: 'Building a Petition That Reads Like a Magazine Profile',             read: '7 min',  date: 'Dec 2025' },
];

const CREDENTIALS = [
  { title: 'Best Lawyers\u00AE',    sub: 'Ones to Watch \u00B7 U.S. Immigration Law', year: '2026' },
  { title: 'Expertise.com',         sub: 'Best Immigration Attorneys, Hollywood FL',  year: '2023 \u2013 2024' },
  { title: 'AILA',                  sub: 'American Immigration Lawyers Association',  year: 'Member' },
  { title: 'NYSBA',                 sub: 'New York State Bar Association',            year: 'Admitted' },
  { title: 'FIU College of Law',    sub: 'Master of Laws (LL.M.)',                    year: '' },
  { title: 'FIU College of Business', sub: 'Master of Business Administration',       year: '' },
];

/* ── components ─────────────────────────────────────────── */

function Eyebrow({ children, accent }) {
  return (
    <div className="eyebrow">
      {accent && <span className="accent">&#9670; </span>}
      {children}
    </div>
  );
}

function Logo({ size = 36 }) {
  return (
    <div className="hdr-brand">
      <div className="hdr-mono" style={{ width: size, height: size }}>K</div>
      <div className="hdr-brand-txt">
        <div className="hdr-brand-name">Kamkhadze<span style={{ color: 'var(--gold)' }}> PA</span></div>
        <div className="hdr-brand-sub">U.S. Immigration Law</div>
      </div>
    </div>
  );
}

function NavBar({ page, goto }) {
  return (
    <nav className="hdr-nav">
      {NAV.filter(n => n.id !== 'contact').map(n => (
        <a key={n.id}
           className={page === n.id ? 'is-active' : ''}
           onClick={() => goto(n.id)}>
          {n.label}
        </a>
      ))}
    </nav>
  );
}

function Header({ page, goto }) {
  return (
    <header className="hdr">
      <div className="hdr-row">
        <a onClick={() => goto('home')} style={{ cursor: 'pointer' }}>
          <Logo />
        </a>
        <NavBar page={page} goto={goto} />
        <div className="hdr-cta">
          <button className="btn gold" onClick={() => goto('contact')}>
            Schedule <span className="arrow">&rarr;</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Footer({ goto }) {
  return (
    <footer className="ftr">
      <div className="ftr-inner">
        <div className="ftr-grid">
          <div className="ftr-col">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 26 }}>
                Kamkhadze <span style={{ color: 'var(--gold)' }}>PA</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'color-mix(in oklab, var(--bg-on-deep) 70%, transparent)' }}>
                Elite U.S. immigration representation for scientists, executives, artists, investors, and exceptional families \u2014 nationwide and abroad.
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <span className="tag" style={{ borderColor: 'rgba(255,255,255,.2)', color: 'color-mix(in oklab, var(--bg-on-deep) 75%, transparent)' }}><span className="dot"></span>AILA</span>
                <span className="tag" style={{ borderColor: 'rgba(255,255,255,.2)', color: 'color-mix(in oklab, var(--bg-on-deep) 75%, transparent)' }}><span className="dot"></span>NYSBA</span>
              </div>
            </div>
          </div>
          <div className="ftr-col">
            <h4>Employment</h4>
            <ul>
              {SERVICES_EMPLOYMENT.slice(0, 7).map(s => (
                <li key={s.id}><a onClick={() => goto('services')}>{s.tag} {s.name}</a></li>
              ))}
            </ul>
          </div>
          <div className="ftr-col">
            <h4>Family</h4>
            <ul>
              {SERVICES_FAMILY.map(s => (
                <li key={s.id}><a onClick={() => goto('services')}>{s.name}</a></li>
              ))}
            </ul>
          </div>
          <div className="ftr-col">
            <h4>Firm</h4>
            <ul>
              <li><a onClick={() => goto('about')}>About Ana Kamkhadze</a></li>
              <li><a onClick={() => goto('blog')}>Insights & Analysis</a></li>
              <li><a onClick={() => goto('press')}>In the Spotlight</a></li>
              <li><a onClick={() => goto('contact')}>Contact & Location</a></li>
            </ul>
          </div>
          <div className="ftr-col">
            <h4>Contact</h4>
            <ul>
              <li>anka@esq.mba</li>
              <li>+1 (786) 590-9400</li>
              <li>Hollywood Beach, FL</li>
              <li>Consultations Worldwide</li>
            </ul>
          </div>
        </div>
        <div className="ftr-bot">
          <div>&copy; 2026 Kamkhadze PA. All rights reserved. Hollywood Beach, Florida.</div>
          <div>Attorney Advertising. Licensed in New York. Prior results do not guarantee a similar outcome.</div>
        </div>
      </div>
    </footer>
  );
}

/** Image placeholder. Pass label describing what should go there. */
function Img({ label, aspect = '4 / 5', style, className = '' }) {
  return (
    <div className={`imgph ${className}`} style={{ aspectRatio: aspect, ...style }}>
      <span>{label}</span>
    </div>
  );
}

/** Stylized portrait silhouette placeholder for attorney photos. */
function Portrait({ aspect = '4 / 5', label = 'Ana Kamkhadze, Esq. MBA', style, initial = 'AK' }) {
  return (
    <div className="imgph portrait" style={{ aspectRatio: aspect, ...style }}>
      <div className="ph-figure"></div>
      <div className="ph-init">{initial}</div>
      <div className="ph-tag">{label}</div>
    </div>
  );
}

function Stars({ n = 5 }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, color: 'var(--gold)', fontSize: 14, letterSpacing: 1 }}>
      {Array.from({ length: n }).map((_, i) => <span key={i}>&#9733;</span>)}
    </div>
  );
}

function MarqueeRow({ items }) {
  return (
    <div style={{ display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', opacity: .8 }}>
      {items.map((it, i) => (
        <div key={i} style={{
          fontFamily: 'var(--display)', fontStyle: 'italic',
          fontSize: 22, color: 'var(--ink-soft)', letterSpacing: '.02em',
        }}>{it}</div>
      ))}
    </div>
  );
}

// expose
Object.assign(window, {
  NAV, SERVICES_EMPLOYMENT, SERVICES_FAMILY, REVIEWS, PRESS, INSIGHTS, CREDENTIALS,
  Eyebrow, Logo, NavBar, Header, Footer, Img, Portrait, Stars, MarqueeRow,
});
