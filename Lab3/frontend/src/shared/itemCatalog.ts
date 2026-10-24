// Maps what a user types ("old laptop") to a material_types.name, with a warning when the obvious bin is wrong
// (UC 2.1 steps 4–5). UC 2.1 leaves "keyword table vs something more flexible" open; this is the keyword table.
// Material names must match the backend seed (Plastic, Paper, Cardboard, Glass, Metal, Batteries, E-Waste,
// Clothing, Lighting Waste).

export type ItemMatch = {
  material: string;
  /** Shown as the "Not the blue bin" style banner. */
  warning?: { title: string; body: string };
  tip?: string;
};

const NOT_BLUE_BIN = 'Not the blue bin';

const RULES: { keywords: string[]; match: ItemMatch }[] = [
  {
    keywords: ['laptop', 'computer', 'desktop', 'phone', 'mobile', 'tablet', 'ipad', 'printer', 'monitor', 'router', 'modem', 'keyboard', 'mouse', 'camera', 'charger', 'cable', 'e-waste', 'ewaste', 'electronic'],
    match: {
      material: 'E-Waste',
      warning: {
        title: NOT_BLUE_BIN,
        body: 'Electronics are regulated e-waste (ICT equipment). In a blue bin they contaminate the load and batteries inside are a fire risk. Take them to an e-waste point.',
      },
    },
  },
  {
    keywords: ['battery', 'batteries', 'power bank', 'powerbank'],
    match: {
      material: 'Batteries',
      warning: {
        title: NOT_BLUE_BIN,
        body: 'Batteries are a fire risk in blue bins and recycling trucks. Take them to a battery or e-waste collection point.',
      },
    },
  },
  {
    keywords: ['light bulb', 'lightbulb', 'bulb', 'lamp', 'fluorescent', 'led tube', 'lighting'],
    match: {
      material: 'Lighting Waste',
      warning: {
        title: NOT_BLUE_BIN,
        body: 'Lamps and bulbs need a lighting-waste point. Some contain mercury, and broken glass is a hazard for workers.',
      },
    },
  },
  {
    keywords: ['pizza box'],
    match: {
      material: 'Cardboard',
      warning: {
        title: 'Only if it is clean',
        body: 'Grease and food soak into cardboard and cannot be recycled. Tear off clean parts for recycling; the soiled part goes in general waste.',
      },
    },
  },
  { keywords: ['cardboard', 'carton box', 'box', 'packaging'], match: { material: 'Cardboard', tip: 'Flatten boxes before you drop them.' } },
  {
    keywords: ['plastic bottle', 'bottle', 'plastic', 'container', 'tupperware', 'plastic bag', 'bag'],
    match: { material: 'Plastic', tip: 'Rinse and empty it first — food residue is the biggest cause of blue-bin contamination.' },
  },
  { keywords: ['can', 'tin', 'aluminium', 'aluminum', 'metal', 'drink can'], match: { material: 'Metal', tip: 'Empty and rinse cans before recycling.' } },
  { keywords: ['glass', 'jar', 'glass bottle'], match: { material: 'Glass', tip: 'Rinse jars and bottles; remove lids.' } },
  { keywords: ['paper', 'newspaper', 'magazine', 'envelope', 'flyer', 'book', 'notebook'], match: { material: 'Paper', tip: 'Keep paper dry and clean.' } },
  { keywords: ['clothes', 'clothing', 'shirt', 'tshirt', 't-shirt', 'pants', 'shoes', 'textile', 'fabric', 'bag of clothes'], match: { material: 'Clothing' } },
];

// Longest keyword first, so "plastic bottle" beats "bottle" and "pizza box" beats "box".
const INDEX = RULES.flatMap((r) => r.keywords.map((k) => ({ k, match: r.match }))).sort((a, b) => b.k.length - a.k.length);

export function matchItem(query: string): ItemMatch | null {
  const q = ` ${query.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (q.trim().length < 2) return null;
  for (const { k, match } of INDEX) {
    if (q.includes(` ${k} `) || q.includes(` ${k}s `) || q.includes(` ${k}es `)) return match;
  }
  return null;
}

/** "Also searched" suggestions from the mockup. */
export const SUGGESTED_SEARCHES = ['plastic bottle', 'pizza box', 'batteries', 'clothes', 'old laptop'];
