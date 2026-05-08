import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as agentcollab from '../lib/agentcollab';

describe('agentcollab.track', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    process.env.AGENTCOLLAB_ENABLED = 'true';
    process.env.AGENTCOLLAB_WEBHOOK_URL = 'https://example.test/webhook';
    process.env.AGENTCOLLAB_API_KEY = 'test-key-abc';
    process.env.AGENTCOLLAB_HMAC_SECRET = 'test-secret-xyz';
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('POSTs with Bearer auth + sha256 signature + correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    global.fetch = fetchMock as any;

    agentcollab.track('custom', { hello: 'world' });

    // wait one tick for fire-and-forget to dispatch
    await new Promise(r => setTimeout(r, 50));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/webhook');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key-abc');
    expect(init.headers['X-AgentCollab-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);

    const body = JSON.parse(init.body);
    expect(body.event_type).toBe('custom');
    expect(body.payload).toEqual({ hello: 'world' });
    expect(body.occurred_at).toBeTruthy();
  });

  it('is a no-op when AGENTCOLLAB_ENABLED is not "true"', async () => {
    process.env.AGENTCOLLAB_ENABLED = 'false';
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;
    agentcollab.track('custom', {});
    await new Promise(r => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('boom')) as any;
    expect(() => agentcollab.track('custom', {})).not.toThrow();
    await new Promise(r => setTimeout(r, 100));
  });
});
