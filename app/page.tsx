'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Zap, Check, X, AlertTriangle, FileJson, ChevronRight, 
  Terminal, ChevronUp, ChevronDown, Library, File, Save, Clock, Hash
} from 'lucide-react';

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
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal to bottom when new logs arrive
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Load API token and template list ID securely for authenticated users
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Fetch config from secure API endpoint
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          if (config.apiToken) setApiToken(config.apiToken);
          if (config.templateListId) setTemplateListId(config.templateListId);
        } else {
          // Fallback to localStorage for template list ID
          const savedListId = localStorage.getItem('templateListId');
          if (savedListId) setTemplateListId(savedListId);
        }
      } catch (error) {
        console.error('Failed to load config:', error);
        // Fallback to localStorage
        const savedListId = localStorage.getItem('templateListId');
        if (savedListId) setTemplateListId(savedListId);
      }
    };

    if (session) {
      loadConfig();
    }
  }, [session]);

  // Save template list ID when changed
  useEffect(() => {
    if (templateListId) {
      localStorage.setItem('templateListId', templateListId);
    }
  }, [templateListId]);

  // Add log helper
  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const hasEmoji = /^[🔐🔍✅❌📦📌📤👁⏱️🚀═]/.test(message);
    if (hasEmoji) {
      setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
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

  // Load templates from ClickUp
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
        } catch (error) {
          addLog('Failed to parse JSON file', 'error');
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/json': ['.json'] },
    maxFiles: 1
  });

  // Deploy handler with streaming logs
  const handleDeploy = async () => {
    if (!apiToken) {
      setShowTokenWarning(true);
      addLog('API token is required', 'warning');
      setTimeout(() => setShowTokenWarning(false), 3000);
      return;
    }

    if (!template) {
      addLog('No template loaded', 'warning');
      return;
    }

    setIsDeploying(true);
    setDeploymentResult(null);
    setLogs([]);
    setTerminalExpanded(true);
    
    addLog('Starting deployment...', 'info');
    addLog(`Target list: ${template.destination?.list_id || 'Not specified'}`, 'info');

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
      setDeploymentResult(result);
      
      // Add backend logs to terminal
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
      
      // Log final results
      if (result.success) {
        addLog('═══════════════════════════════════════', 'info');
        addLog(`Deployment completed successfully!`, 'success');
        addLog(`Final stats: ${result.phases?.length || 0} phases, ${result.actions?.length || 0} actions, ${result.checklists?.length || 0} checklists`, 'success');
        
        // Show save as template option if uploaded from file
        if (inputMode === 'upload' && templateListId) {
          setShowSaveDialog(true);
        }
      } else {
        addLog('═══════════════════════════════════════', 'info');
        addLog(`Deployment failed: ${result.message}`, 'error');
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

  // Save as template handler
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
        // Check for duplicate template error
        if (data.message?.includes('already exists')) {
          const currentVersion = template.meta.version;
          const suggestedVersion = currentVersion.replace(/(\d+)$/, (m: string) => String(parseInt(m) + 1));
          
          addLog(`Template "${template.meta.slug} — v${currentVersion}" already exists`, 'error');
          addLog(`Please change version to "${suggestedVersion}" or higher in your JSON file`, 'warning');
          
          // Optional: Show alert for better visibility
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
      // Reload templates
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
            <h1 className="text-2xl font-semibold text-gray-900">ClickUp Deployer</h1>
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
          <p className="mt-1 text-sm text-gray-500">Automated template deployment system</p>
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
                  Deploy
                </>
              )}
            </motion.button>
          </div>

          {/* Right Column - Results */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-sm font-medium text-gray-900 mb-4">Deployment Status</h2>
            
            {!deploymentResult ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ChevronRight className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm text-gray-500">No deployment yet</p>
                <p className="text-xs text-gray-400 mt-1">Upload a template and deploy to see results</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={deploymentResult.message}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  {/* Status */}
                  <div className={`flex items-center gap-3 p-4 rounded-lg ${
                    deploymentResult.success ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    {deploymentResult.success ? (
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <X className="w-5 h-5 text-red-600 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${
                        deploymentResult.success ? 'text-green-900' : 'text-red-900'
                      }`}>
                        {deploymentResult.success ? 'Deployment Successful' : 'Deployment Failed'}
                      </p>
                      <p className={`text-xs mt-1 ${
                        deploymentResult.success ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {deploymentResult.message}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  {deploymentResult.success && (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-semibold text-gray-900">
                          {deploymentResult.phases?.length || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Phases</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-semibold text-gray-900">
                          {deploymentResult.actions?.length || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Actions</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-semibold text-gray-900">
                          {deploymentResult.checklists?.length || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Checklists</div>
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {deploymentResult.warnings?.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-medium text-gray-700">Warnings</h3>
                      {deploymentResult.warnings.map((warning: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-2 rounded">
                          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Errors */}
                  {deploymentResult.errors?.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-medium text-gray-700">Errors</h3>
                      {deploymentResult.errors.map((error: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 p-2 rounded">
                          <X className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{error}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* List Link */}
                  {deploymentResult.listId && (
                    <div className="pt-4 border-t border-gray-200">
                      <a
                        href={`https://app.clickup.com/9017098071/v/li/${deploymentResult.listId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-900 hover:text-gray-600 font-medium flex items-center gap-1"
                      >
                        View in ClickUp
                        <ChevronRight className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
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
        {/* Terminal Header */}
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

        {/* Terminal Content */}
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
                }
                
                return (
                  <div key={i} className={className || 'text-gray-300'}>
                    {log}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}