import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';

const totalLimit = 24 * 1024 * 1024;
const archiveLimit = totalLimit + 256 * 1024;
const attachmentLimit = 8 * 1024 * 1024;
const manifestLimit = 2 * 1024 * 1024;
const maxFiles = 240;
const fileId = /^[a-zA-Z0-9-]{8,100}$/;
const organizationId = /^[a-zA-Z0-9_.:-]{1,160}$/;
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const fileSchema = z.object({
  id: z.string().regex(fileId),
  organization_id: z.string().regex(organizationId),
  project_id: z.string().max(160),
  category: z.enum(['branding', 'drawing', 'media', 'offload', 'delivery-note', 'invoice', 'decision', 'receipt']),
  name: z.string().max(180),
  content_type: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  size: z.number().int().min(1).max(attachmentLimit),
  sha256,
  uploaded_by: z.string().min(1).max(160),
  uploaded_at: z.string().datetime(),
  location: z.string().max(2048),
}).strict();
const manifestSchema = z.object({
  format: z.literal('coreconstruct-workspace-v1'),
  sourceOrganizationId: z.string().regex(organizationId),
  workspaceVersion: z.number().int().positive(),
  exportedAt: z.string().datetime(),
  workspaceSha256: sha256,
  files: z.array(fileSchema).max(maxFiles),
}).strict();

const entryFor = (id) => 'files/' + id;
const selectFiles = 'SELECT * FROM files WHERE organization_id=? ORDER BY id LIMIT ?';
const insertFile = 'INSERT INTO files (id,organization_id,project_id,category,name,content_type,size,sha256,uploaded_by,uploaded_at,location) VALUES (?,?,?,?,?,?,?,?,?,?,?)';

export class RecoveryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function checksum(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

// @param types are shared by the Worker and the local recovery command.
/** @param {import('./suite-types').SuiteState} state */
function attachmentReferences(state) {
  return [
    [state.suite.brand.logoFileId, '', 'branding'],
    ...state.expenses.map(row => [row.receiptFileId, row.projectId, 'receipt']),
    ...state.suite.drawings.map(row => [row.fileId, row.projectId, 'drawing']),
    ...state.suite.media.map(row => [row.fileId, row.projectId, 'media']),
    ...state.suite.deliveries.flatMap(row => [[row.offloadFileId, row.projectId, 'offload'], [row.noteFileId, row.projectId, 'delivery-note']]),
    ...state.suite.invoices.map(row => [row.evidenceFileId, row.projectId, 'invoice']),
    ...state.suite.variations.map(row => [row.externalEvidence, row.projectId, 'decision']),
  ];
}

/** @param {import('./suite-types').SuiteState} state @param {Array<z.infer<typeof fileSchema>>} files */
function verifyReferences(state, files) {
  const projects = new Map(state.projects.map(row => [row.id, row]));
  const byId = new Map(files.map(row => [row.id, row]));
  for (const [id, projectId, category] of attachmentReferences(state)) {
    if (!id) continue;
    // These exact fictional files ship with the release and never have an upload row.
    if (projects.get(projectId)?.sampleWalkthrough === 'drawings-client-updates' && (
      category === 'drawing' && [projectId + ':pdf:1', projectId + ':pdf:2'].includes(id)
      || category === 'media' && id === projectId + ':field-note'
    )) continue;
    const file = byId.get(id);
    if (!file || file.project_id !== projectId || file.category !== category) {
      throw new RecoveryError('A referenced attachment is missing from the recovery archive.', 409);
    }
  }
  if (byId.size !== files.length || files.some(row => row.project_id && !projects.has(row.project_id))) {
    throw new RecoveryError('The archive contains duplicate attachment IDs or an unknown project.');
  }
}

/**
 * @param {D1Database} db
 * @param {R2Bucket} bucket
 * @param {{state: import('./suite-types').SuiteState, version: number, organizationId: string}} source
 */
export async function createRecoveryArchive(db, bucket, source) {
  if (!source.version) throw new RecoveryError('Save at least one workspace entry before exporting a recovery archive.', 409);
  const snapshot = structuredClone(source.state);
  snapshot.suite.identities = {};
  snapshot.suite.commandFingerprints = {};
  snapshot.audit = snapshot.audit.map(event => event.action === 'worker.identity.set' ? { ...event, before: undefined } : event);
  delete snapshot.projectFunding;

  const { results } = await db.prepare(selectFiles).bind(source.organizationId, maxFiles + 1).all();
  if (results.length > maxFiles) throw new RecoveryError('The recovery archive supports up to 240 attachments.', 413);
  const files = z.array(fileSchema).safeParse(results);
  if (!files.success) throw new RecoveryError('Stored attachment metadata could not be verified.', 409);
  verifyReferences(snapshot, files.data);
  const records = strToU8(JSON.stringify(snapshot));
  if (records.byteLength + files.data.reduce((total, file) => total + file.size, 0) > totalLimit) {
    throw new RecoveryError('Records and attachments exceed the 24 MB recovery archive limit.', 413);
  }
  const manifest = manifestSchema.parse({
    format: 'coreconstruct-workspace-v1',
    sourceOrganizationId: source.organizationId,
    workspaceVersion: source.version,
    exportedAt: new Date().toISOString(),
    workspaceSha256: await checksum(records),
    files: files.data,
  });
  const entries = { 'manifest.json': strToU8(JSON.stringify(manifest)), 'workspace.json': records };
  for (const file of files.data) {
    const object = await bucket.get(source.organizationId + '/' + file.id);
    if (!object) throw new RecoveryError('An uploaded attachment is missing from storage. The archive was not created.', 409);
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength !== file.size || await checksum(bytes) !== file.sha256) {
      throw new RecoveryError('An uploaded attachment failed verification. The archive was not created.', 409);
    }
    entries[entryFor(file.id)] = bytes;
  }

  const latest = await db.prepare('SELECT version FROM workspaces WHERE owner_id=?').bind(source.organizationId).first();
  if (latest?.version !== source.version) {
    throw new RecoveryError('Workspace records changed during export. Download the archive again.', 409);
  }
  // Stored entries keep work and memory bounded and preserve exact attachment bytes.
  return zipSync(entries, { level: 0 });
}

/** @param {Uint8Array} bytes */
export async function readRecoveryArchive(bytes) {
  if (bytes.byteLength > archiveLimit) throw new RecoveryError('Recovery archive exceeds its supported size.', 413);
  const names = new Set();
  let expanded = 0;
  let entries;
  try {
    entries = unzipSync(bytes, {
      filter(entry) {
        expanded += entry.originalSize;
        const isFile = entry.name.startsWith('files/') && fileId.test(entry.name.slice(6));
        const limit = isFile ? attachmentLimit : manifestLimit;
        if (entry.compression !== 0 || entry.size !== entry.originalSize || entry.originalSize > limit
          || expanded > archiveLimit || names.size >= maxFiles + 2 || names.has(entry.name)
          || !isFile && !['manifest.json', 'workspace.json'].includes(entry.name)) {
          throw new RecoveryError('The recovery archive has an invalid entry.');
        }
        names.add(entry.name);
        return true;
      },
    });
  } catch {
    throw new RecoveryError('Choose an intact CoreConstruct recovery ZIP.');
  }

  let manifest;
  let state;
  try {
    manifest = manifestSchema.parse(JSON.parse(strFromU8(entries['manifest.json'])));
    state = JSON.parse(strFromU8(entries['workspace.json']));
    if (state.schemaVersion !== 1 || state.suite?.version !== 2 || typeof state.firm !== 'string'
      || Object.keys(state.suite.identities).length || !Array.isArray(state.commandIds)) throw new Error();
    verifyReferences(state, manifest.files);
  } catch { throw new RecoveryError('The recovery ZIP contains invalid workspace records.'); }

  if (names.size !== manifest.files.length + 2 || await checksum(entries['workspace.json']) !== manifest.workspaceSha256) {
    throw new RecoveryError('Workspace records failed their archive checksum.');
  }
  for (const file of manifest.files) {
    const raw = entries[entryFor(file.id)];
    if (file.organization_id !== manifest.sourceOrganizationId
      || !raw || raw.byteLength !== file.size || await checksum(raw) !== file.sha256) {
      throw new RecoveryError('An attachment failed its archive checksum.');
    }
  }
  return { manifest, state, entries };
}

/**
 * Restores records and files into an independently provisioned empty database and bucket.
 * The target uses its own owner identity. Historical actors are retained.
 * @param {D1Database} db
 * @param {R2Bucket} bucket
 * @param {{id: string, email: string, name: string}} owner
 * @param {Awaited<ReturnType<typeof readRecoveryArchive>>} archive
 */
export async function restoreRecoveryArchive(db, bucket, owner, archive) {
  if (!organizationId.test(owner.id) || !owner.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email)) {
    throw new RecoveryError('Enter the account ID, email and name of the recovery workspace owner.');
  }
  const records = await db.prepare('SELECT (SELECT COUNT(*) FROM workspaces) + (SELECT COUNT(*) FROM organizations) + (SELECT COUNT(*) FROM files) + (SELECT COUNT(*) FROM memberships) + (SELECT COUNT(*) FROM invitations) + (SELECT COUNT(*) FROM portal_links) AS total').first();
  if (records?.total !== 0) throw new RecoveryError('Use a fresh recovery database.', 409);
  const { manifest, state, entries } = archive;
  const at = new Date().toISOString();
  const inserted = [];
  try {
    for (const file of manifest.files) {
      const key = owner.id + '/' + file.id;
      if (await bucket.get(key)) throw new RecoveryError('Use a fresh recovery file store.', 409);
      inserted.push(key);
      const bytes = entries[entryFor(file.id)];
      await bucket.put(key, bytes, { httpMetadata: { contentType: file.content_type }, customMetadata: { organizationId: owner.id, fileId: file.id } });
      const copy = await bucket.get(key);
      if (!copy || await checksum(await copy.arrayBuffer()) !== file.sha256) throw new RecoveryError('A restored attachment could not be verified.');
    }
    const statements = [
      db.prepare('INSERT INTO organizations (id,owner_id,name,created_at) VALUES (?,?,?,?)').bind(owner.id, owner.id, state.firm, at),
      db.prepare("INSERT INTO memberships (id,organization_id,user_id,email,display_name,role,project_roles,active) VALUES (?,?,?,?,?,'admin','{}',1)").bind(owner.id + ':' + owner.id, owner.id, owner.id, owner.email.toLowerCase(), owner.name),
      db.prepare('INSERT INTO workspaces (owner_id,data,version,updated_at) VALUES (?,?,?,?)').bind(owner.id, strFromU8(entries['workspace.json']), manifest.workspaceVersion, at),
      ...manifest.files.map(file => db.prepare(insertFile).bind(file.id, owner.id, file.project_id, file.category, file.name, file.content_type, file.size, file.sha256, file.uploaded_by, file.uploaded_at, file.location)),
    ];
    await db.batch(statements);
  } catch (error) {
    await Promise.allSettled(inserted.map(key => bucket.delete(key)));
    throw error;
  }
  return { version: manifest.workspaceVersion, projects: state.projects.length, files: manifest.files.length };
}
