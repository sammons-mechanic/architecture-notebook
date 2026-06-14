import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { make_test_server, N } from './_helpers.ts';

// Mimic a real browser Accept header — text/html plus a wildcard fallback so
// the server's HAL negotiator (which matches against application/hal+json)
// passes via the wildcard branch and the request reaches the SPA route.
const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,*/*;q=0.8';

const get_no_redirect = async (port: number, path: string) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'GET',
    headers: { Accept: BROWSER_ACCEPT },
    redirect: 'manual',
  });
  await response.text();
  return { status: response.status, location: response.headers.get('location') };
};

describe('SPA deep-link redirect', () => {
  test('GET /n/{slug}/section/{slug} redirects to the hash route', async () => {
    const server = await make_test_server();
    const { status, location } = await get_no_redirect(server.port, `${N}/section/refs-convergence`);
    await server.close();
    assert.deepEqual({ status, location }, { status: 302, location: '/#/n/test/section/refs-convergence' });
  });

  test('GET /n/{slug}/sections/{slug} (plural alias from API hrefs) redirects to the singular hash route', async () => {
    const server = await make_test_server();
    const { status, location } = await get_no_redirect(server.port, `${N}/sections/refs-convergence`);
    await server.close();
    assert.deepEqual({ status, location }, { status: 302, location: '/#/n/test/section/refs-convergence' });
  });

  test('GET /n/{slug}/toc redirects to the hash TOC', async () => {
    const server = await make_test_server();
    const { status, location } = await get_no_redirect(server.port, `${N}/toc`);
    await server.close();
    assert.deepEqual({ status, location }, { status: 302, location: '/#/n/test/toc' });
  });

  test('GET /n/{slug} (bare notebook path) redirects to the hash notebook route', async () => {
    const server = await make_test_server();
    const { status, location } = await get_no_redirect(server.port, N);
    await server.close();
    assert.deepEqual({ status, location }, { status: 302, location: '/#/n/test' });
  });

  test('GET /n/{slug}/section/{slug}/glimpse/a/b preserves the glimpse stack', async () => {
    const server = await make_test_server();
    const { status, location } = await get_no_redirect(server.port, `${N}/section/refs-convergence/glimpse/a/b`);
    await server.close();
    assert.deepEqual({ status, location }, { status: 302, location: '/#/n/test/section/refs-convergence/glimpse/a/b' });
  });

  test('GET /n/{slug}/section/{slug}?c=2 keeps the query string', async () => {
    const server = await make_test_server();
    const { status, location } = await get_no_redirect(server.port, `${N}/section/refs-convergence?c=2`);
    await server.close();
    assert.deepEqual({ status, location }, { status: 302, location: '/#/n/test/section/refs-convergence?c=2' });
  });

  test('GET / does not redirect (root serves the SPA index)', async () => {
    const server = await make_test_server();
    const response = await fetch(`http://127.0.0.1:${server.port}/`, {
      method: 'GET',
      headers: { Accept: BROWSER_ACCEPT },
      redirect: 'manual',
    });
    await response.text();
    await server.close();
    assert.deepEqual({ status: response.status, location: response.headers.get('location') }, { status: 200, location: null });
  });
});
