"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import VideoPreviewContent from './video-preview-content';
import TimelineEditorContent from './timeline-editor-content';
import ScriptEditor from './script-editor';
import AssetsEditor from './assets-editor';
import { mockTimeline, type Timeline, type TimelineComponent } from '@/schema';

export default function TimelineVideoApp() {
  const [timeline, setTimeline] = useState<Timeline>(mockTimeline);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Auto-pause when reaching end - now handled by the Player
  useEffect(() => {
    if (currentTime >= timeline.duration) {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [currentTime, timeline.duration]);

  const handlePlay = () => {
    setIsPlaying(true);
    console.log('▶️ Playback started');
  };

  const handlePause = () => {
    setIsPlaying(false);
    console.log('⏸️ Playback paused');
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    console.log('⏭️ Seeked to:', time.toFixed(1) + 's');
  };

  const handleAddComponent = (type: 'ken_burns' | 'map_troop_movement') => {
    const newComponent: TimelineComponent = type === 'ken_burns'
      ? {
          type: 'ken_burns',
          id: `kb-${Date.now()}`,
          name: `New Ken Burns ${timeline.components.length + 1}`,
          duration: 5,
          startTime: timeline.duration,
          imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=800&fit=crop',
          startScale: 1,
          endScale: 1.2,
          startX: 0,
          startY: 0,
          endX: -30,
          endY: -20,
        }
      : {
          type: 'map_troop_movement',
          id: `map-${Date.now()}`,
          name: `New Map Movement ${timeline.components.length + 1}`,
          duration: 6,
          startTime: timeline.duration,
          mapRegion: 'medieval_europe',
          troops: [{
            id: 'troop-1',
            name: 'New Forces',
            color: '#ff6b6b',
            path: [
              { lat: 48.8, lng: 2.3, timestamp: 0 },
              { lat: 51.5, lng: -0.1, timestamp: 3 },
              { lat: 52.5, lng: 13.4, timestamp: 6 },
            ],
          }],
        };

    const newTimeline = {
      ...timeline,
      duration: timeline.duration + newComponent.duration,
      components: [...timeline.components, newComponent],
    };

    setTimeline(newTimeline);
    console.log(`➕ Added ${type} component:`, newComponent.name);
  };

  const handleRemoveComponent = (id: string) => {
    const componentToRemove = timeline.components.find(comp => comp.id === id);
    const updatedComponents = timeline.components.filter(comp => comp.id !== id);

    // Recalculate timeline duration
    const newDuration = updatedComponents.reduce((max, comp) =>
      Math.max(max, comp.startTime + comp.duration), 0
    );

    const newTimeline = {
      ...timeline,
      duration: newDuration,
      components: updatedComponents,
    };

    setTimeline(newTimeline);
    console.log(`❌ Removed component: ${componentToRemove?.name}`);
  };

  const handleUpdateComponent = (id: string, updates: { startTime?: number; duration?: number }) => {
    const updatedComponents = timeline.components.map(comp =>
      comp.id === id ? { ...comp, ...updates } : comp
    );

    // Recalculate timeline duration based on the furthest component end
    const newDuration = Math.max(
      timeline.duration,
      ...updatedComponents.map(comp => comp.startTime + comp.duration)
    );

    const newTimeline = {
      ...timeline,
      duration: newDuration,
      components: updatedComponents,
    };

    setTimeline(newTimeline);
    console.log(`🔄 Updated component ${id}:`, updates);
  };

  const handleExport = async () => {
    try {
      console.log('🎬 Exporting video to MP4...');
      console.log('📊 Export settings:', {
        duration: timeline.duration,
        components: timeline.components.length,
        resolution: '1920x1080',
        fps: 30
      });

      const response = await fetch('/api/export-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ timeline }),
      });

      const result = await response.json();

      if (response.ok) {
        console.log('✅ Export started successfully:', result);
        alert(`Export initiated! Your video "${result.timeline}" with ${result.components} components is being processed. Duration: ${result.duration}s`);
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (error) {
      console.error('❌ Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <Tabs defaultValue="video-preview" className="h-full flex flex-col">
        <div className="shrink-0 px-6 pt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="video-preview">Video Preview</TabsTrigger>
            <TabsTrigger value="script">Script</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="video-preview" className="flex-1 flex flex-col p-6 mt-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Video Preview</h2>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAddComponent('ken_burns')}
                data-testid="button-add-ken-burns"
              >
                <Plus className="w-4 h-4 mr-1" />
                Ken Burns
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAddComponent('map_troop_movement')}
                data-testid="button-add-map"
              >
                <Plus className="w-4 h-4 mr-1" />
                Map
              </Button>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {/* Player section */}
            <div className="flex-1 min-h-0">
              <VideoPreviewContent
                timeline={timeline}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onSeek={handleSeek}
                onPlay={handlePlay}
                onPause={handlePause}
              />
            </div>

            {/* Timeline section */}
            <div className="h-80 min-h-0">
              <TimelineEditorContent
                timeline={timeline}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeek={handleSeek}
                onAddComponent={handleAddComponent}
                onRemoveComponent={handleRemoveComponent}
                onUpdateComponent={handleUpdateComponent}
                onExport={handleExport}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="script" className="flex-1 p-6 mt-0">
          <ScriptEditor />
        </TabsContent>

        <TabsContent value="assets" className="flex-1 p-6 mt-0">
          <AssetsEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}