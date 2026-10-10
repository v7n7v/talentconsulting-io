'use client';

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

// ── Help content registry ──
interface HelpStep {
  icon: string;
  title: string;
  description: string;
}

interface ToolHelp {
  title: string;
  subtitle: string;
  steps: HelpStep[];
  tips?: string[];
}

const HELP_CONTENT: Record<string, ToolHelp> = {
  intelligence: {
    title: 'Career Intelligence',
    subtitle: 'Your unified career health dashboard',
    steps: [
      { icon: 'visibility', title: 'Check Your Health Score', description: 'Your overall career health score (0–100) is computed from Activity, Performance, Preparedness, and Wellbeing. Signals you have not generated data for are shown as unmeasured, not as zero. All auto-tracked from your suite usage.' },
      { icon: 'lightbulb', title: 'Follow Smart Recommendations', description: 'AI-generated action items appear ranked by priority. Click any recommendation to jump directly to the relevant tool.' },
      { icon: 'filter_alt', title: 'Read Pipeline Funnel', description: 'See how many applications converted to responses, interviews, and offers. Identify where candidates drop off.' },
      { icon: 'hub', title: 'Audit Your Skills', description: 'Confirmed, in-demand, and gap skills are parsed from your resume and job descriptions you\'ve analyzed.' },
      { icon: 'self_improvement', title: 'Monitor Wellbeing', description: 'Weekly morale tracking and burnout risk are computed from your pulse check-ins.' },
    ],
    tips: [
      'The score reflects your own activity and outcomes. It is not a comparison against other candidates.',
      'Check back weekly to see trends change.',
    ],
  },

  'ats-preview': {
    title: 'ATS Preview Simulator',
    subtitle: 'See your resume through the ATS\'s eyes',
    steps: [
      { icon: 'description', title: 'Upload a Resume First', description: 'Go to Resume Builder and create or upload your resume. ATS Preview pulls from your latest saved version.' },
      { icon: 'touch_app', title: 'Select an ATS System', description: 'Choose Greenhouse, Lever, or Workday. Each has different parsing quirks — test all three.' },
      { icon: 'play_arrow', title: 'Run the Simulation', description: 'Click "Simulate Parse" to see exactly which fields the ATS extracts: name, email, experience, skills, etc.' },
      { icon: 'visibility', title: 'Check Confidence Levels', description: 'Each parsed field shows: ✓ Parsed (green), Partial (amber), Risky (red), or Missing (gray).' },
      { icon: 'bug_report', title: 'Fix Parsing Issues', description: 'Critical issues are listed with specific fixes. Apply them in Resume Builder, then re-test.' },
    ],
    tips: [
      'Always test all 3 ATS systems — each has different rules.',
      'Toggle "Show Raw View" to see the recruiter\'s exact view.',
      'A score above 90 is a strong result in this simulator, not a guarantee across every employer or ATS.',
    ],
  },

  stories: {
    title: 'Story Bank',
    subtitle: 'Your STAR stories for behavioral interviews',
    steps: [
      { icon: 'chat', title: 'Chat with Taco', description: 'Tell Taco about your past achievements and work experiences. She automatically saves them as STAR stories.' },
      { icon: 'add', title: 'Add Stories Manually', description: 'Click "New Story" to write your own. Fill in Situation, Task, Action, and Result for each experience.' },
      { icon: 'psychology', title: 'Use Question Matcher', description: 'Paste a behavioral interview question (e.g. "Tell me about leading a team") and find which stories match.' },
      { icon: 'grid_view', title: 'Check Coverage Map', description: 'See which interview categories (leadership, conflict, etc.) you have stories for — and which are gaps.' },
      { icon: 'sell', title: 'Filter by Tags', description: 'Click any tag to filter stories. Tags come from skills and themes detected in your stories.' },
    ],
    tips: [
      'Coverage is measured across 15 behavioral categories. One strong story per category is the target.',
      'Stories from Taco chats and fit analyses are auto-tagged.',
      'The "Question Matcher" also drafts a sample answer for you.',
    ],
  },

  quality: {
    title: 'Application Quality',
    subtitle: 'Track quality over quantity metrics',
    steps: [
      { icon: 'target', title: 'Check Avg Fit Score', description: 'This is the average score from Taco\'s Fit Gate across all your applications. Higher = better targeting.' },
      { icon: 'filter_alt', title: 'Read the Pipeline Funnel', description: 'See Applied → Interviewing → Offer → Rejected breakdown to understand your conversion rates.' },
      { icon: 'tune', title: 'Tailored vs Generic Ratio', description: 'Shows how many applications used a Taco-tailored resume vs. a generic one.' },
      { icon: 'trending_up', title: 'Track Interview Yield', description: 'What percentage of your applications lead to interviews.' },
      { icon: 'history', title: 'Review Recent Activity', description: 'See your latest applications with their current status at a glance.' },
    ],
    tips: [
      'An Avg Fit Score above 80% means you\'re targeting well.',
      'If Interview Yield is low, try using the Fit Gate before applying.',
    ],
  },

  pulse: {
    title: 'Weekly Pulse',
    subtitle: 'Track your mood and momentum each week',
    steps: [
      { icon: 'edit_note', title: 'Submit a Weekly Check-in', description: 'Rate your morale (1–5), share what went well, what was tough, and your focus for next week.' },
      { icon: 'timeline', title: 'View Mood Trends', description: 'Your morale history is plotted over time so you can see patterns and prevent burnout.' },
      { icon: 'notifications', title: 'Get Burnout Alerts', description: 'Burnout risk shows as high when your latest morale is 2 or below, and moderate when it is 3 or below and trending down. With no check-ins it stays unmeasured.' },
    ],
    tips: [
      'Check in every Sunday or Monday for best tracking.',
      'Honest responses = better burnout detection.',
      'Your pulse data feeds directly into the Career Intelligence health score.',
    ],
  },

  vault: {
    title: 'Skill Bridge Memory',
    subtitle: 'Your saved prep materials and resources',
    steps: [
      { icon: 'search', title: 'Search Memory', description: 'Use the search bar to find flashcards, notes, or any saved material by keyword.' },
      { icon: 'filter_list', title: 'Filter by Category', description: 'Use the category filters to narrow down to specific topics like technical, behavioral, or system design.' },
      { icon: 'bookmark', title: 'Save from Other Tools', description: 'Plans, proofs, flashcards, and interview notes are saved into Skill Bridge Memory.' },
    ],
    tips: [
      'Review Memory before each interview.',
      'Use filters to jump between plans, interview notes, and flashcards.',
      'Materials are organized by category automatically.',
    ],
  },

  'interview-debrief': {
    title: 'Interview Debrief',
    subtitle: 'Log and learn from every interview',
    steps: [
      { icon: 'add', title: 'Log a Debrief', description: 'After each interview, click "New Debrief." Record the company, role, round type, questions asked, and how you felt.' },
      { icon: 'psychology', title: 'Rate Your Confidence', description: 'Rate your confidence (0–100%) per question or overall. This feeds into your interview readiness metrics.' },
      { icon: 'insights', title: 'Track Patterns', description: 'Over time, see which question categories you\'re strong/weak in. This guides your prep focus.' },
      { icon: 'lightbulb', title: 'Review Past Debriefs', description: 'Click any debrief card to expand the full details. Look for patterns in what went well vs. what didn\'t.' },
    ],
    tips: [
      'Log debriefs within 24 hours while memory is fresh.',
      'Be honest about confidence — it makes intelligence more accurate.',
      'Your debrief data powers the Intelligence page\'s interview readiness section.',
    ],
  },

  'cover-letter': {
    title: 'Cover Letter Studio',
    subtitle: 'AI-generated cover letters tailored to each job',
    steps: [
      { icon: 'description', title: 'Paste the Job Description', description: 'Copy the full job posting into the input field. The more detail, the better the output.' },
      { icon: 'auto_awesome', title: 'Generate Your Letter', description: 'Click generate. The AI crafts a tailored cover letter matching your resume to the job requirements.' },
      { icon: 'edit', title: 'Edit and Customize', description: 'Review the draft and make it yours. Adjust tone, add personal anecdotes, or remove sections.' },
      { icon: 'content_copy', title: 'Copy and Use', description: 'Copy the final version to your clipboard and paste it into the application form.' },
    ],
    tips: [
      'Always include the full JD — partial descriptions produce generic letters.',
      'The AI uses your resume data for personalization, so keep your resume updated.',
      'Edit the opening line to make it sound like you, not AI.',
    ],
  },

  linkedin: {
    title: 'LinkedIn Optimizer',
    subtitle: 'Optimize your LinkedIn profile for recruiters',
    steps: [
      { icon: 'person', title: 'Paste Your Current Profile', description: 'Copy your LinkedIn headline, summary, or experience sections into the input field.' },
      { icon: 'auto_awesome', title: 'Get Optimization Suggestions', description: 'The AI analyzes your profile against recruiter search patterns and suggests improvements.' },
      { icon: 'edit', title: 'Apply Changes', description: 'Review each suggestion and update your LinkedIn profile accordingly.' },
      { icon: 'search', title: 'Keyword Optimization', description: 'The tool identifies missing keywords that recruiters in your field commonly search for.' },
    ],
    tips: [
      'Focus on your headline first — it\'s what recruiters see in search results.',
      'Use industry-specific keywords naturally, don\'t stuff them.',
    ],
  },

  negotiate: {
    title: 'Offer Coach',
    subtitle: 'Offer negotiation now lives inside Applications',
    steps: [
      { icon: 'work', title: 'Open Applications', description: 'Select the application that moved to offer stage.' },
      { icon: 'payments', title: 'Capture Offer Details', description: 'Add base, total compensation, equity, bonus, deadline, and context in the application drawer.' },
      { icon: 'psychology', title: 'Generate a Brief', description: 'Taco prepares the counter strategy, leverage points, scripts, and non-salary asks.' },
      { icon: 'fact_check', title: 'Record the Decision', description: 'Track whether the counter was sent, accepted, or declined.' },
    ],
    tips: [
      'Offer Coach appears when an application reaches Offer stage.',
      'Total compensation matters more than base salary alone.',
      'Taco drafts language, but you stay in control of every message.',
    ],
  },

  'jd-generator': {
    title: 'JD Analyzer',
    subtitle: 'Deep-parse any job description',
    steps: [
      { icon: 'content_paste', title: 'Paste the Job Description', description: 'Copy the full JD text from any job posting and paste it into the input area.' },
      { icon: 'auto_awesome', title: 'Analyze', description: 'The AI extracts key requirements, skills, experience levels, and red/green flags from the JD.' },
      { icon: 'checklist', title: 'Review the Breakdown', description: 'See must-have vs. nice-to-have skills, salary signals, company culture indicators, and role expectations.' },
      { icon: 'compare', title: 'Match Against Your Profile', description: 'The tool compares JD requirements against your resume to show fit percentage and gaps.' },
    ],
    tips: [
      'Analyze the JD before applying to decide if it\'s worth your time.',
      'Pay attention to red flags — unrealistic requirements often signal bad management.',
      'Use identified skill gaps to focus your study/upskilling.',
    ],
  },

  flashcards: {
    title: 'Flashcards',
    subtitle: 'AI-generated study cards for interview prep',
    steps: [
      { icon: 'auto_awesome', title: 'Generate Cards', description: 'Enter a topic (e.g., "React hooks", "System design") and the AI creates targeted flashcards.' },
      { icon: 'upload', title: 'Use Your Resume', description: 'Upload your resume to generate cards specifically about your tech stack and experience.' },
      { icon: 'style', title: 'Study the Cards', description: 'Flip through cards one at a time. The front shows a question, the back shows the answer.' },
      { icon: 'bookmark', title: 'Save to Memory', description: 'Save useful card sets to Skill Bridge Memory for quick review before interviews.' },
    ],
    tips: [
      'Generate cards for each company\'s tech stack before interviewing.',
      'Review cards the night before and morning of your interview.',
      'Mix technical and behavioral cards for well-rounded prep.',
    ],
  },

  'market-oracle': {
    title: 'Market Oracle',
    subtitle: 'Real-time job market intelligence',
    steps: [
      { icon: 'upload', title: 'Upload Your Resume', description: 'Upload or paste your resume so Market Oracle can personalize insights to your skills and experience.' },
      { icon: 'analytics', title: 'View Market Analysis', description: 'See demand trends for your skills, salary ranges, hot companies hiring, and market momentum.' },
      { icon: 'trending_up', title: 'Track Skill Demand', description: 'See which of your skills are trending up/down in the job market and which to invest in.' },
      { icon: 'lightbulb', title: 'Get Recommendations', description: 'Receive personalized suggestions on skills to add, roles to target, and timing advice.' },
    ],
    tips: [
      'Re-run analysis monthly — the market shifts fast.',
      'Skills trending upward are your best leverage in negotiations.',
      'Cross-reference with JD Analyzer for the most accurate signals.',
    ],
  },

  'writing-tools': {
    title: 'Writing Tools',
    subtitle: 'AI writing analysis and improvement',
    steps: [
      { icon: 'edit_note', title: 'Paste Your Text', description: 'Enter any career document — resume summary, cover letter, LinkedIn post, or email to a recruiter.' },
      { icon: 'psychology', title: 'Run AI Detection', description: 'Check if your writing might be flagged as AI-generated. See a human-score percentage.' },
      { icon: 'auto_fix_high', title: 'Humanize Your Writing', description: 'The tool rewrites flagged sections to sound more natural while keeping your message.' },
      { icon: 'spellcheck', title: 'Check Uniqueness', description: 'Run a plagiarism/uniqueness check to make sure your content is original.' },
    ],
    tips: [
      'Always humanize AI-generated content before submitting applications.',
      'Small edits to tone and word choice make the biggest difference.',
    ],
  },

  'job-search': {
    title: 'AI Job Search',
    subtitle: 'Find matching roles instantly',
    steps: [
      { icon: 'tune', title: 'Set Preferences', description: 'Configure your desired role, location, salary range, and work style (remote, hybrid, onsite).' },
      { icon: 'search', title: 'Search Jobs', description: 'Enter keywords or use your profile for AI-matched results. The AI ranks jobs by fit to your resume.' },
      { icon: 'bookmark', title: 'Save Interesting Jobs', description: 'Bookmark roles you like. Saved jobs appear in your weekly picks and feed into intelligence.' },
      { icon: 'send', title: 'Apply Directly', description: 'Click "Apply" to open the company\'s application page. Use Taco\'s Fit Gate for tailored applications.' },
    ],
    tips: [
      'Update your preferences regularly as your search focus evolves.',
      'Use the AI match score to prioritize applications.',
    ],
  },

  resume: {
    title: 'Resume Builder',
    subtitle: 'Build, morph, and optimize your resume',
    steps: [
      { icon: 'upload', title: 'Upload or Build', description: 'Upload an existing resume (PDF), or build one from scratch using the structured editor.' },
      { icon: 'edit', title: 'Edit Sections', description: 'Update your experience, education, skills, and summary. The editor auto-formats everything.' },
      { icon: 'auto_awesome', title: 'Morph for a Job', description: 'Paste a JD and click "Morph" — the AI tailors your resume to match the job\'s requirements.' },
      { icon: 'download', title: 'Export as PDF', description: 'Download a selectable-text PDF, or use the linear Word companion for conservative parsing workflows.' },
    ],
    tips: [
      'Keep your master resume comprehensive — morph it per job.',
      'Always test your morphed resume in ATS Preview.',
      'Update skills and achievements after every project or role change.',
    ],
  },

  'skill-bridge': {
    title: 'Skill Bridge',
    subtitle: 'Close gaps, prove skills, and prepare for interviews',
    steps: [
      { icon: 'priority_high', title: 'Start With Today', description: 'Use the command strip to find review-due skills, proof-ready gaps, active bridges, and application-linked gaps.' },
      { icon: 'route', title: 'Build The Bridge', description: 'Generate focused study plans from resume gaps, job descriptions, applications, or manual skill targets.' },
      { icon: 'verified', title: 'Climb The Proof Ladder', description: 'Use quick checks, applied challenges, and Interview Studio drills to prove what you can explain honestly.' },
      { icon: 'inventory_2', title: 'Review Memory', description: 'Use Skill Bridge Memory to revisit plans, proof summaries, interview notes, flashcards, and resume-linked prep.' },
    ],
    tips: [
      'Verify fewer skills deeply instead of collecting shallow course completions.',
      'Use applied challenges for skills you plan to mention on your resume or in interviews.',
      'Ask Taco for coaching, but let Skill Bridge proof attempts decide readiness.',
    ],
  },

  network: {
    title: 'Network CRM',
    subtitle: 'Plan follow-ups and keep relationship context close',
    steps: [
      { icon: 'priority_high', title: 'Start With Today', description: 'Use the command strip to find due follow-ups, dormant contacts, referrals, and contacts tied to active applications.' },
      { icon: 'person_add', title: 'Add the Context', description: 'Save recruiters, hiring managers, referrals, and peers with company, role, contact info, notes, and an optional linked application.' },
      { icon: 'add_comment', title: 'Log Each Touch', description: 'Record emails, calls, meetings, LinkedIn messages, referrals, and notes. Add the next follow-up date while the context is fresh.' },
      { icon: 'auto_awesome', title: 'Ask Taco', description: 'Open Taco from the command strip, cards, or drawer to draft a message or decide the best next move. Nothing is sent automatically.' },
    ],
    tips: [
      'A short note after every conversation is more useful than a perfect contact record.',
      'Link contacts to applications when they can influence a specific opportunity.',
      'Review the Needs Attention lane before sending new outreach.',
    ],
  },

  analytics: {
    title: 'Analytics Dashboard',
    subtitle: 'Track your job search metrics',
    steps: [
      { icon: 'bar_chart', title: 'View Overview Stats', description: 'See total applications, response rates, interviews scheduled, and offers at a glance.' },
      { icon: 'timeline', title: 'Track Trends', description: 'View weekly application volume, response rates over time, and conversion funnel trends.' },
      { icon: 'pie_chart', title: 'Status Breakdown', description: 'See how your applications are distributed across Applied, Interviewing, Offer, and Rejected.' },
    ],
    tips: [
      'Check analytics weekly to spot trends early.',
      'A declining response rate means your targeting needs adjustment.',
      'Celebrate wins — even small conversion improvements matter.',
    ],
  },

  gallery: {
    title: 'Writing Toolkit',
    subtitle: 'Polish, communicate, and research from one writing workbench',
    steps: [
      { icon: 'auto_fix_high', title: 'Choose a Lane', description: 'Use Polish for editing, Communicate for emails, or Research for summaries and citations.' },
      { icon: 'edit_note', title: 'Paste Context', description: 'Add your draft, notes, source information, or message goal into the editor.' },
      { icon: 'task_alt', title: 'Review and Copy', description: 'Check the structured output, copy what you need, and move it into your resume or application workflow.' },
    ],
    tips: [
      'Use Email Composer for recruiter follow-ups, referrals, and thank-you notes.',
      'Use AI Humanizer for deep trust checks. Use this toolkit for fast utility work.',
      'Citations are a drafting aid. Cross-check important academic references before submission.',
    ],
  },

  agent: {
    title: 'Taco — AI Career Agent',
    subtitle: 'Your personal career strategist',
    steps: [
      { icon: 'chat', title: 'Start a Conversation', description: 'Type anything career-related. Taco can help with resume advice, interview prep, job strategy, and more.' },
      { icon: 'auto_awesome', title: 'Use Taco\'s Tools', description: 'Taco can run fit analyses, morph resumes, find jobs, generate cover letters — all from the chat.' },
      { icon: 'auto_stories', title: 'Share Achievements', description: 'Tell Taco about your work wins. She automatically saves them as STAR stories for interview prep.' },
      { icon: 'psychology', title: 'Get Strategic Advice', description: 'Ask about negotiation tactics, career pivots, networking strategies, or what to focus on next.' },
    ],
    tips: [
      'Be specific: "Help me prep for a Google PM interview" > "Help me with interviews"',
      'Taco remembers your resume and preferences across conversations.',
      'Ask Taco to run a "fit analysis" on any job description.',
    ],
  },

  applications: {
    title: 'Applications Command Center',
    subtitle: 'Track applications, follow-ups, interviews, and offers',
    steps: [
      { icon: 'bolt', title: 'Start with Today', description: 'Use the command strip to find follow-ups, interview prep, drafts, and offers that need review.' },
      { icon: 'edit', title: 'Update Status', description: 'Move each application from draft to applied, interviews, offer, accepted, rejected, or withdrawn.' },
      { icon: 'payments', title: 'Review Offers', description: 'When an application reaches Offer stage, capture compensation details and generate a negotiation brief.' },
      { icon: 'psychology', title: 'Use Taco', description: 'Ask Taco for follow-ups, interview prep, offer language, or the next best action.' },
    ],
    tips: [
      'Log outcomes promptly so Career Intelligence stays accurate.',
      'Use notes for recruiter names, deadlines, and follow-up context.',
      'Offer Coach only appears when it is relevant, keeping the page clean.',
    ],
  },

  feedback: {
    title: 'Feedback',
    subtitle: 'Help shape the future of TalentConsulting.io',
    steps: [
      { icon: 'sentiment_satisfied', title: 'Rate Your Mood', description: 'Select how you\'re feeling about the platform. This helps us understand overall satisfaction trends.' },
      { icon: 'category', title: 'Choose a Category', description: 'Pick the area your feedback relates to — feature request, bug report, UX improvement, or general.' },
      { icon: 'edit_note', title: 'Write Your Feedback', description: 'Describe your experience, suggestion, or issue in detail. The more specific, the more actionable.' },
      { icon: 'send', title: 'Submit', description: 'Your feedback is sent directly to the product team. Every submission is reviewed.' },
    ],
    tips: [
      'Be specific — "The morph button on mobile is too small" > "Mobile is hard to use."',
      'Feature requests with use-cases get prioritized faster.',
      'You can submit as often as you like — no limits.',
    ],
  },

  'interview-sim': {
    title: 'Interview Studio',
    subtitle: 'Practice, whiteboard, and debrief with Taco',
    steps: [
      { icon: 'tune', title: 'Set Context', description: 'Choose an application, resume, pasted JD, persona, interview type, intensity, and duration.' },
      { icon: 'graphic_eq', title: 'Practice With Taco', description: 'Use Quick Drill, Full Mock, Live Interview with Taco, Avatar Live, or the structured technical whiteboard.' },
      { icon: 'auto_stories', title: 'Use Your Memory', description: 'Taco surfaces relevant Story Bank examples, JD keywords, and session goals while you practice.' },
      { icon: 'analytics', title: 'Review Debrief', description: 'Completed sessions save a transcript, score, rubric, delivery telemetry, weak spots, and next drills.' },
    ],
    tips: [
      'Use headphones for voice sessions to reduce echo.',
      'For behavioral answers, include situation, task, action, and result.',
      'Use the whiteboard to narrate assumptions, trade-offs, and validation.',
    ],
  },

  'agent-queue': {
    title: 'Agent Queue',
    subtitle: 'Taco-prepared application packets for review',
    steps: [
      { icon: 'auto_awesome', title: 'Taco Scouts', description: 'Taco uses your job preferences to find roles, score fit, and build a short review queue.' },
      { icon: 'inventory_2', title: 'Review Packets', description: 'Each packet can include fit signals, risk checks, a tailored resume, a cover letter draft, and a next action.' },
      { icon: 'psychology', title: 'Teach Taco', description: 'Use feedback tags like "More like this" or "Salary too low" so future runs become sharper.' },
      { icon: 'open_in_new', title: 'Stay In Control', description: 'Approved packets open the posting and add a tracker entry. Taco does not submit applications or send external emails for you.' },
    ],
    tips: [
      'Turn on the Taco digest only if you want structured review emails.',
      'Items may expire after 7 days, so review high-fit packets first.',
      'Ask Taco to explain a packet, improve a cover letter, or prioritize the queue.',
    ],
  },
};

// Keep modal effects mounted through AnimatePresence's exit animation. Route changes
// remove the keyed presence boundary immediately, so its locks cannot follow a route.
function HelpDialog({ help, onClose, triggerRef, headingId, titleId, subtitleId }: {
  help: ToolHelp;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  headingId: string;
  titleId: string;
  subtitleId: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;

    const returnTarget = triggerRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The drawer owns body overflow. Lock the document scroller separately so
    // closing either overlay cannot restore the other overlay's stale body lock.
    const scroller = document.documentElement;
    const previousOverflow = scroller.style.overflow;
    scroller.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });

    const backgroundInert = new Map<HTMLElement, string | null>();
    const blockBackground = () => {
      for (const child of Array.from(document.body.children)) {
        if (!(child instanceof HTMLElement) || child === overlay || backgroundInert.has(child)) continue;
        backgroundInert.set(child, child.getAttribute('inert'));
        child.inert = true;
      }
    };
    blockBackground();
    const observer = new MutationObserver(blockBackground);
    observer.observe(document.body, { childList: true });

    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter(element => !element.closest('[inert]') && element.getClientRects().length > 0
        && getComputedStyle(element).visibility !== 'hidden');
    const focusInside = () => (getFocusable()[0] || dialog).focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      event.stopPropagation();
      const focusable = getFocusable();
      if (!focusable.length) {
        dialog.focus({ preventScroll: true });
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
      focusable[nextIndex].focus({ preventScroll: true });
    };
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusInside();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocus, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocus, true);
      for (const [element, previousInert] of backgroundInert) {
        if (previousInert === null) element.removeAttribute('inert');
        else element.setAttribute('inert', previousInert);
      }
      scroller.style.overflow = previousOverflow;
      const canReceiveFocus = (element: HTMLElement | null | undefined): element is HTMLElement => {
        if (!element?.isConnected || element.closest('[inert], [aria-hidden="true"]')) return false;
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0
          && bounds.bottom > 0 && bounds.right > 0
          && bounds.top < window.innerHeight && bounds.left < window.innerWidth
          && getComputedStyle(element).visibility !== 'hidden';
      };
      // SuiteToolHeader mounts separate desktop/mobile controls. A resize can
      // hide the opener while its equivalent control becomes visible.
      const correspondingTrigger = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]'))
        .find(element => element.getAttribute('aria-label') === returnTarget?.getAttribute('aria-label')
          && canReceiveFocus(element));
      const target = [returnTarget, correspondingTrigger, previousFocus].find(canReceiveFocus);
      target?.focus({ preventScroll: true });
    };
  }, [onClose, triggerRef]);

  return (
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[999] flex justify-end overflow-hidden p-4"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[color:var(--modal-backdrop)]"
        onClick={onClose}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${headingId} ${titleId}`}
        aria-describedby={subtitleId}
        tabIndex={-1}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="pointer-events-auto relative flex h-full min-w-0 w-full max-w-md flex-col overflow-hidden rounded-2xl"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Header */}
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 p-4 sm:px-6"
          style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="icon-shell-neutral flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border">
              <span className="material-symbols-rounded text-lg" aria-hidden="true">menu_book</span>
            </div>
            <div className="min-w-0">
              <h2 id={headingId} className="text-base font-bold text-[var(--text-primary)]">How to Use</h2>
              <p id={titleId} className="text-xs text-[var(--text-tertiary)]">{help.title}</p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={`Close help for ${help.title}`}
            className="flex h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[color:var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <span className="material-symbols-rounded text-[20px] text-[var(--text-tertiary)]" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Content */}
        <div
          role="region"
          aria-label={`Help instructions for ${help.title}`}
          tabIndex={0}
          className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:p-6"
        >
          {/* Intro */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <p id={subtitleId} className="text-sm text-[var(--text-secondary)] leading-relaxed">{help.subtitle}</p>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
              <span className="material-symbols-rounded icon-neutral text-sm">format_list_numbered</span>
              Step by Step
            </h3>
            {help.steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className="flex gap-3 p-3.5 rounded-xl"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="icon-shell-neutral w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-[var(--text-secondary)]">{i + 1}</span>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex min-w-0 items-center gap-1.5">
                    <span className="material-symbols-rounded shrink-0 text-sm text-[var(--text-secondary)]" aria-hidden="true">{step.icon}</span>
                    <p className="min-w-0 text-sm font-semibold text-[var(--text-primary)]">{step.title}</p>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Tips */}
          {help.tips && help.tips.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
                <span className="material-symbols-rounded icon-neutral text-sm">tips_and_updates</span>
                Pro Tips
              </h3>
              <div className="rounded-xl p-4 space-y-2.5" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)' }}>
                {help.tips.map((tip, i) => (
                  <div key={i} className="flex min-w-0 items-start gap-2">
                    <span className="material-symbols-rounded icon-neutral text-[14px] mt-0.5 flex-shrink-0">lightbulb</span>
                    <p className="min-w-0 text-xs text-[var(--text-secondary)] leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Keyed by the route and tool, so navigation discards open state and its portal.
function HelpControl({ help }: { help: ToolHelp }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`How to use ${help.title}`}
        aria-haspopup="dialog"
        className="flex h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-[color:var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        title={`How to use ${help.title}`}
      >
        <span className="material-symbols-rounded text-[18px] text-[var(--text-tertiary)]" aria-hidden="true">help</span>
      </button>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <HelpDialog
              key="help-dialog"
              help={help}
              onClose={close}
              triggerRef={triggerRef}
              headingId={`${id}-heading`}
              titleId={`${id}-title`}
              subtitleId={`${id}-subtitle`}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

// ── Component ──
export default function PageHelp({ toolId }: { toolId: string }) {
  const pathname = usePathname();
  const help = HELP_CONTENT[toolId];
  if (!help) return null;
  return <HelpControl key={`${pathname}:${toolId}`} help={help} />;
}
