import { notFound } from 'next/navigation';
import ResumeFlagshipLab from './ResumeFlagshipLab';

export default function ResumeFlagshipLabPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ResumeFlagshipLab />;
}
