import { redirect } from 'next/navigation';

export default function FlashcardsRedirectPage() {
  redirect('/suite/interview-sim?mode=study_cards');
}
