import { NextRequest, NextResponse } from 'next/server';
import { TemplateManager } from '@/lib/template-manager';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const { 
      apiToken, 
      templateListId, 
      template, 
      deploymentResult, 
      metadata 
    } = await request.json();
    
    if (!apiToken || !templateListId || !template || !deploymentResult) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const { TemplateManager } = await import('@/lib/template-manager');

    const templateManager = new TemplateManager(apiToken, templateListId);

    // Debug: Check what statuses exist
        try {
        const debugResponse = await axios.get(
            `https://api.clickup.com/api/v2/list/${templateListId}`,
            {
            headers: { 'Authorization': apiToken }
            }
        );
        console.log('Available statuses for list:', debugResponse.data.statuses.map((s: any) => ({
            status: s.status,
            type: s.type
        })));
        } catch (error) {
        console.error('Debug failed:', error);
        }
    
    // Validate template before saving
    const validation = templateManager.validateTemplate(template);
    if (!validation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Invalid template',
          errors: validation.errors 
        },
        { status: 400 }
      );
    }
    
    const taskId = await templateManager.saveAsTemplate(
      template,
      deploymentResult,
      metadata
    );
    
    return NextResponse.json({
      success: true,
      taskId
    });
    
  } catch (error: any) {
    console.error('Failed to save template:', error);
    // Return proper error status and message
    return NextResponse.json(
        { 
          success: false, 
          message: error.message || 'Failed to save template'
        },
        { status: error.message?.includes('already exists') ? 409 : 500 }
      );
  }
}