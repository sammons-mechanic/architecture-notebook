import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, request , N} from './_helpers.ts';

describe('problem responses', () => {
  test('Method not allowed returns 405 with Allow header', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'DELETE', `${N}/api/health`);
    await server.close();
    assert.deepEqual(
      { status: response.status, allow: response.headers['allow'], code: response.json?.type },
      { status: 405, allow: 'GET', code: '/errors/method-not-allowed' },
    );
  });

  test('Accept not acceptable returns 406', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'GET', `${N}/api`, undefined, { Accept: 'text/plain' });
    await server.close();
    assert.deepEqual({ status: response.status, code: response.json?.type }, { status: 406, code: '/errors/not-acceptable' });
  });

  test('Idempotency-Key on GET returns 400 idempotency-misplaced', async () => {
    const server = await make_test_server();
    const response = await request(server.port, 'GET', `${N}/api`, undefined, { 'Idempotency-Key': 'oops' });
    await server.close();
    assert.deepEqual({ status: response.status, code: response.json?.type }, { status: 400, code: '/errors/idempotency-misplaced' });
  });

  test('payload-too-large fires at 1 MiB cap', async () => {
    const server = await make_test_server();
    const big = JSON.stringify({ slug: 'queue', name: 'Q', property_schema: { fields: [] }, padding: 'x'.repeat(1024 * 1024 + 16) });
    const response = await fetch(`http://127.0.0.1:${server.port}${N}/api/types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/hal+json' },
      body: big,
    });
    const text = await response.text();
    await server.close();
    assert.deepEqual({ status: response.status, problem: text.includes('payload-too-large') }, { status: 413, problem: true });
  });

  test('Idempotency-Key replay returns the cached body', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service' });
    const first = await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'orders', slug: 'orders' }, { 'Idempotency-Key': 'key-a' });
    const second = await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'orders', slug: 'orders' }, { 'Idempotency-Key': 'key-a' });
    await server.close();
    assert.deepEqual({ first_status: first.status, second_status: second.status, same_body: first.text === second.text }, { first_status: 201, second_status: 201, same_body: true });
  });

  test('Idempotency-Key conflict on different body returns 409', async () => {
    const server = await make_test_server();
    await request(server.port, 'POST', `${N}/api/types`, { slug: 'service', name: 'Service' });
    await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'a', slug: 'a' }, { 'Idempotency-Key': 'key-b' });
    const second = await request(server.port, 'POST', `${N}/api/sections`, { type: 'service', title: 'b', slug: 'b' }, { 'Idempotency-Key': 'key-b' });
    await server.close();
    assert.deepEqual({ status: second.status, code: second.json?.type }, { status: 409, code: '/errors/idempotency-conflict' });
  });
});
