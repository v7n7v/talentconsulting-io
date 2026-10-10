'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Scale a fixed paper measure without changing document typography or creating fictitious page boundaries. */
export function ResumeDesignPaper({ pageSize, children }: { pageSize:'A4'|'LETTER'; children:ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const width = pageSize === 'LETTER' ? 816 : 794;
  const [measure, setMeasure] = useState({scale:1,height:1123});
  useEffect(() => {
    const host = frame.current, paper = content.current;
    if (!host || !paper) return;
    const update = () => {
      const scale = Math.min(1, host.clientWidth / width);
      const height = paper.scrollHeight * scale;
      setMeasure(old => Math.abs(old.scale - scale) < .001 && Math.abs(old.height - height) < 1 ? old : { scale,height });
    };
    update(); const observer = new ResizeObserver(update); observer.observe(host); observer.observe(paper);
    return () => observer.disconnect();
  }, [width]);
  // Individual scale is structural paper fitting; the shared theme deliberately
  // removes decorative inline transform:scale effects from other surfaces.
  return <div ref={frame} style={{width:'100%',minWidth:0,height:measure.height,position:'relative',overflow:'hidden'}}><div ref={content} style={{width,scale:measure.scale,transformOrigin:'top left'}}>{children}</div></div>;
}
