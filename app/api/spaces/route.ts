import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import axios from 'axios';

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const apiToken = searchParams.get('apiToken');
    const teamId = searchParams.get('teamId');
    const spaceName = searchParams.get('spaceName');

    if (!apiToken || !teamId) {
      return NextResponse.json({ 
        error: 'Missing required parameters: apiToken and teamId' 
      }, { status: 400 });
    }

    // Create axios instance
    const api = axios.create({
      baseURL: 'https://api.clickup.com/api/v2',
      headers: {
        'Authorization': apiToken,
        'Content-Type': 'application/json'
      }
    });

    // Get all spaces for the team
    const response = await api.get(`/team/${teamId}/space`);
    const spaces = response.data.spaces;

    // If spaceName is provided, search for matching space
    if (spaceName) {
      const matchingSpace = spaces.find((space: any) => 
        space.name.toLowerCase() === spaceName.toLowerCase()
      );
      
      if (matchingSpace) {
        return NextResponse.json({ 
          space: matchingSpace,
          spaceId: matchingSpace.id 
        });
      } else {
        return NextResponse.json({ 
          error: `Space "${spaceName}" not found`,
          availableSpaces: spaces.map((s: any) => ({ id: s.id, name: s.name }))
        }, { status: 404 });
      }
    }

    // Return all spaces if no specific name requested
    return NextResponse.json({ 
      spaces: spaces.map((s: any) => ({ id: s.id, name: s.name })) 
    });

  } catch (error: any) {
    console.error('Spaces API error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch spaces',
      details: error.response?.data || error.message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { apiToken, spaceId, getLists } = await request.json();

    if (!apiToken) {
      return NextResponse.json({ 
        error: 'Missing required parameter: apiToken' 
      }, { status: 400 });
    }

    // Create axios instance
    const api = axios.create({
      baseURL: 'https://api.clickup.com/api/v2',
      headers: {
        'Authorization': apiToken,
        'Content-Type': 'application/json'
      }
    });

    // If getting lists for a specific space
    if (spaceId && getLists) {
      const listsRes = await api.get(`/space/${spaceId}/list`);
      return NextResponse.json({ 
        lists: listsRes.data.lists || [],
        success: true 
      });
    }

    // Get team first
    const teamRes = await api.get('/team');
    const teams = teamRes.data.teams;
    
    if (!teams || teams.length === 0) {
      return NextResponse.json({ 
        spaces: [],
        success: true 
      });
    }

    // Get all spaces
    let allSpaces = [];
    for (const team of teams) {
      const spacesRes = await api.get(`/team/${team.id}/space`);
      allSpaces.push(...(spacesRes.data.spaces || []));
    }

    return NextResponse.json({ 
      spaces: allSpaces,
      success: true 
    });

  } catch (error: any) {
    console.error('Spaces API error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch spaces',
      spaces: [],
      lists: [],
      success: false,
      details: error.response?.data || error.message 
    }, { status: 500 });
  }
}
