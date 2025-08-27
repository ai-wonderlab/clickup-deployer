import { NextRequest, NextResponse } from 'next/server';
import { TemplateManager } from '@/lib/template-manager';

export async function POST(request: NextRequest) {
  try {
    const { apiToken, templateListId } = await request.json();
    
    if (!apiToken || !templateListId) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const templateManager = new TemplateManager(apiToken, templateListId);
    const templates = await templateManager.getTemplateRegistry();
    
    return NextResponse.json({
      success: true,
      templates
    });
    
  } catch (error: any) {
    console.error('Failed to fetch templates:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}