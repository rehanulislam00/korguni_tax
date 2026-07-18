/* =========================================================================
   BANGLADESH INCOME TAX CALCULATION ENGINE
   Pure functions only - no DOM access here. Reads from TAX_CONFIG so the
   logic never needs to change when NBR updates slabs/rebates each budget.
   ========================================================================= */

const TaxEngine = (() => {

  /** Round to nearest integer BDT (NBR returns are whole-taka). */
  function round(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /**
   * STEP 1 - Build the annual income breakdown from raw form inputs.
   * @param {object} i - raw numeric inputs (all annualized already except basicSalary which is monthly)
   */
  function calculateAnnualIncome(i) {
    const salaryIncome =
      (i.basicSalary * 12) +
      i.houseRent +
      i.medical +
      i.conveyance +
      i.festivalBonus +
      i.performanceBonus +
      i.overtime +
      i.otherAllowances;

    const otherIncome =
      i.businessIncome +
      i.rentalIncome +
      i.freelancingIncome +
      i.foreignIncome +
      i.otherIncome;

    const totalIncome = salaryIncome + otherIncome;

    return { salaryIncome, otherIncome, totalIncome };
  }

  /**
   * STEP 2 - Determine the applicable tax-free threshold.
   * Priority: disabled > third_gender > senior(65+) > female > male.
   * (Freedom fighter status, if ever exposed in the UI, would take top priority.)
   */
  function getTaxFreeLimit({ gender, age, isDisabled, isFreedomFighter }) {
    const L = TAX_CONFIG.taxFreeLimits;
    if (isFreedomFighter) return L.freedom_fighter;
    if (isDisabled) return L.disabled;
    if (gender === "third_gender") return L.third_gender;
    if (age >= 65) return L.senior;
    if (gender === "female") return L.female;
    return L.male;
  }

  /**
   * STEP 3 - Progressive slab calculation on taxable income.
   * Returns gross tax plus a per-slab breakdown for the UI table.
   */
  function calculateSlabTax(taxableIncome) {
    let remaining = Math.max(0, taxableIncome);
    let grossTax = 0;
    const breakdown = [];

    for (const slab of TAX_CONFIG.slabs) {
      if (remaining <= 0) {
        breakdown.push({ label: slab.label, limit: slab.limit, rate: slab.rate, taxableAmount: 0, tax: 0 });
        continue;
      }
      const slabWidth = slab.limit === null ? remaining : Math.min(slab.limit, remaining);
      const slabTax = slabWidth * slab.rate;

      breakdown.push({
        label: slab.label,
        limit: slab.limit,
        rate: slab.rate,
        taxableAmount: round(slabWidth),
        tax: round(slabTax)
      });

      grossTax += slabTax;
      remaining -= slabWidth;
    }

    return { grossTax: round(grossTax), breakdown };
  }

  /**
   * STEP 4 - Investment tax rebate.
   * Rebate = 15% x lowest of (actual eligible investment, 3% of taxable income, BDT 10,00,000)
   */
  function calculateRebate(taxableIncome, totalInvestment) {
    const { rateOnInvestment, capPercentOfTaxableIncome, maxRebateAmount } = TAX_CONFIG.rebate;

    const capByIncome = taxableIncome * capPercentOfTaxableIncome;
    const eligibleInvestment = Math.min(totalInvestment, capByIncome, maxRebateAmount / rateOnInvestment);

    let rebate = eligibleInvestment * rateOnInvestment;
    rebate = Math.min(rebate, maxRebateAmount);

    return {
      eligibleInvestment: round(Math.max(0, eligibleInvestment)),
      rebate: round(Math.max(0, rebate))
    };
  }

  /**
   * STEP 5 - Final net tax payable.
   * Applies the flat minimum tax floor (only when taxable income > 0,
   * i.e. income exceeds the tax-free threshold), then subtracts
   * payments already made. Never returns below zero.
   */
  function calculateFinalTax({ grossTax, rebate, taxableIncome, taxAlreadyPaid, tds, isNewTaxpayer }) {
    const taxAfterRebate = Math.max(0, grossTax - rebate);

    let minTax = 0;
    if (taxableIncome > 0) {
      minTax = isNewTaxpayer ? TAX_CONFIG.minimumTax.newTaxpayer : TAX_CONFIG.minimumTax.standard;
    }

    const taxAfterMinimum = Math.max(taxAfterRebate, minTax > taxAfterRebate ? minTax : taxAfterRebate);
    // Minimum tax floor only kicks in if slab tax (after rebate) is genuinely lower
    const flooredTax = taxableIncome > 0 ? Math.max(taxAfterRebate, minTax) : taxAfterRebate;

    const netTax = Math.max(0, flooredTax - taxAlreadyPaid - tds);

    return {
      taxAfterRebate: round(taxAfterRebate),
      minimumTaxApplied: round(minTax),
      flooredTax: round(flooredTax),
      netTax: round(netTax)
    };
  }

  /**
   * Tax-saving suggestion helper - how much more investment would
   * maximize the rebate, and the resulting extra tax saved.
   */
  function calculateSavingOpportunity(taxableIncome, totalInvestment) {
    const { rateOnInvestment, capPercentOfTaxableIncome, maxRebateAmount } = TAX_CONFIG.rebate;
    const maxEligibleByIncome = Math.min(taxableIncome * capPercentOfTaxableIncome, maxRebateAmount / rateOnInvestment);

    const additionalInvestmentNeeded = Math.max(0, maxEligibleByIncome - totalInvestment);
    const potentialExtraSaving = round(additionalInvestmentNeeded * rateOnInvestment);

    const currentEligible = Math.min(totalInvestment, maxEligibleByIncome);
    const utilizationPercent = maxEligibleByIncome > 0
      ? round((currentEligible / maxEligibleByIncome) * 100)
      : 0;

    return {
      maxEligibleByIncome: round(maxEligibleByIncome),
      additionalInvestmentNeeded: round(additionalInvestmentNeeded),
      potentialExtraSaving,
      utilizationPercent: Math.min(100, utilizationPercent)
    };
  }

  /**
   * Master orchestrator - runs all 5 steps and returns one result object
   * the UI layer can render directly.
   */
  function calculateFullTax(input) {
    const { salaryIncome, otherIncome, totalIncome } = calculateAnnualIncome(input);

    const taxFreeLimit = getTaxFreeLimit(input);
    const taxableIncome = Math.max(0, totalIncome - taxFreeLimit);

    const { grossTax, breakdown } = calculateSlabTax(taxableIncome);

    const totalInvestment =
      input.dps + input.lifeInsurance + input.providentFund +
      input.approvedInvestments + input.govSavingsCertificates +
      input.zakatDonation + input.approvedDonations;

    const { eligibleInvestment, rebate } = calculateRebate(taxableIncome, totalInvestment);

    const finalTax = calculateFinalTax({
      grossTax,
      rebate,
      taxableIncome,
      taxAlreadyPaid: input.taxAlreadyPaid,
      tds: input.tdsDeducted,
      isNewTaxpayer: input.isNewTaxpayer
    });

    const savingOpportunity = calculateSavingOpportunity(taxableIncome, totalInvestment);

    return {
      fiscalYear: TAX_CONFIG.fiscalYear,
      salaryIncome: round(salaryIncome),
      otherIncome: round(otherIncome),
      totalIncome: round(totalIncome),
      taxFreeLimit: round(taxFreeLimit),
      taxableIncome: round(taxableIncome),
      grossTax,
      slabBreakdown: breakdown,
      totalInvestment: round(totalInvestment),
      eligibleInvestment,
      rebate,
      taxAlreadyPaid: round(input.taxAlreadyPaid),
      tdsDeducted: round(input.tdsDeducted),
      minimumTaxApplied: finalTax.minimumTaxApplied,
      netTax: finalTax.netTax,
      savingOpportunity
    };
  }

  return {
    calculateAnnualIncome,
    getTaxFreeLimit,
    calculateSlabTax,
    calculateRebate,
    calculateFinalTax,
    calculateSavingOpportunity,
    calculateFullTax,
    round
  };
})();
