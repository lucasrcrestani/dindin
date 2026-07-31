import { describe, it, expect } from 'vitest';
import RecordType from '../src/models/RecordType.js';
import { computeCategoryBalances, computeGeneralBalance } from '../src/utils/balanceUtils.js';

describe('computeGeneralBalance()', () => {
  it('uses unique month records for actual income/expenses even when categories share records', () => {
    const categories = [
      { id: 'cat-exp-a', name: 'Despesa A', recordType: RecordType.EXPENSE, idealValue: 100, tagIds: ['t-common'] },
      { id: 'cat-exp-b', name: 'Despesa B', recordType: RecordType.EXPENSE, idealValue: 100, tagIds: ['t-common', 't-extra'] },
      { id: 'cat-inc-a', name: 'Receita A', recordType: RecordType.INCOME, idealValue: 500, tagIds: ['t-salary'] },
      { id: 'cat-inc-b', name: 'Receita B', recordType: RecordType.INCOME, idealValue: 500, tagIds: ['t-salary', 't-extra-income'] },
    ];

    const sharedExpense = {
      id: 'rec-exp-shared',
      recordType: RecordType.EXPENSE,
      value: '120',
      tagIds: ['t-common', 't-extra'],
    };
    const sharedIncome = {
      id: 'rec-inc-shared',
      recordType: RecordType.INCOME,
      value: '600',
      tagIds: ['t-salary', 't-extra-income'],
    };

    const monthRecords = [sharedExpense, sharedIncome, { ...sharedExpense }, { ...sharedIncome }];

    const categoryBalances = computeCategoryBalances(categories, monthRecords);
    const general = computeGeneralBalance(categoryBalances, monthRecords);

    expect(general.income).toBe(1000);
    expect(general.expenses).toBe(120);
    expect(general.actualIncome).toBe(600);
    expect(general.balance).toBe(480);
  });
});