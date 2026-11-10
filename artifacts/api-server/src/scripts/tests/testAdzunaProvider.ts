/**
 * Isolated contract/error tests, NOT proof of live integration.
 * All fetch responses below are deliberate test doubles.
 */
import assert from "node:assert/strict";
import { adzunaProvider } from "../../lib/jobProviders/adzuna";
import { auditAdzunaCredentials } from "../../lib/jobProviders/adzunaCredentials";
import { ProviderError } from "../../lib/jobProviders/types";

const originalId = process.env.ADZUNA_APP_ID;
const originalKey = process.env.ADZUNA_APP_KEY;
const originalFetch = globalThis.fetch;
let checks = 0;
const fixtureId = "unit-test-id";
const fixtureKey = "unit-test-key";
function validTestCredentials() {
  process.env.ADZUNA_APP_ID = fixtureId;
  process.env.ADZUNA_APP_KEY = fixtureKey;
}
async function expectError(code: string, status: number, upstreamStatus?: number) {
  await assert.rejects(
    () => adzunaProvider.search({ countryCode: "US", keywords: "student", jobType: "part_time", page: 1 }),
    (error: unknown) => {
      assert(error instanceof ProviderError);
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.equal(error.upstreamStatus, upstreamStatus);
      assert(!error.message.includes(fixtureKey));
      assert(!error.message.includes(fixtureId));
      return true;
    },
  );
  checks++;
}

try {
  delete process.env.ADZUNA_APP_ID;
  delete process.env.ADZUNA_APP_KEY;
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; throw new Error("must not fetch"); };
  await expectError("ADZUNA_NOT_CONFIGURED", 503);
  assert.equal(fetched, false);

  for (const [id, key] of [
    ["same", "same"],
    ["bad id", fixtureKey],
    [fixtureId, '"quoted"'],
    [fixtureId, "app_key=value"],
  ]) {
    process.env.ADZUNA_APP_ID = id;
    process.env.ADZUNA_APP_KEY = key;
    assert.equal(auditAdzunaCredentials().usableFormat, false);
    await expectError("ADZUNA_CONFIGURATION_ERROR", 503);
  }
  assert.equal(fetched, false);

  validTestCredentials();
  process.env.ADZUNA_APP_ID = ` ${fixtureId}\n`;
  assert.equal(auditAdzunaCredentials().ADZUNA_APP_ID.outerWhitespace, true);
  assert.equal(auditAdzunaCredentials().usableFormat, true);
  validTestCredentials();

  for (const upstream of [401, 403, 429, 500, 502, 503, 504, 400]) {
    globalThis.fetch = async () => new Response("Do not echo this raw provider body", { status: upstream });
    const code = upstream === 401 || upstream === 403 ? "ADZUNA_AUTH_FAILED"
      : upstream === 429 ? "ADZUNA_RATE_LIMITED"
      : upstream >= 500 ? "ADZUNA_UNAVAILABLE" : "ADZUNA_REQUEST_REJECTED";
    await expectError(code, upstream === 429 ? 429 : upstream >= 500 ? 503 : 502, upstream);
  }
  globalThis.fetch = async () => { throw new Error(`private URL?app_key=${fixtureKey}`); };
  await expectError("ADZUNA_NETWORK_ERROR", 503);
  globalThis.fetch = async () => new Response("<html>unexpected</html>", { status: 200 });
  await expectError("ADZUNA_INVALID_RESPONSE", 502, 200);

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.adzuna.com");
    assert.equal(url.pathname, "/v1/api/jobs/us/search/1");
    assert.equal(url.searchParams.get("app_id"), fixtureId);
    assert.equal(url.searchParams.get("app_key"), fixtureKey);
    assert.equal(url.searchParams.get("part_time"), "1");
    assert.equal(url.searchParams.get("what"), "student");
    assert.equal(new Headers(init?.headers).get("Accept"), "application/json");
    return Response.json({ count: 0, results: [] });
  };
  const emptyResult = await adzunaProvider.search({
    countryCode: "US", keywords: "student", jobType: "part_time", page: 1,
  });
  assert.deepEqual(emptyResult.listings, []);
  checks++;
  process.stdout.write(`PASS: ${checks} isolated request/error checks (test doubles; not live verification).\n`);
} finally {
  if (originalId === undefined) delete process.env.ADZUNA_APP_ID;
  else process.env.ADZUNA_APP_ID = originalId;
  if (originalKey === undefined) delete process.env.ADZUNA_APP_KEY;
  else process.env.ADZUNA_APP_KEY = originalKey;
  globalThis.fetch = originalFetch;
}
