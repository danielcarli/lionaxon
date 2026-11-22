/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Builds the examples that come with the app, in English and Portuguese, five steps each:
//   parti     — site and parti: three bars, connection, subtraction, massing, programme (the first example)
//   plateaus  — a cultural centre on plateaus: terrain, reference planes, curved volumes, an exploded view
//   tower     — a tower on a podium: stacking, set-backs, a crown (also seen from near the ground), an exploded
//               view, on a vertical A4 sheet
//   slope     — a house set into a slope: a volume crossing the terrain, a cantilever, a round patio
//   corner    — a house on a corner lot: a site of any outline, neighbours and streets, trees, an L-shaped volume,
//               a roof, a dimension, shadows, the previous step as a ghost, signs between the steps
//   school    — a school around a courtyard: an existing building as a ghost, uses (seen from two corners),
//               circulation
//   node tools/examples/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeProject, clone, polyFromWorld } from '../../src/workbench/services/model/common/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'examples');

const TEXT = {
  'pt-BR': {
    name: 'Implantação e partido',
    title: 'Diagrama de implantação e partido',
    subtitle: 'Estratégias de implantação',
    cats: ['Caixa de escada', 'Circulação', 'Ventilação cruzada'],
    link: 'Elemento de ligação',
    steps: [
      ['Implantação básica', 'Três volumes paralelos implantados no terreno.'],
      ['Conexão', 'Os volumes são conectados por elementos de ligação, organizando o programa.'],
      ['Subtração', 'Subtrações estratégicas criam acessos, pátios e melhor iluminação natural.'],
      ['Volumetria', 'A volumetria é organizada em pavimentos, definindo alturas, cheios e vazios.'],
      ['Programa e circulação', 'Definição dos usos e das circulações, promovendo integração e funcionalidade.'],
    ],
  },
  en: {
    name: 'Site and parti',
    title: 'Site and parti diagram',
    subtitle: 'Site strategies',
    cats: ['Stair core', 'Circulation', 'Cross ventilation'],
    link: 'Connecting element',
    steps: [
      ['Basic layout', 'Three parallel volumes placed on the site.'],
      ['Connection', 'The volumes are joined by connecting elements that organise the programme.'],
      ['Subtraction', 'Strategic subtractions create entrances, courtyards and better daylight.'],
      ['Massing', 'The massing is organised in floors, setting heights, solids and voids.'],
      ['Programme and circulation', 'Uses and circulation are defined, bringing integration and function.'],
    ],
  },
};

function build(lang) {
  const T = TEXT[lang];
  const blocks = [
    { type: 'volume', id: 'v-west', x: 7, y: 30, w: 8, d: 30, h: 3.5 },
    { type: 'volume', id: 'v-mid', x: 20, y: 30, w: 8, d: 30, h: 3.5 },
    { type: 'volume', id: 'v-east', x: 33, y: 30, w: 8, d: 30, h: 3.5 },
  ];
  const person = { type: 'person', id: 'p-1', x: 43, y: 5, z: 0, pose: 1 };
  const person2 = { type: 'person', id: 'p-2', x: 44.2, y: 3.6, z: 0, pose: 0 };

  // 1. basic layout
  const s1 = [...clone(blocks), person, person2];
  // 2. connection: two links in the gaps (new: shown in the accent colour)
  const links = [
    { type: 'volume', id: 'v-link-w', x: 13.5, y: 34, w: 5, d: 6, h: 3.5 },
    { type: 'volume', id: 'v-link-e', x: 26.5, y: 26, w: 5, d: 6, h: 3.5 },
  ];
  const label = { type: 'label', id: 'l-link', x: 13.5, y: 34, z: 3.5, dx: -7, dy: -9, text: T.link, size: 1.5 };
  const s2 = [...clone(s1), ...clone(links), label];
  // 3. subtraction: a notch, a passage through the middle block and a corner taken off
  const cuts = [
    { type: 'cut', id: 'c-notch', x: 10.5, y: 21, w: 4, d: 7, z: 0, h: 40, target: 'v-west' },
    { type: 'cut', id: 'c-passage', x: 20, y: 22, w: 10, d: 5, z: 0, h: 3.5, target: 'v-mid' },
    { type: 'cut', id: 'c-corner', x: 36, y: 42, w: 6, d: 6, z: 0, h: 40, target: 'v-east' },
  ];
  const s3 = [...clone(s2).filter((o) => o.type !== 'label'), ...clone(cuts)];
  // 4. massing: three floors in the blocks, two in the links; circulation runs through them
  const s4 = clone(s3).map((o) => {
    if (o.id.startsWith('v-link')) return { ...o, h: 7, floors: 2 };
    if (o.type === 'volume') return { ...o, h: 10.5, floors: 3 };
    return o;
  });
  s4.push(
    { type: 'arrow', id: 'a-circ-1', x1: 3.5, y1: 17, x2: 36.5, y2: 17, z: 1.75, color: 'blue', dashed: true, width: 0.4 },
    { type: 'arrow', id: 'a-circ-2', x1: 36.5, y1: 40, x2: 3.5, y2: 40, z: 5.25, color: 'blue', dashed: true, width: 0.4 },
  );
  // 5. programme and circulation: stair cores on the roofs, links become circulation, cross ventilation
  const s5 = clone(s4).map((o) => (o.id.startsWith('v-link') ? { ...o, cat: 'k-circ' } : o.id.startsWith('a-circ') ? { ...o, color: 'k-circ' } : o));
  s5.push(
    { type: 'volume', id: 'v-stair-w', x: 5, y: 41, w: 4, d: 6, h: 2.5, on: 'v-west', cat: 'k-stair' },
    { type: 'volume', id: 'v-stair-m', x: 22, y: 41, w: 4, d: 6, h: 2.5, on: 'v-mid', cat: 'k-stair' },
    { type: 'volume', id: 'v-stair-e', x: 31, y: 18, w: 4, d: 6, h: 2.5, on: 'v-east', cat: 'k-stair' },
    { type: 'arrow', id: 'a-vent-1', x1: -4, y1: 30, x2: 44, y2: 30, z: 1.75, color: 'k-vent', width: 0.5 },
    { type: 'arrow', id: 'a-vent-2', x1: -4, y1: 30, x2: 44, y2: 30, z: 5.25, color: 'k-vent', width: 0.5 },
    { type: 'arrow', id: 'a-vent-3', x1: -4, y1: 30, x2: 44, y2: 30, z: 8.75, color: 'k-vent', width: 0.5 },
  );

  const steps = [s1, s2, s3, s4, s5].map((objects, i) => ({
    id: `s-${i + 1}`, title: T.steps[i][0], text: T.steps[i][1], highlight: i === 1, objects,
  }));
  return normalizeProject({
    format: 'lionaxon', schemaVersion: 1, name: T.name,
    site: { w: 40, d: 60, mode: 'dashed', dims: false },
    north: 0, grid: 1, style: 'beige', view: { az: -45 },
    categories: [
      { id: 'k-stair', name: T.cats[0], color: '#e59aa6' },
      { id: 'k-circ', name: T.cats[1], color: '#8fa9cc' },
      { id: 'k-vent', name: T.cats[2], color: '#8aa346' },
    ],
    steps,
    sheet: { layout: 'row', cols: 5, paper: 'A3', orientation: 'landscape', title: T.title, subtitle: T.subtitle, legend: true, texts: true },
  });
}

// ---------------------------------------------------------------------------------------------
// the other four examples

const steps5 = (list, texts, extra = {}) => list.map((objects, i) => ({
  id: `s-${i + 1}`, title: texts[i][0], text: texts[i][1], highlight: i > 0, objects, ...(extra[i] || {}),
}));
const L = (lang, pt, en) => (lang === 'pt-BR' ? pt : en);

function plateaus(lang) {
  const t = (pt, en) => L(lang, pt, en);
  const terrain = [
    { type: 'platform', id: 'g-plateau', x: 30, y: 44, w: 32, d: 36, level: 'L1', z: 0 },
    { type: 'slope', id: 'r-slope', x: 30, y: 19, w: 14, d: 14, from: 'L0', zFrom: 0, to: 'L1', zTo: 0 },
    { type: 'platform', id: 'g-square', x: 8, y: 14, w: 12, d: 14, level: 'L0', z: -1.5 },
    { type: 'person', id: 'p-1', x: 26, y: 8, pose: 3 }, { type: 'person', id: 'p-2', x: 27.5, y: 7, pose: 1 },
  ];
  const s1 = [...clone(terrain), { type: 'label', id: 'l-plateau', x: 40, y: 56, z: 0, level: 'L1', dx: 6, dy: -6, text: t('Platô +3,00', 'Plateau +3.00'), size: 1.4, font: 'condensed' }];
  const vols = [
    { type: 'volume', id: 'v-bar', x: 20, y: 46, w: 8, d: 28, h: 7, floors: 2, level: 'L1' },
    { type: 'volume', id: 'v-aud', shape: 'cylinder', x: 36, y: 48, w: 16, d: 16, h: 9, floors: 2, level: 'L1' },
    { type: 'volume', id: 'v-tower', x: 8, y: 50, w: 8, d: 8, h: 13, floors: 4 },
  ];
  const s2 = [...clone(terrain), ...clone(vols)];
  const cuts = [
    { type: 'cut', id: 'c-hall', x: 30, y: 41, w: 6, d: 5, z: 0, h: 4, level: 'L1', target: 'v-aud' },
    { type: 'cut', id: 'c-yard', shape: 'cylinder', x: 20, y: 50, w: 5, d: 5, z: 0, h: 7, level: 'L1', target: 'v-bar' },
  ];
  const s3 = [...clone(s2), ...clone(cuts)];
  const s4 = clone(s3).map((o) => (o.id === 'v-aud' ? { ...o, cat: 'k-aud' } : o.id === 'v-bar' ? { ...o, cat: 'k-expo' } : o));
  s4.push(
    { type: 'volume', id: 'v-lookout', shape: 'sphere', x: 8, y: 50, w: 6, on: 'v-tower', level: 'L0', cat: 'k-lookout' },
    { type: 'volume', id: 'v-house', x: 8, y: 30, w: 10, d: 10, h: 6, state: 'ghost' },
    { type: 'arrow', id: 'a-route', x1: 30, y1: 2, x2: 30, y2: 32, z: 0.3, bend: 0, color: 'k-circ', width: 0.4, layer: 'ground' },
    { type: 'label', id: 'l-aud', x: 36, y: 48, z: 9, level: 'L1', dx: 7, dy: -7, text: t('Auditório', 'Auditorium'), size: 1.6, font: 'serif', caps: false },
    { type: 'label', id: 'l-house', x: 8, y: 30, z: 6, dx: -7, dy: -5, text: t('casa existente', 'existing house'), size: 1.5, font: 'hand', caps: false },
  );
  const s5 = clone(s4);
  return {
    format: 'lionaxon', schemaVersion: 2, name: t('Centro cultural em platôs', 'Cultural centre on plateaus'),
    site: { w: 48, d: 64, mode: 'fill', dims: true, thickness: 2.5 },
    levels: [{ id: 'L0', name: t('Rua', 'Street'), z: 0 }, { id: 'L1', name: t('Platô', 'Plateau'), z: 3 }],
    north: 20, northPlace: 'drawing', northHalftone: true, grid: 1, style: 'mint', view: { az: -45 },
    categories: [
      { id: 'k-aud', name: t('Auditório', 'Auditorium'), color: '#8fc9b8' },
      { id: 'k-expo', name: t('Exposições', 'Exhibitions'), color: '#f2c6a8' },
      { id: 'k-lookout', name: t('Mirante', 'Lookout'), color: '#c9b6e4' },
      { id: 'k-circ', name: t('Percurso', 'Route'), color: '#4f8fb8' },
    ],
    steps: steps5([s1, s2, s3, s4, s5], [
      [t('Terreno', 'Terrain'), t('Um platô a +3,00 e um talude acessível ligam a rua ao alto do terreno; uma praça rebaixada recebe quem chega.', 'A plateau at +3.00 and an accessible slope tie the street to the top of the site; a sunken square welcomes arrivals.')],
      [t('Implantação', 'Placement'), t('A barra de exposições e o auditório ocupam o platô; a torre marca a esquina da rua.', 'The exhibition bar and the auditorium sit on the plateau; the tower marks the street corner.')],
      [t('Subtrações', 'Subtractions'), t('Um vazio redondo ilumina a barra; o auditório se abre para o acesso.', 'A round void lights the bar; the auditorium opens towards the entrance.')],
      [t('Programa e percurso', 'Programme and route'), t('O percurso sobe da rua ao platô; o mirante coroa a torre; a casa existente fica como memória.', 'The route climbs from the street to the plateau; the lookout crowns the tower; the existing house stays as a memory.')],
      [t('Vista explodida', 'Exploded view'), t('Platô e pavimentos se afastam para mostrar como as peças se empilham.', 'Plateau and floors move apart to show how the pieces stack up.')],
    ], { 4: { explode: { on: true, gap: 4, floors: true } } }),
    sheet: { layout: 'row', cols: 5, paper: 'A3', orientation: 'landscape', title: t('Centro cultural em platôs', 'Cultural centre on plateaus'), subtitle: t('Terreno, planos e volumes', 'Terrain, planes and volumes'), legend: true, texts: true },
  };
}

function tower(lang) {
  const t = (pt, en) => L(lang, pt, en);
  const podium = { type: 'volume', id: 'v-base', x: 15, y: 15, w: 26, d: 26, h: 6, floors: 2 };
  const people = [{ type: 'person', id: 'p-1', x: 3, y: 2, pose: 1 }, { type: 'person', id: 'p-2', x: 4.5, y: 1.2, pose: 0 }];
  const s1 = [clone(podium), ...clone(people)];
  const torre = { type: 'volume', id: 'v-tower', x: 15, y: 15, w: 12, d: 12, h: 36, floors: 12, on: 'v-base' };
  const s2 = [...clone(s1), clone(torre)];
  const s3 = [...clone(s2),
    { type: 'cut', id: 'c-setback-1', x: 20, y: 10, w: 4, d: 4, z: 30, h: 12, target: 'v-tower' },
    { type: 'cut', id: 'c-setback-2', x: 10, y: 20, w: 4, d: 4, z: 30, h: 12, target: 'v-tower' },
    { type: 'cut', id: 'c-entry', x: 15, y: 3, w: 8, d: 4, z: 0, h: 3, target: 'v-base' },
  ];
  const s4 = [...clone(s3).map((o) => (o.id === 'v-tower' ? { ...o, cat: 'k-housing' } : o.id === 'v-base' ? { ...o, cat: 'k-shops' } : o)),
    { type: 'volume', id: 'v-crown', shape: 'pyramid', x: 15, y: 15, w: 12, d: 12, h: 6, on: 'v-tower', cat: 'k-crown' },
    { type: 'label', id: 'l-crown', x: 15, y: 15, z: 48, dx: 7, dy: -5, text: t('Coroamento', 'Crown'), size: 1.6, font: 'condensed' },
  ];
  const s5 = clone(s4);
  return {
    format: 'lionaxon', schemaVersion: 2, name: t('Torre e embasamento', 'Tower and podium'),
    site: { w: 30, d: 30, mode: 'dashed', dims: true, thickness: 0 },
    levels: [{ id: 'L0', name: t('Térreo', 'Ground'), z: 0 }],
    north: 0, northPlace: 'header', grid: 1, style: 'lavender', view: { az: -45 },
    categories: [
      { id: 'k-shops', name: t('Comércio', 'Shops'), color: '#f3d98b' },
      { id: 'k-housing', name: t('Habitação', 'Housing'), color: '#d7ccef' },
      { id: 'k-crown', name: t('Coroamento', 'Crown'), color: '#8a68c6' },
    ],
    steps: steps5([s1, s2, s3, s4, s5], [
      [t('Embasamento', 'Podium'), t('Um embasamento de dois pavimentos ocupa o lote e alinha com a rua.', 'A two-storey podium fills the plot and lines up with the street.')],
      [t('Torre', 'Tower'), t('A torre sobe do centro do embasamento, afastada das divisas.', 'The tower rises from the middle of the podium, away from the boundaries.')],
      [t('Recuos', 'Set-backs'), t('Recuos nos cantos altos aliviam a silhueta; uma passagem marca a entrada.', 'Set-backs at the upper corners lighten the silhouette; a passage marks the entrance.')],
      [t('Coroamento', 'Crown'), t('Uma pirâmide coroa a torre; os usos ganham cor. À direita, a torre vista de perto do chão.', 'A pyramid crowns the tower; the uses take their colours. On the right, the tower seen from near the ground.')],
      [t('Vista explodida', 'Exploded view'), t('Embasamento, torre e coroamento separados.', 'Podium, tower and crown pulled apart.')],
    ], { 3: { views: [{ az: 315, el: 35.2644 }, { az: 235, el: 8 }] }, 4: { explode: { on: true, gap: 8, floors: false } } }),
    sheet: { layout: 'vertical', cols: 3, paper: 'A4', orientation: 'portrait', scale: 0, title: t('Torre e embasamento', 'Tower and podium'), subtitle: t('Evolução da volumetria', 'How the massing evolves'), legend: true, texts: true },
  };
}

function slope(lang) {
  const t = (pt, en) => L(lang, pt, en);
  const ground = [
    { type: 'platform', id: 'g-garden', x: 12, y: 28, w: 24, d: 16, level: 'L1', z: 0 },
    { type: 'slope', id: 'r-hillside', x: 12, y: 14, w: 24, d: 12, from: 'L0', zFrom: 0, to: 'L1', zTo: 0 },
    { type: 'person', id: 'p-1', x: 4, y: 3, pose: 0 },
  ];
  const s1 = [...clone(ground)];
  const casa = { type: 'volume', id: 'v-house', x: 12, y: 20, w: 10, d: 14, h: 6, floors: 2 };
  const s2 = [...clone(s1), clone(casa)];
  const s3 = [...clone(s2), { type: 'volume', id: 'v-cantilever', x: 12, y: 15, w: 10, d: 12, h: 3, on: 'v-house', cat: 'k-bedrooms' }];
  const s4 = [...clone(s3).map((o) => (o.id === 'v-house' ? { ...o, cat: 'k-living' } : o)),
    { type: 'cut', id: 'c-yard', shape: 'cylinder', x: 12, y: 23, w: 5, d: 5, z: 0, h: 6, target: 'v-house' },
    { type: 'person', id: 'p-2', x: 6, y: 4, pose: 3 },
    { type: 'arrow', id: 'a-access', x1: 4, y1: 2, x2: 10, y2: 11, z: 0.2, bend: 1, color: 'blue', width: 0.35, layer: 'ground' },
    { type: 'label', id: 'l-yard', x: 12, y: 23, z: 6, dx: 7, dy: -6, text: t('pátio', 'patio'), size: 1.3, font: 'hand', caps: false },
  ];
  const s5 = clone(s4);
  return {
    format: 'lionaxon', schemaVersion: 2, name: t('Casa no talude', 'House on the slope'),
    site: { w: 24, d: 36, mode: 'fill', dims: true, thickness: 2 },
    levels: [{ id: 'L0', name: t('Rua', 'Street'), z: 0 }, { id: 'L1', name: t('Jardim', 'Garden'), z: 3 }],
    north: 0, northPlace: 'drawing', northHalftone: true, grid: 1, style: 'peach', view: { az: -45 },
    categories: [
      { id: 'k-living', name: t('Estar', 'Living'), color: '#f6c9a9' },
      { id: 'k-bedrooms', name: t('Quartos', 'Bedrooms'), color: '#b9cfa3' },
    ],
    steps: steps5([s1, s2, s3, s4, s5], [
      [t('Terreno inclinado', 'Sloping site'), t('O lote sobe 3 m da rua até o jardim, pelos fundos.', 'The plot rises 3 m from the street to the garden at the back.')],
      [t('Volume encaixado', 'Volume set into the slope'), t('A casa se encaixa na encosta: o térreo abre para a rua, o andar de cima para o jardim.', 'The house is set into the slope: the ground floor opens to the street, the upper floor to the garden.')],
      [t('Balanço', 'Cantilever'), t('Os quartos avançam sobre a entrada e fazem sombra.', 'The bedrooms reach out over the entrance and give shade.')],
      [t('Pátio e acesso', 'Patio and access'), t('Um pátio redondo ilumina o centro; o acesso é acessível desde a calçada.', 'A round patio lights the middle; the way in is step-free from the pavement.')],
      [t('Vista explodida', 'Exploded view'), t('Pavimentos e balanço separados.', 'Floors and cantilever pulled apart.')],
    ], { 4: { explode: { on: true, gap: 3, floors: true } } }),
    sheet: { layout: 'grid', cols: 3, paper: 'A3', orientation: 'landscape', title: t('Casa no talude', 'House on the slope'), subtitle: t('Estudo de implantação', 'Placement study'), legend: true, texts: true },
  };
}

function school(lang) {
  const t = (pt, en) => L(lang, pt, en);
  const old = { type: 'volume', id: 'v-old', x: 30, y: 22, w: 24, d: 14, h: 6, state: 'ghost' };
  const people = [{ type: 'person', id: 'p-1', x: 30, y: 2, pose: 1 }, { type: 'person', id: 'p-2', x: 31.5, y: 1.4, pose: 3 }];
  const s1 = [clone(old), ...clone(people), { type: 'label', id: 'l-old', x: 30, y: 22, z: 6, dx: 8, dy: -6, text: t('prédio existente', 'existing building'), size: 1.6, font: 'hand', caps: false }];
  const bars = [
    { type: 'volume', id: 'v-wing-north', x: 30, y: 38, w: 44, d: 8, h: 7, floors: 2 },
    { type: 'volume', id: 'v-wing-south', x: 30, y: 8, w: 44, d: 8, h: 7, floors: 2 },
    { type: 'volume', id: 'v-wing-west', x: 12, y: 23, w: 8, d: 22, h: 7, floors: 2 },
    { type: 'volume', id: 'v-wing-east', x: 48, y: 23, w: 8, d: 22, h: 4 },
  ];
  const s2 = [...clone(s1).map((o) => (o.id === 'v-old' ? o : o)).filter((o) => o.type !== 'label'), ...clone(bars)];
  const s3 = [...clone(s2).filter((o) => o.id !== 'v-old'),
    { type: 'cut', id: 'c-porch', x: 30, y: 8, w: 10, d: 8, z: 0, h: 3.5, target: 'v-wing-south' },
    { type: 'volume', id: 'v-library', shape: 'cylinder', x: 30, y: 23, w: 10, d: 10, h: 5 },
  ];
  const s4 = clone(s3).map((o) => {
    if (o.id === 'v-wing-north' || o.id === 'v-wing-west') return { ...o, cat: 'k-classrooms' };
    if (o.id === 'v-wing-east') return { ...o, cat: 'k-hall' };
    if (o.id === 'v-wing-south') return { ...o, cat: 'k-office' };
    if (o.id === 'v-library') return { ...o, cat: 'k-library' };
    return o;
  });
  const s5 = [...clone(s4),
    { type: 'arrow', id: 'a-entry', x1: 30, y1: -4, x2: 30, y2: 15, z: 0.3, color: 'k-circ', width: 0.45, layer: 'ground' },
    { type: 'arrow', id: 'a-loop', x1: 20, y1: 30, x2: 40, y2: 16, z: 0.3, bend: 5, color: 'k-circ', width: 0.35, dashed: true, heads: 2, layer: 'ground' },
    { type: 'label', id: 'l-yard', x: 22, y: 16, z: 0, dx: -8, dy: 6, text: t('Pátio', 'Courtyard'), size: 1.6 },
  ];
  return {
    format: 'lionaxon', schemaVersion: 2, name: t('Escola em torno do pátio', 'School around a courtyard'),
    site: { w: 60, d: 44, mode: 'dashed', dims: true, thickness: 0 },
    levels: [{ id: 'L0', name: '', z: 0 }],
    north: 0, northPlace: 'header', grid: 1, style: 'sky', view: { az: -45 },
    categories: [
      { id: 'k-classrooms', name: t('Salas de aula', 'Classrooms'), color: '#a9c9e8' },
      { id: 'k-office', name: t('Administração', 'Office'), color: '#f2d8a7' },
      { id: 'k-hall', name: t('Quadra coberta', 'Sports hall'), color: '#b9dcc5' },
      { id: 'k-library', name: t('Biblioteca', 'Library'), color: '#e8b7a9' },
      { id: 'k-circ', name: t('Circulação', 'Circulation'), color: '#c4643f' },
    ],
    steps: steps5([s1, s2, s3, s4, s5], [
      [t('O que existe', 'What is there'), t('Um prédio antigo ocupa o meio do terreno.', 'An old building stands in the middle of the site.')],
      [t('Quadra', 'Block'), t('Quatro alas fecham o terreno e desenham um pátio.', 'Four wings close the site and make a courtyard.')],
      [t('Pátio e pórtico', 'Courtyard and porch'), t('O prédio antigo sai; um pórtico abre a ala sul; a biblioteca ocupa o pátio.', 'The old building goes; a porch opens the south wing; the library sits in the courtyard.')],
      [t('Usos', 'Uses'), t('Salas ao norte e a oeste, quadra a leste, administração na entrada — vistas de dois cantos opostos.', 'Classrooms to the north and west, sports hall to the east, office at the entrance — seen from two opposite corners.')],
      [t('Circulação', 'Circulation'), t('Entra-se pelo pórtico e se dá a volta no pátio.', 'You come in through the porch and walk around the courtyard.')],
    ], { 3: { views: [{ az: 315, el: 35.2644 }, { az: 135, el: 35.2644 }] } }),
    sheet: { layout: 'grid', cols: 3, paper: 'A3', orientation: 'landscape', title: t('Escola em torno do pátio', 'School around a courtyard'), subtitle: t('Partido', 'Parti'), legend: true, texts: true },
  };
}

/** The examples, in the order the menu lists them. */
/**
 * A house on a corner lot, with what is around it: a site that is not a rectangle, neighbours and streets
 * as context, trees, an L-shaped volume, roofs, a dimension, the shadows of a winter afternoon, the
 * previous step as a ghost and signs between the steps.
 */
function corner(lang) {
  const t = (pt, en) => L(lang, pt, en);
  const around = [
    { type: 'area', id: 'e-street-south', x: 16, y: -5, w: 72, d: 8, kind: 'street' },
    { type: 'area', id: 'e-street-east', x: 37, y: 18, w: 8, d: 54, kind: 'street' },
    { type: 'volume', id: 'n-west', x: -9, y: 15, w: 12, d: 26, h: 9, floors: 3, state: 'context' },
    { type: 'volume', id: 'n-north', x: 13, y: 38, w: 26, d: 10, h: 6, floors: 2, state: 'context' },
    { type: 'volume', id: 'n-east', x: 49, y: 20, w: 12, d: 22, h: 12, floors: 4, state: 'context' },
    { type: 'tree', id: 't-1', x: 26, y: 3, size: 4, h: 6 }, { type: 'tree', id: 't-2', x: 20, y: 26, size: 5, h: 8 },
    { type: 'tree', id: 't-3', x: 3, y: 27, size: 3.5, h: 7, kind: 'conifer' },
    { type: 'person', id: 'p-1', x: 14, y: -2, pose: 1 },
  ];
  const s1 = [...clone(around), { type: 'dim', id: 'd-chamfer', x1: 30, y1: 22, x2: 24, y2: 30, offset: -2.5 }];
  const house = { type: 'volume', id: 'v-house', shape: 'poly', ...polyFromWorld([[4, 4], [22, 4], [22, 12], [12, 12], [12, 24], [4, 24]]), h: 6, floors: 2 };
  const s2 = [...clone(around), house];
  const garage = { type: 'volume', id: 'v-garage', x: 21, y: 18, w: 6, d: 8, h: 3, roof: 'gable', roofH: 2 };
  const s3 = [...clone(s2), garage];
  const smaller = { ...clone(house), ...polyFromWorld([[4, 4], [22, 4], [22, 12], [12, 12], [12, 18], [4, 18]]) };
  const s4 = clone(s3).map((o) => (o.id === 'v-house' ? smaller : o));
  const s5 = [...clone(s4).map((o) => (o.id === 'v-house' ? { ...o, cat: 'k-house' } : o.id === 'v-garage' ? { ...o, cat: 'k-garage' } : o)),
    { type: 'area', id: 'e-garden', x: 8, y: 23, w: 10, d: 8, kind: 'green' },
    { type: 'label', id: 'l-garden', x: 8, y: 26, z: 0, dx: -12, dy: -9, text: t('Jardim ao norte', 'Garden to the north'), size: 1.5, font: 'hand', caps: false },
  ];
  return {
    format: 'lionaxon', schemaVersion: 2, name: t('Casa no lote de esquina', 'House on a corner lot'),
    site: { w: 30, d: 30, pts: [[0, 0], [30, 0], [30, 22], [24, 30], [0, 30]], mode: 'fill', dims: true, thickness: 0 },
    levels: [{ id: 'L0', name: '', z: 0 }],
    north: 0, northPlace: 'drawing', grid: 1, style: 'beige', view: { az: -45 },
    sun: { on: true, lat: -30, month: 6, day: 21, hour: 14, opacity: 0.18 },
    categories: [
      { id: 'k-house', name: t('Casa', 'House'), color: '#e8c9a0' },
      { id: 'k-garage', name: t('Garagem', 'Garage'), color: '#b9c7d6' },
    ],
    steps: steps5([s1, s2, s3, s4, s5], [
      [t('Lote e entorno', 'Lot and surroundings'), t('Um lote de esquina chanfrada, entre vizinhos de dois a quatro pavimentos.', 'A corner lot with a chamfer, between neighbours of two to four floors.')],
      [t('Volume em L', 'L-shaped volume'), t('A casa acompanha as duas ruas e abre o fundo do lote.', 'The house follows the two streets and opens the back of the lot.')],
      [t('Garagem', 'Garage'), t('Um anexo de duas águas fecha o pátio.', 'A gabled annexe closes the yard.')],
      [t('Recuo', 'Set-back'), t('A ala norte encurta para o sol de inverno entrar; o tracejado mostra o que saiu.', 'The north wing gets shorter for the winter sun; the dashes show what went.')],
      [t('Resultado', 'Result'), t('Casa, garagem e jardim; sombras de 21 de junho às 14 h.', 'House, garage and garden; shadows of 21 June at 2 p.m.')],
    ], { 1: { op: '+' }, 2: { op: '+' }, 3: { op: '−', ghostPrev: true }, 4: { op: '=' } }),
    sheet: { layout: 'grid', cols: 3, paper: 'A3', orientation: 'landscape', title: t('Casa no lote de esquina', 'House on a corner lot'), subtitle: t('Entorno, sol e partido', 'Surroundings, sun and parti'), legend: true, texts: true },
  };
}

export const EXAMPLES = ['parti', 'plateaus', 'tower', 'slope', 'school', 'corner'];
const BUILDERS = { parti: build, plateaus, tower, slope, school, corner };

fs.mkdirSync(out, { recursive: true });
for (const id of EXAMPLES) {
  for (const lang of Object.keys(TEXT)) {
    const file = path.join(out, `${id}-${lang}.lionaxon`);
    fs.writeFileSync(file, JSON.stringify(normalizeProject(BUILDERS[id](lang)), null, 2) + '\n');
    console.log('wrote', path.relative(process.cwd(), file));
  }
}
