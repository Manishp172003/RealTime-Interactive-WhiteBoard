// src/types/whiteboard.ts
export interface LineData {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  strokeWidth: number;
  points: number[];
}