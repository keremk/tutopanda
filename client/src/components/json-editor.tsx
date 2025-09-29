import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FileText, Check, X, Upload } from 'lucide-react';
import { timelineSchema } from '@/types/types';
import { type Timeline } from '@/types/types';

interface JsonEditorProps {
  timeline: Timeline;
  onTimelineChange: (timeline: Timeline) => void;
}

export default function JsonEditor({ timeline, onTimelineChange }: JsonEditorProps) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(timeline, null, 2));
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const validateAndApply = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const validated = timelineSchema.parse(parsed);
      onTimelineChange(validated);
      setIsValid(true);
      setError(null);
      console.log('Timeline updated successfully');
    } catch (err) {
      setIsValid(false);
      setError(err instanceof Error ? err.message : 'Invalid JSON format');
      console.error('Timeline validation failed:', err);
    }
  };

  const resetToDefault = () => {
    const defaultJson = JSON.stringify(timeline, null, 2);
    setJsonText(defaultJson);
    setIsValid(true);
    setError(null);
  };

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            <span>Timeline JSON</span>
            <Badge variant={isValid ? 'default' : 'destructive'}>
              {isValid ? (
                <><Check className="w-3 h-3 mr-1" />Valid</>
              ) : (
                <><X className="w-3 h-3 mr-1" />Invalid</>
              )}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetToDefault}
              data-testid="button-reset-json"
            >
              Reset
            </Button>
            <Button
              onClick={validateAndApply}
              disabled={!jsonText.trim()}
              data-testid="button-apply-json"
            >
              <Upload className="w-4 h-4 mr-1" />
              Apply Changes
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-4 min-h-0">
        {error && (
          <div className="shrink-0 text-sm text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
            <strong>Validation Error:</strong> {error}
          </div>
        )}

        <div className="flex-1 flex flex-col space-y-2 min-h-0">
          <div className="shrink-0 text-sm text-muted-foreground">
            Edit the timeline JSON below. Changes will be applied when you click "Apply Changes".
          </div>
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder="Enter timeline JSON here..."
            className="flex-1 font-mono text-sm resize-none"
            data-testid="textarea-json"
          />
        </div>

        <div className="shrink-0 text-xs text-muted-foreground space-y-1">
          <div>
            <strong>Supported tracks:</strong> visual, voice, music, soundEffects
          </div>
          <div>
            <strong>Visual clip kinds:</strong> kenBurns
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
