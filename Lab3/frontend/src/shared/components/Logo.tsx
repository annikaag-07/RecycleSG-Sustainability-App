import { Image } from 'react-native';

// The pin from the app icon, cropped tight (371 x 512).
const SOURCE = require('../../../assets/logo.png');
const ASPECT = 371 / 512;

/** The RecycleSG mark at `size` points tall. Decorative: put the name in text beside it. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={SOURCE}
      style={{ width: Math.round(size * ASPECT), height: size }}
      resizeMode="contain"
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
