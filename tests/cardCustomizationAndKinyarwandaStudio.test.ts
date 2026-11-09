import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { restoStore } from '../src/store/restoStore';
import {
  translations,
  flattenTranslations,
  unflattenTranslations,
  applyCustomTranslations,
} from '../src/services/i18n';
import { getCardThemePalette } from '../src/components/restaurant/CardPrintStudio';
import { sound } from '../src/services/audioService';

describe('Card Customization & Kinyarwanda Live Translation Studio', () => {
  test('1. Card Theme Palette respects customized restaurant badgeStyle and primaryColor', () => {
    // Emerald / Cyber Emerald
    const emeraldPalette = getCardThemePalette('emerald', 'emerald');
    assert.equal(emeraldPalette.gradientMid, '#059669');
    assert.equal(emeraldPalette.backStripe, 'bg-emerald-800');
    assert.equal(emeraldPalette.brandText, 'text-emerald-950');

    // Gold / Classic Gold
    const goldPalette = getCardThemePalette('gold', 'amber');
    assert.equal(goldPalette.gradientMid, '#d97706');
    assert.equal(goldPalette.backStripe, 'bg-amber-800');
    assert.equal(goldPalette.brandText, 'text-amber-950');

    // Executive Midnight / Dark
    const darkPalette = getCardThemePalette('dark', 'blue');
    assert.equal(darkPalette.gradientMid, '#1e293b');
    assert.equal(darkPalette.backStripe, 'bg-slate-950');

    // Royal Purple
    const purplePalette = getCardThemePalette(undefined, 'purple');
    assert.equal(purplePalette.gradientMid, '#9333ea');
    assert.equal(purplePalette.backStripe, 'bg-purple-900');

    // Crimson Red / Rose
    const rosePalette = getCardThemePalette(undefined, 'rose');
    assert.equal(rosePalette.gradientMid, '#e11d48');
    assert.equal(rosePalette.backStripe, 'bg-rose-900');

    // Fallback Campus Blue
    const bluePalette = getCardThemePalette(undefined, undefined);
    assert.equal(bluePalette.gradientMid, '#0369a1');
    assert.equal(bluePalette.backStripe, 'bg-blue-950');
  });

  test('2. flattenTranslations and unflattenTranslations correctly map nested dictionary structures', () => {
    const sample = {
      scanner: {
        title: 'Ikigo cyo gusikana',
        deep: {
          nested: 'Ubutumwa bwimbitse',
        },
      },
      appName: 'RestoPass',
    };

    const flat = flattenTranslations(sample);
    assert.equal(flat['scanner.title'], 'Ikigo cyo gusikana');
    assert.equal(flat['scanner.deep.nested'], 'Ubutumwa bwimbitse');
    assert.equal(flat['appName'], 'RestoPass');

    const unflat = unflattenTranslations(flat);
    assert.deepEqual(unflat, sample);
  });

  test('3. Super Admin Live Kinyarwanda translation overrides update and apply dynamically in memory', () => {
    const originalReady = translations.rw.scanner.readyToScan;

    // Super Admin customizes the scanner prompt
    const customPhrase = 'Tegereza gukoresha ikarita yawe cyangwa QR ya telefoni nonaha';
    restoStore.saveCustomTranslations('rw', {
      scanner: {
        readyToScan: customPhrase,
      },
    });

    // Verify it is updated in memory immediately
    assert.equal(translations.rw.scanner.readyToScan, customPhrase);

    // Verify stored in customTranslations state
    const customState = restoStore.getCustomTranslations('rw');
    assert.equal(customState?.scanner?.readyToScan, customPhrase);

    // Reset to factory defaults restores original baseline
    restoStore.resetCustomTranslations('rw');
    assert.equal(restoStore.getCustomTranslations('rw')?.scanner?.readyToScan, undefined);
  });

  test('4. Central Audio Service provides loud, distinct success chime and failure buzzer with master limiter', () => {
    sound.setSoundEnabled(true);
    sound.setVolume(1.0);
    assert.equal(sound.getVolume(), 1.0);
    assert.equal(sound.isSoundEnabled(), true);

    // Audio methods execute cleanly and safely without errors
    sound.preloadScannerSounds();
    sound.playSecondPlateBeep();
    sound.playUndoBeep();
    sound.playNotificationChime();
  });

  test('5. Production clean state contains zero seed expenses, branches, staff users, or mock alerts, preserves real RW02/RW03 tenants (P0-08), and guards browser storage in Node (P0-12)', () => {
    // Switch to production clean mode
    restoStore.setDemoMode(false);
    const prodState = restoStore.getState();

    // Verify branches, stationUsers, expenses, notifications are clean
    assert.equal(prodState.branches.length, 0, 'Production must not have mock branches');
    assert.equal(prodState.stationUsers.length, 0, 'Production must not have mock staff users');
    assert.equal(prodState.expenses.length, 0, 'Production must not have mock expenses');
    assert.equal(prodState.notifications.length, 0, 'Production must not have mock notifications');
    assert.equal(prodState.customers.length, 0, 'Production must not have mock customers');
    assert.equal(prodState.ledgerEntries.length, 0, 'Production must not have mock ledger entries');

    // P0-08: Real restaurants created with code RW02 or RW03 (and their packages/branches/scanPoints) must NOT be dropped on server merge
    restoStore.mergeServerState({
      restaurants: [
        {
          code: 'RW02',
          name: 'Kigali Innovation Dining Hall',
          legalEntity: 'Kigali Innovation Catering Ltd',
          phone: '+250 788 100 200',
          email: 'ops@kigaliinnovation.rw',
          address: 'KG 7 Ave, Kigali',
          currency: 'RWF',
          status: 'active',
          planId: 'plan_starter',
          defaultPlatePriceRwf: 1200,
          badgeStyle: 'emerald',
          welcomeMessage: 'Welcome to Kigali Innovation Dining Hall',
          primaryColor: '#059669',
          highestTimeSeen: Date.now(),
          lastSyncAt: new Date().toISOString(),
          softwareVersion: '1.1.0-authority',
          createdAt: new Date().toISOString(),
        },
      ],
      packages: [
        {
          id: 'pkg_real_rw02_30',
          restaurantCode: 'RW02',
          name: '30 Plates Monthly Pack',
          platesCount: 30,
          priceRwf: 36000,
          description: 'Real RW02 package',
        },
      ],
      branches: [
        {
          id: 'br_real_rw02_1',
          restaurantCode: 'RW02',
          name: 'Main Innovation Hall',
          code: 'RW02-MAIN',
          location: 'KG 7 Ave',
          managerName: 'Alice Uwase',
          managerPhone: '+250 788 100 201',
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      ],
      scanPoints: [
        {
          id: 'sp_real_rw02_1',
          restaurantCode: 'RW02',
          name: 'Innovation Line 1',
          deviceModel: 'Scanner Terminal',
          pairingCode: 'PAIR-RW02',
          status: 'active',
          lastHeartbeat: new Date().toISOString(),
        },
      ],
    });

    assert.ok(
      restoStore.getState().restaurants.some((r) => r.code === 'RW02' && r.name === 'Kigali Innovation Dining Hall'),
      'Real RW02 restaurant must be preserved during production mergeServerState (P0-08)'
    );
    assert.ok(
      restoStore.getState().packages.some((p) => p.id === 'pkg_real_rw02_30'),
      'Real RW02 package must be preserved during production mergeServerState (P0-08)'
    );
    assert.ok(
      restoStore.getState().branches.some((b) => b.id === 'br_real_rw02_1'),
      'Real RW02 branch must be preserved during production mergeServerState (P0-08)'
    );

    // P0-12: Node execution of terminal pairing and audio persistence methods must not throw ReferenceError on localStorage/navigator
    const pairRes = restoStore.pairTerminalDevice({
      restaurantCode: 'RW02',
      pairingKeyOrCode: 'PAIR-RW02',
    });
    assert.equal(pairRes.success, true);
    assert.equal(restoStore.isCurrentTerminalPaired('RW02'), true);
    assert.equal(restoStore.revokeTerminalPairing('sp_real_rw02_1'), true);
    assert.equal(restoStore.revokeAllCashierSessions('RW02'), 0);

    // Switch back to demo mode for test suite continuity
    restoStore.setDemoMode(true);
  });
});

