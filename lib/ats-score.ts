/**
 * ATS Match Score Engine
 * Analyzes resume text against a job description to produce:
 * - Overall ATS match score (0-100)
 * - Keyword gap analysis (matched, partial, missing)
 * - Category breakdown (hard skills, soft skills, certifications, tools)
 * - Formatting score
 *
 * Runs server-side — no LLM call needed for core scoring.
 */

// ── Types ──

export interface KeywordMatch {
  keyword: string;
  category: 'hard_skill' | 'soft_skill' | 'tool' | 'certification' | 'domain' | 'action_verb';
  status: 'matched' | 'partial' | 'missing';
  resumeContext?: string; // snippet where matched
}

export interface ATSScoreResult {
  overallScore: number;
  breakdown: {
    hardSkillsScore: number;
    softSkillsScore: number;
    toolsScore: number;
    formattingScore: number;
    experienceRelevance: number;
  };
  keywords: KeywordMatch[];
  suggestions: string[];
  stats: {
    totalKeywords: number;
    matched: number;
    partial: number;
    missing: number;
  };
  /** Indicates which category scores had requirements to assess. Numeric scores remain backwards compatible. */
  assessment?: {
    hardSkills: 'assessed' | 'unassessed';
    softSkills: 'assessed' | 'unassessed';
    tools: 'assessed' | 'unassessed';
    experienceRelevance: 'assessed' | 'unassessed';
    overall: 'assessed' | 'unassessed';
  };
}

export function getATSProofScore(result: Pick<ATSScoreResult, 'overallScore' | 'assessment'>): number | null {
  return result.assessment?.overall === 'unassessed' ? null : result.overallScore;
}

// ── Common ATS-Parsed Section Headers ──

const STANDARD_SECTIONS = [
  'experience', 'work experience', 'professional experience', 'employment',
  'education', 'skills', 'technical skills', 'certifications', 'projects',
  'summary', 'professional summary', 'objective', 'awards', 'publications',
];

// ── Soft Skill Dictionary ──

const SOFT_SKILLS = new Set([
  'leadership', 'communication', 'teamwork', 'problem-solving', 'problem solving',
  'critical thinking', 'adaptability', 'time management', 'collaboration',
  'creativity', 'decision-making', 'decision making', 'interpersonal',
  'negotiation', 'conflict resolution', 'mentoring', 'coaching',
  'presentation', 'analytical', 'strategic', 'initiative', 'self-motivated',
  'detail-oriented', 'organized', 'multitasking', 'cross-functional',
]);

// ── Action Verbs (strong resume language) ──

const ACTION_VERBS = new Set([
  'achieved', 'built', 'created', 'delivered', 'designed', 'developed',
  'directed', 'drove', 'established', 'executed', 'generated', 'grew',
  'implemented', 'improved', 'increased', 'launched', 'led', 'managed',
  'optimized', 'reduced', 'resolved', 'scaled', 'shipped', 'streamlined',
  'transformed', 'accelerated', 'automated', 'consolidated', 'coordinated',
]);

// ── Certification Patterns ──

const CERT_PATTERNS = [
  /\b(aws|azure|gcp|google cloud)\s+(certified|certification)\b/i,
  /\b(pmp|prince2|scrum master|csm|psm)\b/i,
  /\b(cissp|cism|cisa|comptia|security\+|network\+)\b/i,
  /\b(cpa|cfa|frm|cfp)\b/i,
  /\bcertified\s+\w+/i,
];

// ── Helpers ──

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\s+#.-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
}

function findContext(text: string, keyword: string): string | undefined {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx === -1) return undefined;

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + keyword.length + 40);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match a keyword as a token/phrase, so Java does not match JavaScript and SQL does not match NoSQL. */
function findStandaloneMatches(text: string, keyword: string): number[] {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(keyword)}(?![A-Za-z0-9])`, 'gi');
  return Array.from(text.matchAll(pattern), match => match.index ?? -1).filter(index => index >= 0);
}

function affirmativeMatchIndex(text: string, keyword: string): number | undefined {
  const matches = findStandaloneMatches(text, keyword);
  return matches.find(index => {
    const sentenceStart = Math.max(
      text.lastIndexOf('.', index), text.lastIndexOf('!', index), text.lastIndexOf('?', index),
      text.lastIndexOf('\n', index), text.lastIndexOf(';', index),
    ) + 1;
    const sentenceEndCandidates = [
      text.indexOf('.', index + keyword.length), text.indexOf('!', index + keyword.length),
      text.indexOf('?', index + keyword.length), text.indexOf('\n', index + keyword.length),
      text.indexOf(';', index + keyword.length),
    ].filter(value => value >= 0);
    const sentenceEnd = sentenceEndCandidates.length ? Math.min(...sentenceEndCandidates) : text.length;
    const sentence = text.slice(sentenceStart, sentenceEnd);
    const before = text.slice(sentenceStart, index);
    const after = text.slice(index + keyword.length, sentenceEnd);
    // A comma followed by "but/however" starts an independent affirmative clause.
    const clauseBefore = /,\s*(?:but|however|yet|although)\b/i.test(before)
      ? before.slice(Math.max(before.lastIndexOf(','), 0) + 1)
      : before;
    if (/\b(?:no|without|not|never|lack(?:s|ing)?|lacks)\b[^.!?;\n]{0,80}$/i.test(clauseBefore)) return false;
    if (/\b(?:learning|studying|training|planned?\s+to|planning\s+to|hoping\s+to|aspiring\s+to)\b[^.!?;\n]{0,60}$/i.test(clauseBefore)) return false;
    if (/^\s*(?::|[-–—])?\s*(?:(?:[A-Za-z]+)\s+){0,3}(?:no|without|not|never|expired|lapsed)\b/i.test(after)) return false;
    if (/\b(?:expired|lapsed)\b[^.!?;\n]{0,30}$/i.test(clauseBefore)) return false;
    return sentence.trim().length > 0;
  });
}

/**
 * This is deliberately conservative lexical evidence, not an NLP qualification claim.
 * A keyword is affirmative only when at least one occurrence is not negated or aspirational.
 */
function hasAffirmativeEvidence(text: string, keyword: string): boolean {
  return affirmativeMatchIndex(text, keyword) !== undefined;
}

function findAffirmativeContext(text: string, keyword: string): string | undefined {
  const index = affirmativeMatchIndex(text, keyword);
  if (index === undefined) return undefined;
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + keyword.length + 40);
  return `${start > 0 ? '...' : ''}${text.slice(start, end).trim()}${end < text.length ? '...' : ''}`;
}

/**
 * Extract meaningful keywords from a job description.
 * Returns an array of keywords categorized by type.
 */
function extractJDKeywords(jd: string): Array<{ keyword: string; category: KeywordMatch['category'] }> {
  const lower = jd.toLowerCase();
  const words = tokenize(jd);
  const results: Array<{ keyword: string; category: KeywordMatch['category'] }> = [];
  const seen = new Set<string>();

  // Extract certification keywords
  for (const pattern of CERT_PATTERNS) {
    const match = jd.match(pattern);
    if (match && !seen.has(match[0].toLowerCase())) {
      seen.add(match[0].toLowerCase());
      results.push({ keyword: match[0], category: 'certification' });
    }
  }

  // Extract multi-word technical terms (2-3 grams that look like skills)
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  const trigrams: string[] = [];
  for (let i = 0; i < words.length - 2; i++) {
    trigrams.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }

  // Common tech patterns
  const techPatterns = [
    /\b(machine learning|deep learning|natural language processing|computer vision)\b/gi,
    /\b(data (science|engineering|analysis|analytics|pipeline))\b/gi,
    /\b(front[\s-]?end|back[\s-]?end|full[\s-]?stack|dev[\s-]?ops)\b/gi,
    /\b(project management|product management|agile|scrum|kanban)\b/gi,
    /\b(ci\s*\/?\s*cd|version control|unit test|test[\s-]?driven)\b/gi,
    /\b(cloud (computing|infrastructure|architecture))\b/gi,
    /\b(user experience|user interface|ux|ui)\b/gi,
    /\b(rest\s*api|graphql|microservices|event[\s-]?driven)\b/gi,
  ];

  for (const pattern of techPatterns) {
    const matches = jd.matchAll(pattern);
    for (const m of matches) {
      const term = m[0].toLowerCase().trim();
      if (!seen.has(term)) {
        seen.add(term);
        results.push({ keyword: m[0].trim(), category: 'hard_skill' });
      }
    }
  }

  // Extract individual technical keywords (programming languages, frameworks, tools)
  const techKeywords = [
    'python', 'javascript', 'typescript', 'java', 'c++', 'c#', 'go', 'rust', 'ruby',
    'swift', 'kotlin', 'scala', 'php', 'r', 'matlab', 'sql', 'nosql', 'html', 'css',
    'react', 'angular', 'vue', 'next.js', 'node.js', 'express', 'django', 'flask',
    'spring', 'rails', 'laravel', 'fastapi', '.net', 'terraform', 'ansible',
    'docker', 'kubernetes', 'k8s', 'jenkins', 'github', 'gitlab', 'bitbucket',
    'aws', 'azure', 'gcp', 'firebase', 'heroku', 'vercel', 'netlify',
    'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb',
    'kafka', 'rabbitmq', 'graphql', 'rest', 'grpc', 'webpack', 'vite',
    'tableau', 'power bi', 'looker', 'snowflake', 'databricks', 'airflow',
    'pytorch', 'tensorflow', 'keras', 'scikit-learn', 'pandas', 'numpy',
    'figma', 'sketch', 'adobe', 'photoshop', 'illustrator', 'jira', 'confluence',
    'salesforce', 'hubspot', 'zendesk', 'slack', 'trello', 'asana', 'notion',
    'linux', 'unix', 'windows', 'macos', 'git', 'svn', 'bash', 'powershell',
  ];

  for (const kw of techKeywords) {
    if (findStandaloneMatches(jd, kw).length > 0 && !seen.has(kw)) {
      seen.add(kw);
      results.push({ keyword: kw, category: 'tool' });
    }
  }

  // Extract soft skills from JD
  for (const skill of SOFT_SKILLS) {
    if (lower.includes(skill) && !seen.has(skill)) {
      seen.add(skill);
      results.push({ keyword: skill, category: 'soft_skill' });
    }
  }

  // Extract domain-specific terms (years of experience patterns)
  const expPatterns = jd.matchAll(/(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience\s+(?:in|with)\s+)?([a-z\s]+?)(?:\.|,|;|$)/gi);
  for (const m of expPatterns) {
    const domain = m[2].trim().toLowerCase();
    if (domain.length > 3 && domain.length < 40 && !seen.has(domain)) {
      seen.add(domain);
      results.push({ keyword: domain, category: 'domain' });
    }
  }

  return results;
}

/**
 * Score resume formatting for ATS compatibility
 */
function scoreFormatting(resumeText: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  // Check for standard section headers
  const lowerResume = resumeText.toLowerCase();
  const foundSections = STANDARD_SECTIONS.filter(s => lowerResume.includes(s));
  if (foundSections.length < 3) {
    score -= 15;
    issues.push('Missing standard section headers (Experience, Education, Skills)');
  }

  // Check for bullet points or structured content
  const bulletCount = (resumeText.match(/[•\-–—]\s/g) || []).length;
  if (bulletCount < 3) {
    score -= 10;
    issues.push('Few bullet points — ATS prefers structured, bulleted content');
  }

  // Check for quantified achievements
  const numberPattern = /\d+[%$kKmMbB]|\$[\d,.]+|\d+\s*(percent|%|users|clients|projects|team)/g;
  const quantified = (resumeText.match(numberPattern) || []).length;
  if (quantified < 2) {
    score -= 10;
    issues.push('Add more quantified achievements (numbers, percentages, dollar amounts)');
  }

  // Check for action verbs
  const words = tokenize(resumeText);
  const actionVerbCount = words.filter(w => ACTION_VERBS.has(w)).length;
  if (actionVerbCount < 3) {
    score -= 10;
    issues.push('Use more action verbs (built, led, grew, shipped, optimized)');
  }

  // Check length
  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
  if (wordCount < 100) {
    score -= 15;
    issues.push('Resume is too short — aim for 300-800 words');
  } else if (wordCount > 1500) {
    score -= 5;
    issues.push('Resume may be too long — consider condensing to 1-2 pages');
  }

  return { score: Math.max(0, score), issues };
}

// ── Main ATS Score Function ──

export function calculateATSScore(resumeText: string, jobDescription: string): ATSScoreResult {
  const jdKeywords = extractJDKeywords(jobDescription);
  const keywords: KeywordMatch[] = [];
  let matched = 0;
  let partial = 0;
  let missing = 0;

  for (const { keyword, category } of jdKeywords) {
    const kwWords = keyword.toLowerCase().split(/\s+/);

    // Exact match
    if (hasAffirmativeEvidence(resumeText, keyword)) {
      matched++;
      keywords.push({
        keyword,
        category,
        status: 'matched',
        resumeContext: findAffirmativeContext(resumeText, keyword),
      });
    }
    // Partial match — at least one word from multi-word keyword exists
    else if (kwWords.length > 1 && kwWords.some(w => w.length > 2 && hasAffirmativeEvidence(resumeText, w))) {
      partial++;
      keywords.push({ keyword, category, status: 'partial' });
    }
    // Missing
    else {
      missing++;
      keywords.push({ keyword, category, status: 'missing' });
    }
  }

  const totalKeywords = jdKeywords.length || 1; // avoid divide-by-zero

  // Category scores
  const byCategory = (cat: KeywordMatch['category']) => {
    const catKws = keywords.filter(k => k.category === cat);
    if (catKws.length === 0) return 70; // legacy numeric fallback; assessment metadata marks this unassessed
    const catMatched = catKws.filter(k => k.status === 'matched').length;
    const catPartial = catKws.filter(k => k.status === 'partial').length;
    return Math.round(((catMatched + catPartial * 0.5) / catKws.length) * 100);
  };

  const hardSkillsScore = byCategory('hard_skill');
  const softSkillsScore = byCategory('soft_skill');
  const toolsScore = byCategory('tool');

  // Formatting
  const formatting = scoreFormatting(resumeText);

  // Experience relevance: blend of domain keywords + cert matches
  const relevanceParts = [
    ...(keywords.some(k => k.category === 'domain') ? [byCategory('domain')] : []),
    ...(keywords.some(k => k.category === 'certification') ? [byCategory('certification')] : []),
  ];
  const experienceRelevance = relevanceParts.length
    ? Math.round(relevanceParts.reduce((sum, score) => sum + score, 0) / relevanceParts.length)
    : 70;

  // Overall score: weighted blend of assessed dimensions only. Keep the numeric
  // fields for API compatibility, while metadata prevents neutral placeholders
  // from affecting the displayed/interpretive score.
  const matchRate = (matched + partial * 0.5) / totalKeywords;
  const assessment = {
    hardSkills: keywords.some(k => k.category === 'hard_skill') ? 'assessed' as const : 'unassessed' as const,
    softSkills: keywords.some(k => k.category === 'soft_skill') ? 'assessed' as const : 'unassessed' as const,
    tools: keywords.some(k => k.category === 'tool') ? 'assessed' as const : 'unassessed' as const,
    experienceRelevance: keywords.some(k => k.category === 'domain' || k.category === 'certification') ? 'assessed' as const : 'unassessed' as const,
    overall: jdKeywords.length > 0 ? 'assessed' as const : 'unassessed' as const,
  };
  const weightedParts = [
    { value: matchRate, weight: 50 },
    { value: formatting.score / 100, weight: 20 },
    ...(assessment.hardSkills === 'assessed' ? [{ value: hardSkillsScore / 100, weight: 15 }] : []),
    ...(assessment.experienceRelevance === 'assessed' ? [{ value: experienceRelevance / 100, weight: 15 }] : []),
  ];
  const weightedTotal = weightedParts.reduce((sum, part) => sum + part.value * part.weight, 0);
  const weightTotal = weightedParts.reduce((sum, part) => sum + part.weight, 0);
  const overallScore = Math.min(98, Math.max(5, Math.round((weightedTotal / weightTotal) * 100)));

  // Generate suggestions
  const suggestions: string[] = [];

  const missingKws = keywords.filter(k => k.status === 'missing');
  if (missingKws.length > 0) {
    const topMissing = missingKws.slice(0, 5).map(k => k.keyword);
    suggestions.push(`Add these missing keywords: ${topMissing.join(', ')}`);
  }

  const partialKws = keywords.filter(k => k.status === 'partial');
  if (partialKws.length > 0) {
    suggestions.push(`Strengthen partial matches: ${partialKws.slice(0, 3).map(k => k.keyword).join(', ')}`);
  }

  suggestions.push(...formatting.issues);

  if (overallScore >= 80) {
    suggestions.unshift('Strong match! Fine-tune the remaining gaps for maximum impact.');
  } else if (overallScore >= 60) {
    suggestions.unshift('Good foundation. Focus on adding the missing hard skills and tools.');
  } else {
    suggestions.unshift('Significant gaps detected. Consider using Resume Morph to tailor your resume.');
  }

  // Sort keywords: missing first, then partial, then matched
  keywords.sort((a, b) => {
    const order = { missing: 0, partial: 1, matched: 2 };
    return order[a.status] - order[b.status];
  });

  return {
    overallScore,
    breakdown: {
      hardSkillsScore,
      softSkillsScore,
      toolsScore,
      formattingScore: formatting.score,
      experienceRelevance,
    },
    keywords,
    suggestions,
    stats: {
      totalKeywords: jdKeywords.length,
      matched,
      partial,
      missing,
    },
    assessment,
  };
}
