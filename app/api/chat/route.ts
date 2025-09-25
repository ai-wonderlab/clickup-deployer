// app/api/chat/route.ts - WITH FULL CONVERSATION MEMORY
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful assistant for the ClickUp Deployer application. You help users deploy ClickUp templates.

IMPORTANT: You have access to the conversation history. Use it to maintain context and remember what was discussed.

AVAILABLE ACTIONS YOU CAN TRIGGER:
1. "deploy" - Deploy the current template
2. "upload" - Guide user to upload a template
3. "browse" - Help browse templates
4. "help" - Provide help information
5. null - No action needed, just conversation

CONTEXT YOU RECEIVE:
- Conversation history (previous messages)
- hasTemplate: whether a template is loaded
- hasApiToken: whether API token is set
- templateName: name of loaded template (if any)
- isDeploying: whether deployment is in progress

RESPONSE RULES:
- Always respond in Greek
- Be concise and helpful
- Remember previous context from the conversation
- Respond with JSON: {"message": "...", "action": "..."}

EXAMPLES WITH CONTEXT:
User: "Θέλω να ανεβάσω ένα template"
Assistant: "Μπορείτε να σύρετε το αρχείο JSON στη ζώνη μεταφόρτωσης."
User: "Το έκανα"
Assistant: "Τέλεια! Είδα ότι φορτώσατε το template. Τώρα μπορείτε να το κάνετε deploy."

IMPORTANT:
- Remember what the user told you earlier in the conversation
- If user refers to "αυτό" or "εκείνο", use context to understand what they mean
- Keep track of the user's progress and guide them accordingly`;

export async function POST(req: NextRequest) {
  let requestData;
  
  try {
    requestData = await req.json();
    const { message, context, conversationHistory = [] } = requestData;

    // Build conversation messages for OpenAI
    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT }
    ];
    
    // Add conversation history (last 10 messages for context)
    const recentHistory = conversationHistory.slice(-10);
    recentHistory.forEach((msg: any) => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    });
    
    // Add current context as system message
    let contextInfo = "\n[CURRENT STATE]:\n";
    if (context.hasTemplate) {
      contextInfo += `- Template loaded: ${context.templateName || 'Yes'}\n`;
    } else {
      contextInfo += "- No template loaded\n";
    }
    
    if (context.hasApiToken) {
      contextInfo += "- API token: Configured\n";
    } else {
      contextInfo += "- API token: Not configured\n";
    }
    
    if (context.conversationLength) {
      contextInfo += `- Conversation messages: ${context.conversationLength}\n`;
    }
    
    // Add current user message with context
    messages.push({
      role: "user",
      content: `${contextInfo}\n\nUser says: ${message}`
    });

    // Try to get completion
    let completion;
    let modelUsed = '';
    
    // Try models in order of preference
    const modelsToTry = [
      { name: 'gpt-4o-mini', supportsJson: true },
      { name: 'gpt-3.5-turbo-0125', supportsJson: true },
      { name: 'gpt-3.5-turbo', supportsJson: false }
    ];
    
    for (const modelConfig of modelsToTry) {
      try {
        const params: any = {
          model: modelConfig.name,
          messages: messages,
          temperature: 0.7,
          max_tokens: 500
        };
        
        if (modelConfig.supportsJson) {
          params.response_format = { type: "json_object" };
        }
        
        completion = await openai.chat.completions.create(params);
        modelUsed = modelConfig.name;
        console.log(`Successfully used model: ${modelUsed}`);
        break;
      } catch (error: any) {
        console.error(`Failed with ${modelConfig.name}:`, error?.message);
        continue;
      }
    }
    
    if (!completion) {
      throw new Error('All models failed');
    }

    const responseText = completion.choices[0].message.content || '{}';
    
    // Parse response
    let response;
    try {
      response = JSON.parse(responseText);
    } catch (e) {
      // If not JSON, wrap the response
      response = {
        message: responseText || "Συγγνώμη, δεν κατάλαβα.",
        action: null
      };
    }
    
    // Validate and return
    return NextResponse.json({
      message: response.message || "Συγγνώμη, δεν κατάλαβα. Μπορείτε να επαναλάβετε;",
      action: response.action || null,
      requiresInput: false,
      inputType: null,
      model: modelUsed // For debugging
    });
    
  } catch (error: any) {
    console.error('Chat API error:', error);
    
    // Intelligent fallback based on conversation context
    const message = requestData?.message || '';
    const history = requestData?.conversationHistory || [];
    const lower = message.toLowerCase();
    
    // Check if user is following up on something
    const lastUserMessage = history.filter((m: any) => m.role === 'user').pop();
    const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop();
    
    let response = {
      message: "Κατάλαβα. Πώς μπορώ να βοηθήσω;",
      action: null as string | null,
      requiresInput: false,
      inputType: null
    };

    // Context-aware responses
    if (lower.includes('ναι') || lower.includes('yes') || lower.includes('ok')) {
      // User is confirming something
      if (lastAssistantMessage?.content?.includes('deploy')) {
        response.message = "Τέλεια! Ξεκινάω την ανάπτυξη...";
        response.action = "deploy";
      } else if (lastAssistantMessage?.content?.includes('upload')) {
        response.message = "Εντάξει! Περιμένω να ανεβάσετε το αρχείο.";
        response.action = "upload";
      }
    } else if (lower.includes('το έκανα') || lower.includes('done') || lower.includes('έτοιμο')) {
      // User completed something
      response.message = "Τέλεια! Τι θέλετε να κάνουμε τώρα;";
    } else if (lower.includes('ανάπτυξη') || lower.includes('deploy')) {
      response.message = "Ξεκινάω την ανάπτυξη...";
      response.action = "deploy";
    } else if (lower.includes('ανέβασμα') || lower.includes('upload')) {
      response.message = "Μπορείτε να σύρετε το αρχείο JSON ή να κάνετε κλικ για περιήγηση.";
      response.action = "upload";
    }

    return NextResponse.json(response);
  }
}