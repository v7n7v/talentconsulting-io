import type { ReactNode } from 'react';
import { parseSonaMessage, type SonaMessageBlock } from '@/lib/sona/chat-ui-formatting';

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderBlock(block: SonaMessageBlock, index: number): ReactNode {
  if (block.type === 'heading') {
    return (
      <p key={`heading-${index}`} className="pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {renderInline(block.text)}
      </p>
    );
  }

  if (block.type === 'list') {
    const List = block.ordered ? 'ol' : 'ul';
    return (
      <List
        key={`list-${index}`}
        className={`space-y-1.5 pl-5 text-sm leading-relaxed marker:text-[var(--text-muted)] ${block.ordered ? 'list-decimal' : 'list-disc'}`}
      >
        {block.items.map((item, itemIndex) => (
          <li key={`${index}-${itemIndex}`}>{renderInline(item)}</li>
        ))}
      </List>
    );
  }

  return (
    <p key={`paragraph-${index}`} className="text-sm leading-relaxed">
      {renderInline(block.text)}
    </p>
  );
}

export function SonaMessageContent({ text }: { text: string }) {
  const blocks = parseSonaMessage(text);

  return (
    <div className="min-w-0 space-y-2.5 break-words [overflow-wrap:anywhere]">
      {blocks.map(renderBlock)}
    </div>
  );
}
