/* ============================================================
   SITE.JS — Kamkhadze PA Shared Components + Interactions
   Injects nav + footer, handles dynamic island, mobile menu,
   scroll animations. Used by all inner pages.
============================================================ */

/* ── SHARED NAV HTML ─────────────────────────────────────── */
const NAV_HTML = `
<nav class="nav" id="mainNav">
  <a href="index.html" class="nav-logo">
    <div class="nav-mark">
      <svg width="20" height="20" viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <line x1="28" y1="15" x2="28" y2="81" stroke="white" stroke-width="7" stroke-linecap="butt"/>
        <line x1="28" y1="43" x2="73" y2="15" stroke="white" stroke-width="4.5" stroke-linecap="butt"/>
        <line x1="28" y1="51" x2="73" y2="81" stroke="white" stroke-width="4.5" stroke-linecap="butt"/>
      </svg>
    </div>
    <div class="nav-name-text">
      Kamkhadze PA
      <small>U.S. Immigration Law</small>
    </div>
  </a>
  <ul class="nav-links" id="navLinks">
    <li><a href="index.html">Home</a></li>
    <li><a href="about.html">About</a></li>
    <li class="nav-item">
      <a href="employment.html">Employment-Based ▾</a>
      <div class="nav-dropdown">
        <a href="employment.html#o1a">O-1A Extraordinary Ability</a>
        <a href="employment.html#o1b">O-1B Arts &amp; Entertainment</a>
        <a href="employment.html#eb1a">EB-1A Green Card</a>
        <a href="employment.html#eb1b">EB-1B Outstanding Researchers</a>
        <a href="employment.html#eb1c">EB-1C Multinational Managers</a>
        <a href="employment.html#eb2niw">EB-2 National Interest Waiver</a>
        <a href="employment.html#h1b">H-1B Specialty Occupation</a>
        <a href="employment.html#l1">L-1 Intracompany Transfer</a>
        <a href="employment.html#e2">E-2 Treaty Investor</a>
        <a href="employment.html#tn">TN Professional</a>
      </div>
    </li>
    <li class="nav-item">
      <a href="family.html">Family-Based ▾</a>
      <div class="nav-dropdown">
        <a href="family.html#marriage">Marriage-Based Green Card</a>
        <a href="family.html#naturalization">Naturalization &amp; Citizenship</a>
        <a href="family.html#other">Other Family Petitions</a>
      </div>
    </li>
    <li><a href="blog.html">Insights</a></li>
    <li><a href="press.html">Press</a></li>
    <li><a href="../contact.html" class="nav-cta">Schedule Consultation</a></li>
  </ul>
  <button class="nav-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false">
    <span></span><span></span><span></span>
  </button>
</nav>
`;

/* ── SHARED FOOTER HTML ──────────────────────────────────── */
const FOOTER_HTML = `
<footer>
  <div class="footer-top">
    <div>
      <div class="footer-brand-name">Kamkhadze PA</div>
      <p class="footer-brand-sub">U.S. Immigration Law Firm</p>
      <p class="footer-brand-desc">Elite immigration representation for extraordinary individuals — scientists, executives, artists, investors, and families — nationwide and internationally.<br><br>+1 (786) 590-9400<br>anka@esq.mba</p>
    </div>
    <div class="footer-col">
      <div class="footer-col-title">Employment</div>
      <ul>
        <li><a href="employment.html#o1a">O-1A Extraordinary Ability</a></li>
        <li><a href="employment.html#o1b">O-1B Arts &amp; Entertainment</a></li>
        <li><a href="employment.html#eb1a">EB-1A Green Card</a></li>
        <li><a href="employment.html#eb1b">EB-1B Researchers</a></li>
        <li><a href="employment.html#eb1c">EB-1C Executives</a></li>
        <li><a href="employment.html#eb2niw">EB-2 NIW</a></li>
        <li><a href="employment.html#h1b">H-1B</a></li>
        <li><a href="employment.html#l1">L-1</a></li>
        <li><a href="employment.html#e2">E-2</a></li>
        <li><a href="employment.html#tn">TN</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <div class="footer-col-title">Family</div>
      <ul>
        <li><a href="family.html#marriage">Marriage-Based Green Card</a></li>
        <li><a href="family.html#naturalization">Naturalization</a></li>
        <li><a href="family.html#other">Other Family Petitions</a></li>
      </ul>
      <div class="footer-col-title" style="margin-top:24px">Firm</div>
      <ul>
        <li><a href="about.html">About Ana Kamkhadze</a></li>
        <li><a href="blog.html">Insights &amp; Analysis</a></li>
        <li><a href="press.html">In the Spotlight</a></li>
        <li><a href="../contact.html">Contact &amp; Location</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <div class="footer-col-title">Contact</div>
      <ul>
        <li><a href="mailto:anka@esq.mba">anka@esq.mba</a></li>
        <li><a href="tel:+17865909400">+1 (786) 590-9400</a></li>
        <li><a href="../contact.html">Hollywood Beach, FL</a></li>
        <li><a href="../contact.html">Consultations Worldwide</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span class="footer-copy">© 2025 Kamkhadze PA. All rights reserved.</span>
    <span>Hollywood Beach, Florida · Serving Clients Nationwide &amp; Internationally</span>
  </div>
  <p class="footer-disclaimer">Attorney Advertising. This website is for informational purposes only and does not constitute legal advice. Prior results do not guarantee a similar outcome. Kamkhadze PA is licensed to practice in New York. Immigration law is federal law; the firm represents clients in immigration matters in all U.S. states and abroad.</p>
</footer>
`;

/* ── INJECT COMPONENTS ──────────────────────────────────── */
(function injectComponents() {
  const navSlot = document.getElementById('site-nav');
  if (navSlot) {
    navSlot.insertAdjacentHTML('beforebegin', NAV_HTML);
    navSlot.remove();
  }

  const footerSlot = document.getElementById('site-footer');
  if (footerSlot) {
    footerSlot.insertAdjacentHTML('beforebegin', FOOTER_HTML);
    footerSlot.remove();
  }

  // Highlight active page in nav
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links > li > a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });
})();

/* ── DYNAMIC ISLAND ─────────────────────────────────────── */
(function initDynamicIsland() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;

  function updateNav() {
    const y = window.scrollY;
    if (y > 90) {
      nav.classList.add('island');
      nav.classList.remove('at-top-scrolled');
    } else if (y > 10) {
      nav.classList.add('at-top-scrolled');
      nav.classList.remove('island');
    } else {
      nav.classList.remove('island', 'at-top-scrolled');
    }
  }

  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();
})();

/* ── MOBILE MENU ────────────────────────────────────────── */
(function initMobileMenu() {
  const toggle = document.getElementById('navToggle');
  const links  = document.getElementById('navLinks');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
    const spans = toggle.querySelectorAll('span');
    spans[0].style.transform = open ? 'rotate(45deg) translate(5px,5px)' : '';
    spans[1].style.opacity   = open ? '0' : '';
    spans[2].style.transform = open ? 'rotate(-45deg) translate(5px,-5px)' : '';
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!toggle.contains(e.target) && !links.contains(e.target)) {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    }
  });
})();

/* ── SCROLL ANIMATIONS ──────────────────────────────────── */
(function initScrollAnimations() {
  const motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!motionOK) {
    document.querySelectorAll('.animate-up, .animate-fade')
      .forEach(el => el.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.animate-up, .animate-fade')
    .forEach(el => observer.observe(el));
})();
