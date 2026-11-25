'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyVisualGroups, buildGroupingBody, groupingDigest, parseGroupingResponse } = require('../services/bouquetVisualGrouping');

test('grouping request is bounded and demands the exact same physical arrangement', () => {
  const candidates = Array.from({ length: 25 }, (_, index) => ({ customId: `c${index}`, imageDataUrl: 'data:image/jpeg;base64,AA==' }));
  const body = buildGroupingBody(candidates, 'gpt-6-luna');
  assert.equal(body.text.format.name, 'bouquet_visual_groups');
  assert.match(body.input[0].content[0].text, /exact same physical bouquet arrangement/);
  assert.match(body.input[0].content[0].text, /Similar flowers.*not enough/);
  assert.equal(body.input[0].content.filter((item) => item.type === 'input_image').length, 20);
});

test('only valid groups at confidence 0.9 or higher are accepted', () => {
  const response = { output_text: JSON.stringify({ groups: [
    { primaryCustomId: 'a', secondaryCustomIds: ['b'], confidence: 0.95 },
    { primaryCustomId: 'a', secondaryCustomIds: ['c'], confidence: 0.89 },
    { primaryCustomId: 'a', secondaryCustomIds: ['unknown'], confidence: 0.99 },
  ] }) };
  assert.deepEqual(parseGroupingResponse(response, ['a', 'b', 'c']), [
    { primaryCustomId: 'a', secondaryCustomIds: ['b'], confidence: 0.95 },
  ]);
  assert.equal(groupingDigest(['p2', 'p1']), groupingDigest(['p1', 'p2']));
});

test('visual groups merge angles but never conflicting human-confirmed compositions', () => {
  const state = {
    drafts: [
      { customId: 'a', photoIds: ['p1'] },
      { customId: 'b', photoIds: ['p2'] },
      { customId: 'c', photoIds: ['p3'] },
    ],
    confirmedCompositions: [
      { source: 'HUMAN', status: 'CONFIRMED', photoIds: ['p1'], lines: [{ name: 'Rose', quantity: 7 }] },
      { source: 'HUMAN', status: 'CONFIRMED', photoIds: ['p3'], lines: [{ name: 'Lily', quantity: 3 }] },
    ],
  };
  const merged = applyVisualGroups(state, [{ primaryCustomId: 'a', secondaryCustomIds: ['b', 'c'], confidence: 0.99 }]);
  assert.deepEqual(merged, [{ primaryCustomId: 'a', secondaryCustomId: 'b' }]);
  assert.deepEqual(state.drafts[0].photoIds, ['p1', 'p2']);
  assert.equal(state.drafts[1].mergedInto, 'a');
  assert.equal(state.drafts[2].mergedInto, undefined);
});

test('a confirmed secondary recipe never merges into an unconfirmed or different recipe', () => {
  const state = { drafts: [
    { customId: 'primary', photoIds: ['p1'], recipeId: 'r1' },
    { customId: 'secondary', photoIds: ['p2'], recipeId: 'r2' },
  ] };
  const recipes = [
    { id: 'r1', confirmedAt: null, lines: [] },
    { id: 'r2', confirmedAt: new Date(), lines: [{ name: 'Rose', quantity: 7 }] },
  ];
  assert.deepEqual(applyVisualGroups(state, [{ primaryCustomId: 'primary', secondaryCustomIds: ['secondary'], confidence: 0.99 }], { recipes }), []);
  assert.equal(state.drafts[1].mergedInto, undefined);
});

