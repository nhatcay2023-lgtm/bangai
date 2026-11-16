import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactItemsForSync,
  compactStrokesForSync,
  sanitizeBoardId,
  sanitizeBoardTitle,
  sanitizeGridType,
  sanitizeTheme,
} from './boardSerializer';

test('sanitizeBoardId and sanitizeBoardTitle enforce schema bounds', () => {
  assert.equal(sanitizeBoardId('abc/123?'), 'abc-123-');
  assert.equal(sanitizeBoardId(''), 'board-main');
  assert.equal(sanitizeBoardTitle('   '), 'Bảng học mới');
  assert.equal(sanitizeBoardTitle('a'.repeat(200)).length, 120);
});

test('sanitizeTheme and sanitizeGridType fall back to valid defaults', () => {
  assert.equal(sanitizeTheme('navy'), 'navy');
  assert.equal(sanitizeTheme('invalid'), 'green');
  assert.equal(sanitizeGridType('lined'), 'lined');
  assert.equal(sanitizeGridType('bogus'), 'none');
});

test('compactStrokesForSync and compactItemsForSync enforce array bounds', () => {
  const manyStrokes = Array.from({ length: 850 }, (_, i) => ({
    id: `s-${i}`,
    tool: 'chalk' as const,
    color: '#fff',
    width: 4,
    opacity: 1,
    points: [{ x: 1.234, y: 5.678 }],
  }));
  const compacted = compactStrokesForSync(manyStrokes, 800);
  assert.equal(compacted.length, 800);
  assert.deepEqual(compacted[0].points[0], { x: 1.2, y: 5.7 });

  const manyItems = Array.from({ length: 120 }, (_, i) => ({
    id: `item-${i}`,
    kind: 'note' as const,
    title: 'Note',
    color: '#FDE047',
    x: 10,
    y: 20,
    width: 50,
    height: 40,
  }));
  const compactedItems = compactItemsForSync(manyItems, 100);
  assert.equal(compactedItems.length, 100);
  assert.equal(compactedItems[0].width, 120);
  assert.equal(compactedItems[0].height, 90);
});

test('compactItemsForSync strips nested undefined properties from diagram specs', () => {
  const compacted = compactItemsForSync([
    {
      id: 'diag-1',
      kind: 'diagram',
      title: 'Tam giác',
      color: '#38BDF8',
      x: 100,
      y: 120,
      width: 270,
      height: 210,
      diagram: {
        id: 'd1',
        title: 'Tam giác',
        kind: 'triangle',
        caption: undefined,
        params: { a: 3, b: 4, c: 5, labelA: undefined },
      },
    },
  ]);

  assert.equal('caption' in (compacted[0].diagram || {}), false);
  assert.equal('labelA' in (compacted[0].diagram?.params || {}), false);
  assert.equal(compacted[0].diagram?.params.a, 3);
});

test('compactItemsForSync preserves Grade 1 worksheet items without undefined fields', () => {
  const compacted = compactItemsForSync([
    {
      id: 'ws-1',
      kind: 'worksheet',
      title: 'Bài 1: Phép cộng phạm vi 10',
      color: '#FDE047',
      x: 140,
      y: 120,
      width: 900,
      height: 680,
      worksheet: {
        id: 'g1-add-10',
        number: 1,
        title: 'Phép cộng phạm vi 10',
        instruction: 'Tính nhẩm:',
        layout: 'horizontal',
        columns: 2,
        problems: [{ id: 'p1', text: '3 + 4 = ......', top: undefined }],
      },
    },
  ]);

  assert.equal(compacted[0].kind, 'worksheet');
  assert.equal(compacted[0].width, 900);
  assert.equal(compacted[0].worksheet?.number, 1);
  assert.equal('top' in (compacted[0].worksheet?.problems[0] || {}), false);
});
