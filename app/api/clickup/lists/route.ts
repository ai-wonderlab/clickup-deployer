// app/api/clickup/lists/route.ts
export async function POST(request: Request) {
    const { apiToken, spaceId, folderId } = await request.json();
    
    let url = 'https://api.clickup.com/api/v2';
    if (folderId) {
      url += `/folder/${folderId}/list`;
    } else if (spaceId) {
      url += `/space/${spaceId}/list`;
    }
    
    const response = await fetch(url, {
      headers: { 'Authorization': apiToken }
    });
    
    const data = await response.json();
    return Response.json(data.lists || []);
  }