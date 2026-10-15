import { graphModel, pairRelation, fitGraph } from '../domain/mindmap.js';
import { blockersFor } from '../domain/task-links.js';

const NS = 'http://www.w3.org/2000/svg';
const element = (tag, attrs = {}, children = [], svg = false) => {
  const node = svg ? document.createElementNS(NS, tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'value') node.value = value;
    else node.setAttribute(key === 'className' ? 'class' : key, value === true ? '' : value);
  }
  node.append(...children);
  return node;
};
const button = (text, action, attrs = {}) => element('button', { type: 'button', text, 'data-action': action, ...attrs });
const kindName = node => node.kind === 'task' ? 'Tâche' : node.kind === 'project' ? 'Projet' : node.source === 'outlook' ? 'Catégorie Outlook' : 'Catégorie locale';
const svgNode = (tag, attrs = {}, children = []) => element(tag, attrs, children, true);
const viewString = view => `${view.x} ${view.y} ${view.width} ${view.height}`;

export const renderMindmap = ({ state, dispatch }) => {
  const current = state.features.taskMindmap;
  const model = graphModel(state);
  const selection = (current.selection ?? []).filter(id => model.nodes.some(node => node.id === id));
  const positions = Object.fromEntries(model.nodes.map((node, index) => [node.id, current.positions?.[node.id] ?? { x: 130 + index % 5 * 185, y: 120 + Math.floor(index / 5) * 150 }]));
  const view = current.viewport ?? fitGraph(positions);
  const relation = pairRelation(state, selection);
  const selected = new Set(selection);
  const near = new Set(selection);
  for (const edge of model.edges) if (selected.has(edge.source) || selected.has(edge.target)) { near.add(edge.source); near.add(edge.target); }
  const query = String(current.query ?? '').trim().toLocaleLowerCase('fr');
  const matches = new Set(model.nodes.filter(node => node.title.toLocaleLowerCase('fr').includes(query)).map(node => node.id));
  const visible = query ? new Set([...matches, ...selection]) : new Set(model.nodes.map(node => node.id));
  if (query) for (const edge of model.edges) if (matches.has(edge.source) || matches.has(edge.target)) { visible.add(edge.source); visible.add(edge.target); }
  const root = element('div', { className: 'graph-workspace stack' });
  root.append(element('p', { className: 'muted', text: 'Sélectionne deux éléments pour gérer leur lien. Déplace les nœuds pour organiser la carte ; fais glisser le fond pour te déplacer.' }));
  const tools = element('div', { className: 'graph-toolbar' }, [
    element('input', { type: 'search', value: current.query ?? '', 'aria-label': 'Rechercher dans le graphe', placeholder: 'Rechercher une entité…', 'data-action': 'mindmap.search' }),
    button('Réorganiser', 'mindmap.layout'), button('Tout voir', 'mindmap.fit'),
    button('−', 'mindmap.zoom-out', { 'aria-label': 'Dézoomer le graphe' }),
    button('+', 'mindmap.zoom-in', { 'aria-label': 'Zoomer le graphe' }),
    button('Centrer la sélection', 'mindmap.focus', { disabled: !selection.length }),
    button('Effacer la sélection', 'mindmap.clear', { disabled: !selection.length })
  ]);
  root.append(tools);
  const legend = element('div', { className: 'graph-legend', 'aria-label': 'Légende du graphe' });
  for (const [kind, label] of [['project', 'Projet'], ['task', 'Tâche'], ['category', 'Catégorie'], ['blocking', 'Bloque →']]) legend.append(element('span', { className: `graph-key graph-key--${kind}`, text: label }));
  root.append(legend);
  const grid = element('div', { className: 'graph-grid' });
  const canvas = element('div', { className: 'graph-canvas' });
  const svg = svgNode('svg', { viewBox: viewString(view), className: 'entity-graph', role: 'group', 'aria-label': 'Graphe des projets, tâches et catégories', preserveAspectRatio: 'xMidYMid meet' });
  const defs = svgNode('defs');
  defs.append(svgNode('marker', { id: 'graph-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, [svgNode('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#ffb58d' })]));
  svg.append(defs);
  const edgeElements = [];
  for (const edge of model.edges) {
    if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
    const group = svgNode('g', { className: `graph-edge graph-edge--${edge.type}${edge.derived ? ' is-derived' : ''}${selection.length && !near.has(edge.source) && !near.has(edge.target) ? ' is-muted' : ''}` });
    group.append(svgNode('title', { text: `${model.nodes.find(node => node.id === edge.source)?.title} ${edge.type === 'blocking' ? 'bloque' : edge.type === 'project' ? 'appartient à' : 'catégorie'} ${model.nodes.find(node => node.id === edge.target)?.title}` }));
    const line = svgNode('line', { 'marker-end': edge.type === 'blocking' ? 'url(#graph-arrow)' : undefined });
    const label = svgNode('text', { 'text-anchor': 'middle', text: edge.type === 'project' ? (edge.derived ? 'projet (catégorie)' : 'projet') : edge.type === 'blocking' ? 'bloque' : 'catégorie' });
    group.append(line, label); svg.append(group); edgeElements.push({ edge, line, label });
  }
  const repaintEdges = () => {
    for (const { edge, line, label } of edgeElements) {
      const a = positions[edge.source], b = positions[edge.target];
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1;
      const offset = 40;
      for (const [name, value] of Object.entries({ x1: a.x + dx / distance * offset, y1: a.y + dy / distance * offset, x2: b.x - dx / distance * offset, y2: b.y - dy / distance * offset })) line.setAttribute(name, value);
      label.setAttribute('x', (a.x + b.x) / 2); label.setAttribute('y', (a.y + b.y) / 2 - 7);
    }
  };
  repaintEdges();
  for (const node of model.nodes) {
    if (!visible.has(node.id)) continue;
    const point = positions[node.id];
    const group = svgNode('g', { className: `graph-node graph-node--${node.kind}${selected.has(node.id) ? ' is-selected' : ''}${selection.length && !near.has(node.id) ? ' is-muted' : ''}${node.entity.status === 'completed' ? ' is-completed' : ''}`, role: 'button', tabindex: '0', 'aria-pressed': String(selected.has(node.id)), 'aria-label': `${kindName(node)} : ${node.title}`, 'data-action': 'mindmap.select', 'data-id': node.id, transform: `translate(${point.x},${point.y})` });
    group.append(svgNode('title', { text: `${node.title} · ${kindName(node)}. Entrée pour sélectionner ; Alt + flèches pour déplacer.` }), svgNode('circle', { r: node.kind === 'project' ? 38 : 32 }), svgNode('text', { 'text-anchor': 'middle', y: 5, className: 'graph-node__icon', 'aria-hidden': 'true', text: node.kind === 'project' ? 'P' : node.kind === 'task' ? (node.entity.status === 'completed' ? '✓' : 'T') : '#' }), svgNode('text', { 'text-anchor': 'middle', y: 57, className: 'graph-node__label', text: node.title.length > 23 ? node.title.slice(0, 21) + '…' : node.title }), svgNode('text', { 'text-anchor': 'middle', y: 74, className: 'graph-node__kind', text: kindName(node) }));
    group.addEventListener('keydown', event => {
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); dispatch('mindmap:select', { id: node.id }); }
      if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        dispatch('mindmap:move', { id: node.id, x: point.x + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0), y: point.y + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0) });
      }
    });
    svg.append(group);
  }
  let gesture, dragged = false;
  const worldPoint = event => new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    const group = event.target.closest('.graph-node');
    const id = group?.dataset.id;
    gesture = { id, group, point: worldPoint(event), startX: event.clientX, startY: event.clientY, origin: id ? { ...positions[id] } : { ...view }, moved: false };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    if (!gesture) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 5 && !gesture.moved) return;
    gesture.moved = true;
    const point = worldPoint(event), dx = point.x - gesture.point.x, dy = point.y - gesture.point.y;
    if (gesture.id) {
      positions[gesture.id] = { x: gesture.origin.x + dx, y: gesture.origin.y + dy };
      gesture.group.setAttribute('transform', `translate(${positions[gesture.id].x},${positions[gesture.id].y})`); repaintEdges();
    } else {
      const scale = 1 / svg.getScreenCTM().a;
      svg.setAttribute('viewBox', viewString({ ...view, x: gesture.origin.x - (event.clientX - gesture.startX) * scale, y: gesture.origin.y - (event.clientY - gesture.startY) * scale }));
    }
  });
  const endGesture = event => {
    if (!gesture) return;
    const done = gesture; gesture = null;
    if (!done.moved) {
      // Pointer capture retargets the click to the SVG, so select explicitly.
      if (done.id) { dragged = true; dispatch('mindmap:select', { id: done.id }); }
      return;
    }
    dragged = true;
    if (done.id) dispatch('mindmap:move', { id: done.id, ...positions[done.id] });
    else { const [x, y, width, height] = svg.getAttribute('viewBox').split(' ').map(Number); dispatch('mindmap:viewport', { x, y, width, height }); }
  };
  svg.addEventListener('pointerup', endGesture);
  svg.addEventListener('pointercancel', () => { gesture = null; });
  svg.addEventListener('click', event => { if (dragged) { dragged = false; event.stopPropagation(); event.preventDefault(); } }, true);
  svg.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault(); dispatch('mindmap:zoom', { factor: event.deltaY > 0 ? 1.15 : .85 });
  }, { passive: false });
  canvas.append(svg);
  if (!model.nodes.length) canvas.append(element('p', { className: 'graph-empty', text: 'Crée des tâches et des projets, ou ajoute une catégorie pour commencer ta carte.' }));
  canvas.append(element('p', { className: 'graph-help', text: 'Glisser : déplacer · Ctrl + molette : zoom · Alt + flèches : déplacer un nœud au clavier' }));
  grid.append(canvas);
  const panel = element('aside', { className: 'graph-inspector stack', 'aria-label': 'Éditeur de liens' });
  panel.append(element('h3', { text: 'Relier deux éléments' }));
  for (const [index, label] of ['Première entité', 'Deuxième entité'].entries()) {
    const select = element('select', { 'aria-label': label, 'data-action': index ? 'mindmap.choose-second' : 'mindmap.choose-first' });
    select.append(element('option', { value: '', text: 'Choisir une entité…' }));
    for (const node of model.nodes) { const option = element('option', { value: node.id, text: `${kindName(node)} · ${node.title}` }); option.selected = selection[index] === node.id; select.append(option); }
    panel.append(element('label', { className: 'field' }, [element('span', { text: label }), select]));
  }
  if (relation) {
    panel.append(element('p', { className: 'graph-relation-copy', text: relation.label }));
    panel.append(element('span', { className: `graph-relation-badge graph-key--${relation.type}`, text: relation.type === 'project' ? 'Lien Projet' : relation.type === 'blocking' ? 'Lien bloquant' : 'Lien de catégorie' }));
    if (relation.type === 'blocking') panel.append(button('Inverser le sens', 'mindmap.reverse'));
    if (relation.type === 'project' && relation.task.entity.projectId && relation.task.entity.projectId !== relation.other.entityId) panel.append(element('p', { className: 'muted', text: 'Créer ce lien remplace le projet manuel actuel de la tâche.' }));
    panel.append(button(relation.exists ? 'Supprimer ce lien' : 'Créer ce lien', relation.exists ? 'mindmap.remove-link' : 'mindmap.add-link', { className: relation.exists ? 'secondary' : 'primary' }));
  } else panel.append(element('p', { className: 'muted', text: selection.length === 2 ? 'Cette paire ne peut pas être reliée. Un lien part toujours d’une tâche.' : 'Clique sur deux nœuds ou utilise les sélecteurs. La sélection reste légèrement mise en avant.' }));
  for (const id of selection) {
    const node = model.nodes.find(node => node.id === id);
    const card = element('div', { className: 'graph-selected-card' }, [element('strong', { text: node.title }), element('span', { text: kindName(node) })]);
    if (node.kind === 'task') {
      const blockers = blockersFor(node.entity, state.features.tasks.items);
      card.append(element('span', { text: blockers.length ? `Bloquée par : ${blockers.map(task => task.title).join(', ')}` : node.entity.status === 'completed' ? 'Terminée' : 'Disponible' }));
      card.append(button('Modifier la tâche', 'item-inspector.open-task', { 'data-id': node.entityId }));
    }
    panel.append(card);
  }
  panel.append(element('p', { role: current.error ? 'alert' : 'status', className: current.error ? 'error' : 'muted', text: current.error ?? current.message ?? `${model.nodes.length} entités · ${model.edges.length} liens` }));
  const categoryForm = element('form', { 'data-submit-action': 'mindmap.create-category', className: 'graph-category-form stack' }, [
    element('h4', { text: 'Nouvelle catégorie locale' }),
    element('label', { className: 'field' }, [element('span', { text: 'Nom de la catégorie' }), element('input', { name: 'categoryName', required: true, maxlength: 80 })]),
    button('Ajouter la catégorie', 'mindmap.create-category', { type: 'submit' }),
    element('small', { className: 'muted', text: 'Les catégories Outlook synchronisées sont aussi proposées. Les liens restent locaux aux tâches MeliApp.' })
  ]);
  panel.append(categoryForm); grid.append(panel); root.append(grid);
  return root;
};
