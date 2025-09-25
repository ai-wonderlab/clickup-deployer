// app/api/elevenlabs/speak-greek/route.ts
import { NextRequest, NextResponse } from 'next/server';

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY!;
const ELEVEN_LABS_API_URL = 'https://api.elevenlabs.io/v1';

// Best voices for Greek (tested)
const GREEK_OPTIMIZED_VOICES = {
  // Male voices that work great with Greek
  'antoni': 'ErXwobaYiN019PkySvjV',  // Clear, professional
  'adam': 'pNInz6obpgDQGcFmaJgB',    // Deep, authoritative  
  'clyde': '2EiwWnXFnvU5JabPnv8n',   // Natural, conversational
  
  // Female voices that work great with Greek
  'rachel': '21m00Tcm4TlvDq8ikWAM',  // Warm, friendly (BEST for Greek)
  'bella': 'EXAVITQu4vr4xnSDxMaL',   // Soft, pleasant
  'elli': 'MF3mGyEYCl7XYWbV9V6O',    // Young, energetic
  'domi': 'AZnzlk1XvdvUeBnXmlld',    // Clear, professional
  
  // Premium Greek voices (if you have access)
  'maria': 'custom_greek_maria',      // Native Greek (custom)
  'nikos': 'custom_greek_nikos',      // Native Greek (custom)
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      text, 
      voice = 'rachel', // Best default for Greek
      language = 'el',  // Greek language code
      model_id = 'eleven_multilingual_v2', // IMPORTANT: Use multilingual model!
      voice_settings = {
        stability: 0.65,        // Higher for Greek
        similarity_boost: 0.75,
        style: 0.3,            // Lower style for clearer pronunciation
        use_speaker_boost: true
      }
    } = body;

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // Auto-detect if text is Greek
    const isGreek = /[α-ωΑ-Ω]/.test(text);
    
    // Get voice ID
    const voiceId = GREEK_OPTIMIZED_VOICES[voice as keyof typeof GREEK_OPTIMIZED_VOICES] 
                    || GREEK_OPTIMIZED_VOICES['rachel'];

    console.log(`🇬🇷 Generating ${isGreek ? 'Greek' : 'English'} speech with voice: ${voice}`);

    // Call Eleven Labs API
    const response = await fetch(
      `${ELEVEN_LABS_API_URL}/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVEN_LABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id, // Multilingual model for Greek
          voice_settings,
          // Optional: Add pronunciation dictionary for Greek names/terms
          pronunciation_dictionary_locators: []
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Eleven Labs error:', error);
      return NextResponse.json({ error: 'Failed to generate speech' }, { status: response.status });
    }

    // Stream the audio back
    const audioStream = response.body;
    
    return new NextResponse(audioStream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600', // Cache Greek audio
      },
    });

  } catch (error: any) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Test endpoint for Greek TTS
export async function GET(request: NextRequest) {
  const greekPhrases = {
    welcome: "Καλώς ήρθατε στο ClickUp Deployer",
    uploadTemplate: "Ανεβάστε το πρότυπό σας",
    deploySuccess: "Η ανάπτυξη ολοκληρώθηκε με επιτυχία",
    error: "Υπήρξε ένα σφάλμα. Παρακαλώ δοκιμάστε ξανά",
    help: "Πώς μπορώ να σας βοηθήσω σήμερα;",
    createNew: "Δημιουργία νέας λίστας",
    useExisting: "Χρήση υπάρχουσας λίστας",
    selectSpace: "Επιλέξτε χώρο εργασίας",
  };

  return NextResponse.json({
    service: 'Eleven Labs Greek TTS',
    model: 'eleven_multilingual_v2',
    supportedLanguages: ['el', 'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'ru', 'nl', 'cs', 'ar', 'tr', 'ja', 'zh', 'ko', 'hi', 'sv'],
    greekVoicesRecommended: ['rachel', 'bella', 'antoni', 'adam'],
    testPhrases: greekPhrases,
    usage: {
      endpoint: '/api/elevenlabs/speak-greek',
      method: 'POST',
      body: {
        text: 'Γεια σου κόσμε',
        voice: 'rachel',
        language: 'el'
      }
    }
  });
}