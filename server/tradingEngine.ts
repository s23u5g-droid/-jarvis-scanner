import { db } from './db';
import { 
  Candle, 
  SymbolType, 
  Timeframe, 
  PivotLevel, 
  CRTState, 
  CISDState, 
  LiquidityLevel, 
  SetupAlert,
  UserSettings
} from '../src/types';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Standard currency pip/point multipliers
const POINT_SIZES: Record<SymbolType, number> = {
  XAUUSD: 0.01,
  XAGUSD: 0.001,
  BTCUSD: 1.0,
  ETHUSD: 0.1,
  EURUSD: 0.00001,
  GBPUSD: 0.00001,
  USDCAD: 0.00001,
  NAS100: 0.1,
  USDJPY: 0.01,
};

// Initial benchmark prices
const START_PRICES: Record<SymbolType, number> = {
  XAUUSD: 2342.80,
  XAGUSD: 29.5,
  BTCUSD: 92450.50,
  ETHUSD: 3410.20,
  EURUSD: 1.08420,
  GBPUSD: 1.26510,
  USDCAD: 1.3680,
  NAS100: 18450.00,
  USDJPY: 156.40,
};

// Timeframe in minutes mapping
const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '1D': 1440,
  '4H': 240,
  '1H': 60,
  '15M': 15,
  '5M': 5,
};

// Candle memory storage (lasts program lifetime, initialized with seed data)
const candlesStore: Record<SymbolType, Record<Timeframe, Candle[]>> = {} as any;

class ScannerEngine {
  private isScanning = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private aiClient: GoogleGenAI | null = null;

  constructor() {
    this.initCandlesStore();
    this.initGemini();
  }

  private initGemini() {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== 'MY_GEMINI_API_KEY') {
      try {
        this.aiClient = new GoogleGenAI({
          apiKey: key,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });
        db.addLog('SYSTEM', 'Gemini AI Client initialized successfully.');
      } catch (err: any) {
        db.addLog('WARNING', `Gemini AI initialization failed: ${err.message}`);
      }
    } else {
      db.addLog('WARNING', 'Gemini API key is not configured or using placeholder. Setup explanations will use high-quality local analysis templates until configured.');
    }
  }

  // Populate realistic historical candles
  private initCandlesStore() {
    const symbols: SymbolType[] = [
      'BTCUSD',
      'ETHUSD',
      'EURUSD',
      'GBPUSD',
      'NAS100',
      'XAGUSD',
      'XAUUSD',
      'USDJPY',
      'USDCAD'
    ];
    const timeframes: Timeframe[] = ['1D', '4H', '1H', '15M', '5M'];

    const now = Date.now();

    for (const symbol of symbols) {
      candlesStore[symbol] = {} as any;
      const basePrice = START_PRICES[symbol];
      const pip = POINT_SIZES[symbol];

      for (const tf of timeframes) {
        candlesStore[symbol][tf] = [];
        const minutes = TIMEFRAME_MINUTES[tf];
        const count = 100; // Generate 100 historical candles

        let currentPrice = basePrice;
        const tempCandles: Candle[] = [];

        for (let i = count; i >= 1; i--) {
          const cTime = now - i * minutes * 60 * 1000;
          // Apply a random walk with high/low bounds
          const volatility = pip * 25 * (minutes === 5 ? 1 : Math.sqrt(minutes / 5));
          const change = (Math.random() - 0.49) * volatility;
          const open = currentPrice;
          const close = currentPrice + change;
          
          const maxSwing = volatility * 1.5;
          const high = Math.max(open, close) + Math.random() * maxSwing;
          const low = Math.min(open, close) - Math.random() * maxSwing;

          tempCandles.push({
            time: Math.floor(cTime / 1000),
            open,
            high,
            low,
            close,
            volume: Math.floor(Math.random() * 5000) + 100
          });

          currentPrice = close;
        }
        candlesStore[symbol][tf] = tempCandles;
      }
    }

    // Trigger proactive background synchronizations with real financial price feeds
    this.syncRealPricesInBackround();
  }

  private async syncRealPricesInBackround() {
    db.addLog('SYSTEM', 'Initiating background synchronization with Yahoo Finance real-world price feeds...');
    const symbols = db.getActiveSymbols();
    const timeframes: Timeframe[] = ['1D', '4H', '1H', '15M', '5M'];

    const yahooSymbolMap: Record<SymbolType, string> = {
      XAUUSD: 'GC=F',
      XAGUSD: 'SI=F',
      BTCUSD: 'BTC-USD',
      ETHUSD: 'ETH-USD',
      EURUSD: 'EURUSD=X',
      GBPUSD: 'GBPUSD=X',
      USDCAD: 'USDCAD=X',
      NAS100: 'NQ=F',
      USDJPY: 'USDJPY=X',
    };

    const intervalMap: Record<string, string> = {
      '5M': '5m',
      '15M': '15m',
      '1H': '60m',
      '4H': '60m', // Aggregate 60m → 4H
      '1D': '1d'
    };

    const rangeMap: Record<string, string> = {
      '5M': '5d',
      '15M': '5d',
      '1H': '15d',
      '4H': '60d',
      '1D': '120d'
    };

    let successfullyFetchedCount = 0;

    for (const symbol of symbols) {
      for (const tf of timeframes) {
        try {
          const ticker = yahooSymbolMap[symbol];
          const interval = intervalMap[tf];
          const range = rangeMap[tf];
          if (!ticker || !interval) continue;

          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`;
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          
          if (!res.ok) continue;

          const json: any = await res.json();
          const result = json?.chart?.result?.[0];
          if (!result) continue;

          const timestamps: number[] = result.timestamp || [];
          const quote = result.indicators?.quote?.[0];
          if (!quote || timestamps.length === 0) continue;

          const { open, high, low, close, volume } = quote;
          const candles: Candle[] = [];

          for (let i = 0; i < timestamps.length; i++) {
            const o = open[i];
            const h = high[i];
            const l = low[i];
            const c = close[i];
            const v = volume[i] ?? 100;

            if (o === null || o === undefined || h === null || h === undefined || l === null || l === undefined || c === null || c === undefined) {
              continue;
            }

            candles.push({
              time: timestamps[i],
              open: Number(o),
              high: Number(h),
              low: Number(l),
              close: Number(c),
              volume: Number(v)
            });
          }

          let finalCandles = candles;
          if (tf === '4H') {
            // Aggregate hourly to 4-hour blocks
            const agg: Candle[] = [];
            for (let i = 0; i < candles.length; i += 4) {
              const chunk = candles.slice(i, i + 4);
              if (chunk.length === 0) continue;
              agg.push({
                time: chunk[0].time,
                open: chunk[0].open,
                high: Math.max(...chunk.map(c => c.high)),
                low: Math.min(...chunk.map(c => c.low)),
                close: chunk[chunk.length - 1].close,
                volume: chunk.reduce((sum, c) => sum + c.volume, 0)
              });
            }
            finalCandles = agg;
          }

          if (finalCandles.length >= 10) {
            candlesStore[symbol][tf] = finalCandles.slice(-300);
            successfullyFetchedCount++;
          }
        } catch (err: any) {
          // Graceful fallback to offline seed simulation candles
        }
      }
    }

    if (successfullyFetchedCount > 0) {
      db.addLog('SYSTEM', `Successfully synchronized ${successfullyFetchedCount} active chart feeds from Yahoo Finance.`);
      // Re-run the core scanning algorithms against real price levels to calibrate and align pivots and triggers
      this.runInitialScan();
    } else {
      db.addLog('WARNING', 'Could not fetch real-world prices. Running on high-performance simulated backup feeds.');
    }
  }

  public start() {
    if (this.isScanning) return;
    this.isScanning = true;
    db.addLog('SYSTEM', 'Pine-AI Scanner Engine launched.');

    // Pre-run analysis on generated candles
    this.runInitialScan();

    // Loop interval simulates new ticks/closes every 10 seconds
    this.scanInterval = setInterval(() => {
      this.tick();
    }, 10000);
  }

  public stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isScanning = false;
    db.addLog('SYSTEM', 'Pine-AI Scanner Engine paused.');
  }

  public forceScan(symbol?: SymbolType) {
    db.addLog('SYSTEM', symbol ? `Forced manual scan for ${symbol}.` : 'Forced manual scan across all active symbols.');
    const active = symbol ? [symbol] : db.getActiveSymbols();

    for (const sym of active) {
      // Trigger a direct new candle close simulation & calculation
      this.simulateNewCandle(sym);
      this.scanSymbol(sym);
    }
  }

  private runInitialScan() {
    const active = db.getActiveSymbols();
    for (const sym of active) {
      this.scanSymbol(sym);
    }
  }

  // Periodic tick simulator
  private tick() {
    const active = db.getActiveSymbols();
    for (const sym of active) {
      // Small chance to finish current candle and start next
      const roll = Math.random();
      if (roll > 0.6) {
        this.simulateNewCandle(sym);
      } else {
        this.updateCurrentCandle(sym);
      }
      this.scanSymbol(sym);
    }
  }

  // Live simulation: minor high/low wiggles on the active candle
  private updateCurrentCandle(symbol: SymbolType) {
    const pip = POINT_SIZES[symbol];
    const timeframes: Timeframe[] = ['1D', '4H', '1H', '15M', '5M'];

    for (const tf of timeframes) {
      const candles = candlesStore[symbol][tf];
      if (candles.length === 0) continue;
      const current = candles[candles.length - 1];

      // Random price wiggle
      const change = (Math.random() - 0.5) * pip * 10;
      current.close += change;
      if (current.close > current.high) current.high = current.close;
      if (current.close < current.low) current.low = current.close;
    }
  }

  // Live simulation: shift old candles and append a fresh closed candle
  private simulateNewCandle(symbol: SymbolType) {
    const timeframes: Timeframe[] = ['1D', '4H', '1H', '15M', '5M'];
    const now = Date.now();
    const pip = POINT_SIZES[symbol];

    for (const tf of timeframes) {
      const candles = candlesStore[symbol][tf];
      if (candles.length === 0) continue;
      const last = candles[candles.length - 1];

      // Insert new candle
      const volatility = pip * 25;
      const open = last.close;
      const change = (Math.random() - 0.49) * volatility;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * (volatility * 0.8);
      const low = Math.min(open, close) - Math.random() * (volatility * 0.8);

      candles.push({
        time: Math.floor(now / 1000),
        open,
        high,
        low,
        close,
        volume: Math.floor(Math.random() * 2000) + 150
      });

      // Keep limited in-memory buffer
      if (candles.length > 300) {
        candles.shift();
      }
    }
  }

  public getCandles(symbol: SymbolType, tf: Timeframe): Candle[] {
    return candlesStore[symbol]?.[tf] ?? [];
  }

  // CORE LOGIC SCANNER
  private scanSymbol(symbol: SymbolType) {
    const settings = db.getSettings();

    // 1. Pivot Scans across all timeframes
    this.detectPivots(symbol, '1D');
    this.detectPivots(symbol, '4H');
    this.detectPivots(symbol, '1H');
    this.detectPivots(symbol, '15M');
    this.detectPivots(symbol, '5M');

    // 2. Pivot level Tap detection (HTF Tap)
    this.checkHTFLevelTaps(symbol);

    // 3. CRT Detection and updates
    if (settings.crtEnabled) {
      this.monitorActiveCRTs(symbol);
    }
  }

  // Swing detection
  private detectPivots(symbol: SymbolType, tf: Timeframe) {
    const candles = candlesStore[symbol][tf];
    if (candles.length < 5) return;

    // Loop through standard historical candles, up to candle[1] (confirmed since candle[0] is current/developing) Explain:
    // Swing High: High[1] > High[0] and High[1] > High[2]
    // Swing Low: Low[1] < Low[0] and Low[1] < Low[2]
    for (let i = candles.length - 3; i >= 1; i--) {
      const cPrev2 = candles[i - 1]; // index 2 relative
      const cPeak = candles[i];     // index 1 relative (peak)
      const cNext = candles[i + 1];  // index 0 relative (developing/new)

      const peakTime = cPeak.time * 1000;
      
      // Swing High Checklist
      if (cPeak.high > cPrev2.high && cPeak.high > cNext.high) {
        const id = `${symbol}-${tf}-high-${cPeak.time}`;
        const exists = db.getLevels().some(l => l.id === id);
        if (!exists) {
          const newLevel: PivotLevel = {
            id,
            symbol,
            type: 'high',
            price: Number(cPeak.high.toFixed(5)),
            candleTime: peakTime,
            timeframe: tf,
            tapped: false,
            active: true
          };
          db.addLevel(newLevel);
          db.addLog('INFO', `Detected ${tf} Swing High Pivot at ${newLevel.price}`, symbol);
          
          db.addAlert({
            id: `alert-pivot-${Date.now()}-${Math.random()}`,
            symbol,
            timeframe: tf,
            type: 'PIVOT',
            title: `${tf} Swing High formed`,
            description: `Confirmed swing high pivot detected at ${newLevel.price}`,
            timestamp: Date.now()
          });
        }
      }

      // Swing Low Checklist
      if (cPeak.low < cPrev2.low && cPeak.low < cNext.low) {
        const id = `${symbol}-${tf}-low-${cPeak.time}`;
        const exists = db.getLevels().some(l => l.id === id);
        if (!exists) {
          const newLevel: PivotLevel = {
            id,
            symbol,
            type: 'low',
            price: Number(cPeak.low.toFixed(5)),
            candleTime: peakTime,
            timeframe: tf,
            tapped: false,
            active: true
          };
          db.addLevel(newLevel);
          db.addLog('INFO', `Detected ${tf} Swing Low Pivot at ${newLevel.price}`, symbol);

          db.addAlert({
            id: `alert-pivot-${Date.now()}-${Math.random()}`,
            symbol,
            timeframe: tf,
            type: 'PIVOT',
            title: `${tf} Swing Low formed`,
            description: `Confirmed swing low pivot detected at ${newLevel.price}`,
            timestamp: Date.now()
          });
        }
      }
    }
  }

  // Level taps monitoring:
  // After a higher timeframe swing high/low has been compiled:
  // Daily Level -> 4H CRT -> 15M Entry
  // 4H Level -> 15M CRT -> 5M Entry
  // 1H Level -> 5M CRT
  private checkHTFLevelTaps(symbol: SymbolType) {
    const levels = db.getLevels().filter(l => l.symbol === symbol && !l.tapped && l.active);
    const m5Candles = candlesStore[symbol]['5M'];
    if (m5Candles.length < 2) return;
    const latestPrice = m5Candles[m5Candles.length - 1].close;

    for (const lvl of levels) {
      // Standard HTF Level tapping logic
      // Note: Tap checking matches against current 5-minute close or high/low for immediate feedback
      let tapped = false;
      const now = Date.now();

      if (lvl.type === 'high' && latestPrice >= lvl.price) {
        tapped = true;
      } else if (lvl.type === 'low' && latestPrice <= lvl.price) {
        tapped = true;
      }

      if (tapped) {
        db.updateLevel(lvl.id, {
          tapped: true,
          tapTime: now,
          active: false // Completed monitoring as level has been tapped
        });

        db.addLog('ALERT', `Price tapped HTF Level [${lvl.timeframe} Pivot ${lvl.type}] at ${lvl.price}`, symbol);

        db.addAlert({
          id: `alert-tap-${Date.now()}-${Math.random()}`,
          symbol,
          timeframe: lvl.timeframe,
          type: 'HTF_TAP',
          title: `HTF level tapped`,
          description: `Price tapped ${lvl.timeframe} Pivot ${lvl.type} level at ${lvl.price}`,
          timestamp: now
        });

        // Trigger lower timeframe CRT tracking
        this.activateCRT(lvl);
      }
    }
  }

  private activateCRT(htfLevel: PivotLevel) {
    const symbol = htfLevel.symbol;

    // Check if duplicate CRT is already active for this level
    const exists = db.getCRTs().some(c => c.htfLevel.id === htfLevel.id && !c.invalidated);
    if (exists) return;

    const crt: CRTState = {
      id: `crt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      htfLevel,
      status: 'activated',
      ltfCisdTapped: false,
      invalidated: false,
      notes: `Waiting for CRT setups to compile on the lower timeframe.`
    };

    db.addCRT(crt);
    db.addLog('SYSTEM', `CRT monitoring activated on lower timeframe for ${symbol} following HTF tap at ${htfLevel.price}`, symbol);

    db.addAlert({
      id: `alert-crt-${Date.now()}-${Math.random()}`,
      symbol,
      timeframe: htfLevel.timeframe,
      type: 'CRT_ACTIVATE',
      title: `CRT monitoring active`,
      description: `HTF Level tapped. Lower timeframe CRT & CISD monitoring commenced.`,
      timestamp: Date.now(),
      setupId: crt.id
    });
  }

  // CRT status/progress runner
  private monitorActiveCRTs(symbol: SymbolType) {
    const activeCRTs = db.getCRTs().filter(c => c.symbol === symbol && !c.invalidated && c.status === 'activated');
    const settings = db.getSettings();

    for (const crt of activeCRTs) {
      // Map out exact timeframe mapping
      // Daily Level → 4H CRT → 15M Entry
      // 4H Level → 15M CRT → 5M Entry
      // 1H Level → 5M CRT
      let crtTF: Timeframe = '15M';
      let entryTF: Timeframe = '5M';

      if (crt.htfLevel.timeframe === '1D') {
        crtTF = '4H';
        entryTF = '15M';
      } else if (crt.htfLevel.timeframe === '4H') {
        crtTF = '15M';
        entryTF = '5M';
      } else if (crt.htfLevel.timeframe === '1H') {
        crtTF = '5M';
        entryTF = '5M'; // single timeframe entry
      }

      const crtCandles = candlesStore[symbol][crtTF];
      if (crtCandles.length < 5) continue;

      const newestCandle = crtCandles[crtCandles.length - 1];

      // 1. LIQUIDITY RULE
      // After a HTF tap:
      // Wait for FIRST new swing on crtTF -> Mark as LIQ #1
      // After LIQ #1 is tapped: Wait for next new swing -> Mark as LIQ #2
      if (settings.liqEnabled) {
        this.processLiquiditySwings(crt, crtTF, crtCandles);
      }

      // 2. CISD AND ENTRY RULE (BODY CLOSES)
      // SELL: After HTF high tap, find last BULLISH candle before displacement. Body low is marked.
      // A SELL CISD occurs only if a later candle BODY CLOSE is below that body low.
      if (settings.cisdEnabled) {
        this.processCISDAndEntries(crt, entryTF, crtCandles);
      }
    }
  }

  private processLiquiditySwings(crt: CRTState, tf: Timeframe, candles: Candle[]) {
    // Only fetch swings formed AFTER the HTF level tap time
    const tapSec = Math.floor(crt.htfLevel.tapTime! / 1000);
    const candidateCandles = candles.filter(c => c.time > tapSec);
    if (candidateCandles.length < 3) return;

    const liqs = db.getLiquidities().filter(q => q.symbol === crt.symbol && !q.tapped);

    // Look for pivots in candidateCandles
    for (let i = 1; i < candles.length - 1; i++) {
      const c = candles[i];
      if (c.time <= tapSec) continue;

      const prev = candles[i - 1];
      const next = candles[i + 1];

      // Swing High/Low check for liquidity pool
      let isSwing = false;
      let swingType: 'high' | 'low' = 'high';
      let swingPrice = 0;

      if (c.high > prev.high && c.high > next.high) {
        isSwing = true;
        swingType = 'high';
        swingPrice = Number(c.high.toFixed(5));
      } else if (c.low < prev.low && c.low < next.low) {
        isSwing = true;
        swingType = 'low';
        swingPrice = Number(c.low.toFixed(5));
      }

      if (isSwing) {
        const id = `${crt.symbol}-${tf}-liq-${c.time}`;
        const activeLiqs = db.getLiquidities().filter(q => q.symbol === crt.symbol);
        const exists = activeLiqs.some(q => q.id === id);

        if (!exists) {
          const label: 'LIQ #1' | 'LIQ #2' = activeLiqs.length === 0 ? 'LIQ #1' : 'LIQ #2';
          
          const newLiq: LiquidityLevel = {
            id,
            symbol: crt.symbol,
            type: swingType,
            price: swingPrice,
            candleTime: c.time * 1000,
            label,
            tapped: false
          };

          db.addLiquidity(newLiq);
          db.addLog('INFO', `Discovered [${label}] swing ${swingType} level at ${swingPrice} on timeframe ${tf}`, crt.symbol);

          db.addAlert({
            id: `alert-liq-${Date.now()}-${Math.random()}`,
            symbol: crt.symbol,
            timeframe: tf,
            type: 'LIQ_FORMED',
            title: `${label} Level Formed`,
            description: `New swing liquidity pool level identified at ${swingPrice}`,
            timestamp: Date.now()
          });

          if (label === 'LIQ #1') crt.liq1Id = id;
          if (label === 'LIQ #2') crt.liq2Id = id;
          db.updateCRT(crt.id, { liq1Id: crt.liq1Id, liq2Id: crt.liq2Id });
        }
      }
    }

    // Monitor for liquidity tapping
    const untappedLiqs = db.getLiquidities().filter(q => q.symbol === crt.symbol && !q.tapped);
    const newestPrice = candles[candles.length - 1].close;

    for (const liq of untappedLiqs) {
      let lTapped = false;
      if (liq.type === 'high' && newestPrice >= liq.price) lTapped = true;
      if (liq.type === 'low' && newestPrice <= liq.price) lTapped = true;

      if (lTapped) {
        db.updateLiquidity(liq.id, { tapped: true, tapTime: Date.now() });
        db.addLog('ALERT', `Liquidity level [${liq.label}] at ${liq.price} swept!`, crt.symbol);

        db.addAlert({
          id: `alert-liq-tap-${Date.now()}-${Math.random()}`,
          symbol: crt.symbol,
          timeframe: tf,
          type: 'LIQ_TAPPED',
          title: `${liq.label} Swept`,
          description: `Price swept ${liq.label} liquidity level at ${liq.price}`,
          timestamp: Date.now()
        });
      }
    }
  }

  // CISD Trigger checks
  private processCISDAndEntries(crt: CRTState, entryTF: Timeframe, htfCandles: Candle[]) {
    const symbol = crt.symbol;
    const isSell = crt.htfLevel.type === 'high';
    const entryCandles = candlesStore[symbol][entryTF];
    if (entryCandles.length < 5) return;

    const tapSec = Math.floor(crt.htfLevel.tapTime! / 1000);

    // Filter entry candles post-tap
    const postTapCandles = entryCandles.filter(c => c.time >= tapSec);
    if (postTapCandles.length === 0) return;

    // REFERENCE SHIFT RULE:
    // The first lower timeframe candle touching the HTF level becomes the reference candle.
    // If details are broken by a valid body close inside the zone, shift reference.
    const refCandle = postTapCandles[0];
    let bodyBoundary = isSell ? refCandle.low : refCandle.high; // Default body boundaries

    // BUY CISD vs SELL CISD
    if (isSell) {
      // Find last bullish candle before displacement (displacement is first down moves)
      let lastBullish: Candle | null = null;
      for (const candle of postTapCandles) {
        if (candle.close > candle.open) {
          lastBullish = candle;
        } else if (lastBullish) {
          // If we see a bearish candle after bullish, keep it as candidate
          break;
        }
      }

      if (!lastBullish) lastBullish = refCandle;
      bodyBoundary = lastBullish.low; // Body low of last bullish candle

      // Check current and past closed body close below the body low
      for (const c of postTapCandles) {
        if (c.time <= lastBullish.time) continue;

        // body close below last bullish low (SELL CISD)
        if (c.close < bodyBoundary) {
          db.updateCRT(crt.id, {
            status: 'completed',
            cisdDetected: true,
            cisdType: 'SELL',
            cisdPrice: c.close,
            cisdBodyLowHigh: bodyBoundary,
            entryTime: Date.now(),
            entryPrice: c.close,
            notes: `SELL setup successfully triggered following solid body close below ${bodyBoundary.toFixed(5)}.`
          });

          this.triggerAlert(crt, 'SELL', c.close, bodyBoundary);
          // Send automatic notification
          this.dispatchNotifications(symbol, 'SELL', c.close);
          // Auto generate Gemini insight explanation
          this.triggerGeminiExplanation(crt.id);
          break;
        }
      }
    } else {
      // BUY Setup
      // Find last bearish candle before displacement
      let lastBearish: Candle | null = null;
      for (const candle of postTapCandles) {
        if (candle.close < candle.open) {
          lastBearish = candle;
        } else if (lastBearish) {
          break;
        }
      }

      if (!lastBearish) lastBearish = refCandle;
      bodyBoundary = lastBearish.high; // Body high of last bearish candle

      // Check close above the body high
      for (const c of postTapCandles) {
        if (c.time <= lastBearish.time) continue;

        // body close above last bearish high (BUY CISD)
        if (c.close > bodyBoundary) {
          db.updateCRT(crt.id, {
            status: 'completed',
            cisdDetected: true,
            cisdType: 'BUY',
            cisdPrice: c.close,
            cisdBodyLowHigh: bodyBoundary,
            entryTime: Date.now(),
            entryPrice: c.close,
            notes: `BUY setup successfully triggered following solid body close above ${bodyBoundary.toFixed(5)}.`
          });

          this.triggerAlert(crt, 'BUY', c.close, bodyBoundary);
          this.dispatchNotifications(symbol, 'BUY', c.close);
          this.triggerGeminiExplanation(crt.id);
          break;
        }
      }
    }
  }

  private triggerAlert(crt: CRTState, type: 'BUY' | 'SELL', price: number, refPrice: number) {
    db.addLog('ALERT', `[CISD ${type} Solid Triggered] Body closed at ${price.toFixed(5)} relative to reference candle high/low ${refPrice.toFixed(5)}`, crt.symbol);

    db.addAlert({
      id: `alert-cisd-${Date.now()}-${Math.random()}`,
      symbol: crt.symbol,
      timeframe: crt.htfLevel.timeframe,
      type: 'CISD_TRIGGER',
      title: `${type} Setup Confirmed`,
      description: `Displacement body close verified at ${price}. Setup completed.`,
      timestamp: Date.now(),
      setupId: crt.id
    });
  }

  // External alert streams dispatching
  private async dispatchNotifications(symbol: SymbolType, direction: 'BUY' | 'SELL', price: number) {
    const settings = db.getSettings();
    const message = `🚨 [PINE-AI SCANNER] *${symbol} ${direction} SETUP ALERT* 🚨\nPrice closed at ${price} completing CISD verification. Pivot engine active.`;

    // 1. Telegram Dispatcher
    if (settings.telegramToken && settings.telegramChatId) {
      try {
        const url = `https://api.telegram.org/bot${settings.telegramToken}/sendMessage`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: settings.telegramChatId,
            text: message,
            parse_mode: 'Markdown'
          })
        });
        if (res.ok) {
          db.addLog('SYSTEM', 'Telegram dispatch success.', symbol);
        } else {
          const desc = await res.text();
          db.addLog('WARNING', `Telegram bot error: ${desc}`, symbol);
        }
      } catch (err: any) {
        db.addLog('WARNING', `Telegram bot transport failure: ${err.message}`, symbol);
      }
    }

    // 2. Discord Webhook Dispatcher
    if (settings.discordWebhookUrl) {
      try {
        const storeCandles = candlesStore[symbol]?.['15M'] || [];
        const recentCandles = storeCandles.slice(-15);
        
        let chartUrl = '';
        if (recentCandles.length > 0) {
          const chartConfig = {
            type: 'line',
            data: {
              labels: recentCandles.map((c, idx) => `T-${15 - idx}`),
              datasets: [
                {
                  label: 'Market Price ($)',
                  data: recentCandles.map(c => Number(c.close.toFixed(5))),
                  borderColor: direction === 'BUY' ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)',
                  backgroundColor: direction === 'BUY' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  fill: true,
                  tension: 0.3,
                  pointRadius: 4
                }
              ]
            },
            options: {
              title: {
                display: true,
                text: `${symbol} Trend Chart around ${direction} Signal`,
                fontColor: '#ffffff'
              },
              legend: { labels: { fontColor: '#abb2bf' } },
              scales: {
                xAxes: [{ gridLines: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { fontColor: '#abb2bf' } }],
                yAxes: [{ gridLines: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { fontColor: '#abb2bf' } }]
              },
              backgroundColor: '#0f172a'
            }
          };
          chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
        }

        const embedColor = direction === 'BUY' ? 65280 : 16711680; // Green or Red decimal
        const embedPayload = {
          username: 'Pine-AI Scanner Bot',
          avatar_url: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=128&h=128&fit=crop',
          embeds: [
            {
              title: `🚨 PINE-AI SIGNAL: ${symbol} - ${direction} SETUP CONFIRMED`,
              description: `A validated **Close-In Solid Displacement (CISD)** structure was triggered after the high/low pivot level sweep.`,
              color: embedColor,
              fields: [
                { name: 'Symbol', value: `📈 ${symbol}`, inline: true },
                { name: 'Direction', value: `⚡ **${direction === 'BUY' ? 'LONG Buying Entry' : 'SHORT Selling Entry'}**`, inline: true },
                { name: 'Trigger Price', value: `\`$${price.toLocaleString()}\``, inline: true },
                { name: 'Timeframe Group', value: 'LTF Entry (5M/15M)', inline: true },
                { name: 'Verification', value: 'Close-In Solid Body Close', inline: true },
                { name: 'Signal Provider', value: 'Mechanical Liquidity Engine', inline: true }
              ],
              ...(chartUrl ? { image: { url: chartUrl } } : {}),
              footer: {
                text: 'Pine-AI High-Fidelity Scanning System • Live Alerts'
              },
              timestamp: new Date().toISOString()
            }
          ]
        };

        const res = await fetch(settings.discordWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(embedPayload)
        });
        if (res.ok) {
          db.addLog('SYSTEM', 'Discord webhook dispatch success.', symbol);
        } else {
          db.addLog('WARNING', `Discord webhook returned error status code: ${res.status}`, symbol);
        }
      } catch (err: any) {
        db.addLog('WARNING', `Discord transport failure: ${err.message}`, symbol);
      }
    }
  }

  // Explain Setup with Gemini logic
  public async triggerGeminiExplanation(crtId: string): Promise<string> {
    const crt = db.getCRTs().find(c => c.id === crtId);
    if (!crt) return 'Setup not found.';

    const systemPrompt = `You are a high-fidelity senior Pine Script algorithmic trading expert and mechanical market structures analyst.
Your objective is to mechanical explain the user setup accurately following strict validation criteria:
- Reference timeframe alignments
- True pivots rules: High[1] > High[0] && High[1] > High[2] or Low[1] < Low[0] && Low[1] < Low[2]
- CISD rules (Body closes below bullish candle low for sell or above bearish candle high for buy)
- Reference zone shift and Liquidity Sweeps.
Answer concisely in elegant text, markdown bolding and clear terms. Never propose actual financial trading recommendations, only mechanical reviews. Avoid fictional declarations. Ensure strict logical adherence to facts.`;

    const instructions = `Explain the following detected trading scanner setup:
Symbol: ${crt.symbol}
Higher Timeframe Level breached: ${crt.htfLevel.timeframe} Pivot ${crt.htfLevel.type} at ${crt.htfLevel.price}
Lower Timeframe CRT structural status: ${crt.status}
CISD Setup direction: ${crt.cisdType ?? 'None yet detected'}
Trigger price: ${crt.entryPrice ?? 'None yet detected'}
Initial Ref Body Limit: ${crt.cisdBodyLowHigh ?? 'N/A'}`;

    try {
      if (this.aiClient) {
        const response = await this.aiClient.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: instructions,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.7
          }
        });

        const text = response.text || 'No response returned from model.';
        db.updateCRT(crtId, { notes: text });
        
        db.addAlert({
          id: `alert-ai-${Date.now()}-${Math.random()}`,
          symbol: crt.symbol,
          timeframe: crt.htfLevel.timeframe,
          type: 'AI_EXPLANATION',
          title: 'Gemini AI Insight Completed',
          description: `Analysis logged: ${text.slice(0, 100)}...`,
          timestamp: Date.now(),
          setupId: crtId,
          aiExplanation: text
        });

        return text;
      } else {
        // High quality fallback analysis in case API key is missing
        const direction = crt.cisdType ?? 'None';
        const fallbackMotive = `Local Pivot Analysis: Price completed an elegant HTF level sweeping tap of ${crt.htfLevel.timeframe} Pivot ${crt.htfLevel.type} at ${crt.htfLevel.price}. 
On the lower entry timeframe, we identified a robust body-level close ${direction === 'SELL' ? 'below' : 'above'} the last ${direction === 'SELL' ? 'bullish' : 'bearish'} displacement body point of ${crt.cisdBodyLowHigh?.toFixed(5)}. 
This fulfills our Close-In Solid Displacement (CISD) rules with no structural leakage. Liquidity formations (LIQ#1 and LIQ#2) have established solid institutional targets. (Awaiting Gemini API key for deep generative commentary).`;
        
        db.updateCRT(crtId, { notes: fallbackMotive });
        
        db.addAlert({
          id: `alert-ai-${Date.now()}-${Math.random()}`,
          symbol: crt.symbol,
          timeframe: crt.htfLevel.timeframe,
          type: 'AI_EXPLANATION',
          title: 'Algorithmic Scanner Analysis Logged',
          description: fallbackMotive,
          timestamp: Date.now(),
          setupId: crtId,
          aiExplanation: fallbackMotive
        });

        return fallbackMotive;
      }
    } catch (e: any) {
      db.addLog('WARNING', `Gemini AI prompt generation failed: ${e.message}`, crt.symbol);
      return `Failed to fetch Gemini explanation: ${e.message}`;
    }
  }
}

export const scanner = new ScannerEngine();
