// FIXED app/api/chat-flow/route.ts
// This version ALWAYS shows options and handles folder name input correctly

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const FLOW_SYSTEM_PROMPT = `You are controlling the ClickUp Deployer flow. 

CRITICAL RULES:
1. ALWAYS show available options in your message
2. ALWAYS return flowAction to control console
3. Handle ALL stages correctly including folder name input

STAGES AND RESPONSES:

1. stage: "initial"
   Response: "Επιλέξτε:\n1. Δημιουργία ΝΈΑ λίστα\n2. Χρήση ΥΠΆΡΧΟΥΣΑ λίστα"
   
2. stage: "select_space"  
   Response: "Επιλέξτε space:\n1. [Space 1]\n2. [Space 2]..."
   
3. stage: "select_folder_option"
   Response: "Επιλέξτε:\n1. Απευθείας στο space\n2. Σε υπάρχον folder\n3. Νέο folder"
   
4. stage: "create_new_folder"
   Response: "Πληκτρολογήστε το όνομα του folder"
   ANY text → flowAction: {type: "input_text", text: "folder_name"}
   
5. stage: "select_existing_folder"
   Response: "Επιλέξτε folder:\n1. [Folder 1]\n2. [Folder 2]..."

IMPORTANT: ALWAYS include the numbered options in the message!`;

export async function POST(req: NextRequest) {
  let requestData;
  
  try {
    requestData = await req.json();
    const { message, conversationHistory = [], fullContext } = requestData;

    const stage = fullContext.deploymentFlow?.stage;
    const waitingForInput = fullContext.waitingForInput;
    const userMessage = message.toLowerCase().trim();
    
    console.log('🎯 Stage:', stage, '| User:', message, '| Waiting:', waitingForInput);

    // Build options for display
    let optionsDisplay = '';
    let flowAction = null;
    let responseMessage = '';
    
    // Handle each stage
    if (waitingForInput && stage) {
      
      // STAGE: INITIAL
      if (stage === 'initial') {
        optionsDisplay = "1. Δημιουργία ΝΈΑ λίστα\n2. Χρήση ΥΠΆΡΧΟΥΣΑ λίστα";
        
        if (userMessage.includes('νέα') || userMessage.includes('new') || userMessage === '1') {
          flowAction = { type: 'select_option', choice: '1' };
          
          // Show spaces immediately
          if (fullContext.availableOptions?.spaces) {
            let spacesDisplay = "Επιλέξτε space:\n";
            fullContext.availableOptions.spaces.forEach((s: any, i: number) => {
              spacesDisplay += `${i + 1}. ${s.name}\n`;
            });
            responseMessage = `Εντάξει! Δημιουργία νέας λίστας.\n\n${spacesDisplay}`;
          } else {
            responseMessage = "Εντάξει! Δημιουργία νέας λίστας. Φορτώνω spaces...";
          }
        } else if (userMessage.includes('υπάρχ') || userMessage.includes('exist') || userMessage === '2') {
          flowAction = { type: 'select_option', choice: '2' };
          responseMessage = "Εντάξει! Θα χρησιμοποιήσω υπάρχουσα λίστα.";
        } else {
          responseMessage = `Παρακαλώ επιλέξτε:\n\n${optionsDisplay}`;
        }
      }
      
      // STAGE: SELECT SPACE
      else if (stage === 'select_space' && fullContext.availableOptions?.spaces) {
        const spaces = fullContext.availableOptions.spaces;
        
        // Always build options display
        optionsDisplay = "Διαθέσιμα Spaces:\n";
        spaces.forEach((s: any, i: number) => {
          optionsDisplay += `${i + 1}. ${s.name}\n`;
        });
        
        // Check for number
        const num = message.match(/^\d+$/);
        if (num) {
          flowAction = { type: 'select_option', choice: num[0] };
          const idx = parseInt(num[0]) - 1;
          if (spaces[idx]) {
            responseMessage = `Επιλέξατε το space "${spaces[idx].name}".\n\nΕπιλέξτε:\n1. Απευθείας στο space (χωρίς folder)\n2. Σε υπάρχον folder\n3. Δημιουργία νέου folder`;
          }
        } else {
          // Try to match space name
          for (let i = 0; i < spaces.length; i++) {
            if (userMessage.includes(spaces[i].name.toLowerCase()) || 
                spaces[i].name.toLowerCase().includes(userMessage)) {
              flowAction = { type: 'select_option', choice: String(i + 1) };
              responseMessage = `Επιλέξατε το space "${spaces[i].name}".\n\nΕπιλέξτε:\n1. Απευθείας στο space (χωρίς folder)\n2. Σε υπάρχον folder\n3. Δημιουργία νέου folder`;
              break;
            }
          }
          
          // Special case for "ai inside dev"
          if (!flowAction && userMessage.includes('inside')) {
            const aiSpace = spaces.findIndex((s: any) => s.name.includes('Inside Dev'));
            if (aiSpace >= 0) {
              flowAction = { type: 'select_option', choice: String(aiSpace + 1) };
              responseMessage = `Επιλέξατε το space "${spaces[aiSpace].name}".\n\nΕπιλέξτε:\n1. Απευθείας στο space (χωρίς folder)\n2. Σε υπάρχον folder\n3. Δημιουργία νέου folder`;
            }
          }
        }
        
        // If user asks for options or no match
        if (!flowAction || userMessage.includes('διαθεσιμ') || userMessage.includes('επιλογ')) {
          responseMessage = `${optionsDisplay}\n\nΕπιλέξτε με αριθμό (1-${spaces.length})`;
        }
      }
      
      // STAGE: FOLDER OPTION
      else if (stage === 'select_folder_option') {
        optionsDisplay = "1. Απευθείας στο space (χωρίς folder)\n2. Σε υπάρχον folder\n3. Δημιουργία νέου folder";
        
        if (userMessage.includes('απευθείας') || userMessage.includes('direct') || userMessage === '1') {
          flowAction = { type: 'select_option', choice: '1' };
          responseMessage = "Δημιουργία λίστας απευθείας στο space...";
        } else if (userMessage.includes('υπάρχ') || userMessage.includes('exist') || userMessage === '2') {
          flowAction = { type: 'select_option', choice: '2' };
          
          // Show existing folders if available
          if (fullContext.availableOptions?.folders && fullContext.availableOptions.folders.length > 0) {
            let foldersDisplay = "Διαθέσιμα folders:\n";
            fullContext.availableOptions.folders.forEach((f: any, i: number) => {
              foldersDisplay += `${i + 1}. ${f.name}\n`;
            });
            responseMessage = `Εντάξει! Επιλέξτε folder:\n\n${foldersDisplay}`;
          } else {
            responseMessage = "Φορτώνω folders...";
          }
        } else if (userMessage.includes('νέο') || userMessage.includes('new') || userMessage === '3') {
          flowAction = { type: 'select_option', choice: '3' };
          responseMessage = "Πληκτρολογήστε το όνομα του νέου folder:";
        } else if (userMessage.includes('επιλογ') || userMessage.includes('διαθεσ')) {
          responseMessage = `Επιλέξτε:\n\n${optionsDisplay}`;
        } else {
          responseMessage = `Παρακαλώ επιλέξτε:\n\n${optionsDisplay}`;
        }
      }
      
      // STAGE: CREATE NEW FOLDER - FIX THIS!
      else if (stage === 'create_new_folder') {
        // ANY text input should be treated as folder name
        if (message && message.trim().length > 0) {
          flowAction = { type: 'input_text', text: message.trim() };
          responseMessage = `Δημιουργία folder "${message.trim()}"...`;
          console.log('📁 Creating folder with name:', message.trim());
        } else {
          responseMessage = "Πληκτρολογήστε το όνομα του νέου folder:";
        }
      }
      
      // STAGE: SELECT EXISTING FOLDER
      else if (stage === 'select_existing_folder' && fullContext.availableOptions?.folders) {
        const folders = fullContext.availableOptions.folders;
        
        // Always build options
        optionsDisplay = "Διαθέσιμα Folders:\n";
        folders.forEach((f: any, i: number) => {
          optionsDisplay += `${i + 1}. ${f.name}\n`;
        });
        
        // Check for number
        const num = message.match(/^\d+$/);
        if (num) {
          flowAction = { type: 'select_option', choice: num[0] };
          const idx = parseInt(num[0]) - 1;
          if (folders[idx]) {
            responseMessage = `Επιλέξατε το folder "${folders[idx].name}". Δημιουργία λίστας...`;
          }
        } else {
          // Try to match folder name
          for (let i = 0; i < folders.length; i++) {
            if (userMessage.includes(folders[i].name.toLowerCase())) {
              flowAction = { type: 'select_option', choice: String(i + 1) };
              responseMessage = `Επιλέξατε το folder "${folders[i].name}". Δημιουργία λίστας...`;
              break;
            }
          }
        }
        
        if (!flowAction) {
          responseMessage = `${optionsDisplay}\n\nΕπιλέξτε με αριθμό (1-${folders.length})`;
        }
      }
    }
    
    // If no stage but user asks for help
    else if (!stage && !waitingForInput) {
      if (userMessage.includes('επιλογ') || userMessage.includes('διαθεσ') || userMessage.includes('help')) {
        responseMessage = "Για να ξεκινήσετε deployment, πείτε 'νέα λίστα' ή 'ανάπτυξη'";
      } else {
        responseMessage = "Πώς μπορώ να βοηθήσω; Για deployment πείτε 'νέα λίστα' ή 'ανάπτυξη'";
      }
    }
    
    // Fallback to AI only if really needed
    if (!flowAction && !responseMessage && waitingForInput) {
      const messages: any[] = [
        { role: "system" as const, content: FLOW_SYSTEM_PROMPT },
        { 
          role: "user" as const, 
          content: `Stage: ${stage}\nUser said: "${message}"\n\nReturn appropriate flowAction and message with options!`
        }
      ];
      
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo-0125",
          messages: messages,
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 500
        });
        
        const aiResponse = JSON.parse(completion.choices[0].message.content || '{}');
        flowAction = aiResponse.flowAction;
        responseMessage = aiResponse.message || "Επεξεργάζομαι...";
      } catch (e) {
        console.error('AI error:', e);
        responseMessage = "Παρακαλώ δοκιμάστε ξανά";
      }
    }
    
    console.log('✅ Response:', { 
      stage,
      flowAction, 
      hasMessage: !!responseMessage 
    });
    
    return NextResponse.json({
      message: responseMessage || "Επεξεργάζομαι...",
      action: null,
      flowAction: flowAction,
      requiresInput: false,
      inputType: null
    });
    
  } catch (error: any) {
    console.error('❌ Flow API error:', error);
    
    return NextResponse.json({
      message: "Παρακαλώ δοκιμάστε ξανά",
      action: null,
      flowAction: null
    });
  }
}