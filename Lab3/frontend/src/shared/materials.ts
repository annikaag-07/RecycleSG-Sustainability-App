import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors } from '@/shared/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Which bin family a material goes to. Matches the Find filter chips (Blue bin / E-waste). */
export type Stream = 'blueBin' | 'eWaste' | 'other';

type MaterialMeta = { icon: IconName; color: string; stream: Stream };

// Keyed by material_types.name (seeded in 20261014020958_seed_material_types.sql).
// Display only — IDs must still come from the database.
const META: Record<string, MaterialMeta> = {
  Paper: { icon: 'file-document-outline', color: colors.paper, stream: 'blueBin' },
  Plastic: { icon: 'bottle-soda-outline', color: colors.plastic, stream: 'blueBin' },
  Glass: { icon: 'bottle-wine-outline', color: colors.glass, stream: 'blueBin' },
  Metal: { icon: 'food-variant', color: colors.metal, stream: 'blueBin' },
  Cardboard: { icon: 'package-variant', color: colors.paper, stream: 'other' },
  'E-Waste': { icon: 'laptop', color: colors.eWaste, stream: 'eWaste' },
  Batteries: { icon: 'battery-outline', color: colors.eWaste, stream: 'eWaste' },
  'Lighting Waste': { icon: 'lightbulb-outline', color: colors.eWaste, stream: 'eWaste' },
  Clothing: { icon: 'tshirt-crew-outline', color: colors.textMuted, stream: 'other' },
};

const FALLBACK: MaterialMeta = { icon: 'recycle', color: colors.textMuted, stream: 'other' };

export function materialMeta(name: string): MaterialMeta {
  return META[name] ?? FALLBACK;
}

/**
 * The bin family a point belongs to, from its own accepted materials (NFR-BR-06: never assume).
 * A point that takes any blue-bin material counts as a blue bin; otherwise e-waste if it takes any e-waste.
 */
export function pointStream(materialNames: string[]): Stream {
  const streams = new Set(materialNames.map((m) => materialMeta(m).stream));
  if (streams.has('blueBin')) return 'blueBin';
  if (streams.has('eWaste')) return 'eWaste';
  return 'other';
}
