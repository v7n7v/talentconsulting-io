/** Every saved resume field remains available when approving a packet revision. */
function fieldLabel(key: string) {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function DocumentValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-3">
        {value.map((entry, index) => <li key={index} className="border-l border-[var(--border-subtle)] pl-3"><DocumentValue value={entry} /></li>)}
      </ul>
    );
  }
  if (typeof value === 'object') {
    return (
      <dl className="space-y-3">
        {Object.entries(value).map(([key, entry]) => {
          if (entry === null || entry === undefined || entry === '' || (Array.isArray(entry) && entry.length === 0)) return null;
          return (
            <div key={key}>
              <dt className="mb-1 font-semibold text-[var(--text-primary)]">{fieldLabel(key)}</dt>
              <dd><DocumentValue value={entry} /></dd>
            </div>
          );
        })}
      </dl>
    );
  }
  return <p className="whitespace-pre-wrap">{typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)}</p>;
}

export default function PacketResumeDocument({ resume }: { resume: unknown }) {
  return (
    <div className="mt-3 min-w-0 break-words text-sm leading-6 text-[var(--text-secondary)] [overflow-wrap:anywhere]">
      <DocumentValue value={resume} />
    </div>
  );
}
