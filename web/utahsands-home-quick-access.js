/*
 * Utah Sands homepage resident access strip.
 * Staged for integration into the existing ChatGPT Sites homepage.
 * This is not deployed to utahsands.com by committing this file.
 * Add <script defer src="/assets/utahsands-home-quick-access.js"></script>
 * after copying this asset into the WEBSITE project.
 */
(() => {
  if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') return;
  if (document.getElementById('us-home-quick-access')) return;

  const css = `
    #us-home-quick-access {
      --us-dark: #234535;
      --us-sage: #527561;
      --us-ink: #263c32;
      --us-line: #dcded5;
      --us-paper: #fbfaf6;
      width: 100%;
      box-sizing: border-box;
      position: relative;
      z-index: 3;
      isolation: isolate;
      background: linear-gradient(100deg, #eef1ea 0%, #f7f5ef 100%);
      border-block: 1px solid var(--us-line);
      color: var(--us-ink);
    }
    #us-home-quick-access *,
    #us-home-quick-access *::before,
    #us-home-quick-access *::after { box-sizing: border-box; }
    #us-home-quick-access .us-qa-inner {
      max-width: 1200px;
      margin-inline: auto;
      padding: 15px clamp(18px, 4vw, 50px) 14px;
    }
    #us-home-quick-access .us-qa-header {
      display: flex;
      gap: 15px;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    #us-home-quick-access .us-qa-eyebrow {
      margin: 0;
      font: 700 10px/1.5 system-ui, -apple-system, sans-serif;
      text-transform: uppercase;
      letter-spacing: .18em;
      color: #547362;
    }
    #us-home-quick-access .us-qa-header-note {
      margin: 0;
      font: 500 11px/1.4 system-ui, -apple-system, sans-serif;
      color: #63776b;
    }
    #us-home-quick-access .us-qa-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0,1fr));
      gap: 10px;
      align-items: stretch;
    }
    #us-home-quick-access a.us-qa-action {
      min-width: 0;
      display: flex;
      gap: 13px;
      align-items: center;
      padding: 14px 17px;
      text-decoration: none !important;
      border-radius: 12px;
      border: 1px solid #dedfd6;
      color: var(--us-ink) !important;
      background: rgba(255,255,255,.82);
      box-shadow: 0 3px 15px rgba(41,64,44,.035);
      transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #us-home-quick-access a.us-qa-action:hover {
      transform: translateY(-2px);
      box-shadow: 0 7px 22px rgba(35,69,53,.12);
      border-color: #bbc8b9;
    }
    #us-home-quick-access a.us-qa-action:focus-visible {
      outline: 3px solid #b48a53 !important;
      outline-offset: 3px;
    }
    #us-home-quick-access a.us-qa-rent {
      background: linear-gradient(130deg, #234535 0%, #365b45 100%);
      border-color: #234535;
      color: #fff !important;
      box-shadow: 0 4px 19px rgba(35,69,53,.15);
    }
    #us-home-quick-access a.us-qa-rent:hover { border-color: #3c6850; }
    #us-home-quick-access a.us-qa-maintenance { background: #fff; }
    #us-home-quick-access a.us-qa-apply { background: #f2eee5; border-color: #e1d9c9; }
    #us-home-quick-access .us-qa-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      flex: 0 0 38px;
      display: grid;
      place-items: center;
      background: #eaf0e9;
      color: #315342;
    }
    #us-home-quick-access .us-qa-rent .us-qa-icon {
      background: rgba(255,255,255,.14);
      color: #fff;
    }
    #us-home-quick-access .us-qa-apply .us-qa-icon { background: #e8e1d3; }
    #us-home-quick-access .us-qa-icon svg {
      width: 20px;
      height: 20px;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }
    #us-home-quick-access .us-qa-label {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    #us-home-quick-access .us-qa-title {
      font-size: 15px;
      line-height: 1.26;
      letter-spacing: -.02em;
      font-weight: 710;
      color: inherit;
    }
    #us-home-quick-access .us-qa-subtitle {
      font-size: 11px;
      line-height: 1.45;
      margin-top: 4px;
      color: #6a756e;
    }
    #us-home-quick-access .us-qa-rent .us-qa-subtitle { color: #dae8de; }
    #us-home-quick-access .us-qa-arrow {
      flex: 0 0 auto;
      font-size: 16px;
      line-height: 1;
      opacity: .7;
    }
    #us-home-quick-access .us-qa-disclaimer {
      margin: 9px 0 0;
      font: 500 10px/1.4 system-ui, -apple-system, sans-serif;
      color: #647368;
    }
    @media (max-width: 740px) {
      #us-home-quick-access .us-qa-inner { padding: 12px 14px 12px; }
      #us-home-quick-access .us-qa-header { margin-bottom: 9px; }
      #us-home-quick-access .us-qa-header-note { display: none; }
      #us-home-quick-access .us-qa-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
      #us-home-quick-access a.us-qa-action { padding: 11px 10px; gap: 8px; min-height: 69px; border-radius: 10px; }
      #us-home-quick-access .us-qa-title { font-size: 13px; }
      #us-home-quick-access .us-qa-subtitle { font-size: 10px; }
      #us-home-quick-access .us-qa-icon { width: 31px; height: 31px; flex-basis: 31px; border-radius: 8px; }
      #us-home-quick-access .us-qa-icon svg { width: 17px; height: 17px; }
      #us-home-quick-access .us-qa-arrow { display: none; }
      #us-home-quick-access a.us-qa-apply { grid-column: 1 / -1; min-height: 50px; }
      #us-home-quick-access .us-qa-apply .us-qa-label { flex-direction: row; align-items: baseline; gap: 9px; flex-wrap: wrap; }
      #us-home-quick-access .us-qa-apply .us-qa-subtitle { margin-top: 0; }
      #us-home-quick-access .us-qa-disclaimer { margin-top: 8px; font-size: 9px; }
    }
    @media (max-width: 350px) {
      #us-home-quick-access a.us-qa-action { gap: 6px; padding-inline: 8px; }
      #us-home-quick-access .us-qa-title { font-size: 12px; }
      #us-home-quick-access .us-qa-icon { width: 27px; height: 27px; flex-basis: 27px; }
    }
    @media (prefers-reduced-motion: reduce) {
      #us-home-quick-access a.us-qa-action { transition: none; }
      #us-home-quick-access a.us-qa-action:hover { transform: none; }
    }
  `;

  const style = document.createElement('style');
  style.id = 'us-home-quick-access-styles';
  style.textContent = css;
  document.head.appendChild(style);

  const section = document.createElement('section');
  section.id = 'us-home-quick-access';
  section.setAttribute('aria-label', 'Quick access to resident services and applications');
  section.innerHTML = `
    <div class="us-qa-inner">
      <div class="us-qa-header">
        <p class="us-qa-eyebrow">Quick access</p>
        <p class="us-qa-header-note">For residents &amp; future renters</p>
      </div>
      <nav class="us-qa-grid" aria-label="Resident and rental quick links">
        <a class="us-qa-action us-qa-rent" href="/pay-rent.html" aria-label="Pay rent, interactive preview, no payments processed">
          <span class="us-qa-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M3 10h18M7 15h4"></path></svg>
          </span>
          <span class="us-qa-label">
            <strong class="us-qa-title">Pay rent</strong>
            <span class="us-qa-subtitle">Payment preview</span>
          </span>
          <span class="us-qa-arrow" aria-hidden="true">↗</span>
        </a>
        <a class="us-qa-action us-qa-maintenance" href="/maintenance.html" aria-label="Request maintenance, interactive preview, not sent to a landlord">
          <span class="us-qa-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M14.5 6.5a5 5 0 0 0-6.6 6.6L3 18a2.1 2.1 0 0 0 3 3l4.9-4.9a5 5 0 0 0 6.6-6.6l-3 3-3-3 3-3z"></path></svg>
          </span>
          <span class="us-qa-label">
            <strong class="us-qa-title">Maintenance</strong>
            <span class="us-qa-subtitle">Request preview</span>
          </span>
          <span class="us-qa-arrow" aria-hidden="true">↗</span>
        </a>
        <a class="us-qa-action us-qa-apply" href="/#details" aria-label="Apply for the home, applications not yet open, view rental details">
          <span class="us-qa-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h4"></path></svg>
          </span>
          <span class="us-qa-label">
            <strong class="us-qa-title">Apply for the home</strong>
            <span class="us-qa-subtitle">Not open yet · View details</span>
          </span>
          <span class="us-qa-arrow" aria-hidden="true">↗</span>
        </a>
      </nav>
      <p class="us-qa-disclaimer">
        Payment and maintenance tools are demos; no payment is collected or request delivered. Applications are not open.
      </p>
    </div>
  `;

  const main = document.querySelector('main');
  if (main) {
    main.insertAdjacentElement('beforebegin', section);
  } else {
    document.body.prepend(section);
  }
})();
