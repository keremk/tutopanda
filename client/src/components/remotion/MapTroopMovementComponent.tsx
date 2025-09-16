import { AbsoluteFill, interpolate } from 'remotion';
import { type MapTroopMovementComponent as MapTroopMovementComponentType } from '@/schema';

interface MapTroopMovementComponentProps {
  component: MapTroopMovementComponentType;
  progress: number;
}

export const MapTroopMovementComponent: React.FC<MapTroopMovementComponentProps> = ({ component, progress }) => {
  // Simple medieval Europe map bounds (approximate)
  const mapBounds = {
    north: 60,
    south: 35,
    west: -10,
    east: 30,
  };

  // Convert lat/lng to pixel coordinates
  const latLngToPixel = (lat: number, lng: number) => {
    const x = ((lng - mapBounds.west) / (mapBounds.east - mapBounds.west)) * 1920;
    const y = ((mapBounds.north - lat) / (mapBounds.north - mapBounds.south)) * 1080;
    return { x, y };
  };

  const renderTroopPath = (troop: any) => {
    const pathPoints = troop.path.map((point: any) => ({
      ...latLngToPixel(point.lat, point.lng),
      timestamp: point.timestamp,
    }));

    // Calculate current position based on progress
    const currentTime = progress * component.duration;
    let currentPosition = pathPoints[0];
    
    for (let i = 1; i < pathPoints.length; i++) {
      if (currentTime >= pathPoints[i].timestamp) {
        currentPosition = pathPoints[i];
      } else {
        // Interpolate between points
        const prevPoint = pathPoints[i - 1];
        const nextPoint = pathPoints[i];
        const segmentProgress = (currentTime - prevPoint.timestamp) / (nextPoint.timestamp - prevPoint.timestamp);
        
        if (segmentProgress > 0 && segmentProgress <= 1) {
          currentPosition = {
            x: interpolate(segmentProgress, [0, 1], [prevPoint.x, nextPoint.x]),
            y: interpolate(segmentProgress, [0, 1], [prevPoint.y, nextPoint.y]),
            timestamp: currentTime,
          };
        }
        break;
      }
    }

    return {
      pathPoints,
      currentPosition,
    };
  };

  return (
    <AbsoluteFill>
      {/* Map background */}
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #2d5016 0%, #3d6b1a 50%, #4a7c23 100%)',
          position: 'relative',
        }}
      >
        {/* Medieval Europe outline (simplified) */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        >
          {/* Simplified coastlines */}
          <path
            d="M300 200 Q400 180 500 200 Q600 220 700 200 Q800 180 900 200 L900 800 Q800 820 700 800 Q600 780 500 800 Q400 820 300 800 Z"
            fill="#8B4513"
            stroke="#654321"
            strokeWidth="2"
          />
          
          {/* Water bodies */}
          <circle cx="600" cy="600" r="80" fill="#4169E1" opacity="0.6" />
          <ellipse cx="800" cy="300" rx="60" ry="40" fill="#4169E1" opacity="0.6" />
        </svg>

        {/* Troop movements */}
        {component.troops.map((troop) => {
          const { pathPoints, currentPosition } = renderTroopPath(troop);
          
          return (
            <div key={troop.id}>
              {/* Trail */}
              <svg
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
              >
                <path
                  d={`M ${pathPoints.map((p: any) => `${p.x} ${p.y}`).join(' L ')}`}
                  stroke={troop.color}
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray="10 5"
                  opacity="0.6"
                />
              </svg>
              
              {/* Current position marker */}
              <div
                style={{
                  position: 'absolute',
                  left: currentPosition.x - 15,
                  top: currentPosition.y - 15,
                  width: 30,
                  height: 30,
                  backgroundColor: troop.color,
                  border: '3px solid white',
                  borderRadius: '50%',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: 'white',
                    borderRadius: '50%',
                  }}
                />
              </div>
              
              {/* Troop name label */}
              <div
                style={{
                  position: 'absolute',
                  left: currentPosition.x + 20,
                  top: currentPosition.y - 10,
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: 16,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                }}
              >
                {troop.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Title overlay */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'center',
          padding: 60,
          pointerEvents: 'none',
        }}
      >
        <h1
          style={{
            fontSize: 56,
            fontWeight: 'bold',
            color: 'white',
            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
            margin: 0,
            fontFamily: 'Inter, sans-serif',
            textAlign: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: '20px 40px',
            borderRadius: '8px',
          }}
        >
          {component.name}
        </h1>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};