/**
 * good-scan Full Client Flow Load Test
 *
 * Simulates N volunteer phones running the full good-scan lifecycle:
 *   1. Login  →  POST /auth/volunteer
 *   2. Cache warm-up  →  5 parallel GETs (profiles, meals, register-meals,
 *                         scans, voided-scans) — same as good-scan warmUpCache()
 *   3. Scan loop  →  POST /meal/scan every ~20s (fire-and-forget, like the app)
 *   4. Flush loop  →  POST /scan/sync/flush every ~10s (queued scans)
 *   5. Periodic re-sync  →  warm-up again every ~5 min
 *
 * A separate "reconnect_spike" scenario hammers warm-up concurrently —
 * models all volunteers reconnecting at once after a WiFi outage.
 *
 * Usage:
 *   # Install k6 (Windows)
 *   winget install k6
 *
 *   # Run against local good-api
 *   k6 run --env BASE_URL=http://localhost:8090 \
 *           --env VOLUNTEER_CODE=GOOD2026 \
 *           --env MEAL_ID=1 \
 *           --env DEVICES=8 \
 *           load-test/good-scan-flow.js
 *
 *   # Run against production (careful — uses real data)
 *   k6 run --env BASE_URL=https://api.goodvessel.org \
 *           --env VOLUNTEER_CODE=GOOD2026 \
 *           --env MEAL_ID=1 \
 *           --env DEVICES=8 \
 *           --env DURATION=2m \
 *           load-test/good-scan-flow.js
 *
 *   # Stress test — 20 devices, fast scan interval
 *   k6 run --env DEVICES=20 --env SCAN_INTERVAL=10 ... load-test/good-scan-flow.js
 *
 * Env vars:
 *   BASE_URL        API base (no trailing slash). Default: http://localhost:8090
 *   VOLUNTEER_CODE  Event volunteer access code. Default: GOOD2026
 *   MEAL_ID         Meal ID to scan against. Default: 1
 *   DEVICES         Number of simulated volunteer phones. Default: 8
 *   SCAN_INTERVAL   Seconds between scans per device. Default: 20 (= 3/min)
 *   DURATION        Steady-state duration. Default: 5m
 *   RECONNECT_VUS   VUs for the reconnect-spike scenario. Default: DEVICES
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL       = __ENV.BASE_URL       || 'http://localhost:8090';
const VOLUNTEER_CODE = __ENV.VOLUNTEER_CODE || 'GOOD2026';
const MEAL_ID        = parseInt(__ENV.MEAL_ID       || '1');
const DEVICES        = parseInt(__ENV.DEVICES       || '8');
const SCAN_INTERVAL  = parseInt(__ENV.SCAN_INTERVAL || '20');
const DURATION       = __ENV.DURATION               || '5m';
const RECONNECT_VUS  = parseInt(__ENV.RECONNECT_VUS || String(DEVICES));

// Jitter ±25% of scan interval so devices don't fire in lockstep
const JITTER = Math.max(1, Math.floor(SCAN_INTERVAL * 0.25));

// ── Custom Metrics ──────────────────────────────────────────────────────────

// Latencies
const warmupDuration  = new Trend('warmup_duration_ms',  true);  // full 5-GET warm-up round-trip
const profilesDuration = new Trend('profiles_duration_ms', true); // GET /profiles alone
const mealsDuration   = new Trend('meals_duration_ms',   true);
const scanDuration    = new Trend('scan_duration_ms',    true);   // POST /meal/scan
const flushDuration   = new Trend('flush_duration_ms',   true);   // POST /scan/sync/flush

// Counters
const scansAccepted  = new Counter('scans_accepted');   // new scan recorded (201)
const scansQuotaFull = new Counter('scans_quota_full'); // household quota exceeded (409)
const scansRejected  = new Counter('scans_rejected');   // other 4xx
const scansErrored   = new Counter('scans_errored');    // 5xx / network error
const flushAccepted  = new Counter('flush_accepted');   // scans accepted by flush
const warmupErrors   = new Counter('warmup_errors');    // failed sync GETs

// Rates
const scanSuccessRate  = new Rate('scan_success_rate');   // 201 or 409 both fine
const flushSuccessRate = new Rate('flush_success_rate');  // 200 with accepted[]
const warmupSuccess    = new Rate('warmup_success_rate'); // all 5 GETs returned 200

// ── k6 Options ─────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Scenario A: full volunteer device lifecycle (scan + flush + re-sync)
    volunteer_devices: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: DEVICES }, // ramp: devices start up, warm up cache
        { duration: DURATION, target: DEVICES }, // hold: steady scan load
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '15s',
      exec: 'deviceLifecycle',
    },

    // Scenario B: reconnect spike — all devices hit warmUpCache at the same time
    // Models volunteers reconnecting after hotel WiFi drops during a meal.
    // Starts after main scenario is already running.
    reconnect_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      startTime: '30s', // let device_lifecycle settle first
      stages: [
        { duration: '5s',  target: RECONNECT_VUS }, // sudden reconnect
        { duration: '30s', target: RECONNECT_VUS }, // hold spike
        { duration: '5s',  target: 0 },
      ],
      exec: 'warmupOnly',
    },
  },

  thresholds: {
    // Warm-up (5 GETs) should complete in under 3s p95
    warmup_duration_ms:    ['p(95)<3000', 'p(99)<5000'],
    // Individual sync GETs under 1s p95
    profiles_duration_ms:  ['p(95)<1000'],
    meals_duration_ms:     ['p(95)<1000'],
    // Scan endpoint under 1s p95
    scan_duration_ms:      ['p(95)<1000', 'p(99)<2000'],
    // Flush endpoint under 1s p95
    flush_duration_ms:     ['p(95)<1000'],
    // Hard failure caps
    scans_errored:         ['count<10'],
    warmup_errors:         ['count<5'],
    // Success rates
    scan_success_rate:     ['rate>0.98'],
    flush_success_rate:    ['rate>0.98'],
    warmup_success_rate:   ['rate>0.99'],
    http_req_failed:       ['rate<0.05'],
  },
};

// ── Setup: login + fetch UID list (runs once before all VUs start) ──────────

export function setup() {
  console.log(`=== good-scan load test ===`);
  console.log(`Target:  ${BASE_URL}`);
  console.log(`Devices: ${DEVICES} | MealID: ${MEAL_ID} | ScanInterval: ${SCAN_INTERVAL}s`);

  // 1. Login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/volunteer`,
    JSON.stringify({ code: VOLUNTEER_CODE }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (loginRes.status !== 200) {
    throw new Error(`Login failed: ${loginRes.status} — ${loginRes.body}`);
  }
  const token = loginRes.json('token');
  console.log(`Login OK — got volunteer JWT`);

  // 2. Fetch profiles to build UID list (same call good-scan makes in warmUpCache)
  const profilesRes = http.get(
    `${BASE_URL}/api/scan/sync/profiles`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (profilesRes.status !== 200) {
    throw new Error(`GET /profiles failed: ${profilesRes.status}`);
  }
  const profiles = profilesRes.json();
  const uids = profiles.map(p => p.uid).filter(uid => uid != null && uid !== '');
  if (uids.length === 0) {
    throw new Error('No attendee UIDs — sync the event data first');
  }
  console.log(`Loaded ${uids.length} attendee UIDs`);

  // 3. Fetch meal IDs for the active event (used to cross-check MEAL_ID)
  const mealsRes = http.get(
    `${BASE_URL}/api/scan/sync/meals`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meals = mealsRes.status === 200 ? mealsRes.json() : [];
  const mealIds = meals.map(m => m.id);
  if (mealIds.length > 0 && !mealIds.includes(MEAL_ID)) {
    console.warn(`Warning: MEAL_ID=${MEAL_ID} not found. Available: ${mealIds.join(', ')}`);
  }

  return { token, uids, mealIds };
}

// ── Scenario A: full device lifecycle ──────────────────────────────────────

export function deviceLifecycle(data) {
  const { token, uids } = data;
  const headers = {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${token}`,
  };

  // On first iteration each VU does a full cache warm-up (like app startup)
  if (__ITER === 0) {
    group('cache_warmup', () => doWarmup(headers));
  }

  // Pick UID: spread devices across UID list to minimise repeated-person 409s
  const uid = pickUid(uids, __VU, __ITER, DEVICES);

  // ── Real-time scan (good-scan fires this immediately on QR code result) ──
  group('meal_scan', () => {
    const t0 = Date.now();
    const res = http.post(
      `${BASE_URL}/api/meal/scan`,
      JSON.stringify({ id: uid, mealId: MEAL_ID }),
      { headers, tags: { name: 'meal_scan' } }
    );
    scanDuration.add(Date.now() - t0);

    const ok    = res.status === 201 || res.status === 200;
    const quota = res.status === 409;
    const err5x = res.status >= 500 || res.status === 0;
    const err4x = res.status >= 400 && !quota && res.status < 500;

    if (res.status === 201) scansAccepted.add(1);
    if (quota)              scansQuotaFull.add(1);
    if (err4x)              scansRejected.add(1);
    if (err5x)              scansErrored.add(1);
    scanSuccessRate.add(ok || quota); // quota-full is an expected outcome, not a failure

    check(res, {
      'scan: new record (201)':      r => r.status === 201,
      'scan: idempotent (200)':      r => r.status === 200,
      'scan: quota full (409)':      r => r.status === 409,
      'scan: no server error':       r => r.status < 500,
    });

    if (err5x) {
      console.error(`VU${__VU} scan 5xx: uid=${uid} status=${res.status} body=${res.body?.slice(0, 200)}`);
    }
  });

  // Wait ~10s then flush (models good-scan's 10-second flush interval)
  const halfWait = Math.max(1, SCAN_INTERVAL / 2 - JITTER + Math.random() * JITTER * 2);
  sleep(halfWait);

  // ── Flush queue (good-scan's POST /scan/sync/flush) ──────────────────────
  group('flush', () => {
    // Simulate a single pending scan in the queue (1 item is the common case —
    // the real-time scan already fired, so the queue has 0–1 items)
    const payload = [{
      localId:   __VU * 10000 + __ITER, // unique per VU+iteration
      uid:       uid,
      mealId:    MEAL_ID,
      scannedAt: new Date().toISOString(),
    }];

    const t0 = Date.now();
    const res = http.post(
      `${BASE_URL}/api/scan/sync/flush`,
      JSON.stringify(payload),
      { headers, tags: { name: 'flush' } }
    );
    flushDuration.add(Date.now() - t0);

    const ok = res.status === 200;
    flushSuccessRate.add(ok);
    if (ok) {
      const accepted = res.json('accepted') || [];
      flushAccepted.add(accepted.length);
    }

    check(res, {
      'flush: 200 OK':        r => r.status === 200,
      'flush: no server error': r => r.status < 500,
    });

    if (res.status >= 500 || res.status === 0) {
      console.error(`VU${__VU} flush error: status=${res.status} body=${res.body?.slice(0, 200)}`);
    }
  });

  // Every 15th iteration re-sync the cache (models the 5-min re-sync interval
  // compressed to fit the test duration)
  if (__ITER > 0 && __ITER % 15 === 0) {
    group('periodic_resync', () => doWarmup(headers));
  }

  // Wait remaining half of scan interval before next scan
  const remainWait = Math.max(1, SCAN_INTERVAL / 2 - JITTER + Math.random() * JITTER * 2);
  sleep(remainWait);
}

// ── Scenario B: warmup-only (reconnect spike) ──────────────────────────────

export function warmupOnly(data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${data.token}`,
  };
  group('reconnect_warmup', () => doWarmup(headers));
  // Brief pause between repeated reconnects in the spike window
  sleep(2 + Math.random() * 3);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Full cache warm-up: fires 5 sync GETs, measures total wall-clock time.
 * Mirrors good-scan's Promise.all([profiles, meals, registerMeals, scans, voidedScans]).
 */
function doWarmup(headers) {
  const t0 = Date.now();

  // Fire all 5 sync endpoints in a batch (k6 http.batch = parallel requests)
  const responses = http.batch([
    ['GET', `${BASE_URL}/api/scan/sync/profiles`,        null, { headers, tags: { name: 'sync_profiles'       } }],
    ['GET', `${BASE_URL}/api/scan/sync/meals`,           null, { headers, tags: { name: 'sync_meals'          } }],
    ['GET', `${BASE_URL}/api/scan/sync/register-meals`,  null, { headers, tags: { name: 'sync_register_meals' } }],
    ['GET', `${BASE_URL}/api/scan/sync/scans`,           null, { headers, tags: { name: 'sync_scans'          } }],
    ['GET', `${BASE_URL}/api/scan/sync/voided-scans`,    null, { headers, tags: { name: 'sync_voided'         } }],
  ]);

  const wall = Date.now() - t0;
  warmupDuration.add(wall);

  // Track individual endpoint latencies using response times k6 already measured
  const [profilesRes, mealsRes] = responses;
  if (profilesRes.timings) profilesDuration.add(profilesRes.timings.duration);
  if (mealsRes.timings)    mealsDuration.add(mealsRes.timings.duration);

  const allOk = responses.every(r => r.status === 200);
  warmupSuccess.add(allOk);
  if (!allOk) {
    warmupErrors.add(1);
    responses.forEach((r, i) => {
      if (r.status !== 200) {
        console.warn(`VU${__VU} warmup[${i}] failed: ${r.status} ${r.url}`);
      }
    });
  }

  check(responses[0], { 'warmup: profiles 200': r => r.status === 200 });
  check(responses[1], { 'warmup: meals 200':    r => r.status === 200 });
  check(responses[2], { 'warmup: reg-meals 200': r => r.status === 200 });
  check(responses[3], { 'warmup: scans 200':    r => r.status === 200 });
  check(responses[4], { 'warmup: voided 200':   r => r.status === 200 });
}

/**
 * Spreads VUs across the UID list so different devices mostly scan
 * different people, reducing 409 quota-exceeded noise.
 */
function pickUid(uids, vu, iter, totalDevices) {
  const offset = (vu - 1) * Math.floor(uids.length / totalDevices);
  return uids[(offset + iter) % uids.length];
}

// ── Teardown ───────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log('');
  console.log('=== good-scan load test complete ===');
  console.log(`Devices: ${DEVICES} | MealID: ${MEAL_ID}`);
  console.log(`UIDs tested: ${data.uids.length}`);
  console.log('');
  console.log('Key thresholds to check:');
  console.log('  warmup_duration_ms   p95 < 3000ms  (cache warm-up under load)');
  console.log('  scan_duration_ms     p95 < 1000ms  (real-time scan latency)');
  console.log('  flush_duration_ms    p95 < 1000ms  (background flush latency)');
  console.log('  scans_errored        count < 10    (hard server errors)');
  console.log('  warmup_errors        count < 5     (sync endpoint failures)');
}
