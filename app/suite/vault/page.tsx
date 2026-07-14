import { redirect } from 'next/navigation';

export default function StudyVaultRedirectPage() {
  redirect('/suite/skill-bridge?view=memory');
}

