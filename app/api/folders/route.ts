// app/api/folders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const { apiToken, spaceId, folderId, getLists } = await request.json();
    
    if (!apiToken) {
      return NextResponse.json({ error: 'API token required' }, { status: 400 });
    }

    const api = axios.create({
      baseURL: 'https://api.clickup.com/api/v2',
      headers: { 'Authorization': apiToken },
      timeout: 10000
    });

    // If getting lists from a specific folder
    if (folderId && getLists) {
      const response = await api.get(`/folder/${folderId}/list`);
      return NextResponse.json({ 
        lists: response.data.lists || [],
        success: true 
      });
    }

    // If getting folders from a specific space
    if (spaceId) {
      const response = await api.get(`/space/${spaceId}/folder`);
      return NextResponse.json({ 
        folders: response.data.folders || [],
        success: true 
      });
    }

    return NextResponse.json({ 
      error: 'Either spaceId or folderId with getLists flag required' 
    }, { status: 400 });

  } catch (error: any) {
    console.error('ClickUp folders API error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      return NextResponse.json({ 
        error: 'Invalid API token',
        success: false 
      }, { status: 401 });
    }
    
    if (error.response?.status === 404) {
      return NextResponse.json({ 
        error: 'Space or folder not found',
        folders: [],
        lists: [],
        success: false 
      }, { status: 404 });
    }
    
    return NextResponse.json({ 
      error: 'Failed to fetch folders/lists',
      folders: [],
      lists: [],
      success: false 
    }, { status: 500 });
  }
}