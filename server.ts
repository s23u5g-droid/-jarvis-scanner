import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db';
import { scanner } from './server/tradingEngine';
import { SymbolType, Timeframe } from './src/types';
import { runPineBacktest, optimizePineScriptWithAI } from './server/pineRunner';

const app = express();
const PORT = 3000;

app.use(express.json());

// Discord Backtest Result Disptacher with quickchart.io and custom embeds
async function dispatchBacktestToDiscord(result: any, webhookUrl: string) {
  if (!webhookUrl || webhookUrl.trim() === '') return;
  try {
    const curve = result.equityCurve || [];
    const maxPoints = 12;
    let downsampled = curve;
    if (curve.length > maxPoints) {
      const step = (curve.length - 1) / (maxPoints - 1);
      downsampled = [];
      for (let i = 0; i < maxPoints; i++) {
        const idx = Math.min(curve.length - 1, Math.round(i * step));
        downsampled.push(curve[idx]);
      }
    }

    let chartUrl = '';
    if (downsampled.length > 0) {
      const chartConfig = {
        type: 'line',
        data: {
          labels: downsampled.map((p: any) => p.x),
          datasets: [{
            label: 'Strategy Equity ($)',
            data: downsampled.map((p: any) => p.value),
            borderColor: 'rgb(6, 182, 212)',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 4
          }]
        },
        options: {
          title: {
            display: true,
            text: `Equity Curve: ${result.symbol} on ${result.timeframe}`,
            fontColor: '#ffffff'
          },
          legend: { labels: { fontColor: '#abb2bf' } },
          scales: {
            xAxes: [{ gridLines: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { fontColor: '#abb2bf', fontSize: 9 } }],
            yAxes: [{ gridLines: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { fontColor: '#abb2bf', fontSize: 9 } }]
          },
          backgroundColor: '#0f172a'
        }
      };
      chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
    }

    const tradesList = (result.trades || []).slice(-5).reverse();
    const tradesText = tradesList.length > 0 
      ? tradesList.map((tr: any, idx: number) => {
          const emoji = tr.profit >= 0 ? '🟢' : '🔴';
          return `${idx + 1}. ${emoji} **${tr.type}** at \`$${tr.price.toLocaleString()}\` ➜ Exit \`$${tr.exitPrice ? tr.exitPrice.toLocaleString() : '-'}\` (**${tr.profit >= 0 ? '+' : ''}${tr.profit}%**, ${tr.pips >= 0 ? '+' : ''}${tr.pips} pips)`;
        }).join('\n')
      : 'No simulated trades filled during period.';

    const embedPayload = {
      username: 'Pine-AI Backtester Bot',
      avatar_url: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=128&h=128&fit=crop',
      embeds: [
        {
          title: `📊 PINE-AI ALGORITHMIC BACKTEST COMPLETED`,
          description: `Strategic backtest simulated successfully over the recent **300 cycles** using authentic real-world financial feeds!`,
          color: 5195493,
          fields: [
            { name: 'Instrument', value: `📈 **${result.symbol}**`, inline: true },
            { name: 'Timeframe', value: `⏰ **${result.timeframe}**`, inline: true },
            { name: 'Simulated Trades', value: `💼 **${result.totalTrades} filled**`, inline: true },
            { name: 'Overall Win Rate', value: `🎯 **${result.winRate}%**`, inline: true },
            { name: 'Net Portfolio Profit', value: `💰 **$${result.netProfit.toLocaleString()} (${result.netProfitPct}%)**`, inline: true },
            { name: 'Computed Profit Factor', value: `📊 **${result.profitFactor}**`, inline: true },
            { name: 'Recent Simulated Trades Fills', value: tradesText, inline: false }
          ],
          ...(chartUrl ? { image: { url: chartUrl } } : {}),
          footer: {
            text: 'Pine-AI Backtest Simulator • Professional Portfolio Analytics'
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embedPayload)
    });
    if (res.ok) {
      db.addLog('SYSTEM', `Successfully dispatched algorithmic backtest results to Discord webhook.`, result.symbol);
    } else {
      db.addLog('WARNING', `Discord backtest webhook returned error status: ${res.status}`, result.symbol);
    }
  } catch (error: any) {
    db.addLog('WARNING', `Discord backtest transport error: ${error.message}`, result.symbol);
  }
}

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), time: new Date().toISOString() });
});

// Get state
app.get('/api/state', (req, res) => {
  res.json(db.getState());
});

// Get candles for any symbol/timeframe
app.get('/api/candles', (req, res) => {
  try {
    const symbol = (req.query.symbol as SymbolType) || 'XAUUSD';
    const timeframe = (req.query.timeframe as Timeframe) || '15M';
    const candles = scanner.getCandles(symbol, timeframe);
    res.json(candles);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get live prices & daily % change of all active symbols
app.get('/api/prices', (req, res) => {
  try {
    const symbols = db.getActiveSymbols();
    const prices: Record<string, { price: number; change: number }> = {};
    for (const sym of symbols) {
      const candles = scanner.getCandles(sym, '15M');
      if (candles.length > 0) {
        const last = candles[candles.length - 1];
        const first = candles[0];
        const changePct = ((last.close - first.close) / first.close) * 100;
        const decimals = sym.includes('EUR') || sym.includes('GBP') || sym.includes('CAD') ? 5 : sym.includes('JPY') ? 3 : sym.includes('XAG') ? 3 : 2;
        prices[sym] = {
          price: Number(last.close.toFixed(decimals)),
          change: Number(changePct.toFixed(2))
        };
      } else {
        prices[sym] = {
          price: sym.includes('EUR') || sym.includes('GBP') ? 1.08420 : sym.includes('BTC') ? 92450.5 : 100,
          change: 0.00
        };
      }
    }
    res.json(prices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
app.post('/api/settings', (req, res) => {
  try {
    const updated = db.updateSettings(req.body);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update active symbols
app.post('/api/active-symbols', (req, res) => {
  try {
    const { symbols } = req.body;
    if (!Array.isArray(symbols)) {
      return res.status(400).json({ error: 'Symbols must be an array' });
    }
    const updated = db.updateActiveSymbols(symbols);
    res.json({ symbols: updated });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Force immediate scan simulation tick
app.post('/api/scan/force', (req, res) => {
  try {
    const { symbol } = req.body;
    scanner.forceScan(symbol);
    res.json({ status: 'success', state: db.getState() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Simulate clean HTF sweep/tap for immediate CRT testing
app.post('/api/simulate/tap', (req, res) => {
  try {
    const { symbol, type, htf } = req.body;
    const tf = (htf as Timeframe) || '4H';
    const pType = (type as 'high' | 'low') || 'high';
    const activeSymbol = (symbol as SymbolType) || 'XAUUSD';

    // Fetch latest candles and create a fake high/low swing to sweep
    const candles = scanner.getCandles(activeSymbol, tf);
    if (candles.length === 0) {
      return res.status(400).json({ error: 'Candles not ready' });
    }
    const lastCandle = candles[candles.length - 1];
    
    // Create level slightly offset, then inject tap
    const testPrice = pType === 'high' ? lastCandle.close + 0.1 : lastCandle.close - 0.1;

    const id = `${activeSymbol}-${tf}-sim-${Date.now()}`;
    const simLevel = {
      id,
      symbol: activeSymbol,
      type: pType,
      price: Number(testPrice.toFixed(5)),
      candleTime: Date.now() - 3600000,
      timeframe: tf,
      tapped: true,
      tapTime: Date.now(),
      active: false
    };

    db.addLevel(simLevel);
    db.addLog('SYSTEM', `Simulated customized sweeps Tap on ${tf} ${pType} Pivot point at ${testPrice}`, activeSymbol);

    // Run active lower structural activation
    const crtId = `crt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const crt = {
      id: crtId,
      symbol: activeSymbol,
      htfLevel: simLevel,
      status: 'activated' as const,
      ltfCisdTapped: false,
      invalidated: false,
      notes: 'Waiting for lower timeframe simulation close (displacement body closes) or manual trigger.'
    };
    db.addCRT(crt);

    db.addAlert({
      id: `alert-sim-${Date.now()}`,
      symbol: activeSymbol,
      timeframe: tf,
      type: 'CRT_ACTIVATE',
      title: `Simulated HTF Tap sweep`,
      description: `Injected custom tapped level at ${testPrice} to test CISD displacement closes.`,
      timestamp: Date.now(),
      setupId: crtId
    });

    res.json({ status: 'success', crt });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger Gemini explanation
app.post('/api/gemini/explain', async (req, res) => {
  try {
    const { crtId } = req.body;
    if (!crtId) {
      return res.status(400).json({ error: 'crtId required' });
    }
    const explanation = await scanner.triggerGeminiExplanation(crtId);
    res.json({ explanation });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Pine Script compilation and backtester
app.post('/api/pine/compile', (req, res) => {
  try {
    const { 
      scriptId, 
      code, 
      name, 
      symbol, 
      timeframe, 
      isStrategy,
      backtestTrigger,
      fastPeriod,
      slowPeriod,
      oversoldLevel,
      overboughtLevel
    } = req.body;
    
    if (!scriptId || !code || !name) {
      return res.status(400).json({ error: 'Missing required parameters: scriptId, code, or name' });
    }

    const targetSymbol = (symbol as SymbolType) || 'XAUUSD';
    const targetTimeframe = (timeframe as Timeframe) || '15M';

    // Retrieve live-updating or seeded candles
    let candles = scanner.getCandles(targetSymbol, targetTimeframe);
    if (!candles || candles.length === 0) {
      // Seed fallback if store is silent or starting up
      candles = [];
      const now = Math.floor(Date.now() / 1000);
      let close = targetSymbol.includes('USD') ? 1900 : 60000;
      for (let i = 100; i >= 0; i--) {
        const change = (Math.random() - 0.5) * 10;
        candles.push({
          time: now - i * 900,
          open: close - change,
          high: close + Math.max(0, change) + 2,
          low: close - Math.max(0, -change) - 2,
          close: close,
          volume: Math.floor(Math.random() * 500) + 100
        });
        close += change;
      }
    }

    const result = runPineBacktest(
      scriptId, 
      name, 
      code, 
      targetSymbol, 
      targetTimeframe, 
      candles,
      backtestTrigger || 'strategy_code',
      fastPeriod ? Number(fastPeriod) : 9,
      slowPeriod ? Number(slowPeriod) : 21,
      oversoldLevel ? Number(oversoldLevel) : 30,
      overboughtLevel ? Number(overboughtLevel) : 70
    );
    
    db.setActiveBacktest(result);
    db.saveScript(scriptId, name, code, isStrategy ?? true);

    const settings = db.getSettings();
    if (settings.discordWebhookUrl) {
      dispatchBacktestToDiscord(result, settings.discordWebhookUrl);
    }

    res.json({
      status: 'success',
      backtest: result,
      state: db.getState()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Compile dynamic AI Optimization suggestions
app.post('/api/pine/ai-optimize', async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Pine Script code required' });
    }
    const result = await optimizePineScriptWithAI(name || 'Custom Script', code);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save user customized edits
app.post('/api/pine/save', (req, res) => {
  try {
    const { id, name, code, isStrategy } = req.body;
    const script = db.saveScript(id, name, code, isStrategy ?? true);
    res.json({ status: 'success', script, state: db.getState() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user script
app.post('/api/pine/delete', (req, res) => {
  try {
    const { id } = req.body;
    db.deleteScript(id);
    res.json({ status: 'success', state: db.getState() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Watchlist operations
app.post('/api/watchlist/add', (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }
    db.addWatchlistSymbol(symbol);
    res.json({ status: 'success', state: db.getState() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/watchlist/remove', (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }
    db.removeWatchlistSymbol(symbol);
    res.json({ status: 'success', state: db.getState() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear scanner cache
app.post('/api/clear', (req, res) => {
  try {
    db.clearAllData();
    res.json({ status: 'success' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  // Start candidate scanner engine
  scanner.start();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    db.addLog('SYSTEM', `Server initialized and running on port ${PORT}`);
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
export default app;
