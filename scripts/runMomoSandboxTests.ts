#!/usr/bin/env tsx
/**
 * RestoPass MTN MoMo Sandbox 15-Point Certification Runner
 * 
 * Executes all 15 scenarios from the official MTN MoMo Sandbox test matrix:
 * - Test cases 1-2: Sandbox User Provisioning
 * - Test cases 3-7: Collection API
 * - Test cases 8-13: Disbursement API
 * - Test cases 14-15: Remittance API
 * 
 * Usage:
 *   npx tsx scripts/runMomoSandboxTests.ts
 */

import { momoService } from '../src/services/momoService';

async function main() {
  console.log('\n========================================================================================');
  console.log('       RestoPass MTN Mobile Money (MoMo) Sandbox Integration & Certification Suite      ');
  console.log('========================================================================================');
  console.log(`Execution Mode : ${momoService.isMock() ? 'Mock Sandbox Mode (Deterministic)' : 'Live MTN Sandbox Gateway'}`);
  console.log(`Target Host    : https://sandbox.momodeveloper.mtn.com`);
  console.log(`Timestamp      : ${new Date().toISOString()}\n`);

  console.log('Running all 15 test scenarios...');
  const results = await momoService.runFullSandboxTestMatrix();

  console.log('\n========================================================================================================================');
  console.log('| ID | Scenario Title             | Step Description                   | HTTP | Exp | Act | Latency | Result |');
  console.log('|---|----------------------------|------------------------------------|------|-----|-----|---------|--------|');

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    if (r.result === 'PASS') passed++;
    else failed++;

    const idStr = String(r.testCaseId).padStart(2, ' ');
    const title = r.scenarioTitle.padEnd(26, ' ');
    const desc = r.stepDescription.padEnd(34, ' ');
    const method = r.httpMethod.padEnd(4, ' ');
    const exp = String(r.expectedStatus).padEnd(3, ' ');
    const act = String(r.actualStatus).padEnd(3, ' ');
    const latency = `${r.executionTimeMs}ms`.padStart(7, ' ');
    const res = r.result === 'PASS' ? ' PASS ' : ' FAIL ';

    console.log(`| ${idStr} | ${title} | ${desc} | ${method} | ${exp} | ${act} | ${latency} | ${res} |`);
  }

  console.log('========================================================================================================================\n');
  console.log(`Execution Summary: ${results.length} total tests | ${passed} passed | ${failed} failed`);

  if (failed > 0) {
    console.error('\n>>> SOME MOMO SANDBOX TESTS FAILED <<<\n');
    process.exit(1);
  } else {
    console.log('\n>>> ALL 15 MOMO SANDBOX TEST SCENARIOS PASSED SUCCESSFULLY <<<\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error running MoMo test matrix:', err);
  process.exit(1);
});
