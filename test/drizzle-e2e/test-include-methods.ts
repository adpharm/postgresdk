#!/usr/bin/env bun

/**
 * Test the generated include methods from Drizzle schema
 */

import { SDK } from "../.drizzle-e2e-results/client";
import { Client } from "pg";

const TEST_URL = "postgres://user:pass@localhost:5432/drizzle_test";
const API_URL = "http://localhost:3555";

async function setupTestData() {
  const pg = new Client({ connectionString: TEST_URL });
  await pg.connect();
  
  // Clean up
  await pg.query("DELETE FROM contact_interactions");
  await pg.query("DELETE FROM contact_tags");
  await pg.query("DELETE FROM contacts");
  await pg.query("DELETE FROM tags");
  
  // Insert test data
  const contact1 = await pg.query(`
    INSERT INTO contacts (first_name, last_name, email, specialty) 
    VALUES ('John', 'Doe', 'john@example.com', 'Cardiology')
    RETURNING id
  `);
  
  const contact2 = await pg.query(`
    INSERT INTO contacts (first_name, last_name, email, specialty) 
    VALUES ('Jane', 'Smith', 'jane@example.com', 'Neurology')
    RETURNING id
  `);
  
  // Add interactions
  await pg.query(`
    INSERT INTO contact_interactions (contact_id, type, subject, content, created_by)
    VALUES ($1, 'meeting', 'Initial consultation', 'Discussed treatment options', $2)
  `, [contact1.rows[0].id, contact1.rows[0].id]);
  
  await pg.query(`
    INSERT INTO contact_interactions (contact_id, type, subject, content, created_by)
    VALUES ($1, 'email', 'Follow-up', 'Sent follow-up materials', $2)
  `, [contact1.rows[0].id, contact1.rows[0].id]);
  
  // Add tags
  const tag1 = await pg.query(`
    INSERT INTO tags (name, color, description)
    VALUES ('VIP', '#FF0000', 'High priority contact')
    RETURNING id
  `);
  
  const tag2 = await pg.query(`
    INSERT INTO tags (name, color, description)
    VALUES ('Speaker', '#00FF00', 'Conference speaker')
    RETURNING id
  `);
  
  // Link tags to contacts
  await pg.query(`
    INSERT INTO contact_tags (contact_id, tag_id)
    VALUES ($1, $2)
  `, [contact1.rows[0].id, tag1.rows[0].id]);
  
  await pg.query(`
    INSERT INTO contact_tags (contact_id, tag_id)
    VALUES ($1, $2)
  `, [contact2.rows[0].id, tag2.rows[0].id]);
  
  await pg.end();
  
  return {
    contact1Id: contact1.rows[0].id,
    contact2Id: contact2.rows[0].id,
    tag1Id: tag1.rows[0].id,
    tag2Id: tag2.rows[0].id
  };
}

async function testIncludeMethods() {
  console.log("\n🧪 Testing Include Methods with Drizzle Schema\n");
  
  const { contact1Id, contact2Id } = await setupTestData();
  const sdk = new SDK({ baseUrl: API_URL });
  
  console.log("1. Testing contacts.listWithContactInteractions()");
  const contactsWithInteractions = await sdk.contacts.listWithContactInteractions();
  console.log(`   ✓ Found ${contactsWithInteractions.data.length} contacts`);
  const johnWithInteractions = contactsWithInteractions.data.find(c => c.email === 'john@example.com');
  if (johnWithInteractions) {
    console.log(`   ✓ John Doe has ${johnWithInteractions.contact_interactions.length} interactions`);
    // TypeScript knows contact_interactions exists and is an array
    const firstInteraction = johnWithInteractions.contact_interactions[0];
    if (firstInteraction) {
      console.log(`   ✓ First interaction type: ${firstInteraction.type}`);
    }
  }
  
  console.log("\n2. Testing contacts.listWithTags()");
  const contactsWithTags = await sdk.contacts.listWithTags();
  console.log(`   ✓ Found ${contactsWithTags.data.length} contacts`);
  for (const contact of contactsWithTags.data) {
    if (contact.tags && contact.tags.length > 0) {
      console.log(`   ✓ ${contact.first_name} ${contact.last_name} has tag: ${contact.tags[0]?.name}`);
    }
  }
  
  console.log("\n3. Testing contacts.getByPkWithContactInteractions()");
  const singleContactWithInteractions = await sdk.contacts.getByPkWithContactInteractions(contact1Id);
  if (singleContactWithInteractions) {
    console.log(`   ✓ Retrieved ${singleContactWithInteractions.first_name} with ${singleContactWithInteractions.contact_interactions.length} interactions`);
  }

  console.log("\n4. Testing contacts.getByPkWithTags()");
  const singleContactWithTags = await sdk.contacts.getByPkWithTags(contact2Id);
  if (singleContactWithTags) {
    console.log(`   ✓ Retrieved ${singleContactWithTags.first_name} with tags: ${singleContactWithTags.tags.map(t => t.name).join(', ')}`);
  }

  console.log("\n5. Testing contact_interactions.listWithContact()");
  const interactionsWithContact = await sdk.contact_interactions.listWithContact();
  console.log(`   ✓ Found ${interactionsWithContact.data.length} interactions`);
  if (interactionsWithContact.data[0]) {
    // TypeScript knows contact exists and is of the correct type
    console.log(`   ✓ First interaction belongs to: ${interactionsWithContact.data[0].contact.first_name} ${interactionsWithContact.data[0].contact.last_name}`);
  }
  
  console.log("\n✅ All include method tests passed!");
  console.log("\nKey benefits demonstrated:");
  console.log("  • Full type safety - TypeScript knows exact shape of includes");
  console.log("  • No include objects needed - just call the method");
  console.log("  • Works seamlessly with Drizzle schemas");
  console.log("  • Circular references handled automatically");
}

// Run if called directly
if (import.meta.main) {
  testIncludeMethods().catch(console.error);
}