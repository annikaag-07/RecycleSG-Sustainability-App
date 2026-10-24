// What to check before the drop (UC 3.2 step 5). Shown at the moment it matters, not buried in a help page.
// Keyed by material_types.name.

const BLUE_BIN_RULE = 'Food residue is the biggest single cause of contamination in blue bins — one soiled item spoils the load around it.';

const GUIDANCE: Record<string, string> = {
  Plastic: 'Empty and rinse bottles and containers. Clean plastic bags go in; styrofoam boxes and cups do not.',
  Paper: 'Keep it dry and free of food. Tissue, used paper towels and greasy paper go in general waste.',
  Cardboard: 'Flatten boxes and keep them dry. Greasy or wet cardboard goes in general waste.',
  Glass: 'Empty and rinse bottles and jars. Drinking glasses, mirrors and ceramics don’t belong here.',
  Metal: 'Empty and rinse food and drink cans.',
  'E-Waste': 'Only drop e-waste in an e-waste bin — never in a blue bin.',
  Batteries: 'Only drop batteries in an e-waste bin — never in a blue bin.',
  'Lighting Waste': 'Only drop bulbs and tubes in an e-waste bin — never in a blue bin.',
  Clothing: 'Clean, dry clothing only.',
};

const BLUE_BIN = new Set(['Plastic', 'Paper', 'Cardboard', 'Glass', 'Metal']);

export function dropGuidance(material: string): { tip: string; why?: string } {
  return {
    tip: GUIDANCE[material] ?? 'Make sure the item is clean, empty and dry.',
    why: BLUE_BIN.has(material) ? BLUE_BIN_RULE : undefined,
  };
}
