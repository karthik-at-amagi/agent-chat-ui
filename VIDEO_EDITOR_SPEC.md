# Video Editor Specification

## Overview

The Video Editor is a new feature for the Agent Chat UI that allows users to create video compositions from clips identified or generated during a chat session. It consists of a specialized right-pane interface, a "Media Pool" for storing clips, an "Asset Editor" for fine-tuning clips, and a "Timeline" for arranging clips into a final sequence.

## Core Features

### 1. Artifact Integration: "Send to Pool"

- When a video is rendered within an Artifact (e.g., a tool result containing a `video_url`), a "Send video to pool" button will be available.
- Clicking this button will capture:
  - `asset_id` (the video URL or a unique identifier)
  - `clip_start` (default 0 or current playback time)
  - `clip_end` (default duration or current playback time)
- Captured clips are added to the **Media Pool**.

### 2. Video Editor Pane (Right Sidebar)

The right sidebar will now have a toggle or a specific mode for the Video Editor. It is divided into three main sections:

#### A. Media Pool

- A row-based list view of captured video and audio assets.
- Displays thumbnails and metadata (name, duration, asset ID).
- Users can click the "+" button to add assets to the timeline or click the row to edit in the Asset Editor.
- Supports audio-only, video-only, or combined assets.

#### B. Asset Editor (Top Section)

- Contextual editor for the currently selected clip in the Media Pool.
- **Original Asset Retrieval**: Retrieves the full source movie asset from `/asset_files/[asset_id].video_ext`. The `asset_id` identifies the entire asset.
- **Preview Player**: A video player showing the full source asset.
- **Enhanced Trimming Controls**:

  - High-precision sliders (e.g., `radix-ui/react-slider`).
  - **Dual-tier Sliders**:
    - **Trim & Seek Slider**: Focuses on the current clip range. Includes a red playhead marker to indicate current playback position.
    - **View Window Slider**: Controls the "Zoom" or "Pan" of the Trim slider relative to the full asset duration.
  - Adjustable markers for `clip_start` and `clip_end` that also act as seek buttons.

- **Actions**:
  - "Overwrite": Update the current media pool object with new trim points.
  - "Save as New": Create a new media pool object from the trimmed selection.

#### C. Timeline (Bottom Section)

- A multi-track timeline for arranging clips.
- **Separate Tracks**: Mandatory separation of Video and Audio tracks to allow overlapping and independent movement.
- **Functionality**:
  - Drag-and-drop arrangement.
  - Clip snapping.
  - Zooming/Panning the timeline view.
  - Playhead for scrubbing through the composition.
- **React Components**: Leverage libraries like `react-video-editor` (if suitable) or `dnd-kit` for custom track management.

## Data Structures

### Media Pool Object

```typescript
interface MediaPoolItem {
  id: string; // unique internal id
  assetId: string; // source URL/ID
  type: "video" | "audio" | "both";
  name: string;
  start: number; // in seconds
  end: number; // in seconds
  duration: number;
}
```

### Timeline Item

```typescript
interface TimelineItem extends MediaPoolItem {
  timelineStart: number; // position on the timeline in seconds
  trackId: string;
}
```

## UI/UX Design

- **Visual Style**: Support both dark and light themes, defaulting to system theme, following existing project aesthetics (Tailwind CSS, Lucide icons, Radix UI).
- **Responsiveness**: The right pane should be resizable or take up a significant portion of the screen (e.g., 40-50% width) when active.
- **Adjustable Divider**: The vertical divider between the Chat interface and the Video Editor pane must be draggable to allow the user to control the width of both sections.
- **Timeline Preview**: A dedicated preview player to view the current timeline composition.
- **Feedback**: Real-time preview of the timeline sequence.

## Technical Considerations

- **Video Rendering**: Use standard HTML5 `<video>` tags for previewing.
- **State Management**: Use React Context or a lightweight store (like `zustand` if needed, though Context is preferred for consistency with `ThreadProvider`) to manage the Media Pool and Timeline state.
- **Concurrency**: Audio and Video tracks should be synced to a single master playhead.
- **Client-Side Simulation**: Clipping and concatenation should be simulated in the browser using JavaScript and CSS. Do not use ffmpeg unless strictly necessary.
  - **Clipping**: Use the `timeupdate` event or `media-fragment` URI (e.g., `#t=10,20`) to simulate trimmed clips.
  - **Concatenation**: Orchestrate sequential playback of multiple video/audio elements or dynamic source swapping to simulate a continuous timeline.
