import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const { apiToken, spaceId, folderName } = await request.json();
    
    if (!apiToken || !spaceId || !folderName) {
      return NextResponse.json({ 
        error: 'API token, space ID, and folder name are required',
        success: false 
      }, { status: 400 });
    }

    const api = axios.create({
      baseURL: 'https://api.clickup.com/api/v2',
      headers: { 'Authorization': apiToken },
      timeout: 10000
    });

    // Create folder in space
    const response = await api.post(`/space/${spaceId}/folder`, {
      name: folderName
    });

    return NextResponse.json({ 
      folder: response.data,
      success: true 
    });

  } catch (error: any) {
    console.error('ClickUp folder creation error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      return NextResponse.json({ 
        error: 'Invalid API token',
        success: false 
      }, { status: 401 });
    }
    
    if (error.response?.status === 404) {
      return NextResponse.json({ 
        error: 'Space not found',
        success: false 
      }, { status: 404 });
    }

    if (error.response?.data?.err) {
      return NextResponse.json({ 
        error: error.response.data.err,
        success: false 
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      error: 'Failed to create folder',
      success: false 
    }, { status: 500 });
  }
}