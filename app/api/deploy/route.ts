import { NextRequest, NextResponse } from 'next/server';
import { deployTemplateSmartly } from '@/lib/clickup-api';

class LogCapture {
  logs: string[] = [];
  originalLog: any;
  originalError: any;
  originalWarn: any;

  start() {
    this.logs = [];
    this.originalLog = console.log;
    this.originalError = console.error;
    this.originalWarn = console.warn;

    console.log = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      this.logs.push(message);
      this.originalLog.apply(console, args);
    };

    console.error = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      this.logs.push(`ERROR: ${message}`);
      this.originalError.apply(console, args);
    };

    console.warn = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      this.logs.push(`WARN: ${message}`);
      this.originalWarn.apply(console, args);
    };
  }

  stop() {
    console.log = this.originalLog;
    console.error = this.originalError;
    console.warn = this.originalWarn;
  }

  getLogs() {
    return this.logs;
  }
}

export async function POST(request: NextRequest) {
  const logCapture = new LogCapture();
  
  try {
    const body = await request.json();
    const { 
      template, 
      apiToken, 
      stopOnMissingFields, 
      delayBetweenCalls,
      selectedTemplateId,
      templateListId 
    } = body;
    
    if (!template || !apiToken) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Missing template or API token',
          logs: [] 
        },
        { status: 400 }
      );
    }

    logCapture.start();

    const result = await deployTemplateSmartly(
      template,
      apiToken,
      { 
        stopOnMissingFields: stopOnMissingFields || false,
        delayBetweenCalls: delayBetweenCalls || 500,
        enableRollback: true  // Enable cleanup on failure
      }
    );

    logCapture.stop();
    const logs = logCapture.getLogs();

    // Report back to template if deployed from library
    if (result.success && selectedTemplateId && templateListId) {
      try {
        const { TemplateManager } = await import('@/lib/template-manager');
        const templateManager = new TemplateManager(apiToken, templateListId);
        await templateManager.reportTemplateDeployment(selectedTemplateId, result);
        console.log('Deployment reported back to template task');
      } catch (error) {
        console.error('Failed to report deployment:', error);
      }
    }

    return NextResponse.json({
      ...result,
      logs
    });

  } catch (error: any) {
    logCapture.stop();
    console.error('API route error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || 'Internal server error',
        logs: logCapture.getLogs()
      },
      { status: 500 }
    );
  }
}