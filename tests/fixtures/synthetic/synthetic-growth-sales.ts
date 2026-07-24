/**
 * Synthetic Land Registry sales for pure unit tests of growth CAGR math only.
 * NOT for e2e / golden — those use tests/fixtures/recorded/.
 */
import type { LandRegistrySale } from '../../src/lib/landRegistryLookup';

function sale(
  partial: Partial<LandRegistrySale> & { amount: number; date: string; addressLabel: string }
): LandRegistrySale {
  return {
    paon: '',
    saon: '',
    street: 'SYNTHETIC STREET',
    town: 'TESTTOWN',
    postcode: 'TE1 1AA',
    propertyType: 'Detached',
    ...partial,
  };
}

/** ~2.5% CAGR series — synthetic addresses, never appear in golden. */
export function syntheticGrowthSampleSales(): LandRegistrySale[] {
  const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  return years.map((y, i) =>
    sale({
      addressLabel: `Synthetic Unit ${10 + i}, Synthetic Street, Testtown TE1 1AA`,
      amount: Math.round(400_000 * Math.pow(1.025, i)),
      date: `${y}-06-15`,
    })
  );
}

export function syntheticSale(
  partial: Partial<LandRegistrySale> & { amount: number; date: string; addressLabel: string }
): LandRegistrySale {
  return sale(partial);
}
