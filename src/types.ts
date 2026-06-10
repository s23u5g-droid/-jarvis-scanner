/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Candle {
  time: number; // timestamp in ms or seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SymbolType = 
  | 'XAUUSD' 
  | 'XAGUSD' 
  | 'BTCUSD' 
  | 'ETHUSD' 
  | 'EURUSD' 
  | 'GBPUSD' 
  | 'USDCAD'
  | 'NAS100'
  | 'USDJPY';

export type Timeframe = '1D' | '4H' | '1H' | '15M' | '5M';

export interface PivotLevel {
  id: string;
  symbol: SymbolType;
  type: 'high' | 'low';
  price: number;
  candleTime: number; // timestamp of the peak candle
  timeframe: Timeframe;
  tapped: boolean;
  tapTime?: number;
  tapCandleIndex?: number;
  active: boolean; // still monitoring or invalidated
}

export interface CRTState {
  id: string;
  symbol: SymbolType;
  htfLevel: PivotLevel; // Parent level that was tapped
  status: 'watching' | 'activated' | 'completed' | 'failed';
  ltfCisdTapped: boolean;
  liq1Id?: string;
  liq2Id?: string;
  cisdDetected?: boolean;
  cisdType?: 'BUY' | 'SELL';
  cisdPrice?: number;
  cisdBodyLowHigh?: number;
  entryTime?: number;
  entryPrice?: number;
  invalidated: boolean;
  notes?: string;
}

export interface CISDState {
  id: string;
  symbol: SymbolType;
  type: 'BUY' | 'SELL';
  referenceCandleTime: number;
  bodyLowHighPrice: number; // high of last bearish (BUY) or low of last bullish (SELL)
  isTriggered: boolean;
  triggerTime?: number;
  triggerPrice?: number;
  invalidated: boolean;
}

export interface LiquidityLevel {
  id: string;
  symbol: SymbolType;
  type: 'high' | 'low';
  price: number;
  candleTime: number;
  label: 'LIQ #1' | 'LIQ #2';
  tapped: boolean;
  tapTime?: number;
}

export interface SetupAlert {
  id: string;
  symbol: SymbolType;
  timeframe: Timeframe;
  title: string;
  description: string;
  type: 'PIVOT' | 'HTF_TAP' | 'CRT_ACTIVATE' | 'CISD_TRIGGER' | 'LIQ_FORMED' | 'LIQ_TAPPED' | 'AI_EXPLANATION';
  timestamp: number;
  setupId?: string;
  aiExplanation?: string;
}

export interface ScannerLog {
  id: string;
  timestamp: number;
  symbol: SymbolType;
  message: string;
  category: 'INFO' | 'WARNING' | 'ALERT' | 'SYSTEM';
}

export interface UserSettings {
  crtEnabled: boolean;
  cisdEnabled: boolean;
  liqEnabled: boolean;
  themeColor: string; // hex
  lineStyle: 'solid' | 'dashed' | 'dotted';
  lineWidth: number; // pixels
  dailyVisible: boolean;
  fourHourVisible: boolean;
  oneHourVisible: boolean;
  fifteenMinVisible: boolean;
  fiveMinVisible: boolean;
  telegramToken: string;
  telegramChatId: string;
  discordWebhookUrl: string;
}

export interface PineScript {
  id: string;
  name: string;
  code: string;
  lastCompiled?: number;
  isStrategy: boolean;
}

export interface TradeLog {
  id: string;
  time: number;
  timeStr: string;
  dateStr?: string;
  type: 'BUY' | 'SELL';
  price: number; // Entry Price
  exitPrice?: number; // Exit Price
  exitTime?: number;
  exitTimeStr?: string;
  exitDateStr?: string;
  profit: number; // percentage change
  status: 'open' | 'closed';
  pips: number;
  timeframe?: string; // Entry Timeframe
}

export interface BacktestResult {
  scriptId: string;
  symbol: SymbolType;
  timeframe: Timeframe;
  netProfit: number; // e.g. 1450.20
  netProfitPct: number; // e.g. 14.5
  winRate: number; // e.g. 68.4
  totalTrades: number;
  profitFactor: number;
  maxDrawdown: number;
  equityCurve: { x: string; value: number }[];
  trades: TradeLog[];
  logs: string[];
  aiAnalysis?: string;
}

export interface AppState {
  activeSymbols: SymbolType[];
  settings: UserSettings;
  levels: PivotLevel[];
  crts: CRTState[];
  cisds: CISDState[];
  liquidities: LiquidityLevel[];
  alerts: SetupAlert[];
  logs: ScannerLog[];
  scripts: PineScript[];
  activeBacktest?: BacktestResult | null;
  watchlistSymbols: string[];
}
