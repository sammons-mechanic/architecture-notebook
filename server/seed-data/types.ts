export type TypeSeed = {
  readonly slug: string;
  readonly name: string;
  readonly color: string;
  readonly description: string;
  readonly property_schema: { readonly fields: ReadonlyArray<Record<string, unknown>> };
};

export const TYPE_SEEDS: ReadonlyArray<TypeSeed> = [
  { slug: 'overview', name: 'Overview', color: '#1c1917', description: 'Top-of-tree narrative entries.',
    property_schema: { fields: [{ key: 'summary', type: 'rich', required: false }] } },
  { slug: 'ui', name: 'User Interface', color: '#0891b2', description: 'Customer- or operator-facing front-ends.',
    property_schema: { fields: [
      { key: 'audience', type: 'string', required: false },
      { key: 'stack', type: 'string', required: false },
      { key: 'depends-on', type: 'multi-ref', required: false, refType: 'service' }] } },
  { slug: 'service', name: 'Backend Service', color: '#16a34a', description: 'A running service emitting/consuming traffic.',
    property_schema: { fields: [
      { key: 'language', type: 'string', required: false },
      { key: 'platform', type: 'string', required: false },
      { key: 'depends-on', type: 'multi-ref', required: false, refType: 'service' }] } },
  { slug: 'integration', name: 'Integration', color: '#7c3aed', description: 'Inbound/outbound third-party integration.',
    property_schema: { fields: [
      { key: 'vendor', type: 'string', required: false },
      { key: 'direction', type: 'enum', required: false, enum: ['inbound', 'outbound'] },
      { key: 'secret', type: 'ref', required: false, refType: 'secret' }] } },
  { slug: 'cloud', name: 'Cloud Account', color: '#ea580c', description: 'A cloud-provider account boundary.',
    property_schema: { fields: [
      { key: 'provider', type: 'string', required: false },
      { key: 'account-id', type: 'string', required: false },
      { key: 'region', type: 'string', required: false }] } },
  { slug: 'infra', name: 'Infrastructure', color: '#525252', description: 'Container for cloud-resource groupings.',
    property_schema: { fields: [{ key: 'notes', type: 'rich', required: false }] } },
  { slug: 'ingress', name: 'HTTPS Ingress', color: '#dc2626', description: 'Public entry point reachable from the internet.',
    property_schema: { fields: [
      { key: 'domain', type: 'string', required: true },
      { key: 'protocol', type: 'enum', required: false, enum: ['http', 'https', 'grpc', 'tcp'] },
      { key: 'tls', type: 'boolean', required: false },
      { key: 'routes-to', type: 'multi-ref', required: false, refType: 'service' }] } },
  { slug: 'egress', name: 'Egress', color: '#ca8a04', description: 'Outbound traffic boundary.',
    property_schema: { fields: [{ key: 'destinations', type: 'multi-string', required: false }] } },
  { slug: 'domain', name: 'Domain Name', color: '#0284c7', description: 'A DNS domain or zone.',
    property_schema: { fields: [
      { key: 'registrar', type: 'string', required: false },
      { key: 'zone-id', type: 'string', required: false }] } },
  { slug: 'secret', name: 'Secret', color: '#9333ea', description: 'Secret material (TLS certs, HMAC keys, …).',
    property_schema: { fields: [
      { key: 'kind', type: 'string', required: false },
      { key: 'rotated', type: 'string', required: false },
      { key: 'stored-in', type: 'ref', required: false }] } },
  { slug: 'auth', name: 'Auth Policy', color: '#0d9488', description: 'Authentication or authorization policy.',
    property_schema: { fields: [
      { key: 'algorithm', type: 'string', required: false },
      { key: 'issuer', type: 'string', required: false }] } },
];
