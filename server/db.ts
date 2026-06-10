import fs from 'fs';
import path from 'path';
import { 
  AppState, 
  PivotLevel, 
  CRTState, 
  CISDState, 
  LiquidityLevel, 
  SetupAlert, 
  ScannerLog, 
  UserSettings, 
  SymbolType,
  PineScript,
  BacktestResult
} from '../src/types';

const DB_FILE = path.join(process.cwd(), 'local-scanner-db.json');

const DEFAULT_SETTINGS: UserSettings = {
  crtEnabled: true,
  cisdEnabled: true,
  liqEnabled: true,
  themeColor: '#4f46e5', // indigo-600
  lineStyle: 'solid',
  lineWidth: 2,
  dailyVisible: true,
  fourHourVisible: true,
  oneHourVisible: true,
  fifteenMinVisible: true,
  fiveMinVisible: true,
  telegramToken: '',
  telegramChatId: '',
  discordWebhookUrl: 'https://discord.com/api/webhooks/1503567369363132467/kOh52KhvzNgw9_cj0zemBIaWc-D8kdNEsfNaTA76LHifE7T2rhhRe8FC2qfAHvOBJ17s'
};

const DEFAULT_SCRIPTS: PineScript[] = [
  {
    id: 'script-1',
    name: 'HTF Swing Pivot & CISD Strategy v6',
    isStrategy: true,
    code: `//@version=6
strategy("HTF Swing Pivot & CISD Strategy v6", overlay=true, initial_capital=10000, default_qty_value=1)

// 1. TIMEFRAME MAPPING & CONFIGURATION
var string htfTimeframe = na
if timeframe.period == "15"
    htfTimeframe := "240"
else if timeframe.period == "5"
    htfTimeframe := "60"
else if timeframe.period == "1"
    htfTimeframe := "15"
else
    htfTimeframe := "240" // Fallback

// 2. SWING HIGH / SWING LOW LOGIC (Strict 3-candle pivot)
f_swing_high() => high[1] > high[2] and high[1] > high[0] ? high[1] : float(na)
f_swing_low()  => low[1] < low[2] and low[1] < low[0]   ? low[1] : float(na)

// Request Higher Timeframe Swing High/Low levels
htf_sh = request.security(syminfo.tickerid, htfTimeframe, f_swing_high(), barmerge.gaps_off, barmerge.lookahead_off)
htf_sl = request.security(syminfo.tickerid, htfTimeframe, f_swing_low(), barmerge.gaps_off, barmerge.lookahead_off)

var float htf_high_level = na
var float htf_low_level = na

if not na(htf_sh)
    htf_high_level := htf_sh
if not na(htf_sl)
    htf_low_level := htf_sl

// Plotting HTF Levels
plot(htf_high_level, "HTF Swing High Level", color=color.new(#ff0055, 30), linewidth=2, style=plot.style_linebr)
plot(htf_low_level, "HTF Swing Low Level", color=color.new(#00ffaa, 30), linewidth=2, style=plot.style_linebr)

// 3. LEVEL TAP RULE
bool high_level_tapped = not na(htf_high_level) and (high >= htf_high_level)
bool low_level_tapped  = not na(htf_low_level)  and (low <= htf_low_level)

var bool expecting_sell = false
var bool expecting_buy  = false

if high_level_tapped
    expecting_sell := true
    expecting_buy  := false

if low_level_tapped
    expecting_buy  := true
    expecting_sell := false

plotshape(high_level_tapped, "HTF High Tap", shape=shape.triangledown, location=location.abovebar, color=color.red, size=size.small, text="HTF Tape")
plotshape(low_level_tapped, "HTF Low Tap", shape=shape.triangleup, location=location.belowbar, color=color.green, size=size.small, text="HTF Tape")

// 4. REFERENCE CANDLE & CISD TRIGGER LINE (SELL)
var float cisd_sell_line = na

if high_level_tapped
    int offset = 0
    for i = 0 to 5
        if close[i] > open[i]
            offset := i
            break
    cisd_sell_line := open[offset]

// 5. BUY / SELL ENTRY LOGIC AFTER TAP & ENGULFINGS
bool sell_signal = false
bool buy_signal  = false

if expecting_sell and not na(cisd_sell_line)
    if close < cisd_sell_line
        sell_signal := true
        expecting_sell := false
        cisd_sell_line := na

// Bearish Engulfing
bool bearish_engulfing = false
if expecting_sell
    bool prev_bullish = close[1] > open[1]
    bool curr_bearish = close < open
    bool engulf_body = close < open[1]
    if prev_bullish and curr_bearish and engulf_body
        bearish_engulfing := true
        sell_signal := true
        expecting_sell := false

if sell_signal
    strategy.entry("SELL CISD", strategy.short, comment="CISD High Tapped Entry")

// 6. REFERENCE CANDLE & CISD TRIGGER LINE (BUY)
var float cisd_buy_line = na

if low_level_tapped
    int offset = 0
    for i = 0 to 5
        if close[i] < open[i]
            offset := i
            break
    cisd_buy_line := open[offset]

if expecting_buy and not na(cisd_buy_line)
    if close > cisd_buy_line
        buy_signal := true
        expecting_buy := false
        cisd_buy_line := na

// Bullish Engulfing
bool bullish_engulfing = false
if expecting_buy
    bool prev_bearish = close[1] < open[1]
    bool curr_bullish = close > open
    bool engulf_body = close > open[1]
    if prev_bearish and curr_bullish and engulf_body
        bullish_engulfing := true
        buy_signal := true
        expecting_buy := false

if buy_signal
    strategy.entry("BUY CISD", strategy.long, comment="CISD Low Tapped Entry")

// 7. LIQUIDITY TARGETS (LIQ #1 and LIQ #2)
var float liq1 = na
var float liq2 = na
var int tap_bar = na

if high_level_tapped or low_level_tapped
    tap_bar := bar_index
    liq1 := na
    liq2 := na

bool lt_sh = (high[1] > high[2] and high[1] > high[0])
bool lt_sl = (low[1] < low[2] and low[1] < low[0])

if not na(tap_bar) and bar_index > tap_bar
    if lt_sh or lt_sl
        float new_swing = lt_sh ? high[1] : low[1]
        if na(liq1)
            liq1 := new_swing
        else if na(liq2)
            liq2 := new_swing

plot(cisd_sell_line, "CISD Sell Line", color=color.orange, style=plot.style_linebr)
plot(cisd_buy_line, "CISD Buy Line", color=color.aqua, style=plot.style_linebr)

plotshape(sell_signal and bearish_engulfing, "Bearish Engulfing Entry", shape=shape.labeldown, location=location.abovebar, color=color.orange, textcolor=color.white, text="Bear Engulf", size=size.small)
plotshape(buy_signal and bullish_engulfing, "Bullish Engulfing Entry", shape=shape.labelup, location=location.belowbar, color=color.blue, textcolor=color.white, text="Bull Engulf", size=size.small)
plotshape(sell_signal and not bearish_engulfing, "CISD Body Sell", shape=shape.labeldown, location=location.abovebar, color=color.red, textcolor=color.white, text="Valid CISD SELL", size=size.small)
plotshape(buy_signal and not bullish_engulfing, "CISD Body Buy", shape=shape.labelup, location=location.belowbar, color=color.green, textcolor=color.white, text="Valid CISD BUY", size=size.small)

plot(liq1, "Liquidity 1", color=color.yellow, style=plot.style_circles, linewidth=2)
plot(liq2, "Liquidity 2", color=color.orange, style=plot.style_circles, linewidth=2)`
  },
  {
    id: 'script-2',
    name: 'EMA Golden Cross Algorithm',
    isStrategy: true,
    code: `//@version=5
strategy("EMA Golden Cross Crossover", overlay=true, initial_capital=10000)

// Fast and Slow EMA lengths
fast_len = input.int(9, "Fast EMA Length")
slow_len = input.int(21, "Slow EMA Length")

fast_ema = ta.ema(close, fast_len)
slow_ema = ta.ema(close, slow_len)

// Crossover conditions
bullish_cross = ta.crossover(fast_ema, slow_ema)
bearish_cross = ta.crossunder(fast_ema, slow_ema)

if bullish_cross
    strategy.entry("EMA Long Buy", strategy.long, comment="EMA Golden Golden Cross")

if bearish_cross
    strategy.entry("EMA Short Sell", strategy.short, comment="EMA Death Cross")

plot(fast_ema, color=color.blue, linewidth=2)
plot(slow_ema, color=color.orange, linewidth=2)`
  },
  {
    id: 'script-3',
    name: 'CCI & RSI Divergence Guide',
    isStrategy: false,
    code: `//@version=5
indicator("CCI and RSI Overbought/Oversold", overlay=false)

rsi_len = input.int(14, "RSI Length Period")
rsi_val = ta.rsi(close, rsi_len)
cci_val = ta.cci(close, 20)

// Plot trigger guides
hline(70, "RSI Overbought Limit", color=color.red, linestyle=hline.style_dashed)
hline(30, "RSI Oversold Limit", color=color.green, linestyle=hline.style_dashed)

plot(rsi_val, "RSI Oscillator", color=color.purple, linewidth=2)
plot(cci_val / 4 + 50, "Scalable CCI Output", color=color.aqua, linewidth=1)`
  }
];

const DEFAULT_STATE: AppState = {
  activeSymbols: ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'NAS100', 'XAGUSD', 'XAUUSD', 'USDJPY', 'USDCAD'],
  settings: DEFAULT_SETTINGS,
  levels: [],
  crts: [],
  cisds: [],
  liquidities: [],
  alerts: [],
  logs: [],
  scripts: DEFAULT_SCRIPTS,
  activeBacktest: null,
  watchlistSymbols: ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'NAS100', 'XAGUSD', 'XAUUSD', 'USDJPY', 'USDCAD']
};

class LocalDB {
  private state: AppState = { ...DEFAULT_STATE };
  private savePending = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        
        // Force sync with the updated master symbol list
        const masterSymbols: SymbolType[] = ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'NAS100', 'XAGUSD', 'XAUUSD', 'USDJPY', 'USDCAD'];
        // Force-upgrade script-1 to the high-fidelity Pine v6 strategy
        let loadedScripts = parsed.scripts ?? DEFAULT_SCRIPTS;
        const script1Default = DEFAULT_SCRIPTS.find(s => s.id === 'script-1');
        if (script1Default) {
          const s1Idx = loadedScripts.findIndex((s: any) => s.id === 'script-1');
          if (s1Idx !== -1) {
            loadedScripts[s1Idx] = script1Default;
          } else {
            loadedScripts.unshift(script1Default);
          }
        }

        const mergedSettings = { ...DEFAULT_SETTINGS, ...parsed.settings };
        if (!mergedSettings.discordWebhookUrl || mergedSettings.discordWebhookUrl.trim() === '') {
          mergedSettings.discordWebhookUrl = 'https://discord.com/api/webhooks/1503567369363132467/kOh52KhvzNgw9_cj0zemBIaWc-D8kdNEsfNaTA76LHifE7T2rhhRe8FC2qfAHvOBJ17s';
        }

        this.state = {
          activeSymbols: masterSymbols,
          settings: mergedSettings,
          levels: parsed.levels ?? [],
          crts: parsed.crts ?? [],
          cisds: parsed.cisds ?? [],
          liquidities: parsed.liquidities ?? [],
          alerts: parsed.alerts ?? [],
          logs: parsed.logs ?? [],
          scripts: loadedScripts,
          activeBacktest: parsed.activeBacktest ?? null,
          watchlistSymbols: masterSymbols
        };
        this.saveImmediate();
      } else {
        this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        this.saveImmediate();
      }
    } catch (e) {
      console.error('Failed to load database. Initializing default state.', e);
      this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      this.saveImmediate();
    }
  }

  public saveImmediate() {
    try {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf8');
      this.savePending = false;
    } catch (e) {
      console.error('Failed to write database to disk immediately.', e);
    }
  }

  public save() {
    if (this.savePending) return;
    this.savePending = true;
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf8');
      } catch (e) {
        console.error('Failed to write database to disk.', e);
      }
      this.savePending = false;
      this.saveTimeout = null;
    }, 1000); // 1-second debounce
  }

  // Get full state
  public getState(): AppState {
    return this.state;
  }

  // Settings operations
  public getSettings(): UserSettings {
    return this.state.settings;
  }

  public updateSettings(settings: Partial<UserSettings>): UserSettings {
    this.state.settings = { ...this.state.settings, ...settings };
    this.save();
    this.addLog('SYSTEM', 'User settings updated.');
    return this.state.settings;
  }

  // Active symbols operations
  public getActiveSymbols(): SymbolType[] {
    return this.state.activeSymbols;
  }

  public updateActiveSymbols(symbols: SymbolType[]): SymbolType[] {
    this.state.activeSymbols = symbols;
    this.save();
    this.addLog('SYSTEM', `Active monitored symbols set to: ${symbols.join(', ')}`);
    return this.state.activeSymbols;
  }

  // Levels operations
  public getLevels(): PivotLevel[] {
    return this.state.levels;
  }

  public addLevel(level: PivotLevel) {
    if (this.state.levels.some(l => l.id === level.id)) return;
    this.state.levels.push(level);
    
    // Prune total levels per symbol & timeframe to avoid infinite growth
    const sameGroup = this.state.levels.filter(l => l.symbol === level.symbol && l.timeframe === level.timeframe);
    if (sameGroup.length > 150) {
      sameGroup.sort((a, b) => a.candleTime - b.candleTime);
      const toRemove = sameGroup.slice(0, sameGroup.length - 150);
      const toRemoveIds = new Set(toRemove.map(l => l.id));
      this.state.levels = this.state.levels.filter(l => !toRemoveIds.has(l.id));
    }

    this.save();
  }

  public updateLevel(id: string, updates: Partial<PivotLevel>) {
    const idx = this.state.levels.findIndex(l => l.id === id);
    if (idx !== -1) {
      this.state.levels[idx] = { ...this.state.levels[idx], ...updates };
      this.save();
    }
  }

  // CRT operations
  public getCRTs(): CRTState[] {
    return this.state.crts;
  }

  public addCRT(crt: CRTState) {
    if (this.state.crts.some(c => c.id === crt.id)) return;
    this.state.crts.push(crt);
    
    // Prune to keep 100 max
    if (this.state.crts.length > 100) {
      this.state.crts = this.state.crts.slice(this.state.crts.length - 100);
    }
    
    this.save();
  }

  public updateCRT(id: string, updates: Partial<CRTState>) {
    const idx = this.state.crts.findIndex(c => c.id === id);
    if (idx !== -1) {
      this.state.crts[idx] = { ...this.state.crts[idx], ...updates };
      this.save();
    }
  }

  // CISD operations
  public getCISDs(): CISDState[] {
    return this.state.cisds;
  }

  public addCISD(cisd: CISDState) {
    if (this.state.cisds.some(c => c.id === cisd.id)) return;
    this.state.cisds.push(cisd);
    
    // Prune to keep 100 max
    if (this.state.cisds.length > 100) {
      this.state.cisds = this.state.cisds.slice(this.state.cisds.length - 100);
    }
    
    this.save();
  }

  public updateCISD(id: string, updates: Partial<CISDState>) {
    const idx = this.state.cisds.findIndex(c => c.id === id);
    if (idx !== -1) {
      this.state.cisds[idx] = { ...this.state.cisds[idx], ...updates };
      this.save();
    }
  }

  // Liquidity operations
  public getLiquidities(): LiquidityLevel[] {
    return this.state.liquidities;
  }

  public addLiquidity(liq: LiquidityLevel) {
    if (this.state.liquidities.some(l => l.id === liq.id)) return;
    this.state.liquidities.push(liq);
    
    // Prune to keep 150 max
    if (this.state.liquidities.length > 150) {
      this.state.liquidities = this.state.liquidities.slice(this.state.liquidities.length - 150);
    }
    
    this.save();
  }

  public updateLiquidity(id: string, updates: Partial<LiquidityLevel>) {
    const idx = this.state.liquidities.findIndex(l => l.id === id);
    if (idx !== -1) {
      this.state.liquidities[idx] = { ...this.state.liquidities[idx], ...updates };
      this.save();
    }
  }

  // Alerts operations
  public getAlerts(): SetupAlert[] {
    return this.state.alerts;
  }

  public addAlert(alert: SetupAlert) {
    const tooClose = this.state.alerts.some(
      a => a.symbol === alert.symbol && a.title === alert.title && Math.abs(a.timestamp - alert.timestamp) < 5000
    );
    if (tooClose) return;

    this.state.alerts.unshift(alert); // newest first
    // keep history reasonable
    if (this.state.alerts.length > 500) {
      this.state.alerts = this.state.alerts.slice(0, 500);
    }
    this.save();
    this.addLog('ALERT', `[${alert.symbol}] ${alert.title}: ${alert.description}`);
  }

  // Log operations
  public getLogs(): ScannerLog[] {
    return this.state.logs;
  }

  public addLog(category: ScannerLog['category'], message: string, symbol?: SymbolType) {
    const log: ScannerLog = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      symbol: symbol as SymbolType,
      message,
      category
    };
    this.state.logs.unshift(log); // newest first
    if (this.state.logs.length > 1000) {
      this.state.logs = this.state.logs.slice(0, 1000);
    }
    this.save();
    console.log(`[${category}] [${symbol ?? 'GENERAL'}] ${message}`);
  }

  // Pine Script Operations
  public saveScript(id: string, name: string, code: string, isStrategy: boolean): PineScript {
    const existingIdx = this.state.scripts.findIndex(s => s.id === id);
    const script: PineScript = {
      id,
      name,
      code,
      lastCompiled: Date.now(),
      isStrategy
    };

    if (existingIdx !== -1) {
      this.state.scripts[existingIdx] = script;
    } else {
      this.state.scripts.push(script);
    }
    this.save();
    this.addLog('SYSTEM', `Pine Script saved: "${name}"`);
    return script;
  }

  public deleteScript(id: string) {
    this.state.scripts = this.state.scripts.filter(s => s.id !== id);
    this.save();
    this.addLog('SYSTEM', `Pine Script deleted: ${id}`);
  }

  public setActiveBacktest(result: BacktestResult | null) {
    this.state.activeBacktest = result;
    this.save();
  }

  // Watchlist Operations
  public getWatchlist(): string[] {
    return this.state.watchlistSymbols;
  }

  public addWatchlistSymbol(symbol: string) {
    const cleaned = symbol.toUpperCase().trim();
    if (cleaned && !this.state.watchlistSymbols.includes(cleaned)) {
      this.state.watchlistSymbols.push(cleaned);
      this.save();
      this.addLog('SYSTEM', `Watchlist asset added: ${cleaned}`);
    }
  }

  public removeWatchlistSymbol(symbol: string) {
    this.state.watchlistSymbols = this.state.watchlistSymbols.filter(s => s !== symbol);
    this.save();
    this.addLog('SYSTEM', `Watchlist asset removed: ${symbol}`);
  }

  public clearAllData() {
    this.state.levels = [];
    this.state.crts = [];
    this.state.cisds = [];
    this.state.liquidities = [];
    this.state.alerts = [];
    this.state.logs = [];
    this.state.activeBacktest = null;
    this.save();
    this.addLog('SYSTEM', 'Cleared all scanner historical storage, resuming fresh.');
  }
}

export const db = new LocalDB();
