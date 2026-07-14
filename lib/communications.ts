import { getAdminDb } from '@/lib/firebase-admin';

export interface UserCommunicationInput {
  uid?: string | null;
  email?: string | null;
  subject: string;
  bodyPreview: string;
  template: string;
  status?: string;
  sentBy: string;
  type?: string;
  direction?: 'inbound' | 'outbound';
  metadata?: Record<string, unknown>;
}

function previewText(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

export async function logUserCommunication(input: UserCommunicationInput) {
  const record = {
    type: input.type || 'notification_email',
    direction: input.direction || 'outbound',
    uid: input.uid || null,
    email: input.email?.toLowerCase() || null,
    subject: input.subject,
    bodyPreview: previewText(input.bodyPreview),
    status: input.status || 'sent',
    template: input.template,
    sentBy: input.sentBy,
    metadata: input.metadata || {},
    createdAt: new Date().toISOString(),
  };

  if (!input.uid) return record;

  await getAdminDb()
    .collection('users')
    .doc(input.uid)
    .collection('communications')
    .add(record);

  return record;
}
