import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { currentSection } from '../store-signals.ts';
import { render_field } from './arch-properties-render.ts';

class ArchProperties extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  render() {
    const section = currentSection.get();
    if (!section) {
      return html``;
    }
    const schema = section._embedded?.type?.property_schema;
    if (!schema) {
      return html``;
    }
    const type_name = section._embedded?.type?.name ?? section.type;
    const broken_slugs = new Set(
      section.unresolved_refs.filter((entry) => entry.source === 'property').map((entry) => entry.slug),
    );
    return html`
      <section class="props">
        <div class="props-header">
          <span>Properties · ${type_name}</span>
        </div>
        <dl>
          ${schema.fields.map((field) => {
            const value = (section.properties as Record<string, unknown>)[field.key];
            if (value === undefined || value === null) {
              return html``;
            }
            return html`
              <dt>${field.key}</dt>
              <dd>${render_field(field, value, broken_slugs)}</dd>
            `;
          })}
        </dl>
      </section>
    `;
  }
}

customElements.define('arch-properties', ArchProperties);
