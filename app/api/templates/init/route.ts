import { NextRequest, NextResponse } from 'next/server';
import { TemplateManager } from '@/lib/template-manager';

export async function POST(request: NextRequest) {
  try {
    const { apiToken, spaceId } = await request.json();
    
    if (!apiToken || !spaceId) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const templateManager = new TemplateManager(apiToken, '');
    const listId = await templateManager.initializeTemplateLibrary(spaceId);
    
    return NextResponse.json({
      success: true,
      listId
    });
    
  } catch (error: any) {
    console.error('Failed to initialize template library:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}