const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'knowledge.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);

const { observations, concepts, edges, playbooks } = context.window.KNOWLEDGE;
const observationIds = new Set(observations.map((item) => item.id));
const conceptIds = new Set(concepts.map((item) => item.id));

assert.equal(observationIds.size, observations.length, '观察节点 ID 必须唯一');
assert.equal(conceptIds.size, concepts.length, '考点节点 ID 必须唯一');
assert.ok(observations.every((item) => item.label && item.definition && item.layer && item.group), '观察节点字段必须完整');
assert.ok(concepts.every((item) => item.label && item.checkPrompt && Number.isInteger(item.checkCost)), '考点必须有验证提示和成本');

for (const edge of edges) {
  assert.ok(observationIds.has(edge.observationId), `边引用了不存在的观察：${edge.observationId}`);
  assert.ok(conceptIds.has(edge.conceptId), `边引用了不存在的考点：${edge.conceptId}`);
}

for (const observation of observations) {
  assert.ok(edges.some((edge) => edge.observationId === observation.id), `观察项没有右侧关联：${observation.id}`);
}

for (const concept of concepts) {
  assert.ok(edges.some((edge) => edge.conceptId === concept.id), `考点没有反向观察提示：${concept.id}`);
}

for (const playbook of playbooks) {
  for (const id of [...(playbook.trigger.all || []), ...(playbook.trigger.any || []), ...playbook.linkedObservationIds]) {
    assert.ok(observationIds.has(id), `专题 ${playbook.id} 引用了不存在的观察：${id}`);
  }
  for (const id of playbook.orderedConcepts) {
    assert.ok(conceptIds.has(id), `专题 ${playbook.id} 引用了不存在的考点：${id}`);
  }
}

function matches(playbookId, selectedIds) {
  const selected = new Set(selectedIds);
  const playbook = playbooks.find((item) => item.id === playbookId);
  return (playbook.trigger.all || []).every((id) => selected.has(id)) &&
    (!(playbook.trigger.any || []).length || playbook.trigger.any.some((id) => selected.has(id)));
}

assert.ok(matches('playbook.black_white_grid', ['obs.encoding.black_white']));
assert.ok(matches('playbook.black_white_grid', ['obs.grid.black_white']));
assert.ok(matches('playbook.line_on_matrix', ['obs.locator.matrix', 'obs.line.bends_many']));
assert.ok(matches('playbook.chinese_glyph', ['obs.glyph.chinese']));
assert.ok(matches('playbook.mark', ['obs.mark.present']));
assert.ok(matches('playbook.planar_space', ['obs.puzzle.solid']));

console.log(`知识完整性检查通过：${observations.length} 个观察，${concepts.length} 个考点，${edges.length} 条双向边，${playbooks.length} 个专题。`);
