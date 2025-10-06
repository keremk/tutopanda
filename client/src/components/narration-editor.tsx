interface NarrationEditorProps {
  selectedClipId: string | null;
}

export default function NarrationEditor({ selectedClipId }: NarrationEditorProps) {
  return (
    <div className="h-full flex items-center justify-center bg-muted/30 rounded-lg border border-border">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Narration Editor</h3>
        {selectedClipId ? (
          <p className="text-muted-foreground">Selected clip: {selectedClipId}</p>
        ) : (
          <p className="text-muted-foreground">Select a voice clip from the timeline below</p>
        )}
      </div>
    </div>
  );
}
