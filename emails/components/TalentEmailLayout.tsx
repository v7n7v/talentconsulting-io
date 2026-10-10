import { Fragment, type ReactNode } from 'react';
import { Body, Button, Column, Container, Head, Heading, Html, Img, Link, Preview, Row, Section, Text } from 'react-email';
import { emailBrand, emailTokens } from '../tokens';
import type { EmailPersona, EmailSocialLink } from '@/lib/email/contracts';

export interface TalentEmailLayoutProps {
  preheader: string;
  category: string;
  title: string;
  children: ReactNode;
  action?: { label: string; url: string };
  secondaryAction?: { label: string; url: string };
  persona?: EmailPersona;
  socialLinks?: readonly EmailSocialLink[];
  footerNote?: string;
  preferenceUrl?: string;
  unsubscribeUrl?: string;
  mailingAddress?: string;
}

export function TalentEmailLayout({
  preheader,
  category,
  title,
  children,
  action,
  secondaryAction,
  persona,
  socialLinks,
  footerNote,
  preferenceUrl,
  unsubscribeUrl,
  mailingAddress,
}: TalentEmailLayoutProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <Preview>{preheader}</Preview>
      <Body style={styles.body}>
        <Container style={styles.wrapper}>
          <Section style={styles.card}>
            <Section style={styles.header}>
              <Link href={emailBrand.origin} aria-label="Taco home">
                <Img
                  src={emailBrand.logoUrl}
                  width="232"
                  height="56"
                  alt="Taco by TalentConsulting"
                  style={styles.logo}
                />
              </Link>
              <Text style={styles.category}>{category.toUpperCase()}</Text>
              <Heading as="h1" style={styles.heading}>{title}</Heading>
            </Section>

            <Section style={styles.content}>
              {persona ? <EmailPersonaBlock persona={persona} /> : null}
              {children}
              {action ? (
                <Section style={styles.actionSection}>
                  <Button href={action.url} style={styles.primaryButton}>{action.label}</Button>
                </Section>
              ) : null}
              {secondaryAction ? (
                <Section style={styles.secondaryActionSection}>
                  <Link href={secondaryAction.url} style={styles.secondaryLink}>{secondaryAction.label}</Link>
                </Section>
              ) : null}
            </Section>
          </Section>

          <Section style={styles.footer}>
            {socialLinks?.length ? (
              <Section style={styles.socialSection}>
                <Text style={styles.socialTitle}>Continue the conversation</Text>
                <Text style={styles.socialLinks}>
                  {socialLinks.map((socialLink, index) => (
                    <Fragment key={socialLink.platform}>
                      {index > 0 ? <span style={styles.socialDivider}> · </span> : null}
                      <Link href={socialLink.url} style={styles.socialLink}>{socialLink.label}</Link>
                    </Fragment>
                  ))}
                </Text>
              </Section>
            ) : null}
            {footerNote ? <Text style={styles.footerNote}>{footerNote}</Text> : null}
            <Text style={styles.footerText}>
              Need help? <Link href={emailBrand.supportUrl} style={styles.footerLink}>Contact support</Link>
              {' · '}
              <Link href={emailBrand.privacyUrl} style={styles.footerLink}>Privacy</Link>
              {preferenceUrl ? <>{' · '}<Link href={preferenceUrl} style={styles.footerLink}>Email preferences</Link></> : null}
              {unsubscribeUrl ? <>{' · '}<Link href={unsubscribeUrl} style={styles.footerLink}>Unsubscribe</Link></> : null}
            </Text>
            <Text style={styles.footerText}>© {new Date().getUTCFullYear()} TalentConsulting.io</Text>
            {mailingAddress ? <Text style={styles.address}>{mailingAddress}</Text> : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function EmailPersonaBlock({ persona }: { persona: EmailPersona }) {
  const isHero = persona.presentation === 'hero';
  const role = persona.role || 'Your review-first career copilot';

  return (
    <Section style={isHero ? styles.personaHero : styles.personaByline}>
      <Row>
        <Column style={isHero ? styles.personaHeroMarkColumn : styles.personaMarkColumn}>
          <Img
            src={emailBrand.tacoMarkUrl}
            width={isHero ? '56' : '44'}
            height={isHero ? '56' : '44'}
            alt="Taco"
            style={styles.personaMark}
          />
        </Column>
        <Column style={styles.personaCopyColumn}>
          <Text style={styles.personaName}>Taco</Text>
          <Text style={styles.personaRole}>{role}</Text>
          {persona.message ? <Text style={styles.personaMessage}>{persona.message}</Text> : null}
        </Column>
      </Row>
    </Section>
  );
}

const styles = {
  body: {
    backgroundColor: emailTokens.color.canvas,
    fontFamily: emailTokens.fontFamily,
    margin: '0',
    padding: '0',
  },
  wrapper: {
    margin: '0 auto',
    maxWidth: `${emailTokens.width - 32}px`,
    padding: '32px 0 40px',
    tableLayout: 'fixed' as const,
    width: '94%',
  },
  card: {
    backgroundColor: emailTokens.color.surface,
    border: `1px solid ${emailTokens.color.border}`,
    borderRadius: `${emailTokens.radius}px`,
    overflow: 'hidden',
    tableLayout: 'fixed' as const,
    width: '100%',
  },
  header: {
    borderBottom: `1px solid ${emailTokens.color.border}`,
    padding: '28px 32px 24px',
  },
  logo: { border: '0', display: 'block', height: 'auto', margin: '0 0 26px', maxWidth: '100%' },
  category: {
    color: emailTokens.color.brand,
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '1.2px',
    lineHeight: '16px',
    margin: '0 0 8px',
  },
  heading: {
    color: emailTokens.color.ink,
    fontSize: '25px',
    fontWeight: '750',
    letterSpacing: '-0.4px',
    lineHeight: '32px',
    margin: '0',
  },
  content: { padding: '28px 32px 32px' },
  personaHero: {
    backgroundColor: emailTokens.color.brandSoft,
    border: `1px solid #D9DDFF`,
    borderRadius: '12px',
    margin: '0 0 24px',
    padding: '18px',
  },
  personaByline: {
    backgroundColor: '#FAFAFF',
    border: `1px solid ${emailTokens.color.border}`,
    borderLeft: `4px solid ${emailTokens.color.brand}`,
    borderRadius: '10px',
    margin: '0 0 22px',
    padding: '13px 14px',
  },
  personaHeroMarkColumn: { paddingRight: '16px', verticalAlign: 'middle', width: '72px' },
  personaMarkColumn: { paddingRight: '13px', verticalAlign: 'middle', width: '57px' },
  personaCopyColumn: { verticalAlign: 'middle' },
  personaMark: { border: '0', display: 'block', height: 'auto', maxWidth: '100%' },
  personaName: {
    color: emailTokens.color.ink,
    fontSize: '15px',
    fontWeight: '750',
    lineHeight: '20px',
    margin: '0',
  },
  personaRole: {
    color: emailTokens.color.brand,
    fontSize: '12px',
    fontWeight: '650',
    lineHeight: '18px',
    margin: '1px 0 0',
  },
  personaMessage: {
    color: emailTokens.color.muted,
    fontSize: '12px',
    lineHeight: '18px',
    margin: '5px 0 0',
  },
  actionSection: { margin: '26px 0 4px', textAlign: 'left' as const },
  primaryButton: {
    backgroundColor: emailTokens.color.brand,
    borderRadius: '9px',
    color: '#FFFFFF',
    display: 'inline-block',
    fontSize: '14px',
    fontWeight: '700',
    lineHeight: '20px',
    padding: '13px 22px',
    textDecoration: 'none',
  },
  secondaryActionSection: { margin: '18px 0 0' },
  secondaryLink: { color: emailTokens.color.brand, fontSize: '13px', fontWeight: '650', textDecoration: 'underline' },
  footer: { padding: '20px 20px 0', textAlign: 'center' as const },
  socialSection: {
    borderBottom: `1px solid ${emailTokens.color.border}`,
    margin: '0 auto 14px',
    maxWidth: '360px',
    padding: '0 0 13px',
  },
  socialTitle: {
    color: emailTokens.color.ink,
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: '17px',
    margin: '0 0 4px',
  },
  socialLinks: { fontSize: '11px', lineHeight: '18px', margin: '0' },
  socialLink: { color: emailTokens.color.brand, fontWeight: '650', textDecoration: 'none' },
  socialDivider: { color: emailTokens.color.subtle },
  footerNote: { color: emailTokens.color.muted, fontSize: '11px', lineHeight: '17px', margin: '0 0 8px' },
  footerText: { color: emailTokens.color.subtle, fontSize: '10px', lineHeight: '16px', margin: '0 0 5px' },
  footerLink: { color: emailTokens.color.muted, textDecoration: 'underline' },
  address: { color: emailTokens.color.subtle, fontSize: '10px', lineHeight: '16px', margin: '0' },
};
