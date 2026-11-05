#!/usr/bin/env tsx
/**
 * MTN MoMo API smoke-test harness.
 *
 * Mock mode is useful for deterministic regression but is NOT MTN sandbox
 * evidence. For live API checks, configure credentials and explicitly set
 * MOMO_USE_MOCK=false and MOMO_TARGET_ENV=sandbox.
 */
import { momoService } from '../src/services/momoService';

async function main() {
  const mockMode = momoService.isMock();
  console.log('\n========================================================================================');
  console.log('                 RestoPass MTN MoMo API Smoke-Test Harness                               ');
  console.log('========================================================================================');
  console.log(`Execution Mode : ${mockMode ? 'MOCK SIMULATION — NOT LIVE MTN' : 'LIVE MTN API REQUESTS'}`);
  console.log('Target Host    : https://sandbox.momodeveloper.mtn.com');
  console.log(`Timestamp      : ${new Date().toISOString()}\n`);

  if (!mockMode && process.env.MOMO_TARGET_ENV !== 'sandbox') {
    throw new Error('Refusing sandbox smoke tests unless MOMO_TARGET_ENV=sandbox');
  }

  const results = await momoService.runFullSandboxTestMatrix();
  console.log('| ID | Scenario | Step | HTTP | Expected | Actual | Latency | Result |');
  console.log('|---:|---|---|---:|---:|---:|---:|---|');
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.result === 'PASS') passed++;
    else failed++;
    console.log(`| ${r.testCaseId} | ${r.scenarioTitle} | ${r.stepDescription} | ${r.httpMethod} | ${r.expectedStatus} | ${r.actualStatus} | ${r.executionTimeMs}ms | ${r.result} |`);
  }
  console.log(`\nSummary: ${results.length} scenarios | ${passed} passed | ${failed} failed`);

  if (results.length !== 15 || failed > 0) {
    console.error('MoMo smoke-test checks failed or did not execute all 15 scenarios.');
    process.exitCode = 1;
    return;
  }

  if (mockMode) {
    console.warn('\nMOCK SIMULATION PASSED. This is NOT evidence of live MTN sandbox connectivity, payer authorization, transaction settlement, RWF support, or merchant certification.');
  } else {
    console.warn('\nLIVE API HTTP smoke checks completed. HTTP 202 is pending/accepted, not a successful payment. Verify terminal SUCCESSFUL status and reconcile amount, currency, externalId, payer and financialTransactionId before claiming end-to-end success.');
  }
}

main().catch((err) => {
  console.error('Fatal error running MoMo smoke tests:', err instanceof Error ? err.message : 'Unknown error');
  process.exitCode = 1;
});
