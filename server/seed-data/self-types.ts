import type { TypeSeed } from './types.ts';

export const SELF_TYPE_SEEDS: ReadonlyArray<TypeSeed> = [
  { slug: 'overview', name: 'Overview', color: '#1c1917', description: 'Top-of-tree narrative.',
    property_schema: { fields: [
      { key: 'summary', type: 'rich', required: false }] } },
  { slug: 'service', name: 'Server Module', color: '#16a34a', description: 'Backend module, route, or pipeline step.',
    property_schema: { fields: [
      { key: 'file', type: 'string', required: false },
      { key: 'kind', type: 'enum', required: false, enum: ['route', 'lib', 'adapter', 'orchestrator'] }] } },
  { slug: 'ui', name: 'UI Component', color: '#0891b2', description: 'Lit web component or store/router piece.',
    property_schema: { fields: [
      { key: 'file', type: 'string', required: false },
      { key: 'kind', type: 'enum', required: false, enum: ['component', 'store', 'router', 'lib'] }] } },
  { slug: 'infra', name: 'Cross-cutting', color: '#525252', description: 'Convention, pipeline, or cross-cutting concern.',
    property_schema: { fields: [
      { key: 'kind', type: 'enum', required: false, enum: ['convention', 'pipeline', 'protocol', 'concept'] }] } },
  { slug: 'integration', name: 'Integration', color: '#7c3aed', description: 'Cross-system glue: protocols, transports, brokers.',
    property_schema: { fields: [
      { key: 'file', type: 'string', required: false },
      { key: 'kind', type: 'enum', required: false, enum: ['protocol', 'transport', 'broker', 'route'] }] } },
];
