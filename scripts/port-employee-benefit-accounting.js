const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/utils/employeeBenefitAccounting.js'), 'utf8');
let out = src
  .replace(
    /import \{([^}]+)\} from '\.\/productPricing';/,
    "const { roundMoney, getProductType, costFromWeight, stockUnitsForItem } = require('./productPricing');"
  )
  .replace(
    /import \{ getCashDayKey \} from '\.\/cashDayPeriod';/,
    "const { getCashDayKey } = require('./cashDayPeriod');"
  )
  .replace(/^export const /gm, 'const ')
  .replace(/^export function /gm, 'function ')
  .replace(/^export \{ roundMoney \};\s*/m, '');
out =
  '/** Server copy — keep in sync with src/utils/employeeBenefitAccounting.js */\n' +
  out +
  `
module.exports = {
  EMPLOYEE_BENEFIT_SECTION,
  EMPLOYEE_BENEFIT_CATEGORY,
  BENEFIT_TYPE_CASH,
  BENEFIT_TYPE_INVENTORY,
  BENEFIT_TYPE_PERSONAL,
  BENEFIT_STATUS_APPROVED,
  BENEFIT_STATUS_CANCELLED,
  roundMoney,
  buildEmployeeBenefitExpenseFields,
  buildBenefitReference,
  dailyUsageDocId,
  assertBenefitPermission,
  validateBenefitInput,
  uniqueStaffMembersByName,
};
`;
fs.writeFileSync(path.join(root, 'functions/lib/employeeBenefitAccounting.js'), out);
