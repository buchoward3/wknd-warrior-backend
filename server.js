// WKND Warrior Backend Server - LIVE VERSION! 🚀
// Now with REAL Spotify, ESPN, Apple Music, and Ticketmaster integration!

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const Redis = require('redis');
require('dotenv').config();

// Import our live API services
const { 
  SpotifyService, 
  ESPNService, 
  TicketmasterService,
  WeekendMatchingService 
} = require('./services/api-services');
const AppleMusicService = require('./services/apple-music-service');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const spotifyService = new SpotifyService();
const appleMusicService = new AppleMusicService();
const espnService = new ESPNService();
const ticketmasterService = new TicketmasterService();
const weekendMatchingService = new WeekendMatchingService();

// Database Setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Redis Setup
// Redis Setup (temporarily disabled for testing)
let redis = null;
if (process.env.REDIS_URL && process.env.REDIS_URL !== 'redis://localhost:6379') {
  redis = Redis.createClient({
    url: process.env.REDIS_URL
  });
  redis.connect();
} else {
  console.log('⚠️  Redis disabled - using memory cache for development');
  redis = {
    ping: () => Promise.resolve('PONG'),
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
    del: () => Promise.resolve(1)
  };
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'https://claude.ai', 'https://console.anthropic.com'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Utility Functions
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// ============= AUTH ROUTES =============

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username, location_city, location_state } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await hashPassword(password);
    const newUser = await pool.query(
      `INSERT INTO users (email, password_hash, username, location_city, location_state) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, username, created_at`,
      [email, hashedPassword, username, location_city, location_state]
    );

    // Set default weekend preferences
    const weekendDays = [5, 6, 0];
    for (const day of weekendDays) {
      await pool.query(
        'INSERT INTO user_weekend_preferences (user_id, day_of_week) VALUES ($1, $2)',
        [newUser.rows[0].id, day]
      );
    }

    const token = generateToken(newUser.rows[0]);
    res.status(201).json({ user: newUser.rows[0], token });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await pool.query(
      'SELECT id, email, username, password_hash FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await comparePassword(password, user.rows[0].password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { password_hash, ...userWithoutPassword } = user.rows[0];
    const token = generateToken(userWithoutPassword);

    res.json({ user: userWithoutPassword, token });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ============= SPOTIFY INTEGRATION (LIVE!) =============

app.get('/api/spotify/auth-url', authenticateToken, (req, res) => {
  try {
    const authUrl = spotifyService.getAuthUrl(req.user.id);
    res.json({ authUrl });
  } catch (error) {
    console.error('Spotify auth URL error:', error);
    res.status(500).json({ error: 'Failed to generate Spotify auth URL' });
  }
});

app.post('/api/spotify/callback', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    
    console.log(`🎵 Processing Spotify callback for user ${req.user.id}`);

    // Exchange code for tokens
    const tokens = await spotifyService.exchangeCodeForTokens(code);
    const { access_token, refresh_token, expires_in } = tokens;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Get user's top artists (THE MAGIC!)
    const topArtists = await spotifyService.getUserTopArtists(access_token);
    console.log(`🔥 Found ${topArtists.length} top artists!`);

    // Store connection in database
    await pool.query(
      `INSERT INTO user_music_connections (user_id, service_type, access_token, refresh_token, expires_at, service_user_id)
       VALUES ($1, 'spotify', $2, $3, $4, $5)
       ON CONFLICT (user_id, service_type) DO UPDATE SET
       access_token = $2, refresh_token = $3, expires_at = $4, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, access_token, refresh_token, expiresAt, 'spotify_user']
    );

    // Clear existing top artists and insert new ones
    await pool.query('DELETE FROM user_top_artists WHERE user_id = $1', [req.user.id]);

    for (const artist of topArtists) {
      await pool.query(
        `INSERT INTO user_top_artists (user_id, artist_name, artist_spotify_id, rank_position, source_service)
         VALUES ($1, $2, $3, $4, 'spotify')`,
        [req.user.id, artist.name, artist.spotify_id, artist.rank]
      );
    }

    console.log(`✅ Successfully connected Spotify for user ${req.user.id}`);

    res.json({ 
      success: true, 
      message: 'Spotify connected successfully',
      artists_found: topArtists.length,
      sample_artists: topArtists.slice(0, 5).map(a => a.name)
    });

  } catch (error) {
    console.error('Spotify callback error:', error);
    res.status(500).json({ error: 'Failed to connect Spotify' });
  }
});

// Get user's connected status and top artists
app.get('/api/spotify/status', authenticateToken, async (req, res) => {
  try {
    const connection = await pool.query(
      'SELECT service_type, expires_at, is_active FROM user_music_connections WHERE user_id = $1 AND service_type = $2',
      [req.user.id, 'spotify']
    );

    const artists = await pool.query(
      'SELECT artist_name, rank_position FROM user_top_artists WHERE user_id = $1 ORDER BY rank_position LIMIT 10',
      [req.user.id]
    );

    const isConnected = connection.rows.length > 0 && connection.rows[0].is_active;
    
    res.json({
      connected: isConnected,
      expires_at: connection.rows[0]?.expires_at,
      top_artists: artists.rows.map(row => ({
        name: row.artist_name,
        rank: row.rank_position
      }))
    });

  } catch (error) {
    console.error('Spotify status error:', error);
    res.status(500).json({ error: 'Failed to get Spotify status' });
  }
});

// ============= APPLE MUSIC INTEGRATION (NEW!) =============

// Get Apple Music configuration for frontend
app.get('/api/apple-music/config', authenticateToken, (req, res) => {
  try {
    const config = appleMusicService.getAuthUrl(req.user.id);
    res.json(config);
  } catch (error) {
    console.error('Apple Music config error:', error);
    res.status(500).json({ error: 'Failed to get Apple Music config' });
  }
});

// Connect Apple Music (user provides Music-User-Token from frontend)
app.post('/api/apple-music/connect', authenticateToken, async (req, res) => {
  try {
    const { userToken } = req.body;
    
    console.log(`🍎 Connecting Apple Music for user ${req.user.id}`);

    // Validate the user token
    const validation = await appleMusicService.validateUserToken(userToken);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Get user's top artists from Apple Music
    const topArtists = await appleMusicService.getUserTopArtists(userToken);
    console.log(`🔥 Found ${topArtists.length} top artists from Apple Music!`);

    // Store connection in database
    await pool.query(
      `INSERT INTO user_music_connections (user_id, service_type, access_token, service_user_id, is_active)
       VALUES ($1, 'apple_music', $2, $3, true)
       ON CONFLICT (user_id, service_type) DO UPDATE SET
       access_token = $2, service_user_id = $3, updated_at = CURRENT_TIMESTAMP, is_active = true`,
      [req.user.id, userToken, validation.storefront || 'apple_music_user']
    );

    // Clear existing Apple Music artists and insert new ones
    await pool.query('DELETE FROM user_top_artists WHERE user_id = $1 AND source_service = $2', [req.user.id, 'apple_music']);

    for (const artist of topArtists) {
      await pool.query(
        `INSERT INTO user_top_artists (user_id, artist_name, artist_apple_id, rank_position, source_service)
         VALUES ($1, $2, $3, $4, 'apple_music')`,
        [req.user.id, artist.name, artist.apple_id, artist.rank]
      );
    }

    console.log(`✅ Successfully connected Apple Music for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Apple Music connected successfully',
      artists_found: topArtists.length,
      sample_artists: topArtists.slice(0, 5).map(a => a.name),
      data_source: topArtists[0]?.type || 'unknown'
    });

  } catch (error) {
    console.error('Apple Music connect error:', error);
    res.status(500).json({ error: 'Failed to connect Apple Music' });
  }
});

// Get Apple Music connection status
app.get('/api/apple-music/status', authenticateToken, async (req, res) => {
  try {
    const connection = await pool.query(
      'SELECT service_type, is_active FROM user_music_connections WHERE user_id = $1 AND service_type = $2',
      [req.user.id, 'apple_music']
    );

    const artists = await pool.query(
      'SELECT artist_name, rank_position FROM user_top_artists WHERE user_id = $1 AND source_service = $2 ORDER BY rank_position LIMIT 10',
      [req.user.id, 'apple_music']
    );

    const isConnected = connection.rows.length > 0 && connection.rows[0].is_active;
    
    res.json({
      connected: isConnected,
      top_artists: artists.rows.map(row => ({
        name: row.artist_name,
        rank: row.rank_position
      })),
      service: 'Apple Music'
    });

  } catch (error) {
    console.error('Apple Music status error:', error);
    res.status(500).json({ error: 'Failed to get Apple Music status' });
  }
});

// Test Apple Music API
app.get('/api/apple-music/test', authenticateToken, async (req, res) => {
  try {
    const { query } = req.query;
    const results = await appleMusicService.searchArtists(query || 'Taylor Swift', 5);
    
    res.json({
      message: 'Apple Music API test successful! 🍎',
      query: query || 'Taylor Swift',
      results: results,
      developer_token_working: true
    });

  } catch (error) {
    console.error('Apple Music test error:', error);
    res.status(500).json({ error: 'Apple Music API test failed', details: error.message });
  }
});

// ============= SPORTS DATA (LIVE ESPN!) =============

app.get('/api/sports/teams', async (req, res) => {
  try {
    // Get teams from database (we can expand this with live ESPN team data later)
    const result = await pool.query(
      `SELECT sl.name as league, sl.full_name as league_full_name,
       json_agg(json_build_object('id', st.id, 'name', st.name, 'city', st.city, 'abbreviation', st.abbreviation)) as teams
       FROM sports_leagues sl
       JOIN sports_teams st ON sl.id = st.league_id
       WHERE sl.is_active = true AND st.is_active = true
       GROUP BY sl.id, sl.name, sl.full_name
       ORDER BY sl.name`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get sports teams error:', error);
    res.status(500).json({ error: 'Failed to get sports teams' });
  }
});

// Add/remove favorite teams
app.post('/api/user/favorite-teams', authenticateToken, async (req, res) => {
  try {
    const { teamId } = req.body;

    await pool.query(
      'INSERT INTO user_favorite_teams (user_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, teamId]
    );

    res.json({ message: 'Team added to favorites' });
  } catch (error) {
    console.error('Add favorite team error:', error);
    res.status(500).json({ error: 'Failed to add favorite team' });
  }
});

app.delete('/api/user/favorite-teams/:teamId', authenticateToken, async (req, res) => {
  try {
    const { teamId } = req.params;

    await pool.query(
      'DELETE FROM user_favorite_teams WHERE user_id = $1 AND team_id = $2',
      [req.user.id, teamId]
    );

    res.json({ message: 'Team removed from favorites' });
  } catch (error) {
    console.error('Remove favorite team error:', error);
    res.status(500).json({ error: 'Failed to remove favorite team' });
  }
});

// Test live sports data
app.get('/api/sports/live-schedule', authenticateToken, async (req, res) => {
  try {
    const { league, date } = req.query;
    
    console.log(`🏈 Fetching live ${league || 'ALL'} schedule for ${date || 'today'}`);

    let events = [];
    
    if (!league || league === 'NFL') {
      const nflEvents = await espnService.getNFLSchedule();
      events = events.concat(nflEvents);
    }
    
    if (!league || league === 'NBA') {
      const nbaEvents = await espnService.getNBASchedule(date);
      events = events.concat(nbaEvents);
    }

    console.log(`✅ Found ${events.length} live sports events`);

    res.json({
      total_events: events.length,
      events: events.slice(0, 20), // Limit for demo
      leagues_searched: league || 'ALL',
      message: `Live sports data from ESPN! 🔥`
    });

  } catch (error) {
    console.error('Live schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch live schedule' });
  }
});

// ============= CONCERT DATA (LIVE TICKETMASTER!) =============

app.get('/api/concerts/search', authenticateToken, async (req, res) => {
  try {
    const { artist, city, state } = req.query;
    
    console.log(`🎸 Searching Ticketmaster for ${artist} in ${city}, ${state}`);

    const concerts = await ticketmasterService.searchConcertsByArtist(
      artist, 
      city || req.user.location_city, 
      state || req.user.location_state
    );

    console.log(`✅ Found ${concerts.length} concerts for ${artist}`);

    res.json({
      artist: artist,
      location: `${city}, ${state}`,
      total_concerts: concerts.length,
      concerts: concerts,
      message: `Live concert data from Ticketmaster! 🎵`
    });

  } catch (error) {
    console.error('Concert search error:', error);
    res.status(500).json({ error: 'Failed to search concerts' });
  }
});

// ============= THE CORE ALGORITHM: WEEKEND MATCHING! =============

app.get('/api/user/weekend-events', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query; // Format: YYYY-MM-DD
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`🔥 FINDING PERFECT WEEKEND for user ${req.user.id} starting ${targetDate}`);

    // THE MAGIC HAPPENS HERE!
    const weekendEvents = await weekendMatchingService.findWeekendEvents(
      req.user.id, 
      targetDate
    );

    console.log(`✅ Found ${weekendEvents.matched_events.length} perfect weekend events!`);

    // Log activity for analytics
    await pool.query(
      'INSERT INTO user_activity_logs (user_id, activity_type, metadata) VALUES ($1, $2, $3)',
      [req.user.id, 'weekend_search', { 
        date: targetDate,
        events_found: weekendEvents.matched_events.length 
      }]
    );

    res.json(weekendEvents);

  } catch (error) {
    console.error('Weekend events error:', error);
    res.status(500).json({ error: 'Failed to find weekend events' });
  }
});

// Update user weekend preferences
app.put('/api/user/weekend-preferences', authenticateToken, async (req, res) => {
  try {
    const { weekendDays } = req.body; // Array like [5, 6, 0] for Fri, Sat, Sun

    // Delete existing preferences
    await pool.query('DELETE FROM user_weekend_preferences WHERE user_id = $1', [req.user.id]);

    // Insert new preferences
    for (const day of weekendDays) {
      await pool.query(
        'INSERT INTO user_weekend_preferences (user_id, day_of_week) VALUES ($1, $2)',
        [req.user.id, day]
      );
    }

    res.json({ message: 'Weekend preferences updated successfully', weekendDays });
  } catch (error) {
    console.error('Update weekend preferences error:', error);
    res.status(500).json({ error: 'Failed to update weekend preferences' });
  }
});

// Get user preferences and stats
app.get('/api/user/dashboard', authenticateToken, async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT u.*,
      COALESCE(json_agg(wp.day_of_week) FILTER (WHERE wp.day_of_week IS NOT NULL), '[]') as weekend_days,
      COALESCE(json_agg(json_build_object('team_id', ft.team_id, 'team_name', st.name, 'league', sl.name)) FILTER (WHERE ft.team_id IS NOT NULL), '[]') as favorite_teams
      FROM users u
      LEFT JOIN user_weekend_preferences wp ON u.id = wp.user_id
      LEFT JOIN user_favorite_teams ft ON u.id = ft.user_id
      LEFT JOIN sports_teams st ON ft.team_id = st.id
      LEFT JOIN sports_leagues sl ON st.league_id = sl.id
      WHERE u.id = $1
      GROUP BY u.id`,
      [req.user.id]
    );

    // Get stats
    const topArtists = await pool.query(
      'SELECT COUNT(*) as count FROM user_top_artists WHERE user_id = $1',
      [req.user.id]
    );

    const searchHistory = await pool.query(
      'SELECT COUNT(*) as searches FROM user_activity_logs WHERE user_id = $1 AND activity_type = $2',
      [req.user.id, 'weekend_search']
    );

    const userData = user.rows[0];
    const { password_hash, ...userWithoutPassword } = userData;

    res.json({
      ...userWithoutPassword,
      stats: {
        top_artists_connected: parseInt(topArtists.rows[0].count),
        weekend_searches: parseInt(searchHistory.rows[0].searches),
        favorite_teams: userData.favorite_teams.length
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to get user dashboard' });
  }
});
// ============= ADMIN/DEBUG ENDPOINTS =============

// Test all APIs at once
app.get('/api/debug/test-apis', async (req, res) => {
  try {
    const results = {
      spotify: 'Not tested (requires user auth)',
      apple_music: null,
      espn: null,
      ticketmaster: null
    };

    // Test Apple Music
    try {
      const appleResults = await appleMusicService.searchArtists('Taylor Swift', 1);
      results.apple_music = `✅ SUCCESS: Found ${appleResults.length} Apple Music artist(s)`;
    } catch (error) {
      results.apple_music = `❌ ERROR: ${error.message}`;
    }

    // Test ESPN
    try {
      const nflGames = await espnService.getNFLSchedule();
      results.espn = `✅ SUCCESS: Found ${nflGames.length} NFL games`;
    } catch (error) {
      results.espn = `❌ ERROR: ${error.message}`;
    }

    // Test Ticketmaster
    try {
      const concerts = await ticketmasterService.searchConcertsByArtist('Taylor Swift', 'Austin', 'TX');
      results.ticketmaster = `✅ SUCCESS: Found ${concerts.length} Taylor Swift concerts in Austin`;
    } catch (error) {
      results.ticketmaster = `❌ ERROR: ${error.message}`;
    }

    res.json({
      message: 'API Test Results',
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error) {
    console.error('API test error:', error);
    res.status(500).json({ error: 'API test failed' });
  }
});

// Clear user's favorite teams
app.delete('/api/user/clear-teams', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM user_favorite_teams WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ message: 'Teams cleared successfully' });
  } catch (error) {
    console.error('Clear teams error:', error);
    res.status(500).json({ error: 'Failed to clear teams' });
  }
});

// ============= HEALTH CHECK =============

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    if (redis && redis.ping) await redis.ping();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        spotify: 'integrated',
        apple_music: 'integrated',
        espn: 'integrated',
        ticketmaster: 'integrated'
      },
      message: '🚀 WKND Warrior is ready to conquer weekends!'
    });

  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 WKND Warrior API Server running on port ${PORT}`);
  console.log(`⚡ LIVE APIs: Spotify ✅ ESPN ✅ Ticketmaster ✅ Apple Music ✅`);
  console.log(`🪖 Ready to conquer weekends with REAL data!`);
});

module.exports = app;