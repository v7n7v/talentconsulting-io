'use client';

import { useToolGuidanceHelp } from '@/components/guidance/ToolGuidanceProvider';

/** A single trigger; the route provider owns contextual guidance and overview. */
export default function PageHelp({ toolId }: { toolId: string }) {
  const help = useToolGuidanceHelp(toolId);
  if (!help.available) return null;
  return (
    <button
      type="button"
      data-tool-help={toolId}
      className="btn-secondary btn-icon"
      aria-label={`How to use ${help.title || 'this tool'}`}
      aria-expanded={Boolean(help.isOpen)}
      aria-controls={help.isOpen ? help.panelId : undefined}
      title={`How to use ${help.title || 'this tool'}`}
      onClick={event => help.open(event.currentTarget)}
    >
      <span className="material-symbols-rounded text-lg" aria-hidden="true">help</span>
    </button>
  );
}
