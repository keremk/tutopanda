import { AbsoluteFill } from 'remotion';

interface SubtitleDisplayProps {
  text: string;
}

export const SubtitleDisplay: React.FC<SubtitleDisplayProps> = ({ text }) => {
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: '80px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          color: 'white',
          fontSize: '48px',
          fontFamily: 'Arial, sans-serif',
          padding: '16px 32px',
          borderRadius: '8px',
          textAlign: 'center',
          maxWidth: '80%',
          lineHeight: '1.4',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
