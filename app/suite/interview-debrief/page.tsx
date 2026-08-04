import { redirect } from 'next/navigation';

// Legacy standalone route. Debrief logging and review both live in Interview
// Studio now (`debrief_review` mode), so this path only forwards inbound links
// from the suite grid, career recommendations, Pulse, and Sona tool messages.
export default function InterviewDebriefPage() {
  redirect('/suite/interview-sim?mode=debrief_review');
}
