// Apple Music API Service for WKND Warrior 🍎
// Integrates with your Apple Developer credentials!

const jwt = require('jsonwebtoken');
const axios = require('axios');

class AppleMusicService {
  constructor() {
    // Your Apple Music credentials (LIVE!)
    this.keyId = 'BJHZ5B5U2X';
    this.teamId = process.env.APPLE_TEAM_ID || '9J332ABCCV';
    this.mediaId = process.env.APPLE_MEDIA_ID || 'media.com.wkndwarrior';
    this.privateKey = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgdK5DNxWMTKSjevlR
ZVKgAhU2nPiI1ysY1ADs5tyh9iugCgYIKoZIzj0DAQehRANCAARjbm6FpU0A337W
rN8mLyIMvrcbfaRKAEykyULZ5ruLy/2P+nO6rrSFWSN4ZliLBC9YH86OlZXlkNF1
9KGas1lD
-----END PRIVATE KEY-----`;
    
    this.baseUrl = 'https://api.music.apple.com/v1';
  }

  // Generate JWT token for Apple Music API authentication
  generateDeveloperToken() {
    const now = Math.floor(Date.now() / 1000);
    
    const payload = {
      iss: this.teamId,        // Team ID (issuer)
      iat: now,                // Issued at
      exp: now + 3600,         // Expires in 1 hour
      aud: 'appstoreconnect-v1' // Audience
    };

    const header = {
      alg: 'ES256',
      kid: this.keyId,
      typ: 'JWT'
    };

    try {
      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'ES256',
        header: header
      });
      
      return token;
    } catch (error) {
      console.error('Error generating Apple Music developer token:', error);
      throw new Error('Failed to generate Apple Music developer token');
    }
  }

  // Get user's top artists from Apple Music
  async getUserTopArtists(userToken, limit = 25) {
    try {
      const developerToken = this.generateDeveloperToken();
      
      // Get user's heavy rotation (similar to Spotify's top artists)
      const response = await axios.get(`${this.baseUrl}/me/history/heavy-rotation`, {
        params: {
          limit: limit,
          'types[]': 'artists'
        },
        headers: {
          'Authorization': `Bearer ${developerToken}`,
          'Music-User-Token': userToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.data.data) {
        console.log('No heavy rotation data found, trying recently played...');
        return await this.getUserRecentlyPlayedArtists(userToken, limit);
      }

      return response.data.data.map((item, index) => ({
        name: item.attributes.name,
        apple_id: item.id,
        genres: item.attributes.genreNames || [],
        rank: index + 1,
        artwork_url: item.attributes.artwork?.url,
        type: 'heavy_rotation'
      }));

    } catch (error) {
      console.error('Error fetching Apple Music top artists:', error.response?.data || error.message);
      
      // Fallback to recently played if heavy rotation fails
      try {
        return await this.getUserRecentlyPlayedArtists(userToken, limit);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        throw new Error('Failed to fetch user top artists from Apple Music');
      }
    }
  }

  // Fallback: Get artists from recently played tracks
  async getUserRecentlyPlayedArtists(userToken, limit = 25) {
    try {
      const developerToken = this.generateDeveloperToken();
      
      // Get recently played songs and extract unique artists
      const response = await axios.get(`${this.baseUrl}/me/recent/played/tracks`, {
        params: {
          limit: 100 // Get more tracks to extract diverse artists
        },
        headers: {
          'Authorization': `Bearer ${developerToken}`,
          'Music-User-Token': userToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.data.data || response.data.data.length === 0) {
        throw new Error('No recently played tracks found');
      }

      // Extract unique artists from recently played tracks
      const artistMap = new Map();
      
      response.data.data.forEach((track, index) => {
        if (track.relationships?.artists?.data) {
          track.relationships.artists.data.forEach(artist => {
            if (!artistMap.has(artist.id)) {
              artistMap.set(artist.id, {
                name: artist.attributes?.name || 'Unknown Artist',
                apple_id: artist.id,
                genres: artist.attributes?.genreNames || [],
                rank: artistMap.size + 1,
                artwork_url: artist.attributes?.artwork?.url,
                type: 'recently_played',
                play_order: index // Lower number = more recent
              });
            }
          });
        }
      });

      // Convert to array and sort by play order (most recent first)
      const artists = Array.from(artistMap.values())
        .sort((a, b) => a.play_order - b.play_order)
        .slice(0, limit)
        .map((artist, index) => ({
          ...artist,
          rank: index + 1
        }));

      return artists;

    } catch (error) {
      console.error('Error fetching recently played artists:', error.response?.data || error.message);
      throw new Error('Failed to fetch recently played artists from Apple Music');
    }
  }

  // Search for artists (useful for testing and recommendations)
  async searchArtists(query, limit = 10) {
    try {
      const developerToken = this.generateDeveloperToken();
      
      const response = await axios.get(`${this.baseUrl}/catalog/us/search`, {
        params: {
          term: query,
          types: 'artists',
          limit: limit
        },
        headers: {
          'Authorization': `Bearer ${developerToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.data.results?.artists?.data) {
        return [];
      }

      return response.data.results.artists.data.map(artist => ({
        name: artist.attributes.name,
        apple_id: artist.id,
        genres: artist.attributes.genreNames || [],
        artwork_url: artist.attributes.artwork?.url
      }));

    } catch (error) {
      console.error('Error searching Apple Music artists:', error.response?.data || error.message);
      throw new Error('Failed to search Apple Music artists');
    }
  }

  // Get Apple Music authorization URL (for web flow)
  getAuthUrl(state) {
    // Apple Music uses MusicKit JS for web authentication
    // This returns the configuration needed for the frontend
    return {
      type: 'apple_music_web',
      developer_token: this.generateDeveloperToken(),
      music_kit_config: {
        developerToken: this.generateDeveloperToken(),
        app: {
          name: 'WKND Warrior',
          build: '1.0.0'
        }
      },
      state: state,
      instructions: 'Use MusicKit.configure() on the frontend with this developer token'
    };
  }

  // Validate Apple Music user token
  async validateUserToken(userToken) {
    try {
      const developerToken = this.generateDeveloperToken();
      
      const response = await axios.get(`${this.baseUrl}/me/storefront`, {
        headers: {
          'Authorization': `Bearer ${developerToken}`,
          'Music-User-Token': userToken,
          'Content-Type': 'application/json'
        }
      });

      return {
        valid: true,
        storefront: response.data.data[0]?.id,
        country: response.data.data[0]?.attributes?.defaultLanguageTag
      };

    } catch (error) {
      console.error('Apple Music token validation failed:', error.response?.data || error.message);
      return {
        valid: false,
        error: error.response?.data?.errors?.[0]?.detail || 'Invalid user token'
      };
    }
  }

  // Get user's library stats (for dashboard display)
  async getUserLibraryStats(userToken) {
    try {
      const developerToken = this.generateDeveloperToken();
      
      // Get various library counts
      const promises = [
        axios.get(`${this.baseUrl}/me/library/songs`, {
          params: { limit: 1 },
          headers: {
            'Authorization': `Bearer ${developerToken}`,
            'Music-User-Token': userToken
          }
        }),
        axios.get(`${this.baseUrl}/me/library/artists`, {
          params: { limit: 1 },
          headers: {
            'Authorization': `Bearer ${developerToken}`,
            'Music-User-Token': userToken
          }
        }),
        axios.get(`${this.baseUrl}/me/library/playlists`, {
          params: { limit: 1 },
          headers: {
            'Authorization': `Bearer ${developerToken}`,
            'Music-User-Token': userToken
          }
        })
      ];

      const results = await Promise.allSettled(promises);
      
      return {
        songs: results[0].status === 'fulfilled' ? results[0].value.data.meta?.total || 0 : 0,
        artists: results[1].status === 'fulfilled' ? results[1].value.data.meta?.total || 0 : 0,
        playlists: results[2].status === 'fulfilled' ? results[2].value.data.meta?.total || 0 : 0
      };

    } catch (error) {
      console.error('Error fetching Apple Music library stats:', error);
      return { songs: 0, artists: 0, playlists: 0 };
    }
  }
}

module.exports = AppleMusicService;