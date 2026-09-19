const { Client } = require('pg');

async function inspect() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres',
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL server at localhost:5432 (as postgres)!');

    const dbsRes = await client.query(`
      SELECT datname FROM pg_database WHERE datistemplate = false;
    `);
    console.log('Available databases:');
    for (const row of dbsRes.rows) {
      console.log(' - ' + row.datname);
    }

    // Now check each database for tables in public schema
    for (const row of dbsRes.rows) {
      const dbName = row.datname;
      const dbClient = new Client({
        connectionString: `postgresql://postgres:postgres@localhost:5432/${dbName}`,
      });
      try {
        await dbClient.connect();
        const tablesRes = await dbClient.query(`
          SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
        `);
        console.log(`\nTables in database "${dbName}":`);
        if (tablesRes.rows.length === 0) {
          console.log('  (no tables found)');
        } else {
          for (const t of tablesRes.rows) {
            console.log('  - ' + t.table_name);
          }
        }
        await dbClient.end();
      } catch (err) {
        console.log(`Could not connect to ${dbName}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error connecting to postgres:', err.message);
  } finally {
    await client.end();
  }
}

inspect();
