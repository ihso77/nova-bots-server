const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://daqpmzbbmjigmxubjfkx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// API Key for authentication
const API_KEY = process.env.BOTS_API_KEY || 'nova-bots-secret-key-2024';

// Store running bots
const runningBots = new Map();

// Auth middleware
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Nova Bots Server',
    version: '1.0.0',
    runningBots: runningBots.size
  });
});

// Start bot
app.post('/bot/start', authMiddleware, async (req, res) => {
  const { botId, files, envVars, userId } = req.body;

  if (!botId || !files || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Check if bot is already running - if so, restart it
  if (runningBots.has(botId)) {
    const existingBot = runningBots.get(botId);
    try {
      existingBot.process.kill('SIGTERM');
      runningBots.delete(botId);
      console.log(`Killed existing bot ${botId} for restart`);
    } catch (e) {
      console.log(`Failed to kill existing bot: ${e.message}`);
    }
  }

  const botDir = `/tmp/bot-${botId}`;

  try {
    // Create bot directory
    if (!fs.existsSync(botDir)) {
      fs.mkdirSync(botDir, { recursive: true });
    }

    // Write files
    for (const file of files) {
      const filePath = file.path === '/' 
        ? path.join(botDir, file.filename)
        : path.join(botDir, file.path, file.filename);
      
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, file.content || '');
    }

    // Write .env file
    const envContent = (envVars || []).map(e => `${e.key}=${e.value || ''}`).join('\n');
    fs.writeFileSync(path.join(botDir, '.env'), envContent);

    // Create environment object
    const env = { ...process.env };
    (envVars || []).forEach(e => {
      if (e.key && e.value) {
        env[e.key] = e.value;
      }
    });

    // Find main file
    let mainFile = files.find(f => f.filename === 'index.js');
    if (!mainFile) mainFile = files.find(f => f.filename === 'main.js');
    if (!mainFile) mainFile = files.find(f => f.filename === 'bot.js');
    if (!mainFile) mainFile = files.find(f => f.filename.endsWith('.js'));

    if (!mainFile) {
      throw new Error('No JavaScript file found');
    }

    const mainPath = mainFile.path === '/'
      ? path.join(botDir, mainFile.filename)
      : path.join(botDir, mainFile.path, mainFile.filename);

    // Use node_modules from server directory
    const serverDir = __dirname;
    const nodeModulesPath = path.join(serverDir, 'node_modules');

    // Set NODE_PATH to find modules
    env.NODE_PATH = nodeModulesPath;

    console.log(`Starting bot ${botId} from ${mainPath}`);
    console.log(`NODE_PATH: ${nodeModulesPath}`);

    // Start bot process
    const botProcess = spawn('node', [mainPath], {
      cwd: botDir,
      env: env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Store process
    runningBots.set(botId, {
      process: botProcess,
      pid: botProcess.pid,
      startedAt: new Date(),
      logs: []
    });

    // Handle stdout
    botProcess.stdout.on('data', async (data) => {
      const log = data.toString();
      const botInfo = runningBots.get(botId);
      if (botInfo) {
        botInfo.logs.push({ type: 'info', message: log, time: new Date() });
        // Keep only last 100 logs
        if (botInfo.logs.length > 100) {
          botInfo.logs.shift();
        }
      }
      // Send to Supabase
      if (SUPABASE_SERVICE_KEY) {
        await supabase.from('bot_logs').insert({
          bot_id: botId,
          log_type: 'info',
          message: log.trim()
        });
      }
    });

    // Handle stderr
    botProcess.stderr.on('data', async (data) => {
      const log = data.toString();
      const botInfo = runningBots.get(botId);
      if (botInfo) {
        botInfo.logs.push({ type: 'error', message: log, time: new Date() });
      }
      if (SUPABASE_SERVICE_KEY) {
        await supabase.from('bot_logs').insert({
          bot_id: botId,
          log_type: 'error',
          message: log.trim()
        });
      }
    });

    // Handle exit
    botProcess.on('exit', async (code) => {
      runningBots.delete(botId);
      
      // Update status in Supabase
      if (SUPABASE_SERVICE_KEY) {
        await supabase.from('user_bots').update({ status: 'stopped' }).eq('id', botId);
        await supabase.from('bot_logs').insert({
          bot_id: botId,
          log_type: code === 0 ? 'success' : 'error',
          message: `Bot exited with code ${code}`
        });
      }

      // Cleanup
      try {
        fs.rmSync(botDir, { recursive: true, force: true });
      } catch (e) {}
    });

    // Update status in Supabase
    if (SUPABASE_SERVICE_KEY) {
      await supabase.from('user_bots').update({ status: 'running' }).eq('id', botId);
      await supabase.from('bot_logs').insert({
        bot_id: botId,
        log_type: 'info',
        message: '🚀 تم تشغيل البوت على خادم Nova!'
      });
    }

    res.json({
      success: true,
      message: 'Bot started',
      pid: botProcess.pid,
      platform: 'Nova'
    });

  } catch (error) {
    // Cleanup on error
    try {
      fs.rmSync(botDir, { recursive: true, force: true });
    } catch (e) {}

    res.status(500).json({ error: error.message });
  }
});

// Stop bot
app.post('/bot/stop', authMiddleware, async (req, res) => {
  const { botId } = req.body;

  if (!botId) {
    return res.status(400).json({ error: 'Missing botId' });
  }

  const botInfo = runningBots.get(botId);
  if (!botInfo) {
    return res.status(404).json({ error: 'Bot not running' });
  }

  try {
    botInfo.process.kill('SIGTERM');
    runningBots.delete(botId);

    // Update Supabase
    if (SUPABASE_SERVICE_KEY) {
      await supabase.from('user_bots').update({ status: 'stopped' }).eq('id', botId);
      await supabase.from('bot_logs').insert({
        bot_id: botId,
        log_type: 'info',
        message: '⏹️ Bot stopped'
      });
    }

    res.json({ success: true, message: 'Bot stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get bot status
app.get('/bot/status/:botId', authMiddleware, (req, res) => {
  const { botId } = req.params;
  const botInfo = runningBots.get(botId);

  if (botInfo) {
    res.json({
      status: 'running',
      pid: botInfo.pid,
      startedAt: botInfo.startedAt,
      logsCount: botInfo.logs.length
    });
  } else {
    res.json({ status: 'stopped' });
  }
});

// Get bot logs
app.get('/bot/logs/:botId', authMiddleware, (req, res) => {
  const { botId } = req.params;
  const botInfo = runningBots.get(botId);

  if (botInfo) {
    res.json({
      status: 'running',
      logs: botInfo.logs.slice(-50) // Last 50 logs
    });
  } else {
    res.json({ status: 'stopped', logs: [] });
  }
});

// List all running bots
app.get('/bots', authMiddleware, (req, res) => {
  const bots = [];
  runningBots.forEach((info, id) => {
    bots.push({
      botId: id,
      pid: info.pid,
      startedAt: info.startedAt,
      logsCount: info.logs.length
    });
  });
  res.json({ bots, count: bots.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Nova Bots Server يعمل على المنفذ ${PORT}`);
});
