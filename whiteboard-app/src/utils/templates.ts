export interface LineData {
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser' | 'rect' | 'circle' | 'arrow' | 'laser';
  color: string;
  strokeWidth: number;
  points: number[];
}

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  generate: () => { lines: LineData[]; stickies: StickyNote[] };
}

export const WHITEBOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'kanban',
    name: 'Kanban Board',
    description: '3-Column agile task workflow: To Do, In Progress, Done',
    icon: 'Columns3',
    generate: () => {
      const timestamp = Date.now();
      const lines: LineData[] = [
        {
          id: `line-${timestamp}-col1`,
          tool: 'rect',
          color: '#cbd5e1',
          strokeWidth: 2,
          points: [100, 80, 420, 750],
        },
        {
          id: `line-${timestamp}-col2`,
          tool: 'rect',
          color: '#cbd5e1',
          strokeWidth: 2,
          points: [450, 80, 770, 750],
        },
        {
          id: `line-${timestamp}-col3`,
          tool: 'rect',
          color: '#cbd5e1',
          strokeWidth: 2,
          points: [800, 80, 1120, 750],
        },
      ];

      const stickies: StickyNote[] = [
        {
          id: `sticky-${timestamp}-h1`,
          x: 130,
          y: 100,
          text: '📌 TO DO\n────────\nBacklog tasks',
          color: '#bae6fd',
        },
        {
          id: `sticky-${timestamp}-h2`,
          x: 480,
          y: 100,
          text: '⚡ IN PROGRESS\n────────\nActively working',
          color: '#fef08a',
        },
        {
          id: `sticky-${timestamp}-h3`,
          x: 830,
          y: 100,
          text: '✅ DONE\n────────\nFinished items',
          color: '#bbf7d0',
        },
        {
          id: `sticky-${timestamp}-t1`,
          x: 130,
          y: 250,
          text: 'User onboarding flow review',
          color: '#bae6fd',
        },
        {
          id: `sticky-${timestamp}-t2`,
          x: 130,
          y: 400,
          text: 'Add dark mode contrast adjustments',
          color: '#bae6fd',
        },
        {
          id: `sticky-${timestamp}-t3`,
          x: 480,
          y: 250,
          text: 'Implement Keycloak SSO authentication',
          color: '#fef08a',
        },
        {
          id: `sticky-${timestamp}-t4`,
          x: 830,
          y: 250,
          text: 'Project architecture setup completed',
          color: '#bbf7d0',
        },
      ];

      return { lines, stickies };
    },
  },
  {
    id: 'swot',
    name: 'SWOT Analysis',
    description: '4-Quadrant strategic matrix: Strengths, Weaknesses, Opportunities, Threats',
    icon: 'Grid2x2',
    generate: () => {
      const timestamp = Date.now();
      const lines: LineData[] = [
        {
          id: `line-${timestamp}-q1`,
          tool: 'rect',
          color: '#22c55e',
          strokeWidth: 3,
          points: [150, 100, 580, 420],
        },
        {
          id: `line-${timestamp}-q2`,
          tool: 'rect',
          color: '#ef4444',
          strokeWidth: 3,
          points: [610, 100, 1040, 420],
        },
        {
          id: `line-${timestamp}-q3`,
          tool: 'rect',
          color: '#3b82f6',
          strokeWidth: 3,
          points: [150, 450, 580, 770],
        },
        {
          id: `line-${timestamp}-q4`,
          tool: 'rect',
          color: '#f59e0b',
          strokeWidth: 3,
          points: [610, 450, 1040, 770],
        },
      ];

      const stickies: StickyNote[] = [
        {
          id: `sticky-${timestamp}-s1`,
          x: 180,
          y: 130,
          text: '💪 STRENGTHS\n────────\n• Real-time Konva rendering\n• Fast WebSockets sync',
          color: '#bbf7d0',
        },
        {
          id: `sticky-${timestamp}-w1`,
          x: 640,
          y: 130,
          text: '⚠️ WEAKNESSES\n────────\n• Needs mobile touch tuning\n• High memory on large exports',
          color: '#fecdd3',
        },
        {
          id: `sticky-${timestamp}-o1`,
          x: 180,
          y: 480,
          text: '🚀 OPPORTUNITIES\n────────\n• AI diagram generation\n• Cloud team workspaces',
          color: '#bae6fd',
        },
        {
          id: `sticky-${timestamp}-t1`,
          x: 640,
          y: 480,
          text: '🛡️ THREATS\n────────\n• Browser performance bottlenecks\n• Network latency spikes',
          color: '#fde68a',
        },
      ];

      return { lines, stickies };
    },
  },
  {
    id: 'retrospective',
    name: 'Sprint Retrospective',
    description: 'Start, Stop, and Continue team reflection board',
    icon: 'Repeat',
    generate: () => {
      const timestamp = Date.now();
      const lines: LineData[] = [
        {
          id: `line-${timestamp}-r1`,
          tool: 'rect',
          color: '#22c55e',
          strokeWidth: 2,
          points: [120, 100, 440, 700],
        },
        {
          id: `line-${timestamp}-r2`,
          tool: 'rect',
          color: '#ef4444',
          strokeWidth: 2,
          points: [470, 100, 790, 700],
        },
        {
          id: `line-${timestamp}-r3`,
          tool: 'rect',
          color: '#3b82f6',
          strokeWidth: 2,
          points: [820, 100, 1140, 700],
        },
      ];

      const stickies: StickyNote[] = [
        {
          id: `sticky-${timestamp}-start`,
          x: 150,
          y: 130,
          text: '🟢 START DOING\n────────\n• Automated E2E test runs\n• Pair programming sessions',
          color: '#bbf7d0',
        },
        {
          id: `sticky-${timestamp}-stop`,
          x: 500,
          y: 130,
          text: '🔴 STOP DOING\n────────\n• Deploying late on Fridays\n• Skipping standup updates',
          color: '#fecdd3',
        },
        {
          id: `sticky-${timestamp}-continue`,
          x: 850,
          y: 130,
          text: '🔵 CONTINUE DOING\n────────\n• Active whiteboard brain-dumps\n• Fast PR reviews',
          color: '#bae6fd',
        },
      ];

      return { lines, stickies };
    },
  },
  {
    id: 'brainstorming',
    name: 'Brainstorming Hub',
    description: 'Central concept with connected brainstorming clusters',
    icon: 'Lightbulb',
    generate: () => {
      const timestamp = Date.now();
      const lines: LineData[] = [
        {
          id: `line-${timestamp}-c1`,
          tool: 'circle',
          color: '#6366f1',
          strokeWidth: 3,
          points: [600, 380, 700, 380],
        },
        {
          id: `line-${timestamp}-a1`,
          tool: 'arrow',
          color: '#818cf8',
          strokeWidth: 3,
          points: [500, 330, 320, 200],
        },
        {
          id: `line-${timestamp}-a2`,
          tool: 'arrow',
          color: '#818cf8',
          strokeWidth: 3,
          points: [700, 330, 880, 200],
        },
        {
          id: `line-${timestamp}-a3`,
          tool: 'arrow',
          color: '#818cf8',
          strokeWidth: 3,
          points: [500, 430, 320, 560],
        },
        {
          id: `line-${timestamp}-a4`,
          tool: 'arrow',
          color: '#818cf8',
          strokeWidth: 3,
          points: [700, 430, 880, 560],
        },
      ];

      const stickies: StickyNote[] = [
        {
          id: `sticky-${timestamp}-core`,
          x: 540,
          y: 320,
          text: '💡 MAIN IDEA\n────────\nNext Gen Collaboration Platform',
          color: '#e0e7ff',
        },
        {
          id: `sticky-${timestamp}-cl1`,
          x: 180,
          y: 130,
          text: '🎨 UI / UX Innovation\n• Sleek glassmorphism\n• Dark mode support',
          color: '#bae6fd',
        },
        {
          id: `sticky-${timestamp}-cl2`,
          x: 880,
          y: 130,
          text: '⚡ Real-Time Engine\n• Sub-10ms cursor sync\n• Ephemeral laser lines',
          color: '#fef08a',
        },
        {
          id: `sticky-${timestamp}-cl3`,
          x: 180,
          y: 520,
          text: '🔐 Security & Auth\n• Keycloak OpenID\n• Secure session rooms',
          color: '#bbf7d0',
        },
        {
          id: `sticky-${timestamp}-cl4`,
          x: 880,
          y: 520,
          text: '📊 Export & Reporting\n• Vector PDF & PNG\n• WebM session replay',
          color: '#fecdd3',
        },
      ];

      return { lines, stickies };
    },
  },
];
