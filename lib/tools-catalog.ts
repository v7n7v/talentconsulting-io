/**
 * The public tools, in one place.
 *
 * This exists because `/tools` did not, and 22 tool names on the landing rail
 * fell back to it: `TOOL_HREF[name] ?? '/tools'` in components/landing/TalentLanding.tsx.
 * Sixteen names have no entry, and ToolRail renders each list twice for the
 * marquee wrap, so that fallback produced roughly 33 anchors to a route with no
 * page. Anything listing tools reads this array so the set cannot drift again.
 *
 * Only routes that actually exist belong here. A tool that is real inside the
 * product but has no public page is not a public tool.
 */
export type PublicTool = {
  name: string;
  href: string;
  /** One line, present tense, describing what it does - not what it promises. */
  summary: string;
  /** Material Symbols name. */
  icon: string;
};

export const PUBLIC_TOOLS: PublicTool[] = [
  {
    name: 'Resume Builder',
    href: '/tools/resume-builder',
    summary: 'Build an ATS-friendly resume with writing help, templates and keyword guidance.',
    icon: 'description',
  },
  {
    name: 'ATS Analyzer',
    href: '/tools/ats-analyzer',
    summary: 'Check a resume against a job description for keyword gaps and formatting risk.',
    icon: 'analytics',
  },
  {
    name: 'Interview Prep',
    href: '/tools/interview-prep',
    summary: 'Practise with mock sessions, STAR coaching and role-specific questions.',
    icon: 'record_voice_over',
  },
  {
    name: 'AI Humanizer',
    href: '/tools/ai-humanizer',
    summary: 'Return an AI-assisted draft to your own voice, with the facts unchanged.',
    icon: 'auto_fix_high',
  },
  {
    name: 'AI Detector',
    href: '/tools/ai-detector',
    summary: 'Review originality and readability signals before a recruiter reads it.',
    icon: 'fact_check',
  },
];
