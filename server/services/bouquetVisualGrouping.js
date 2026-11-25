'use strict';

const crypto = require('node:crypto');

function groupingDigest(photoIds) {
  return crypto.createHash('sha256').update([...new Set(photoIds.map(String))].sort().join('\n')).digest('hex');
}

function groupingSchema() {
  return {
    type: 'json_schema', name: 'bouquet_visual_groups', strict: true,
    schema: {
      type: 'object', additionalProperties: false, required: ['groups'],
      properties: { groups: { type: 'array', maxItems: 20, items: {
        type: 'object', additionalProperties: false,
        required: ['primaryCustomId', 'secondaryCustomIds', 'confidence'],
        properties: {
          primaryCustomId: { type: 'string' },
          secondaryCustomIds: { type: 'array', items: { type: 'string' }, maxItems: 19 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      } } },
    },
  };
}

function buildGroupingBody(candidates, model) {
  const limited = candidates.slice(0, 20);
  const content = [{
    type: 'input_text',
    text: 'Group only photographs of the exact same physical bouquet arrangement seen from different angles. Similar flowers, palette, wrapping, or style are not enough: keep those separate. Return only high-confidence visual matches.',
  }];
  for (const item of limited) {
    content.push({ type: 'input_text', text: `customId=${item.customId}` });
    content.push({ type: 'input_image', detail: 'low', image_url: item.imageDataUrl });
  }
  return {
    model, reasoning: { effort: 'none' }, max_output_tokens: 500,
    input: [{ role: 'user', content }], text: { format: groupingSchema() },
  };
}

function outputText(body) {
  if (typeof body?.output_text === 'string') return body.output_text;
  for (const output of body?.output || []) for (const content of output?.content || []) {
    if (typeof content?.text === 'string') return content.text;
  }
  return null;
}

function parseGroupingResponse(body, candidateIds) {
  let value;
  try { value = JSON.parse(outputText(body)); } catch { return []; }
  const allowed = new Set(candidateIds);
  if (!Array.isArray(value?.groups)) return [];
  return value.groups.filter((group) => group && allowed.has(group.primaryCustomId)
    && Array.isArray(group.secondaryCustomIds) && group.secondaryCustomIds.every((id) => allowed.has(id) && id !== group.primaryCustomId)
    && Number(group.confidence) >= 0.9)
    .map((group) => ({ primaryCustomId: group.primaryCustomId, secondaryCustomIds: [...new Set(group.secondaryCustomIds)], confidence: Number(group.confidence) }));
}

function confirmedSignature(state, draft) {
  const match = (state.confirmedCompositions || []).find((entry) => entry?.source === 'HUMAN' && entry?.status === 'CONFIRMED'
    && Array.isArray(entry.photoIds) && entry.photoIds.some((id) => (draft.photoIds || []).includes(String(id))));
  return match ? JSON.stringify(match.lines || []) : null;
}

function applyVisualGroups(state, groups, { recipes = [] } = {}) {
  const drafts = Array.isArray(state.drafts) ? state.drafts : [];
  const byId = new Map(drafts.map((draft) => [draft.customId, draft]));
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const merged = [];
  for (const group of groups) {
    if (group.confidence < 0.9) continue;
    const primary = byId.get(group.primaryCustomId);
    if (!primary || primary.mergedInto) continue;
    const primarySignature = confirmedSignature(state, primary);
    const primaryRecipe = recipesById.get(primary.recipeId);
    for (const secondaryId of group.secondaryCustomIds) {
      const secondary = byId.get(secondaryId);
      if (!secondary || secondary.mergedInto) continue;
      const secondarySignature = confirmedSignature(state, secondary);
      if (primarySignature && secondarySignature && primarySignature !== secondarySignature) continue;
      const secondaryRecipe = recipesById.get(secondary.recipeId);
      if (secondaryRecipe?.confirmedAt) {
        if (!primaryRecipe?.confirmedAt) continue;
        if (JSON.stringify(primaryRecipe.lines || []) !== JSON.stringify(secondaryRecipe.lines || [])) continue;
      }
      primary.photoIds = [...new Set([...(primary.photoIds || []), ...(secondary.photoIds || [])])];
      secondary.mergedInto = primary.customId;
      merged.push({ primaryCustomId: primary.customId, secondaryCustomId: secondary.customId });
    }
  }
  return merged;
}

module.exports = { applyVisualGroups, buildGroupingBody, groupingDigest, parseGroupingResponse };
