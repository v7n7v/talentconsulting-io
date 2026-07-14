const fs = require('node:fs');
const path = require('node:path');
const { parseDotEnv } = require('./production-deploy-preflight');

function readSelectedStagingEnvFile(selectedEnvPath) {
  if (!selectedEnvPath) return { env: null, error: 'env_file:not_found' };
  const resolved = path.resolve(selectedEnvPath);
  let descriptor;
  try {
    const linkStat = fs.lstatSync(resolved);
    if (!linkStat.isFile() || linkStat.isSymbolicLink()) return { env: null, error: 'env_file:not_found' };
    descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) return { env: null, error: 'env_file:not_regular' };
    // Windows mode bits do not represent NTFS ACLs. Linux/macOS CI remains
    // authoritative for the owner-only 0600 permission boundary.
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      return { env: null, error: 'env_file:unsafe_permissions' };
    }
    if (stat.size > 256 * 1024) return { env: null, error: 'env_file:too_large' };
    return { env: parseDotEnv(fs.readFileSync(descriptor, 'utf8')), error: null };
  } catch {
    return { env: null, error: 'env_file:not_found' };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

module.exports = { readSelectedStagingEnvFile };
