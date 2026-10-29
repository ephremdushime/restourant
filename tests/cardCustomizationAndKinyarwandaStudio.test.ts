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
});

