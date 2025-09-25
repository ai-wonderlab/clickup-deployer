'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Zap, Check, X, AlertTriangle, FileJson, ChevronRight, 
  Terminal, ChevronUp, ChevronDown, Library, File, Save, Clock, Hash,
  Mic, MicOff, MessageSquare, Bot, User, Sparkles, Send
} from 'lucide-react';
import { GREEK_TRANSLATIONS } from '@/lib/greek-voice-config';
import VoiceInput from '../components/VoiceInput';


// ============================
// INTERFACES & TYPES
// ============================

interface TemplateMetadata {
  id: string;
  name: string;
  version: string;
  slug: string;
  description?: string;
  taskId: string;
  createdAt: string;
  deployCount: number;
  lastDeployed?: string;
}

interface ConversationMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  actionType?: 'choice' | 'input' | 'confirmation';
  options?: any[];
}

// ============================
// MAIN HOME COMPONENT
// ============================

export default function Home() {
  const { data: session, status } = useSession();
  const [template, setTemplate] = useState<any>(null);
  const [apiToken, setApiToken] = useState('');
  const [templateListId, setTemplateListId] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState<any>(null);
  const [showTokenWarning, setShowTokenWarning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [terminalExpanded, setTerminalExpanded] = useState(false);
  const [inputMode, setInputMode] = useState<'upload' | 'browse'>('upload');
  const [templates, setTemplates] = useState<TemplateMetadata[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveMetadata, setSaveMetadata] = useState({ name: '', changelog: '' });
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [inputPrompt, setInputPrompt] = useState('');
  const [userInput, setUserInput] = useState('');
  const [availableOptions, setAvailableOptions] = useState<any>({});
  const [loadingClickUpStructure, setLoadingClickUpStructure] = useState(false);
  
  // Voice & Conversation States
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [conversationMode, setConversationMode] = useState(true); // DEFAULT TO TRUE
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [lastAssistantMessage, setLastAssistantMessage] = useState('');
  const [aiMode, setAiMode] = useState<'enhanced' | 'autonomous'>('enhanced');
  
  // Message input state and ref
  const [messageInput, setMessageInput] = useState('');
  const messageInputRef = useRef<HTMLInputElement>(null);
  
  // Refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);


  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Auto-scroll conversation
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [conversation]);

  // Initialize conversation with welcome message
  useEffect(() => {
    if (session && conversation.length === 0) {
      setConversationMode(true);
      addConversationMessage('assistant', 'Γεια σας! Πώς μπορώ να βοηθήσω με τα ClickUp templates; Μπορείτε να γράψετε ή να χρησιμοποιήσετε το μικρόφωνο.');
    }
  }, [session]);

  // Load API token and template list ID
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          if (config.apiToken) setApiToken(config.apiToken);
          if (config.templateListId) setTemplateListId(config.templateListId);
        } else {
          const savedListId = localStorage.getItem('templateListId');
          if (savedListId) setTemplateListId(savedListId);
        }
      } catch (error) {
        console.error('Failed to load config:', error);
        const savedListId = localStorage.getItem('templateListId');
        if (savedListId) setTemplateListId(savedListId);
      }
    };

    if (session) {
      loadConfig();
    }
  }, [session]);

  // Save template list ID
  useEffect(() => {
    if (templateListId) {
      localStorage.setItem('templateListId', templateListId);
    }
  }, [templateListId]);

  // Add conversation message
  const addConversationMessage = (type: 'user' | 'assistant' | 'system', content: string, actionType?: string, options?: any[]) => {
    const message: ConversationMessage = {
      id: Date.now().toString(),
      type,
      content,
      timestamp: new Date(),
      actionType: actionType as any,
      options
    };
    
    setConversation(prev => [...prev, message]);
    
    // If assistant message, trigger voice
    if (type === 'assistant') {
      setLastAssistantMessage(content);
    }
  };

  // Handle message submit
  const handleMessageSubmit = () => {
    if (!messageInput.trim()) return;
    
    const userMessage = messageInput.trim();
    setMessageInput('');
    setConversationMode(true);
    
    // Process the message with appropriate AI mode
    if (aiMode === 'autonomous') {
      handleAIAutonomousDeployment(userMessage);
    } else {
      handleVoiceInput(userMessage);
    }
  };

  // Add log helper
  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' | 'input' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const hasEmoji = /^[🔐🔍✅❌📦📌📤👁⏱️🚀═]/.test(message);
    if (hasEmoji || type === 'input') {
      setLogs(prev => [...prev, message === '' ? '' : `[${timestamp}] ${message}`]);
    } else {
      const prefix = {
        info: '→',
        success: '✓',
        error: '✗',
        warning: '⚠'
      }[type];
      setLogs(prev => [...prev, `[${timestamp}] ${prefix} ${message}`]);
    }
  };

  // Load templates
  const loadTemplates = async () => {
    if (!apiToken || !templateListId) {
      addLog('API token and Template List ID required to browse templates', 'warning');
      return;
    }

    setLoadingTemplates(true);
    addLog('Loading templates from ClickUp...', 'info');

    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, templateListId })
      });

      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates);
        addLog(`Loaded ${data.templates.length} templates`, 'success');
      } else {
        addLog('Failed to load templates', 'error');
      }
    } catch (error) {
      addLog('Error loading templates', 'error');
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Load template content
  const loadTemplateContent = async (taskId: string) => {
    if (!apiToken || !taskId) return;

    addLog(`Loading template ${taskId}...`, 'info');
    
    try {
      const response = await fetch('/api/templates/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, templateListId, taskId })
      });

      const data = await response.json();
      if (data.success && data.template) {
        setTemplate(data.template);
        addLog(`Template loaded: ${data.template.meta?.slug} v${data.template.meta?.version}`, 'success');
        setDeploymentResult(null);
      } else {
        addLog('Failed to load template content', 'error');
      }
    } catch (error) {
      addLog('Error loading template content', 'error');
    }
  };

  // Fetch spaces
  const fetchSpaces = async (token: string) => {
    try {
      addLog('🔄 Loading available spaces...', 'info');
      
      const teamRes = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: token })
      });
      const data = await teamRes.json();
      const spaces = data.spaces || [];
      
      addLog(`✅ Found ${spaces.length} available space(s)`, 'success');
      
      return spaces;
    } catch (error) {
      addLog('❌ Failed to fetch spaces - check API token and permissions', 'error');
      return [];
    }
  };

  // Fetch all lists
  const fetchAllLists = async (token: string) => {
    try {
      addLog('🔄 Fetching ClickUp spaces...', 'info');
      
      const spacesRes = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: token })
      });
      const spacesData = await spacesRes.json();
      const spaces = spacesData.spaces || [];
      
      addLog(`📂 Found ${spaces.length} space(s). Loading structure...`, 'info');
      
      let allLists: any[] = [];
      let failedSpaces = 0;
      let processedSpaces = 0;
      
      for (const space of spaces) {
        try {
          processedSpaces++;
          addLog(`🔍 [${processedSpaces}/${spaces.length}] Processing space: "${space.name}"`, 'info');
          
          // Get folders
          let folders: any[] = [];
          try {
            const foldersRes = await fetch('/api/folders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiToken: token, spaceId: space.id })
            });
            const foldersData = await foldersRes.json();
            folders = foldersData.folders || [];
            
            if (folders.length > 0) {
              addLog(`  📁 Found ${folders.length} folder(s) in "${space.name}"`, 'info');
            }
          } catch (error) {
            addLog(`  ⚠️ Could not fetch folders for space "${space.name}"`, 'warning');
          }
          
          // Get lists in folders
          let folderListCount = 0;
          for (const folder of folders) {
            try {
              addLog(`  🔍 Checking folder: "${folder.name}"`, 'info');
              
              const listsRes = await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiToken: token, folderId: folder.id, getLists: true })
              });
              const listsData = await listsRes.json();
              const lists = listsData.lists || [];
              
              if (lists.length > 0) {
                addLog(`    📋 Found ${lists.length} list(s) in "${folder.name}"`, 'info');
                folderListCount += lists.length;
              }
              
              allLists.push(...lists.map((list: any) => ({
                ...list,
                path: `${space.name} / ${folder.name} / ${list.name}`,
                spaceId: space.id,
                folderId: folder.id
              })));
            } catch (error) {
              addLog(`    ⚠️ Could not fetch lists for folder "${folder.name}"`, 'warning');
            }
          }
          
          // Get direct lists
          let directListCount = 0;
          try {
            const listsRes = await fetch('/api/spaces', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiToken: token, spaceId: space.id, getLists: true })
            });
            const listsData = await listsRes.json();
            const lists = listsData.lists || [];
            directListCount = lists.length;
            
            if (lists.length > 0) {
              addLog(`  📋 Found ${lists.length} direct list(s) in "${space.name}"`, 'info');
            }
            
            allLists.push(...lists.map((list: any) => ({
              ...list,
              path: `${space.name} / ${list.name}`,
              spaceId: space.id
            })));
          } catch (error) {
            addLog(`  ⚠️ Could not fetch direct lists for space "${space.name}"`, 'warning');
          }
          
          const spaceTotal = folderListCount + directListCount;
          if (spaceTotal > 0) {
            addLog(`✅ Space "${space.name}": ${spaceTotal} total lists`, 'success');
          }
          
        } catch (error) {
          failedSpaces++;
          addLog(`❌ Error processing space "${space.name}"`, 'error');
        }
      }
      
      addLog('', 'info');
      addLog(`🎯 Scan complete! Found ${allLists.length} total lists`, 'success');
      
      return allLists;
    } catch (error) {
      addLog('❌ Failed to fetch spaces', 'error');
      return [];
    }
  };

  // Fetch folders in space
  const fetchFoldersInSpace = async (spaceId: string) => {
    try {
      addLog('🔄 Loading folders in space...', 'info');
      
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, spaceId })
      });
      const data = await response.json();
      const folders = data.folders || [];
      
      addLog(`📁 Found ${folders.length} folder(s)`, folders.length > 0 ? 'success' : 'info');
      
      return folders;
    } catch (error) {
      addLog('❌ Failed to fetch folders', 'error');
      return [];
    }
  };

  // Create new folder
  const createNewFolder = async (spaceId: string, folderName: string) => {
    try {
      addLog(`🔄 Creating folder "${folderName}"...`, 'info');
      
      const response = await fetch('/api/folders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, spaceId, folderName })
      });
      const data = await response.json();
      
      if (data.success) {
        addLog(`✅ Created folder: ${data.folder.name}`, 'success');
        return data.folder;
      } else {
        addLog(`❌ Error creating folder: ${data.error}`, 'error');
        return null;
      }
    } catch (error) {
      addLog('❌ Failed to create folder', 'error');
      return null;
    }
  };

  // ENHANCED AI DEPLOYMENT FLOW
  // This version lets AI control the entire deployment conversation
  // FIX for handleVoiceInput in page.tsx (around line 705-900)
  // This ensures AI always knows the current console state

  // FIX for handleVoiceInput - Start deployment when user asks for it!
  // Replace the handleVoiceInput function in page.tsx

  const handleVoiceInput = async (transcript: string) => {
    addConversationMessage('user', transcript);
    setIsProcessingVoice(true);
    setConversationMode(true);
    
    try {
      const useAI = process.env.NEXT_PUBLIC_USE_OPENAI === 'true';
      const lowerTranscript = transcript.toLowerCase().trim();
      
      // CRITICAL FIX: Check if user wants to start deployment
      if (!waitingForInput && !isDeploying) {
        // User wants to deploy or create new list
        if (lowerTranscript.includes('νέα λίστα') || 
            lowerTranscript.includes('νεα λιστα') ||
            lowerTranscript.includes('new list') ||
            lowerTranscript.includes('deploy') ||
            lowerTranscript.includes('ανάπτυξη')) {
          
          // Check prerequisites
          if (!apiToken) {
            addConversationMessage('assistant', 'Χρειάζεστε API token. Προσθέστε το στις ρυθμίσεις.');
            setIsProcessingVoice(false);
            return;
          }
          
          if (!template) {
            addConversationMessage('assistant', 'Παρακαλώ φορτώστε πρώτα ένα template πριν ξεκινήσετε το deployment.');
            setIsProcessingVoice(false);
            return;
          }
          
          // START THE DEPLOYMENT FLOW!
          console.log('🚀 Starting deployment flow from voice command');
          
          setIsDeploying(false);
          setDeploymentResult(null);
          setLogs([]);
          setTerminalExpanded(true);
          
          addLog('🔍 Starting deployment from voice command...', 'info');
          addLog('Let\'s find where to deploy this template...', 'info');
          addLog('', 'info');
          
          // Load spaces and lists
          setLoadingClickUpStructure(true);
          const spaces = await fetchSpaces(apiToken);
          const lists = await fetchAllLists(apiToken);
          setLoadingClickUpStructure(false);
          
          addLog('Choose an option:', 'info');
          addLog('[1] Create NEW list in a space/folder', 'info');
          addLog('[2] Use EXISTING list', 'info');
          addLog('', 'info');
          
          setInputPrompt('Enter choice (1-2): ');
          setWaitingForInput(true);
          setAvailableOptions({ mode: 'initial', spaces, lists });
          
          // Now handle the specific request
          if (lowerTranscript.includes('νέα') || lowerTranscript.includes('new')) {
            // Auto-select option 1
            setTimeout(() => {
              console.log('📝 Auto-selecting NEW list option');
              processChoice('1');
              addConversationMessage('assistant', 'Εντάξει! Δημιουργία νέας λίστας. Σε ποιο space θέλετε;');
            }, 500);
          } else {
            addConversationMessage('assistant', 'Το deployment ξεκίνησε. Θέλετε ΝΈΑ λίστα (1) ή ΥΠΆΡΧΟΥΣΑ (2);');
          }
          
          setIsProcessingVoice(false);
          return;
        }
      }
      
      // If already in deployment flow, use AI
      if (useAI && (waitingForInput || availableOptions.mode)) {
        // Build complete context
        const fullContext = {
          hasTemplate: !!template,
          hasApiToken: !!apiToken,
          templateName: template?.meta?.slug,
          isDeploying,
          
          // Console state
          waitingForInput,
          inputPrompt,
          
          // Available options
          availableOptions: {
            mode: availableOptions.mode,
            spaces: availableOptions.spaces?.map((s: any) => ({ 
              id: s.id, 
              name: s.name 
            })),
            lists: availableOptions.lists?.map((l: any) => ({ 
              id: l.id, 
              name: l.name, 
              path: l.path 
            })),
            folders: availableOptions.folders?.map((f: any) => ({ 
              id: f.id, 
              name: f.name 
            }))
          },
          
          // Deployment flow state
          deploymentFlow: {
            stage: availableOptions.mode, // THIS IS THE KEY!
            selectedSpace: availableOptions.selectedSpace?.name,
            selectedFolder: availableOptions.selectedFolder?.name
          },
          
          recentLogs: logs.slice(-5)
        };
        
        console.log('🎯 Sending to AI:', {
          stage: fullContext.deploymentFlow.stage,
          waiting: fullContext.waitingForInput
        });
        
        const conversationHistory = conversation.slice(-10).map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content
        }));
        
        const response = await fetch('/api/chat-flow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: transcript,
            conversationHistory,
            fullContext,
          })
        });

        if (response.ok) {
          const result = await response.json();
          
          addConversationMessage('assistant', result.message);
          
          // Execute flowAction
          if (result.flowAction) {
            console.log('🚀 Executing flowAction:', result.flowAction);
            
            if (result.flowAction.choice) {
              console.log(`📝 Processing choice: ${result.flowAction.choice}`);
              setUserInput(result.flowAction.choice);
              setTimeout(() => {
                processChoice(result.flowAction.choice);
              }, 100);
            } else if (result.flowAction.text) {
              console.log(`📝 Processing text: ${result.flowAction.text}`);
              setUserInput(result.flowAction.text);
              setTimeout(() => {
                processChoice(result.flowAction.text);
              }, 100);
            }
          }
        }
      }
      // Fallback for common commands
      else {
        if (lowerTranscript.includes('ανέβασμα') || lowerTranscript.includes('upload')) {
          addConversationMessage('assistant', 'Μπορείτε να σύρετε το αρχείο JSON στη ζώνη μεταφόρτωσης.');
        } else {
          addConversationMessage('assistant', 'Πώς μπορώ να βοηθήσω;');
        }
      }
    } catch (error) {
      console.error('Voice processing error:', error);
      addConversationMessage('assistant', 'Συγγνώμη, υπήρξε ένα σφάλμα.');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  // FULLY AUTONOMOUS AI DEPLOYMENT HANDLER
  // The AI can directly call ClickUp APIs and manage the entire deployment
  const handleAIAutonomousDeployment = async (transcript: string) => {
    addConversationMessage('user', transcript);
    setIsProcessingVoice(true);
    setConversationMode(true);
    
    try {
      // Prepare complete system state for AI
      const systemState = {
        // Current config
        hasTemplate: !!template,
        hasApiToken: !!apiToken,
        templateData: template ? {
          name: template.meta?.slug,
          version: template.meta?.version,
          phases: template.phases?.length,
          hasDestination: !!(template.destination?.list_id || template.destination?.space_id)
        } : null,
        
        // Available functions the AI can call
        availableFunctions: [
          'fetchSpaces',
          'fetchAllLists', 
          'fetchFoldersInSpace',
          'createNewFolder',
          'deployToList',
          'setTemplateDestination',
          'loadTemplate',
          'showUploadDialog'
        ],
        
        // Current deployment state
        deploymentState: {
          isDeploying,
          lastDeploymentResult: deploymentResult,
          logs: logs.slice(-10)
        }
      };
      
      // Full conversation history
      const conversationHistory = conversation.slice(-20).map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
      
      // Call the autonomous AI endpoint
      const response = await fetch('/api/ai-autonomous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: transcript,
          conversationHistory,
          systemState,
          apiToken // Pass token so AI can make ClickUp calls
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Add AI response
        addConversationMessage('assistant', result.message);
        
        // Execute AI's function calls sequentially
        if (result.functionCalls && result.functionCalls.length > 0) {
          for (const call of result.functionCalls) {
            await executeAIFunction(call);
          }
        }
        
        // If AI decided to deploy
        if (result.shouldDeploy && result.deploymentConfig) {
          // Update template with AI's chosen destination
          const updatedTemplate = {
            ...template,
            destination: result.deploymentConfig
          };
          setTemplate(updatedTemplate);
          
          // Start deployment
          setTimeout(() => {
            addLog('🤖 AI initiating deployment...', 'info');
            deployWithUpdatedTemplate(updatedTemplate);
          }, 500);
        }
      }
    } catch (error) {
      console.error('AI Autonomous error:', error);
      addConversationMessage('assistant', 'Συγγνώμη, υπήρξε πρόβλημα. Δοκιμάστε ξανά.');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  // Execute functions that AI requests
  const executeAIFunction = async (functionCall: any) => {
    const { name, parameters } = functionCall;
    
    switch (name) {
      case 'fetchSpaces':
        addLog('🤖 AI: Fetching available spaces...', 'info');
        const spaces = await fetchSpaces(apiToken);
        // AI will get results in next call
        return spaces;
        
      case 'fetchAllLists':
        addLog('🤖 AI: Scanning all lists...', 'info');
        const lists = await fetchAllLists(apiToken);
        return lists;
        
      case 'fetchFoldersInSpace':
        addLog(`🤖 AI: Checking folders in space ${parameters.spaceId}...`, 'info');
        const folders = await fetchFoldersInSpace(parameters.spaceId);
        return folders;
        
      case 'createNewFolder':
        addLog(`🤖 AI: Creating folder "${parameters.folderName}"...`, 'info');
        const folder = await createNewFolder(parameters.spaceId, parameters.folderName);
        return folder;
        
      case 'setTemplateDestination':
        // AI sets the destination
        const destination = parameters.destination;
        addLog(`🤖 AI: Setting destination to ${destination.list_id || destination.space_id}`, 'info');
        setTemplate({
          ...template,
          destination
        });
        break;
        
      case 'showUploadDialog':
        addLog('🤖 AI: Opening upload dialog...', 'info');
        setInputMode('upload');
        break;
        
      case 'deployToList':
        // AI triggers deployment with specific config
        const deployConfig = parameters;
        addLog(`🤖 AI: Deploying to ${deployConfig.list_id || deployConfig.space_id}`, 'info');
        
        const deployTemplate = {
          ...template,
          destination: deployConfig
        };
        
        setTemplate(deployTemplate);
        setTimeout(() => deployWithUpdatedTemplate(deployTemplate), 500);
        break;
    }
  };

  // Process voice choice during interaction
  const processVoiceChoice = (transcript: string) => {
    const lowerTranscript = transcript.toLowerCase();
    
    if (availableOptions.mode === 'initial') {
      if (lowerTranscript.includes('νέα') || lowerTranscript.includes('new') || lowerTranscript.includes('καινούργια')) {
        processChoice('1');
        addConversationMessage('assistant', 'Τέλεια! Θα δημιουργήσω νέα λίστα.');
      } else if (lowerTranscript.includes('υπάρχουσα') || lowerTranscript.includes('existing')) {
        processChoice('2');
        addConversationMessage('assistant', 'Εντάξει! Θα χρησιμοποιήσω υπάρχουσα λίστα.');
      } else {
        addConversationMessage('assistant', 'Θέλετε να δημιουργήσετε ΝΈΑ λίστα ή να χρησιμοποιήσετε ΥΠΆΡΧΟΥΣΑ;');
      }
    } else if (availableOptions.mode === 'select_space') {
      // Try to match space name
      const spaces = availableOptions.spaces;
      let matchedIndex = -1;
      
      for (let i = 0; i < spaces.length; i++) {
        if (lowerTranscript.includes(spaces[i].name.toLowerCase())) {
          matchedIndex = i;
          break;
        }
      }
      
      // Try number match
      const numbers = lowerTranscript.match(/\d+/);
      if (numbers && matchedIndex === -1) {
        const num = parseInt(numbers[0]);
        if (num > 0 && num <= spaces.length) {
          matchedIndex = num - 1;
        }
      }
      
      if (matchedIndex >= 0) {
        processChoice(String(matchedIndex + 1));
        addConversationMessage('assistant', `Τέλεια! Επιλέχθηκε "${spaces[matchedIndex].name}".`);
      } else {
        addConversationMessage('assistant', 'Δεν κατάλαβα. Πείτε το όνομα του space ή τον αριθμό του.');
      }
    }
  };

  // File drop handler
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      addLog(`Loading file: ${file.name}`, 'info');
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          setTemplate(json);
          setDeploymentResult(null);
          addLog(`Template loaded: ${json.meta?.slug || 'Unknown'} v${json.meta?.version || '1.0.0'}`, 'success');
          addLog(`Found ${json.phases?.length || 0} phases with ${json.phases?.reduce((acc: number, p: any) => acc + (p.actions?.length || 0), 0) || 0} total actions`, 'info');
          
          // Voice announcement
          if (conversationMode) {
            addConversationMessage('assistant', `Τέλεια! Φόρτωσα το template "${json.meta?.slug || 'Unknown'}" έκδοση ${json.meta?.version || '1.0.0'}. Έχει ${json.phases?.length || 0} φάσεις. Πείτε "ανάπτυξη" όταν είστε έτοιμοι!`);
          }
        } catch (error) {
          addLog('Failed to parse JSON file', 'error');
          if (conversationMode) {
            addConversationMessage('assistant', 'Δεν μπόρεσα να διαβάσω το αρχείο. Ελέγξτε ότι είναι έγκυρο JSON template.');
          }
        }
      };
      reader.readAsText(file);
    }
  }, [conversationMode]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/json': ['.json'] },
    maxFiles: 1
  });

  // Deploy handler
  const handleDeploy = async () => {
    if (!apiToken) {
      setShowTokenWarning(true);
      addLog('API token is required', 'warning');
      if (conversationMode) {
        addConversationMessage('assistant', 'Χρειάζεστε API token. Προσθέστε το στις ρυθμίσεις.');
      }
      setTimeout(() => setShowTokenWarning(false), 3000);
      return;
    }

    if (!template) {
      addLog('No template loaded', 'warning');
      if (conversationMode) {
        addConversationMessage('assistant', 'Παρακαλώ φορτώστε πρώτα ένα template.');
      }
      return;
    }

    // Check if destination exists
    if (!template.destination?.list_id && !template.destination?.space_id) {
      setIsDeploying(false);
      setDeploymentResult(null);
      setLogs([]);
      setTerminalExpanded(true);
      
      addLog('🔍 No destination found in template', 'warning');
      addLog('Let\'s find where to deploy this template...', 'info');
      addLog('', 'info');
      
      if (conversationMode) {
        addConversationMessage('assistant', 'Το template δεν έχει προορισμό. Θέλετε να δημιουργήσετε ΝΈΑ λίστα ή να χρησιμοποιήσετε ΥΠΆΡΧΟΥΣΑ;');
      }
      
      setLoadingClickUpStructure(true);
      const spaces = await fetchSpaces(apiToken);
      const lists = await fetchAllLists(apiToken);
      setLoadingClickUpStructure(false);
      
      addLog('Choose an option:', 'info');
      addLog('[1] Create NEW list in a space/folder', 'info');
      addLog('[2] Use EXISTING list', 'info');
      addLog('', 'info');
      
      setInputPrompt('Enter choice (1-2): ');
      setWaitingForInput(true);
      setAvailableOptions({ mode: 'initial', spaces, lists });
      return;
    }

    setIsDeploying(true);
    setDeploymentResult(null);
    setLogs([]);
    setTerminalExpanded(true);
    
    addLog('Starting deployment...', 'info');
    addLog(`Target list: ${template.destination?.list_id || 'Not specified'}`, 'info');
    
    if (conversationMode) {
      addConversationMessage('assistant', 'Ξεκινάω την ανάπτυξη...');
    }

    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
          apiToken,
          stopOnMissingFields: false,
          delayBetweenCalls: 800,
          selectedTemplateId
        })
      });

      const result = await response.json();
      
      // Handle errors that need interaction
      if (!result.success && (
        result.message?.includes('not found') ||
        result.message?.includes('Multiple') ||
        result.message?.includes('No matching') ||
        result.message?.includes('List does not exist')
      )) {
        setIsDeploying(false);
        setLogs([]);
        setTerminalExpanded(true);
        
        addLog('❌ ' + result.message, 'error');
        addLog('', 'info');
        addLog('🔍 Let\'s find the correct destination...', 'warning');
        
        if (conversationMode) {
          addConversationMessage('assistant', `Πρόβλημα: ${result.message}. Ας βρούμε τον σωστό προορισμό.`);
        }
        
        setLoadingClickUpStructure(true);
        const spaces = await fetchSpaces(apiToken);
        const lists = await fetchAllLists(apiToken);
        setLoadingClickUpStructure(false);
        
        addLog('Choose an option:', 'info');
        addLog('[1] Create NEW list in a space/folder', 'info');
        addLog('[2] Use EXISTING list', 'info');
        addLog('', 'info');
        
        setInputPrompt('Enter choice (1-2): ');
        setWaitingForInput(true);
        setAvailableOptions({ mode: 'initial', spaces, lists });
        return;
      }
      
      setDeploymentResult(result);
      
      // Add backend logs
      if (result.logs && Array.isArray(result.logs)) {
        result.logs.forEach((log: string) => {
          if (log.includes('✅') || log.includes('Created') || log.includes('successful')) {
            addLog(log, 'success');
          } else if (log.includes('❌') || log.includes('ERROR') || log.includes('Failed')) {
            addLog(log, 'error');
          } else if (log.includes('⚠️') || log.includes('WARN') || log.includes('warning')) {
            addLog(log, 'warning');
          } else {
            addLog(log, 'info');
          }
        });
      }
      
      // Final results
      if (result.success) {
        addLog('═══════════════════════════════════════', 'info');
        addLog(`Deployment completed successfully!`, 'success');
        addLog(`Final stats: ${result.phases?.length || 0} phases, ${result.actions?.length || 0} actions, ${result.checklists?.length || 0} checklists`, 'success');
        
        if (conversationMode) {
          addConversationMessage('assistant', `Εξαιρετικά! Η ανάπτυξη ολοκληρώθηκε! Δημιούργησα ${result.phases?.length || 0} φάσεις, ${result.actions?.length || 0} ενέργειες και ${result.checklists?.length || 0} checklists.`);
        }
        
        if (inputMode === 'upload' && templateListId) {
          setShowSaveDialog(true);
        }
      } else {
        addLog('═══════════════════════════════════════', 'info');
        addLog(`Deployment failed: ${result.message}`, 'error');
        
        if (conversationMode) {
          addConversationMessage('assistant', `Η ανάπτυξη απέτυχε: ${result.message}. Ελέγξτε τα logs για λεπτομέρειες.`);
        }
      }
      
    } catch (error) {
      const errorMessage = 'Network error or server unavailable';
      addLog(errorMessage, 'error');
      if (conversationMode) {
        addConversationMessage('assistant', 'Σφάλμα δικτύου. Ελέγξτε τη σύνδεση.');
      }
      setDeploymentResult({
        success: false,
        message: 'Deployment failed - check console for details',
        errors: [errorMessage]
      });
    } finally {
      setIsDeploying(false);
    }
  };

  // Process choice
  const processChoice = (choice: string) => {
    const trimmedChoice = choice.trim();
    
    if (availableOptions.mode === 'initial') {
      if (trimmedChoice === '1') {
        addLog(`> ${trimmedChoice}`, 'input');
        addLog('', 'info');
        addLog('Select space for new list:', 'info');
        
        if (availableOptions.spaces.length === 0) {
          addLog('No spaces available', 'error');
          return;
        }
        
        availableOptions.spaces.forEach((space: any, idx: number) => {
          addLog(`[${idx + 1}] 🏢 ${space.name}`, 'info');
        });
        
        setInputPrompt(`Select space (1-${availableOptions.spaces.length}): `);
        setAvailableOptions({ ...availableOptions, mode: 'select_space' });
        
      } else if (trimmedChoice === '2') {
        addLog(`> ${trimmedChoice}`, 'input');
        addLog('', 'info');
        addLog('Available Lists:', 'info');
        
        if (availableOptions.lists.length === 0) {
          addLog('No lists available', 'error');
          return;
        }
        
        availableOptions.lists.forEach((list: any, idx: number) => {
          addLog(`[${idx + 1}] 📋 ${list.path}`, 'info');
        });
        
        setInputPrompt(`Select list (1-${availableOptions.lists.length}): `);
        setAvailableOptions({ ...availableOptions, mode: 'select_list' });
      } else {
        addLog(`> ${trimmedChoice}`, 'input');
        addLog('Invalid choice. Please enter 1 or 2', 'error');
        return;
      }
    } else if (availableOptions.mode === 'select_space') {
      const spaceIndex = parseInt(trimmedChoice) - 1;
      
      if (isNaN(spaceIndex) || spaceIndex < 0 || spaceIndex >= availableOptions.spaces.length) {
        addLog(`> ${trimmedChoice}`, 'input');
        addLog(`Invalid choice. Please enter 1-${availableOptions.spaces.length}`, 'error');
        return;
      }
      
      const space = availableOptions.spaces[spaceIndex];
      addLog(`> ${trimmedChoice}`, 'input');
      addLog(`✅ Selected space: ${space.name}`, 'success');
      addLog('', 'info');
      
      addLog('Where should the new list be created?', 'info');
      addLog('[1] Directly in space (folderless)', 'info');
      addLog('[2] Inside an existing folder', 'info');
      addLog('[3] Create new folder first', 'info');
      addLog('', 'info');
      
      setInputPrompt('Enter choice (1-3): ');
      setAvailableOptions({ 
        ...availableOptions, 
        mode: 'select_folder_option',
        selectedSpace: space 
      });
      
    } else if (availableOptions.mode === 'select_folder_option') {
      const selectedSpace = availableOptions.selectedSpace;
      
      if (trimmedChoice === '1') {
        addLog(`> ${trimmedChoice}`, 'input');
        addLog('✅ Creating folderless list...', 'info');
        
        const updatedTemplate = {
          ...template,
          destination: { space_id: selectedSpace.id, space_name: selectedSpace.name }
        };
        
        setTemplate(updatedTemplate);
        setWaitingForInput(false);
        setUserInput('');
        
        setTimeout(() => deployWithUpdatedTemplate(updatedTemplate), 500);
        
      } else if (trimmedChoice === '2') {
        addLog(`> ${trimmedChoice}`, 'input');
        
        fetchFoldersInSpace(selectedSpace.id).then(folders => {
          if (folders.length === 0) {
            addLog('❌ No folders found in this space', 'error');
            addLog('💡 Try option 1 (folderless) or 3 (create new folder)', 'warning');
            return;
          }
          
          addLog('', 'info');
          addLog('Select a folder:', 'info');
          folders.forEach((folder: any, idx: number) => {
            addLog(`[${idx + 1}] 📁 ${folder.name}`, 'info');
          });
          addLog('', 'info');
          
          setInputPrompt(`Select folder (1-${folders.length}): `);
          setAvailableOptions({
            ...availableOptions,
            mode: 'select_existing_folder',
            selectedSpace,
            folders
          });
        });
        
      } else if (trimmedChoice === '3') {
        addLog(`> ${trimmedChoice}`, 'input');
        addLog('', 'info');
        addLog('Enter name for new folder:', 'info');
        
        setInputPrompt('Folder name: ');
        setAvailableOptions({
          ...availableOptions,
          mode: 'create_new_folder',
          selectedSpace
        });
        
      } else {
        addLog(`> ${trimmedChoice}`, 'input');
        addLog('❌ Invalid choice. Please enter 1, 2, or 3', 'error');
        return;
      }
    } else if (availableOptions.mode === 'select_existing_folder') {
      const folderIndex = parseInt(trimmedChoice) - 1;
      const folders = availableOptions.folders;
      
      if (isNaN(folderIndex) || folderIndex < 0 || folderIndex >= folders.length) {
        addLog(`> ${trimmedChoice}`, 'input');
        addLog(`❌ Invalid choice. Please enter 1-${folders.length}`, 'error');
        return;
      }
      
      const folder = folders[folderIndex];
      addLog(`> ${trimmedChoice}`, 'input');
      addLog(`✅ Selected folder: ${folder.name}`, 'success');
      addLog('📋 Creating list in folder...', 'info');
      
      const updatedTemplate = {
        ...template,
        destination: { 
          folder_id: folder.id, 
          folder_name: folder.name,
          space_id: availableOptions.selectedSpace.id,
          space_name: availableOptions.selectedSpace.name
        }
      };
      
      setTemplate(updatedTemplate);
      setWaitingForInput(false);
      setUserInput('');
      
      setTimeout(() => deployWithUpdatedTemplate(updatedTemplate), 500);
      
    } else if (availableOptions.mode === 'create_new_folder') {
      const folderName = trimmedChoice;
      
      if (!folderName) {
        addLog(`> ${trimmedChoice}`, 'input');
        addLog('❌ Folder name cannot be empty', 'error');
        return;
      }
      
      addLog(`> ${folderName}`, 'input');
      
      createNewFolder(availableOptions.selectedSpace.id, folderName).then(folder => {
        if (folder) {
          addLog('📋 Creating list in new folder...', 'info');
          
          const updatedTemplate = {
            ...template,
            destination: { 
              folder_id: folder.id, 
              folder_name: folder.name,
              space_id: availableOptions.selectedSpace.id,
              space_name: availableOptions.selectedSpace.name
            }
          };
          
          setTemplate(updatedTemplate);
          setWaitingForInput(false);
          setUserInput('');
          
          setTimeout(() => deployWithUpdatedTemplate(updatedTemplate), 500);
        } else {
          addLog('💡 Try a different folder name or use option 1 (folderless)', 'warning');
        }
      });
      
    } else if (availableOptions.mode === 'select_list') {
      const listIndex = parseInt(trimmedChoice) - 1;
      
      if (isNaN(listIndex) || listIndex < 0 || listIndex >= availableOptions.lists.length) {
        addLog(`> ${trimmedChoice}`, 'input');
        addLog(`Invalid choice. Please enter 1-${availableOptions.lists.length}`, 'error');
        return;
      }
      
      const list = availableOptions.lists[listIndex];
      
      addLog(`> ${trimmedChoice}`, 'input');
      addLog(`✅ Selected list: ${list.name}`, 'success');
      
      const listId = list.id || list.listId || list.list_id || list._id;
      
      if (!listId) {
        addLog('❌ Error: Could not find list ID in list object', 'error');
        return;
      }
      
      addLog(`🎯 Using list ID: ${listId}`, 'info');
      
      const updatedTemplate = {
        ...template,
        destination: { 
          list_id: listId,
          list_name: list.name 
        }
      };
      
      setTemplate(updatedTemplate);
      setWaitingForInput(false);
      setUserInput('');
      
      setTimeout(() => deployWithUpdatedTemplate(updatedTemplate), 500);
    }
    
    setUserInput('');
  };

  // Deploy with updated template
  const deployWithUpdatedTemplate = async (templateToUse = template) => {
    setIsDeploying(true);
    setWaitingForInput(false);
    
    addLog('Continuing deployment...', 'info');
    addLog(`Target destination: ${templateToUse.destination?.list_id || templateToUse.destination?.space_id}`, 'info');

    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: templateToUse,
          apiToken,
          stopOnMissingFields: false,
          delayBetweenCalls: 800,
          selectedTemplateId
        })
      });

      const result = await response.json();
      setDeploymentResult(result);
      
      if (result.logs && Array.isArray(result.logs)) {
        result.logs.forEach((log: string) => {
          if (log.includes('✅') || log.includes('Created') || log.includes('successful')) {
            addLog(log, 'success');
          } else if (log.includes('❌') || log.includes('ERROR') || log.includes('Failed')) {
            addLog(log, 'error');
          } else if (log.includes('⚠️') || log.includes('WARN') || log.includes('warning')) {
            addLog(log, 'warning');
          } else {
            addLog(log, 'info');
          }
        });
      }
      
      if (result.success) {
        addLog('═══════════════════════════════════════', 'info');
        addLog(`Deployment completed successfully!`, 'success');
        addLog(`Final stats: ${result.phases?.length || 0} phases, ${result.actions?.length || 0} actions, ${result.checklists?.length || 0} checklists`, 'success');
        
        if (conversationMode) {
          addConversationMessage('assistant', `Εξαιρετικά! Δημιούργησα ${result.phases?.length || 0} φάσεις, ${result.actions?.length || 0} ενέργειες και ${result.checklists?.length || 0} checklists.`);
        }
        
        if (inputMode === 'upload' && templateListId) {
          setShowSaveDialog(true);
        }
      } else {
        addLog('═══════════════════════════════════════', 'info');
        addLog(`Deployment failed: ${result.message}`, 'error');
        
        if (conversationMode) {
          addConversationMessage('assistant', `Η ανάπτυξη απέτυχε: ${result.message}`);
        }
      }
      
    } catch (error) {
      const errorMessage = 'Network error or server unavailable';
      addLog(errorMessage, 'error');
      setDeploymentResult({
        success: false,
        message: 'Deployment failed - check console for details',
        errors: [errorMessage]
      });
    } finally {
      setIsDeploying(false);
    }
  };

  // Handle terminal input
  const handleTerminalInput = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && waitingForInput) {
      processChoice(userInput);
      setUserInput('');
    }
  };

  // Save as template
  const handleSaveAsTemplate = async () => {
    if (!template || !deploymentResult || !templateListId || !apiToken) return;
  
    addLog('Saving as template to ClickUp...', 'info');
    
    try {
      const response = await fetch('/api/templates/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
          deploymentResult,
          metadata: saveMetadata,
          apiToken,
          templateListId
        })
      });
  
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        if (data.message?.includes('already exists')) {
          const currentVersion = template.meta.version;
          const suggestedVersion = currentVersion.replace(/(\d+)$/, (m: string) => String(parseInt(m) + 1));
          
          addLog(`Template "${template.meta.slug} — v${currentVersion}" already exists`, 'error');
          addLog(`Please change version to "${suggestedVersion}" or higher in your JSON file`, 'warning');
          
          if (confirm(`Template version ${currentVersion} already exists.\n\nWould you like to see how to fix this?`)) {
            alert(`To save this template:\n\n1. Edit your JSON file\n2. Change "version": "${currentVersion}" to "version": "${suggestedVersion}"\n3. Re-upload and deploy again\n4. Then save as template`);
          }
        } else {
          addLog(`Failed to save template: ${data.message || 'Unknown error'}`, 'error');
        }
        return;
      }
      
      addLog(`Saved as template: ${data.taskId}`, 'success');
      setShowSaveDialog(false);
      setSaveMetadata({ name: '', changelog: '' });
      await loadTemplates();
      
    } catch (error) {
      addLog(`Error saving template: ${error}`, 'error');
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">ClickUp Deployer</h1>
              {conversationMode && (
                <>
                  <div className="flex items-center gap-1 px-2 py-1 bg-green-100 rounded-full">
                    <Sparkles className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-green-600 font-medium">Voice Enabled</span>
                  </div>
                  
                  {/* AI Mode Toggle */}
                  <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 rounded-full">
                    <button
                      onClick={() => setAiMode(aiMode === 'enhanced' ? 'autonomous' : 'enhanced')}
                      className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors"
                      title={aiMode === 'autonomous' ? 'Switch to Enhanced Mode' : 'Switch to Autonomous Mode'}
                    >
                      {aiMode === 'autonomous' ? (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                          <span>🤖 Autonomous</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
                          </svg>
                          <span>🧠 Enhanced</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {session?.user && (
                <div className="flex items-center space-x-3">
                  <img 
                    src={session.user.image || ''} 
                    alt={session.user.name || ''} 
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="text-sm text-gray-600">{session.user.email}</span>
                  <button
                    onClick={() => signOut()}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {conversationMode ? 'Voice-enabled template deployment' : 'Automated template deployment system'}
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column - Configuration */}
          <div className="space-y-6">
            
            {/* API Configuration */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Configuration
              </label>
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="password"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="API Token (pk_...)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-sm"
                  />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={templateListId}
                    onChange={(e) => setTemplateListId(e.target.value)}
                    placeholder="Template Library List ID (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-sm"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Required for template browsing and saving
                  </div>
                </div>
              </div>
              <AnimatePresence>
                {showTokenWarning && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-2 flex items-center gap-2 text-sm text-red-600"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Token required
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input Mode Selector */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setInputMode('upload')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition flex items-center justify-center gap-2 ${
                    inputMode === 'upload' 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <File className="w-4 h-4" />
                  Upload File
                </button>
                <button
                  onClick={() => {
                    setInputMode('browse');
                    if (templates.length === 0) loadTemplates();
                  }}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition flex items-center justify-center gap-2 ${
                    inputMode === 'browse' 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Library className="w-4 h-4" />
                  Browse Templates
                </button>
              </div>

              {/* Upload Mode */}
              {inputMode === 'upload' && (
                <>
                  <label className="block text-sm font-medium text-gray-900 mb-4">
                    Template File
                  </label>
                  
                  <div
                    {...getRootProps()}
                    className={`
                      relative border-2 border-dashed rounded-lg p-8
                      transition-all cursor-pointer
                      ${isDragActive ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'}
                      ${template ? 'bg-gray-50' : 'bg-white'}
                    `}
                  >
                    <input {...getInputProps()} />
                    <div className="text-center">
                      {template ? (
                        <div className="space-y-2">
                          <FileJson className="w-10 h-10 text-gray-900 mx-auto" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {template.meta?.slug || 'Template loaded'}
                            </p>
                            <p className="text-xs text-gray-500">
                              Version {template.meta?.version || '1.0.0'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-10 h-10 text-gray-400 mx-auto" />
                          <p className="mt-2 text-sm text-gray-600">
                            {isDragActive ? 'Drop file here' : 'Drop JSON or click to browse'}
                          </p>
                          {conversationMode && (
                            <p className="text-xs text-gray-500 mt-1">
                              Or say "upload template"
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Browse Mode */}
              {inputMode === 'browse' && (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-sm font-medium text-gray-900">
                      Template Library
                    </label>
                    <button
                      onClick={loadTemplates}
                      disabled={loadingTemplates || !apiToken || !templateListId}
                      className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
                    >
                      Refresh
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {loadingTemplates ? (
                      <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
                    ) : templates.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        {!templateListId ? 'Set Template Library List ID to browse' : 'No templates found'}
                      </div>
                    ) : (
                      templates.map(t => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedTemplateId(t.taskId);
                            loadTemplateContent(t.taskId);
                          }}
                          className={`p-3 border rounded-lg cursor-pointer transition ${
                            selectedTemplateId === t.taskId 
                              ? 'border-gray-900 bg-gray-50' 
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{t.name}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                v{t.version} • {t.slug}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Hash className="w-3 h-3" />
                                {t.deployCount}
                              </div>
                              {t.lastDeployed && (
                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(t.lastDeployed).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* Template Info */}
              {template && (
                <div className="mt-4 space-y-2 pt-4 border-t border-gray-200">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Target List</span>
                    <span className="font-mono text-gray-900">{template.destination?.list_id || 'Not specified'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Phases</span>
                    <span className="text-gray-900">{template.phases?.length || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Total Actions</span>
                    <span className="text-gray-900">
                      {template.phases?.reduce((acc: number, p: any) => acc + (p.actions?.length || 0), 0) || 0}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Deploy Button */}
            <motion.button
              whileHover={{ scale: template && apiToken && !isDeploying ? 1.02 : 1 }}
              whileTap={{ scale: template && apiToken && !isDeploying ? 0.98 : 1 }}
              onClick={handleDeploy}
              disabled={!template || !apiToken || isDeploying}
              className={`
                w-full py-3 px-4 rounded-md font-medium transition-all flex items-center justify-center gap-2
                ${template && apiToken && !isDeploying
                  ? 'bg-gray-900 text-white hover:bg-gray-800'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {isDeploying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Deploying
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Deploy {conversationMode && '(or say "ανάπτυξη")'}
                </>
              )}
            </motion.button>
          </div>

          {/* Right Column - Always Show Conversation */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="flex flex-col h-[600px]">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-gray-600" />
                  <h2 className="text-sm font-medium text-gray-900">Συνομιλία</h2>
                </div>
              </div>
              
              <div 
                ref={conversationRef}
                className="flex-1 overflow-y-auto p-4 space-y-3"
              >
                {conversation.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">Γράψτε κάτι ή χρησιμοποιήστε το μικρόφωνο...</p>
                  </div>
                ) : (
                  conversation.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] ${
                        msg.type === 'user' 
                          ? 'bg-gray-900 text-white rounded-l-lg rounded-tr-lg' 
                          : msg.type === 'system'
                          ? 'bg-blue-50 text-blue-900 rounded-r-lg rounded-tl-lg'
                          : 'bg-gray-100 text-gray-900 rounded-r-lg rounded-tl-lg'
                      } px-4 py-2`}>
                        <div className="flex items-start gap-2">
                          {msg.type === 'assistant' && <Bot className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                          {msg.type === 'user' && <User className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                          <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                        </div>
                        <div className="text-xs opacity-70 mt-1">
                          {msg.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Text Input Area - With Voice */}
              <div className="border-t border-gray-200 p-4">
                <div className="flex gap-2">
                  <input
                    ref={messageInputRef}
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleMessageSubmit();
                      }
                    }}
                    placeholder="Γράψτε μήνυμα ή κρατήστε το μικρόφωνο..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                    style={{ fontSize: '16px' }} // Prevents zoom on iOS
                  />
                  
                  {/* Voice Input Button - Press and Hold */}
                  <VoiceInput 
                    onTranscript={(text) => {
                      // Append to existing message or replace
                      setMessageInput(prev => prev ? prev + ' ' + text : text);
                      messageInputRef.current?.focus();
                    }}
                    disabled={isProcessingVoice}
                  />
                  
                  <button
                    onClick={handleMessageSubmit}
                    disabled={!messageInput.trim()}
                    className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
                      messageInput.trim() 
                        ? 'bg-gray-900 text-white hover:bg-gray-800' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="text-xs text-gray-500 mt-2">
                  💡 Κρατήστε πατημένο το μικρόφωνο για εγγραφή
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save as Template Dialog */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Save as Template</h3>
              <p className="text-sm text-gray-600 mb-4">
                Save this successfully deployed template to your ClickUp library for reuse.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={saveMetadata.name}
                    onChange={(e) => setSaveMetadata(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={`${template?.meta?.slug} — v${template?.meta?.version}`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Changelog (optional)
                  </label>
                  <textarea
                    value={saveMetadata.changelog}
                    onChange={(e) => setSaveMetadata(prev => ({ ...prev, changelog: e.target.value }))}
                    placeholder="What's new in this version..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSaveMetadata({ name: '', changelog: '' });
                  }}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Skip
                </button>
                <button
                  onClick={handleSaveAsTemplate}
                  className="flex-1 py-2 px-4 bg-gray-900 text-white rounded-md hover:bg-gray-800 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Template
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal Section */}
      <div className={`border-t border-gray-200 bg-gray-900 transition-all duration-300 ${
        terminalExpanded ? 'h-64' : 'h-12'
      }`}>
        <button
          onClick={() => setTerminalExpanded(!terminalExpanded)}
          className="w-full px-4 h-12 flex items-center justify-between text-gray-300 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            <span className="text-sm font-mono">Console</span>
            {logs.length > 0 && !terminalExpanded && (
              <span className="text-xs text-gray-500 ml-2">({logs.length} logs)</span>
            )}
          </div>
          {terminalExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>

        {terminalExpanded && (
          <div 
            ref={terminalRef}
            className="h-52 overflow-y-auto px-4 py-2 font-mono text-xs text-gray-300 space-y-1"
          >
            {logs.length === 0 ? (
              <div className="text-gray-600">No logs yet. Deploy a template to see activity.</div>
            ) : (
              logs.map((log, i) => {
                let className = '';
                if (log.includes('✅') || log.includes('✓') || log.includes('success')) {
                  className = 'text-green-400';
                } else if (log.includes('❌') || log.includes('✗') || log.includes('ERROR') || log.includes('Failed')) {
                  className = 'text-red-400';
                } else if (log.includes('⚠') || log.includes('WARN') || log.includes('warning')) {
                  className = 'text-yellow-400';
                } else if (log.includes('📦') || log.includes('📌') || log.includes('📤')) {
                  className = 'text-blue-400';
                } else if (log.includes('👁')) {
                  className = 'text-purple-400';
                } else if (log.includes('═')) {
                  className = 'text-gray-500';
                } else if (log.includes('>')) {
                  className = 'text-cyan-400';
                }
                
                return (
                  <div key={i} className={className || 'text-gray-300'}>
                    {log}
                  </div>
                );
              })
            )}
            
            {loadingClickUpStructure && (
              <div className="flex items-center mt-2 text-blue-400">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                <span>Loading ClickUp structure...</span>
              </div>
            )}
            
            {waitingForInput && !loadingClickUpStructure && (
              <div className="flex items-center mt-2">
                <span className="text-green-400">{inputPrompt}</span>
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleTerminalInput}
                  className="bg-transparent text-green-400 outline-none flex-1 ml-2"
                />
                <span className="animate-pulse">_</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}