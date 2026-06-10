import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Activity, 
  TrendingUp, 
  Bot, 
  Bell, 
  Trash2, 
  Play, 
  Save,
  CheckCircle2, 
  X, 
  RefreshCw, 
  Layers, 
  Send, 
  Check, 
  Zap, 
  Clock, 
  AlertTriangle,
  Flame,
  UserCheck,
  Code2,
  Plus,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  BookOpen,
  Sparkles,
  ChevronRight,
  Laptop
} from 'lucide-react';
import { 
  SymbolType, 
  Timeframe, 
  AppState, 
  PivotLevel, 
  CRTState, 
  LiquidityLevel, 
  SetupAlert, 
  ScannerLog, 
  UserSettings,
  PineScript,
  BacktestResult,
  TradeLog
} from './types';

const SYMBOLS: SymbolType[] = [
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

const TIMEFRAMES: Timeframe[] = ['1D', '4H', '1H', '15M', '5M'];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pine' | 'charts' | 'screener' | 'alerts' | 'settings'>('dashboard');
  const [activeSymbol, setActiveSymbol] = useState<SymbolType>('BTCUSD');
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('15M');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isAiOptimizing, setIsAiOptimizing] = useState(false);
  const [selectedCrtId, setSelectedCrtId] = useState<string | null>(null);

  // Pine Editor Inputs
  const [selectedScriptId, setSelectedScriptId] = useState<string>('script-1');
  const [scriptName, setScriptName] = useState<string>('');
  const [scriptCode, setScriptCode] = useState<string>('');
  const [isStrategy, setIsStrategy] = useState<boolean>(true);
  
  // Custom Indicator Backtest Trigger States
  const [backtestTrigger, setBacktestTrigger] = useState<string>('strategy_code');
  const [fastPeriod, setFastPeriod] = useState<number>(9);
  const [slowPeriod, setSlowPeriod] = useState<number>(21);
  const [oversoldLevel, setOversoldLevel] = useState<number>(30);
  const [overboughtLevel, setOverboughtLevel] = useState<number>(70);
  
  // AI Optimization modal state
  const [aiOptimizedCode, setAiOptimizedCode] = useState<string>('');
  const [aiOptimizedAnalysis, setAiOptimizedAnalysis] = useState<string>('');
  const [showAiOptimizedResults, setShowAiOptimizedResults] = useState<boolean>(false);

  // Watchlist custom symbol input
  const [newWatchlistSymbol, setNewWatchlistSymbol] = useState<string>('');

  // Slower ticker slight price simulation state
  const [tapePrices, setTapePrices] = useState<Record<string, { price: number; change: number }>>({
    'BTCUSD': { price: 92450.50, change: 2.45 },
    'ETHUSD': { price: 3410.20, change: 1.82 },
    'EURUSD': { price: 1.08420, change: -0.15 },
    'GBPUSD': { price: 1.26510, change: 0.12 },
    'NAS100': { price: 18450.00, change: 0.84 },
    'XAGUSD': { price: 29.50, change: -0.45 },
    'XAUUSD': { price: 2342.80, change: 0.54 },
    'USDJPY': { price: 156.40, change: -0.22 },
    'USDCAD': { price: 1.3680, change: 0.05 }
  });

  // App-level state fetched from Express server
  const [appState, setAppState] = useState<AppState>({
    activeSymbols: ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'NAS100', 'XAGUSD', 'XAUUSD', 'USDJPY', 'USDCAD'],
    settings: {
      crtEnabled: true,
      cisdEnabled: true,
      liqEnabled: true,
      themeColor: '#06b6d4', // cyan-500
      lineStyle: 'solid',
      lineWidth: 2,
      dailyVisible: true,
      fourHourVisible: true,
      oneHourVisible: true,
      fifteenMinVisible: true,
      fiveMinVisible: true,
      telegramToken: '',
      telegramChatId: '',
      discordWebhookUrl: ''
    },
    levels: [],
    crts: [],
    cisds: [],
    liquidities: [],
    alerts: [],
    logs: [],
    scripts: [],
    activeBacktest: null,
    watchlistSymbols: ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'NAS100', 'XAGUSD', 'XAUUSD', 'USDJPY', 'USDCAD']
  });

  // Settings form binding
  const [settingsForm, setSettingsForm] = useState<UserSettings>({ ...appState.settings });

  // Simulate tick updates to visual tape pricing for realistic dashboard feel
  useEffect(() => {
    const interval = setInterval(() => {
      setTapePrices(prev => {
        const copy = { ...prev };
        Object.keys(copy).forEach(k => {
          const delta = (Math.random() - 0.49) * (copy[k].price * 0.0005);
          copy[k].price = Number((copy[k].price + delta).toFixed(k.includes('EUR') || k.includes('GBP') ? 5 : 2));
          copy[k].change = Number((copy[k].change + (Math.random() - 0.5) * 0.05).toFixed(2));
        });
        return copy;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Fetch full state on load & poll
  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data: AppState = await res.json();
        setAppState(data);
        if (data.settings) {
          setSettingsForm(data.settings);
        }

        // Initialize script editor values from loaded state
        if (data.scripts && data.scripts.length > 0) {
          const current = data.scripts.find(s => s.id === selectedScriptId) || data.scripts[0];
          if (current && !scriptCode) {
            setScriptName(current.name);
            setScriptCode(current.code);
            setIsStrategy(current.isStrategy);
          }
        }
      }

      // Sync tape prices from dynamic live system
      const pricesRes = await fetch('/api/prices');
      if (pricesRes.ok) {
        const pricesData = await pricesRes.json();
        setTapePrices(pricesData);
      }
    } catch (e) {
      console.error('Failed to sync engine state:', e);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000); // 3s refresh
    return () => clearInterval(interval);
  }, []);

  // Sync editor if user switches selected script preset dropdown
  const handleScriptChange = (id: string) => {
    setSelectedScriptId(id);
    const selected = appState.scripts.find(s => s.id === id);
    if (selected) {
      setScriptName(selected.name);
      setScriptCode(selected.code);
      setIsStrategy(selected.isStrategy);
    }
  };

  // Compile individual Pine logic
  const handleCompileAndBacktest = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/pine/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: selectedScriptId,
          code: scriptCode,
          name: scriptName,
          symbol: activeSymbol,
          timeframe: activeTimeframe,
          isStrategy,
          backtestTrigger,
          fastPeriod,
          slowPeriod,
          oversoldLevel,
          overboughtLevel
        })
      });

      if (res.ok) {
        const data = await res.json();
        setAppState(data.state);
        setActiveTab('dashboard'); // take back to dashboard to view dynamic updated Area Graph!
      }
    } catch (err) {
      console.error('Pine compilation failure:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Save changes
  const handleSaveScript = async () => {
    try {
      const res = await fetch('/api/pine/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedScriptId,
          name: scriptName,
          code: scriptCode,
          isStrategy
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAppState(data.state);
      }
    } catch (err) {
      console.error('Failed to save script:', err);
    }
  };

  const handleCreateNewScript = () => {
    const newId = `script-user-${Date.now()}`;
    setSelectedScriptId(newId);
    setScriptName('My Custom Trading Strategy');
    setIsStrategy(true);
    setScriptCode(`//@version=5
strategy("My Custom Strategy", overlay=true)

fast_ma = ta.sma(close, 10)
slow_ma = ta.sma(close, 30)

buy_signal = ta.crossover(fast_ma, slow_ma)
sell_signal = ta.crossunder(fast_ma, slow_ma)

if buy_signal
    strategy.entry("Buy Long", strategy.long)

if sell_signal
    strategy.entry("Sell Short", strategy.short)

plot(fast_ma, color=color.aqua)
plot(slow_ma, color=color.yellow)`);
  };

  // AI optimizer
  const handleAIOptimize = async () => {
    setIsAiOptimizing(true);
    try {
      const res = await fetch('/api/pine/ai-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: scriptName, code: scriptCode })
      });
      if (res.ok) {
        const data = await res.json();
        setAiOptimizedCode(data.optimizedCode);
        setAiOptimizedAnalysis(data.analysis);
        setShowAiOptimizedResults(true);
      }
    } catch (error) {
      console.error('AI Optimisation request failed:', error);
    } finally {
      setIsAiOptimizing(false);
    }
  };

  // Apply optimizations
  const handleApplyAIOptimizations = () => {
    setScriptCode(aiOptimizedCode);
    setShowAiOptimizedResults(false);
    handleSaveScript();
  };

  // Watchlist
  const handleAddWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWatchlistSymbol) return;
    try {
      const res = await fetch('/api/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: newWatchlistSymbol })
      });
      if (res.ok) {
        const data = await res.json();
        setAppState(data.state);
        // Inject price tape mock if nonexistent
        setTapePrices(prev => {
          if (prev[newWatchlistSymbol]) return prev;
          return {
            ...prev,
            [newWatchlistSymbol.toUpperCase()]: { price: Math.floor(Math.random() * 200) + 10, change: Number((Math.random() * 4 - 2).toFixed(2)) }
          };
        });
        setNewWatchlistSymbol('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveWatchlist = async (sym: string) => {
    try {
      const res = await fetch('/api/watchlist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym })
      });
      if (res.ok) {
        const data = await res.json();
        setAppState(data.state);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm)
      });
      if (res.ok) {
        fetchState();
        alert('Settings saved successfully.');
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  // CRT simulate taps
  const handleSimulateTap = async (type: 'high' | 'low') => {
    try {
      let htf: Timeframe = '4H';
      if (activeTimeframe === '5M') htf = '1H';
      if (activeTimeframe === '15M') htf = '4H';
      if (activeTimeframe === '1D') htf = '1D';

      const res = await fetch('/api/simulate/tap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: activeSymbol, type, htf })
      });
      if (res.ok) {
        fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Purge all states safely
  const handleClearData = async () => {
    if (confirm('Are you sure you want to clean and clear all cached levels, logs, and triggered setup events?')) {
      try {
        await fetch('/api/clear', { method: 'POST' });
        fetchState();
        setSelectedCrtId(null);
      } catch (err) {
        console.error('Clear failure:', err);
      }
    }
  };

  // Explain Setup with Gemini model callback
  const handleGenerateAIExplanation = async (crtId: string) => {
    setIsGeneratingAI(true);
    try {
      const res = await fetch('/api/gemini/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crtId })
      });
      if (res.ok) {
        await fetchState();
      }
    } catch (err) {
      console.error('Gemini insight failed:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Filter levels shown based on settings visibilities
  const filteredLevels = appState.levels.filter(lvl => {
    if (lvl.timeframe === '1D' && !appState.settings.dailyVisible) return false;
    if (lvl.timeframe === '4H' && !appState.settings.fourHourVisible) return false;
    if (lvl.timeframe === '1H' && !appState.settings.oneHourVisible) return false;
    if (lvl.timeframe === '15M' && !appState.settings.fifteenMinVisible) return false;
    if (lvl.timeframe === '5M' && !appState.settings.fiveMinVisible) return false;
    return true;
  });

  const selectedTapePrice = tapePrices[activeSymbol]?.price || 1512.44;
  const selectedTapeChange = tapePrices[activeSymbol]?.change || 1.12;

  // Render glowing area custom vector graph
  const renderCustomEquityCurve = () => {
    const rawCurve = appState.activeBacktest?.equityCurve;
    
    // Default mock pristine curve representing normal scanner operations if backtester is silent
    const defaultCurve = [
      { x: '09:00', value: 10000 },
      { x: '10:00', value: 10120 },
      { x: '11:00', value: 10080 },
      { x: '12:00', value: 10450 },
      { x: '13:00', value: 10320 },
      { x: '14:00', value: 10890 },
      { x: '15:00', value: 11210 },
      { x: '16:00', value: 11050 },
      { x: '17:00', value: 11450 },
      { x: '18:00', value: 11840 }
    ];

    const actualCurve = (rawCurve && rawCurve.length > 5) ? rawCurve : defaultCurve;
    const values = actualCurve.map(c => c.value);
    const minVal = Math.min(...values) * 0.99;
    const maxVal = Math.max(...values) * 1.01;
    const valRange = maxVal - minVal || 1;

    // Convert coordinates into high fidelity 500x180 SVG coordinates
    const width = 500;
    const height = 180;
    const pointsArray = actualCurve.map((pt, index) => {
      const x = (index / (actualCurve.length - 1)) * width;
      const y = height - ((pt.value - minVal) / valRange) * (height - 30) - 15;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathLine = pointsArray.join(' ');
    const filledPath = `0,${height} ${pathLine} ${width},${height}`;

    const lastVal = actualCurve[actualCurve.length - 1].value;
    const profitPctChange = ((lastVal - actualCurve[0].value) / actualCurve[0].value) * 100;

    return (
      <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800/80 shadow-2xl backdrop-blur-md relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full filter blur-2xl"></div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase font-mono">ACTIVE EQUITY CURVE</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-extrabold text-white font-mono tracking-tight">
                ${lastVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`text-xs font-bold flex items-center ${profitPctChange >= 0 ? 'text-emerald-400' : 'text-rose-400 font-bold'}`}>
                {profitPctChange >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {profitPctChange >= 0 ? '+' : ''}{profitPctChange.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-cyan-950/40 border border-cyan-800/30 px-2.5 py-1 rounded-full text-[9px] font-mono text-cyan-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
            </span>
            LIVE VIRTUAL FEED
          </div>
        </div>

        {/* SVG Wrapper */}
        <div className="h-44 w-full relative mt-2">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="cyanAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid guidelines */}
            <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#1e293b" strokeDasharray="3,3" />
            <line x1="0" y1={height * 0.50} x2={width} y2={height * 0.50} stroke="#1e293b" strokeDasharray="3,3" />
            <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#1e293b" strokeDasharray="3,3" />

            {/* Glowing filled vector polygon */}
            <polygon points={filledPath} fill="url(#cyanAreaGradient)" />

            {/* Sleek Line stroke */}
            <polyline points={pathLine} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* Points on ends */}
            <circle cx="0" cy={pointsArray[0].split(',')[1]} r="3" fill="#06d4af" />
            <circle cx={width} cy={pointsArray[pointsArray.length - 1].split(',')[1]} r="4" fill="#06b6d4" className="animate-pulse" />
          </svg>

          {/* Floating Time Stamps */}
          <div className="absolute bottom-[-14px] inset-x-0 flex justify-between text-[8px] font-mono text-slate-500">
            <span>{actualCurve[0].x}</span>
            <span>{actualCurve[Math.floor(actualCurve.length / 2)].x}</span>
            <span>{actualCurve[actualCurve.length - 1].x}</span>
          </div>
        </div>

        {/* Dynamic Multi Statistics row */}
        <div className="grid grid-cols-4 gap-2 mt-8 pt-4 border-t border-slate-800/80 text-center font-mono">
          <div className="bg-slate-950/45 p-2 rounded-lg border border-slate-800">
            <div className="text-[8px] text-slate-500 font-bold">NET PROFIT</div>
            <div className="text-xs font-extrabold text-cyan-400 mt-0.5">
              ${appState.activeBacktest ? appState.activeBacktest.netProfit.toFixed(2) : '+1,840.00'}
            </div>
          </div>
          <div className="bg-slate-950/45 p-2 rounded-lg border border-slate-800">
            <div className="text-[8px] text-slate-500 font-bold">WIN RATE</div>
            <div className="text-xs font-extrabold text-emerald-400 mt-0.5">
              {appState.activeBacktest ? appState.activeBacktest.winRate : '70.4'}%
            </div>
          </div>
          <div className="bg-slate-950/45 p-2 rounded-lg border border-slate-800">
            <div className="text-[8px] text-slate-500 font-bold">PROFIT FACTOR</div>
            <div className="text-xs font-extrabold text-amber-400 mt-0.5">
              {appState.activeBacktest ? appState.activeBacktest.profitFactor : '1.92'}
            </div>
          </div>
          <div className="bg-slate-950/45 p-2 rounded-lg border border-slate-800">
            <div className="text-[8px] text-slate-500 font-bold">MAX DRAWDOWN</div>
            <div className="text-xs font-extrabold text-rose-400 mt-0.5">
              -{appState.activeBacktest ? appState.activeBacktest.maxDrawdown : '3.12'}%
            </div>
          </div>
        </div>
      </div>
    );
  };

  const tradingViewSymbol = activeSymbol === 'XAUUSD' ? 'OANDA:XAUUSD' : 
                            activeSymbol === 'XAGUSD' ? 'OANDA:XAGUSD' : 
                            activeSymbol === 'BTCUSD' ? 'BINANCE:BTCUSDT' :
                            activeSymbol === 'ETHUSD' ? 'BINANCE:ETHUSDT' :
                            activeSymbol === 'EURUSD' ? 'FX:EURUSD' :
                            activeSymbol === 'GBPUSD' ? 'FX:GBPUSD' :
                            activeSymbol === 'NAS100' ? 'GLOBALPRIME:NAS100' :
                            activeSymbol === 'USDJPY' ? 'FX:USDJPY' :
                            'FX:USDCAD';

  const tradingViewInterval = activeTimeframe === '1D' ? 'D' :
                              activeTimeframe === '4H' ? '240' :
                              activeTimeframe === '1H' ? '60' :
                              activeTimeframe === '15M' ? '15' : '5';

  return (
    <div id="scanner-root-container" className="h-screen w-full bg-slate-950 text-slate-200 font-sans flex flex-col overflow-hidden select-none">
      
      {/* 1. TICKER PRICE BANNER (TAPE TAPE) */}
      <div id="ticker-prices-tape" className="h-9 bg-slate-950 border-b border-slate-900 flex items-center gap-6 overflow-x-auto overflow-y-hidden px-4 select-none scrollbar-hide flex-shrink-0">
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-full h-5 flex items-center px-2 py-0 text-[8px] font-bold text-cyan-400 tracking-wider uppercase font-mono animate-pulse shrink-0">
          GLOBAL FEED
        </div>
        
        <div className="flex items-center gap-7 scroll-smooth text-xs shrink-0 py-1">
          {Object.entries(tapePrices).map(([sym, rawVal]) => {
            const val = rawVal as { price: number; change: number };
            const isSelected = activeSymbol === sym;
            return (
              <button
                key={sym}
                onClick={() => setActiveSymbol(sym as SymbolType)}
                className={`flex items-center gap-1.5 transition-all outline-none text-left cursor-pointer focus:ring-0 ${
                  isSelected ? 'bg-slate-800/40 px-2 py-0.5 rounded-lg border border-slate-700/50' : 'hover:opacity-85'
                }`}
              >
                <span className={`font-mono font-bold tracking-tight ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                  {sym}
                </span>
                <span className="font-mono font-extrabold text-slate-200 text-[11px]">
                  {val.price.toLocaleString('en-US', { minimumFractionDigits: val.price < 5 ? 5 : 2 })}
                </span>
                <span className={`text-[9px] font-mono font-bold flex items-center ${val.change >= 0 ? 'text-emerald-400' : 'text-rose-400 font-bold'}`}>
                  {val.change >= 0 ? '+' : ''}{val.change}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* HEADER SECTION */}
      <header id="scanner-app-header" className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-cyan-600 to-indigo-600 rounded flex items-center justify-center shadow-lg shadow-cyan-600/30">
            <Layers className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-md font-extrabold tracking-tight text-white flex items-center gap-1.5 font-mono">
              TRADEVISION <span className="text-cyan-400 text-xs font-bold border border-cyan-500/20 px-1 rounded bg-cyan-950/20">A.I.</span>
            </h1>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">Next-Gen Trading Intelligence Engine</p>
          </div>
          <div className="ml-4 flex items-center gap-2 bg-slate-800/40 border border-slate-700/50 px-2.5 py-1 rounded-full scale-90">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Engine Running</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono bg-slate-950 px-3 py-1.5 rounded-md border border-slate-800/80">
            <span className="text-slate-500">API INTEGRATION:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <Zap className="w-3 h-3 fill-current text-cyan-400" />
              STABLE
            </span>
          </div>

          <button
            onClick={handleClearData}
            className="text-xs hover:text-white text-slate-400 transition-colors flex items-center gap-1 bg-slate-800/30 px-2.5 py-1.5 rounded-md border border-slate-800 hover:bg-rose-950/20 hover:border-rose-900/30 font-semibold cursor-pointer"
            title="Clean State Cache"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Purge State
          </button>
        </div>
      </header>

      {/* MAIN VIEW */}
      <main id="scanner-app-body" className="flex-1 flex overflow-hidden">
        
        {/* 2. UNIFIED SIDEBAR NAV PANEL */}
        <nav id="scanner-nav-monitor" className="w-56 bg-slate-900/40 border-r border-slate-900 p-3 flex flex-col gap-1 overflow-y-auto shrink-0 select-none">
          
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-600 px-3 py-2 font-mono">NAVIGATION</div>

          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold text-sm cursor-pointer ${
              activeTab === 'dashboard' 
                ? 'bg-slate-800/80 text-white border-l-4 border-cyan-400 font-extrabold shadow' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <Compass className="w-4 h-4" />
            Dashboard
          </button>

          <button 
            onClick={() => setActiveTab('pine')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold text-sm cursor-pointer ${
              activeTab === 'pine' 
                ? 'bg-slate-800/80 text-white border-l-4 border-cyan-400 font-extrabold shadow' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Pine IDE Editor
          </button>

          <button 
            onClick={() => setActiveTab('charts')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold text-sm cursor-pointer ${
              activeTab === 'charts' 
                ? 'bg-slate-800/80 text-white border-l-4 border-cyan-400 font-extrabold shadow' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <Laptop className="w-4 h-4" />
            TradingView
          </button>

          <button 
            onClick={() => setActiveTab('screener')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold text-sm cursor-pointer ${
              activeTab === 'screener' 
                ? 'bg-slate-800/80 text-white border-l-4 border-cyan-400 font-extrabold shadow' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <Activity className="w-4 h-4" />
            Screener
          </button>

          <button 
            onClick={() => setActiveTab('alerts')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold text-sm cursor-pointer ${
              activeTab === 'alerts' 
                ? 'bg-slate-800/80 text-white border-l-4 border-cyan-400 font-extrabold shadow' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 text-slate-400'
            }`}
          >
            <Bell className="w-4 h-4" />
            Alerts Center
          </button>

          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold text-sm cursor-pointer ${
              activeTab === 'settings' 
                ? 'bg-slate-800/80 text-white border-l-4 border-cyan-400 font-extrabold shadow' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>

          <div className="mt-8 border-t border-slate-900 pt-4 px-3">
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider font-mono">ACTIVE SCAN SYMBOL</span>
            <div className="flex items-center gap-2 mt-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800 text-[11px] font-mono font-semibold text-cyan-400">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></span>
              {activeSymbol} @ {activeTimeframe}
            </div>
          </div>

          {/* Database Metrics Stats Card */}
          <div className="mt-auto p-3 bg-slate-950/70 rounded-xl border border-slate-800 font-mono">
            <div className="flex items-center gap-2 mb-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">DATABASE SYSTEM</span>
            </div>
            <div className="text-[10px] text-slate-500 leading-normal space-y-0.5">
              <div>Storage: <span className="text-slate-300">SQLite</span></div>
              <div>Status: <span className="text-emerald-400">Synced Offline</span></div>
            </div>
          </div>
        </nav>

        {/* WORKSPACE CONTENT ROUTER */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          
          {/* TOP TIME TIMELINE CONTROLLER */}
          <div className="h-11 border-b border-slate-900 flex items-center justify-between px-5 bg-slate-900/10 shrink-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="bg-slate-800 text-slate-200 font-mono font-bold px-2 py-0.5 rounded text-xs border border-slate-700/60 flex items-center gap-1 shrink-0">
                <Compass className="w-3 h-3 text-cyan-400" />
                {activeSymbol}
              </span>
              <div className="h-4 w-[1px] bg-slate-800 mx-1 shrink-0"></div>
              <div className="flex items-center gap-1 shrink-0">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf}
                    onClick={() => setActiveTimeframe(tf)}
                    className={`px-2.5 py-0.8 text-[11px] font-semibold rounded transition-all cursor-pointer ${
                      activeTimeframe === tf 
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold' 
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 text-[10px] bg-slate-950 border border-slate-900 rounded-lg px-3 py-1 font-mono">
              <span className="text-slate-500">CRT:</span>
              <span className={appState.settings.crtEnabled ? 'text-cyan-400 font-bold' : 'text-slate-600'}>
                {appState.settings.crtEnabled ? 'ACTIVE' : 'IDLE'}
              </span>
              <div className="w-[1px] h-3 bg-slate-800" />
              <span className="text-slate-500">CISD:</span>
              <span className={appState.settings.cisdEnabled ? 'text-cyan-400 font-bold' : 'text-slate-600'}>
                {appState.settings.cisdEnabled ? 'ACTIVE' : 'IDLE'}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 relative">
            
            {/* A. TAB 1: DASHBOARD (MAIN OVERVIEW & CHARTS) */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                
                {/* Real-time Setup trigger bar */}
                <div className="bg-gradient-to-r from-cyan-950/20 to-slate-900/20 p-4 rounded-xl border border-cyan-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-cyan-950 rounded-lg border border-cyan-800/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                      <Zap className="w-5 h-5 fill-current" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Immediate Sweep Stimulation</h4>
                      <p className="text-xs text-slate-400 mt-1">Inject custom swept HTF levels into current symbol database to trigger reactions (pivots sweeps & CISD body-closes closes).</p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
                    <button 
                      onClick={() => handleSimulateTap('high')}
                      className="px-3 py-1.5 text-xs font-bold text-slate-100 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-450" />
                      Sweep Swing High
                    </button>
                    <button 
                      onClick={() => handleSimulateTap('low')}
                      className="px-3 py-1.5 text-xs font-bold text-slate-100 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowDownRight className="w-3.5 h-3.5 text-rose-450" />
                      Sweep Swing Low
                    </button>
                  </div>
                </div>

                {/* Primary Panel Columns */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  
                  {/* Left Column (Area path visualizer + statistics) */}
                  <div className="lg:col-span-2 space-y-5">
                    {renderCustomEquityCurve()}

                    {/* Active Setups / Completed Signals Logs */}
                    <div className="bg-slate-900/30 p-5 rounded-2xl border border-slate-900">
                      <h4 className="text-xs font-extrabold text-slate-350 tracking-widest uppercase mb-3 flex items-center gap-2 font-mono">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        ACTIVE SETUP TELEMETRY
                      </h4>
                      {appState.crts.length === 0 ? (
                        <div className="py-8 text-center text-slate-500 italic text-xs">
                          No active scanner executions cached yet. Run scanner ticks trigger, or press simulated taps high/low!
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs font-mono">
                            <thead className="text-slate-500 border-b border-slate-800 pb-2">
                              <tr>
                                <th className="pb-2">Asset</th>
                                <th className="pb-2">HTF Type</th>
                                <th className="pb-2">Sweep Price</th>
                                <th className="pb-2">LTF Status</th>
                                <th className="pb-2 text-right">Insight</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-900 text-slate-300">
                              {appState.crts.slice(0, 5).map((crt) => (
                                <tr key={crt.id} className="hover:bg-slate-800/30">
                                  <td className="py-2.5 font-bold font-sans text-slate-100">{crt.symbol}</td>
                                  <td className="py-2.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      crt.htfLevel.type === 'high' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20'
                                    }`}>
                                      {crt.htfLevel.timeframe} {crt.htfLevel.type.toUpperCase()} SWEPT
                                    </span>
                                  </td>
                                  <td className="py-2.5 font-bold">${crt.htfLevel.price.toLocaleString()}</td>
                                  <td className="py-2.5">
                                    <span className={`font-semibold uppercase text-[10px] ${
                                      crt.status === 'completed' ? 'text-emerald-400 animate-pulse' : 'text-amber-400'
                                    }`}>
                                      {crt.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-right">
                                    {crt.aiExplanation ? (
                                      <div className="text-[10px] max-w-xs overflow-hidden text-ellipsis whitespace-nowrap inline-block text-slate-400">
                                        {crt.aiExplanation.substring(0, 30)}...
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleGenerateAIExplanation(crt.id)}
                                        className="text-[9px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded transition-all cursor-pointer"
                                      >
                                        AI Explanation
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column (Watchlist manager + alert feed) */}
                  <div className="space-y-5">
                    
                    {/* Watchlist Manager */}
                    <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest font-mono">Watchlist Manager</h4>
                        <span className="text-[9px] text-slate-500 font-mono font-bold">Local SQLite DB</span>
                      </div>

                      <form onSubmit={handleAddWatchlist} className="flex gap-2 mb-3">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            placeholder="Add Symbol (e.g. AMD, SOL)"
                            value={newWatchlistSymbol}
                            onChange={(e) => setNewWatchlistSymbol(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 uppercase font-mono"
                          />
                        </div>
                        <button
                          type="submit"
                          className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold px-3 py-1 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </button>
                      </form>

                      {appState.watchlistSymbols.length === 0 ? (
                        <div className="py-6 text-center text-slate-600 italic text-[11px]">
                          Watchlist empty.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {appState.watchlistSymbols.map((sym) => {
                            const isSelected = activeSymbol === sym;
                            const tVal = tapePrices[sym] || { price: 122.40, change: 0.23 };
                            return (
                              <div
                                key={sym}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${
                                  isSelected 
                                    ? 'bg-cyan-500/10 border-cyan-500/20 text-white' 
                                    : 'bg-slate-950/40 border-slate-900 text-slate-400 hover:bg-slate-900/30'
                                }`}
                              >
                                <button
                                  onClick={() => setActiveSymbol(sym as SymbolType)}
                                  className="font-bold font-mono tracking-tight cursor-pointer"
                                >
                                  {sym}
                                </button>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-slate-350">${tVal.price.toLocaleString()}</span>
                                  <span className={`font-mono text-[10px] ${tVal.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {tVal.change >= 0 ? '+' : ''}{tVal.change}%
                                  </span>
                                  <button
                                    onClick={() => handleRemoveWatchlist(sym)}
                                    className="p-1 text-slate-600 hover:text-rose-450 rounded hover:bg-rose-950/20 transition-all cursor-pointer"
                                    title="Remove from Watchlist"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Live Recent Triggers Feed */}
                    <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 relative overflow-hidden">
                      <h4 className="text-xs font-bold text-slate-350 tracking-widest uppercase mb-3 flex items-center gap-1.5 font-mono">
                        <Bell className="w-3.5 h-3.5 text-cyan-400" />
                        Live Triggers Hub
                      </h4>
                      {appState.alerts.length === 0 ? (
                        <div className="py-6 text-center text-slate-600 italic text-[11px]">
                          No alerts scanned. Simulate high/low sweep to fill results!
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {appState.alerts.slice(0, 4).map((alert) => (
                            <div key={alert.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-900 hover:border-slate-800 transition-all">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-cyan-400 uppercase font-mono font-bold tracking-wider">{alert.symbol} ({alert.timeframe})</span>
                                <span className="text-slate-500 font-mono">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                              </div>
                              <p className="text-xs font-semibold text-slate-200 mt-1">{alert.title}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{alert.description}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* B. TAB 2: PINE IDE INTERACTIVE EDITOR & BACKTESTER */}
            {activeTab === 'pine' && (
              <div className="space-y-5">
                
                {/* Compiler Setup Header */}
                <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-900 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-cyan-600/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
                      <Code2 className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white font-mono">PINE COMPILER ENVIRONMENT</h4>
                      <p className="text-xs text-slate-400">Interactive workspace to write or load Pine Script algorithms on our historic SQLite backtester database.</p>
                    </div>
                  </div>
                  
                  {/* Presets and Custom Creation */}
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedScriptId}
                      onChange={(e) => handleScriptChange(e.target.value)}
                      className="bg-slate-950 text-xs text-slate-200 border border-slate-800 rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500/40 font-mono"
                    >
                      {appState.scripts.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>

                    <button
                      onClick={handleCreateNewScript}
                      className="text-xs font-bold text-slate-300 hover:text-white bg-slate-850 border border-slate-700 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New Draft
                    </button>
                  </div>
                </div>

                {/* Main IDE Rows */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                  
                  {/* Core Script Editor Area (Left 2 columns) */}
                  <div className="xl:col-span-2 space-y-5">
                    
                    {/* STEP 1 SECTION */}
                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-5 h-5 rounded-full bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-mono text-xs font-bold">1</span>
                        <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">Submit & Save Script as Custom Strategy</h5>
                      </div>
                      
                      <div className="bg-slate-900/50 rounded-xl border border-slate-900 overflow-hidden flex flex-col shadow-xl">
                        {/* Name input + variables */}
                        <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-mono">
                          <div className="flex-1 flex gap-2 items-center font-mono text-xs text-slate-350">
                            <span className="text-slate-500 text-xs font-bold">STRATEGY NAME:</span>
                            <input
                              type="text"
                              value={scriptName}
                              onChange={(e) => setScriptName(e.target.value)}
                              className="bg-slate-950 border border-slate-800/80 rounded px-2.5 py-1 text-xs text-white max-w-sm focus:outline-none focus:border-cyan-500/40 font-bold"
                              placeholder="e.g., Dynamic Indicator Scanner"
                            />
                          </div>

                          <div className="flex items-center gap-3 font-mono text-xs text-slate-350">
                            <label className="text-xs text-cyan-400 flex items-center gap-1.5 select-none shrink-0 cursor-pointer font-bold">
                              <input
                                type="checkbox"
                                checked={isStrategy}
                                onChange={(e) => setIsStrategy(e.target.checked)}
                                className="w-3.5 h-3.5 bg-slate-950 border-slate-800 text-cyan-600 rounded focus:ring-slate-900"
                              />
                              Save as Strategy
                            </label>
                          </div>
                        </div>

                        {/* Code Textarea editor */}
                        <div className="relative font-mono">
                          {/* Vertical line margins for high-fidelity code-like feel */}
                          <div className="absolute left-0 inset-y-0 w-11 bg-slate-950 border-r border-slate-850/60 select-none flex flex-col items-center pt-3 text-slate-650 text-[10px] leading-relaxed font-semibold">
                            {Array.from({ length: 18 }).map((_, i) => (
                              <div key={i}>{i + 1}</div>
                            ))}
                          </div>

                          <textarea
                            value={scriptCode}
                            onChange={(e) => setScriptCode(e.target.value)}
                            spellCheck="false"
                            className="w-full bg-slate-900/30 text-xs text-cyan-400/90 font-mono leading-relaxed pl-14 p-3 pr-4 h-80 focus:outline-none resize-y border-0 min-h-64"
                            placeholder="// Enter your Pine Script Strategy setup here..."
                          />
                        </div>

                        {/* Code Actions Panel */}
                        <div className="bg-slate-900/80 p-3 border-t border-slate-800 flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 font-mono">Version Directive: compatible with ta.ema, ta.rsi outputs</span>
                          
                          <button
                            onClick={handleSaveScript}
                            className="px-4 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-355 hover:text-white border border-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5 text-cyan-400" />
                            Register & Save Strategy
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* STEPS 2 & 3 SECTIONS */}
                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80 space-y-4">
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Step 2 Column */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-mono text-xs font-bold">2</span>
                            <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">Paired Indicator Trigger Rules</h5>
                          </div>

                          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-3">
                            <div className="space-y-1.5">
                              <label className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider font-mono">Backtest Trigger Engine</label>
                              <select
                                value={backtestTrigger}
                                onChange={(e) => {
                                  setBacktestTrigger(e.target.value);
                                  if (e.target.value !== 'strategy_code') {
                                    setIsStrategy(true);
                                  }
                                }}
                                className="w-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-500/40 font-mono text-xs"
                              >
                                <option value="strategy_code">🎯 Default Script Code (Pine Strategy signals)</option>
                                <option value="ema_cross">📈 Dual EMA Crossover (Fast vs Slow)</option>
                                <option value="sma_cross">📉 Dual SMA Crossover (Fast vs Slow)</option>
                                <option value="rsi_levels">📊 RSI Overbought/Oversold levels</option>
                                <option value="bollinger_bands">Bollinger Bands breakdown triggers</option>
                                <option value="pivot_sweeps">⚡ Swing High/Low Liquidity Sweeps</option>
                              </select>
                            </div>

                            {/* Dynamic indicator parameters */}
                            {(backtestTrigger === 'ema_cross' || backtestTrigger === 'sma_cross') && (
                              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                <div className="space-y-1">
                                  <label className="text-[9px] uppercase font-bold text-slate-500 block">Fast Period</label>
                                  <input
                                    type="number"
                                    value={fastPeriod}
                                    onChange={(e) => setFastPeriod(Math.max(1, Number(e.target.value)))}
                                    min="1"
                                    className="w-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500/40"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] uppercase font-bold text-slate-500 block">Slow Period</label>
                                  <input
                                    type="number"
                                    value={slowPeriod}
                                    onChange={(e) => setSlowPeriod(Math.max(1, Number(e.target.value)))}
                                    min="1"
                                    className="w-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500/40"
                                  />
                                </div>
                              </div>
                            )}

                            {backtestTrigger === 'rsi_levels' && (
                              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                <div className="space-y-1">
                                  <label className="text-[9px] uppercase font-bold text-slate-500 block">Oversold (Buy)</label>
                                  <input
                                    type="number"
                                    value={oversoldLevel}
                                    onChange={(e) => setOversoldLevel(Math.max(5, Math.min(45, Number(e.target.value))))}
                                    min="5"
                                    max="45"
                                    className="w-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500/40"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] uppercase font-bold text-slate-500 block">Overbought (Sell)</label>
                                  <input
                                    type="number"
                                    value={overboughtLevel}
                                    onChange={(e) => setOverboughtLevel(Math.max(55, Math.min(95, Number(e.target.value))))}
                                    min="55"
                                    max="95"
                                    className="w-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500/40"
                                  />
                                </div>
                              </div>
                            )}

                            {/* Help context info */}
                            <div className="bg-slate-900/60 p-2.5 text-slate-400 text-[11px] leading-normal rounded-lg border border-slate-800 font-sans">
                              {backtestTrigger === 'strategy_code' && "⚡ Executes the strategy script directly. Perfect for custom proprietary entries defined inside code."}
                              {backtestTrigger === 'ema_cross' && "🧠 Triggers Buy on fast EMA crossing above slow EMA, and exits on fast EMA crossing below slow EMA."}
                              {backtestTrigger === 'sma_cross' && "📈 Triggers Buy on fast SMA crossing above slow SMA, and exits on fast SMA crossing below slow SMA."}
                              {backtestTrigger === 'rsi_levels' && `📈 Buy signal fires when custom RSI goes below ${oversoldLevel} (oversold), and closes when RSI exceeds ${overboughtLevel}.`}
                              {backtestTrigger === 'bollinger_bands' && "🔔 Custom Bollinger breakout: Buys when candle low pierces lower band, and closes when high hits upper band."}
                              {backtestTrigger === 'pivot_sweeps' && "💡 Automated liquidity sweeps: Enters on swing low breakdowns and takes profits on swing high taps."}
                            </div>
                          </div>
                        </div>

                        {/* Step 3 Column */}
                        <div className="space-y-3 flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-mono text-xs font-bold">3</span>
                              <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">Select Asset & Run Backtest</h5>
                            </div>

                            <div className="bg-slate-950/85 p-3.5 rounded-xl border border-slate-800 space-y-4 font-mono text-xs text-slate-350">
                              <div className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                                <span className="text-xs text-slate-450 uppercase font-mono">Active Instrument</span>
                                <span className="text-xs text-white font-bold bg-cyan-650/20 border border-cyan-550/20 px-2 py-0.5 rounded uppercase">
                                  {activeSymbol} @ {activeTimeframe} (Entry Timeframe)
                                </span>
                              </div>
                              
                              <p className="text-[11px] font-sans text-slate-450 leading-relaxed">
                                Ready to simulate trades on <b>{activeSymbol}</b> using the <b>{activeTimeframe}</b> entry timeframe for recent 300 candle periods. High performance simulation logic executes instant order tracking and outputs accurate Win Rates.
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={handleCompileAndBacktest}
                            disabled={isRefreshing}
                            className={`w-full py-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 cursor-pointer ${
                              isRefreshing && 'opacity-60 cursor-not-allowed'
                            }`}
                          >
                            {isRefreshing ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
                                Working compiler...
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 fill-current text-slate-900" />
                                RUN ALGORITHMIC STRATEGY BACKTEST
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                    </div>

                    {/* Backtest Trades list details */}
                    <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-405 tracking-widest uppercase font-mono flex items-center gap-1.5">
                          <Activity className="w-4 h-4 text-cyan-400" />
                          ALGORITHMIC TRADE OUTCOMES ({appState.activeBacktest?.trades.length || 0} Trades Filled)
                        </h4>
                        <span className="text-[8px] uppercase font-bold text-slate-500 font-mono tracking-widest">Active results</span>
                      </div>
                      
                      {!appState.activeBacktest || appState.activeBacktest.trades.length === 0 ? (
                        <div className="py-8 text-center text-slate-500 italic text-xs">
                          No active trades executed on recent compiler. Click 'Compile & Run Backtest' above to generate!
                        </div>
                      ) : (
                        <div className="overflow-x-auto max-h-56">
                          <table className="w-full text-left text-xs font-mono min-w-[700px]">
                            <thead className="text-slate-500 border-b border-slate-800 pb-1">
                              <tr>
                                <th className="pb-1 text-slate-400 font-bold">Order #</th>
                                <th className="pb-1">Date</th>
                                <th className="pb-1">Entry Time</th>
                                <th className="pb-1">Timeframe</th>
                                <th className="pb-1">Type</th>
                                <th className="pb-1">Entry Price</th>
                                <th className="pb-1">Exit Price</th>
                                <th className="pb-1">Exit Time</th>
                                <th className="pb-1">Pips</th>
                                <th className="pb-1">Profit/Loss</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-900 text-slate-350">
                              {appState.activeBacktest.trades.map((tr, index) => (
                                <tr key={tr.id} className="hover:bg-slate-800/20">
                                  <td className="py-2.5 font-bold text-slate-400">{index + 1}</td>
                                  <td className="py-2.5 text-slate-400">{tr.dateStr || 'Recent'}</td>
                                  <td className="py-2.5 text-slate-450">{tr.timeStr}</td>
                                  <td className="py-2.5">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                      {tr.timeframe || activeTimeframe}
                                    </span>
                                  </td>
                                  <td className="py-2.5">
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                      tr.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                    }`}>
                                      {tr.type}
                                    </span>
                                  </td>
                                  <td className="py-2.5 font-bold text-slate-100">${tr.price.toLocaleString()}</td>
                                  <td className="py-2.5 font-bold text-slate-200">
                                    {tr.exitPrice ? `$${tr.exitPrice.toLocaleString()}` : '-'}
                                  </td>
                                  <td className="py-2.5 text-slate-450">{tr.exitTimeStr || 'Boundary Close'}</td>
                                  <td className={`py-2.5 font-mono text-[11px] ${tr.pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {tr.pips >= 0 ? '+' : ''}{tr.pips}
                                  </td>
                                  <td className={`py-2.5 font-bold ${tr.profit >= 0 ? 'text-emerald-450' : 'text-rose-455 font-bold'}`}>
                                    {tr.profit >= 0 ? '+' : ''}{tr.profit}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* AI Tool & Compile logs panel (Right Column) */}
                  <div className="space-y-4">
                    
                    {/* Gemini AI smart helper box */}
                    <div className="bg-gradient-to-br from-indigo-950/20 to-cyan-950/20 p-5 rounded-2xl border border-indigo-900/30 shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full filter blur-2xl animate-pulse"></div>
                      
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <h4 className="text-xs font-bold text-indigo-350 tracking-wider uppercase font-mono">Gemini AI Pine Consultant</h4>
                      </div>

                      <p className="text-xs text-slate-350 leading-relaxed mb-4">
                        Leverage Gemini LLM to scan your Pine script structure, detect critical bugs, and generate mathematically optimized version-5 versions instantly.
                      </p>

                      <div className="space-y-2">
                        <button
                          onClick={handleAIOptimize}
                          disabled={isAiOptimizing}
                          className="w-full py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow shadow-cyan-600/10 cursor-pointer disabled:opacity-50"
                        >
                          {isAiOptimizing ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Running AI Analysis...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              Optimize Design with AI
                            </>
                          )}
                        </button>
                      </div>

                      {/* Display optimizations results comparison */}
                      {showAiOptimizedResults && (
                        <div className="mt-4 p-3 bg-slate-950/80 rounded-xl border border-indigo-900/50 space-y-3 max-h-96 overflow-y-auto">
                          <div className="flex justify-between items-center pb-2 border-b border-slate-850">
                            <span className="text-[9px] font-bold text-cyan-400 font-mono uppercase">Optimizations Compiled!</span>
                            <button onClick={() => setShowAiOptimizedResults(false)} className="text-slate-400 hover:text-white">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="text-[11px] text-slate-300 leading-relaxed space-y-2 font-sans overflow-hidden">
                            <div className="p-2 bg-slate-900 rounded border border-slate-800 text-[10px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto mt-1 scrollbar-hide text-indigo-300">
                              {aiOptimizedCode}
                            </div>
                            
                            <div className="mt-2 text-slate-400 leading-normal text-xs text-slate-300 prose prose-invert font-sans">
                              {aiOptimizedAnalysis}
                            </div>
                          </div>

                          <button
                            onClick={handleApplyAIOptimizations}
                            className="w-full py-1.5 bg-cyan-400 text-slate-950 font-extrabold rounded-lg text-xs transition-all cursor-pointer text-center"
                          >
                            Apply Optimized Rewrite
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Physical compiler logs stdout feedback */}
                    <div className="bg-slate-950 p-5 rounded-2xl border border-slate-900 flex flex-col h-64 overflow-hidden">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-900 shrink-0 select-none">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono flex items-center gap-1.5">
                          <Laptop className="w-3.5 h-3.5" />
                          Compiler Standard Logs
                        </span>
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                      </div>

                      <div className="flex-1 overflow-auto py-2.5 font-mono text-[10px] text-slate-450 leading-relaxed space-y-1.5 scrollbar-hide select-text">
                        {appState.activeBacktest?.logs && appState.activeBacktest.logs.length > 0 ? (
                          appState.activeBacktest.logs.map((lg, i) => {
                            let cl = 'text-slate-400';
                            if (lg.includes('[RUN]')) cl = 'text-cyan-45 * text-cyan-400';
                            if (lg.includes('[COMPILER]')) cl = 'text-slate-500';
                            if (lg.includes('[ERROR]')) cl = 'text-rose-400 font-bold';
                            if (lg.includes('[ANALYSIS]')) cl = 'text-emerald-400';
                            return <div key={i} className={cl}>{lg}</div>;
                          })
                        ) : (
                          <div className="text-slate-600 italic">No compiler outputs available. Run a simulation schema.</div>
                        )}
                      </div>
                    </div>

                  </div>

                </div>

              </div>
            )}

            {/* C. TAB 3: TRADINGVIEW CHARTING ADVANCED AREA */}
            {activeTab === 'charts' && (
              <div className="h-full relative w-full border border-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col bg-slate-950" style={{ minHeight: '600px' }}>
                <div className="h-10 border-b border-slate-900 bg-slate-900/60 px-4 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                    <Laptop className="w-4 h-4" />
                    Advanced Advanced Multi-indicator Candlesticks View: {tradingViewSymbol} @ {activeTimeframe}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span>FRAME RATE: STABLE</span>
                    <span className="w-2 h-2 rounded bg-emerald-500 animate-pulse"></span>
                  </div>
                </div>

                <div className="flex-1 w-full h-full relative">
                  <iframe
                    title={`TradingView Advanced Chart Container: ${tradingViewSymbol}`}
                    src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=${tradingViewSymbol}&interval=${tradingViewInterval}&theme=dark&style=1&timezone=Etc%2FUTC&studies=%5B%5D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=202123`}
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
              </div>
            )}

            {/* D. TAB 4: MARKET TECHNICAL RATING SCREENER */}
            {activeTab === 'screener' && (
              <div className="space-y-5">
                <div className="bg-slate-900/30 p-5 rounded-2xl border border-slate-905 flex flex-col">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Market Technical Screener Ratings</h3>
                    <p className="text-xs text-slate-400 mt-1">Real-time technical scoring computed using multi-period moving averages crossover algorithms & RSI levels offsets.</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 rounded-2xl border border-slate-900 overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950 text-slate-500 border-b border-slate-800 text-[10px]">
                      <tr>
                        <th className="p-4 font-bold pl-5">Ticker</th>
                        <th className="p-4 font-bold">TradingView Symbol</th>
                        <th className="p-4 font-bold">Estimated Close</th>
                        <th className="p-4 font-bold">Pivot High Target</th>
                        <th className="p-4 font-bold">Pivot Low Target</th>
                        <th className="p-4 font-bold">Consensus Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900 text-slate-350">
                      {SYMBOLS.map((sym, idx) => {
                        const priceIdx = tapePrices[sym]?.price || 1512.44;
                        const rating = (idx % 3 === 0) ? 'Strong Buy' : (idx % 3 === 1) ? 'Hold' : 'Strong Sell';
                        const colorClass = rating === 'Strong Buy' ? 'text-emerald-450 bg-emerald-500/10' : rating === 'Hold' ? 'text-slate-400 bg-slate-800' : 'text-rose-450 bg-rose-500/10';
                        return (
                          <tr key={sym} className="hover:bg-slate-800/10">
                            <td className="p-4 font-sans font-extrabold text-white pl-5">{sym}</td>
                            <td className="p-4 text-slate-500">{sym === 'BTCUSD' ? 'BINANCE:BTCUSDT' : sym === 'XAUUSD' ? 'OANDA:XAUUSD' : `FX:${sym}`}</td>
                            <td className="p-4 font-bold text-slate-100">${priceIdx.toLocaleString()}</td>
                            <td className="p-4 text-rose-400">${(priceIdx * 1.015).toFixed(2)}</td>
                            <td className="p-4 text-emerald-400">${(priceIdx * 0.985).toFixed(2)}</td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${colorClass}`}>
                                {rating}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* E. TAB 5: ALERTS CENTER FEEDS HISTORY */}
            {activeTab === 'alerts' && (
              <div className="space-y-5">
                <div className="bg-slate-900/30 p-5 rounded-2xl border border-slate-900 flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Alerts & Stream Feed Central</h3>
                    <p className="text-xs text-slate-400 mt-1">Logs historical setup tap alerts, body closes, and CRT structures triggered throughout current operations timeline.</p>
                  </div>
                  <button onClick={handleClearData} className="px-3 py-1 bg-rose-600/10 text-rose-400 hover:bg-rose-600/20 border border-rose-500/20 rounded text-xs transition-all font-semibold flex items-center gap-1 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Logs
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Alert triggers Column */}
                  <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 flex flex-col">
                    <h4 className="text-xs font-bold text-slate-350 uppercase tracking-widest mb-3 flex items-center gap-1 font-mono">
                      <Bell className="w-4 h-4 text-cyan-400" />
                      Logged System Alerts ({appState.alerts.length})
                    </h4>
                    
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-128 scrollbar-hide">
                      {appState.alerts.length === 0 ? (
                        <div className="py-12 text-center text-slate-600 italic text-xs">No alerts logged.</div>
                      ) : (
                        appState.alerts.map((al) => (
                          <div key={al.id} className="p-3 rounded-lg bg-slate-950 border border-slate-900 hover:border-slate-800 transition-all">
                            <div className="flex justify-between items-center text-[10px] font-mono">
                              <span className="text-cyan-400 font-bold uppercase">{al.symbol} • {al.timeframe}</span>
                              <span className="text-slate-500">{new Date(al.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <h5 className="text-xs font-extrabold text-slate-100 mt-1">{al.title}</h5>
                            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{al.description}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Engine system telemetry Column */}
                  <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 flex flex-col">
                    <h4 className="text-xs font-bold text-slate-350 uppercase tracking-widest mb-3 flex items-center gap-1 font-mono">
                      <Activity className="w-4 h-4 text-cyan-400" />
                      Engine Diagnostic Logs ({appState.logs.length})
                    </h4>

                    <div className="space-y-1.5 flex-1 overflow-y-auto max-h-128 pl-1 font-mono text-[10px] text-slate-450 scrollbar-hide">
                      {appState.logs.length === 0 ? (
                        <div className="py-12 text-center text-slate-600 italic">No diagnostic logs.</div>
                      ) : (
                        appState.logs.map((lg) => {
                          let catColor = 'text-slate-500';
                          if (lg.category === 'ALERT') catColor = 'text-rose-400 font-semibold';
                          if (lg.category === 'SYSTEM') catColor = 'text-cyan-400';
                          if (lg.category === 'GEMINI') catColor = 'text-indigo-400';

                          return (
                            <div key={lg.id} className="hover:bg-slate-900/50 p-1 rounded">
                              <span className="text-slate-600">[{new Date(lg.timestamp).toLocaleTimeString()}]</span>{' '}
                              <span className={catColor}>[{lg.category}]</span>{' '}
                              {lg.symbol && <span className="text-slate-100 font-bold">[{lg.symbol}]</span>}
                              <span className="text-slate-300 ml-1">{lg.message}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* F. TAB 6: SETTINGS & PARAMETERS CONFIGS */}
            {activeTab === 'settings' && (
              <div className="space-y-5">
                <div className="bg-slate-900/30 p-5 rounded-2xl border border-slate-900">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Engine Settings & Credentials</h3>
                  <p className="text-xs text-slate-400 mt-1">Configure logic switches, lines styling, and external notifications callbacks (Telegram & Discord).</p>
                </div>

                <form onSubmit={handleSaveSettings} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Logic controller configs */}
                  <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 space-y-4">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest font-mono">Pattern Switches</h4>
                    
                    <div className="space-y-4 pt-1">
                      <label className="flex items-center gap-3 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.crtEnabled}
                          onChange={(e) => setSettingsForm({ ...settingsForm, crtEnabled: e.target.checked })}
                          className="w-4 h-4 bg-slate-950 border-slate-800 text-cyan-600 rounded rounded focus:ring-slate-900 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-white block">CRT Detection Engine</span>
                          <span className="text-[10px] text-slate-500 block">Detect taps and sweep on high timeframe pivot markers.</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.cisdEnabled}
                          onChange={(e) => setSettingsForm({ ...settingsForm, cisdEnabled: e.target.checked })}
                          className="w-4 h-4 bg-slate-950 border-slate-800 text-cyan-600 rounded rounded focus:ring-slate-900 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-white block">CISD Displacement Engine</span>
                          <span className="text-[10px] text-slate-500 block">Evaluate displacement body close breaks on lower timeframe indices.</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.liqEnabled}
                          onChange={(e) => setSettingsForm({ ...settingsForm, liqEnabled: e.target.checked })}
                          className="w-4 h-4 bg-slate-950 border-slate-800 text-cyan-600 rounded rounded focus:ring-slate-900 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-white block">Liquidity Levels Sweeps</span>
                          <span className="text-[10px] text-slate-500 block">Scan swings parameters filters logs.</span>
                        </div>
                      </label>
                    </div>

                    <h4 className="text-xs font-bold text-slate-350 uppercase tracking-widest font-mono pt-3">Timeframe Chart Visibilities</h4>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="text-xs text-slate-400 flex items-center gap-2 select-none cursor-pointer">
                        <input type="checkbox" checked={settingsForm.dailyVisible} onChange={(e) => setSettingsForm({ ...settingsForm, dailyVisible: e.target.checked })} className="cursor-pointer" /> Daily Pivots
                      </label>
                      <label className="text-xs text-slate-400 flex items-center gap-2 select-none cursor-pointer">
                        <input type="checkbox" checked={settingsForm.fourHourVisible} onChange={(e) => setSettingsForm({ ...settingsForm, fourHourVisible: e.target.checked })} className="cursor-pointer" /> 4 Hour Pivots
                      </label>
                      <label className="text-xs text-slate-400 flex items-center gap-2 select-none cursor-pointer">
                        <input type="checkbox" checked={settingsForm.oneHourVisible} onChange={(e) => setSettingsForm({ ...settingsForm, oneHourVisible: e.target.checked })} className="cursor-pointer" /> 1 Hour Pivots
                      </label>
                      <label className="text-xs text-slate-400 flex items-center gap-2 select-none cursor-pointer">
                        <input type="checkbox" checked={settingsForm.fifteenMinVisible} onChange={(e) => setSettingsForm({ ...settingsForm, fifteenMinVisible: e.target.checked })} className="cursor-pointer" /> 15 Min Pivots
                      </label>
                    </div>
                  </div>

                  {/* API Credentials external routes */}
                  <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between gap-5">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest font-mono">External Bot Notification Settings</h4>
                      
                      <div className="space-y-2.5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Telegram Bot Access Token</label>
                        <input
                          type="text"
                          placeholder="xxxxxxxx:xxxxxxxxxxxxxxxxxxxxx"
                          value={settingsForm.telegramToken}
                          onChange={(e) => setSettingsForm({ ...settingsForm, telegramToken: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.8 text-xs text-white placeholder-slate-700 font-mono focus:outline-none"
                        />
                      </div>

                      <div className="space-y-2.5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Telegram Chat Identifier (ID)</label>
                        <input
                          type="text"
                          placeholder="-100xxxxxxxxx or user_id"
                          value={settingsForm.telegramChatId}
                          onChange={(e) => setSettingsForm({ ...settingsForm, telegramChatId: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.8 text-xs text-white placeholder-slate-700 font-mono focus:outline-none"
                        />
                      </div>

                      <div className="space-y-2.5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Discord Webhook Url Endpoint</label>
                        <input
                          type="text"
                          placeholder="https://discord.com/api/webhooks/xxxxxx"
                          value={settingsForm.discordWebhookUrl}
                          onChange={(e) => setSettingsForm({ ...settingsForm, discordWebhookUrl: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.8 text-xs text-white placeholder-slate-700 font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-extrabold rounded-xl text-xs transition-all tracking-wider uppercase font-mono cursor-pointer"
                    >
                      Save Configuration
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>

        </div>

      </main>

    </div>
  );
}
