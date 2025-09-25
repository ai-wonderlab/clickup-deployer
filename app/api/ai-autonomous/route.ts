// app/api/ai-autonomous/route.ts
// FULLY AUTONOMOUS AI with direct ClickUp API access

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import axios from 'axios';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ClickUp API helper functions that AI can call
async function callClickUpAPI(endpoint: string, method: string, apiToken: string, data?: any) {
  const response = await axios({
    method,
    url: `https://api.clickup.com/api/v2${endpoint}`,
    headers: {
      'Authorization': apiToken,
      'Content-Type': 'application/json'
    },
    data
  });
  return response.data;
}

const AUTONOMOUS_SYSTEM_PROMPT = `You are an autonomous ClickUp deployment assistant with FULL control.

YOU CAN DIRECTLY:
1. Search and select spaces
2. Create or select folders
3. Create or select lists
4. Set template destinations
5. Initiate deployments

AVAILABLE FUNCTIONS:
- searchSpaces(): Returns all available spaces
- searchLists(spaceId): Returns lists in a space
- searchFolders(spaceId): Returns folders in a space
- createFolder(spaceId, name): Creates new folder
- createList(spaceId/folderId, name): Creates new list
- deploy(destination): Deploys template to destination

DECISION PROCESS:
1. User wants to deploy → Check template exists
2. Analyze what's missing (destination, etc)
3. Autonomously find or create destination
4. Execute deployment

RESPONSE FORMAT:
{
  "message": "What you're doing in Greek",
  "functionCalls": [
    {"name": "searchSpaces", "parameters": {}},
    {"name": "createFolder", "parameters": {"spaceId": "123", "folderName": "Q1 2025"}}
  ],
  "shouldDeploy": true/false,
  "deploymentConfig": {
    "list_id": "...",
    "space_id": "...",
    "folder_id": "..."
  }
}

EXAMPLES:

User: "Deploy στο Marketing"
You: Search spaces → Find Marketing → Check folders → Create/select → Deploy

User: "Φτιάξε νέο folder Q1 και deploy"
You: Get current space → Create folder "Q1" → Create list → Deploy

User: "Deploy στο τελευταίο project"
You: Search recent lists → Find latest → Deploy there

BE AUTONOMOUS - don't ask unnecessary questions. If user says "deploy to Marketing", find Marketing and deploy. Don't ask "which folder?" - make smart decisions or create appropriate structure.`;

export async function POST(req: NextRequest) {
  let requestData;
  
  try {
    requestData = await req.json();
    const { message, conversationHistory = [], systemState, apiToken } = requestData;

    if (!apiToken) {
      return NextResponse.json({
        message: "Χρειάζομαι το API token για να κάνω deployment. Παρακαλώ ρυθμίστε το πρώτα.",
        functionCalls: [],
        shouldDeploy: false
      });
    }

    // Build context
    let contextInfo = `
CURRENT SYSTEM STATE:
- Template Loaded: ${systemState.hasTemplate ? `Yes (${systemState.templateData?.name})` : 'No'}
- Template Has Destination: ${systemState.templateData?.hasDestination ? 'Yes' : 'No'}
- API Token: ${systemState.hasApiToken ? 'Available' : 'Missing'}
- Currently Deploying: ${systemState.deploymentState?.isDeploying ? 'Yes' : 'No'}
`;

    // Messages for OpenAI
    const messages: any[] = [
      { role: "system", content: AUTONOMOUS_SYSTEM_PROMPT }
    ];
    
    // Add conversation history
    conversationHistory.slice(-10).forEach((msg: any) => {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    });
    
    // Add current request
    messages.push({
      role: "user",
      content: `${contextInfo}\n\nUser request: ${message}`
    });

    // Get AI decision
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 800
    });

    const aiDecision = JSON.parse(completion.choices[0].message.content || '{}');
    
    // Process function calls if needed
    let functionResults = [];
    if (aiDecision.functionCalls && Array.isArray(aiDecision.functionCalls)) {
      for (const call of aiDecision.functionCalls) {
        try {
          let result = null;
          
          switch (call.name) {
            case 'searchSpaces':
                const teamRes = await callClickUpAPI('/user', 'GET', apiToken);
                const teamId = teamRes.user.teams[0].id;
                result = await callClickUpAPI(`/team/${teamId}/space`, 'GET', apiToken);
                functionResults.push({
                function: 'searchSpaces',
                result: result.spaces
              });
              break;
              
            case 'searchLists':
              if (call.parameters.spaceId) {
                result = await callClickUpAPI(`/space/${call.parameters.spaceId}/list`, 'GET', apiToken);
                functionResults.push({
                  function: 'searchLists',
                  result: result.lists
                });
              }
              break;
              
            case 'searchFolders':
              if (call.parameters.spaceId) {
                result = await callClickUpAPI(`/space/${call.parameters.spaceId}/folder`, 'GET', apiToken);
                functionResults.push({
                  function: 'searchFolders',
                  result: result.folders
                });
              }
              break;
              
            case 'createFolder':
              if (call.parameters.spaceId && call.parameters.folderName) {
                result = await callClickUpAPI(`/space/${call.parameters.spaceId}/folder`, 'POST', apiToken, {
                  name: call.parameters.folderName
                });
                functionResults.push({
                  function: 'createFolder',
                  result: result
                });
              }
              break;
              
            case 'createList':
              const endpoint = call.parameters.folderId 
                ? `/folder/${call.parameters.folderId}/list`
                : `/space/${call.parameters.spaceId}/list`;
                
              result = await callClickUpAPI(endpoint, 'POST', apiToken, {
                name: call.parameters.listName,
                content: call.parameters.description || '',
                status: 'active'
              });
              
              functionResults.push({
                function: 'createList',
                result: result
              });
              break;
          }
        } catch (error: any) {
          console.error(`Function ${call.name} failed:`, error);
          functionResults.push({
            function: call.name,
            error: error.message
          });
        }
      }
    }
    
    // If AI made API calls, analyze results and decide next step
    if (functionResults.length > 0) {
      // Send results back to AI for final decision
      messages.push({
        role: "assistant",
        content: JSON.stringify(aiDecision)
      });
      
      messages.push({
        role: "user",
        content: `Function results: ${JSON.stringify(functionResults)}. Based on these results, what should we do?`
      });
      
      const finalDecision = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-0125",
        messages: messages,
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 500
      });
      
      const finalResponse = JSON.parse(finalDecision.choices[0].message.content || '{}');
      
      // If AI found/created destination, prepare deployment config
      if (finalResponse.shouldDeploy) {
        // Extract destination from results
        const lastList = functionResults.find(r => r.function === 'createList' || r.function === 'searchLists');
        if (lastList?.result) {
          const list = Array.isArray(lastList.result) ? lastList.result[0] : lastList.result;
          finalResponse.deploymentConfig = {
            list_id: list.id,
            list_name: list.name
          };
        }
      }
      
      return NextResponse.json({
        message: finalResponse.message || aiDecision.message,
        functionCalls: [], // Already executed
        shouldDeploy: finalResponse.shouldDeploy || false,
        deploymentConfig: finalResponse.deploymentConfig || null,
        debug: { functionResults } // For debugging
      });
    }
    
    // Return initial decision
    return NextResponse.json({
      message: aiDecision.message || "Επεξεργάζομαι το αίτημά σας...",
      functionCalls: aiDecision.functionCalls || [],
      shouldDeploy: aiDecision.shouldDeploy || false,
      deploymentConfig: aiDecision.deploymentConfig || null
    });
    
  } catch (error: any) {
    console.error('Autonomous AI error:', error);
    
    return NextResponse.json({
      message: "Συγγνώμη, υπήρξε πρόβλημα με το αυτόνομο σύστημα. Δοκιμάστε ξανά.",
      functionCalls: [],
      shouldDeploy: false,
      error: error.message
    });
  }
}