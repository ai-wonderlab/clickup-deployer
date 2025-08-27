import { NextRequest, NextResponse } from 'next/server';
import { TemplateManager } from '@/lib/template-manager';

export async function POST(request: NextRequest) {
  try {
    const { apiToken, templateListId, taskId } = await request.json();
    
    if (!apiToken || !templateListId || !taskId) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const templateManager = new TemplateManager(apiToken, templateListId);
    const template = await templateManager.getTemplateContent(taskId);
    
    return NextResponse.json({
      success: true,
      template
    });
    
  } catch (error: any) {
    console.error('Failed to fetch template content:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}