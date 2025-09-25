// lib/greek-voice-config.ts
// Ελληνική διαμόρφωση για Voice Assistant

export const GREEK_TRANSLATIONS = {
  // System messages
  system: {
    welcome: "Καλώς ήρθατε στο ClickUp Deployer! Πώς μπορώ να σας βοηθήσω;",
    ready: "Έτοιμος για εντολές",
    listening: "Σας ακούω...",
    thinking: "Σκέφτομαι...",
    speaking: "Μιλάω...",
    clickToTalk: "Κάντε κλικ για να μιλήσετε",
    error: "Συγγνώμη, υπήρξε ένα σφάλμα. Δοκιμάστε ξανά.",
  },

  // Upload & Templates
  templates: {
    uploadPrompt: "Ανεβάστε το JSON template σας ή πείτε 'άνοιγμα αρχείου'",
    templateLoaded: "Το template φορτώθηκε επιτυχώς",
    selectTemplate: "Επιλέξτε ένα template",
    browseTemplates: "Περιήγηση στα templates",
    dropFileHere: "Σύρετε το αρχείο εδώ",
    noTemplateFound: "Δεν βρέθηκαν templates",
  },

  // Deployment
  deployment: {
    starting: "Ξεκινάει η ανάπτυξη...",
    selectDestination: "Πού θέλετε να γίνει η ανάπτυξη;",
    createNew: "Δημιουργία νέας λίστας",
    useExisting: "Χρήση υπάρχουσας λίστας",
    selectSpace: "Επιλέξτε χώρο εργασίας",
    selectFolder: "Επιλέξτε φάκελο",
    selectList: "Επιλέξτε λίστα",
    deploymentSuccess: "Η ανάπτυξη ολοκληρώθηκε με επιτυχία!",
    deploymentFailed: "Η ανάπτυξη απέτυχε",
    phasesCreated: "φάσεις δημιουργήθηκαν",
    actionsCreated: "ενέργειες δημιουργήθηκαν",
    checklistsCreated: "λίστες ελέγχου δημιουργήθηκαν",
  },

  // Voice commands (what user can say in Greek)
  voiceCommands: {
    // Upload commands
    "άνοιγμα αρχείου": "upload",
    "ανέβασμα": "upload",
    "φόρτωση template": "upload",
    
    // Deploy commands
    "ανάπτυξη": "deploy",
    "εκτέλεση": "deploy",
    "ξεκίνα": "deploy",
    "τρέξε": "deploy",
    
    // Navigation
    "νέα λίστα": "new",
    "καινούργια": "new",
    "δημιουργία": "new",
    "υπάρχουσα": "existing",
    "χρήση υπάρχουσας": "existing",
    
    // Help
    "βοήθεια": "help",
    "τι μπορείς να κάνεις": "help",
    "οδηγίες": "help",
    
    // Confirmation
    "ναι": "yes",
    "όχι": "no",
    "σωστά": "yes",
    "ακύρωση": "cancel",
    "σταμάτα": "stop",
    
    // Numbers in Greek
    "πρώτο": "1",
    "δεύτερο": "2",
    "τρίτο": "3",
    "τέταρτο": "4",
    "πέμπτο": "5",
    "ένα": "1",
    "δύο": "2",
    "τρία": "3",
    "τέσσερα": "4",
    "πέντε": "5",
  },

  // Conversational responses
  responses: {
    greeting: {
      morning: "Καλημέρα! Είμαι έτοιμος να σας βοηθήσω με τα templates.",
      afternoon: "Καλό απόγευμα! Τι θα θέλατε να κάνουμε σήμερα;",
      evening: "Καλησπέρα! Ετοιμάζεστε για κάποια ανάπτυξη;",
    },
    
    confirmation: {
      understood: "Κατάλαβα. Προχωράω με",
      willDo: "Αμέσως! Ξεκινάω",
      gotIt: "Εντάξει, το κατάλαβα",
      sure: "Βεβαίως, αμέσως",
    },
    
    clarification: {
      didntUnderstand: "Συγγνώμη, δεν κατάλαβα. Μπορείτε να το επαναλάβετε;",
      notSure: "Δεν είμαι σίγουρος τι εννοείτε. Θέλετε να",
      options: "Οι επιλογές σας είναι",
      tryAgain: "Ας δοκιμάσουμε ξανά. Τι θα θέλατε;",
    },
    
    errors: {
      noTemplate: "Πρέπει πρώτα να φορτώσετε ένα template",
      noApiKey: "Χρειάζεται το API token για να συνεχίσω",
      connectionError: "Πρόβλημα σύνδεσης. Ελέγξτε το δίκτυο",
      deploymentError: "Η ανάπτυξη απέτυχε. Θέλετε να δοκιμάσουμε ξανά;",
    },
    
    success: {
      great: "Τέλεια!",
      done: "Έγινε!",
      completed: "Ολοκληρώθηκε!",
      ready: "Έτοιμο!",
    },
  },

  // UI Elements
  ui: {
    buttons: {
      deploy: "Ανάπτυξη",
      upload: "Ανέβασμα",
      browse: "Περιήγηση",
      save: "Αποθήκευση",
      cancel: "Ακύρωση",
      retry: "Δοκιμή ξανά",
      help: "Βοήθεια",
    },
    
    labels: {
      apiToken: "API Token",
      templateListId: "ID Λίστας Templates",
      configuration: "Ρυθμίσεις",
      status: "Κατάσταση",
      console: "Κονσόλα",
      conversation: "Συνομιλία",
    },
    
    placeholders: {
      enterToken: "Εισάγετε το API token",
      selectSpace: "Επιλέξτε χώρο",
      folderName: "Όνομα φακέλου",
      searchTemplates: "Αναζήτηση templates",
    },
  }
};

// Helper function to get Greek month names
export const getGreekMonth = (month: number): string => {
  const months = [
    'Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου',
    'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου',
    'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'
  ];
  return months[month];
};

// Helper function to get Greek day names
export const getGreekDay = (day: number): string => {
  const days = [
    'Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη',
    'Πέμπτη', 'Παρασκευή', 'Σάββατο'
  ];
  return days[day];
};

// Greek number converter (1-100)
export const numberToGreek = (num: number): string => {
  const greekNumbers: { [key: number]: string } = {
    1: 'ένα', 2: 'δύο', 3: 'τρία', 4: 'τέσσερα', 5: 'πέντε',
    6: 'έξι', 7: 'επτά', 8: 'οκτώ', 9: 'εννέα', 10: 'δέκα',
    11: 'έντεκα', 12: 'δώδεκα', 13: 'δεκατρία', 14: 'δεκατέσσερα',
    15: 'δεκαπέντε', 16: 'δεκαέξι', 17: 'δεκαεπτά', 18: 'δεκαοκτώ',
    19: 'δεκαεννέα', 20: 'είκοσι', 30: 'τριάντα', 40: 'σαράντα',
    50: 'πενήντα', 60: 'εξήντα', 70: 'εβδομήντα', 80: 'ογδόντα',
    90: 'ενενήντα', 100: 'εκατό'
  };

  if (greekNumbers[num]) return greekNumbers[num];
  
  if (num < 100) {
    const tens = Math.floor(num / 10) * 10;
    const ones = num % 10;
    return `${greekNumbers[tens]} ${greekNumbers[ones]}`;
  }
  
  return num.toString(); // Fallback to number
};

// Voice command processor for Greek
export const processGreekVoiceCommand = (transcript: string): string => {
  const lowerTranscript = transcript.toLowerCase().trim();
  
  // Check each command pattern
  for (const [greekCommand, englishAction] of Object.entries(GREEK_TRANSLATIONS.voiceCommands)) {
    if (lowerTranscript.includes(greekCommand)) {
      return englishAction;
    }
  }
  
  // Check for space/list names (they might say them in Greek or English)
  // Return the transcript as-is for name matching
  return transcript;
};

// Format Greek date
export const formatGreekDate = (date: Date): string => {
  const day = date.getDate();
  const month = getGreekMonth(date.getMonth());
  const year = date.getFullYear();
  const dayName = getGreekDay(date.getDay());
  
  return `${dayName}, ${day} ${month} ${year}`;
};

// Get appropriate Greek greeting based on time
export const getGreekGreeting = (): string => {
  const hour = new Date().getHours();
  
  if (hour < 12) {
    return GREEK_TRANSLATIONS.responses.greeting.morning;
  } else if (hour < 18) {
    return GREEK_TRANSLATIONS.responses.greeting.afternoon;
  } else {
    return GREEK_TRANSLATIONS.responses.greeting.evening;
  }
};

// Example Greek assistant responses for common scenarios
export const GREEK_ASSISTANT_RESPONSES = {
  // When template is uploaded
  onTemplateUpload: (templateName: string, phases: number) => 
    `Τέλεια! Φόρτωσα το template "${templateName}". Έχει ${numberToGreek(phases)} φάσεις. Πείτε "ανάπτυξη" όταν είστε έτοιμοι!`,
  
  // When asking for destination
  onDestinationNeeded: () =>
    `Το template δεν έχει προορισμό. Θέλετε να δημιουργήσω ΝΕΑ λίστα ή να χρησιμοποιήσω ΥΠΑΡΧΟΥΣΑ; Πείτε "νέα" ή "υπάρχουσα".`,
  
  // When deployment succeeds
  onDeploymentSuccess: (phases: number, actions: number) =>
    `Εξαιρετικά! Η ανάπτυξη ολοκληρώθηκε! Δημιούργησα ${numberToGreek(phases)} φάσεις και ${numberToGreek(actions)} ενέργειες.`,
  
  // When deployment fails
  onDeploymentError: (error: string) =>
    `Ωχ! Κάτι πήγε στραβά: ${error}. Θέλετε να δοκιμάσουμε ξανά; Πείτε "ναι" ή "όχι".`,
  
  // When waiting for selection
  onWaitingForChoice: (options: string[]) =>
    `Παρακαλώ επιλέξτε: ${options.map((opt, i) => `${numberToGreek(i+1)} για ${opt}`).join(', ')}`,
};

// Export configuration for Eleven Labs Greek voices
export const ELEVEN_LABS_GREEK_CONFIG = {
  model: 'eleven_multilingual_v2', // MUST use multilingual
  language: 'el',
  voice_settings: {
    stability: 0.65,
    similarity_boost: 0.75,
    style: 0.3, // Lower for clearer Greek
    use_speaker_boost: true
  },
  recommended_voices: {
    female: ['rachel', 'bella', 'elli'],
    male: ['antoni', 'adam', 'clyde']
  }
};