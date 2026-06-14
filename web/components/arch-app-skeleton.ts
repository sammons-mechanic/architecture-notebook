import { html } from 'lit';

export const skeleton_template = () => html`
  <div class="read-shell">
    <aside class="tree">
      <div class="skeleton-tree">
        <div class="skeleton-bar" style="height:12px;width:60%;"></div>
        <div class="skeleton-bar" style="height:12px;width:60%;"></div>
      </div>
    </aside>
    <main class="read">
      <div class="skeleton-main">
        <div class="skeleton-bar" style="height:32px;width:60%;margin-bottom:1rem;"></div>
        <div class="skeleton-bar" style="height:14px;width:70%;"></div>
        <div class="skeleton-bar" style="height:14px;width:70%;"></div>
        <div class="skeleton-bar" style="height:14px;width:70%;"></div>
      </div>
    </main>
  </div>
`;
