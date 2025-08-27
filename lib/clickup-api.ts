// lib/clickup-api.ts - COMPLETE IMPLEMENTATION WITH FIXES
import axios, { AxiosInstance } from 'axios';

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

// ==========================================
// TYPES & INTERFACES
// ==========================================
export interface TemplateSchema {
  meta: {
    slug: string;
    version: string;
  };
  destination: {
    space_id?: string;
    folder_id?: string;
    list_id?: string;
  };
  defaults?: {
    status?: string;
    priority?: number;
    tags?: string[];
    custom_fields?: Record<string, any>;
  };
  roles_map?: Record<string, string>;
  phases: Phase[];
}

interface Phase {
  key: string;
  name: string;
  description?: string;
  assignee_role?: string;
  start_date?: string;
  due_date?: string;
  status?: string;
  priority?: number;
  tags?: string[];
  custom_fields?: Record<string, any>;
  actions?: Action[];
}

interface Action {
  name: string;
  description?: string;
  assignee_role?: string;
  start_date?: string;
  due_date?: string;
  status?: string;
  priority?: number;
  tags?: string[];
  custom_fields?: Record<string, any>;
  watchers?: string[];
  checklist?: {
    title?: string;
    items: string[];
  };
}

export interface DeploymentResult {
  success: boolean;
  mode: 'existing_list' | 'new_list';
  listId: string;
  phases: any[];
  actions: any[];
  checklists: any[];
  errors: string[];
  warnings: string[];
  message: string;
  missingFields?: string[];
  fieldMapping?: Record<string, string>;
}

// ==========================================
// HELPER FUNCTION FOR RATE LIMITING
// ==========================================
async function rateLimitDelay(ms: number = 500): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// MAIN DEPLOYMENT FUNCTION
// ==========================================
export async function deployTemplateSmartly(
  template: TemplateSchema,
  apiToken: string,
  options: { 
    stopOnMissingFields?: boolean;
    createNewListIfNeeded?: boolean;
    delayBetweenCalls?: number; // Add configurable delay
    enableRollback?: boolean; // if failure cleanup
  } = { stopOnMissingFields: false, delayBetweenCalls: 500, enableRollback: false }
): Promise<DeploymentResult> {
  
  // Initialize API client
  const api = axios.create({
    baseURL: CLICKUP_API_BASE,
    headers: {
      'Authorization': apiToken,
      'Content-Type': 'application/json'
    }
  });

  const result: DeploymentResult = {
    success: false,
    mode: 'existing_list',
    listId: '',
    phases: [],
    actions: [],
    checklists: [],
    errors: [],
    warnings: [],
    message: '',
    missingFields: [],
    fieldMapping: {}
  };

  const createdTaskIds: string[] = [];
  const createdChecklistIds: string[] = [];

  const rollback = async () => {
    if (!options.enableRollback) return;
    
    console.log('❌ Deployment failed - initiating rollback...');
    let deletedCount = 0;
    
    for (const taskId of createdTaskIds.reverse()) {
      try {
        await api.delete(`/task/${taskId}`);
        console.log(`  🗑️ Deleted task ${taskId}`);
        deletedCount++;
        await rateLimitDelay(200);
      } catch (error) {
        console.error(`  ⚠️ Failed to delete task ${taskId}:`, error);
      }
    }
    
    console.log(`🔄 Rollback complete: deleted ${deletedCount} items`);
  };

  try {
    // Step 1: Validate API connection
    console.log('🔐 Validating API connection...');
    const userResponse = await api.get('/user');
    const username = userResponse.data.user.username;
    console.log(`✅ Connected as: ${username}`);

    // Step 2: Determine target location
    let targetListId = template.destination?.list_id;
    
    // CASE 3: Create new list if needed or requested
    if (!targetListId && (template.destination?.folder_id || template.destination?.space_id)) {
      if (options.createNewListIfNeeded) {
        console.log('📋 Creating new list...');
        targetListId = await createNewList(api, template);
        result.mode = 'new_list';
        result.warnings.push('New list created. Custom fields must be added manually in ClickUp UI.');
      } else {
        throw new Error('No list_id provided and createNewListIfNeeded is false');
      }
    } else if (!targetListId) {
      throw new Error('No list_id, folder_id, or space_id provided in template');
    }
    
    result.listId = targetListId;

    // Step 3: Get and validate custom fields
    console.log('🔍 Checking custom fields...');
    const fieldValidation = await validateCustomFields(api, targetListId, template);
    result.fieldMapping = fieldValidation.fieldMap;
    
    // CASE 1 & 2: Check if all required fields exist
    if (fieldValidation.missingFields.length > 0) {
      result.missingFields = fieldValidation.missingFields;
      
      if (options.stopOnMissingFields) {
        // CASE 2: STOP - Missing fields detected
        result.success = false;
        result.message = `❌ STOPPED: Missing custom fields detected. Please create them in ClickUp first.`;
        result.errors.push(
          `Missing fields: ${fieldValidation.missingFields.join(', ')}`,
          'To fix: Go to List Settings → Custom Fields → Add Field',
          'Then run deployment again'
        );
        return result; // STOP HERE
      } else {
        // Continue without missing fields
        result.warnings.push(`Continuing without fields: ${fieldValidation.missingFields.join(', ')}`);
      }
    } else {
      console.log('✅ All required custom fields exist');
    }

    // Step 3.5: Ensure all users have access to the list
    console.log('🔐 Ensuring user access...');
    await ensureAllUsersHaveAccess(api, targetListId, template);

    // Step 4: Get team members for role mapping
    console.log('👥 Mapping team roles...');
    const userMap = await getTeamUserMap(api);

    // Step 5: Deploy phases and actions
    console.log('🚀 Starting deployment...');
    console.log(`⏱️ Using ${options.delayBetweenCalls}ms delay between API calls to avoid rate limiting`);
    
    for (const phase of template.phases || []) {
      console.log(`📦 Creating phase: ${phase.name}`);
      
      try {
        // Add delay before creating phase
        await rateLimitDelay(options.delayBetweenCalls);
        
        // Create phase task
        const phaseTask = await createTask(
          api,
          targetListId,
          {
            name: phase.name,
            description: phase.description || '',
            // Remove status - let ClickUp use the list's default status
            priority: phase.priority || template.defaults?.priority || 3,
            tags: [...(template.defaults?.tags || []), ...(phase.tags || [])],
            assignees: resolveAssignees(phase.assignee_role, template.roles_map, userMap),
            custom_fields: mergeAndFormatCustomFields(
              template.defaults?.custom_fields,
              phase.custom_fields,
              fieldValidation.fieldMap
            ),
            due_date: phase.due_date,
            start_date: phase.start_date
          }
        );
        
        createdTaskIds.push(phaseTask.id);
        result.phases.push(phaseTask);
        
        // Log assignee info
        if (phaseTask.assignees?.length > 0) {
          console.log(`✅ Created phase: ${phaseTask.name} (${phaseTask.id}) - Assigned to: ${phaseTask.assignees.map((a: any) => a.username || a.email || a.id).join(', ')}`);
        } else {
          console.log(`✅ Created phase: ${phaseTask.name} (${phaseTask.id}) - ⚠️ NO ASSIGNEE`);
        }

        // Create actions (subtasks)
        for (const action of phase.actions || []) {
          console.log(`  📦 Creating action: ${action.name}`);
          
          try {
            // Add delay before creating action
            await rateLimitDelay(Math.floor(options.delayBetweenCalls! / 2));
            
            // Create action as subtask
            const actionTask = await createTask(
              api,
              targetListId,
              {
                name: action.name,
                description: action.description || '',
                parent: phaseTask.id, // Makes it a subtask
                // Remove status - let ClickUp use the list's default status
                priority: action.priority || 3,
                tags: action.tags || [],
                assignees: resolveAssignees(action.assignee_role, template.roles_map, userMap),
                custom_fields: formatCustomFields(action.custom_fields, fieldValidation.fieldMap),
                due_date: action.due_date,
                start_date: action.start_date
              }
            );
            
            createdTaskIds.push(actionTask.id);
            result.actions.push(actionTask);
            
            // Log assignee info
            if (actionTask.assignees?.length > 0) {
              console.log(`  ✅ Created action: ${actionTask.name} - Assigned to: ${actionTask.assignees.map((a: any) => a.username || a.email || a.id).join(', ')}`);
            } else {
              console.log(`  ✅ Created action: ${actionTask.name} - ⚠️ NO ASSIGNEE`);
            }

            // Add watchers if specified
            // Replace the watcher section in your code with this:
            // Add watchers if specified
            if (action.watchers && action.watchers.length > 0) {
                console.log(`  👁 Adding ${action.watchers.length} watchers...`);
                
                // Build array of watcher user IDs
                const watcherIds: number[] = [];
                for (const watcherEmail of action.watchers) {
                const watcherId = userMap[watcherEmail];
                if (watcherId) {
                    watcherIds.push(parseInt(watcherId));
                } else {
                    console.log(`    ⚠️ Watcher ${watcherEmail} not found in team`);
                }
                }
                
                if (watcherIds.length > 0) {
                try {
                    await rateLimitDelay(300);
                    // UPDATE the task with watchers
                    const updateResponse = await api.put(`/task/${actionTask.id}`, {
                    watchers_add: watcherIds  // or just "watchers": watcherIds
                    });
                    console.log(`    ✅ Added ${watcherIds.length} watchers to task`);
                } catch (error: any) {
                    const errorMessage = error.response?.data?.err || error.message;
                    console.log(`    ❌ Failed to add watchers: ${errorMessage}`);
                    result.warnings.push(`Could not add watchers: ${errorMessage}`);
                }
                }
            }

            // Create checklist
            if (action.checklist && action.checklist.items?.length > 0) {
              await rateLimitDelay(300); // Delay for checklist
              const checklist = await createChecklist(
                api,
                actionTask.id,
                action.checklist.title || 'Steps',
                action.checklist.items
              );
              createdChecklistIds.push(checklist.id);
              result.checklists.push(checklist);
              console.log(`    ✅ Created checklist with ${action.checklist.items.length} items`);
            }

          } catch (error: any) {
            const errorMessage = error.response?.status === 429 
              ? 'Rate limit exceeded - too many requests' 
              : error.message;
            result.errors.push(`Failed to create action "${action.name}": ${errorMessage}`);
            console.error(`  ❌ Failed to create action: ${errorMessage}`);

            // ADD ROLLBACK:
            if (options.enableRollback) {
                await rollback();
                throw error; // Stop deployment
            }

            // If rate limited, wait longer before continuing
            if (error.response?.status === 429) {
              console.log('  ⏳ Rate limited - waiting 5 seconds before continuing...');
              await rateLimitDelay(5000);
            }
          }
        }

      } catch (error: any) {
        const errorMessage = error.response?.status === 429 
          ? 'Rate limit exceeded - too many requests' 
          : error.message;
        result.errors.push(`Failed to create phase "${phase.name}": ${errorMessage}`);
        console.error(`❌ Failed to create phase: ${errorMessage}`);
        
        // ADD ROLLBACK:
        if (options.enableRollback) {
            await rollback();
            throw error; // Stop deployment
          }

        // If rate limited, wait longer before continuing
        if (error.response?.status === 429) {
          console.log('⏳ Rate limited - waiting 5 seconds before continuing...');
          await rateLimitDelay(5000);
        }
      }
    }

    // Step 6: Generate summary
    result.success = result.phases.length > 0;
    result.message = result.success
      ? `✅ Successfully deployed ${result.phases.length} phases, ${result.actions.length} actions, ${result.checklists.length} checklists to ${result.mode === 'new_list' ? 'NEW' : 'existing'} list`
      : '❌ Deployment failed - check errors';

  } catch (error: any) {
    console.error('Deployment error:', error);
    result.success = false;
    result.message = error.message;
    result.errors.push(error.response?.data?.err || error.message);

    // ADD ROLLBACK:
    if (options.enableRollback && createdTaskIds.length > 0) {
        await rollback();
      }
  }

  return result;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function validateCustomFields(
  api: AxiosInstance,
  listId: string,
  template: TemplateSchema
): Promise<{
  fieldMap: Record<string, string>;
  missingFields: string[];
  existingFields: string[];
}> {
  // Get existing custom fields
  const response = await api.get(`/list/${listId}/field`);
  const existingFields = response.data.fields || [];
  
  // DEBUG: Log what we got from ClickUp
  console.log('📋 Fields from ClickUp:');
  existingFields.forEach((field: any) => {
    console.log(`  - "${field.name}" (${field.type}) [ID: ${field.id}]`);
  });

  // Create field name -> ID mapping
  const fieldMap: Record<string, string> = {};
  const fieldMapLower: Record<string, string> = {}; // For case-insensitive lookup
  
  existingFields.forEach((field: any) => {
    fieldMap[field.name] = field.id;
    fieldMapLower[field.name.toLowerCase().trim()] = field.id;
  });

  // Extract all custom field names from template
  const requiredFields = new Set<string>();
  
  // From defaults
  if (template.defaults?.custom_fields) {
    Object.keys(template.defaults.custom_fields).forEach(name => requiredFields.add(name));
  }
  
  // From phases
  template.phases.forEach(phase => {
    if (phase.custom_fields) {
      Object.keys(phase.custom_fields).forEach(name => requiredFields.add(name));
    }
    // From actions
    phase.actions?.forEach(action => {
      if (action.custom_fields) {
        Object.keys(action.custom_fields).forEach(name => requiredFields.add(name));
      }
    });
  });

  // Find missing fields with case-insensitive matching
  const missingFields: string[] = [];
  const foundFieldMap: Record<string, string> = {};

  requiredFields.forEach(fieldName => {
    // Try exact match first
    if (fieldMap[fieldName]) {
      foundFieldMap[fieldName] = fieldMap[fieldName];
      console.log(`  ✅ Found exact match: "${fieldName}"`);
    } 
    // Try case-insensitive match
    else if (fieldMapLower[fieldName.toLowerCase().trim()]) {
      foundFieldMap[fieldName] = fieldMapLower[fieldName.toLowerCase().trim()];
      console.log(`  ✅ Found case-insensitive match: "${fieldName}"`);
    }
    // Not found
    else {
      missingFields.push(fieldName);
      console.log(`  ❌ NOT FOUND: "${fieldName}"`);
    }
  });

  return {
    fieldMap: foundFieldMap,
    missingFields,
    existingFields: Object.keys(fieldMap)
  };
}

async function createNewList(
    api: AxiosInstance,
    template: TemplateSchema
  ): Promise<string> {
    const timestamp = Date.now();
    const listName = `${template.meta.slug}_${timestamp}`;
  
    let response;
    
        if (template.destination.folder_id) {
    // Use existing folder
    try {
      const payload = {
        name: listName,
        content: template.meta.slug,
        statuses: [
          { status: 'to do', color: '#d3d3d3', orderindex: 0 },
          { status: 'in progress', color: '#3397dd', orderindex: 1 },
          { status: 'complete', color: '#6bc950', orderindex: 2 }
        ]
      };
      response = await api.post(`/folder/${template.destination.folder_id}/list`, payload);
    } catch (statusError: any) {
      console.log('⚠️ Failed with statuses, creating simple list...');
      const simplePayload = { name: listName, content: template.meta.slug };
      response = await api.post(`/folder/${template.destination.folder_id}/list`, simplePayload);
      
      // Add statuses after creation
      const listId = response.data.id;
      console.log(`📋 Adding statuses to folder list ${listId}...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        console.log('  📌 Adding "to do" status...');
        await api.post(`/list/${listId}/status`, { status: 'to do', color: '#d3d3d3' });
        console.log('  ✅ "to do" status added');
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log('  📌 Adding "in progress" status...');
        await api.post(`/list/${listId}/status`, { status: 'in progress', color: '#3397dd' });
        console.log('  ✅ "in progress" status added');
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log('  📌 Adding "complete" status...');
        await api.post(`/list/${listId}/status`, { status: 'complete', color: '#6bc950' });
        console.log('  ✅ "complete" status added');
        
        console.log('✅ Added statuses to existing folder list');
      } catch (err: any) {
        console.error('❌ Failed to add statuses to folder list:', err.response?.data || err.message);
        console.log('⚠️ Could not add statuses, using defaults');
      }
    }
  } else if (template.destination.space_id) {
    // Try folderless first
    try {
      const payload = {
        name: listName,
        content: template.meta.slug,
        statuses: [
          { status: 'to do', color: '#d3d3d3', orderindex: 0 },
          { status: 'in progress', color: '#3397dd', orderindex: 1 },
          { status: 'complete', color: '#6bc950', orderindex: 2 }
        ]
      };
      response = await api.post(`/space/${template.destination.space_id}/list`, payload);
      } catch (error: any) {
        if (error.response?.data?.ECODE === 'SUBCAT_114') {
          console.log('⚠️ Space requires folder - creating one automatically...');
          
          // Create folder
          const folderPayload = { name: `${template.meta.slug}_folder_${timestamp}` };
          const folderResponse = await api.post(`/space/${template.destination.space_id}/folder`, folderPayload);
          const folderId = folderResponse.data.id;
          console.log(`📁 Created folder: ${folderPayload.name} (${folderId})`);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Create list WITH statuses (try different format)
          try {
            // Try with status array first
            const listPayload = {
              name: listName,
              content: template.meta.slug,
              statuses: [
                { status: 'to do', color: '#d3d3d3', orderindex: 0 },
                { status: 'in progress', color: '#3397dd', orderindex: 1 },
                { status: 'complete', color: '#6bc950', orderindex: 2 }
              ]
            };
            response = await api.post(`/folder/${folderId}/list`, listPayload);
          } catch (statusError: any) {
            console.log('⚠️ Failed with statuses, trying simple list creation...');
            // Create simple list first
            const simplePayload = {
              name: listName,
              content: template.meta.slug
            };
            response = await api.post(`/folder/${folderId}/list`, simplePayload);
            
            // Add statuses after list creation
            const listId = response.data.id;
            console.log(`📋 Adding statuses to list ${listId}...`);
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Add custom statuses one by one with error handling
            try {
              console.log('  📌 Adding "to do" status...');
              await api.post(`/list/${listId}/status`, { status: 'to do', color: '#d3d3d3' });
              console.log('  ✅ "to do" status added');
              
              await new Promise(resolve => setTimeout(resolve, 200));
              
              console.log('  📌 Adding "in progress" status...');
              await api.post(`/list/${listId}/status`, { status: 'in progress', color: '#3397dd' });
              console.log('  ✅ "in progress" status added');
              
              await new Promise(resolve => setTimeout(resolve, 200));
              
              console.log('  📌 Adding "complete" status...');
              await api.post(`/list/${listId}/status`, { status: 'complete', color: '#6bc950' });
              console.log('  ✅ "complete" status added');
              
              console.log('✅ All custom statuses added to list');
            } catch (err: any) {
              console.error('❌ Failed to add custom statuses:', err.response?.data || err.message);
              console.log('⚠️ List may only have default statuses');
            }
          }
        } else {
          throw error;
        }
      }
    } else {
      throw new Error('No folder_id or space_id provided for new list creation');
    }
  
    console.log(`✅ Created new list: ${listName} (${response.data.id})`);
    return response.data.id;
  }

async function getTeamUserMap(api: AxiosInstance): Promise<Record<string, string>> {
  const userMap: Record<string, string> = {};
  
  try {
    const teamsResponse = await api.get('/team');
    if (teamsResponse.data.teams?.length > 0) {
      const teamId = teamsResponse.data.teams[0].id;
      const teamResponse = await api.get(`/team/${teamId}`);
      
      teamResponse.data.team.members.forEach((member: any) => {
        userMap[member.user.email] = member.user.id;
      });
      
      // Log the mapping
      console.log('📧 Email to ID mapping created:');
      Object.entries(userMap).forEach(([email, id]) => {
        console.log(`  ${email} => ${id}`);
      });
    }
  } catch (error) {
    console.warn('Could not fetch team members:', error);
  }
  
  return userMap;
}

async function createTask(
  api: AxiosInstance,
  listId: string,
  taskData: any
): Promise<any> {
  // Log what we're sending
  console.log(`  📤 Creating task with assignees: ${taskData.assignees?.join(', ') || 'NONE'}`);
  
  const payload: any = {
    name: taskData.name,
    description: taskData.description,
    status: taskData.status,
    priority: taskData.priority,
    tags: taskData.tags,
    assignees: taskData.assignees,
    custom_fields: taskData.custom_fields
  };

  // Add parent if it's a subtask
  if (taskData.parent) {
    payload.parent = taskData.parent;
  }

  // Add dates
  if (taskData.due_date) {
    payload.due_date = new Date(taskData.due_date).getTime();
    payload.due_date_time = false;
  }
  if (taskData.start_date) {
    payload.start_date = new Date(taskData.start_date).getTime();
    payload.start_date_time = false;
  }

  const response = await api.post(`/list/${listId}/task`, payload);
  
  // Log what we got back
  if (response.data.assignees?.length > 0) {
    console.log(`  ✅ Task confirmed with assignees: ${response.data.assignees.map((a: any) => a.username || a.email || a.id).join(', ')}`);
  } else {
    console.log(`  ⚠️ Task created but NO ASSIGNEES confirmed by ClickUp!`);
  }
  
  return response.data;
}

async function createChecklist(
  api: AxiosInstance,
  taskId: string,
  title: string,
  items: string[]
): Promise<any> {
  // Create checklist
  const checklistResponse = await api.post(`/task/${taskId}/checklist`, {
    name: title
  });
          const checklist = checklistResponse.data.checklist;
          
  // Add items with small delays to avoid rate limiting
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && i % 5 === 0) {
      // Small delay every 5 items
      await rateLimitDelay(200);
    }
    
            await api.post(`/checklist/${checklist.id}/checklist_item`, {
      name: items[i],
      orderindex: i,
      resolved: false
    });
  }

  return checklist;
}

function resolveAssignees(
  role: string | undefined,
  rolesMap: Record<string, string> | undefined,
  userMap: Record<string, string>
): string[] {
  if (!role || !rolesMap || !rolesMap[role]) {
    console.log(`  ⚠️ No assignee: role=${role}, has rolesMap=${!!rolesMap}`);
    return [];
  }
  
  const email = rolesMap[role];
  const userId = userMap[email];
  
  console.log(`  📌 Resolving assignee: ${role} => ${email} => ${userId || 'NOT FOUND'}`);
  
  if (!userId) {
    console.warn(`  ❌ User ${email} not found in workspace!`);
    return [];
  }
  
  return [userId];
}

// FIX: Add the missing mergeAndFormatCustomFields function
function mergeAndFormatCustomFields(
  defaults: Record<string, any> | undefined,
  specific: Record<string, any> | undefined,
  fieldMap: Record<string, string>
): any[] {
  const merged = { ...defaults, ...specific };
  return formatCustomFields(merged, fieldMap);
}

function formatCustomFields(
  fields: Record<string, any> | undefined,
  fieldMap: Record<string, string>
): any[] {
  if (!fields) return [];
  
  const formatted: any[] = [];
  
  // Create case-insensitive lookup
  const fieldMapLower: Record<string, string> = {};
  Object.entries(fieldMap).forEach(([name, id]) => {
    fieldMapLower[name.toLowerCase().trim()] = id;
  });
  
  for (const [name, value] of Object.entries(fields)) {
    // Try exact match first, then case-insensitive
    const fieldId = fieldMap[name] || fieldMapLower[name.toLowerCase().trim()];
    
    if (!fieldId) {
      console.log(`    ⚠️ Skipping field "${name}" - no match found`);
      continue;
    }
    
    // Handle date fields
    let formattedValue = value;
    if (name.toLowerCase().includes('date') && typeof value === 'string') {
      formattedValue = new Date(value).getTime();
    }
    
    formatted.push({
      id: fieldId,
      value: formattedValue
    });
  }
  
  return formatted;
}

async function ensureAllUsersHaveAccess(
  api: AxiosInstance,
  listId: string,
  template: TemplateSchema
): Promise<void> {
  // Extract all unique emails from template
  const allEmails = new Set<string>();
  
  if (template.roles_map) {
    Object.values(template.roles_map).forEach(email => allEmails.add(email));
  }
  
  template.phases.forEach(phase => {
    phase.actions?.forEach(action => {
      action.watchers?.forEach(email => allEmails.add(email));
    });
  });
  
  console.log(`🔑 Found ${allEmails.size} users in template`);
  
  try {
    // Get team members to map emails to IDs
    const teamsResponse = await api.get('/team');
    const teamId = teamsResponse.data.teams[0].id;
    const teamResponse = await api.get(`/team/${teamId}`);
    
    // Create email to user ID map
    const emailToUserId: Record<string, string> = {};
    teamResponse.data.team.members.forEach((member: any) => {
      emailToUserId[member.user.email] = member.user.id;
      console.log(`  Found team member: ${member.user.email} (ID: ${member.user.id})`);
    });
    
    // Check if all required users exist in the team
    const missingUsers: string[] = [];
    allEmails.forEach(email => {
      if (!emailToUserId[email]) {
        missingUsers.push(email);
      }
    });
    
    if (missingUsers.length > 0) {
      console.warn(`⚠️ These users are NOT in your workspace: ${missingUsers.join(', ')}`);
      console.warn(`  They need to be invited to the workspace first!`);
    }
    
    // The ONLY thing we can check via API
    const listMembersResponse = await api.get(`/list/${listId}/member`);
    const listMembers = listMembersResponse.data.members || [];
    console.log(`📋 List currently has ${listMembers.length} members with access`);
    
    // Note: We cannot add members to the list via API
    // They must have access to the parent Space
    
  } catch (error: any) {
    console.error('Error checking access:', error.response?.data || error.message);
  }
}