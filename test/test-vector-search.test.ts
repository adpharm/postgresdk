#!/usr/bin/env bun

import { test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { SDK } from "./.results/client";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const CONTAINER_NAME = "postgresdk-test-db";

async function ensurePostgresRunning(): Promise<void> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      return;
    }
  } catch {}

  console.log("🐳 Starting PostgreSQL container with pgvector...");
  try {
    const { stdout } = await execAsync(`docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      await execAsync(`docker start ${CONTAINER_NAME}`);
    } else {
      // Use pgvector image
      await execAsync(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=testdb -p 5432:5432 pgvector/pgvector:pg17`);
    }
  } catch (error) {
    console.error("Failed to start container:", error);
    throw error;
  }

  console.log("  → Waiting for PostgreSQL to be ready...");
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    try {
      const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
      await pg.connect();
      await pg.query("SELECT 1");
      await pg.end();
      console.log("  ✓ PostgreSQL is ready!");
      return;
    } catch {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error("PostgreSQL failed to start in time");
}

beforeAll(async () => {
  await ensurePostgresRunning();
});

// Test data - 3D embeddings for simplicity
const EMBEDDINGS = {
  cat: [1.0, 0.0, 0.0],
  dog: [0.9, 0.1, 0.0],  // Similar to cat
  car: [0.0, 1.0, 0.0],  // Different from cat/dog
  truck: [0.0, 0.9, 0.1], // Similar to car
  bird: [0.5, 0.5, 0.0],  // Somewhat between cat and car
};

const TEXT_EMBEDDINGS = {
  animal: [1.0, 0.0, 0.0],
  pet: [0.95, 0.05, 0.0],
  vehicle: [0.0, 1.0, 0.0],
  transport: [0.0, 0.95, 0.05],
};

test("vector search - basic cosine similarity", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM video_sections");

    // Insert test data
    await pg.query(
      "INSERT INTO video_sections (title, status, vision_embedding) VALUES ($1, $2, $3)",
      ["Cat Video", "published", JSON.stringify(EMBEDDINGS.cat)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, status, vision_embedding) VALUES ($1, $2, $3)",
      ["Dog Video", "published", JSON.stringify(EMBEDDINGS.dog)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, status, vision_embedding) VALUES ($1, $2, $3)",
      ["Car Video", "published", JSON.stringify(EMBEDDINGS.car)]
    );

    const { registerVideoSectionsRoutes } = await import("./.results/server/routes/video_sections");
    const app = new Hono();
    registerVideoSectionsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3480 });

    const sdk = new SDK({ baseUrl: "http://localhost:3480" });

    // Search for cat - should return cat and dog (similar) first
    const results = await sdk.video_sections.list({
      vector: {
        field: "vision_embedding",
        query: EMBEDDINGS.cat,
        metric: "cosine"
      },
      limit: 3
    });

    expect(results.data).toHaveLength(3);
    expect(results.data[0]!._distance).toBeDefined();
    expect(results.data[0]!.title).toBe("Cat Video");
    expect(results.data[1]!.title).toBe("Dog Video"); // Most similar
    expect(results.data[2]!.title).toBe("Car Video"); // Least similar

    server.close();
  } finally {
    await pg.end();
  }
});

test("vector search - distance threshold filtering", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM video_sections");

    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding) VALUES ($1, $2)",
      ["Cat Video", JSON.stringify(EMBEDDINGS.cat)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding) VALUES ($1, $2)",
      ["Dog Video", JSON.stringify(EMBEDDINGS.dog)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding) VALUES ($1, $2)",
      ["Car Video", JSON.stringify(EMBEDDINGS.car)]
    );

    const { registerVideoSectionsRoutes } = await import("./.results/server/routes/video_sections");
    const app = new Hono();
    registerVideoSectionsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3481 });

    const sdk = new SDK({ baseUrl: "http://localhost:3481" });

    // Only return results within distance threshold
    const results = await sdk.video_sections.list({
      vector: {
        field: "vision_embedding",
        query: EMBEDDINGS.cat,
        metric: "cosine",
        maxDistance: 0.2  // Only cat and dog should match
      },
      limit: 10
    });

    expect(results.data.length).toBeLessThanOrEqual(2);
    expect(results.data[0]!.title).toBe("Cat Video");
    if (results.data.length > 1) {
      expect(results.data[1]!.title).toBe("Dog Video");
    }

    server.close();
  } finally {
    await pg.end();
  }
});

test("vector search - combined with WHERE clause", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM video_sections");

    await pg.query(
      "INSERT INTO video_sections (title, status, vision_embedding) VALUES ($1, $2, $3)",
      ["Cat Video", "published", JSON.stringify(EMBEDDINGS.cat)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, status, vision_embedding) VALUES ($1, $2, $3)",
      ["Dog Video", "draft", JSON.stringify(EMBEDDINGS.dog)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, status, vision_embedding) VALUES ($1, $2, $3)",
      ["Bird Video", "published", JSON.stringify(EMBEDDINGS.bird)]
    );

    const { registerVideoSectionsRoutes } = await import("./.results/server/routes/video_sections");
    const app = new Hono();
    registerVideoSectionsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3482 });

    const sdk = new SDK({ baseUrl: "http://localhost:3482" });

    // Vector search + traditional WHERE filtering
    const results = await sdk.video_sections.list({
      vector: {
        field: "vision_embedding",
        query: EMBEDDINGS.cat
      },
      where: {
        status: "published",  // Only published
        vision_embedding: { $isNot: null }  // Must have embedding
      },
      limit: 10
    });

    expect(results.data.length).toBeGreaterThan(0);
    results.data.forEach(item => {
      expect(item.status).toBe("published");
      expect(item._distance).toBeDefined();
    });
    // Dog should be filtered out (draft status)
    expect(results.data.every(item => item.title !== "Dog Video")).toBe(true);

    server.close();
  } finally {
    await pg.end();
  }
});

test("vector search - parallel searches (vision + text)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM video_sections");

    // Insert records with both vision and text embeddings
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding, text_embedding) VALUES ($1, $2, $3)",
      ["Cat Video", JSON.stringify(EMBEDDINGS.cat), JSON.stringify(TEXT_EMBEDDINGS.animal)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding, text_embedding) VALUES ($1, $2, $3)",
      ["Dog Video", JSON.stringify(EMBEDDINGS.dog), JSON.stringify(TEXT_EMBEDDINGS.pet)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding, text_embedding) VALUES ($1, $2, $3)",
      ["Car Video", JSON.stringify(EMBEDDINGS.car), JSON.stringify(TEXT_EMBEDDINGS.vehicle)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding, text_embedding) VALUES ($1, $2, $3)",
      ["Truck Video", JSON.stringify(EMBEDDINGS.truck), JSON.stringify(TEXT_EMBEDDINGS.transport)]
    );

    const { registerVideoSectionsRoutes } = await import("./.results/server/routes/video_sections");
    const app = new Hono();
    registerVideoSectionsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3483 });

    const sdk = new SDK({ baseUrl: "http://localhost:3483" });

    // Parallel vector searches like the user's example
    const [visionResults, textResults] = await Promise.all([
      sdk.video_sections.list({
        vector: {
          field: "vision_embedding",
          query: EMBEDDINGS.cat,
          metric: "cosine",
          maxDistance: 0.6
        },
        where: { vision_embedding: { $isNot: null } },
        limit: 50
      }),
      sdk.video_sections.list({
        vector: {
          field: "text_embedding",
          query: TEXT_EMBEDDINGS.animal,
          metric: "cosine",
          maxDistance: 0.5
        },
        where: { text_embedding: { $isNot: null } },
        limit: 50
      })
    ]);

    // Verify both searches returned results
    expect(visionResults.data.length).toBeGreaterThan(0);
    expect(textResults.data.length).toBeGreaterThan(0);

    // Verify distances are included
    expect(visionResults.data[0]!._distance).toBeDefined();
    expect(textResults.data[0]!._distance).toBeDefined();

    // Verify ordering (closest first)
    expect(visionResults.data[0]!.title).toBe("Cat Video");
    expect(textResults.data[0]!.title).toBe("Cat Video");

    server.close();
  } finally {
    await pg.end();
  }
});

test("vector search - different distance metrics", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM video_sections");

    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding) VALUES ($1, $2)",
      ["Cat Video", JSON.stringify(EMBEDDINGS.cat)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding) VALUES ($1, $2)",
      ["Dog Video", JSON.stringify(EMBEDDINGS.dog)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding) VALUES ($1, $2)",
      ["Car Video", JSON.stringify(EMBEDDINGS.car)]
    );

    const { registerVideoSectionsRoutes } = await import("./.results/server/routes/video_sections");
    const app = new Hono();
    registerVideoSectionsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3484 });

    const sdk = new SDK({ baseUrl: "http://localhost:3484" });

    // Test cosine distance
    const cosineResults = await sdk.video_sections.list({
      vector: { field: "vision_embedding", query: EMBEDDINGS.cat, metric: "cosine" },
      limit: 3
    });
    expect(cosineResults.data[0]!._distance).toBeDefined();

    // Test L2 distance
    const l2Results = await sdk.video_sections.list({
      vector: { field: "vision_embedding", query: EMBEDDINGS.cat, metric: "l2" },
      limit: 3
    });
    expect(l2Results.data[0]!._distance).toBeDefined();

    // Test inner product
    const innerResults = await sdk.video_sections.list({
      vector: { field: "vision_embedding", query: EMBEDDINGS.cat, metric: "inner" },
      limit: 3
    });
    expect(innerResults.data[0]!._distance).toBeDefined();

    // All should return same items, but possibly different ordering/distances
    expect(cosineResults.data).toHaveLength(3);
    expect(l2Results.data).toHaveLength(3);
    expect(innerResults.data).toHaveLength(3);

    server.close();
  } finally {
    await pg.end();
  }
});

test("vector search - handles NULL embeddings", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM video_sections");

    // Mix of records with and without embeddings
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding) VALUES ($1, $2)",
      ["Cat Video", JSON.stringify(EMBEDDINGS.cat)]
    );
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding) VALUES ($1, NULL)",
      ["No Embedding Video"]
    );
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding) VALUES ($1, $2)",
      ["Dog Video", JSON.stringify(EMBEDDINGS.dog)]
    );

    const { registerVideoSectionsRoutes } = await import("./.results/server/routes/video_sections");
    const app = new Hono();
    registerVideoSectionsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3485 });

    const sdk = new SDK({ baseUrl: "http://localhost:3485" });

    // Should only return records with embeddings
    const results = await sdk.video_sections.list({
      vector: {
        field: "vision_embedding",
        query: EMBEDDINGS.cat
      },
      where: {
        vision_embedding: { $isNot: null }
      },
      limit: 10
    });

    expect(results.data.length).toBe(2);
    expect(results.data.every(item => item.vision_embedding !== null)).toBe(true);
    expect(results.data.every(item => item.title !== "No Embedding Video")).toBe(true);

    server.close();
  } finally {
    await pg.end();
  }
});

test("vector columns - returned as number[] arrays, not strings", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM video_sections");

    // Insert test vectors
    await pg.query(
      "INSERT INTO video_sections (title, vision_embedding, text_embedding) VALUES ($1, $2, $3)",
      ["Type Test", JSON.stringify(EMBEDDINGS.cat), JSON.stringify(TEXT_EMBEDDINGS.animal)]
    );

    const { registerVideoSectionsRoutes } = await import("./.results/server/routes/video_sections");
    const app = new Hono();
    registerVideoSectionsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3486 });

    const sdk = new SDK({ baseUrl: "http://localhost:3486" });

    // Test via list()
    const listResults = await sdk.video_sections.list({ where: { title: "Type Test" } });
    const listItem = listResults.data[0]!;

    // Verify vectors are arrays, not strings
    expect(Array.isArray(listItem.vision_embedding)).toBe(true);
    expect(Array.isArray(listItem.text_embedding)).toBe(true);
    expect(typeof listItem.vision_embedding).toBe("object");
    expect(typeof listItem.text_embedding).toBe("object");

    // Verify array contents are numbers
    expect(listItem.vision_embedding).toEqual(EMBEDDINGS.cat);
    expect(listItem.text_embedding).toEqual(TEXT_EMBEDDINGS.animal);
    expect(listItem.vision_embedding!.every((n: any) => typeof n === "number")).toBe(true);
    expect(listItem.text_embedding!.every((n: any) => typeof n === "number")).toBe(true);

    // Test via getByPk()
    const pkResult = await sdk.video_sections.getByPk(listItem.id);
    expect(pkResult).not.toBeNull();
    expect(Array.isArray(pkResult!.vision_embedding)).toBe(true);
    expect(Array.isArray(pkResult!.text_embedding)).toBe(true);

    // Test array methods work (confirms it's a real array)
    const firstValue = pkResult!.vision_embedding![0];
    expect(typeof firstValue).toBe("number");
    expect(pkResult!.vision_embedding!.length).toBe(3);

    server.close();
  } finally {
    await pg.end();
  }
});
