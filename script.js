/* ESQ.MBA — Interactions */

// Nav scroll effect
const nav = document.getElementById('nav');
const onScroll = () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Mobile nav toggle
const toggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
toggle?.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  const spans = toggle.querySelectorAll('span');
  spans[0].style.transform = navLinks.classList.contains('open') ? 'rotate(45deg) translate(5px, 5px)' : '';
  spans[1].style.opacity = navLinks.classList.contains('open') ? '0' : '';
  spans[2].style.transform = navLinks.classList.contains('open') ? 'rotate(-45deg) translate(5px, -5px)' : '';
});

// Close nav on link click
navLinks?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    toggle.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
  });
});

// Visa tabs
document.querySelectorAll('.visa-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.visa-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.visa-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab)?.classList.add('active');
  });
});

// FAQ accordion
document.querySelectorAll('.faq-item').forEach(item => {
  item.querySelector('.faq-q').addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// Scroll reveal
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('[data-reveal]').forEach(el => revealObserver.observe(el));

// Auto-add reveal to major elements
const autoRevealSelectors = [
  '.expertise-card',
  '.process-step',
  '.faq-item',
  '.visa-content-grid > *',
  '.about-content > *',
  '.section-tag',
  '.trust-logo',
];

autoRevealSelectors.forEach(sel => {
  document.querySelectorAll(sel).forEach((el, i) => {
    if (!el.hasAttribute('data-reveal')) {
      el.setAttribute('data-reveal', '');
      el.setAttribute('data-reveal-delay', Math.min(i % 4, 4).toString());
      revealObserver.observe(el);
    }
  });
});

// Contact form
document.getElementById('contactForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.textContent = 'Message Sent — Thank You';
  btn.disabled = true;
  btn.style.background = '#2d5a27';
  btn.style.color = '#a8d5a2';
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
    btn.style.background = '';
    btn.style.color = '';
    e.target.reset();
  }, 4000);
});
