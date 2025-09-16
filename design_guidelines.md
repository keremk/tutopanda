# Design Guidelines for Timeline Video Creator

## Design Approach
**Reference-Based Approach**: Drawing inspiration from video editing tools like Adobe Premiere Pro and DaVinci Resolve, combined with modern productivity apps like Notion and Linear for clean, functional interfaces.

## Core Design Elements

### Color Palette
**Dark Mode Primary** (Professional Video Editor Aesthetic):
- Background: 220 15% 8% (Deep charcoal)
- Surface: 220 12% 12% (Elevated panels)
- Border: 220 8% 20% (Subtle divisions)
- Primary: 210 100% 60% (Professional blue)
- Text: 220 5% 95% (High contrast white)

### Typography
- **Primary**: Inter (clean, technical readability)
- **Monospace**: JetBrains Mono (for JSON/code display)
- Hierarchy: text-sm for metadata, text-base for content, text-lg for headers

### Layout System
**Tailwind Spacing**: Consistent use of 2, 4, 6, 8, 12, 16 units
- Tight spacing (p-2, gap-2) for timeline components
- Medium spacing (p-4, gap-4) for main sections
- Generous spacing (p-8, gap-8) for page layout

### Component Library

**Timeline Editor**:
- Horizontal timeline with component blocks
- Draggable component cards with visual previews
- Playhead scrubber with time indicators
- Zoom controls for timeline precision

**Video Preview Panel**:
- Large centered video player
- Clean play/pause controls
- Export progress indicator
- Fullscreen preview option

**Component Properties Panel**:
- Collapsible sections for each component type
- JSON editor with syntax highlighting
- Real-time validation feedback
- Component-specific controls (Ken Burns settings, map coordinates)

**Navigation**:
- Split-panel layout: Timeline bottom, preview top-left, properties top-right
- Resizable panel dividers
- Minimal header with project name and export button

### Visual Treatments
- **Gradients**: Subtle dark gradients (220 20% 6% to 220 15% 10%) for panel backgrounds
- **Shadows**: Deep shadows (shadow-2xl) for floating panels and modals
- **Borders**: Single-pixel borders in border color for clean separation
- **Animations**: Minimal - only essential feedback (button states, loading indicators)

### Key Principles
1. **Professional Tools Aesthetic**: Dark theme with high contrast for long editing sessions
2. **Functional Hierarchy**: Video preview takes visual priority, timeline secondary, properties tertiary
3. **Technical Precision**: Monospace fonts and exact timing displays for accuracy
4. **Minimal Distraction**: Clean interfaces that keep focus on video content

The design prioritizes functionality and precision over visual flair, creating a professional video editing environment optimized for timeline-based content creation.