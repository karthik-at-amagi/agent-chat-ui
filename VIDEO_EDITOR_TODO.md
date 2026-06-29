# Video Editor Implementation Plan

## Phase 1: Foundation & State Management

- [ ] Define `VideoEditorProvider` and `useVideoEditor` hook in `src/providers/VideoEditor.tsx`.
- [ ] Implement state for `mediaPool` and `timelineItems`.
- [ ] Integrate `VideoEditorProvider` into `src/app/page.tsx`.

## Phase 2: UI Scaffolding (Right Pane)

- [ ] Create `src/components/thread/video-editor/index.tsx` as the main container.
- [ ] Modify `src/components/thread/index.tsx` to support switching between Artifact view and Video Editor view in the right pane.
- [ ] Implement resizable divider between chat and video editor.
- [ ] Implement basic layout: Top (Asset Editor), Middle (Media Pool), Bottom (Timeline).

## Phase 4: Media Pool & Asset Editor

- [x] Build the `MediaPool` component:
  - [x] Implement row-based list layout.
  - [x] Selection logic.
- [ ] Build the `AssetEditor` component:
  - [ ] Implement video retrieval from `/asset_files/[asset_id].video_ext`.
  - [ ] Preview player.
  - [ ] Enhanced trim sliders with `[start-10, end+10]` window and adjustable markers.
  - [ ] "Overwrite" and "Save as New" buttons.

## Phase 5: Timeline Implementation

- [ ] Implement the `Timeline` component:
  - [ ] Time axis/ruler at the top.
  - [ ] Video track and Audio track.
  - [ ] Scrubbing/Playhead logic.
- [ ] Add Drag-and-Drop support:
  - [ ] Drag from Media Pool to Timeline tracks.
  - [ ] Move clips within the Timeline.
- [ ] Implement basic "Play Timeline" functionality:
  - [ ] Sequential playback simulation using JavaScript.
  - [ ] Timeline Preview player component.
  - [ ] Syncing multiple video/audio elements to a single playhead.

## Phase 6: Refinement & Polishing

- [ ] Add clip snapping on the timeline.
- [ ] Implement "Export/Concatenate" mock action (preparing the data structure for backend processing).
- [ ] Styling and animations using `framer-motion`.
- [ ] Comprehensive testing across different video formats.

## Dependencies to Consider

- `lucide-react` (Icons - already present)
- `@radix-ui/react-slider` (Trimming - already present via other radix deps or easy to add)
- `dnd-kit` or `react-draggable` (Timeline movement)
- `date-fns` (Time formatting - already present)
