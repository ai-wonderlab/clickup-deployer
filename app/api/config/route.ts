import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Return configuration for authenticated users
    return NextResponse.json({
      apiToken: process.env.CLICKUP_API_TOKEN || '',
      templateListId: process.env.CLICKUP_TEMPLATE_LIST_ID || ''
    });
  } catch (error) {
    console.error('Config API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
