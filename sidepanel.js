(function () {
  const { observations, concepts, edges, playbooks, formats } = window.KNOWLEDGE;
  const strengthRank = { strong: 3, normal: 2, weak: 1 };
  const groupOrder = ['一眼看', '载体', '人为痕迹', '变化'];
  const defaultConceptIds = ['symmetry', 'openness', 'curve', 'concept.part_count', 'position.static', 'movement.translation', 'adjacent.compare', 'element.count', 'number.sequence', 'number.operation'];
  const storageKey = 'tuxing-training-session-v1';
  const state = {
    selectedObservationIds: [],
    conceptStates: {},
    expandedConceptIds: [],
    formatId: 'five_one',
    finalConceptId: '',
    mobileTab: 'observations',
    reviewOpen: false,
    reverseConceptId: ''
  };

  const $ = (id) => document.getElementById(id);
  const selectedSet = () => new Set(state.selectedObservationIds);
  const conceptById = (id) => concepts.find((concept) => concept.id === id);

  function storageGet() {
    return new Promise((resolve) => {
      if (isExtensionContext()) {
        chrome.storage.local.get(storageKey, (value) => resolve(value?.[storageKey] || null));
      } else {
        try { resolve(JSON.parse(localStorage.getItem(storageKey) || 'null')); } catch { resolve(null); }
      }
    });
  }

  function storageSet() {
    const snapshot = {
      selectedObservationIds: state.selectedObservationIds,
      conceptStates: state.conceptStates,
      expandedConceptIds: state.expandedConceptIds,
      formatId: state.formatId,
      finalConceptId: state.finalConceptId
    };
    if (isExtensionContext()) chrome.storage.local.set({ [storageKey]: snapshot });
    else localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }

  function isExtensionContext() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local) && location.protocol === 'chrome-extension:';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function matchedPlaybooks() {
    const selected = selectedSet();
    return playbooks.filter((playbook) => {
      const allOk = (playbook.trigger.all || []).every((id) => selected.has(id));
      const anyIds = playbook.trigger.any || [];
      return allOk && (!anyIds.length || anyIds.some((id) => selected.has(id)));
    });
  }

  function rankedConcepts() {
    const selected = selectedSet();
    const active = matchedPlaybooks();
    const linked = edges.filter((edge) => selected.has(edge.observationId));
    const ids = new Set(linked.map((edge) => edge.conceptId));
    active.forEach((playbook) => playbook.orderedConcepts.forEach((id) => ids.add(id)));
    if (!ids.size) defaultConceptIds.forEach((id) => ids.add(id));
    const playbookPosition = new Map();
    active.forEach((playbook, playbookIndex) => playbook.orderedConcepts.forEach((id, index) => {
      if (!playbookPosition.has(id)) playbookPosition.set(id, playbookIndex * 100 + index);
    }));
    return Array.from(ids).map((id) => conceptById(id)).filter(Boolean).sort((a, b) => {
      const ae = linked.filter((edge) => edge.conceptId === a.id).reduce((max, edge) => Math.max(max, strengthRank[edge.strength] || 0), 0);
      const be = linked.filter((edge) => edge.conceptId === b.id).reduce((max, edge) => Math.max(max, strengthRank[edge.strength] || 0), 0);
      const ap = playbookPosition.has(a.id) ? 0 : 1;
      const bp = playbookPosition.has(b.id) ? 0 : 1;
      return ap - bp || (playbookPosition.get(a.id) ?? 999) - (playbookPosition.get(b.id) ?? 999) || be - ae || a.checkCost - b.checkCost || a.order - b.order;
    });
  }

  function renderFormats() {
    $('formatSelect').innerHTML = formats.map((format) => `<option value="${format.id}">${escapeHtml(format.label)}</option>`).join('');
    $('formatSelect').value = state.formatId;
  }

  function renderPlaybooks() {
    const active = matchedPlaybooks();
    $('playbookChips').innerHTML = active.length
      ? active.map((playbook) => `<span class="chip active"><span class="chip-mark">●</span>${escapeHtml(playbook.label)}</span>`).join('')
      : '<span class="chip neutral">通用框架</span>';
  }

  function renderObservations() {
    const selected = selectedSet();
    const reverseEdges = state.reverseConceptId ? edges.filter((edge) => edge.conceptId === state.reverseConceptId) : [];
    const hinted = new Set(reverseEdges.map((edge) => edge.observationId));
    const grouped = groupOrder.map((group) => ({ group, items: observations.filter((observation) => observation.group === group) })).filter((entry) => entry.items.length);
    $('observationGroups').innerHTML = grouped.map(({ group, items }) => {
      const isCollapsed = (group === '人为痕迹' || group === '变化') && !items.some((item) => selected.has(item.id) || hinted.has(item.id));
      return `<section class="observation-group ${isCollapsed ? 'collapsed' : ''}">
        <button class="group-toggle" data-group-toggle="${escapeHtml(group)}"><span>${escapeHtml(group)}</span><span class="group-chevron">⌄</span></button>
        <div class="observation-items">${items.map((item) => `<button class="observation-item ${selected.has(item.id) ? 'selected' : ''} ${hinted.has(item.id) ? 'hinted' : ''}" data-observation="${item.id}" title="${escapeHtml(item.definition)}">
          <span class="checkmark">${selected.has(item.id) ? '✓' : ''}</span><span class="observation-label">${escapeHtml(item.label)}</span>${hinted.has(item.id) ? '<span class="hint-label">回看</span>' : ''}
        </button>`).join('')}</div></section>`;
    }).join('');
    $('observationCount').textContent = String(state.selectedObservationIds.length);
    $('selectionCount').textContent = state.selectedObservationIds.length ? `已记录 ${state.selectedObservationIds.length} 项观察` : '尚未记录观察';
    const hintLabels = Array.from(hinted).map((id) => observations.find((observation) => observation.id === id)?.label).filter(Boolean).slice(0, 4);
    const reverseHint = $('reverseHint');
    if (hintLabels.length) {
      reverseHint.classList.remove('hidden');
      reverseHint.innerHTML = `<strong>重新看题</strong><span>${hintLabels.map(escapeHtml).join(' · ')}</span>`;
    } else reverseHint.classList.add('hidden');
  }

  function stateLabel(status) { return ({ untested: '未检', retained: '暂留', excluded: '排除', confirmed: '确认' })[status] || '未检'; }

  function renderConcepts() {
    const list = rankedConcepts();
    const selected = selectedSet();
    const groups = [];
    list.forEach((concept) => {
      const group = groups.find((entry) => entry.category === concept.category);
      if (group) group.items.push(concept); else groups.push({ category: concept.category, items: [concept] });
    });
    $('conceptGroups').innerHTML = groups.map(({ category, items }) => `<section class="concept-group"><div class="concept-group-title">${escapeHtml(category)}</div>${items.map((concept) => {
      const status = state.conceptStates[concept.id] || 'untested';
      const expanded = state.expandedConceptIds.includes(concept.id);
      const evidence = edges.filter((edge) => selected.has(edge.observationId) && edge.conceptId === concept.id).sort((a, b) => (strengthRank[b.strength] || 0) - (strengthRank[a.strength] || 0))[0];
      return `<article class="concept-card ${status} ${expanded ? 'expanded' : ''}">
        <div class="concept-main"><button class="concept-title" data-expand="${concept.id}" aria-expanded="${expanded}"><span class="concept-status ${status}">${status === 'untested' ? '○' : status === 'retained' ? '?' : status === 'excluded' ? '×' : '✓'}</span><span>${escapeHtml(concept.label)}</span></button>
          <div class="concept-actions"><button data-state="retained" data-concept="${concept.id}" class="mini-action retained" title="暂留">?</button><button data-state="excluded" data-concept="${concept.id}" class="mini-action excluded" title="排除">×</button><button data-state="confirmed" data-concept="${concept.id}" class="mini-action confirmed" title="确认">✓</button></div>
        </div>
        ${expanded ? `<div class="concept-detail"><p>${escapeHtml(concept.checkPrompt)}</p>${evidence ? `<span class="evidence">来自观察：${escapeHtml(observations.find((observation) => observation.id === evidence.observationId)?.label || '')}</span>` : '<span class="evidence muted">通用排除队列</span>'}</div>` : ''}
      </article>`;
    }).join('')}</section>`).join('');
    $('emptyConcepts').classList.toggle('hidden', list.length > 0);
    $('conceptCount').textContent = String(list.length);
    const convergence = list.filter((concept) => (state.conceptStates[concept.id] || 'untested') !== 'excluded').slice(0, 7);
    $('convergenceItems').innerHTML = convergence.length ? convergence.map((concept) => `<button data-convergence="${concept.id}">${escapeHtml(concept.label)}</button>`).join('') : '<span class="convergence-empty">已排除当前队列，继续记录观察</span>';
  }

  function renderReview() {
    $('reviewPanel').classList.toggle('hidden', !state.reviewOpen);
    const list = rankedConcepts();
    $('finalConceptSelect').innerHTML = '<option value="">选择最终考点…</option>' + list.map((concept) => `<option value="${concept.id}">${escapeHtml(concept.label)}</option>`).join('');
    $('finalConceptSelect').value = state.finalConceptId || '';
    const result = $('reviewResult');
    if (!state.finalConceptId) { result.innerHTML = ''; return; }
    const finalConcept = conceptById(state.finalConceptId);
    const relatedObservationIds = new Set(edges.filter((edge) => edge.conceptId === state.finalConceptId).map((edge) => edge.observationId));
    const selected = selectedSet();
    const status = state.conceptStates[state.finalConceptId] || 'untested';
    let title = '路径完整';
    let detail = '你已经记录了与最终考点相关的观察，并完成了验证。';
    if (![...relatedObservationIds].some((id) => selected.has(id))) { title = 'A · 观察遗漏'; detail = `最终考点“${finalConcept?.label || ''}”对应的可见线索没有被记录。`; }
    else if (status === 'excluded') { title = 'C · 验证错误'; detail = '这个考点曾被排除，复盘时可以回看当时的验证依据。'; }
    else if (status === 'untested') { title = 'B · 映射遗漏'; detail = '看到了相关特征，但右侧还没有完成检查。'; }
    result.innerHTML = `<div class="review-status"><span>${escapeHtml(title)}</span><p>${escapeHtml(detail)}</p></div>`;
  }

  function render() {
    renderFormats(); renderPlaybooks(); renderObservations(); renderConcepts(); renderReview();
    document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('mobile-hidden', panel.dataset.panel !== state.mobileTab));
    document.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === state.mobileTab));
  }

  function persistAndRender() { storageSet(); render(); }

  document.addEventListener('click', (event) => {
    const observation = event.target.closest('[data-observation]');
    if (observation) {
      const id = observation.dataset.observation;
      state.selectedObservationIds = state.selectedObservationIds.includes(id) ? state.selectedObservationIds.filter((item) => item !== id) : [...state.selectedObservationIds, id];
      state.reverseConceptId = '';
      persistAndRender(); return;
    }
    const toggle = event.target.closest('[data-group-toggle]');
    if (toggle) { toggle.closest('.observation-group').classList.toggle('collapsed'); return; }
    const expand = event.target.closest('[data-expand]');
    if (expand) {
      const id = expand.dataset.expand;
      state.expandedConceptIds = state.expandedConceptIds.includes(id) ? state.expandedConceptIds.filter((item) => item !== id) : [...state.expandedConceptIds, id];
      state.reverseConceptId = id; persistAndRender(); return;
    }
    const stateButton = event.target.closest('[data-state]');
    if (stateButton) { state.conceptStates[stateButton.dataset.concept] = stateButton.dataset.state; state.reverseConceptId = stateButton.dataset.concept; persistAndRender(); return; }
    const convergence = event.target.closest('[data-convergence]');
    if (convergence) { const id = convergence.dataset.convergence; if (!state.expandedConceptIds.includes(id)) state.expandedConceptIds.push(id); state.reverseConceptId = id; persistAndRender(); return; }
    const tab = event.target.closest('[data-tab]');
    if (tab) { state.mobileTab = tab.dataset.tab; render(); return; }
  });

  $('formatSelect').addEventListener('change', (event) => { state.formatId = event.target.value; persistAndRender(); });
  $('resetButton').addEventListener('click', () => {
    state.selectedObservationIds = []; state.conceptStates = {}; state.expandedConceptIds = []; state.finalConceptId = ''; state.reverseConceptId = ''; state.reviewOpen = false; persistAndRender();
  });
  $('reviewButton').addEventListener('click', () => { state.reviewOpen = true; renderReview(); });
  $('closeReview').addEventListener('click', () => { state.reviewOpen = false; renderReview(); });
  $('finalConceptSelect').addEventListener('change', (event) => { state.finalConceptId = event.target.value; persistAndRender(); });

  storageGet().then((saved) => { if (saved) Object.assign(state, saved); render(); });
})();
