/* =========================================================================
   KORGONI APP LOGIC
   Handles: form reading/validation, number formatting, live calculation,
   rendering results, charts, theme toggle, save/load, PDF/print/copy/share.
   ========================================================================= */

(() => {
  "use strict";

  const STORAGE_KEY = "korgoni_bd_tax_calc_v1";
  const THEME_KEY = "korgoni_theme";

  const moneyFieldIds = [
    "basicSalary","houseRent","medical","conveyance","festivalBonus","performanceBonus",
    "overtime","otherAllowances","businessIncome","rentalIncome","freelancingIncome",
    "foreignIncome","otherIncome","dps","lifeInsurance","providentFund",
    "approvedInvestments","govSavingsCertificates","zakatDonation","approvedDonations",
    "taxAlreadyPaid","tdsDeducted"
  ];

  let incomeChart = null;
  let taxChart = null;
  let lastResult = null;
  let lastInputsForTable = {};

  /* ----------------------------- FORMAT HELPERS ----------------------------- */

  function fmt(n) {
    const v = Math.round(n || 0);
    return "৳" + v.toLocaleString("en-IN");
  }

  function fmtPlain(n) {
    return Math.round(n || 0).toLocaleString("en-IN");
  }

  function parseMoney(str) {
    const cleaned = String(str || "0").replace(/[^\d.]/g, "");
    const val = parseFloat(cleaned);
    return isNaN(val) || val < 0 ? 0 : val;
  }

  /* ----------------------------- LIVE COMMA FORMATTING ----------------------------- */

  function attachMoneyFormatting() {
    moneyFieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      el.addEventListener("focus", () => {
        const raw = parseMoney(el.value);
        el.value = raw === 0 ? "" : String(raw);
      });

      el.addEventListener("blur", () => {
        const raw = parseMoney(el.value);
        el.value = fmtPlain(raw);
        el.classList.remove("is-invalid");
      });

      el.addEventListener("input", () => {
        const cleaned = el.value.replace(/[^\d]/g, "");
        if (cleaned !== el.value) {
          el.value = cleaned;
        }
      });
    });
  }

  function readInputs() {
    const get = id => parseMoney(document.getElementById(id).value);

    return {
      gender: document.getElementById("gender").value,
      age: parseInt(document.getElementById("age").value, 10) || 0,
      residentStatus: document.getElementById("residentStatus").value,
      isDisabled: document.getElementById("isDisabled").checked,
      isFreedomFighter: false,
      isNewTaxpayer: document.getElementById("isNewTaxpayer").checked,

      basicSalary: get("basicSalary"),
      houseRent: get("houseRent"),
      medical: get("medical"),
      conveyance: get("conveyance"),
      festivalBonus: get("festivalBonus"),
      performanceBonus: get("performanceBonus"),
      overtime: get("overtime"),
      otherAllowances: get("otherAllowances"),

      businessIncome: get("businessIncome"),
      rentalIncome: get("rentalIncome"),
      freelancingIncome: get("freelancingIncome"),
      foreignIncome: get("foreignIncome"),
      otherIncome: get("otherIncome"),

      dps: get("dps"),
      lifeInsurance: get("lifeInsurance"),
      providentFund: get("providentFund"),
      approvedInvestments: get("approvedInvestments"),
      govSavingsCertificates: get("govSavingsCertificates"),
      zakatDonation: get("zakatDonation"),
      approvedDonations: get("approvedDonations"),

      taxAlreadyPaid: get("taxAlreadyPaid"),
      tdsDeducted: get("tdsDeducted")
    };
  }

  /* ----------------------------- VALIDATION ----------------------------- */

  function validateForm() {
    let valid = true;
    const age = document.getElementById("age");
    if (!age.value || parseInt(age.value, 10) < 18 || parseInt(age.value, 10) > 100) {
      age.classList.add("is-invalid");
      valid = false;
    } else {
      age.classList.remove("is-invalid");
    }

    moneyFieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (parseMoney(el.value) < 0) {
        el.classList.add("is-invalid");
        valid = false;
      }
    });

    return valid;
  }

  /* ----------------------------- RENDER RESULTS ----------------------------- */

  function renderResults(r) {
    document.getElementById("emptyState").classList.add("d-none");
    document.getElementById("resultsArea").classList.remove("d-none");

    document.getElementById("rNetTax").textContent = fmt(r.netTax);
    document.getElementById("rNetTax2").textContent = fmt(r.netTax);

    document.getElementById("rSalaryIncome").textContent = fmt(r.salaryIncome);
    document.getElementById("rOtherIncome").textContent = fmt(r.otherIncome);
    document.getElementById("rTotalIncome").textContent = fmt(r.totalIncome);
    document.getElementById("rTaxFree").textContent = fmt(r.taxFreeLimit);
    document.getElementById("rTaxableIncome").textContent = fmt(r.taxableIncome);

    document.getElementById("rGrossTax").textContent = fmt(r.grossTax);
    document.getElementById("rRebate").textContent = "− " + fmt(r.rebate);
    document.getElementById("rPaid").textContent = "− " + fmt(r.taxAlreadyPaid);
    document.getElementById("rTds").textContent = "− " + fmt(r.tdsDeducted);

    const minRow = document.getElementById("rMinTaxRow");
    if (r.minimumTaxApplied > 0 && r.minimumTaxApplied > (r.grossTax - r.rebate)) {
      minRow.style.display = "flex";
      document.getElementById("rMinTax").textContent = fmt(r.minimumTaxApplied);
    } else {
      minRow.style.display = "none";
    }

    renderIncomeTable(r);
    renderSlabTable(r);
    renderSuggestions(r);
    renderCharts(r);
  }

  function renderIncomeTable() {
    const body = document.getElementById("incomeTableBody");
    const i = lastInputsForTable;
    const rows = [
      ["Salary (Basic + Allowances)", (i.basicSalary * 12) + i.houseRent + i.medical + i.conveyance + i.overtime + i.otherAllowances],
      ["Bonus", i.festivalBonus + i.performanceBonus],
      ["Rental", i.rentalIncome],
      ["Freelancing", i.freelancingIncome],
      ["Business", i.businessIncome],
      ["Others", i.foreignIncome + i.otherIncome]
    ];
    body.innerHTML = rows.map(([label, amt]) =>
      `<tr><td>${label}</td><td class="text-end"><strong>${fmt(amt)}</strong></td></tr>`
    ).join("");
  }

  function renderSlabTable(r) {
    const body = document.getElementById("slabTableBody");
    body.innerHTML = r.slabBreakdown.map(s => {
      const widthLabel = s.limit === null ? "Balance" : fmtPlain(s.limit);
      return `<tr>
        <td>${s.label} ${widthLabel}</td>
        <td class="text-end">${fmt(s.taxableAmount)}</td>
        <td class="text-end">${(s.rate * 100).toFixed(0)}%</td>
        <td class="text-end"><strong>${fmt(s.tax)}</strong></td>
      </tr>`;
    }).join("");
  }

  function renderSuggestions(r) {
    const u = r.savingOpportunity;
    document.getElementById("sUtilization").textContent = u.utilizationPercent.toFixed(0) + "%";
    document.getElementById("sUtilizationBar").style.width = Math.min(100, u.utilizationPercent) + "%";
    document.getElementById("sAdditional").textContent = fmt(u.additionalInvestmentNeeded);
    document.getElementById("sExtraSaving").textContent = fmt(u.potentialExtraSaving);
  }

  function renderCharts(r) {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? "#AAB6CC" : "#4A5568";
    const palette = ["#0F1F3D", "#C68A1F", "#1F8A5F", "#1D3461", "#A8730F", "#8993A6"];

    const incomeCtx = document.getElementById("incomeChart");
    const taxCtx = document.getElementById("taxChart");

    const incomeData = {
      labels: ["Salary Income", "Other Income"],
      datasets: [{ data: [r.salaryIncome, r.otherIncome], backgroundColor: [palette[0], palette[1]], borderWidth: 0 }]
    };

    const taxData = {
      labels: ["Net Tax", "Rebate", "Paid/TDS"],
      datasets: [{
        data: [r.netTax, r.rebate, r.taxAlreadyPaid + r.tdsDeducted],
        backgroundColor: [palette[1], palette[2], palette[5]],
        borderWidth: 0
      }]
    };

    const chartOpts = {
      plugins: {
        legend: { position: "bottom", labels: { color: textColor, font: { size: 10 }, boxWidth: 10, padding: 8 } }
      },
      maintainAspectRatio: false
    };

    if (incomeChart) incomeChart.destroy();
    if (taxChart) taxChart.destroy();

    incomeChart = new Chart(incomeCtx, { type: "pie", data: incomeData, options: chartOpts });
    taxChart = new Chart(taxCtx, { type: "doughnut", data: taxData, options: chartOpts });
  }

  /* ----------------------------- MAIN CALCULATE ----------------------------- */

  function calculate() {
    if (!validateForm()) {
      showToast("Please fix the highlighted fields.");
      return;
    }
    const inputs = readInputs();
    lastInputsForTable = inputs;
    const result = TaxEngine.calculateFullTax(inputs);
    lastResult = result;
    renderResults(result);
    document.getElementById("resultWrapper").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ----------------------------- RESET ----------------------------- */

  function resetForm() {
    document.getElementById("taxForm").reset();
    moneyFieldIds.forEach(id => { document.getElementById(id).value = "0"; });
    document.getElementById("emptyState").classList.remove("d-none");
    document.getElementById("resultsArea").classList.add("d-none");
    lastResult = null;
    showToast("Calculator reset.");
  }

  /* ----------------------------- SAVE / LOAD ----------------------------- */

  function saveCalculation() {
    const inputs = readInputs();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
    showToast("Calculation saved to this device.");
  }

  function loadCalculation() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      showToast("No saved calculation found.");
      return;
    }
    const data = JSON.parse(raw);
    document.getElementById("gender").value = data.gender || "male";
    document.getElementById("age").value = data.age || 30;
    document.getElementById("residentStatus").value = data.residentStatus || "resident";
    document.getElementById("isDisabled").checked = !!data.isDisabled;
    document.getElementById("isNewTaxpayer").checked = !!data.isNewTaxpayer;

    moneyFieldIds.forEach(id => {
      if (data[id] !== undefined) document.getElementById(id).value = fmtPlain(data[id]);
    });

    showToast("Saved calculation loaded.");
    calculate();
  }

  /* ----------------------------- THEME ----------------------------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const icon = document.querySelector("#themeToggle i");
    icon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
    localStorage.setItem(THEME_KEY, theme);
    if (lastResult) renderCharts(lastResult);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  }

  /* ----------------------------- TOAST ----------------------------- */

  function showToast(message) {
    const toastEl = document.getElementById("appToast");
    document.getElementById("appToastBody").textContent = message;
    const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2400 });
    toast.show();
  }

  /* ----------------------------- COPY / SHARE / PRINT / PDF ----------------------------- */

  function buildSummaryText() {
    if (!lastResult) return "";
    const r = lastResult;
    return [
      `Bangladesh Income Tax Summary — ${r.fiscalYear}`,
      `Total Income: ${fmt(r.totalIncome)}`,
      `Tax-Free Allowance: ${fmt(r.taxFreeLimit)}`,
      `Taxable Income: ${fmt(r.taxableIncome)}`,
      `Gross Tax: ${fmt(r.grossTax)}`,
      `Tax Rebate: ${fmt(r.rebate)}`,
      `Tax Already Paid: ${fmt(r.taxAlreadyPaid)}`,
      `TDS Deducted: ${fmt(r.tdsDeducted)}`,
      `Net Tax Payable: ${fmt(r.netTax)}`,
      ``,
      `Generated by KorGoni — for planning purposes only, verify with NBR.`
    ].join("\n");
  }

  function copyResult() {
    if (!lastResult) { showToast("Calculate your tax first."); return; }
    navigator.clipboard.writeText(buildSummaryText())
      .then(() => showToast("Result copied to clipboard."))
      .catch(() => showToast("Could not copy. Try again."));
  }

  function shareResult() {
    if (!lastResult) { showToast("Calculate your tax first."); return; }
    const text = buildSummaryText();
    if (navigator.share) {
      navigator.share({ title: "Bangladesh Income Tax Summary", text }).catch(() => {});
    } else {
      copyResult();
    }
  }

  function buildPrintHTML() {
    const r = lastResult;
    const slabRows = r.slabBreakdown.map(s => {
      const widthLabel = s.limit === null ? "Balance" : fmtPlain(s.limit);
      return `<tr><td>${s.label} ${widthLabel}</td><td style="text-align:right">${fmt(s.taxableAmount)}</td><td style="text-align:right">${(s.rate*100).toFixed(0)}%</td><td style="text-align:right">${fmt(s.tax)}</td></tr>`;
    }).join("");

    return `
      <div style="font-family: Arial, sans-serif; color:#131B2E; padding:24px; max-width:720px;">
        <h2 style="margin-bottom:0;">Bangladesh Income Tax Summary</h2>
        <p style="color:#666; margin-top:4px;">${r.fiscalYear}</p>
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
          <tr><td style="padding:6px 0;">Total Income</td><td style="text-align:right; padding:6px 0;">${fmt(r.totalIncome)}</td></tr>
          <tr><td style="padding:6px 0;">Tax-Free Allowance</td><td style="text-align:right; padding:6px 0;">${fmt(r.taxFreeLimit)}</td></tr>
          <tr><td style="padding:6px 0; font-weight:bold;">Taxable Income</td><td style="text-align:right; padding:6px 0; font-weight:bold;">${fmt(r.taxableIncome)}</td></tr>
        </table>
        <h3>Tax Slab Breakdown</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:13px;">
          <thead><tr style="background:#ECEFF4;"><th style="text-align:left; padding:6px;">Slab</th><th style="text-align:right; padding:6px;">Taxable Amount</th><th style="text-align:right; padding:6px;">Rate</th><th style="text-align:right; padding:6px;">Tax</th></tr></thead>
          <tbody>${slabRows}</tbody>
        </table>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:6px 0;">Gross Tax</td><td style="text-align:right; padding:6px 0;">${fmt(r.grossTax)}</td></tr>
          <tr><td style="padding:6px 0;">Tax Rebate</td><td style="text-align:right; padding:6px 0;">− ${fmt(r.rebate)}</td></tr>
          <tr><td style="padding:6px 0;">Tax Already Paid</td><td style="text-align:right; padding:6px 0;">− ${fmt(r.taxAlreadyPaid)}</td></tr>
          <tr><td style="padding:6px 0;">TDS Deducted</td><td style="text-align:right; padding:6px 0;">− ${fmt(r.tdsDeducted)}</td></tr>
          <tr style="border-top:2px solid #131B2E;"><td style="padding:10px 0; font-weight:bold; font-size:16px;">Net Tax Payable</td><td style="text-align:right; padding:10px 0; font-weight:bold; font-size:16px;">${fmt(r.netTax)}</td></tr>
        </table>
        <p style="color:#999; font-size:11px; margin-top:24px;">Generated by KorGoni Bangladesh Income Tax Calculator. For planning purposes only — verify final figures with NBR or a registered tax practitioner before filing.</p>
      </div>`;
  }

  function printResult() {
    if (!lastResult) { showToast("Calculate your tax first."); return; }
    const printArea = document.getElementById("printArea");
    printArea.innerHTML = buildPrintHTML();
    window.print();
  }

  function downloadPDF() {
    if (!lastResult) { showToast("Calculate your tax first."); return; }
    const printArea = document.getElementById("printArea");
    printArea.innerHTML = buildPrintHTML();
    printArea.classList.remove("d-none");
    printArea.style.position = "fixed";
    printArea.style.left = "-9999px";
    printArea.style.background = "#fff";

    html2canvas(printArea, { scale: 2, backgroundColor: "#ffffff" }).then(canvas => {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("p", "pt", "a4");
      const imgWidth = 595;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save("Bangladesh-Income-Tax-Summary.pdf");
      printArea.classList.add("d-none");
      printArea.style.position = "";
      printArea.style.left = "";
      showToast("PDF downloaded.");
    }).catch(() => {
      showToast("Could not generate PDF.");
      printArea.classList.add("d-none");
    });
  }

  /* ----------------------------- INIT ----------------------------- */

  function init() {
    attachMoneyFormatting();

    const savedTheme = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(savedTheme);

    document.getElementById("taxForm").addEventListener("submit", e => {
      e.preventDefault();
      calculate();
    });

    document.getElementById("resetBtn").addEventListener("click", resetForm);
    document.getElementById("saveBtn").addEventListener("click", saveCalculation);
    document.getElementById("loadBtn").addEventListener("click", loadCalculation);
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);

    document.getElementById("copyBtn").addEventListener("click", copyResult);
    document.getElementById("shareBtn").addEventListener("click", shareResult);
    document.getElementById("printBtn").addEventListener("click", printResult);
    document.getElementById("pdfBtn").addEventListener("click", downloadPDF);

    document.querySelectorAll("footer").forEach(f => {
      f.innerHTML = f.innerHTML.replace("{{FY}}", TAX_CONFIG.fiscalYear);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
