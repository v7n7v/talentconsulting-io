'use client';

export type ExperienceDestination = 'experience' | 'resumes';

export function YourExperienceNavigation({ current, onNavigate, onTemplates, templatesActive = false }: {
  current: ExperienceDestination;
  onNavigate: (destination: ExperienceDestination) => void;
  onTemplates?: () => void;
  templatesActive?: boolean;
}) {
  const careerDetailsActive = current === 'experience';
  return <header className="experience-workspace-heading">
    <div><p className="experience-eyebrow">Your career, in your words</p><h1>{careerDetailsActive ? 'Career details' : 'Your resumes'}</h1></div>
    <nav className="experience-destinations" aria-label="Resume workspace">
      <button type="button" aria-current={!careerDetailsActive && !templatesActive ? 'page' : undefined} onClick={() => onNavigate('resumes')}>
        <span className="material-symbols-rounded" aria-hidden="true">description</span>
        <span><strong>My resumes</strong></span>
      </button>
      {onTemplates && <button type="button" aria-current={templatesActive ? 'page' : undefined} onClick={onTemplates}>
        <span className="material-symbols-rounded" aria-hidden="true">dashboard</span>
        <span><strong>Templates</strong></span>
      </button>}
      <button type="button" className="experience-destinations__secondary" aria-current={careerDetailsActive ? 'page' : undefined} onClick={() => onNavigate('experience')}>
        <span><strong>Career details</strong></span>
      </button>
    </nav>
  </header>;
}
