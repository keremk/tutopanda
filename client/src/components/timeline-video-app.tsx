"use client";

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VideoIcon, Code, Clock, Download } from 'lucide-react';
import InteractiveTimelineEditor from './interactive-timeline-editor';
import VideoPreview from './video-preview';
import JsonEditor from './json-editor';
import { mockTimeline, type Timeline, type TimelineComponent } from '@/schema';

export default function TimelineVideoApp() {
  const [timeline, setTimeline] = useState<Timeline>(mockTimeline);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState('timeline');

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

  const handleTimelineChange = (newTimeline: Timeline) => {
    setTimeline(newTimeline);
    setCurrentTime(0); // Reset playback
    console.log('🔄 Timeline updated from JSON:', newTimeline.name);
  };

  const getCurrentComponents = () => {
    return timeline.components.filter(comp => 
      currentTime >= comp.startTime && currentTime < comp.startTime + comp.duration
    );
  };

  const currentComponents = getCurrentComponents();

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <VideoIcon className="w-8 h-8 text-primary" />
              Timeline Video Creator
            </h1>
            <p className="text-muted-foreground mt-1">
              Create videos from JSON timeline definitions with Remotion
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-sm">
              {timeline.components.length} Components
            </Badge>
            <Badge variant="outline" className="text-sm">
              {timeline.duration}s Duration
            </Badge>
            {currentComponents.length > 0 && (
              <Badge variant="default" className="text-sm">
                {currentComponents.length} Active
              </Badge>
            )}
          </div>
        </div>

        {/* Video Preview - Always Visible */}
        <VideoPreview
          timeline={timeline}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onSeek={handleSeek}
          onPlay={handlePlay}
          onPause={handlePause}
        />

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="timeline" data-testid="tab-video">
              <Clock className="w-4 h-4 mr-2" />
              Video
            </TabsTrigger>
            <TabsTrigger value="json" data-testid="tab-json">
              <Code className="w-4 h-4 mr-2" />
              JSON Editor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-6">
            <div className="space-y-6">
              <InteractiveTimelineEditor
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
              
              {/* Current Components Display */}
              {currentComponents.length > 0 && (
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h3 className="text-sm font-semibold mb-2">Currently Playing:</h3>
                  <div className="flex flex-wrap gap-2">
                    {currentComponents.map(comp => (
                      <Badge key={comp.id} variant="secondary">
                        {comp.name} ({comp.type})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="json" className="mt-6">
            <JsonEditor
              timeline={timeline}
              onTimelineChange={handleTimelineChange}
            />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground border-t pt-4">
          Built with Remotion, React, and TypeScript • Timeline-based video generation
        </div>
      </div>
    </div>
  );
}