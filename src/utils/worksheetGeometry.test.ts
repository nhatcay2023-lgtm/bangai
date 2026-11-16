import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADE1_EXERCISES } from '../constants/grade1Exercises';
import {
  computeWorksheetScale,
  getDefaultWorksheetSize,
  validateGrade1Catalog,
} from './worksheetGeometry';

test('GRADE1_EXERCISES has 10 valid unique exercises numbered 1 to 10', () => {
  assert.equal(GRADE1_EXERCISES.length, 10);
  assert.equal(validateGrade1Catalog(GRADE1_EXERCISES), true);
  assert.deepEqual(
    GRADE1_EXERCISES.map((e) => e.number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
});

test('computeWorksheetScale scales proportionally and clamps to bounds', () => {
  const ex = GRADE1_EXERCISES[0];
  const base = getDefaultWorksheetSize(ex);
  assert.equal(computeWorksheetScale(base.width, base.height, ex), 1);

  const bigger = computeWorksheetScale(base.width * 1.5, base.height * 1.5, ex);
  assert.equal(bigger, 1.5);

  const tiny = computeWorksheetScale(120, 80, ex);
  assert.equal(tiny, 0.65);

  const huge = computeWorksheetScale(1200, 900, ex);
  assert.equal(huge, 2.35);
});
