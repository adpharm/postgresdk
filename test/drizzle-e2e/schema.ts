import { pgTable, uuid, varchar, text, timestamp, date, jsonb, index, primaryKey, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Main contacts table - stores KOL and HCP information
export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Identity fields
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  govIdName: varchar('gov_id_name', { length: 200 }), // Name as appears on government ID
  gender: varchar('gender', { length: 50 }),
  dateOfBirth: date('date_of_birth'),
  
  // Contact information
  email: varchar('email', { length: 255 }).unique().notNull(),
  ccEmail: varchar('cc_email', { length: 255 }),
  emergencyContact: text('emergency_contact'), // Simple text for MVP
  officePhone: varchar('office_phone', { length: 50 }),
  cellPhone: varchar('cell_phone', { length: 50 }),
  
  // Professional information
  clinicLocation: text('clinic_location'), // Comma-separated for multiple locations
  specialty: varchar('specialty', { length: 200 }),
  fmvTiering: varchar('fmv_tiering', { length: 50 }), // Fair Market Value tiering
  
  // Preferences - keeping simple for MVP
  flightPreferences: text('flight_preferences'), // Simple text for MVP
  dietaryRestrictions: text('dietary_restrictions').array(),
  specialAccommodations: text('special_accommodations'),
  
  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // Reference to user
  updatedBy: uuid('updated_by'),
  
  // Soft delete
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_contacts_email').on(table.email),
  index('idx_contacts_name').on(table.lastName, table.firstName),
  index('idx_contacts_specialty').on(table.specialty),
  index('idx_contacts_deleted').on(table.deletedAt),
]);

// Interaction/notes table - tracks all interactions with contacts
export const contactInteractions = pgTable('contact_interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  
  type: varchar('type', { length: 50 }), // 'note', 'email', 'meeting', 'call', etc.
  subject: varchar('subject', { length: 255 }),
  content: text('content').notNull(),
  
  // Optional metadata for future integrations
  metadata: jsonb('metadata'), // Store email IDs, meeting IDs, etc.
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').notNull(),
  
  // For threading conversations
  parentInteractionId: uuid('parent_interaction_id'),
}, (table) => [
  index('idx_interactions_contact').on(table.contactId, table.createdAt),
  index('idx_interactions_type').on(table.type),
]);

// Tags for flexible categorization
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).unique().notNull(),
  color: varchar('color', { length: 7 }), // Hex color
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Many-to-many relationship between contacts and tags
export const contactTags = pgTable('contact_tags', {
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.contactId, table.tagId] }),
]);

// Audit log for compliance and tracking changes
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableName: varchar('table_name', { length: 50 }).notNull(),
  recordId: uuid('record_id').notNull(),
  action: varchar('action', { length: 20 }).notNull(), // 'INSERT', 'UPDATE', 'DELETE'
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  userId: uuid('user_id').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_audit_log_record').on(table.tableName, table.recordId, table.timestamp),
]);

// Type exports for TypeScript usage
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactInteraction = typeof contactInteractions.$inferSelect;
export type NewContactInteraction = typeof contactInteractions.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;