import type { Metadata } from 'next';
import SonaMotionLab from './SonaMotionLab';

export const metadata: Metadata = {
  title: 'Sona motion lab',
  description: 'Review the Sona vector identity and state motion system.',
};

export default function SonaMotionLabPage() {
  return <SonaMotionLab />;
}
