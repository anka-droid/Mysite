// app.jsx — main app: hash router, direction switcher, tweaks panel.

const { useState, useEffect, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "direction": "a",
  "dark": false,
  "density": "regular",
  "heroVariant": "split",
  "imagery": "stylized",
  "fontPair": "default",
  "palette": "navyGold"
}/*EDITMODE-END*/;

const PALETTES = {
  navyGold: { name: 'Navy & Gold (default)', a: { deep: '#0B1E3F', gold: '#B58E3D', bg: '#F5F1E8' }, b: { deep: '#11203D', gold: '#C8A24A', bg: '#FAF7F0' } },
  oxbloodBrass: { name: 'Oxblood & Brass', a: { deep: '#3A0F18', gold: '#B7944A', bg: '#F4EEE3' }, b: { deep: '#3A0F18', gold: '#C8A24A', bg: '#F8F2E6' } },
  forestCopper: { name: 'Forest & Copper', a: { deep: '#11362B', gold: '#B66B3F', bg: '#F2EFE5' }, b: { deep: '#0F2E25', gold: '#C97B47', bg: '#F6F2E7' } },
  inkSlate: { name: 'Ink & Slate', a: { deep: '#16181D', gold: '#8C7A56', bg: '#EEEAE0' }, b: { deep: '#1A1C22', gold: '#9C8B65', bg: '#F2EEE3' } },
};

const FONT_PAIRS = {
  default: { name: 'Default per direction', aDisplay: null, aBody: null, bDisplay: null, bBody: null },
  classic: { name: 'Playfair + Source Sans', aDisplay: '"Playfair Display", serif', aBody: '"Source Sans 3", "Helvetica Neue", sans-serif', bDisplay: '"Playfair Display", serif', bBody: '"Source Serif 4", Georgia, serif' },
  modern:  { name: 'Bodoni Moda + Manrope',  aDisplay: '"Bodoni Moda", serif',         aBody: '"Manrope", sans-serif',                            bDisplay: '"Bodoni Moda", serif',         bBody: '"EB Garamond", Georgia, serif' },
  geo:     { name: 'Spectral + Lato',         aDisplay: '"Spectral", serif',           aBody: '"Lato", sans-serif',                                bDisplay: '"Spectral", serif',            bBody: '"Spectral", Georgia, serif' },
};

/* ── tiny hash router ─────────────────────────────────────────── */
function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const parts = h.split('/');
  return parts[0] || 'home';
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = useState(parseHash());

  useEffect(() => {
    const fn = () => setPage(parseHash());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);

  const goto = (p) => {
    window.location.hash = `/${p}`;
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // apply palette and font overrides via inline <style>
  const overrideCss = useMemo(() => {
    const p = PALETTES[t.palette] || PALETTES.navyGold;
    const f = FONT_PAIRS[t.fontPair] || FONT_PAIRS.default;
    let css = '';
    css += `[data-dir="a"]{--bg-deep:${p.a.deep};--gold:${p.a.gold};--bg:${p.a.bg};}`;
    css += `[data-dir="b"]{--bg-deep:${p.b.deep};--gold:${p.b.gold};--bg:${p.b.bg};}`;
    if (f.aDisplay) css += `[data-dir="a"]{--display:${f.aDisplay};--body:${f.aBody};}`;
    if (f.bDisplay) css += `[data-dir="b"]{--display:${f.bDisplay};--body:${f.bBody};}`;
    return css;
  }, [t.palette, t.fontPair]);

  const PageComp = useMemo(() => {
    if (t.direction === 'b') {
      return {
        home: B_Home, about: B_About, services: B_Services,
        testimonials: B_Testimonials, press: B_Press, blog: B_Blog, contact: B_Contact,
      }[page] || B_Home;
    }
    return {
      home: A_Home, about: A_About, services: A_Services,
      testimonials: A_Testimonials, press: A_Press, blog: A_Blog, contact: A_Contact,
    }[page] || A_Home;
  }, [t.direction, page]);

  return (
    <div
      className="site-shell"
      data-dir={t.direction}
      data-dark={t.dark ? 'true' : 'false'}
      data-density={t.density}
      data-screen-label={`${t.direction === 'a' ? 'A' : 'B'} / ${page}`}>

      <style>{overrideCss}</style>

      <Header page={page} goto={goto} />
      <PageComp goto={goto} heroVariant={t.heroVariant} />
      <Footer goto={goto} />

      <DirectionSwitch value={t.direction} onChange={(v) => setTweak('direction', v)} />

      <TweaksPanel>
        <TweakSection label="Direction" />
        <TweakRadio label="Variation"
          value={t.direction}
          options={[{ value: 'a', label: 'A · Chambers' }, { value: 'b', label: 'B · Quarterly' }]}
          onChange={(v) => setTweak('direction', v)} />
        <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak('dark', v)} />

        <TweakSection label="Hero" />
        <TweakRadio label="Layout"
          value={t.heroVariant}
          options={[
            { value: 'split', label: 'Split' },
            { value: 'centered', label: 'Center' },
            { value: 'fullbleed', label: 'Bleed' },
          ]}
          onChange={(v) => setTweak('heroVariant', v)} />

        <TweakSection label="Color Palette" />
        <TweakSelect label="Palette"
          value={t.palette}
          options={Object.keys(PALETTES).map(k => ({ value: k, label: PALETTES[k].name }))}
          onChange={(v) => setTweak('palette', v)} />

        <TweakSection label="Typography" />
        <TweakSelect label="Font pairing"
          value={t.fontPair}
          options={Object.keys(FONT_PAIRS).map(k => ({ value: k, label: FONT_PAIRS[k].name }))}
          onChange={(v) => setTweak('fontPair', v)} />

        <TweakSection label="Density" />
        <TweakRadio label="Spacing"
          value={t.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)} />

        <TweakSection label="Imagery" />
        <TweakRadio label="Style"
          value={t.imagery}
          options={[
            { value: 'stylized', label: 'Stylized' },
            { value: 'wireframe', label: 'Wire' },
          ]}
          onChange={(v) => setTweak('imagery', v)} />
      </TweaksPanel>
    </div>
  );
}

function DirectionSwitch({ value, onChange }) {
  return (
    <div className="dir-switch" role="group" aria-label="Direction">
      <button className={value === 'a' ? 'on' : ''} onClick={() => onChange('a')}>A · Chambers</button>
      <button className={value === 'b' ? 'on' : ''} onClick={() => onChange('b')}>B · Quarterly</button>
    </div>
  );
}

// apply imagery wireframe via global class on body
window.addEventListener('DOMContentLoaded', () => {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
});
