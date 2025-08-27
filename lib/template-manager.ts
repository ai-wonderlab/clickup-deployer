import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { TemplateSchema } from './clickup-api';

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

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
  attachmentUrl?: string;
}

export class TemplateManager {
  private api: AxiosInstance;
  private templateListId: string;
  private apiToken: string;

  constructor(apiToken: string, templateListId: string) {
    this.templateListId = templateListId;
    this.apiToken = apiToken;
    this.api = axios.create({
      baseURL: CLICKUP_API_BASE,
      headers: {
        'Authorization': apiToken,
        'Content-Type': 'application/json'
      }
    });
  }


  async getCustomFieldIds(): Promise<Record<string, string>> {
    try {
      const response = await this.api.get(`/list/${this.templateListId}/field`);
      const fields = response.data.fields || [];
      
      const fieldMap: Record<string, string> = {};
      fields.forEach((field: any) => {
        fieldMap[field.name] = field.id;
      });
      
      console.log('Template Library Fields:', fieldMap);
      return fieldMap;
    } catch (error) {
      console.error('Failed to get custom fields:', error);
      return {};
    }
  }

  async getTemplateRegistry(): Promise<TemplateMetadata[]> {
    try {
      const response = await this.api.get(`/list/${this.templateListId}/task`);
      const tasks = response.data.tasks || [];
      
      const templates: TemplateMetadata[] = [];
      
      for (const task of tasks) {
        const customFields = task.custom_fields || [];
        
        // Match your actual field names
        const version = customFields.find((f: any) => f.name === 'Version')?.value || '1.0.0';
        const slug = customFields.find((f: any) => f.name === 'Slug')?.value || '';
        const deployCount = customFields.find((f: any) => f.name === 'Deploy Count')?.value || 0;
        const lastDeployed = customFields.find((f: any) => f.name === 'Last Deployed')?.value;
        
        const jsonAttachment = task.attachments?.find((a: any) => 
          a.title?.endsWith('.json') || a.extension === 'json'
        );
        
        templates.push({
          id: task.id,
          taskId: task.id,
          name: task.name,
          version,
          slug,
          description: task.description,
          createdAt: new Date(parseInt(task.date_created)).toISOString(),
          deployCount: parseInt(deployCount) || 0,
          lastDeployed,
          attachmentUrl: jsonAttachment?.url
        });
      }
      
      return templates;
    } catch (error) {
      console.error('Failed to fetch template registry:', error);
      return [];
    }
  }

  async getTemplateContent(taskId: string): Promise<any> {
    try {
      const taskResponse = await this.api.get(`/task/${taskId}`);
      const task = taskResponse.data;
      
      const jsonAttachment = task.attachments?.find((a: any) => 
        a.title?.endsWith('.json') || a.extension === 'json'
      );
      
      if (!jsonAttachment) {
        throw new Error('No JSON template found in task attachments');
      }
      
      const contentResponse = await axios.get(jsonAttachment.url);
      return contentResponse.data;
      
    } catch (error) {
      console.error('Failed to get template content:', error);
      throw error;
    }
  }

  async saveAsTemplate(
    template: TemplateSchema,
    deploymentResult: any,
    metadata?: any
  ): Promise<string> {
    try {
      const fieldIds = await this.getCustomFieldIds();
      
      const taskName = `${template.meta.slug} — v${template.meta.version}`;

       // Check for existing template with same name
    const existingTemplates = await this.api.get(`/list/${this.templateListId}/task`);
    const duplicate = existingTemplates.data.tasks?.find((task: any) => 
      task.name === taskName
    );
    
    if (duplicate) {
      // Throw error
      throw new Error(`Template "${taskName}" already exists. Use a different version number.`);
      }

      const description = `Template: ${template.meta.slug}
  Version: ${template.meta.version}
  ${metadata?.description || ''}
  
  Deployment Summary:
  - Phases: ${deploymentResult.phases?.length || 0}
  - Actions: ${deploymentResult.actions?.length || 0}
  - Checklists: ${deploymentResult.checklists?.length || 0}
  - Target List: ${deploymentResult.listId}`;
      
      // Build custom fields
      const customFields = [];
      
      // Your actual field names
      if (fieldIds['Version']) {
        customFields.push({ id: fieldIds['Version'], value: template.meta.version });
      }
      if (fieldIds['Slug']) {
        customFields.push({ id: fieldIds['Slug'], value: template.meta.slug });
      }
      if (fieldIds['Target Space']) {
        customFields.push({ id: fieldIds['Target Space'], value: template.destination?.space_id || template.destination?.folder_id || template.destination?.list_id });
      }
      if (fieldIds['TemplateStatus']) {
        // Find the dropdown option ID for "Ready"
        const fieldDetails = await this.api.get(`/list/${this.templateListId}/field`);
        const statusField = fieldDetails.data.fields.find((f: any) => f.name === 'TemplateStatus');
        if (statusField && statusField.type_config?.options) {
          const readyOption = statusField.type_config.options.find((o: any) => o.name === 'Ready');
          if (readyOption) {
            customFields.push({ id: fieldIds['TemplateStatus'], value: readyOption.id });
          }
        }
      }
      if (fieldIds['Deploy Count']) {
        customFields.push({ id: fieldIds['Deploy Count'], value: 1 });
      }
      if (fieldIds['Last Deployed']) {
        customFields.push({ id: fieldIds['Last Deployed'], value: Date.now() });
      }
      
      const taskPayload = {
        name: taskName,
        description: description,
        custom_fields: customFields.length > 0 ? customFields : undefined
      };
      
      const response = await this.api.post(`/list/${this.templateListId}/task`, taskPayload);
      const taskId = response.data.id;
      
      // Upload JSON attachment
      const formData = new FormData();
      const jsonContent = JSON.stringify(template, null, 2);
      const buffer = Buffer.from(jsonContent);
      
      formData.append('attachment', buffer, {
        filename: `${template.meta.slug}_v${template.meta.version}.json`,
        contentType: 'application/json'
      });
      
      await axios.post(
        `${CLICKUP_API_BASE}/task/${taskId}/attachment`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': this.apiToken
          }
        }
      );
      
      await this.reportTemplateDeployment(taskId, deploymentResult, true);
      
      return taskId;
    } catch (error) {
      console.error('Failed to save template:', error);
      throw error;
    }
  }

  async debugListStatuses(listId: string): Promise<void> {
    try {
      const response = await this.api.get(`/list/${listId}`);
      console.log('List statuses:', response.data.statuses);
      response.data.statuses.forEach((status: any) => {
        console.log(`- "${status.status}" (type: ${status.type}, color: ${status.color})`);
      });
    } catch (error) {
      console.error('Failed to get list statuses:', error);
    }
  }

  async reportTemplateDeployment(
    templateTaskId: string,
    deploymentResult: any,
    isInitial: boolean = false
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const status = deploymentResult.success ? '✅ Success' : '❌ Failed';
      
      // Add deployment comment
      const comment = `${status} - Deployment Report
  ${isInitial ? 'Initial deployment after creation' : 'Deployed from template'}
  Timestamp: ${timestamp}
  Target List: ${deploymentResult.listId}
  
  Results:
  - Phases: ${deploymentResult.phases?.length || 0}
  - Actions: ${deploymentResult.actions?.length || 0}
  - Checklists: ${deploymentResult.checklists?.length || 0}`;
  
      await this.api.post(`/task/${templateTaskId}/comment`, {
        comment_text: comment,
        notify_all: false
      });
      
      // Update fields on subsequent deployments
      if (!isInitial && deploymentResult.success) {
        const fieldIds = await this.getCustomFieldIds();
        
        // Get current task data
        const taskResponse = await this.api.get(`/task/${templateTaskId}`);
        const currentFields = taskResponse.data.custom_fields || [];
        
        // Get current deploy count
        let currentCount = 0;
        const deployCountField = currentFields.find((f: any) => f.name === 'Deploy Count');
        if (deployCountField) {
          currentCount = parseInt(deployCountField.value) || 0;
        }
        
        // Build field updates
        const updates: any[] = [];
        if (fieldIds['Deploy Count']) {
          updates.push({ id: fieldIds['Deploy Count'], value: currentCount + 1 });
        }
        if (fieldIds['Last Deployed']) {
          updates.push({ id: fieldIds['Last Deployed'], value: Date.now() });
        }
        
        // Update task
        if (updates.length > 0) {
          await this.api.put(`/task/${templateTaskId}`, {
            custom_fields: updates
          });
          console.log(`Updated: Deploy Count=${currentCount + 1}, Last Deployed=${timestamp}`);
        }
      }
    } catch (error) {
      console.error('Failed to report deployment:', error);
    }
  }

  async initializeTemplateLibrary(spaceId: string): Promise<string> {
    try {
      const folderResponse = await this.api.post(`/space/${spaceId}/folder`, {
        name: 'TEMPLATES LIBRARY'
      });
      
      const folderId = folderResponse.data.id;
      
      const listResponse = await this.api.post(`/folder/${folderId}/list`, {
        name: 'Template Definitions',
        content: 'Template version control and registry',
        status: [
          { status: 'Draft', color: '#858585', orderindex: 0 },
          { status: 'Ready', color: '#10b981', orderindex: 1 },
          { status: 'Deprecated', color: '#ef4444', orderindex: 2 }
        ]
      });
      
      const listId = listResponse.data.id;
      
      const customFields = [
        { name: 'Version', type: 'short_text' },
        { name: 'Template Slug', type: 'short_text' },
        { name: 'Deploy Count', type: 'number' },
        { name: 'Last Deployed', type: 'date' },
        { name: 'Target Space', type: 'short_text' },
        { name: 'Dry Run', type: 'checkbox' }
      ];
      
      for (const field of customFields) {
        await this.api.post(`/list/${listId}/field`, field);
      }
      
      console.log(`Created template library: ${listId}`);
      return listId;
      
    } catch (error) {
      console.error('Failed to initialize template library:', error);
      throw error;
    }
  }

  async getLatestVersion(slug: string): Promise<TemplateMetadata | null> {
    const templates = await this.getTemplateRegistry();
    const matchingTemplates = templates.filter(t => t.slug === slug);
    return matchingTemplates.length > 0 ? matchingTemplates[0] : null;
  }

  validateTemplate(template: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!template.meta?.slug) errors.push('Missing meta.slug');
    if (!template.meta?.version) errors.push('Missing meta.version');
    if (!template.destination) errors.push('Missing destination object');
    if (!template.phases || !Array.isArray(template.phases)) {
      errors.push('Missing or invalid phases array');
    }
    
    if (!template.destination?.list_id && 
        !template.destination?.folder_id && 
        !template.destination?.space_id) {
      errors.push('Destination must have at least one of: list_id, folder_id, or space_id');
    }
    
    template.phases?.forEach((phase: any, i: number) => {
      if (!phase.name) errors.push(`Phase ${i} missing name`);
      if (!phase.key) errors.push(`Phase ${i} missing key`);
      
      const keys = template.phases.map((p: any) => p.key);
      if (keys.filter((k: string) => k === phase.key).length > 1) {
        errors.push(`Duplicate phase key: ${phase.key}`);
      }
      
      if (phase.description?.length > 500) {
        errors.push(`Phase ${phase.name} description exceeds 500 characters`);
      }
      
      phase.actions?.forEach((action: any, j: number) => {
        if (!action.name) errors.push(`Action ${j} in phase ${phase.name} missing name`);
        if (action.description?.length > 500) {
          errors.push(`Action ${action.name} description exceeds 500 characters`);
        }
      });
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}