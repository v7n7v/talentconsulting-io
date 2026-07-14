export const SONA_ALERT_TARGET_ROLE_KEY = 'talent-sona-alert-target-role';

export function normalizeAlertTargetRole(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function resolveAlertConsentHandoff(input: {
  loaded: boolean;
  canPersist: boolean;
  saving: boolean;
  targetRoles: string[];
  roleInput: string;
  suggestedTargetRole?: string;
}) {
  const existingRole = input.targetRoles.length > 0 || Boolean(input.roleInput.trim());
  const suggestedRole = input.loaded && !existingRole
    ? normalizeAlertTargetRole(input.suggestedTargetRole)
    : '';

  return {
    controlsDisabled: !input.loaded || !input.canPersist || input.saving,
    suggestedRole,
    saveDisabled: !input.loaded || !input.canPersist || input.saving || (!existingRole && !suggestedRole),
  };
}
