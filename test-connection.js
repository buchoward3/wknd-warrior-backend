const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.uqojxyxyutgxxmalxjvp:Qs8P3$BA!S!zs2x@aws-0-us-east-2.pooler.supabase.com:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    console.log('🔄 Testing Supabase pooled connection...');
    const client = await pool.connect();
    console.log('✅ Connected to Supabase successfully!');
    
    const result = await client.query('SELECT NOW()');
    console.log('📅 Current database time:', result.rows[0].now);
    
    client.release();
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }
}

testConnection();