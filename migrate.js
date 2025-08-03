// scripts/migrate.js
// Run this to set up your database: node scripts/migrate.js

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.uqojxyxyutgxxmalxjvp:Qs8P3$BA!S!zs2x@aws-0-us-east-2.pooler.supabase.com:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

const migrations = [
  // Enable UUID extension
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
  
  // Users table
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    subscription_tier VARCHAR(20) DEFAULT 'free',
    location_city VARCHAR(100),
    location_state VARCHAR(50),
    location_country VARCHAR(50) DEFAULT 'US',
    timezone VARCHAR(50),
    search_radius INTEGER DEFAULT 30
  );`,

  // User weekend preferences
  `CREATE TABLE IF NOT EXISTS user_weekend_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    is_weekend_day BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  // User music connections
  `CREATE TABLE IF NOT EXISTS user_music_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    service_type VARCHAR(20) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    service_user_id VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, service_type)
  );`,

  // User top artists
  `CREATE TABLE IF NOT EXISTS user_top_artists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    artist_name VARCHAR(255) NOT NULL,
    artist_spotify_id VARCHAR(50),
    artist_apple_id VARCHAR(50),
    rank_position INTEGER,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source_service VARCHAR(20)
  );`,

  // Sports leagues
  `CREATE TABLE IF NOT EXISTS sports_leagues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    full_name VARCHAR(100),
    country VARCHAR(50) DEFAULT 'US',
    sport_type VARCHAR(50),
    is_active BOOLEAN DEFAULT true
  );`,

  // Sports teams
  `CREATE TABLE IF NOT EXISTS sports_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID REFERENCES sports_leagues(id),
    name VARCHAR(100) NOT NULL,
    city VARCHAR(100),
    abbreviation VARCHAR(10),
    espn_team_id VARCHAR(20),
    logo_url VARCHAR(500),
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),
    is_active BOOLEAN DEFAULT true
  );`,

  // User favorite teams
  `CREATE TABLE IF NOT EXISTS user_favorite_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES sports_teams(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, team_id)
  );`,

  // Venues
  `CREATE TABLE IF NOT EXISTS venues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50),
    country VARCHAR(50) DEFAULT 'US',
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    capacity INTEGER,
    venue_type VARCHAR(50),
    ticketmaster_venue_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  // Sports events
  `CREATE TABLE IF NOT EXISTS sports_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    espn_event_id VARCHAR(50) UNIQUE,
    home_team_id UUID REFERENCES sports_teams(id),
    away_team_id UUID REFERENCES sports_teams(id),
    league_id UUID REFERENCES sports_leagues(id),
    event_date TIMESTAMP NOT NULL,
    venue_name VARCHAR(255),
    venue_city VARCHAR(100),
    venue_state VARCHAR(50),
    venue_latitude DECIMAL(10,8),
    venue_longitude DECIMAL(11,8),
    status VARCHAR(50),
    season_year INTEGER,
    week_number INTEGER,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  // Concert events
  `CREATE TABLE IF NOT EXISTS concert_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticketmaster_event_id VARCHAR(50) UNIQUE,
    artist_name VARCHAR(255) NOT NULL,
    event_name VARCHAR(500),
    venue_id UUID REFERENCES venues(id),
    event_date TIMESTAMP NOT NULL,
    event_time TIME,
    ticket_url VARCHAR(1000),
    price_min DECIMAL(10,2),
    price_max DECIMAL(10,2),
    status VARCHAR(50),
    genre VARCHAR(100),
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  // User matched events
  `CREATE TABLE IF NOT EXISTS user_matched_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    sports_event_id UUID REFERENCES sports_events(id),
    concert_event_id UUID REFERENCES concert_events(id),
    weekend_start_date DATE,
    match_score INTEGER,
    is_bookmarked BOOLEAN DEFAULT false,
    user_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  // User activity logs
  `CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50),
    event_type VARCHAR(20),
    event_reference_id UUID,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  // API cache
  `CREATE TABLE IF NOT EXISTS api_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    cache_data JSONB NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  // Premium usage tracking
  `CREATE TABLE IF NOT EXISTS user_premium_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    feature_name VARCHAR(100),
    usage_count INTEGER DEFAULT 1,
    usage_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  // Create indexes for performance
  `CREATE INDEX IF NOT EXISTS idx_sports_events_date ON sports_events(event_date);`,
  `CREATE INDEX IF NOT EXISTS idx_sports_events_location ON sports_events(venue_latitude, venue_longitude);`,
  `CREATE INDEX IF NOT EXISTS idx_concert_events_date ON concert_events(event_date);`,
  `CREATE INDEX IF NOT EXISTS idx_concert_events_artist ON concert_events(artist_name);`,
  `CREATE INDEX IF NOT EXISTS idx_venues_location ON venues(latitude, longitude);`,
  `CREATE INDEX IF NOT EXISTS idx_venues_city_state ON venues(city, state);`,
  `CREATE INDEX IF NOT EXISTS idx_user_activity_logs ON user_activity_logs(user_id, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(cache_key, expires_at);`,
];

const seedData = [
  // Insert sports leagues
  `INSERT INTO sports_leagues (name, full_name, sport_type) VALUES
   ('NFL', 'National Football League', 'Football'),
   ('NBA', 'National Basketball Association', 'Basketball'),
   ('MLB', 'Major League Baseball', 'Baseball'),
   ('NHL', 'National Hockey League', 'Hockey')
   ON CONFLICT DO NOTHING;`,

  // Insert some sample teams (you can expand this)
  `INSERT INTO sports_teams (league_id, name, city, abbreviation, espn_team_id) 
   SELECT 
     sl.id,
     t.name,
     t.city,
     t.abbreviation,
     t.espn_team_id
   FROM sports_leagues sl
   CROSS JOIN (VALUES
     ('NFL', 'Dallas Cowboys', 'Dallas', 'DAL', '6'),
     ('NFL', 'Houston Texans', 'Houston', 'HOU', '34'),
     ('NFL', 'Green Bay Packers', 'Green Bay', 'GB', '9'),
     ('NFL', 'New England Patriots', 'Foxborough', 'NE', '17'),
     ('NBA', 'San Antonio Spurs', 'San Antonio', 'SAS', '24'),
     ('NBA', 'Dallas Mavericks', 'Dallas', 'DAL', '6'),
     ('NBA', 'Houston Rockets', 'Houston', 'HOU', '10'),
     ('NBA', 'Los Angeles Lakers', 'Los Angeles', 'LAL', '13'),
     ('MLB', 'Houston Astros', 'Houston', 'HOU', '18'),
     ('MLB', 'Texas Rangers', 'Arlington', 'TEX', '13'),
     ('MLB', 'New York Yankees', 'New York', 'NYY', '10'),
     ('MLB', 'Los Angeles Dodgers', 'Los Angeles', 'LAD', '19'),
     ('NHL', 'Dallas Stars', 'Dallas', 'DAL', '25'),
     ('NHL', 'Boston Bruins', 'Boston', 'BOS', '6'),
     ('NHL', 'Chicago Blackhawks', 'Chicago', 'CHI', '16'),
     ('NHL', 'Toronto Maple Leafs', 'Toronto', 'TOR', '28')
   ) AS t(league, name, city, abbreviation, espn_team_id)
   WHERE sl.name = t.league
   ON CONFLICT DO NOTHING;`,
];

async function runMigrations() {
  console.log('🚀 Starting WKND Warrior database migration...');
  
  try {
    // Run migrations
    for (let i = 0; i < migrations.length; i++) {
      console.log(`Running migration ${i + 1}/${migrations.length}...`);
      await pool.query(migrations[i]);
    }

    console.log('✅ All migrations completed successfully!');

    // Run seed data
    console.log('🌱 Seeding initial data...');
    for (let i = 0; i < seedData.length; i++) {
      console.log(`Seeding data ${i + 1}/${seedData.length}...`);
      await pool.query(seedData[i]);
    }

    console.log('✅ Database seeding completed!');
    console.log('🎯 WKND Warrior database is ready to conquer weekends!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Only run if called directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };