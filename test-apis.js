// test-apis.js - Test all your live APIs! 🚀
// Run with: node test-apis.js

const axios = require('axios');
require('dotenv').config();

// Your API keys (from your .env file)
const SPOTIFY_CLIENT_ID = '891a871c9360439fb2b392adea30ac87';
const SPOTIFY_CLIENT_SECRET = '5466d872f4cc49e9a34049625508c20d';
const TICKETMASTER_API_KEY = 'EHoyYFA2qbXYZuGjpOvTqBt5wsEtCtWm';
const RAPIDAPI_KEY = '22de420f5emsh52be9e02c771f04p1961cdjsnf2598162c22f';

// Apple Music test (will use your server's developer token)
const APPLE_MUSIC_TEST_URL = 'http://localhost:3001/api/apple-music/test';

console.log('🚀 WKND Warrior API Test Suite');
console.log('===============================\n');

// Test 1: ESPN API (Free!)
async function testESPN() {
  console.log('🏈 Testing ESPN API...');
  try {
    const response = await axios.get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    const games = response.data.events || [];
    console.log(`✅ ESPN API: SUCCESS! Found ${games.length} NFL games`);
    
    if (games.length > 0) {
      const sampleGame = games[0];
      const homeTeam = sampleGame.competitions[0].competitors.find(c => c.homeAway === 'home');
      const awayTeam = sampleGame.competitions[0].competitors.find(c => c.homeAway === 'away');
      console.log(`   Sample: ${awayTeam?.team?.displayName} @ ${homeTeam?.team?.displayName}`);
    }
    
    return true;
  } catch (error) {
    console.log(`❌ ESPN API: FAILED - ${error.message}`);
    return false;
  }
}

// Test 2: Ticketmaster API
async function testTicketmaster() {
  console.log('\n🎸 Testing Ticketmaster API...');
  try {
    const response = await axios.get('https://app.ticketmaster.com/discovery/v2/events.json', {
      params: {
        apikey: TICKETMASTER_API_KEY,
        keyword: 'Taylor Swift',
        city: 'Austin',
        stateCode: 'TX',
        classificationName: 'music',
        size: 5
      }
    });
    
    const events = response.data._embedded?.events || [];
    console.log(`✅ Ticketmaster API: SUCCESS! Found ${events.length} Taylor Swift events in Austin`);
    
    if (events.length > 0) {
      const event = events[0];
      console.log(`   Sample: ${event.name} at ${event._embedded?.venues?.[0]?.name}`);
    }
    
    return true;
  } catch (error) {
    console.log(`❌ Ticketmaster API: FAILED - ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    return false;
  }
}

// Test 3: Spotify API (Client Credentials Flow)
async function testSpotify() {
  console.log('\n🎵 Testing Spotify API...');
  try {
    // Get access token using client credentials
    const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', 
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // Test API call - search for an artist
    const searchResponse = await axios.get('https://api.spotify.com/v1/search', {
      params: {
        q: 'Taylor Swift',
        type: 'artist',
        limit: 1
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const artists = searchResponse.data.artists.items;
    console.log(`✅ Spotify API: SUCCESS! Found ${artists.length} artist(s)`);
    
    if (artists.length > 0) {
      const artist = artists[0];
      console.log(`   Sample: ${artist.name} (${artist.followers.total.toLocaleString()} followers)`);
    }
    
    return true;
  } catch (error) {
    console.log(`❌ Spotify API: FAILED - ${error.response?.data?.error?.message || error.message}`);
    return false;
  }
}

// Test 4: Apple Music API 🍎
async function testAppleMusic() {
  console.log('\n🍎 Testing Apple Music API...');
  try {
    // Test through our server endpoint (requires server to be running)
    const response = await axios.get('http://localhost:3001/api/apple-music/test?query=Taylor%20Swift');
    
    console.log(`✅ Apple Music API: SUCCESS!`);
    if (response.data.results && response.data.results.length > 0) {
      const artist = response.data.results[0];
      console.log(`   Sample: ${artist.name} (Apple Music)`);
    }
    
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`⚠️  Apple Music API: Server not running (start server first)`);
    } else {
      console.log(`❌ Apple Music API: FAILED - ${error.response?.data?.error || error.message}`);
    }
    return false;
  }
}

// Test 5: Full Integration Test
async function testIntegration() {
  console.log('\n🔥 Testing Full Integration...');
  
  try {
    // Simulate finding weekend events
    console.log('   📅 Simulating weekend event search...');
    
    // Get sports events from ESPN
    const espnResponse = await axios.get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    const sportsEvents = espnResponse.data.events || [];
    
    // Get concerts from Ticketmaster
    const tmResponse = await axios.get('https://app.ticketmaster.com/discovery/v2/events.json', {
      params: {
        apikey: TICKETMASTER_API_KEY,
        city: 'Austin',
        stateCode: 'TX',
        classificationName: 'music',
        size: 10,
        sort: 'date,asc'
      }
    });
    const concerts = tmResponse.data._embedded?.events || [];
    
    console.log(`✅ Integration Test: SUCCESS!`);
    console.log(`   🏀 Found ${sportsEvents.length} NBA games`);
    console.log(`   🎵 Found ${concerts.length} concerts in Austin`);
    console.log(`   🎯 Ready to match events for perfect weekends!`);
    
    return true;
  } catch (error) {
    console.log(`❌ Integration Test: FAILED - ${error.message}`);
    return false;
  }
}

// Test 6: Database Connection (if server is running)
async function testDatabase() {
  console.log('\n🗄️  Testing Database Connection...');
  try {
    const response = await axios.get('http://localhost:3001/api/health');
    console.log(`✅ Database: SUCCESS! Server is healthy`);
    console.log(`   Services: ${JSON.stringify(response.data.services)}`);
    return true;
  } catch (error) {
    console.log(`⚠️  Database: Server not running (run 'npm run dev' first)`);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  const startTime = Date.now();
  
  const results = {
    espn: await testESPN(),
    ticketmaster: await testTicketmaster(), 
    spotify: await testSpotify(),
    apple_music: await testAppleMusic(),
    integration: await testIntegration(),
    database: await testDatabase()
  };
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n===============================');
  console.log('🎯 WKND Warrior API Test Results');
  console.log('===============================');
  
  const passed = Object.values(results).filter(r => r === true).length;
  const total = Object.keys(results).length;
  
  console.log(`📊 Tests Passed: ${passed}/${total}`);
  console.log(`⏱️  Duration: ${duration}s`);
  
  if (passed === total) {
    console.log('\n🔥 ALL TESTS PASSED! Your APIs are ready to conquer weekends! 🪖');
    console.log('\nNext steps:');
    console.log('1. Run: npm run dev');
    console.log('2. Visit: http://localhost:3001/api/health');
    console.log('3. Test the frontend integration!');
  } else {
    console.log('\n⚠️  Some tests failed. Check your API keys and try again.');
  }
  
  console.log('\n🚀 Ready to build WKND Warrior!');
}

// Run the tests
runAllTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});