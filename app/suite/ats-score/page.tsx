import { redirect } from 'next/navigation';

export default function ATSScoreRedirect() {
  redirect('/suite/ats-analyzer?tab=score');
}
