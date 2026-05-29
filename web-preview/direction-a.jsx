// direction-a.jsx — "Counsel Chambers"
// Stately, traditional, centered. Cormorant Garamond + Lato. Navy + gold + ivory.

/* ── styled atoms specific to direction A ─────────────────────── */

const aStyles = {
  centerCol: { maxWidth: 880, marginLeft: 'auto', marginRight: 'auto', textAlign: 'center' },
  ornament: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--gold)' },
  diamond: { width: 8, height: 8, background: 'var(--gold)', transform: 'rotate(45deg)' },
};

function Ornament() {
  return (
    <div style={aStyles.ornament}>
      <span style={{ height: 1, width: 64, background: 'var(--gold)' }}></span>
      <span style={aStyles.diamond}></span>
      <span style={{ height: 1, width: 64, background: 'var(--gold)' }}></span>
    </div>
  );
}

/* ── Home (Direction A) ────────────────────────────────────────── */

function A_Home({ goto, heroVariant }) {
  return (
    <main>
      <A_Hero goto={goto} variant={heroVariant} />
      <A_Credentials />
      <A_PressStrip />
      <A_Flagship goto={goto} />
      <A_AllServices goto={goto} />
      <A_AnaTeaser goto={goto} />
      <A_ReviewsRow goto={goto} />
      <A_CTABand goto={goto} />
    </main>
  );
}

function A_Hero({ goto, variant = 'split' }) {
  if (variant === 'centered') {
    return (
      <section className="section" style={{ paddingTop: 'clamp(60px, 9vw, 110px)', paddingBottom: 'clamp(40px, 6vw, 80px)' }}>
        <div className="container" style={aStyles.centerCol}>
          <Eyebrow accent>Kamkhadze PA &middot; Hollywood Beach, FL</Eyebrow>
          <h1 style={{ marginTop: 28, marginBottom: 28 }}>
            Reserved for<br /><span className="italic" style={{ color: 'var(--gold)' }}>the Remarkable.</span>
          </h1>
          <Ornament />
          <p style={{ fontSize: 19, lineHeight: 1.6, color: 'var(--ink-soft)', marginTop: 28, marginBottom: 36 }}>
            Elite U.S. immigration counsel for scientists, executives, artists, entrepreneurs, and investors.
            Led by Ana Kamkhadze, Esq. MBA &mdash; exclusively practicing U.S. Immigration and Nationality Law.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn gold" onClick={() => goto('contact')}>Schedule a Consultation <span className="arrow">&rarr;</span></button>
            <button className="btn ghost" onClick={() => goto('about')}>Meet Attorney Kamkhadze</button>
          </div>
        </div>
        <div className="container" style={{ marginTop: 72 }}>
          <Portrait aspect="21/9" label="ATTORNEY \u00b7 ANA KAMKHADZE, ESQ. MBA" />
        </div>
      </section>
    );
  }

  if (variant === 'fullbleed') {
    return (
      <section style={{
        background: 'var(--bg-deep)', color: 'var(--bg-on-deep)',
        padding: 'clamp(80px, 12vw, 160px) 0',
        borderBottom: '1px solid var(--rule)',
      }}>
        <div className="container" style={aStyles.centerCol}>
          <Eyebrow accent>
            <span style={{ color: 'color-mix(in oklab, var(--bg-on-deep) 75%, transparent)' }}>
              Kamkhadze PA &middot; Hollywood Beach, FL
            </span>
          </Eyebrow>
          <h1 style={{ marginTop: 28, marginBottom: 28, color: 'var(--bg-on-deep)' }}>
            Reserved for<br /><span className="italic" style={{ color: 'var(--gold)' }}>the Remarkable.</span>
          </h1>
          <Ornament />
          <p style={{ fontSize: 19, lineHeight: 1.6, color: 'color-mix(in oklab, var(--bg-on-deep) 80%, transparent)', marginTop: 28, marginBottom: 36 }}>
            Elite U.S. immigration counsel for scientists, executives, artists, entrepreneurs, and investors.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn gold" onClick={() => goto('contact')}>Schedule a Consultation <span className="arrow">&rarr;</span></button>
          </div>
        </div>
      </section>
    );
  }

  // default 'split'
  return (
    <section className="section" style={{ paddingTop: 'clamp(56px, 8vw, 110px)' }}>
      <div className="container" style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 'clamp(32px, 5vw, 80px)', alignItems: 'center' }}>
        <div className="fade-in">
          <Eyebrow accent>Hollywood Beach &middot; FL</Eyebrow>
          <h1 style={{ marginTop: 24, marginBottom: 28 }}>
            Reserved for<br /><span className="italic" style={{ color: 'var(--gold)' }}>the Remarkable.</span>
          </h1>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 28 }}>
            <span style={{ height: 1, width: 48, background: 'var(--gold)' }}></span>
            <span className="eyebrow"><span className="accent">&#9670;</span> Counsel for top talent</span>
          </div>
          <p style={{ fontSize: 19, lineHeight: 1.65, color: 'var(--ink-soft)', maxWidth: 560, marginBottom: 36 }}>
            Elite U.S. immigration counsel for scientists, executives, artists, entrepreneurs, and investors.
            Led by Ana Kamkhadze, Esq. MBA &mdash; exclusively practicing U.S. Immigration and Nationality Law.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <button className="btn gold" onClick={() => goto('contact')}>Schedule a Consultation <span className="arrow">&rarr;</span></button>
            <button className="btn ghost" onClick={() => goto('about')}>Meet Attorney Kamkhadze</button>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <Portrait aspect="4/5" />
          <div style={{
            position: 'absolute', left: -24, bottom: 32,
            background: 'var(--bg)', border: '1px solid var(--rule)',
            padding: '18px 22px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div className="eyebrow">Best Lawyers&reg;</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.1, marginTop: 6 }}>
              Ones to Watch
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 4 }}>U.S. Immigration Law &middot; 2026</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function A_Credentials() {
  const items = [
    'Member \u00B7 AILA',
    'Member \u00B7 NYSBA',
    'Licensed \u00B7 NY State Bar',
    'Best Lawyers \u00B7 Ones to Watch',
    'Expertise.com \u00B7 Best Immigration',
    'Exclusively \u00B7 Immigration Law',
  ];
  return (
    <section style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', background: 'var(--bg-alt)' }}>
      <div className="container" style={{ padding: '24px 0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px 36px' }}>
        {items.map((it, i) => (
          <div key={i} className="eyebrow" style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{it}</div>
        ))}
      </div>
    </section>
  );
}

function A_PressStrip() {
  return (
    <section className="section-tight">
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          <div className="eyebrow">As Seen In</div>
          <MarqueeRow items={['Entrepreneur', 'Yahoo Finance', 'Benzinga', 'VoyageMIA', 'Marketer.ge', 'TV Interviews']} />
        </div>
      </div>
    </section>
  );
}

function A_Flagship({ goto }) {
  return (
    <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
      <div className="container">
        <div style={aStyles.centerCol}>
          <Eyebrow accent>Flagship Practice Areas</Eyebrow>
          <h2 style={{ marginTop: 18, marginBottom: 18 }}>Elite Visa & Green Card Representation</h2>
          <p style={{ fontSize: 18, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            Kamkhadze PA is recognized for its depth of expertise in extraordinary ability immigration &mdash;
            guiding the world&rsquo;s top talent through the most prestigious U.S. visa and green card categories.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(20px, 3vw, 36px)', marginTop: 56 }}>
          {SERVICES_EMPLOYMENT.filter(s => s.flagship).map(s => (
            <article key={s.id} style={{
              background: 'var(--bg)', border: '1px solid var(--rule)', padding: 'clamp(28px, 4vw, 48px)',
              display: 'flex', flexDirection: 'column', gap: 22,
            }}>
              <div className="eyebrow"><span className="accent">&#9670;</span> {s.tag}</div>
              <h3 style={{ fontSize: 32, lineHeight: 1.1 }}>{s.name}</h3>
              <span className="rule-gold" style={{ width: 64 }}></span>
              <p style={{ color: 'var(--ink-soft)', fontSize: 16, lineHeight: 1.65 }}>{s.blurb}</p>
              <a className="lnk" onClick={() => goto('services')}>Explore {s.tag} &rarr;</a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function A_AllServices({ goto }) {
  return (
    <section className="section" style={{ background: 'var(--bg-alt)' }}>
      <div className="container">
        <div style={aStyles.centerCol}>
          <Eyebrow>All Practice Areas</Eyebrow>
          <h2 style={{ marginTop: 18 }}>Comprehensive Counsel<br />Across Every Immigration Pathway</h2>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 0, marginTop: 56,
          borderTop: '1px solid var(--rule)', borderLeft: '1px solid var(--rule)',
        }}>
          {[...SERVICES_EMPLOYMENT, ...SERVICES_FAMILY].map((s) => (
            <a key={s.id} onClick={() => goto('services')} style={{
              padding: 28,
              borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 10,
              background: 'var(--bg)',
              transition: 'background .25s ease',
            }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-alt)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg)'}>
              <div className="eyebrow" style={{ color: 'var(--gold)' }}>{s.tag}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.15 }}>{s.name}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-mute)', lineHeight: 1.55 }}>{s.blurb}</div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function A_AnaTeaser({ goto }) {
  return (
    <section className="section">
      <div className="container" style={{ display: 'grid', gridTemplateColumns: '.85fr 1fr', gap: 'clamp(32px, 5vw, 80px)', alignItems: 'center' }}>
        <Portrait aspect="4/5" label="ATTORNEY \u00b7 ANA KAMKHADZE" />
        <div>
          <Eyebrow accent>About the Attorney</Eyebrow>
          <h2 style={{ marginTop: 18, marginBottom: 24 }}>
            Precision. Strategy.<br /><span className="italic">A Decade of Expertise.</span>
          </h2>
          <p style={{ fontSize: 17, color: 'var(--ink-soft)', lineHeight: 1.7, marginBottom: 20 }}>
            Ana Kamkhadze brings nearly a decade of exclusive focus on U.S. Immigration and Nationality Law.
            Holding both a Master of Laws and an MBA from Florida International University, she combines
            rigorous legal knowledge with strategic business acumen.
          </p>
          <p style={{ fontSize: 17, color: 'var(--ink-soft)', lineHeight: 1.7, marginBottom: 32 }}>
            Licensed in New York and representing clients nationwide and internationally, Ana&rsquo;s practice
            spans the full spectrum of business immigration &mdash; from extraordinary ability visas to investor
            pathways to family-based petitions.
          </p>
          <button className="btn ghost" onClick={() => goto('about')}>Full Biography & Credentials <span className="arrow">&rarr;</span></button>
        </div>
      </div>
    </section>
  );
}

function A_ReviewsRow({ goto }) {
  return (
    <section className="section" style={{ background: 'var(--bg-deep)', color: 'var(--bg-on-deep)' }}>
      <div className="container">
        <div style={{ ...aStyles.centerCol, color: 'var(--bg-on-deep)' }}>
          <Eyebrow accent>
            <span style={{ color: 'color-mix(in oklab, var(--bg-on-deep) 75%, transparent)' }}>Client Reviews &middot; Google</span>
          </Eyebrow>
          <h2 style={{ marginTop: 18, marginBottom: 18, color: 'var(--bg-on-deep)' }}>Trusted by Exceptional Talent</h2>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 56, lineHeight: 1, color: 'var(--gold)' }}>5.0</span>
            <Stars />
            <span style={{ fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: 'color-mix(in oklab, var(--bg-on-deep) 70%, transparent)' }}>
              28 Reviews &middot; All 5 Stars
            </span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 56 }}>
          {REVIEWS.slice(0, 3).map((r, i) => (
            <blockquote key={i} style={{
              margin: 0, padding: 32,
              border: '1px solid color-mix(in oklab, var(--bg-on-deep) 20%, transparent)',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <Stars />
              <p style={{ fontFamily: 'var(--display)', fontSize: 19, lineHeight: 1.45, color: 'var(--bg-on-deep)' }}>
                &ldquo;{r.body}&rdquo;
              </p>
              <div style={{ borderTop: '1px solid color-mix(in oklab, var(--bg-on-deep) 15%, transparent)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bg-on-deep)' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'color-mix(in oklab, var(--bg-on-deep) 55%, transparent)' }}>{r.date}</div>
                </div>
                {r.tag && <span className="tag" style={{ color: 'var(--gold)', borderColor: 'rgba(255,255,255,.2)' }}>{r.tag}</span>}
              </div>
            </blockquote>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <button className="btn gold" onClick={() => goto('testimonials')}>Read All 28 Reviews <span className="arrow">&rarr;</span></button>
        </div>
      </div>
    </section>
  );
}

function A_CTABand({ goto }) {
  return (
    <section className="section">
      <div className="container" style={aStyles.centerCol}>
        <Ornament />
        <h2 style={{ marginTop: 32, marginBottom: 28 }}>
          Ready to pursue your <span className="italic" style={{ color: 'var(--gold)' }}>U.S. immigration goals?</span><br />
          Begin with a confidential consultation.
        </h2>
        <button className="btn gold" onClick={() => goto('contact')} style={{ padding: '18px 32px' }}>
          Schedule Now <span className="arrow">&rarr;</span>
        </button>
      </div>
    </section>
  );
}

/* ── About ─────────────────────────────────────────────────────── */

function A_About({ goto }) {
  return (
    <main>
      <section className="section" style={{ paddingTop: 'clamp(56px, 8vw, 96px)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(40px, 6vw, 96px)', alignItems: 'center' }}>
            <div>
              <Eyebrow accent>About Counsel</Eyebrow>
              <h1 style={{ fontSize: 'clamp(40px, 5.5vw, 84px)', marginTop: 24, marginBottom: 24 }}>
                Ana Kamkhadze,<br /><span className="italic">Esq. MBA.</span>
              </h1>
              <p style={{ fontSize: 19, lineHeight: 1.65, color: 'var(--ink-soft)' }}>
                Licensed Immigration Attorney. New York Bar. Florida International University &mdash; LL.M. & MBA.
              </p>
            </div>
            <Portrait aspect="4/5" />
          </div>
        </div>
      </section>

      <section className="section-tight" style={{ background: 'var(--bg-alt)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
            {[
              { n: '10+', l: 'Years exclusively immigration' },
              { n: '5.0', l: 'Google rating, 28 reviews' },
              { n: 'NY',  l: 'State Bar admitted' },
              { n: 'AILA',l: 'Member in good standing' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 56, lineHeight: 1, color: 'var(--gold)' }}>{s.n}</div>
                <div className="eyebrow">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 64 }}>
          <div>
            <Eyebrow>Biography</Eyebrow>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontSize: 18, lineHeight: 1.75, color: 'var(--ink-soft)' }}>
            <p style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1.4, color: 'var(--ink)' }}>
              Ana Kamkhadze brings nearly a decade of exclusive focus on U.S. Immigration and Nationality Law &mdash;
              representing scientists, executives, artists, entrepreneurs, and investors at the highest levels.
            </p>
            <p>
              Holding both a Master of Laws and an MBA from Florida International University, Ana combines
              rigorous legal training with strategic business acumen. Her approach is uniquely suited to the
              complex intersection of talent, enterprise, and immigration law.
            </p>
            <p>
              Licensed in New York and representing clients nationwide and internationally, Ana&rsquo;s practice
              spans the full spectrum of business immigration &mdash; from extraordinary ability visas to investor
              pathways to family-based petitions. She is a member of the American Immigration Lawyers Association
              and the New York State Bar Association.
            </p>
            <p>
              Recognized as a Best Lawyers&reg; &ldquo;One to Watch&rdquo; in U.S. Immigration Law and listed by
              Expertise.com among the best immigration attorneys in Hollywood, FL, Ana&rsquo;s work has been
              featured in Entrepreneur, Yahoo Finance, Benzinga, and television interviews.
            </p>
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--bg-alt)', borderTop: '1px solid var(--rule)' }}>
        <div className="container">
          <Eyebrow accent>Credentials & Recognition</Eyebrow>
          <h2 style={{ marginTop: 18, marginBottom: 56 }}>The Record.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderTop: '1px solid var(--rule)', borderLeft: '1px solid var(--rule)' }}>
            {CREDENTIALS.map((c, i) => (
              <div key={i} style={{
                padding: 32, borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)',
                display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)',
              }}>
                <div className="eyebrow" style={{ color: 'var(--gold)' }}>{c.year || '\u2014'}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 22 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-mute)' }}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <A_CTABand goto={goto} />
    </main>
  );
}

/* ── Services ──────────────────────────────────────────────────── */

function A_Services({ goto }) {
  return (
    <main>
      <section className="section" style={{ paddingTop: 'clamp(56px, 8vw, 96px)' }}>
        <div className="container" style={aStyles.centerCol}>
          <Eyebrow accent>Practice Areas</Eyebrow>
          <h1 style={{ marginTop: 24, marginBottom: 24 }}>Counsel for<br /><span className="italic">every immigration pathway.</span></h1>
          <p style={{ fontSize: 18, color: 'var(--ink-soft)', lineHeight: 1.65 }}>
            From flagship extraordinary-ability petitions to family-based green cards, Kamkhadze PA represents clients
            across the full spectrum of U.S. immigration law.
          </p>
        </div>
      </section>

      <section className="section-tight" style={{ borderTop: '1px solid var(--rule)' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
            <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)' }}>Employment-Based</h2>
            <span className="eyebrow">10 Pathways</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0, borderTop: '1px solid var(--rule)' }}>
            {SERVICES_EMPLOYMENT.map((s) => <A_ServiceRow key={s.id} s={s} goto={goto} />)}
          </div>
        </div>
      </section>

      <section className="section-tight" style={{ background: 'var(--bg-alt)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
            <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)' }}>Family-Based</h2>
            <span className="eyebrow">3 Pathways</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0, borderTop: '1px solid var(--rule)' }}>
            {SERVICES_FAMILY.map((s) => <A_ServiceRow key={s.id} s={s} goto={goto} />)}
          </div>
        </div>
      </section>
      <A_CTABand goto={goto} />
    </main>
  );
}

function A_ServiceRow({ s, goto }) {
  return (
    <article style={{
      padding: 32, borderBottom: '1px solid var(--rule)',
      borderRight: '1px solid var(--rule)',
      display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 24, alignItems: 'center',
      background: 'var(--bg)',
    }}>
      <div className="eyebrow" style={{ color: 'var(--gold)', fontSize: 13, letterSpacing: '.16em' }}>{s.tag}</div>
      <div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.2 }}>{s.name}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-mute)', marginTop: 6, lineHeight: 1.55, maxWidth: 480 }}>{s.blurb}</div>
      </div>
      <a className="lnk" onClick={() => goto('contact')}>Inquire &rarr;</a>
    </article>
  );
}

/* ── Testimonials ─────────────────────────────────────────────── */

function A_Testimonials({ goto }) {
  return (
    <main>
      <section className="section" style={{ paddingTop: 'clamp(56px, 8vw, 96px)' }}>
        <div className="container" style={aStyles.centerCol}>
          <Eyebrow accent>Client Reviews</Eyebrow>
          <h1 style={{ marginTop: 24, marginBottom: 18 }}>Trusted by<br /><span className="italic">exceptional talent.</span></h1>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 72, lineHeight: 1, color: 'var(--gold)' }}>5.0</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Stars />
              <span className="eyebrow">28 Google Reviews &middot; All 5 Stars</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-tight" style={{ borderTop: '1px solid var(--rule)' }}>
        <div className="container">
          <div style={{ columnCount: 3, columnGap: 24 }}>
            {REVIEWS.map((r, i) => (
              <blockquote key={i} style={{
                breakInside: 'avoid', margin: 0, marginBottom: 24, padding: 28,
                border: '1px solid var(--rule)', background: 'var(--bg)',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}>
                <Stars />
                <p style={{ fontFamily: 'var(--display)', fontSize: 18, lineHeight: 1.5 }}>&ldquo;{r.body}&rdquo;</p>
                <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{r.date}</div>
                  </div>
                  {r.tag && <span className="tag">{r.tag}</span>}
                </div>
              </blockquote>
            ))}
          </div>
        </div>
      </section>
      <A_CTABand goto={goto} />
    </main>
  );
}

/* ── Press ─────────────────────────────────────────────────────── */

function A_Press({ goto }) {
  return (
    <main>
      <section className="section" style={{ paddingTop: 'clamp(56px, 8vw, 96px)' }}>
        <div className="container" style={aStyles.centerCol}>
          <Eyebrow accent>In the Spotlight</Eyebrow>
          <h1 style={{ marginTop: 24, marginBottom: 18 }}>Press &<br /><span className="italic">media features.</span></h1>
        </div>
      </section>

      <section className="section-tight" style={{ borderTop: '1px solid var(--rule)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
            {PRESS.map((p, i) => (
              <a key={i} style={{
                display: 'grid', gridTemplateColumns: '120px 200px 1fr 80px', gap: 32,
                padding: '28px 0', borderBottom: '1px solid var(--rule)',
                alignItems: 'center', cursor: 'pointer',
              }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-alt)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div className="eyebrow" style={{ color: 'var(--gold)' }}>{p.date}</div>
                <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 22 }}>{p.source}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.25 }}>{p.title}</div>
                <div style={{ textAlign: 'right' }}><span className="lnk">Read &rarr;</span></div>
              </a>
            ))}
          </div>
        </div>
      </section>
      <A_CTABand goto={goto} />
    </main>
  );
}

/* ── Blog (Insights) ──────────────────────────────────────────── */

function A_Blog({ goto }) {
  return (
    <main>
      <section className="section" style={{ paddingTop: 'clamp(56px, 8vw, 96px)' }}>
        <div className="container" style={aStyles.centerCol}>
          <Eyebrow accent>Insights & Analysis</Eyebrow>
          <h1 style={{ marginTop: 24, marginBottom: 18 }}>The<br /><span className="italic">Kamkhadze Journal.</span></h1>
          <p style={{ fontSize: 18, color: 'var(--ink-soft)', lineHeight: 1.65 }}>
            Strategy notes, practice updates, and adjudication trends from our work in extraordinary-ability immigration.
          </p>
        </div>
      </section>

      <section className="section-tight" style={{ borderTop: '1px solid var(--rule)' }}>
        <div className="container">
          {/* feature post */}
          <article style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center',
            paddingBottom: 56, borderBottom: '1px solid var(--rule)', marginBottom: 56,
          }}>
            <Img label="EDITORIAL ILLUSTRATION \u00B7 4:5" aspect="4/5" />
            <div>
              <div className="eyebrow" style={{ color: 'var(--gold)' }}>{INSIGHTS[0].kicker} &middot; {INSIGHTS[0].date}</div>
              <h2 style={{ marginTop: 18, marginBottom: 20 }}>{INSIGHTS[0].title}</h2>
              <p style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--ink-soft)', marginBottom: 28 }}>
                A structured method for assembling acclaim evidence: how to identify the right artifacts,
                rank them by adjudicative weight, and present them as a coherent narrative the officer can verify.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <a className="lnk">Read the Note &rarr;</a>
                <span className="eyebrow muted">{INSIGHTS[0].read} read</span>
              </div>
            </div>
          </article>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
            {INSIGHTS.slice(1).map((p, i) => (
              <article key={i} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Img label="3:2" aspect="3/2" />
                <div className="eyebrow" style={{ color: 'var(--gold)' }}>{p.kicker}</div>
                <h3 style={{ fontSize: 22 }}>{p.title}</h3>
                <div className="eyebrow muted">{p.date} &middot; {p.read} read</div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <A_CTABand goto={goto} />
    </main>
  );
}

/* ── Contact ──────────────────────────────────────────────────── */

function A_Contact({ goto }) {
  return (
    <main>
      <section className="section" style={{ paddingTop: 'clamp(56px, 8vw, 96px)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(40px, 6vw, 96px)' }}>
            <div>
              <Eyebrow accent>Schedule a Consultation</Eyebrow>
              <h1 style={{ marginTop: 24, marginBottom: 24 }}>
                Begin a<br /><span className="italic">confidential conversation.</span>
              </h1>
              <p style={{ fontSize: 18, color: 'var(--ink-soft)', lineHeight: 1.65, marginBottom: 32 }}>
                Tell us about your goals. We will respond within one business day to coordinate a confidential consultation.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 24, borderTop: '1px solid var(--rule)' }}>
                <ContactLine label="By Email"    value="anka@esq.mba" />
                <ContactLine label="By Telephone" value="+1 (786) 590-9400" />
                <ContactLine label="Principal Office" value="Hollywood Beach, Florida" />
                <ContactLine label="Representation" value="Nationwide & Worldwide" />
              </div>
            </div>
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}

function ContactLine({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24, borderBottom: '1px solid var(--rule-soft)', paddingBottom: 16 }}>
      <span className="eyebrow">{label}</span>
      <span style={{ fontFamily: 'var(--display)', fontSize: 22 }}>{value}</span>
    </div>
  );
}

function ContactForm() {
  return (
    <form onSubmit={(e) => { e.preventDefault(); alert('Thank you. We will be in touch within one business day.'); }}
      style={{
        background: 'var(--bg-alt)', border: '1px solid var(--rule)',
        padding: 'clamp(28px, 4vw, 48px)',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
      <div className="eyebrow">Inquiry Form</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="First Name" />
        <Field label="Last Name" />
      </div>
      <Field label="Email" type="email" />
      <Field label="Phone" />
      <SelectField label="Pathway of Interest" options={['O-1A', 'EB-1A', 'EB-2 NIW', 'EB-1B', 'EB-1C', 'O-1B', 'H-1B', 'L-1', 'E-2', 'TN', 'Marriage GC', 'Other']} />
      <Field label="Brief Description" multi />
      <button type="submit" className="btn gold">Request Consultation <span className="arrow">&rarr;</span></button>
      <p style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
        Submitting this form does not create an attorney-client relationship. All communications are confidential.
      </p>
    </form>
  );
}

function Field({ label, type = 'text', multi }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="eyebrow">{label}</span>
      {multi ? (
        <textarea rows={4} style={fieldStyle()} />
      ) : (
        <input type={type} style={fieldStyle()} />
      )}
    </label>
  );
}

function SelectField({ label, options }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="eyebrow">{label}</span>
      <select style={fieldStyle()}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function fieldStyle() {
  return {
    background: 'var(--bg)',
    border: '1px solid var(--rule)',
    color: 'var(--ink)',
    fontFamily: 'var(--body)',
    fontSize: 15,
    padding: '14px 16px',
    outline: 'none',
    resize: 'vertical',
  };
}

Object.assign(window, {
  A_Home, A_About, A_Services, A_Testimonials, A_Press, A_Blog, A_Contact,
});
