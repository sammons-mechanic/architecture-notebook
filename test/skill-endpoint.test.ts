import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request, N, type TestServer } from './_helpers.ts';

describe('skill discovery', () => {
  let server: TestServer;
  before(async () => {
    server = await make_test_server();
  });
  after(async () => {
    await server.close();
  });

  test('GET /skill returns the raw markdown guide', async () => {
    const res = await request(server.port, 'GET', '/skill', undefined, { Accept: 'text/markdown' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] ?? '', /text\/markdown/);
    assert.ok(res.text.includes('Discover the API'), 'serves the SKILL.md body');
  });

  test('GET /skill is exempt from the hal/json Accept gate (text/markdown is not 406)', async () => {
    // negotiate_accept() classifies a bare `text/markdown` as `unacceptable`,
    // which 406s every other endpoint. /skill is exempted in http-handler so a
    // client following the `type: text/markdown` link hint gets the guide.
    const res = await request(server.port, 'GET', '/skill', undefined, { Accept: 'text/markdown' });
    assert.notEqual(res.status, 406);
    assert.equal(res.status, 200);
  });

  test('GET /skill markdown is not prefix-mangled', async () => {
    const res = await request(server.port, 'GET', '/skill', undefined, { Accept: 'text/markdown' });
    assert.ok(res.text.includes('/api'), 'guide still mentions /api paths');
    assert.ok(!res.text.includes('/n/test/api'), 'no notebook prefix leaked into the guide');
  });

  test('GET /skill negotiates a HAL wrapper on application/hal+json', async () => {
    const res = await request(server.port, 'GET', '/skill', undefined, { Accept: 'application/hal+json' });
    assert.equal(res.status, 200);
    assert.equal(res.json.media_type, 'text/markdown');
    assert.equal(res.json._links.self.href, '/skill');
    assert.ok(res.json.content.includes('Discover the API'));
  });

  test('GET /skill as application/json strips hypermedia', async () => {
    const res = await request(server.port, 'GET', '/skill', undefined, { Accept: 'application/json' });
    assert.equal(res.status, 200);
    assert.equal(res.json._links, undefined);
    assert.ok(res.json.content.includes('Discover the API'));
  });

  test('catalog root advertises the skill via link + header', async () => {
    const res = await request(server.port, 'GET', '/api');
    assert.equal(res.status, 200);
    assert.equal(res.json._links['service-doc'].href, '/skill');
    assert.equal(res.json._links['service-doc'].type, 'text/markdown');
    assert.match(res.headers['link'] ?? '', /<\/skill>;\s*rel="service-doc"/);
  });

  test('per-notebook root advertises the skill without a notebook prefix', async () => {
    const res = await request(server.port, 'GET', `${N}/api`);
    assert.equal(res.status, 200);
    assert.equal(res.json._links['service-doc'].href, '/skill');
    assert.match(res.headers['link'] ?? '', /<\/skill>;\s*rel="service-doc"/);
    // Sibling links DO get the notebook prefix — proves the rewriter ran and
    // deliberately left the global /skill link alone.
    assert.equal(res.json._links.types.href, `${N}/api/types`);
  });
});
