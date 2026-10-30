import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// A bounded owner workspace is updated with an optimistic version check.
// All money, approvals, history and idempotency records commit together.
export const workspaces = sqliteTable('workspaces', {
  ownerId: text('owner_id').primaryKey(),
  data: text('data').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), name: text('name').notNull(), createdAt: text('created_at').notNull(),
});
export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), userId: text('user_id').notNull(), email: text('email').notNull(), displayName: text('display_name').notNull(), role: text('role').notNull(), projectRoles: text('project_roles').notNull().default('{}'), active: integer('active').notNull().default(1),
});
export const invitations = sqliteTable('invitations', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), email: text('email').notNull(), role: text('role').notNull(), projectRoles: text('project_roles').notNull(), tokenHash: text('token_hash').notNull().unique(), expiresAt: text('expires_at').notNull(), createdBy: text('created_by').notNull(), claimedBy: text('claimed_by'), claimedAt: text('claimed_at'), revokedAt: text('revoked_at'),
});
export const portalLinks = sqliteTable('portal_links', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), projectId: text('project_id').notNull(), tokenHash: text('token_hash').notNull().unique(), expiresAt: text('expires_at').notNull(), createdBy: text('created_by').notNull(), createdAt: text('created_at').notNull(), revokedAt: text('revoked_at'),
});
export const files = sqliteTable('files', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), projectId: text('project_id').notNull(), category: text('category').notNull(), name: text('name').notNull(), contentType: text('content_type').notNull(), size: integer('size').notNull(), sha256: text('sha256').notNull(), uploadedBy: text('uploaded_by').notNull(), uploadedAt: text('uploaded_at').notNull(), location: text('location').notNull().default('{}'),
});
