// WKND Warrior - Live API Integration Services
// Real Spotify, ESPN, and Ticketmaster data! 🚀

const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ============= SPOTIFY API SERVICE =============

class SpotifyService {
  constructor() {
    this.clientId = '891a871c9360439fb2b392adea30ac87';
    this.clientSecret = '5466d872f4cc49e9a34049625508c20d';
    this.redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3001/api/spotify/callback';
  }

  // Get Spotify OAuth URL
  getAuthUrl(userId) {
    const scopes = [
      'user-top-read',
      'user-read-private', 
      'user-read-email',
      'user-library-read'
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: scopes,
      redirect_uri: this.redirectUri,
      state: userId,
      show_dialog: 'true'
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  // Exchange authorization code for access token
  async exchangeCodeForTokens(code) {
    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', 
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Spotify token exchange error:', error.response?.data);
      throw new Error('Failed to exchange Spotify code for tokens');
    }
  }

  // Get user's top artists (the MAGIC data!)
  async getUserTopArtists(accessToken, limit = 50) {
    try {
      const response = await axios.get(`https://api.spotify.com/v1/me/top/artists`, {
        params: {
          limit: limit,
          time_range: 'medium_term' // Last 6 months
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data.items.map((artist, index) => ({
        name: artist.name,
        spotify_id: artist.id,
        genres: artist.genres,
        popularity: artist.popularity,
        rank: index + 1,
        followers: artist.followers.total,
        image_url: artist.images[0]?.url
      }));
    } catch (error) {
      console.error('Error fetching top artists:', error.response?.data);
      throw new Error('Failed to fetch user top artists');
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post('https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Token refresh error:', error.response?.data);
      throw new Error('Failed to refresh Spotify token');
    }
  }
}

// ============= ESPN API SERVICE =============

class ESPNService {
  constructor() {
    this.baseUrl = 'https://site.api.espn.com/apis/site/v2/sports';
  }

  // Get NFL schedule (example - we can do all leagues)
  async getNFLSchedule(week = null, year = 2025) {
    try {
      let url = `${this.baseUrl}/football/nfl/scoreboard`;
      if (week) {
        url += `?seasontype=2&week=${week}`;
      }

      const response = await axios.get(url);
      return this.parseESPNEvents(response.data, 'NFL');
    } catch (error) {
      console.error('ESPN NFL schedule error:', error);
      throw new Error('Failed to fetch NFL schedule');
    }
  }

  // Get NBA schedule
  async getNBASchedule(date = null) {
    try {
      let url = `${this.baseUrl}/basketball/nba/scoreboard`;
      if (date) {
        url += `?dates=${date.replace(/-/g, '')}`; // Format: YYYYMMDD
      }

      const response = await axios.get(url);
      return this.parseESPNEvents(response.data, 'NBA');
    } catch (error) {
      console.error('ESPN NBA schedule error:', error);
      throw new Error('Failed to fetch NBA schedule');
    }
  }

  // Get MLB schedule
  async getMLBSchedule(date = null) {
    try {
      let url = `${this.baseUrl}/baseball/mlb/scoreboard`;
      if (date) {
        url += `?dates=${date.replace(/-/g, '')}`;
      }

      const response = await axios.get(url);
      return this.parseESPNEvents(response.data, 'MLB');
    } catch (error) {
      console.error('ESPN MLB schedule error:', error);
      throw new Error('Failed to fetch MLB schedule');
    }
  }

  // Parse ESPN response into our format
  parseESPNEvents(data, league) {
    if (!data.events) return [];

    return data.events.map(event => {
      const competition = event.competitions[0];
      const venue = competition.venue;
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

      return {
        espn_event_id: event.id,
        league: league,
        home_team: homeTeam?.team?.displayName,
        away_team: awayTeam?.team?.displayName,
        home_team_abbr: homeTeam?.team?.abbreviation,
        away_team_abbr: awayTeam?.team?.abbreviation,
        event_date: event.date,
        venue_name: venue?.fullName,
        venue_city: venue?.address?.city,
        venue_state: venue?.address?.state,
        status: competition.status?.type?.description,
        week: event.week?.number,
        season_year: event.season?.year
      };
    });
  }

  // Get all schedules for a date range (THIS IS THE MONEY FUNCTION!)
  async getAllSportsForDateRange(startDate, endDate) {
    try {
      const promises = [];
      const currentDate = new Date(startDate);
      const end = new Date(endDate);

      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Add all sports for this date
        promises.push(
          this.getNFLSchedule(null, 2025),
          this.getNBASchedule(dateStr),
          this.getMLBSchedule(dateStr)
        );

        currentDate.setDate(currentDate.getDate() + 1);
      }

      const results = await Promise.allSettled(promises);
      
      // Combine all successful results
      return results
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value);

    } catch (error) {
      console.error('Error fetching all sports:', error);
      throw new Error('Failed to fetch sports schedules');
    }
  }
}

// ============= TICKETMASTER API SERVICE =============

class TicketmasterService {
  constructor() {
    this.apiKey = 'EHoyYFA2qbXYZuGjpOvTqBt5wsEtCtWm';
    this.baseUrl = 'https://app.ticketmaster.com/discovery/v2';
  }

  // Search for concerts by artist name and location
  async searchConcertsByArtist(artistName, city, state, radius = 50) {
    try {
      const response = await axios.get(`${this.baseUrl}/events.json`, {
        params: {
          apikey: this.apiKey,
          keyword: artistName,
          city: city,
          stateCode: state,
          radius: radius,
          unit: 'miles',
          classificationName: 'music',
          sort: 'date,asc',
          size: 20
        }
      });

      if (!response.data._embedded?.events) {
        return [];
      }

      return response.data._embedded.events.map(event => ({
        ticketmaster_event_id: event.id,
        artist_name: artistName,
        event_name: event.name,
        event_date: event.dates.start.dateTime || event.dates.start.localDate,
        event_time: event.dates.start.localTime,
        venue_name: event._embedded?.venues?.[0]?.name,
        venue_city: event._embedded?.venues?.[0]?.city?.name,
        venue_state: event._embedded?.venues?.[0]?.state?.stateCode,
        venue_address: event._embedded?.venues?.[0]?.address?.line1,
        ticket_url: event.url,
        price_min: event.priceRanges?.[0]?.min,
        price_max: event.priceRanges?.[0]?.max,
        status: event.dates.status.code,
        genre: event.classifications?.[0]?.genre?.name,
        image_url: event.images?.[0]?.url
      }));

    } catch (error) {
      console.error(`Ticketmaster search error for ${artistName}:`, error.response?.data);
      return []; // Return empty array instead of throwing
    }
  }

  // Search concerts for multiple artists (CORE ALGORITHM!)
  async searchConcertsForArtists(artists, city, state, radius = 50) {
    try {
      const promises = artists.map(artist => 
        this.searchConcertsByArtist(artist.name || artist, city, state, radius)
      );

      const results = await Promise.allSettled(promises);
      
      return results
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value)
        .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

    } catch (error) {
      console.error('Error searching concerts for artists:', error);
      throw new Error('Failed to search concerts');
    }
  }

  // Get events in a city for date range
  async getEventsInArea(city, state, startDate, endDate, radius = 50) {
    try {
      const response = await axios.get(`${this.baseUrl}/events.json`, {
        params: {
          apikey: this.apiKey,
          city: city,
          stateCode: state,
          radius: radius,
          unit: 'miles',
          classificationName: 'music',
          startDateTime: `${startDate}T00:00:00Z`,
          endDateTime: `${endDate}T23:59:59Z`,
          sort: 'date,asc',
          size: 200
        }
      });

      if (!response.data._embedded?.events) {
        return [];
      }

      return response.data._embedded.events.map(event => ({
        ticketmaster_event_id: event.id,
        artist_name: event._embedded?.attractions?.[0]?.name || 'Unknown Artist',
        event_name: event.name,
        event_date: event.dates.start.dateTime || event.dates.start.localDate,
        venue_name: event._embedded?.venues?.[0]?.name,
        venue_city: event._embedded?.venues?.[0]?.city?.name,
        venue_state: event._embedded?.venues?.[0]?.state?.stateCode,
        ticket_url: event.url,
        price_min: event.priceRanges?.[0]?.min,
        price_max: event.priceRanges?.[0]?.max,
        genre: event.classifications?.[0]?.genre?.name
      }));

    } catch (error) {
      console.error('Ticketmaster area search error:', error);
      return [];
    }
  }
}

// ============= WEEKEND MATCHING SERVICE (THE CORE ALGORITHM!) =============

class WeekendMatchingService {
  constructor() {
    this.spotifyService = new SpotifyService();
    this.espnService = new ESPNService();
    this.ticketmasterService = new TicketmasterService();
  }

  // Calculate distance between two points (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in miles
  }

  toRadians(degrees) {
    return degrees * (Math.PI/180);
  }

  // Get user's weekend days
  async getUserWeekendDays(userId) {
    try {
      const result = await pool.query(
        'SELECT day_of_week FROM user_weekend_preferences WHERE user_id = $1',
        [userId] 
      );
      return result.rows.map(row => row.day_of_week);
    } catch (error) {
      console.error('Error getting user weekend days:', error);
      return [5, 6, 0]; // Default to Fri, Sat, Sun
    }
  }

  // MAIN ALGORITHM: Find perfect weekend events!
  async findWeekendEvents(userId, weekendStartDate) {
    try {
      console.log(`🔍 Finding weekend events for user ${userId} starting ${weekendStartDate}`);

      // Get user data
      const userResult = await pool.query(
        `SELECT location_city, location_state, search_radius FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];
      const weekendDays = await this.getUserWeekendDays(userId);

      // Calculate weekend date range
      const startDate = new Date(weekendStartDate);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // Full week to catch weekend

      console.log(`📅 Searching ${user.location_city}, ${user.location_state} within ${user.search_radius} miles`);

      // Get user's top artists
      const artistsResult = await pool.query(
        'SELECT artist_name FROM user_top_artists WHERE user_id = $1 ORDER BY rank_position LIMIT 20',
        [userId]
      );
      const topArtists = artistsResult.rows.map(row => row.artist_name);

      console.log(`🎵 Found ${topArtists.length} top artists for user`);

      // Get user's favorite teams
      const teamsResult = await pool.query(
        `SELECT st.name, st.city, sl.name as league 
         FROM user_favorite_teams uft
         JOIN sports_teams st ON uft.team_id = st.id  
         JOIN sports_leagues sl ON st.league_id = sl.id
         WHERE uft.user_id = $1`,
        [userId]
      );
      const favoriteTeams = teamsResult.rows;

      console.log(`🏈 Found ${favoriteTeams.length} favorite teams for user`);

      // Fetch concerts for user's artists
      const concerts = await this.ticketmasterService.searchConcertsForArtists(
        topArtists,
        user.location_city,
        user.location_state,
        user.search_radius
      );

      console.log(`🎸 Found ${concerts.length} concerts`);

      // Fetch sports events
      const sportsEvents = await this.espnService.getAllSportsForDateRange(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      console.log(`⚽ Found ${sportsEvents.length} sports events`);

      // Filter events to weekend days and calculate match scores
      const matchedEvents = this.filterAndScoreEvents(
        concerts,
        sportsEvents, 
        weekendDays,
        startDate,
        endDate
      );

      return {
        weekend_start: weekendStartDate,
        user_location: `${user.location_city}, ${user.location_state}`,
        search_radius: user.search_radius,
        weekend_days: weekendDays,
        total_concerts: concerts.length,
        total_sports: sportsEvents.length,
        matched_events: matchedEvents.slice(0, 20), // Top 20 matches
        summary: {
          concerts_found: matchedEvents.filter(e => e.type === 'concert').length,
          sports_found: matchedEvents.filter(e => e.type === 'sports').length,
          top_artists_searched: topArtists.length,
          favorite_teams: favoriteTeams.length
        }
      };

    } catch (error) {
      console.error('Weekend matching error:', error);
      throw error;
    }
  }

  // Filter and score events for weekend relevance
  filterAndScoreEvents(concerts, sportsEvents, weekendDays, startDate, endDate) {
    const events = [];

    // Process concerts
    concerts.forEach(concert => {
      const eventDate = new Date(concert.event_date);
      const dayOfWeek = eventDate.getDay();

      if (weekendDays.includes(dayOfWeek) && eventDate >= startDate && eventDate <= endDate) {
        events.push({
          type: 'concert',
          artist: concert.artist_name,
          name: concert.event_name,
          date: concert.event_date,
          day_of_week: dayOfWeek,
          venue: concert.venue_name,
          city: concert.venue_city,
          state: concert.venue_state,
          ticket_url: concert.ticket_url,
          price_min: concert.price_min,
          price_max: concert.price_max,
          genre: concert.genre,
          match_score: this.calculateEventScore(concert, 'concert')
        });
      }
    });

    // Process sports events  
    sportsEvents.forEach(event => {
      const eventDate = new Date(event.event_date);
      const dayOfWeek = eventDate.getDay();

      if (weekendDays.includes(dayOfWeek) && eventDate >= startDate && eventDate <= endDate) {
        events.push({
          type: 'sports',
          teams: `${event.away_team} @ ${event.home_team}`,
          name: `${event.away_team_abbr} @ ${event.home_team_abbr}`,
          date: event.event_date,
          day_of_week: dayOfWeek,
          venue: event.venue_name,
          city: event.venue_city,
          state: event.venue_state,
          league: event.league,
          status: event.status,
          match_score: this.calculateEventScore(event, 'sports')
        });
      }
    });

    // Sort by match score (highest first) then by date
    return events.sort((a, b) => {
      if (b.match_score !== a.match_score) {
        return b.match_score - a.match_score;
      }
      return new Date(a.date) - new Date(b.date);
    });
  }

  // Calculate relevance score for an event
  calculateEventScore(event, type) {
    let score = 50; // Base score

    // Bonus for weekend prime time
    const eventDate = new Date(event.event_date);
    const hour = eventDate.getHours();
    
    if (hour >= 19 && hour <= 23) score += 20; // Evening events
    if (eventDate.getDay() === 6) score += 15; // Saturday bonus
    if (eventDate.getDay() === 5) score += 10; // Friday bonus

    // Type-specific scoring
    if (type === 'concert') {
      if (event.genre && ['Rock', 'Pop', 'Hip-Hop'].includes(event.genre)) score += 10;
      if (event.price_min && event.price_min < 100) score += 5; // Affordable
    }

    if (type === 'sports') {
      if (['NFL', 'NBA'].includes(event.league)) score += 15; // Popular leagues
      if (event.status === 'Scheduled') score += 10; // Confirmed games
    }

    return Math.min(score, 100); // Cap at 100
  }
}

// Export services
module.exports = {
  SpotifyService,
  ESPNService, 
  TicketmasterService,
  WeekendMatchingService
};