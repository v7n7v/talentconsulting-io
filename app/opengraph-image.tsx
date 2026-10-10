import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'Taco by TalentConsulting — Your next chapter starts with you';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const wordmark = await readFile(join(process.cwd(), 'public/brand/taco/taco-folded-ink.png'));
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', background: '#fffaf5', color: '#191919', display: 'flex', padding: '60px 72px', flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* The same exported artwork as the application wordmark. */}
        <img src={`data:image/png;base64,${wordmark.toString('base64')}`} alt="Taco" width={198} height={48} />
        <span style={{ fontSize: 20, color: '#57524c' }}>by TalentConsulting</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', letterSpacing: '-5px', fontSize: 94, lineHeight: 1.02, fontWeight: 800 }}>
        <span>Your next chapter.</span>
        <span style={{ color: '#d83d19' }}>Starts with you.</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '2px solid #ded9d2', paddingTop: 26 }}>
        <span style={{ fontSize: 25 }}>AI job search, grounded in your experience.</span>
        <span style={{ fontSize: 21, color: '#57524c' }}>talentconsulting.io</span>
      </div>
    </div>,
    size,
  );
}
