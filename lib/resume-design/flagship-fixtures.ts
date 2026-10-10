import { RESUME_TEMPLATE_FIXTURES } from '@/lib/resume-templates/fixtures';
import type { CanonicalResume } from '@/lib/resume-normalizer';

/** Fictional, public-development examples; never read account data. */
export const FLAGSHIP_FIXTURES: Record<string, CanonicalResume> = {
  full: RESUME_TEMPLATE_FIXTURES.full,
  sparse: RESUME_TEMPLATE_FIXTURES.sparse,
  long: RESUME_TEMPLATE_FIXTURES.long,
  graduate: {
    name:'Amina Rivera', title:'Software Engineer', email:'amina@example.invalid', phone:'', location:'Boston, MA',
    summary:'Computer science graduate building accessible, dependable software. Comfortable investigating ambiguous problems and explaining technical tradeoffs.',
    experience:[{id:'intern',company:'Civic Systems',role:'Software Engineering Intern',duration:'June–August 2026',achievements:['Built an accessible search interface with keyboard navigation and automated regression checks.','Reduced redundant API calls by 28% through caching and request cancellation.']}],
    education:[{id:'degree',degree:'BSc Computer Science',institution:'Example University',year:'2026',details:'Capstone: reliable public transit data. Teaching assistant for data structures.'}],
    skills:[{id:'engineering',category:'Engineering',items:['TypeScript','React','PostgreSQL','Python','Accessibility']}],certifications:[],
    additionalSections:[{id:'projects',title:'Selected projects',items:['Transit Atlas — designed a resilient route planner with live disruption recovery.','Open Library — contributed keyboard fixes and documented the component testing workflow.']}],
  },
  academic: {
    ...RESUME_TEMPLATE_FIXTURES.long,
    title:'Researcher in Health Systems & Implementation Science',
    additionalSections:[{id:'publications',title:'Selected publications',items:Array.from({length:24},(_,i)=>`PUBLICATION${i + 1}MARKER Okafor-Rodríguez, A. et al. Evidence, equity and learning in health system design: study ${i + 1}. Journal of Example Research, 2026.`)}, {id:'teaching',title:'Teaching & service',items:['Designed a postgraduate course in implementation science.','Chaired the faculty research quality committee.']}],
  },
  stress: {
    name:'NarayanaVenkatasubramanianRamakrishnan',title:'Principal Engineer, Infrastructure and Distributed Systems',email:'resume@example.invalid',phone:'',location:'Remote',
    website:`https://portfolio.example.invalid/${'unbrokensegment'.repeat(14)}`,
    summary:'Builds dependable systems and documents operational tradeoffs.',
    experience:[{id:'oversized',company:'International Collaborative Infrastructure Research & Delivery Group',role:'Principal Engineer for Reliability, Platform Architecture and Developer Productivity',duration:'January 2018 – October 2026',achievements:Array.from({length:32},(_,i)=>`ACHIEVEMENT${i + 1}MARKER investigated an operational failure, documented its source and implemented an evidence-led improvement across collaborating teams.`)}],
    education:[{id:'partial',degree:'',institution:'Example University',year:'EDUCATION2026MARKER',details:'Independent research in platform reliability.'}],
    skills:[],certifications:[],additionalSections:[{id:'longheading',title:'Selected research, community contributions and professional service across international collaborations',items:['ADDITIONALMARKER Maintained a public reliability handbook.']}],
  },
};
