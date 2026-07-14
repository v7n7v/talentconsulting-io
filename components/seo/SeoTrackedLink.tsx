'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type SeoEventName =
  | 'seo_resume_builder_click'
  | 'seo_ats_analyzer_click'
  | 'seo_interview_prep_click'
  | 'seo_template_click'
  | 'seo_signup_click';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

export default function SeoTrackedLink({
  eventName,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, 'onClick'> & {
  eventName: SeoEventName;
  children: ReactNode;
}) {
  return (
    <Link
      {...props}
      onClick={() => {
        window.gtag?.('event', eventName, {
          page_path: window.location.pathname,
          link_url: String(props.href),
        });
      }}
    >
      {children}
    </Link>
  );
}
