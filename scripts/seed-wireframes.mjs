// Seeds visual HTML wireframes into the running architecture-notebook notebook.
// Each section body uses inline-styled divs that reuse the live design tokens
// (--accent, --bg-pane, --border, --type-*, --sans, --mono) so the mockup looks
// like the real component rather than ASCII art.
//
// Idempotent: GET each target; PATCH if exists, POST under `ui` if not.
// Usage: server running with data/.port populated → `node scripts/seed-wireframes.mjs`.

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const NOTEBOOK = 'architecture-notebook';
const PARENT_SLUG = 'ui';
const AUTHOR = 'claude';
const base = (await readFile('data/.port', 'utf8')).trim();

// ─────────────────────────────  primitives  ─────────────────────────────

const frame = (inner) => `<figure class="wf" style="margin:1rem 0;border:1px solid var(--border-strong);border-radius:8px;overflow:hidden;background:var(--bg);font-family:var(--sans);font-size:13px;line-height:1.4;box-shadow:0 1px 2px rgba(0,0,0,0.04);">${inner}</figure>`;

const url_bar = (path) => `<div style="background:var(--bg-strong);padding:6px 12px;font-family:var(--mono);font-size:11px;color:var(--text-muted);border-bottom:1px solid var(--border);">${path}</div>`;

const masthead = ({ brand, breadcrumb, view = null }) => `
  <div style="height:40px;background:var(--bg-pane);border-bottom:1px solid var(--border);display:grid;grid-template-columns:180px 1fr auto;align-items:center;padding:0 0.9rem;gap:1rem;">
    <div style="display:flex;align-items:center;gap:0.45rem;font-size:11.5px;font-weight:500;">
      <span style="width:14px;height:14px;border:1.2px solid var(--text);background:var(--bg-soft);display:inline-block;"></span>
      <span>${brand}</span>
      <span style="font-family:var(--mono);font-size:9px;color:var(--text-muted);padding:1px 4px;background:var(--bg-soft);border:1px solid var(--border);border-radius:3px;margin-left:2px;">rev.0</span>
    </div>
    <div style="font-family:var(--mono);font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${breadcrumb ?? ''}</div>
    ${view === null ? '<div></div>' : `
      <div style="display:inline-flex;background:var(--bg-soft);border:1px solid var(--border);border-radius:4px;padding:2px;gap:1px;font-size:10px;">
        ${['read','toc','print'].map((k) => `<span style="padding:2px 7px;border-radius:2px;font-weight:500;color:${k===view?'var(--text)':'var(--text-muted)'};background:${k===view?'var(--bg-pane)':'transparent'};box-shadow:${k===view?'0 0 0 1px var(--border)':'none'};">${k==='read'?'Read':k==='toc'?'Contents':'Print'}</span>`).join('')}
      </div>`}
  </div>`;

const dot = (type) => `<span style="width:6px;height:6px;border-radius:50%;background:var(--type-${type});display:inline-block;flex-shrink:0;"></span>`;

const tree_row = ({ depth, slug, title, type, num, expanded, current, has_kids }) => {
  const left_pad = 0.4 + depth * 0.55;
  const bg = current ? 'var(--accent-bg)' : 'transparent';
  const fg = current ? 'var(--accent)' : 'var(--text-soft)';
  const w = current ? '500' : '400';
  const chev = !has_kids ? '<span style="width:9px"></span>' : `<span style="display:inline-block;width:9px;text-align:center;font-size:9px;color:var(--text-faint);transform:${expanded?'rotate(90deg)':'none'};transition:transform 0.16s;">›</span>`;
  return `<div style="display:grid;grid-template-columns:9px 1fr auto;align-items:center;gap:4px;padding:2px ${left_pad}rem 2px ${0.3 + depth * 0.55}rem;background:${bg};color:${fg};font-size:11.5px;font-weight:${w};border-radius:3px;">
    ${chev}
    <span style="display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dot(type)}<span>${title}</span></span>
    <span style="font-family:var(--mono);font-size:9px;color:${current?'var(--accent)':'var(--text-faint)'};">${num}</span>
  </div>`;
};

const tree_panel = (rows) => `
  <aside style="border-right:1px solid var(--border);background:var(--bg);padding:0.7rem 0.4rem;">
    <div style="position:relative;margin-bottom:0.5rem;padding:0 0.15rem;">
      <input disabled placeholder="Filter sections" style="width:100%;background:var(--bg-soft);border:1px solid var(--border);border-radius:4px;padding:3px 6px 3px 22px;font-family:var(--sans);font-size:10.5px;color:var(--text-muted);outline:none;" />
      <span style="position:absolute;left:7px;top:50%;transform:translateY(-50%);font-family:var(--mono);font-size:10px;color:var(--text-faint);">⌕</span>
      <span style="position:absolute;right:5px;top:50%;transform:translateY(-50%);font-family:var(--mono);font-size:8.5px;color:var(--text-faint);padding:1px 4px;background:var(--bg-pane);border:1px solid var(--border);border-radius:2px;">⌘K</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:1px;">${rows.map(tree_row).join('')}</div>
  </aside>`;

const type_pill = (slug) => `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--bg-soft);border:1px solid var(--border);border-radius:3px;padding:2px 6px;font-size:10px;color:var(--text-soft);">${dot(slug)}<span>${slug}</span></span>`;

const section_meta = ({ num, type, note }) => `
  <div style="display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10px;color:var(--text-muted);margin-bottom:0.6rem;">
    <span style="color:var(--text);">${num}</span>
    ${type_pill(type)}
    <span style="color:var(--text-faint);">|</span>
    <span>${note}</span>
  </div>`;

const card = ({ header, body }) => `
  <div style="background:var(--bg-pane);border:1px solid var(--border);border-radius:6px;overflow:hidden;margin:0.7rem 0;">
    <div style="background:var(--bg-soft);padding:5px 10px;font-family:var(--mono);font-size:9.5px;color:var(--text-muted);border-bottom:1px solid var(--border);">${header}</div>
    <div style="padding:0.4rem 0.65rem;font-size:11px;">${body}</div>
  </div>`;

const props_card = (rows) => card({
  header: 'properties',
  body: `<dl style="display:grid;grid-template-columns:7rem 1fr;gap:3px 12px;margin:0;">${rows.map(([k,v]) => `<dt style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">${k}</dt><dd style="font-size:11px;color:var(--text);">${v}</dd>`).join('')}</dl>`,
});

const edges_card = (rows) => card({
  header: 'edges',
  body: rows.map(([role,arrow,target,num]) => `<div style="display:grid;grid-template-columns:5rem 1rem 1fr auto;align-items:center;gap:5px;font-size:11px;padding:2px 0;"><span style="font-family:var(--mono);color:var(--text-muted);">${role}</span><span style="color:var(--text-faint);">${arrow}</span><span style="color:var(--accent);border-bottom:1px solid var(--accent-edge);">${target}</span><span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">${num}</span></div>`).join(''),
});

const footmeta_card = ({ revisions, comments }) => `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-top:0.8rem;">
    <div style="background:var(--bg-pane);border:1px solid var(--border);border-radius:6px;padding:0.55rem 0.7rem;">
      <h4 style="font-size:10.5px;font-weight:500;color:var(--text);margin-bottom:5px;">Revisions</h4>
      ${revisions}
    </div>
    <div style="background:var(--bg-pane);border:1px solid var(--border);border-radius:6px;padding:0.55rem 0.7rem;">
      <h4 style="font-size:10.5px;font-weight:500;color:var(--text);margin-bottom:5px;">Comments</h4>
      ${comments}
    </div>
  </div>`;

const ref_link = (label) => `<span style="color:var(--accent);border-bottom:1px solid var(--accent-edge);cursor:pointer;">${label}</span>`;

const grid_shell = ({ cols, body }) => `<div style="display:grid;grid-template-columns:${cols};min-height:280px;">${body}</div>`;

const label_caption = (text) => `<figcaption style="margin-top:0.6rem;font-family:var(--mono);font-size:10.5px;color:var(--text-muted);text-align:center;">${text}</figcaption>`;

// ─────────────────────────────  data  ─────────────────────────────

const ACME_TREE = [
  { depth: 0, type: 'overview', title: 'acme-trading-system', num: '1', expanded: true, has_kids: true },
  { depth: 1, type: 'ui', title: 'User Interfaces', num: '2', expanded: false, has_kids: true },
  { depth: 1, type: 'service', title: 'Backend Services', num: '3', expanded: false, has_kids: true },
  { depth: 1, type: 'integration', title: 'Integrations', num: '4', expanded: false, has_kids: true },
  { depth: 1, type: 'cloud', title: 'Cloud Accounts', num: '5', expanded: true, has_kids: true },
  { depth: 2, type: 'cloud', title: 'Production AWS', num: '5.1', expanded: true, has_kids: true },
  { depth: 3, type: 'infra', title: 'Infrastructure', num: '5.1.1', expanded: true, has_kids: true },
  { depth: 4, type: 'infra', title: 'Ingresses', num: '5.1.1.1', expanded: true, has_kids: true },
  { depth: 5, type: 'ingress', title: 'api.acme.com', num: '5.1.1.1.1', expanded: false, has_kids: false, current: true },
  { depth: 5, type: 'ingress', title: 'app.acme.com', num: '5.1.1.1.2', expanded: false, has_kids: false },
  { depth: 4, type: 'egress', title: 'Egresses', num: '5.1.1.2', expanded: false, has_kids: false },
  { depth: 4, type: 'infra', title: 'Networking', num: '5.1.1.3', expanded: false, has_kids: false },
  { depth: 1, type: 'auth', title: 'Authentication', num: '7', expanded: false, has_kids: true },
];

const READ_SECTION_BODY = `
  <h3 style="font-size:1.4rem;font-weight:500;letter-spacing:-0.018em;line-height:1.15;margin-bottom:0.3rem;">api.acme.com</h3>
  <p style="color:var(--text-muted);font-size:11.5px;margin-bottom:0.6rem;">The public HTTPS entrypoint for the Acme trading API.</p>
  <div style="display:flex;gap:4px;margin-bottom:0.7rem;">
    <span style="font-family:var(--mono);font-size:9px;background:var(--bg-pane);border:1px solid var(--border);border-radius:3px;padding:1px 5px;color:var(--text-muted);">prod</span>
    <span style="font-family:var(--mono);font-size:9px;background:var(--bg-pane);border:1px solid var(--border);border-radius:3px;padding:1px 5px;color:var(--text-muted);">tier-0</span>
  </div>
  ${props_card([['domain','api.acme.com'],['protocol','https'],['tls','true'],['routes-to', ref_link('Order Engine')]])}
  <p style="font-size:11px;line-height:1.5;color:var(--text);margin:0.5rem 0;">Public HTTPS entry point. TLS terminates at an ALB in ${ref_link('Production AWS')} and forwards to ${ref_link('Order Engine')}. All inbound requests carry a JWT issued by ${ref_link('Auth0 RS256')}.</p>
  ${edges_card([['routes-to','→','service-order-engine','3.1'],['uses','→','domain-acme','5.1.1.5.1'],['enforces','→','auth-jwt-policy','7.2']])}
  ${footmeta_card({
    revisions: `<div style="font-family:var(--mono);font-size:9.5px;line-height:1.5;color:var(--text-soft);"><div><b style="color:var(--text);font-weight:500;">r3</b> · claude · 2m</div><div><b style="color:var(--text);font-weight:500;">r2</b> · human · 5m</div></div><div style="font-family:var(--mono);font-size:9.5px;color:var(--accent);margin-top:5px;">View all (3) →</div>`,
    comments: `<div style="font-family:var(--mono);font-size:9.5px;color:var(--text-muted);">2 open</div><div style="font-family:var(--mono);font-size:9.5px;color:var(--accent);margin-top:5px;">+ Add comment</div>`,
  })}`;

// ─────────────────────────────  wireframes  ─────────────────────────────

const wf_landing = () => {
  const card_html = ({ slug, title, count, when }) => `
    <div style="background:var(--bg-pane);border:1px solid var(--border);border-radius:6px;padding:0.6rem 0.75rem;min-height:80px;position:relative;display:flex;flex-direction:column;gap:5px;">
      <span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent);"></span>
      <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:9.5px;color:var(--text-muted);">
        <span>${slug}</span><span style="color:var(--text-faint);">rev.0</span>
      </div>
      <div style="font-size:13px;font-weight:500;letter-spacing:-0.012em;line-height:1.15;color:var(--text);">${title}</div>
      <div style="font-family:var(--mono);font-size:9.5px;color:var(--text-muted);margin-top:auto;">${count} sections · ${when}</div>
    </div>`;
  const new_tile = `
    <div style="border:1.5px dashed var(--border-strong);border-radius:6px;padding:0.7rem;min-height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--text-muted);text-align:center;">
      <span style="font-size:1.4rem;color:var(--accent);font-weight:300;line-height:1;">+</span>
      <span style="font-size:11.5px;font-weight:500;color:var(--text);">New Notebook</span>
      <span style="font-family:var(--mono);font-size:9px;color:var(--text-faint);">Start a fresh architecture</span>
    </div>`;
  return frame(
    url_bar('#/') +
    masthead({ brand: 'Architecture Notebook', breadcrumb: '', view: null }) +
    `<div style="padding:1.4rem 1.7rem 1.7rem;">
      <div style="font-family:var(--mono);font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.02em;margin-bottom:0.3rem;">Architecture Notebook ─</div>
      <h3 style="font-size:1.7rem;font-weight:500;letter-spacing:-0.025em;line-height:1.05;color:var(--text);margin-bottom:0.4rem;">Notebooks</h3>
      <p style="color:var(--text-muted);font-size:11.5px;margin-bottom:1rem;">Choose a notebook to open, or start a new one.</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.65rem;">
        ${card_html({ slug: 'acme-trading', title: 'Acme Trading System', count: 32, when: '2h ago' })}
        ${card_html({ slug: 'architecture-notebook', title: 'Architecture Notebook (self)', count: 42, when: 'just now' })}
        ${new_tile}
      </div>
    </div>`
  ) + label_caption('arch-landing → arch-landing-card × N + dashed New Notebook tile · grid auto-fill minmax(280px, 1fr)');
};

const wf_read_view = () => frame(
  url_bar('#/n/acme-trading/section/api-acme-com') +
  masthead({ brand: 'Acme Trading System', breadcrumb: '⌖ Cloud / Production AWS / Infrastructure / Ingresses / api.acme.com', view: 'read' }) +
  grid_shell({
    cols: '180px 1fr',
    body: tree_panel(ACME_TREE) + `<main style="padding:0.9rem 1.2rem;">${section_meta({ num: '5.1.1.1.1', type: 'ingress', note: 'edited 2m ago' })}${READ_SECTION_BODY}</main>`,
  })
) + label_caption('arch-app: arch-masthead + arch-tree + arch-section-view (with arch-properties · arch-edges · arch-foot-meta children)');

const wf_glimpse_rail = () => {
  const rail = `
    <aside style="border-left:1px solid var(--border);background:var(--bg-pane);padding:0.7rem 0.85rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
        <span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">Glimpse · 5.1.1.5.1</span>
        <div style="display:flex;gap:3px;">
          ${['←','→','✕'].map((c) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--bg-soft);border:1px solid var(--border);border-radius:3px;font-size:10px;color:var(--text-muted);">${c}</span>`).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:3px;font-family:var(--mono);font-size:9.5px;margin-bottom:0.6rem;flex-wrap:wrap;">
        <span style="background:var(--bg-soft);border:1px solid var(--border);border-radius:2px;padding:1px 5px;color:var(--text-muted);">domain-acme</span>
        <span style="color:var(--text-faint);">→</span>
        <span style="background:var(--accent-bg);border:1px solid var(--accent);border-radius:2px;padding:1px 5px;color:var(--accent);font-weight:500;">cert-acme</span>
      </div>
      <h4 style="font-size:1.1rem;font-weight:500;letter-spacing:-0.015em;margin-bottom:0.3rem;">cert-acme-wildcard</h4>
      <div style="display:flex;gap:3px;margin-bottom:0.5rem;">
        ${['acm','auto-renew','wildcard'].map((t) => `<span style="font-family:var(--mono);font-size:8.5px;background:var(--bg-pane);border:1px solid var(--border);border-radius:2px;padding:1px 4px;color:var(--text-muted);">${t}</span>`).join('')}
      </div>
      ${props_card([['kind','TLS cert'],['rotated','13mo auto'],['stored-in', ref_link('AWS ACM')]])}
      <p style="font-size:11px;line-height:1.5;margin:0.4rem 0;">Wildcard covering all subdomains of ${ref_link('acme.com')}. Provisioned by ACM with DNS-01 validation.</p>
      <div style="font-size:10.5px;color:var(--accent);margin-top:0.4rem;">Open in full →</div>
    </aside>`;
  return frame(
    url_bar('#/n/acme-trading/section/api-acme-com/glimpse/domain-acme/cert-acme?c=1') +
    masthead({ brand: 'Acme Trading System', breadcrumb: '⌖ … / api.acme.com', view: 'read' }) +
    grid_shell({
      cols: '150px 1fr 220px',
      body: tree_panel(ACME_TREE.slice(0, 9)) +
        `<main style="padding:0.9rem 1.2rem;">${section_meta({ num: '5.1.1.1.1', type: 'ingress', note: 'edited 2m ago' })}<h3 style="font-size:1.3rem;font-weight:500;letter-spacing:-0.018em;margin-bottom:0.4rem;">api.acme.com</h3><p style="font-size:11px;line-height:1.5;color:var(--text);">The cert is rotated by ACM via DNS-01. Domain delegation from ${ref_link('acme.com')} which fronts ${ref_link('cert-acme-wildcard')} too.</p></main>` +
        rail,
    })
  ) + label_caption('Right rail = 420px slot, mutex with revisions / comments rails. Stack chips drive cursor (URL ?c=). Cycles allowed.');
};

const wf_revisions_rail = () => {
  const row = ({ rev, author, when, msg, current }) => `
    <div style="border-left:2px solid ${current ? 'var(--accent)' : 'var(--border)'};padding:5px 8px;margin-bottom:3px;background:${current ? 'var(--accent-bg)' : 'transparent'};border-radius:0 3px 3px 0;">
      <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;color:${current ? 'var(--accent)' : 'var(--text-soft)'};font-weight:${current ? '500' : '400'};">
        <span>r${rev} · ${author}</span><span style="color:${current ? 'var(--accent)' : 'var(--text-faint)'};">${when}</span>
      </div>
      ${msg ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">${msg}</div>` : ''}
      ${current ? '<div style="font-family:var(--mono);font-size:8.5px;color:var(--accent);margin-top:3px;">current</div>' : ''}
    </div>`;
  const rail = `
    <aside style="border-left:1px solid var(--border);background:var(--bg-pane);padding:0.7rem 0.85rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;">
        <span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">Revisions · 4</span>
        <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--bg-soft);border:1px solid var(--border);border-radius:3px;font-size:10px;color:var(--text-muted);">✕</span>
      </div>
      ${row({ rev: 4, author: 'claude', when: 'now', msg: 'Address comments c-12', current: true })}
      ${row({ rev: 3, author: 'human', when: '5m', msg: 'Clarify cert rotation', current: false })}
      ${row({ rev: 2, author: 'claude', when: '2h', msg: 'Initial flesh-out', current: false })}
      ${row({ rev: 1, author: 'null', when: '2h', msg: 'Created', current: false })}
      <div style="margin-top:0.8rem;padding-top:0.6rem;border-top:1px dashed var(--border);">
        <div style="font-family:var(--mono);font-size:9.5px;color:var(--text-muted);margin-bottom:4px;">preview r3</div>
        <h4 style="font-size:13px;font-weight:500;margin-bottom:3px;">api.acme.com</h4>
        <p style="font-size:10.5px;color:var(--text-muted);line-height:1.45;margin-bottom:0.5rem;">Public HTTPS entry. The cert rotates with DNS-01 validation against the parent zone…</p>
        <input disabled placeholder="Restored from r3" style="width:100%;background:var(--bg-soft);border:1px solid var(--border);border-radius:3px;padding:3px 6px;font-family:var(--mono);font-size:10px;color:var(--text-muted);margin-bottom:5px;" />
        <button disabled style="width:100%;background:var(--accent);color:var(--bg-pane);border:0;border-radius:3px;padding:5px;font-size:11px;font-weight:500;font-family:var(--sans);">Restore this version</button>
      </div>
    </aside>`;
  return frame(
    url_bar('#/n/acme-trading/section/api-acme-com') +
    masthead({ brand: 'Acme Trading System', breadcrumb: '⌖ … / api.acme.com', view: 'read' }) +
    grid_shell({
      cols: '150px 1fr 220px',
      body: tree_panel(ACME_TREE.slice(0, 9)) +
        `<main style="padding:0.9rem 1.2rem;">${section_meta({ num: '5.1.1.1.1', type: 'ingress', note: 'edited just now' })}<h3 style="font-size:1.3rem;font-weight:500;letter-spacing:-0.018em;margin-bottom:0.4rem;">api.acme.com</h3><p style="font-size:11px;color:var(--text-muted);">Public HTTPS entrypoint. Cert rotates with DNS-01…</p></main>` + rail,
    })
  ) + label_caption('Open via foot-meta "View all (N)" → POST /sections/{slug}/revisions/{n}/restore (If-Match section etag).');
};

const wf_comments_rail = () => {
  const comment = ({ author, when, anchor, body, resolved }) => `
    <div style="padding:6px 0;border-bottom:1px solid var(--border);opacity:${resolved ? '0.55' : '1'};">
      <div style="display:flex;justify-content:space-between;align-items:center;font-family:var(--mono);font-size:9.5px;color:var(--text-muted);margin-bottom:3px;">
        <div style="display:flex;gap:5px;align-items:center;">
          <span style="color:var(--text-soft);font-weight:500;">${author}</span>
          <span>· ${when}</span>
          <span style="background:${anchor === 'section' ? 'var(--bg-soft)' : 'var(--accent-bg)'};color:${anchor === 'section' ? 'var(--text-muted)' : 'var(--accent)'};border:1px solid ${anchor === 'section' ? 'var(--border)' : 'var(--accent-edge)'};border-radius:2px;padding:0 4px;font-size:9px;cursor:pointer;">${anchor}</span>
        </div>
        ${resolved ? '<span style="color:var(--text-muted);">✓ resolved</span>' : ''}
      </div>
      <div style="font-size:11px;line-height:1.45;color:var(--text);">${body}</div>
      <div style="display:flex;gap:8px;margin-top:4px;font-family:var(--mono);font-size:9.5px;color:var(--accent);">${resolved ? '<span>Reopen</span>' : '<span>Resolve</span>'}<span style="color:var(--text-muted);">Delete</span></div>
    </div>`;
  const rail = `
    <aside style="border-left:1px solid var(--border);background:var(--bg-pane);padding:0.7rem 0.85rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
        <span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">Comments · 3</span>
        <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--bg-soft);border:1px solid var(--border);border-radius:3px;font-size:10px;color:var(--text-muted);">✕</span>
      </div>
      <div style="display:inline-flex;background:var(--bg-soft);border:1px solid var(--border);border-radius:3px;padding:2px;gap:1px;font-size:10px;margin-bottom:0.4rem;">
        <span style="padding:2px 7px;background:var(--bg-pane);box-shadow:0 0 0 1px var(--border);border-radius:2px;font-weight:500;color:var(--text);">Open</span>
        <span style="padding:2px 7px;color:var(--text-muted);">All</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;background:var(--accent-bg);border:1px solid var(--accent-edge);border-radius:3px;padding:2px 6px;font-family:var(--mono);font-size:9.5px;color:var(--accent);margin-bottom:0.5rem;">
        <span>filtered: p-1</span><span style="color:var(--accent-soft);cursor:pointer;">×</span>
      </div>
      <textarea disabled placeholder="Comment on p-1…" rows="2" style="width:100%;background:var(--bg-soft);border:1px solid var(--border);border-radius:3px;padding:5px 7px;font-family:var(--sans);font-size:10.5px;color:var(--text-muted);outline:none;margin-bottom:5px;resize:none;"></textarea>
      <button disabled style="width:100%;background:var(--accent);color:var(--bg-pane);border:0;border-radius:3px;padding:4px;font-size:11px;font-weight:500;font-family:var(--sans);margin-bottom:0.5rem;">Post</button>
      ${comment({ author: 'human', when: '5m', anchor: 'p-1', body: 'We should mention the WAF rate limits here — 60 req/min keyed on JWT subject.', resolved: false })}
      ${comment({ author: 'claude', when: '2h', anchor: 'section', body: 'Did anyone check the JWT audiences match prod?', resolved: false })}
      ${comment({ author: 'human', when: '1d', anchor: 'p-2', body: 'Old issue from last week.', resolved: true })}
    </aside>`;
  const para = (n, text, anchor_hovered) => `<p data-anchor="p-${n}" style="font-size:11px;line-height:1.5;margin:0.4rem 0;position:relative;background:${anchor_hovered?'rgba(29,78,216,0.05)':'transparent'};border-radius:3px;padding:2px 4px;">${text}${anchor_hovered ? `<span style="position:absolute;right:-22px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--accent);color:var(--bg-pane);border-radius:50%;font-size:11px;font-weight:500;">+</span>` : ''}</p>`;
  return frame(
    url_bar('#/n/acme-trading/section/api-acme-com') +
    masthead({ brand: 'Acme Trading System', breadcrumb: '⌖ … / api.acme.com', view: 'read' }) +
    grid_shell({
      cols: '150px 1fr 240px',
      body: tree_panel(ACME_TREE.slice(0, 9)) +
        `<main style="padding:0.9rem 1.2rem;">${section_meta({ num: '5.1.1.1.1', type: 'ingress', note: 'edited 2m ago' })}<h3 style="font-size:1.3rem;font-weight:500;letter-spacing:-0.018em;margin-bottom:0.5rem;">api.acme.com</h3>${para(0,'Public HTTPS entry point. TLS terminates at an ALB.')}${para(1,'The cert is rotated by ACM with DNS-01 validation.', true)}${para(2,'Rate limits at WAF, keyed on JWT subject claim.')}</main>` + rail,
    })
  ) + label_caption('Hover any [data-anchor] paragraph → "+" affordance. Click opens rail filtered to that p-N.');
};

const wf_toc = () => {
  const row = ({ num, type, title, depth }) => `<div style="display:grid;grid-template-columns:3.5rem 1fr auto;align-items:center;gap:10px;padding:4px 0 4px ${depth * 1.2}rem;border-bottom:1px solid var(--border);font-size:11.5px;cursor:pointer;color:var(--text);"><span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">${num}</span><span style="display:flex;align-items:center;gap:6px;">${dot(type)}<span>${title}</span></span><span style="font-family:var(--mono);font-size:9px;color:var(--text-faint);">${depth === 0 ? '' : 'p.' + (Math.floor(Math.random() * 12) + 1)}</span></div>`;
  return frame(
    url_bar('#/n/acme-trading/toc') +
    masthead({ brand: 'Acme Trading System', breadcrumb: '', view: 'toc' }) +
    `<div style="padding:1.4rem 2rem;">
      <div style="font-family:var(--mono);font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.02em;margin-bottom:0.2rem;">Architecture Notebook</div>
      <h3 style="font-size:1.8rem;font-weight:500;letter-spacing:-0.025em;line-height:1.05;margin-bottom:0.2rem;">Acme Trading System</h3>
      <div style="color:var(--text-muted);font-size:11.5px;margin-bottom:0.3rem;">Section reference</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text-muted);margin-bottom:1rem;">Revision 0 · Sections 32</div>
      <div style="border-top:1px solid var(--border);">
        ${row({ num: '1', type: 'overview', title: 'System Overview', depth: 0 })}
        ${row({ num: '2', type: 'ui', title: 'User Interfaces', depth: 0 })}
        ${row({ num: '2.1', type: 'ui', title: 'Customer Web Portal', depth: 1 })}
        ${row({ num: '2.2', type: 'ui', title: 'Admin Dashboard', depth: 1 })}
        ${row({ num: '3', type: 'service', title: 'Backend Services', depth: 0 })}
        ${row({ num: '3.1', type: 'service', title: 'Order Engine', depth: 1 })}
        ${row({ num: '5', type: 'cloud', title: 'Cloud Accounts', depth: 0 })}
        ${row({ num: '5.1', type: 'cloud', title: 'Production AWS', depth: 1 })}
        ${row({ num: '5.1.1.1.1', type: 'ingress', title: 'api.acme.com', depth: 4 })}
        ${row({ num: '7.2', type: 'auth', title: 'Auth0 RS256', depth: 1 })}
      </div>
    </div>`
  ) + label_caption('arch-toc reads cached graph + compute_numbering. Click row → push #/n/<nb>/section/<slug>. No glimpse / rail.');
};

const wf_print = () => {
  const page = (kind, body) => `<div style="background:var(--bg-pane);border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.06);padding:0.7rem 0.9rem;font-size:10px;line-height:1.4;color:var(--text);"><div style="font-family:var(--mono);font-size:8.5px;color:var(--text-faint);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em;">${kind}</div>${body}</div>`;
  return frame(
    url_bar('#/n/acme-trading/print') +
    masthead({ brand: 'Acme Trading System', breadcrumb: '', view: 'print' }) +
    `<div style="background:var(--bg-strong);padding:1rem;display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.7rem;min-height:280px;">
      ${page('cover', '<div style="font-size:1.1rem;font-weight:500;letter-spacing:-0.018em;margin-bottom:6px;">Acme Trading System</div><div style="color:var(--text-muted);font-size:9.5px;">Architecture</div><div style="margin-top:auto;font-family:var(--mono);font-size:9px;color:var(--text-muted);padding-top:1.5rem;">Revision 0<br/>May 21 · 2026</div>')}
      ${page('contents', '<div style="font-family:var(--mono);font-size:9px;color:var(--text-soft);display:flex;flex-direction:column;gap:3px;"><div>1 · System Overview<span style="float:right;color:var(--text-faint);">1</span></div><div>2 · User Interfaces<span style="float:right;color:var(--text-faint);">3</span></div><div>3 · Backend Services<span style="float:right;color:var(--text-faint);">7</span></div><div>5.1.1.1.1 · api.acme.com<span style="float:right;color:var(--text-faint);">42</span></div></div>')}
      ${page('§5.1.1.1.1', '<div style="font-size:0.95rem;font-weight:500;margin-bottom:4px;">api.acme.com</div><div style="font-size:9.5px;line-height:1.5;color:var(--text);">Public HTTPS entry point. TLS terminates at an ALB in <span style="color:var(--accent);">Production AWS</span><sup>1</sup> and forwards to <span style="color:var(--accent);">Order Engine</span><sup>2</sup>.</div><div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border);font-family:var(--mono);font-size:8.5px;color:var(--text-muted);"><sup>1</sup> acme.com (5.1.1.5.1) &nbsp; <sup>2</sup> Order Engine (3.1)</div>')}
    </div>
    <div style="padding:0.5rem 0.7rem;display:flex;justify-content:flex-end;background:var(--bg-pane);border-top:1px solid var(--border);"><button disabled style="background:var(--accent);color:var(--bg-pane);border:0;border-radius:3px;padding:5px 10px;font-size:11px;font-weight:500;font-family:var(--sans);display:flex;align-items:center;gap:6px;">Save as PDF <span style="font-family:var(--mono);font-size:9px;background:rgba(255,255,255,0.2);border-radius:2px;padding:1px 4px;">⌘P</span></button></div>`
  ) + label_caption('iframe src = rootDoc._links.print.href. Pages: cover → TOC → sections depth-first. Refs become <sup>n</sup> footnotes per section.');
};

// ─────────────────────────────  upsert  ─────────────────────────────

const headers_json_write = (key, etag) => {
  const out = { 'Content-Type': 'application/json', 'Accept': 'application/hal+json', 'Arch-Author': AUTHOR, 'Idempotency-Key': key };
  if (etag) out['If-Match'] = etag;
  return out;
};

const get_section = async (slug) => {
  const r = await fetch(`${base}/n/${NOTEBOOK}/api/sections/${slug}`);
  return r.status === 200 ? r.json() : null;
};

const upsert_section = async (entry) => {
  const existing = await get_section(entry.slug);
  if (existing) {
    const r = await fetch(`${base}/n/${NOTEBOOK}/api/sections/${entry.slug}`, {
      method: 'PATCH',
      headers: headers_json_write(randomUUID(), existing._etag),
      body: JSON.stringify({ title: entry.title, deck: entry.deck, tags: entry.tags ?? [], html: entry.html, revision_message: 'Refresh wireframe to HTML mockup' }),
    });
    return { slug: entry.slug, status: r.status, action: 'patched' };
  }
  const r = await fetch(`${base}/n/${NOTEBOOK}/api/sections`, {
    method: 'POST',
    headers: headers_json_write(randomUUID()),
    body: JSON.stringify({ slug: entry.slug, type: 'ui', parent: PARENT_SLUG, title: entry.title, deck: entry.deck, tags: entry.tags ?? [], html: entry.html, revision_message: 'Initial wireframe' }),
  });
  return { slug: entry.slug, status: r.status, action: 'created' };
};

const escape_html = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const opening = ({ where, what }) => `<p data-anchor="p-0">${what} See also: <arch-ref to="notebook-catalog">notebook-catalog</arch-ref>, <arch-ref to="glimpse-stack">glimpse-stack</arch-ref>, <arch-ref to="hash-router">hash-router</arch-ref>. URL pattern: <code>${escape_html(where)}</code>.</p>`;

const WIREFRAMES = [
  { slug: 'wf-landing', title: 'Wireframe — Landing (#/)', deck: 'Notebook catalog at the root. View toggle hidden.', tags: ['wireframe'],
    html: opening({ where: '#/', what: 'Renders arch-landing inside the standard arch-app shell. Brand button is the home control on every other view.' }) + wf_landing() },
  { slug: 'wf-read-view', title: 'Wireframe — Read view', deck: 'Notebook · tree sidebar + section body. The default in-notebook screen.', tags: ['wireframe'],
    html: opening({ where: '#/n/<notebook>/section/<slug>', what: 'Two-column grid 288px | minmax(0,1fr). A 420px right rail appears when glimpse / revisions / comments open.' }) + wf_read_view() },
  { slug: 'wf-glimpse-rail', title: 'Wireframe — Glimpse rail open', deck: 'Inline cross-reference viewer. URL-backed stack. Mutex with revisions / comments rails.', tags: ['wireframe'],
    html: opening({ where: '#/n/<slug>/section/<s>/glimpse/<s1>/<s2>?c=1', what: 'Click any cross-reference link in the section body. Shell switches to 288|1fr|420. Each chip is a stack step; cursor (?c=) marks current.' }) + wf_glimpse_rail() },
  { slug: 'wf-revisions-rail', title: 'Wireframe — Revisions rail', deck: 'Right rail listing all revisions of the current section. Click a row → preview; Restore writes a new revision.', tags: ['wireframe'],
    html: opening({ where: '#/n/<slug>/section/<s>', what: 'Open via foot-meta "View all (N)". Selecting a non-current revision reveals the inline message input + Restore button.' }) + wf_revisions_rail() },
  { slug: 'wf-comments-rail', title: 'Wireframe — Comments rail', deck: 'Right rail with markdown add-form, Open/All filter, and per-anchor scope. Resolve / Reopen / Delete inline.', tags: ['wireframe'],
    html: opening({ where: '#/n/<slug>/section/<s>', what: 'Two entry points: foot-meta "Add comment" (unanchored) or hover a paragraph → "+" (anchored to p-N). Anchor pill clears with ×.' }) + wf_comments_rail() },
  { slug: 'wf-toc', title: 'Wireframe — Contents view', deck: 'Single-column outline of the notebook. Each row clicks back to the read view.', tags: ['wireframe'],
    html: opening({ where: '#/n/<notebook>/toc', what: 'arch-toc reads the cached graph and renders the flat tree depth-first with computed section numbers.' }) + wf_toc() },
  { slug: 'wf-print', title: 'Wireframe — Print view', deck: 'iframe of /n/<slug>/print. Self-contained HTML for Save-as-PDF.', tags: ['wireframe'],
    html: opening({ where: '#/n/<notebook>/print', what: 'UI hides masthead chrome and stretches the iframe edge-to-edge. ⌘P intercepts (when iframe loaded) and prints the iframe content.' }) + wf_print() },
];

const ensure_parent_exists = async () => {
  const r = await fetch(`${base}/n/${NOTEBOOK}/api/sections/${PARENT_SLUG}`);
  if (r.status !== 200) {
    console.error(`[seed-wireframes] parent "${PARENT_SLUG}" not found in ${NOTEBOOK}; aborting`);
    process.exit(1);
  }
};

await ensure_parent_exists();
console.log(`[seed-wireframes] target: ${base}/n/${NOTEBOOK}, parent=${PARENT_SLUG}`);
for (const wf of WIREFRAMES) {
  const result = await upsert_section(wf);
  console.log(`  ${result.action.padEnd(8)} ${result.slug.padEnd(22)} → ${result.status}`);
}
console.log(`\nOpen: ${base}/#/n/${NOTEBOOK}/section/wf-landing`);
