// Minimal front-end for IdeaForge

const ideaTree = [];
let currentProjectId = localStorage.getItem('currentProjectId') || null;
let currentProjectName = localStorage.getItem('currentProjectName') || 'Untitled Project';

// Simple helper to create node objects with nicer content formatting
function wrapText(text, width = 80) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? line + ' ' + w : w;
    if (candidate.length > width) {
      if (line) lines.push(line);
      // If a single word is longer than width, hard-break it
      if (w.length > width) {
        for (let i = 0; i < w.length; i += width) {
          lines.push(w.slice(i, i + width));
        }
        line = '';
      } else {
        line = w;
      }
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

function makeNode({ id, title, content, parentId = null, branchColor = 'blue' }) {
  const formatted = wrapText(content, 80);
  const tooltip = formatted.split('\n').slice(0, 4).join('\n');
  return { id, label: title, title: tooltip, content: formatted, parentId, branchColor, timestamp: Date.now() };
}

// ---------------------------------------------------------
// Loading State Helper
// ---------------------------------------------------------
function setLoading(btn, isLoading) {
  if (isLoading) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

// Create initial root node
const rootId = crypto.randomUUID();
ideaTree.push({ ...makeNode({ id: rootId, title: 'Starter Idea', content: 'Initial Idea: A smart gardening app.', parentId: null, branchColor: 'blue' }), level: 0 });

// ---------------------------------------------------------
// 1. IMPROVED COLOR PALETTE (Modern UI: Slate, Emerald, Indigo, Rose)
// ---------------------------------------------------------
function branchColorToHex(c) {
  switch ((c || '').toLowerCase()) {
    // User Idea -> Emerald (Fresh, Positive)
    case 'green': return '#059669'; 
    // AI Inspire -> Violet (Creative, Magic) - Changed from Red
    case 'red': return '#7c3aed'; 
    // Critique -> Rose (Warning, Alert)
    case 'critique': return '#e11d48'; 
    // Synthesize -> Blue (Structural, calming)
    case 'purple': return '#2563eb'; 
    // Refine -> Amber (Highlight)
    case 'orange': return '#d97706'; 
    // Default/Root -> Slate (Neutral)
    case 'blue': return '#475569'; 
    default: return '#475569';
  }
}

const nodes = new vis.DataSet(ideaTree.map(n => ({
  id: n.id,
  label: n.label,
  title: n.content,
  color: { background: branchColorToHex(n.branchColor) },
  level: typeof n.level === 'number' ? n.level : undefined
})));
const edges = new vis.DataSet([]);

function rebuildEdges() {
  edges.clear();
  ideaTree.forEach(n => {
    if (n.parentId) edges.add({ from: n.parentId, to: n.id, arrows: 'to' });
  });
}

rebuildEdges();

// Ensure DOM is ready before initializing network
function initNetwork() {
  const container = document.getElementById('mynetwork');
  if (!container) {
    console.error('ERROR: #mynetwork container not found in DOM');
    return;
  }
  console.log('✓ Network container found, initializing vis-network...');
  
const data = { nodes, edges };
// ---------------------------------------------------------
// 2. IMPROVED LAYOUT & VISUALS
// ---------------------------------------------------------
const options = {
  layout: {
    hierarchical: {
      enabled: true,
      direction: 'UD', // Up-Down
      sortMethod: 'directed',
      
      // CRITICAL FIX: nodeSpacing must be larger than widthConstraint (400px)
      levelSeparation: 250, // Vertical space between rows
      nodeSpacing: 450,     // Horizontal space (prevents overlap)
      treeSpacing: 460,     // Space between different trees
      
      blockShifting: true,
      edgeMinimization: true,
      parentCentralization: true
    }
  },
  nodes: {
    shape: 'box',
    margin: 12, // More breathing room inside the box
    widthConstraint: { maximum: 400 },
    font: { 
      size: 16, 
      face: 'Inter, system-ui, sans-serif',
      color: '#ffffff', // White text for better contrast
      multi: 'html' 
    },
    borderWidth: 0, // Cleaner look without heavy borders
    shadow: {
      enabled: true,
      color: 'rgba(0,0,0,0.2)',
      size: 10,
      x: 5,
      y: 5
    },
    shapeProperties: {
      borderRadius: 8 // Soft rounded corners
    }
  },
  edges: {
    color: {
      color: '#cbd5e1',
      highlight: '#94a3b8'
    },
    width: 2,
    smooth: {
      type: 'cubicBezier',
      forceDirection: 'vertical',
      roundness: 0.6
    },
    arrows: {
      to: { enabled: true, scaleFactor: 1.2 }
    }
  },
  physics: {
    enabled: false // Keep false for hierarchical layouts to stay stable
  },
  interaction: { 
    multiselect: true,
    hover: true,
    navigationButtons: true 
  }
};
  const network = new vis.Network(container, data, options);
  console.log('✓ vis-network initialized successfully');
  return network;
}

// Call when DOM is ready (script is at end of body, so DOM should be ready)
const network = initNetwork();

if (!network) {
  console.error('FATAL: Failed to initialize network. Check console for errors.');
}

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

if (network) {
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
}

function getNodeLevel(id) {
  if (!id) return 0;
  const n = ideaTree.find(x => x.id === id);
  return n && typeof n.level === 'number' ? n.level : 0;
}

function addNodeToTree(node) {
  ideaTree.push(node);
  nodes.add({ 
    id: node.id, 
    label: node.title, 
    title: node.content, 
    color: { background: branchColorToHex(node.branchColor) }, 
    level: node.level 
  });
  if (node.parentId) edges.add({ from: node.parentId, to: node.id, arrows: 'to' });
}

// UI bindings
const domainSelect = document.getElementById('domain-select');
const newIdeaInput = document.getElementById('new-idea-input');
const btnNewIdea = document.getElementById('btn-new-idea');
const btnInspire = document.getElementById('btn-inspire');
const btnSynthesize = document.getElementById('btn-synthesize');
const btnRefine = document.getElementById('btn-refine');
const btnEdit = document.getElementById('btn-edit');
const btnDelete = document.getElementById('btn-delete');
const refineInput = document.getElementById('refine-input');
const editModal = document.getElementById('edit-modal');
const editTitle = document.getElementById('edit-title');
const editContent = document.getElementById('edit-content');
const editSave = document.getElementById('edit-save');
const editCancel = document.getElementById('edit-cancel');
const projectNameInput = document.getElementById('project-name');
const btnSaveProject = document.getElementById('btn-save-project');
const btnLoadProject = document.getElementById('btn-load-project');
const btnNewProject = document.getElementById('btn-new-project');
const btnExportJSON = document.getElementById('btn-export-json');
const btnExportMD = document.getElementById('btn-export-md');
const btnExportCSV = document.getElementById('btn-export-csv');
const fileImport = document.getElementById('file-import');
const loadModal = document.getElementById('load-modal');
const projectsList = document.getElementById('projects-list');
const loadCancel = document.getElementById('load-cancel');
let editingNodeId = null;

function removeNodeFromTree(id) {
  // Remove node and all its children
  const nodesToRemove = [id];
  let i = 0;
  while (i < nodesToRemove.length) {
    const currentId = nodesToRemove[i];
    ideaTree.forEach(n => {
      if (n.parentId === currentId && !nodesToRemove.includes(n.id)) {
        nodesToRemove.push(n.id);
      }
    });
    i++;
  }
  
  // Remove from ideaTree and vis
  nodesToRemove.forEach(nid => {
    const idx = ideaTree.findIndex(n => n.id === nid);
    if (idx !== -1) ideaTree.splice(idx, 1);
    nodes.remove(nid);
    edges.remove(edges.getIds().filter(eid => {
      const edge = edges.get(eid);
      return edge.from === nid || edge.to === nid;
    }));
  });
  
  // Clear selection
  selectionSet.forEach(sid => updateNodeSelectionVisual(sid, false));
  selectionSet.clear();
}

function updateNodeInTree(id, newTitle, newContent) {
  const n = ideaTree.find(x => x.id === id);
  if (n) {
    n.title = newTitle;
    n.content = wrapText(newContent, 80);
    const tooltip = n.content.split('\n').slice(0, 4).join('\n');
    nodes.update({ id, label: newTitle, title: tooltip });
  }
}

function showEditModal(nodeId) {
  const n = ideaTree.find(x => x.id === nodeId);
  if (!n) return;
  editingNodeId = nodeId;
  editTitle.value = n.title;
  editContent.value = n.content;
  editModal.style.display = 'flex';
  editTitle.focus();
}

function hideEditModal() {
  editModal.style.display = 'none';
  editingNodeId = null;
}

function parseNumberedList(text) {
  // Parse numbered lists, or split long single-line outputs into sentences
  const raw = String(text || '');
  const numbered = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let items = [];
  for (const line of numbered) {
    const m = line.match(/^\d+\.?\s*(.*)$/);
    if (m) items.push(m[1]);
    else items.push(line);
  }
  if (items.length <= 1) {
    // Try splitting into sentences or separators
    items = raw.split(/(?<=\.)\s+|;\s+|\s+•\s+/).map(s => s.trim()).filter(Boolean);
  }
  return items.slice(0, 3);
}

btnNewIdea.addEventListener('click', () => {
  try {
    const text = newIdeaInput.value.trim();
    if (!text) return;
    // Clear input early so it doesn't look stuck even if an error occurs
    newIdeaInput.value = '';
    const parentId = (selectionSet.size ? Array.from(selectionSet)[0] : rootId);
    const id = (crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : String(Date.now());
    const level = getNodeLevel(parentId) + 1;
    const node = { ...makeNode({ id, title: text, content: text, parentId, branchColor: 'green' }), level };
    addNodeToTree(node);
    // Re-fit view to include new node
    try { if (network) network.fit({ animation: true }); } catch {}
    // Auto-save if project exists
    if (currentProjectId) {
      saveCurrentProject().catch(err => console.error('Auto-save error:', err));
    }
  } catch (e) {
    console.error('New Idea error:', e);
    alert('Failed to add new idea: ' + (e && e.message ? e.message : e));
  }
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
  
  setLoading(btnInspire, true);
  try {
    const resp = await fetch('/api/inspire', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
        content: node.content,
        domain: domainSelect.value
      }) 
    });
    const json = await resp.json();
    const raw = (json.raw || '').trim();
    const parts = parseNumberedList(raw);
    
    parts.forEach((p, idx) => {
      const id = crypto.randomUUID();
      const level = getNodeLevel(node.id) + 1;
      
      // Changed branchColor from 'red' to 'red' (which now maps to Violet in our palette)
      const n = { ...makeNode({ id, title: p, content: p, parentId: node.id, branchColor: 'red' }), level };
      ideaTree.push(n);
      
      nodes.add({ 
        id: n.id, 
        label: n.title, 
        title: n.content, 
        color: { background: branchColorToHex(n.branchColor) }, // Just set background
        level: n.level
        // REMOVED: x position - Let the auto-layout handle spacing
      });
      
      if (n.parentId) edges.add({ from: n.parentId, to: n.id, arrows: 'to' });
    });
  } catch (err) {
    console.error(err);
    alert('Inspire failed: ' + (err.message || err));
  } finally {
    setLoading(btnInspire, false);
    // Auto-save
    if (currentProjectId) {
      saveCurrentProject().catch(err => console.error('Auto-save error:', err));
    }
  }
});

btnSynthesize.addEventListener('click', async () => {
  const selectedIds = Array.from(selectionSet);
  if (selectedIds.length < 2) {
    alert('Select 2 or 3 nodes to synthesize.');
    return;
  }
  const concepts = selectedIds.slice(0, 3).map(id => ideaTree.find(n => n.id === id).content);
  
  setLoading(btnSynthesize, true);
  try {
    const resp = await fetch('/api/synthesize', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
        concepts,
        domain: domainSelect.value
      }) 
    });
    const json = await resp.json();
    const synthesized = json.synthesized || 'Synthesized idea failed';
    const id = crypto.randomUUID();
    const title = synthesized.split('\n')[0];
    const a = ideaTree.find(n => n.id === selectedIds[0]);
    const b = ideaTree.find(n => n.id === selectedIds[1]);
    const parentId = a ? a.id : selectedIds[0];
    const baseLevel = Math.max(getNodeLevel(a && a.id), getNodeLevel(b && b && b.id));
    const level = baseLevel; // share level to appear between
    const node = { ...makeNode({ id, title, content: synthesized, parentId, branchColor: 'purple' }), level };
    addNodeToTree(node);
  } catch (err) {
    console.error(err);
    alert('Synthesize failed: ' + (err.message || err));
  } finally {
    setLoading(btnSynthesize, false);
    // Auto-save
    if (currentProjectId) {
      saveCurrentProject().catch(err => console.error('Auto-save error:', err));
    }
  }
});

// ---------------------------------------------------------
// NEW: Critique Agent Handler (Critical/Filter Agent)
// ---------------------------------------------------------
const btnCritique = document.getElementById('btn-critique');

btnCritique.addEventListener('click', async () => {
  const selectedIds = Array.from(selectionSet);
  if (selectedIds.length !== 1) {
    alert('Select exactly one node to critique.');
    return;
  }
  const nodeId = selectedIds[0];
  const node = ideaTree.find(n => n.id === nodeId);
  if (!node) return;

  setLoading(btnCritique, true);

  try {
    const resp = await fetch('/api/critique', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
        content: node.content,
        domain: domainSelect.value
      }) 
    });
    const json = await resp.json();
    
    // Create a "Constraint" node for each critique point
    const points = json.critique || [];
    points.forEach(point => {
      const id = crypto.randomUUID();
      const level = getNodeLevel(node.id) + 1;
      // Strip markdown formatting (**, __, etc) for clean display
      const cleanedPoint = point
        .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove **bold**
        .replace(/__(.+?)__/g, '$1')       // Remove __bold__
        .replace(/\*(.*?)\*/g, '$1')       // Remove *italic*
        .replace(/_(.*?)_/g, '$1');        // Remove _italic_
      
      // Use red color and warning emoji to indicate this is a critique
      const n = { 
        ...makeNode({ 
          id, 
          title: '⚠️ Critique', 
          content: cleanedPoint, 
          parentId: node.id, 
          branchColor: 'red'
        }), 
        level 
      };
      addNodeToTree(n);
    });
    
    try { if (network) network.fit({ animation: true }); } catch {}
  } catch (err) {
    console.error(err);
    alert('Critique failed: ' + (err.message || err));
  } finally {
    setLoading(btnCritique, false);
    if (currentProjectId) {
      saveCurrentProject().catch(err => console.error('Auto-save error:', err));
    }
  }
});

btnRefine.addEventListener('click', async () => {
  const text = refineInput.value.trim();
  if (!text) return alert('Provide long-form idea text in the textarea.');
  
  setLoading(btnRefine, true);
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
        n.content = wrapText(text, 80);
        const tooltip = n.content.split('\n').slice(0, 4).join('\n');
        nodes.update({ id: id, label: title, title: tooltip });
      }
    } else {
      const id = crypto.randomUUID();
      const level = getNodeLevel(rootId) + 1;
      const node = { ...makeNode({ id, title, content: text, parentId: rootId, branchColor: 'orange' }), level };
      addNodeToTree(node);
    }
  } catch (err) {
    console.error(err);
    alert('Refine failed: ' + (err.message || err));
  } finally {
    setLoading(btnRefine, false);
    // Auto-save
    if (currentProjectId) {
      saveCurrentProject().catch(err => console.error('Auto-save error:', err));
    }
  }
});

// Project management functions
async function saveCurrentProject() {
  const projectName = projectNameInput.value.trim() || currentProjectName || 'Untitled Project';
  if (!projectName) {
    alert('Please enter a project name.');
    return;
  }
  
  if (!currentProjectId) {
    currentProjectId = crypto.randomUUID();
  }
  
  currentProjectName = projectName;
  projectNameInput.value = projectName;
  
  try {
    const resp = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentProjectId,
        name: projectName,
        ideaTree: ideaTree
      })
    });
    const json = await resp.json();
    localStorage.setItem('currentProjectId', currentProjectId);
    localStorage.setItem('currentProjectName', projectName);
    alert(`Project "${projectName}" saved!`);
  } catch (err) {
    console.error('Save project error:', err);
    alert('Failed to save project: ' + (err.message || err));
  }
}

async function loadProjects() {
  try {
    const resp = await fetch('/api/projects');
    const json = await resp.json();
    const projects = json.projects || [];
    
    projectsList.innerHTML = projects.length === 0 
      ? '<p style="text-align: center; color: #999;">No saved projects yet</p>'
      : projects.map(p => `
        <div style="padding: 10px; margin-bottom: 8px; background: #f3f4f6; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${p.name}</strong><br/>
            <small style="color: #666;">Updated: ${new Date(p.updatedAt).toLocaleString()}</small>
          </div>
          <div style="display: flex; gap: 5px;">
            <button onclick="loadProjectFromModal('${p.id}')" style="padding: 6px 12px; background-color: #0ea5a3; color: white; border: none; border-radius: 4px; cursor: pointer;">Load</button>
            <button onclick="deleteProjectFromModal('${p.id}')" style="padding: 6px 12px; background-color: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
          </div>
        </div>
      `).join('');
    
    loadModal.style.display = 'flex';
  } catch (err) {
    console.error('Load projects error:', err);
    alert('Failed to load projects: ' + (err.message || err));
  }
}

async function loadProjectFromModal(projectId) {
  try {
    const resp = await fetch(`/api/projects/${projectId}`);
    const project = await resp.json();
    
    currentProjectId = project.id;
    currentProjectName = project.name;
    projectNameInput.value = project.name;
    
    localStorage.setItem('currentProjectId', currentProjectId);
    localStorage.setItem('currentProjectName', currentProjectName);
    
    // Clear current tree and load new one
    ideaTree.length = 0;
    ideaTree.push(...project.ideaTree);
    
    // Rebuild vis-network
    nodes.clear();
    edges.clear();
    ideaTree.forEach(n => {
      nodes.add({
        id: n.id,
        label: n.label,
        title: n.content,
        color: { background: branchColorToHex(n.branchColor), border: '#bfc7d6' },
        borderWidth: 1,
        level: n.level
      });
    });
    rebuildEdges();
    selectionSet.clear();
    
    try { if (network) network.fit({ animation: true }); } catch {}
    loadModal.style.display = 'none';
    alert(`Project "${project.name}" loaded!`);
  } catch (err) {
    console.error('Load project error:', err);
    alert('Failed to load project: ' + (err.message || err));
  }
}

async function deleteProjectFromModal(projectId) {
  if (!confirm('Delete this project?')) return;
  try {
    const resp = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    const json = await resp.json();
    await loadProjects();
  } catch (err) {
    console.error('Delete project error:', err);
    alert('Failed to delete project: ' + (err.message || err));
  }
}

function newProject() {
  if (ideaTree.length > 1 && !confirm('Start a new project? Current unsaved changes will be lost.')) {
    return;
  }
  
  currentProjectId = null;
  currentProjectName = 'Untitled Project';
  projectNameInput.value = '';
  
  localStorage.removeItem('currentProjectId');
  localStorage.removeItem('currentProjectName');
  
  // Clear tree
  ideaTree.length = 0;
  const rootId = crypto.randomUUID();
  ideaTree.push({ 
    ...makeNode({ 
      id: rootId, 
      title: 'Starter Idea', 
      content: 'Initial Idea: A smart gardening app.', 
      parentId: null, 
      branchColor: 'blue' 
    }), 
    level: 0 
  });
  
  // Rebuild vis-network
  nodes.clear();
  edges.clear();
  ideaTree.forEach(n => {
    nodes.add({
      id: n.id,
      label: n.label,
      title: n.content,
      color: { background: branchColorToHex(n.branchColor), border: '#bfc7d6' },
      borderWidth: 1,
      level: n.level
    });
  });
  rebuildEdges();
  selectionSet.clear();
  
  try { if (network) network.fit({ animation: true }); } catch {}
  alert('New project started!');
}

editSave.addEventListener('click', () => {
  if (!editingNodeId) return;
  const newTitle = editTitle.value.trim();
  const newContent = editContent.value.trim();
  if (!newTitle || !newContent) {
    alert('Title and content cannot be empty.');
    return;
  }
  updateNodeInTree(editingNodeId, newTitle, newContent);
  hideEditModal();
  // Auto-save
  if (currentProjectId) {
    saveCurrentProject().catch(err => console.error('Auto-save error:', err));
  }
});

editCancel.addEventListener('click', hideEditModal);

editModal.addEventListener('click', (e) => {
  if (e.target === editModal) hideEditModal();
});

editTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') editSave.click();
  if (e.key === 'Escape') editCancel.click();
});

editContent.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') editCancel.click();
});

btnEdit.addEventListener('click', () => {
  const selectedIds = Array.from(selectionSet);
  if (selectedIds.length !== 1) {
    alert('Select exactly one node to edit.');
    return;
  }
  showEditModal(selectedIds[0]);
});

btnDelete.addEventListener('click', () => {
  const selectedIds = Array.from(selectionSet);
  if (selectedIds.length === 0) {
    alert('Select one or more nodes to delete.');
    return;
  }
  if (selectedIds.includes(rootId)) {
    alert('Cannot delete the root node.');
    return;
  }
  const count = selectedIds.length;
  if (confirm(`Delete ${count} node(s) and all their children?`)) {
    selectedIds.forEach(id => removeNodeFromTree(id));
    // Auto-save
    if (currentProjectId) {
      saveCurrentProject().catch(err => console.error('Auto-save error:', err));
    }
  }
});

btnSaveProject.addEventListener('click', saveCurrentProject);
btnLoadProject.addEventListener('click', loadProjects);
btnNewProject.addEventListener('click', newProject);
loadCancel.addEventListener('click', () => {
  loadModal.style.display = 'none';
});

// Export handlers
btnExportJSON.addEventListener('click', () => {
  if (!currentProjectId) {
    alert('Please save the project first before exporting.');
    return;
  }
  window.location.href = `/api/export/${currentProjectId}/json`;
});

btnExportMD.addEventListener('click', () => {
  if (!currentProjectId) {
    alert('Please save the project first before exporting.');
    return;
  }
  window.location.href = `/api/export/${currentProjectId}/markdown`;
});

btnExportCSV.addEventListener('click', () => {
  if (!currentProjectId) {
    alert('Please save the project first before exporting.');
    return;
  }
  window.location.href = `/api/export/${currentProjectId}/csv`;
});

// ---------------------------------------------------------
// NEW: Export to PNG Image (The "Wow" Factor)
// ---------------------------------------------------------
const btnExportImg = document.getElementById('btn-export-img');

btnExportImg.addEventListener('click', () => {
  // Fit the graph so everything is visible before taking the picture
  network.fit({ 
    animation: false,
    scale: 1.0 
  });

  // Wait slightly for the render to finish, then capture canvas
  setTimeout(() => {
    const canvas = document.querySelector('#mynetwork canvas');
    if (!canvas) {
      alert('Unable to find graph canvas for export.');
      return;
    }
    
    // Create a dummy link to trigger download
    const link = document.createElement('a');
    const projectName = currentProjectName || 'ideaforge';
    link.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, 500);
});

// Import handler
fileImport.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const resp = await fetch('/api/import', {
      method: 'POST',
      body: formData
    });
    
    if (!resp.ok) {
      const error = await resp.json();
      throw new Error(error.error || 'Import failed');
    }
    
    const result = await resp.json();
    
    // Load the imported project
    currentProjectId = result.id;
    currentProjectName = result.name;
    projectNameInput.value = result.name;
    
    localStorage.setItem('currentProjectId', currentProjectId);
    localStorage.setItem('currentProjectName', currentProjectName);
    
    // Clear current tree and load imported one
    ideaTree.length = 0;
    ideaTree.push(...result.ideaTree);
    
    // Rebuild vis-network
    nodes.clear();
    edges.clear();
    ideaTree.forEach(n => {
      nodes.add({
        id: n.id,
        label: n.label,
        title: n.content,
        color: { background: branchColorToHex(n.branchColor), border: '#bfc7d6' },
        borderWidth: 1,
        level: n.level
      });
    });
    rebuildEdges();
    selectionSet.clear();
    
    try { network.fit({ animation: true }); } catch {}
    alert(`Project "${result.name}" imported successfully!`);
  } catch (err) {
    console.error('Import error:', err);
    alert('Failed to import: ' + err.message);
  } finally {
    // Reset file input
    fileImport.value = '';
  }
});

// Expose ideaTree and project functions for debugging
window.ideaTree = ideaTree;
window.network = network;
window.saveCurrentProject = saveCurrentProject;
window.loadProjects = loadProjects;
window.newProject = newProject;
