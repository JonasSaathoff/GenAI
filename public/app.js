// Minimal front-end for IdeaForge

const ideaTree = [];

// Simple helper to create node objects
function makeNode({ id, title, content, parentId = null, branchColor = 'blue' }) {
  return { id, label: title, title: content, content, parentId, branchColor, timestamp: Date.now() };
}

// Create initial root node
const rootId = crypto.randomUUID();
ideaTree.push(makeNode({ id: rootId, title: 'Starter Idea', content: 'Initial Idea: A smart gardening app.', parentId: null, branchColor: 'blue' }));

// vis-network setup
function branchColorToHex(c) {
  switch ((c || '').toLowerCase()) {
    case 'blue': return '#0ea5a3';
    case 'red': return '#ef4444';
    case 'green': return '#10b981';
    case 'purple': return '#7c3aed';
    case 'orange': return '#fb923c';
    default: return '#9ca3af';
  }
}

const nodes = new vis.DataSet(ideaTree.map(n => ({
  id: n.id,
  label: n.label,
  title: n.content,
  color: { background: branchColorToHex(n.branchColor), border: '#bfc7d6' },
  borderWidth: 1
})));
const edges = new vis.DataSet([]);

function rebuildEdges() {
  edges.clear();
  ideaTree.forEach(n => {
    if (n.parentId) edges.add({ from: n.parentId, to: n.id, arrows: 'to' });
  });
}

rebuildEdges();

const container = document.getElementById('mynetwork');
const data = { nodes, edges };
const options = { layout: { hierarchical: false }, interaction: { multiselect: true } };
const network = new vis.Network(container, data, options);

// Maintain an explicit selection set so users can click to toggle selection (no Ctrl required)
const selectionSet = new Set();

function updateNodeSelectionVisual(id, isSelected) {
  const n = nodes.get(id);
  if (!n) return;
  const baseBg = (n.color && n.color.background) || '#ffffff';
  if (isSelected) {
    nodes.update({ id, color: { background: baseBg, border: '#111111' }, borderWidth: 4 });
  } else {
    nodes.update({ id, color: { background: baseBg, border: '#bfc7d6' }, borderWidth: 1 });
  }
}

network.on('click', (params) => {
  // If a node was clicked, toggle its selection state
  if (params.nodes && params.nodes.length) {
    const id = params.nodes[0];
    if (selectionSet.has(id)) {
      selectionSet.delete(id);
      updateNodeSelectionVisual(id, false);
    } else {
      selectionSet.add(id);
      updateNodeSelectionVisual(id, true);
    }
  }
});

function addNodeToTree(node) {
  ideaTree.push(node);
  nodes.add({ id: node.id, label: node.title, title: node.content, color: { background: branchColorToHex(node.branchColor), border: '#bfc7d6' }, borderWidth: 1 });
  if (node.parentId) edges.add({ from: node.parentId, to: node.id, arrows: 'to' });
}

// UI bindings
const newIdeaInput = document.getElementById('new-idea-input');
const btnNewIdea = document.getElementById('btn-new-idea');
const btnInspire = document.getElementById('btn-inspire');
const btnSynthesize = document.getElementById('btn-synthesize');
const btnRefine = document.getElementById('btn-refine');
const refineInput = document.getElementById('refine-input');

btnNewIdea.addEventListener('click', () => {
  const text = newIdeaInput.value.trim();
  if (!text) return;
  const parentId = (selectionSet.size ? Array.from(selectionSet)[0] : rootId);
  const id = crypto.randomUUID();
  const node = makeNode({ id, title: text.slice(0, 40), content: text, parentId, branchColor: 'green' });
  addNodeToTree(node);
  newIdeaInput.value = '';
});

btnInspire.addEventListener('click', async () => {
  const selectedIds = Array.from(selectionSet);
  if (selectedIds.length !== 1) {
    alert('Select exactly one node to inspire from.');
    return;
  }
  const nodeId = selectedIds[0];
  const node = ideaTree.find(n => n.id === nodeId);
  if (!node) return;
  btnInspire.disabled = true;
  try {
    const resp = await fetch('/api/inspire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: node.content }) });
    const json = await resp.json();
    const raw = (json.raw || '').trim();
    const parts = parseNumberedList(raw);
    parts.forEach((p, idx) => {
      const id = crypto.randomUUID();
      const n = makeNode({ id, title: p.slice(0, 40), content: p, parentId: node.id, branchColor: 'red' });
      addNodeToTree(n);
    });
  } catch (err) {
    console.error(err);
    alert('Inspire failed: ' + (err.message || err));
  } finally {
    btnInspire.disabled = false;
  }
});

btnSynthesize.addEventListener('click', async () => {
  const selectedIds = Array.from(selectionSet);
  if (selectedIds.length < 2) {
    alert('Select 2 or 3 nodes to synthesize.');
    return;
  }
  const concepts = selectedIds.slice(0, 3).map(id => ideaTree.find(n => n.id === id).content);
  btnSynthesize.disabled = true;
  try {
    const resp = await fetch('/api/synthesize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concepts }) });
    const json = await resp.json();
    const synthesized = json.synthesized || 'Synthesized idea failed';
    const id = crypto.randomUUID();
    const title = synthesized.split('\n')[0].slice(0, 40);
    const node = makeNode({ id, title, content: synthesized, parentId: selectedIds[0], branchColor: 'purple' });
    addNodeToTree(node);
  } catch (err) {
    console.error(err);
    alert('Synthesize failed: ' + (err.message || err));
  } finally {
    btnSynthesize.disabled = false;
  }
});

btnRefine.addEventListener('click', async () => {
  const text = refineInput.value.trim();
  if (!text) return alert('Provide long-form idea text in the textarea.');
  btnRefine.disabled = true;
  try {
    const resp = await fetch('/api/refine-title', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) });
    const json = await resp.json();
    const title = json.title || 'Refined Title';
    // If user has selected a node, update its title; otherwise create a new node
    const selectedIds = Array.from(selectionSet);
    if (selectedIds && selectedIds[0]) {
      const id = selectedIds[0];
      // update ideaTree and vis
      const n = ideaTree.find(x => x.id === id);
      if (n) {
        n.title = title;
        n.content = text;
        nodes.update({ id: id, label: title, title: text });
      }
    } else {
      const id = crypto.randomUUID();
      const node = makeNode({ id, title, content: text, parentId: rootId, branchColor: 'orange' });
      addNodeToTree(node);
    }
  } catch (err) {
    console.error(err);
    alert('Refine failed: ' + (err.message || err));
  } finally {
    btnRefine.disabled = false;
  }
});

function parseNumberedList(text) {
  // Very simple parser: split by lines and drop leading numbering
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    const m = line.match(/^\d+\.?\s*(.*)$/);
    if (m) items.push(m[1]);
    else items.push(line);
  }
  // Return up to 3 items
  return items.slice(0, 3);
}

// Expose ideaTree for debugging
window.ideaTree = ideaTree;
window.network = network;
