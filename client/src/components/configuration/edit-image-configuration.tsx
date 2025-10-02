"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { ImageConfig } from "@/types/types";
import {
  imageSizeValues,
  aspectRatioValues,
  imageStyleValues,
  imageFormatValues,
  imageModelValues,
} from "@/types/types";

interface EditImageConfigurationProps {
  config: ImageConfig;
  onChange: (config: ImageConfig) => void;
}

export function EditImageConfiguration({ config, onChange }: EditImageConfigurationProps) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Image Settings</h4>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="imageSize">Size</Label>
          <Select
            value={config.size}
            onValueChange={(value) => onChange({ ...config, size: value as typeof imageSizeValues[number] })}
          >
            <SelectTrigger id="imageSize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageSizeValues.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}p
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="aspectRatio">Aspect Ratio</Label>
          <Select
            value={config.aspectRatio}
            onValueChange={(value) => onChange({ ...config, aspectRatio: value as typeof aspectRatioValues[number] })}
          >
            <SelectTrigger id="aspectRatio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aspectRatioValues.map((ratio) => (
                <SelectItem key={ratio} value={ratio}>
                  {ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="imagesPerSegment">Images Per Segment</Label>
          <Input
            id="imagesPerSegment"
            type="number"
            min="1"
            max="2"
            value={config.imagesPerSegment}
            onChange={(e) => onChange({ ...config, imagesPerSegment: parseInt(e.target.value) || 1 })}
          />
          <p className="text-xs text-muted-foreground">Maximum 2 images per segment</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="imageStyle">Style</Label>
          <Select
            value={config.style}
            onValueChange={(value) => onChange({ ...config, style: value as typeof imageStyleValues[number] })}
          >
            <SelectTrigger id="imageStyle">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageStyleValues.map((style) => (
                <SelectItem key={style} value={style}>
                  {style}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="imageFormat">Format</Label>
          <Select
            value={config.format}
            onValueChange={(value) => onChange({ ...config, format: value as typeof imageFormatValues[number] })}
          >
            <SelectTrigger id="imageFormat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageFormatValues.map((format) => (
                <SelectItem key={format} value={format}>
                  {format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="imageModel">Model</Label>
          <Select
            value={config.model}
            onValueChange={(value) => onChange({ ...config, model: value as typeof imageModelValues[number] })}
          >
            <SelectTrigger id="imageModel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageModelValues.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
