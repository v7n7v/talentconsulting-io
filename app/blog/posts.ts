// Blog post metadata — shared between server and client components
export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  readTime: string;
  date: string;
  color: string;
  icon: string;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'auto-apply-bots-are-ruining-your-job-search',
    title: 'Auto-apply bots and your job search',
    description: 'Why high-volume auto-apply tools can hurt job seekers, overload recruiters, and make thoughtful applications more valuable.',
    category: 'AI & Career',
    readTime: '10 min',
    date: 'April 18, 2026',
    color: 'from-rose-500/10 to-red-500/10 border-rose-500/20',
    icon: 'warning',
  },
  {
    slug: 'how-to-pass-ats-resume-screening-2026',
    title: 'How to Pass ATS Resume Screening in 2026',
    description: 'Learn exactly how Applicant Tracking Systems filter resumes, which keywords matter most, and the formatting rules that make or break your application.',
    category: 'Resume',
    readTime: '8 min',
    date: 'April 15, 2026',
    color: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20',
    icon: 'shield',
  },
  {
    slug: 'ai-resume-writing-will-it-get-rejected',
    title: 'AI-Written Resumes: Will Recruiters Reject Them?',
    description: 'The truth about AI detection in hiring. How recruiters spot AI-generated resumes and how to use AI tools without getting flagged.',
    category: 'AI & Career',
    readTime: '6 min',
    date: 'April 15, 2026',
    color: 'from-amber-500/10 to-orange-500/10 border-amber-500/20',
    icon: 'psychology',
  },
  {
    slug: 'resume-keywords-by-industry-2026',
    title: 'ATS resume keywords by industry',
    description: 'Use natural resume keywords for tech, healthcare, finance, marketing, and engineering without stuffing your skills section.',
    category: 'Resume',
    readTime: '12 min',
    date: 'April 15, 2026',
    color: 'from-blue-500/10 to-indigo-500/10 border-blue-500/20',
    icon: 'key',
  },
  {
    slug: 'ai-interview-prep-star-method',
    title: 'Master the STAR Method with AI Interview Practice',
    description: 'How to structure behavioral interview answers using the STAR framework, with AI-powered practice sessions that grade your responses in real time.',
    category: 'Interview',
    readTime: '7 min',
    date: 'April 15, 2026',
    color: 'from-violet-500/10 to-purple-500/10 border-violet-500/20',
    icon: 'record_voice_over',
  },
  {
    slug: 'cover-letter-that-gets-interviews',
    title: 'Cover letters that get interviews',
    description: 'Write a focused cover letter with a clear opening, proof, and role-specific close instead of a generic template.',
    category: 'Cover Letter',
    readTime: '5 min',
    date: 'April 15, 2026',
    color: 'from-rose-500/10 to-pink-500/10 border-rose-500/20',
    icon: 'mail',
  },
  {
    slug: 'ghost-jobs-how-to-spot-fake-listings',
    title: 'Ghost jobs and fake listings',
    description: 'Learn the warning signs of stale, speculative, and low-intent job posts before you spend time tailoring an application.',
    category: 'AI & Career',
    readTime: '9 min',
    date: 'April 19, 2026',
    color: 'from-amber-500/10 to-yellow-500/10 border-amber-500/20',
    icon: 'visibility_off',
  },
];
