import dynamic from 'next/dynamic';
import type { KenBurnsClip } from '@/types/types';

interface EffectPreviewProps {
  clip: KenBurnsClip;
  imageUrl: string;
  effectName?: string;
}

// Dynamic import with loading state to prevent blocking
const EffectPreview = dynamic(
  () => import('./effect-preview'),
  {
    loading: () => (
      <div className="w-full h-full bg-black rounded-lg overflow-hidden flex items-center justify-center">
        <div className="text-white text-sm">Loading effect preview...</div>
      </div>
    ),
    ssr: false, // Remotion Player doesn't work with SSR
  }
);

export default function LazyEffectPreview(props: EffectPreviewProps) {
  return <EffectPreview {...props} />;
}
