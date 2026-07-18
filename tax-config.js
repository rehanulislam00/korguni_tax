/* =========================================================================
   BANGLADESH INCOME TAX CONFIGURATION
   Income Year 2025-2026 / Assessment Year 2026-2027
   Source: National Board of Revenue (NBR), Finance Ordinance 2025
   -------------------------------------------------------------------------
   Update this object every fiscal year. No calculation logic lives here -
   only numbers. The engine in calculator.js reads these values, so a new
   budget only requires editing TAX_CONFIG.
   ========================================================================= */

const TAX_CONFIG = {
  fiscalYear: "Income Year 2025-2026 (Assessment Year 2026-2027)",

  // Tax-free threshold by taxpayer category (BDT, annual)
  taxFreeLimits: {
    male: 375000,
    female: 425000,
    third_gender: 500000,
    senior: 425000,      // resident individual aged 65+
    disabled: 500000,    // physically challenged person
    freedom_fighter: 525000
  },

  // Progressive slabs applied AFTER the tax-free threshold is removed.
  // Each slab's "limit" is the width of that bracket (not a cumulative
  // ceiling). The final slab uses limit: null to mean "remainder".
  slabs: [
    { label: "First", limit: 100000, rate: 0.05 },
    { label: "Next", limit: 400000, rate: 0.10 },
    { label: "Next", limit: 500000, rate: 0.15 },
    { label: "Next", limit: 500000, rate: 0.20 },
    { label: "Next", limit: 2000000, rate: 0.25 },
    { label: "Remaining", limit: null, rate: 0.30 }
  ],

  // Investment tax rebate (Section 78, Income Tax Act 2023)
  rebate: {
    rateOnInvestment: 0.15,        // 15% of eligible investment
    capPercentOfTaxableIncome: 0.03, // eligible investment capped at 3% of taxable income
    maxRebateAmount: 1000000       // absolute ceiling: BDT 10,00,000 (10 lakh)
  },

  // Flat minimum tax - applies once taxable income exceeds the tax-free limit
  minimumTax: {
    standard: 5000,
    newTaxpayer: 1000
  },

  currency: "BDT"
};

// Freeze to prevent accidental mutation at runtime
Object.freeze(TAX_CONFIG.taxFreeLimits);
Object.freeze(TAX_CONFIG.rebate);
Object.freeze(TAX_CONFIG.minimumTax);
Object.freeze(TAX_CONFIG);
