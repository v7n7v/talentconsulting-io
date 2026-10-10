import { StructuredEmail } from '../components/StructuredEmail';

export default function AccountDeactivationPreview() {
  return <StructuredEmail content={{
    subject: 'Confirm optional-email pause',
    preheader: 'Use this secure link to pause optional email. Sign-in remains available.',
    category: 'Account',
    title: 'Confirm optional-email pause',
    greeting: 'Hi Jordan,',
    paragraphs: ['A request was made to pause optional product email. This does not disable sign-in or delete your account data.'],
    callout: { tone: 'warning', title: 'Didn’t request this?', body: 'Ignore this email. Your email preferences will not change.' },
    action: { label: 'Pause optional email', url: 'https://talentconsulting.io/account/action?token=preview' },
    footerNote: 'This single-use link expires in 30 minutes.',
  }} />;
}
