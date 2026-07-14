import type { CanonicalResume } from '@/lib/resume-normalizer';

export const LONG_HEADER_RESUME_FIXTURE: CanonicalResume = {
  name: 'Alula Gebreegziabher',
  title: 'Cybersecurity Graduate / Wireless Engineer',
  email: 'alula2006@gmail.com',
  phone: '+1 646-618-4296',
  location: 'New York, NY',
  linkedin: '',
  website: '',
  summary: 'Entry-level cybersecurity candidate with wireless engineering experience and hands-on security lab practice.',
  experience: [
    {
      company: 'Signal Lab',
      role: 'Wireless Security Analyst',
      duration: '2024 - Present',
      achievements: ['Assessed wireless network configurations and documented remediation steps for common access control gaps.'],
    },
  ],
  education: [
    {
      degree: 'Bachelor of Science, Cybersecurity and Information Assurance',
      institution: 'Example University',
      year: '2022',
      details: 'Cum Laude',
    },
  ],
  skills: [
    {
      category: 'Security',
      items: ['Wireless security', 'Network analysis', 'Risk documentation'],
    },
  ],
  certifications: [],
};
