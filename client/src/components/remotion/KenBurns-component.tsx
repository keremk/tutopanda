import { AbsoluteFill, Img, interpolate } from 'remotion';
import { type KenBurnsClip } from '@/types/types';

interface KenBurnsComponentProps {
  component: KenBurnsClip;
  progress: number;
}

export const KenBurnsComponent: React.FC<KenBurnsComponentProps> = ({ component, progress }) => {
  if (!component.imageUrl) {
    return null;
  }

  const scale = interpolate(progress, [0, 1], [component.startScale, component.endScale]);
  const translateX = interpolate(progress, [0, 1], [component.startX, component.endX]);
  const translateY = interpolate(progress, [0, 1], [component.startY, component.endY]);

  return (
    <AbsoluteFill>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Img
          src={component.imageUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
            transition: 'none',
          }}
        />
      </div>
      
      {/* Title overlay */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'flex-start',
          padding: 60,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        }}
      >
        <h1
          style={{
            fontSize: 64,
            fontWeight: 'bold',
            color: 'white',
            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
            margin: 0,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {component.name}
        </h1>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
