// direction-b.jsx — "Editorial Quarterly"
// High-end legal magazine feel. Asymmetric grids, oversized serif display,
// drop caps, hairline rules, generous whitespace, all-serif typography.

const bStyles = {
  asideLbl: {
    fontFamily: 'var(--label)', fontSize: 10.5, letterSpacing: '.24em',
    textTransform: 'uppercase', color: 'var(--ink-mute)', fontWeight: 600,
  },
  dropCap: {
    float: 'left',
    fontFamily: 'var(--display)',
    fontSize: 86, lineHeight: .82,
    paddingRight: 14, paddingTop: 6,
    color: 'var(--gold)',
  },
  thinRule: { height: 1, background: 'var(--gold)', width: 48 },
};

function BIssueStrip() {
  return (
    <div style={{
      borderBottom: '1px solid var(--rule)',
      background: 'var(--bg)',
    }}>
      <div className="container" style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '10px 0', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase',
        color: 'var(--ink-mute)', fontFamily: 'var(--label)', fontWeight: 600,
      }}>
        <span>Vol. X &middot; Hollywood Beach &middot; FL</span>
        <span style={{ display: 'flex', gap: 18 }}>
          <span>Est. 2017</span>
          <span style={{ color: 'var(--gold)' }}>&#9670;</span>
          <span>Counsel to the Remarkable</span>
        </span>
      </div>
    </div>
  );
}

/* ── Home ─────────────────────────────────────────────────────── */

function B_Home({ goto, heroVariant }) {
  return (
    <main>
      <BIssueStrip />
      <B_Hero goto={goto} variant={heroVariant} />
      <B_Marquee />
      <B_Flagship goto={goto} />
      <B_Editorial goto={goto} />
      <B_ServicesIndex goto={goto} />
      <B_ReviewsLetter goto={goto} />
      <B_PressLine />
      <B_CTABand goto={goto} />
    </main>
  );
}

function B_Hero({ goto, variant = 'editorial' }) {
  if (variant === 'centered') {
    return (
      <section className="section" style={{ paddingTop: 80, paddingBottom: 56 }}>
        <div className="container" style={{ textAlign: 'center', maxWidth: 1080, marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={bStyles.asideLbl}>The Practice &middot; Established Hollywood Beach</div>
          <h1 style={{ marginTop: 32, marginBottom: 32, letterSpacing: '-.02em' }}>
            Reserved for<br /><span className="italic">the&nbsp;Remarkable.</span>
          </h1>
          <p style={{ fontSize: 22, lineHeight: 1.55, color: 'var(--ink-soft)', maxWidth: 760, margin: '0 auto 36px' }}>
            Elite U.S. immigration counsel for scientists, executives, artists, entrepreneurs, and investors &mdash;
            led by Ana Kamkhadze, Esq. MBA.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn gold" onClick={() => goto('contact')}>Schedule a Consultation <span className="arrow">&rarr;</span></button>
            <button className="btn ghost" onClick={() => goto('about')}>Meet Attorney Kamkhadze</button>
          </div>
        </div>
        <div className="container" style={{ marginTop: 64 }}>
          <Portrait aspect="21/9" />
        </div>
      </section>
    );
  }

  if (variant === 'fullbleed') {
    return (
      <section style={{
        position: 'relative',
        background: 'var(--bg-deep)', color: 'var(--bg-on-deep)',
        minHeight: 'min(86vh, 760px)',
        display: 'grid', alignItems: 'end',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: .55,
          background:
            'radial-gradient(60% 60% at 70% 40%, color-mix(in oklab, var(--gold) 30%, transparent), transparent 70%)',
        }}></div>
        <div className="container" style={{ position: 'relative', paddingTop: 120, paddingBottom: 80 }}>
          <div style={{ ...bStyles.asideLbl, color: 'color-mix(in oklab, var(--bg-on-deep) 70%, transparent)' }}>
            The Practice &middot; Est. 2017
          </div>
          <h1 style={{ maxWidth: 1100, marginTop: 28, marginBottom: 36, color: 'var(--bg-on-deep)' }}>
            Reserved for<br /><span className="italic" style={{ color: 'var(--gold)' }}>the&nbsp;Remarkable.</span>
          </h1>
          <p style={{ fontSize: 22, lineHeight: 1.55, maxWidth: 720, color: 'color-mix(in oklab, var(--bg-on-deep) 80%, transparent)', marginBottom: 36 }}>
            Elite U.S. immigration counsel for scientists, executives, artists, entrepreneurs, and investors.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <button className="btn gold" onClick={() => goto('contact')}>Schedule Consultation <span className="arrow">&rarr;</span></button>
          </div>
        </div>
      </section>
    );
  }

  // default 'editorial' — asymmetric magazine cover
  return (
    <section style={{ paddingTop: 56, paddingBottom: 56 }}>
      <div className="container" style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 'clamp(32px, 5vw, 80px)', alignItems: 'end' }}>
        <div>
          <div style={{ ...bStyles.asideLbl, marginBottom: 18 }}>
            No. 04 &middot; Counsel to the Remarkable
          </div>
          <h1 style={{ letterSpacing: '-.025em', marginBottom: 16 }}>
            Reserved for<br /><span className="italic">the Remarkable.</span>
          </h1>
          <div style={{ ...bStyles.thinRule, marginTop: 18, marginBottom: 24 }} />
          <p style={{ fontSize: 22, lineHeight: 1.5, color: 'var(--ink-soft)', maxWidth: 580, marginBottom: 32 }}>
            Elite U.S. immigration counsel for scientists, executives, artists,
            entrepreneurs, and investors. Led by Ana Kamkhadze, Esq. MBA.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <button className="btn gold" onClick={() => goto('contact')}>Schedule Consultation <span className="arrow">&rarr;</span></button>
            <button className="btn ghost" onClick={() => goto('about')}>Meet Attorney Kamkhadze</button>
          </div>

          {/* feature tag list */}
          <div style={{
            marginTop: 56,
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0,
            borderTop: '1px solid var(--rule)',
          }}>
            {[
              { k: 'Featured', v: 'O-1A · EB-1A' },
              { k: 'Practice', v: 'Exclusively Immigration' },
              { k: 'Licensed', v: 'New York Bar' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '20px 24px 4px 0', display: 'flex', flexDirection: 'column', gap: 6, borderRight: i < 2 ? '1px solid var(--rule)' : 'none', paddingLeft: i ? 24 : 0 }}>
                <span style={bStyles.asideLbl}>{s.k}</span>
                <span style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <Portrait aspect="3/4" />
          <div style={{
            position: 'absolute', right: -24, top: 36, background: 'var(--gold)', color: '#11203D',
            padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ fontSize: 9.5, letterSpacing: '.22em', textTransform: 'uppercase', fontFamily: 'var(--label)', fontWeight: 700 }}>
              Best Lawyers&reg;
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.05 }}>
              Ones to Watch
            </div>
            <div style={{ fontSize: 11, opacity: .7 }}>U.S. Immigration &middot; 2026</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function B_Marquee() {
  return (
    <section style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', overflow: 'hidden' }}>
      <div className="container" style={{ padding: '28px 0', display: 'flex', gap: 56, alignItems: 'center', whiteSpace: 'nowrap', overflowX: 'auto' }}>
        {['Entrepreneur', 'Yahoo Finance', 'Benzinga', 'VoyageMIA', 'Marketer.ge', 'TV Interviews', 'YouTube'].map((p, i) => (
          <span key={i} style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 28, color: 'var(--ink-soft)' }}>
            {p}
          </span>
        ))}
      </div>
    </section>
  );
}

function B_Flagship({ goto }) {
  return (
    <section className="section">
      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 64, alignItems: 'baseline', marginBottom: 56 }}>
          <div>
            <div style={bStyles.asideLbl}>Feature &middot; Flagship Practice</div>
            <h2 style={{ marginTop: 16 }}>Elite visa<br /><span className="italic">& green card</span><br />representation.</h2>
          </div>
          <p style={{ fontSize: 21, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
            Kamkhadze PA is recognized for its depth of expertise in extraordinary-ability immigration &mdash;
            guiding the world&rsquo;s top talent through the most prestigious U.S. visa and green card categories.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56 }}>
          {SERVICES_EMPLOYMENT.filter(s => s.flagship).map((s, i) => (
            <article key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--rule)', paddingBottom: 14 }}>
                <span style={{ ...bStyles.asideLbl, color: 'var(--gold)' }}>{s.tag}</span>
                <span style={bStyles.asideLbl}>0{i + 1}</span>
              </div>
              <h3 style={{ fontSize: 'clamp(28px, 3.4vw, 44px)' }}>{s.name}</h3>
              <p style={{ fontSize: 18, lineHeight: 1.7, color: 'var(--ink-soft)' }}>
                <span style={bStyles.dropCap}>{s.blurb.charAt(0)}</span>{s.blurb.slice(1)}
              </p>
              <div style={{ marginTop: 8 }}>
                <a className="lnk" onClick={() => goto('services')}>Explore {s.tag} &rarr;</a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function B_Editorial({ goto }) {
  return (
    <section className="section" style={{ background: 'var(--bg-alt)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
      <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 'clamp(40px, 6vw, 96px)', alignItems: 'center' }}>
        <Portrait aspect="3/4" label="ATTORNEY \u00b7 ANA KAMKHADZE" />
        <div>
          <div style={bStyles.asideLbl}>Profile &middot; Counsel</div>
          <h2 style={{ marginTop: 18, marginBottom: 24 }}>
            Precision.<br />Strategy.<br /><span className="italic">A decade of expertise.</span>
          </h2>
          <p style={{ fontSize: 19, lineHeight: 1.75, color: 'var(--ink-soft)', marginBottom: 20 }}>
            <span style={bStyles.dropCap}>A</span>na Kamkhadze brings nearly a decade of exclusive focus on
            U.S. Immigration and Nationality Law. Holding both a Master of Laws and an MBA from Florida
            International University, she combines rigorous legal training with strategic business acumen.
          </p>
          <p style={{ fontSize: 19, lineHeight: 1.75, color: 'var(--ink-soft)', marginBottom: 32 }}>
            Licensed in New York and representing clients nationwide and internationally, Ana&rsquo;s practice
            spans the full spectrum of business immigration.
          </p>
          <button className="btn ghost" onClick={() => goto('about')}>Read Full Profile <span className="arrow">&rarr;</span></button>
        </div>
      </div>
    </section>
  );
}

function B_ServicesIndex({ goto }) {
  return (
    <section className="section">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 40, borderBottom: '1px solid var(--rule)', paddingBottom: 20 }}>
          <h2 style={{ fontSize: 'clamp(32px, 4vw, 52px)' }}>Index of Practice Areas</h2>
          <span style={bStyles.asideLbl}>Employment &middot; Family</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 64px' }}>
          {[...SERVICES_EMPLOYMENT, ...SERVICES_FAMILY].map(s => (
            <a key={s.id} onClick={() => goto('services')} style={{
              display: 'grid', gridTemplateColumns: '110px 1fr auto', alignItems: 'baseline',
              gap: 24, padding: '18px 0', borderBottom: '1px dashed var(--rule)', cursor: 'pointer',
            }}>
              <span style={{ ...bStyles.asideLbl, color: 'var(--gold)' }}>{s.tag}</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 22 }}>{s.name}</span>
              <span style={{ ...bStyles.asideLbl }}>&rarr;</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function B_ReviewsLetter({ goto }) {
  return (
    <section className="section" style={{ background: 'var(--bg-deep)', color: 'var(--bg-on-deep)' }}>
      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 64, alignItems: 'start' }}>
          <div>
            <div style={{ ...bStyles.asideLbl, color: 'color-mix(in oklab, var(--bg-on-deep) 70%, transparent)' }}>
              Letters &middot; From clients
            </div>
            <h2 style={{ marginTop: 16, marginBottom: 24, color: 'var(--bg-on-deep)' }}>
              Trusted by <span className="italic" style={{ color: 'var(--gold)' }}>exceptional talent</span>.
            </h2>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 24 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 72, lineHeight: 1, color: 'var(--gold)' }}>5.0</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Stars />
                <span style={{ ...bStyles.asideLbl, color: 'color-mix(in oklab, var(--bg-on-deep) 70%, transparent)' }}>
                  28 Google Reviews
                </span>
              </div>
            </div>
            <button className="btn gold" onClick={() => goto('testimonials')}>Read the Letters <span className="arrow">&rarr;</span></button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {REVIEWS.slice(0, 3).map((r, i) => (
              <blockquote key={i} style={{
                margin: 0, padding: '28px 0',
                borderTop: '1px solid color-mix(in oklab, var(--bg-on-deep) 18%, transparent)',
                display: 'grid', gridTemplateColumns: '140px 1fr', gap: 32,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Stars />
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bg-on-deep)', marginTop: 8 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'color-mix(in oklab, var(--bg-on-deep) 55%, transparent)' }}>{r.date}</div>
                  {r.tag && <span className="tag" style={{ color: 'var(--gold)', borderColor: 'rgba(255,255,255,.2)', alignSelf: 'flex-start', marginTop: 10 }}>{r.tag}</span>}
                </div>
                <p style={{ fontFamily: 'var(--display)', fontSize: 21, lineHeight: 1.45, color: 'var(--bg-on-deep)' }}>
                  &ldquo;{r.body}&rdquo;
                </p>
              </blockquote>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function B_PressLine() {
  return (
    <section className="section-tight">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <div style={bStyles.asideLbl}>In the Spotlight</div>
          <span style={{ ...bStyles.asideLbl, color: 'var(--gold)' }}>Recent</span>
        </div>
        <div style={{ borderTop: '1px solid var(--rule)' }}>
          {PRESS.slice(0, 3).map((p, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '120px 220px 1fr auto',
              alignItems: 'baseline', gap: 32, padding: '22px 0', borderBottom: '1px solid var(--rule)',
            }}>
              <span style={{ ...bStyles.asideLbl, color: 'var(--gold)' }}>{p.date}</span>
              <span style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 22 }}>{p.source}</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.25 }}>{p.title}</span>
              <span style={bStyles.asideLbl}>&rarr;</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function B_CTABand({ goto }) {
  return (
    <section className="section" style={{ borderTop: '1px solid var(--rule)' }}>
      <div className="container" style={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr', gap: 64, alignItems: 'center' }}>
        <h2 style={{ fontSize: 'clamp(40px, 5.5vw, 80px)' }}>
          Ready to pursue your <span className="italic" style={{ color: 'var(--gold)' }}>U.S. immigration goals?</span>
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
            Begin with a confidential consultation. We respond within one business day.
          </p>
          <button className="btn gold" onClick={() => goto('contact')} style={{ padding: '18px 30px' }}>
            Schedule Now <span className="arrow">&rarr;</span>
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── About ─────────────────────────────────────────────────────── */

function B_About({ goto }) {
  return (
    <main>
      <BIssueStrip />
      <section className="section" style={{ paddingTop: 56 }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 'clamp(40px, 6vw, 96px)', alignItems: 'end' }}>
          <div>
            <div style={bStyles.asideLbl}>Profile</div>
            <h1 style={{ marginTop: 24, marginBottom: 28 }}>
              Ana<br />Kamkhadze,<br /><span className="italic">Esq. MBA.</span>
            </h1>
            <p style={{ fontSize: 20, lineHeight: 1.65, color: 'var(--ink-soft)' }}>
              A decade of exclusive practice in U.S. Immigration and Nationality Law &mdash;
              representing scientists, executives, artists, entrepreneurs, and investors.
            </p>
          </div>
          <Portrait aspect="3/4" />
        </div>
      </section>

      <section className="section-tight" style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          {[
            { n: '10+', l: 'Years exclusively immigration' },
            { n: '5.0', l: 'Google rating, 28 reviews' },
            { n: 'NY',  l: 'State Bar admitted' },
            { n: 'AILA',l: 'Member in good standing' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: 28, borderRight: i < 3 ? '1px solid var(--rule)' : 'none',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 64, lineHeight: 1, color: 'var(--gold)' }}>{s.n}</div>
              <div style={bStyles.asideLbl}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 64 }}>
          <div>
            <div style={bStyles.asideLbl}>The Biography</div>
            <div style={{ ...bStyles.thinRule, marginTop: 18 }} />
          </div>
          <div style={{ fontSize: 19, lineHeight: 1.8, color: 'var(--ink-soft)' }}>
            <p style={{ fontFamily: 'var(--display)', fontSize: 30, lineHeight: 1.35, color: 'var(--ink)', marginBottom: 28 }}>
              <span style={bStyles.dropCap}>A</span>na Kamkhadze brings nearly a decade of exclusive focus on
              U.S. Immigration and Nationality Law &mdash; representing scientists, executives, artists, and
              investors at the highest levels.
            </p>
            <p style={{ marginBottom: 20 }}>
              Holding both a Master of Laws and an MBA from Florida International University, Ana combines
              rigorous legal training with strategic business acumen. Her approach is uniquely suited to the
              complex intersection of talent, enterprise, and immigration law.
            </p>
            <p style={{ marginBottom: 20 }}>
              Licensed in New York and representing clients nationwide and internationally, Ana&rsquo;s practice
              spans the full spectrum of business immigration &mdash; from extraordinary-ability visas to investor
              pathways to family-based petitions.
            </p>
            <p>
              Recognized as a Best Lawyers&reg; &ldquo;One to Watch&rdquo; in U.S. Immigration Law and listed by
              Expertise.com among the best immigration attorneys in Hollywood, Florida, Ana&rsquo;s work has been
              featured in Entrepreneur, Yahoo Finance, Benzinga, and television interviews.
            </p>
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--bg-alt)', borderTop: '1px solid var(--rule)' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 40 }}>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 52px)' }}>The Record.</h2>
            <span style={bStyles.asideLbl}>Credentials &middot; Recognition</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0, borderTop: '1px solid var(--rule)' }}>
            {CREDENTIALS.map((c, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '180px 1fr 180px',
                gap: 24, padding: '24px 0', borderBottom: '1px solid var(--rule)',
                alignItems: 'baseline',
              }}>
                <span style={{ ...bStyles.asideLbl, color: 'var(--gold)' }}>{c.year || '—'}</span>
                <span style={{ fontFamily: 'var(--display)', fontSize: 26 }}>{c.title}</span>
                <span style={{ fontSize: 14, color: 'var(--ink-mute)' }}>{c.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <B_CTABand goto={goto} />
    </main>
  );
}

/* ── Services ──────────────────────────────────────────────────── */

function B_Services({ goto }) {
  return (
    <main>
      <BIssueStrip />
      <section className="section" style={{ paddingTop: 56 }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'end' }}>
          <div>
            <div style={bStyles.asideLbl}>Index</div>
            <h1 style={{ marginTop: 24 }}>Counsel for<br /><span className="italic">every pathway.</span></h1>
          </div>
          <p style={{ fontSize: 19, lineHeight: 1.7, color: 'var(--ink-soft)' }}>
            From flagship extraordinary-ability petitions to family-based green cards, Kamkhadze PA
            represents clients across the full spectrum of U.S. immigration law.
          </p>
        </div>
      </section>

      <section className="section-tight" style={{ borderTop: '1px solid var(--rule)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 48, alignItems: 'start' }}>
            <div style={{ position: 'sticky', top: 100 }}>
              <div style={bStyles.asideLbl}>Section</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 36, marginTop: 8 }}>I.</div>
              <div style={{ marginTop: 16, ...bStyles.asideLbl, color: 'var(--gold)' }}>Employment-Based</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {SERVICES_EMPLOYMENT.map((s, i) => (
                <article key={s.id} style={{
                  display: 'grid', gridTemplateColumns: '80px 130px 1fr auto', gap: 32,
                  padding: '28px 0', borderBottom: '1px solid var(--rule)',
                  alignItems: 'baseline',
                }}>
                  <span style={bStyles.asideLbl}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ ...bStyles.asideLbl, color: 'var(--gold)' }}>{s.tag}</span>
                  <div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1.15 }}>{s.name}</div>
                    <div style={{ fontSize: 15, color: 'var(--ink-mute)', marginTop: 8, lineHeight: 1.6 }}>{s.blurb}</div>
                  </div>
                  <a className="lnk" onClick={() => goto('contact')}>Inquire &rarr;</a>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-tight" style={{ background: 'var(--bg-alt)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 48, alignItems: 'start' }}>
            <div>
              <div style={bStyles.asideLbl}>Section</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 36, marginTop: 8 }}>II.</div>
              <div style={{ marginTop: 16, ...bStyles.asideLbl, color: 'var(--gold)' }}>Family-Based</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {SERVICES_FAMILY.map((s, i) => (
                <article key={s.id} style={{
                  display: 'grid', gridTemplateColumns: '80px 130px 1fr auto', gap: 32,
                  padding: '28px 0', borderBottom: '1px solid var(--rule)',
                  alignItems: 'baseline',
                }}>
                  <span style={bStyles.asideLbl}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ ...bStyles.asideLbl, color: 'var(--gold)' }}>{s.tag}</span>
                  <div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1.15 }}>{s.name}</div>
                    <div style={{ fontSize: 15, color: 'var(--ink-mute)', marginTop: 8, lineHeight: 1.6 }}>{s.blurb}</div>
                  </div>
                  <a className="lnk" onClick={() => goto('contact')}>Inquire &rarr;</a>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
      <B_CTABand goto={goto} />
    </main>
  );
}

/* ── Testimonials ─────────────────────────────────────────────── */

function B_Testimonials({ goto }) {
  return (
    <main>
      <BIssueStrip />
      <section className="section" style={{ paddingTop: 56 }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'end' }}>
          <div>
            <div style={bStyles.asideLbl}>The Letters Page</div>
            <h1 style={{ marginTop: 24 }}>Trusted by<br /><span className="italic">exceptional talent.</span></h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 96, lineHeight: 1, color: 'var(--gold)' }}>5.0</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Stars />
              <span style={bStyles.asideLbl}>28 Google Reviews</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-tight" style={{ borderTop: '1px solid var(--rule)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 64px' }}>
            {REVIEWS.map((r, i) => (
              <blockquote key={i} style={{
                margin: 0, padding: '32px 0', borderBottom: '1px solid var(--rule)',
                display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Stars />
                  {r.tag && <span className="tag">{r.tag}</span>}
                </div>
                <p style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.5 }}>
                  <span style={bStyles.dropCap}>&ldquo;</span>{r.body}&rdquo;
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 18 }}>{r.name}</div>
                  <div style={bStyles.asideLbl}>{r.date}</div>
                </div>
              </blockquote>
            ))}
          </div>
        </div>
      </section>
      <B_CTABand goto={goto} />
    </main>
  );
}

/* ── Press ────────────────────────────────────────────────────── */

function B_Press({ goto }) {
  return (
    <main>
      <BIssueStrip />
      <section className="section" style={{ paddingTop: 56 }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'end' }}>
          <div>
            <div style={bStyles.asideLbl}>In the Spotlight</div>
            <h1 style={{ marginTop: 24 }}>Press &<br /><span className="italic">media features.</span></h1>
          </div>
          <p style={{ fontSize: 19, lineHeight: 1.7, color: 'var(--ink-soft)' }}>
            A selection of recent appearances and contributions across business, finance, and immigration media.
          </p>
        </div>
      </section>

      <section className="section-tight" style={{ borderTop: '1px solid var(--rule)' }}>
        <div className="container">
          {PRESS.map((p, i) => (
            <a key={i} style={{
              display: 'grid', gridTemplateColumns: '120px 220px 1fr 80px', gap: 32,
              padding: '36px 0', borderBottom: '1px solid var(--rule)',
              alignItems: 'baseline', cursor: 'pointer',
            }}>
              <span style={{ ...bStyles.asideLbl, color: 'var(--gold)' }}>{p.date}</span>
              <span style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 26 }}>{p.source}</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1.2 }}>{p.title}</span>
              <span style={{ textAlign: 'right' }}><span className="lnk">Read &rarr;</span></span>
            </a>
          ))}
        </div>
      </section>
      <B_CTABand goto={goto} />
    </main>
  );
}

/* ── Blog ─────────────────────────────────────────────────────── */

function B_Blog({ goto }) {
  return (
    <main>
      <BIssueStrip />
      <section className="section" style={{ paddingTop: 56 }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'end' }}>
          <div>
            <div style={bStyles.asideLbl}>Insights &middot; The Journal</div>
            <h1 style={{ marginTop: 24 }}>The<br /><span className="italic">Kamkhadze Journal.</span></h1>
          </div>
          <p style={{ fontSize: 19, lineHeight: 1.7, color: 'var(--ink-soft)' }}>
            Strategy notes, practice updates, and adjudication trends from our work in extraordinary-ability immigration.
          </p>
        </div>
      </section>

      <section className="section" style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', background: 'var(--bg-alt)' }}>
        <div className="container">
          <article style={{
            display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: 56, alignItems: 'center',
          }}>
            <Img label="EDITORIAL ILLUSTRATION \u00B7 4:5" aspect="4/5" />
            <div>
              <div style={{ ...bStyles.asideLbl, color: 'var(--gold)' }}>{INSIGHTS[0].kicker} &middot; The Feature</div>
              <h2 style={{ marginTop: 18, marginBottom: 24, fontSize: 'clamp(32px, 4.4vw, 60px)' }}>{INSIGHTS[0].title}</h2>
              <p style={{ fontSize: 19, lineHeight: 1.75, color: 'var(--ink-soft)', marginBottom: 28 }}>
                <span style={bStyles.dropCap}>A</span>structured method for assembling acclaim evidence: how to
                identify the right artifacts, rank them by adjudicative weight, and present them as a coherent
                narrative the officer can verify.
              </p>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <a className="lnk">Read the Note &rarr;</a>
                <span style={bStyles.asideLbl}>{INSIGHTS[0].date} &middot; {INSIGHTS[0].read} read</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="section-tight">
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32, borderBottom: '1px solid var(--rule)', paddingBottom: 18 }}>
            <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 40px)' }}>More from the Journal</h2>
            <span style={bStyles.asideLbl}>Archive &middot; All Notes</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 64px' }}>
            {INSIGHTS.slice(1).map((p, i) => (
              <article key={i} style={{
                padding: '24px 0', borderBottom: '1px solid var(--rule)',
                display: 'grid', gridTemplateColumns: '70px 1fr', gap: 24, alignItems: 'baseline',
              }}>
                <span style={{ ...bStyles.asideLbl, color: 'var(--gold)' }}>{String(i + 2).padStart(2, '0')}</span>
                <div>
                  <div style={{ ...bStyles.asideLbl, color: 'var(--ink-mute)', marginBottom: 8 }}>{p.kicker} &middot; {p.date}</div>
                  <h3 style={{ fontSize: 24, lineHeight: 1.25 }}>{p.title}</h3>
                  <div style={{ ...bStyles.asideLbl, marginTop: 8 }}>{p.read} read &rarr;</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <B_CTABand goto={goto} />
    </main>
  );
}

/* ── Contact ──────────────────────────────────────────────────── */

function B_Contact({ goto }) {
  return (
    <main>
      <BIssueStrip />
      <section className="section" style={{ paddingTop: 56 }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(40px, 6vw, 96px)' }}>
            <div>
              <div style={bStyles.asideLbl}>Correspondence</div>
              <h1 style={{ marginTop: 24, marginBottom: 24 }}>
                Begin a<br /><span className="italic">confidential conversation.</span>
              </h1>
              <p style={{ fontSize: 19, color: 'var(--ink-soft)', lineHeight: 1.7, marginBottom: 36 }}>
                Tell us about your goals. We will respond within one business day to coordinate a confidential consultation.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  ['By Email', 'anka@esq.mba'],
                  ['By Telephone', '+1 (786) 590-9400'],
                  ['Principal Office', 'Hollywood Beach, Florida'],
                  ['Representation', 'Nationwide & Worldwide'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, padding: '18px 0', borderBottom: '1px solid var(--rule)', alignItems: 'baseline' }}>
                    <span style={bStyles.asideLbl}>{k}</span>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 22 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}

Object.assign(window, {
  B_Home, B_About, B_Services, B_Testimonials, B_Press, B_Blog, B_Contact,
});
