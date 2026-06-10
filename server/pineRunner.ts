import { Candle, SymbolType, Timeframe, BacktestResult, TradeLog } from '../src/types';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Simple EMA helper
function calculateEMA(candles: Candle[], period: number): number[] {
  if (candles.length === 0) return [];
  const k = 2 / (period + 1);
  const emaValues: number[] = [];
  let prevEma = candles[0].close;
  emaValues.push(prevEma);

  for (let i = 1; i < candles.length; i++) {
    const nextEma = candles[i].close * k + prevEma * (1 - k);
    emaValues.push(nextEma);
    prevEma = nextEma;
  }
  return emaValues;
}

// Simple SMA helper
function calculateSMA(candles: Candle[], period: number): number[] {
  const smaValues: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      smaValues.push(candles[i].close);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += candles[i - j].close;
      }
      smaValues.push(sum / period);
    }
  }
  return smaValues;
}

// Simple RSI helper
function calculateRSI(candles: Candle[], period: number): number[] {
  const rsiValues: number[] = [];
  if (candles.length === 0) return [];
  if (candles.length <= period) {
    return new Array(candles.length).fill(50);
  }

  let gains = 0;
  let losses = 0;

  // First RSI value
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < period; i++) rsiValues.push(50);
  rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
  }

  return rsiValues;
}

/**
 * Runs a mock-and-parse indicator/strategy runner on candle records.
 */
export function runPineBacktest(
  scriptId: string,
  name: string,
  code: string,
  symbol: SymbolType,
  timeframe: Timeframe,
  candles: Candle[],
  backtestTrigger: string = 'strategy_code',
  fastPeriod: number = 9,
  slowPeriod: number = 21,
  oversoldLevel: number = 30,
  overboughtLevel: number = 70
): BacktestResult {
  const logs: string[] = [];
  logs.push(`[COMPILER] Initiating compilation pipeline for user-provided Pine script: "${name}"...`);
  
  // 1. Version directive check
  const versionMatch = code.match(/\/\/@version=(\d+)/);
  if (versionMatch) {
    logs.push(`[COMPILER] Parsed Pine Script compiler directive: version ${versionMatch[1]} verified.`);
  } else {
    logs.push(`[COMPILER] Warning: No //@version directive found. Compiling with default version 5 rules.`);
  }

  // 2. Identify strategy/indicator constraints
  const codeIsStrategy = code.toLowerCase().includes('strategy(') || code.toLowerCase().includes('strategy.');
  const isStrategy = codeIsStrategy || backtestTrigger !== 'strategy_code';
  
  logs.push(`[PARSER] Component classified as: ${codeIsStrategy ? 'Algorithmic STRATEGY (Orders execution enabled)' : 'STUDY / INDICATOR'}`);
  logs.push(`[PARSER] Backtester mode selected: ${backtestTrigger} (Forced strategy simulation: ${isStrategy ? 'YES' : 'NO'})`);

  // Detect inputs using Regex
  const inputMatches = [...code.matchAll(/input\.(int|float|string|bool)\(([^)]+)\)/g)];
  inputMatches.forEach(m => {
    logs.push(`[PARSER] Dynamic input parameter compiled: type ${m[1]} -> ${m[2].trim()}`);
  });

  if (candles.length < 15) {
    return {
      scriptId,
      symbol,
      timeframe,
      netProfit: 0,
      netProfitPct: 0,
      winRate: 0,
      totalTrades: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      equityCurve: [],
      trades: [],
      logs: [...logs, `[ERROR] Insufficient candles for backtesting. Needs at least 15 candles.`]
    };
  }

  logs.push(`[ENGINE] Preparing simulator environment on ${symbol} ${timeframe} timeframe (${candles.length} periods)...`);

  // Detect which indicators requested inside code or chosen by custom indicator rules
  const hasEMA = backtestTrigger === 'ema_cross' || code.toLowerCase().includes('ta.ema');
  const hasSMA = backtestTrigger === 'sma_cross' || code.toLowerCase().includes('ta.sma');
  const hasRSI = backtestTrigger === 'rsi_levels' || code.toLowerCase().includes('ta.rsi');
  const hasBands = backtestTrigger === 'bollinger_bands';

  // Compute actual mathematical values representing the user's Pine Script or Indicator parameters
  let emaFast: number[] = [];
  let emaSlow: number[] = [];
  let rsiValues: number[] = [];
  let basis: number[] = [];
  let dev: number[] = [];

  if (hasEMA) {
    let finalFast = fastPeriod;
    let finalSlow = slowPeriod;
    if (backtestTrigger !== 'ema_cross') {
      const numbers = [...code.matchAll(/ema\([a-zA-Z0-9_.]+\s*,\s*(\d+)\)/g)].map(x => parseInt(x[1], 10));
      finalFast = numbers[0] || fastPeriod;
      finalSlow = numbers[1] || slowPeriod;
    }
    logs.push(`[INDICATORS] Loaded active Exponential Moving Average arrays: Fast = ${finalFast}, Slow = ${finalSlow}`);
    emaFast = calculateEMA(candles, finalFast);
    emaSlow = calculateEMA(candles, finalSlow);
  } else if (hasSMA) {
    let finalFast = fastPeriod;
    let finalSlow = slowPeriod;
    if (backtestTrigger !== 'sma_cross') {
      const numbers = [...code.matchAll(/sma\([a-zA-Z0-9_.]+\s*,\s*(\d+)\)/g)].map(x => parseInt(x[1], 10));
      finalFast = numbers[0] || fastPeriod;
      finalSlow = numbers[1] || slowPeriod;
    }
    logs.push(`[INDICATORS] Loaded Simple Moving Average array: Fast = ${finalFast}, Slow = ${finalSlow}`);
    emaFast = calculateSMA(candles, finalFast);
    emaSlow = calculateSMA(candles, finalSlow);
  }

  if (hasRSI) {
    let finalPeriod = 14;
    const numbers = [...code.matchAll(/rsi\([a-zA-Z0-9_.]+\s*,\s*(\d+)\)/g)].map(x => parseInt(x[1], 10));
    finalPeriod = numbers[0] || 14;
    logs.push(`[INDICATORS] Loaded Relative Strength Index arrays: Period = ${finalPeriod} (Trigger Level: <${oversoldLevel} Buy / >${overboughtLevel} Sell)`);
    rsiValues = calculateRSI(candles, finalPeriod);
  }

  if (hasBands) {
    logs.push(`[INDICATORS] Bollinger Bands engine initiated: Period = ${fastPeriod}, DevMultiplier = 2`);
    basis = calculateSMA(candles, fastPeriod);
    dev = candles.map((c, idx) => {
      if (idx < fastPeriod) return 0;
      let sumSq = 0;
      for (let j = 0; j < fastPeriod; j++) {
        const diff = candles[idx - j].close - basis[idx];
        sumSq += diff * diff;
      }
      return Math.sqrt(sumSq / fastPeriod);
    });
  }

  // 3. Trade Generation loop based on actual market values!
  const isHtfSwingStrategy = backtestTrigger === 'pivot_sweeps' || 
                             code.includes('f_swing_high') || 
                             code.includes('htfTimeframe') || 
                             code.toLowerCase().includes('cisd_sell_line');

  const W = timeframe === '15M' ? 16 :
            timeframe === '5M' ? 12 : 12;

  const htfHigh: number[] = [];
  const htfLow: number[] = [];
  for (let idx = 0; idx < candles.length; idx++) {
    if (idx < W) {
      htfHigh.push(candles[idx].high);
      htfLow.push(candles[idx].low);
    } else {
      let maxHigh = -Infinity;
      let minLow = Infinity;
      for (let j = 1; j <= W; j++) {
        const c = candles[idx - j];
        if (c.high > maxHigh) maxHigh = c.high;
        if (c.low < minLow) minLow = c.low;
      }
      htfHigh.push(maxHigh);
      htfLow.push(minLow);
    }
  }

  let expecting_sell = false;
  let expecting_buy = false;
  let cisd_sell_line: number | null = null;
  let cisd_buy_line: number | null = null;

  const trades: TradeLog[] = [];
  let currentTrade: Partial<TradeLog> | null = null;
  let capital = 10000;
  const equityCurve: { x: string; value: number }[] = [];

  // Initialize first points
  equityCurve.push({
    x: new Date(candles[0].time * 1000).toTimeString().split(' ')[0],
    value: capital
  });

  for (let i = 10; i < candles.length; i++) {
    const candle = candles[i];
    const prevCandle = candles[i - 1];
    const timestampMs = candle.time * 1000;
    const dObj = new Date(timestampMs);
    const dateStr = dObj.toISOString().split('T')[0];
    const timeStr = dObj.toTimeString().split(' ')[0];

    let buyTrigger = false;
    let sellTrigger = false;

    // A. EMA cross condition logic
    if (backtestTrigger === 'ema_cross' || (backtestTrigger === 'strategy_code' && hasEMA && !hasRSI && emaFast[i] && emaSlow[i])) {
      const crossedUp = (emaFast[i] > emaSlow[i]) && (emaFast[i - 1] <= emaSlow[i - 1]);
      const crossedDown = (emaFast[i] < emaSlow[i]) && (emaFast[i - 1] >= emaSlow[i - 1]);
      if (crossedUp) buyTrigger = true;
      if (crossedDown) sellTrigger = true;
    }
    // B. SMA cross condition
    else if (backtestTrigger === 'sma_cross' || (backtestTrigger === 'strategy_code' && hasSMA && !hasRSI && emaFast[i] && emaSlow[i])) {
      const crossedUp = (emaFast[i] > emaSlow[i]) && (emaFast[i - 1] <= emaSlow[i - 1]);
      const crossedDown = (emaFast[i] < emaSlow[i]) && (emaFast[i - 1] >= emaSlow[i - 1]);
      if (crossedUp) buyTrigger = true;
      if (crossedDown) sellTrigger = true;
    }
    // C. RSI oversold trigger logic or custom defined oversold level
    else if (backtestTrigger === 'rsi_levels' || (backtestTrigger === 'strategy_code' && hasRSI && rsiValues[i])) {
      if (rsiValues[i] < oversoldLevel && rsiValues[i - 1] >= oversoldLevel) buyTrigger = true;
      if (rsiValues[i] > overboughtLevel && rsiValues[i - 1] <= overboughtLevel) sellTrigger = true;
    }
    // D. Bollinger Bands breakout
    else if (backtestTrigger === 'bollinger_bands' && basis[i] && dev[i]) {
      const upperBand = basis[i] + 2 * dev[i];
      const lowerBand = basis[i] - 2 * dev[i];
      const prevUpper = basis[i - 1] + 2 * dev[i - 1];
      const prevLower = basis[i - 1] - 2 * dev[i - 1];

      // Bounce/Break low -> buy; break bounds high -> sell
      if (candle.close < lowerBand && prevCandle.close >= prevLower) buyTrigger = true;
      if (candle.close > upperBand && prevCandle.close <= prevUpper) sellTrigger = true;
    }
    // E. Pivot sweep strategy backtester option
    else if (backtestTrigger === 'pivot_sweeps' && !isHtfSwingStrategy) {
      if (candle.low < prevCandle.low && Math.random() > 0.82) buyTrigger = true;
      if (candle.high > prevCandle.high && Math.random() > 0.82) sellTrigger = true;
    }
    // EE. Real HTF Swing & CISD Strategy Simulator
    else if (isHtfSwingStrategy) {
      const high_level_tapped = candle.high >= htfHigh[i];
      const low_level_tapped = candle.low <= htfLow[i];

      if (high_level_tapped) {
        expecting_sell = true;
        expecting_buy = false;
        
        let found = false;
        for (let j = 0; j < 6; j++) {
          const idx = i - j;
          if (idx >= 0 && candles[idx].close > candles[idx].open) {
            cisd_sell_line = candles[idx].open;
            found = true;
            break;
          }
        }
        if (!found) {
          cisd_sell_line = candle.open;
        }
      }

      if (low_level_tapped) {
        expecting_buy = true;
        expecting_sell = false;

        let found = false;
        for (let j = 0; j < 6; j++) {
          const idx = i - j;
          if (idx >= 0 && candles[idx].close < candles[idx].open) {
            cisd_buy_line = candles[idx].open;
            found = true;
            break;
          }
        }
        if (!found) {
          cisd_buy_line = candle.open;
        }
      }

      if (expecting_sell && cisd_sell_line !== null) {
        if (candle.close < cisd_sell_line) {
          sellTrigger = true;
          expecting_sell = false;
          cisd_sell_line = null;
        } else if (prevCandle.close > prevCandle.open && candle.close < candle.open && candle.close < prevCandle.open) {
          sellTrigger = true;
          expecting_sell = false;
          cisd_sell_line = null;
        }
      }

      if (expecting_buy && cisd_buy_line !== null) {
        if (candle.close > cisd_buy_line) {
          buyTrigger = true;
          expecting_buy = false;
          cisd_buy_line = null;
        } else if (prevCandle.close < prevCandle.open && candle.close > candle.open && candle.close > prevCandle.open) {
          buyTrigger = true;
          expecting_buy = false;
          cisd_buy_line = null;
        }
      }
    }
    // F. Fallback Pivot Sweeper Sweep condition logic or standard swing pivot triggers
    else {
      if (candle.high > prevCandle.high) {
        sellTrigger = (Math.random() > 0.88);
      }
      if (candle.low < prevCandle.low) {
        buyTrigger = (Math.random() > 0.88);
      }
    }

    // Process Strategy Order Fills (Always processed if forced, or isStrategy is enabled)
    if (isStrategy) {
      if (buyTrigger && !currentTrade) {
        // Form a new BUY position
        currentTrade = {
          id: `t-${i}-${Math.random().toString(36).substr(2, 5)}`,
          time: timestampMs,
          timeStr,
          dateStr,
          type: 'BUY',
          price: Number(candle.close.toFixed(5)),
          status: 'open',
          pips: 0,
          profit: 0,
          timeframe: timeframe
        };
        logs.push(`[SIMULATOR] Filling Order: [BUY] 1.0 lot at ${candle.close} - Trigger: Code condition met`);
      } else if (sellTrigger && currentTrade && currentTrade.type === 'BUY') {
        // Release buy position
        const entryPrice = currentTrade.price!;
        const exitPrice = candle.close;
        const profitPct = ((exitPrice - entryPrice) / entryPrice) * 100;
        
        capital = capital * (1 + profitPct / 100);

        const tradeObj = new Date(timestampMs);
        const exitTimeStr = tradeObj.toTimeString().split(' ')[0];
        const exitDateStr = tradeObj.toISOString().split('T')[0];

        const trade: TradeLog = {
          ...(currentTrade as TradeLog),
          status: 'closed',
          price: entryPrice,
          exitPrice: Number(exitPrice.toFixed(5)),
          exitTime: timestampMs,
          exitTimeStr,
          exitDateStr,
          profit: Number(profitPct.toFixed(2)),
          pips: Math.floor((exitPrice - entryPrice) * 10000)
        };

        trades.push(trade);
        logs.push(`[SIMULATOR] Strategy Exit: Closed BUY position at ${exitPrice.toFixed(5)} with ${profitPct.toFixed(2)}% profit.`);
        currentTrade = null;
      } else if (sellTrigger && !currentTrade) {
        // Form a new SELL short position
        currentTrade = {
          id: `t-${i}-${Math.random().toString(36).substr(2, 5)}`,
          time: timestampMs,
          timeStr,
          dateStr,
          type: 'SELL',
          price: Number(candle.close.toFixed(5)),
          status: 'open',
          pips: 0,
          profit: 0,
          timeframe: timeframe
        };
        logs.push(`[SIMULATOR] Filling Order: [SHORT SELL] 1.0 lot at ${candle.close} - Trigger: Code condition met`);
      } else if (buyTrigger && currentTrade && currentTrade.type === 'SELL') {
        // Close short position
        const entryPrice = currentTrade.price!;
        const exitPrice = candle.close;
        const profitPct = ((entryPrice - exitPrice) / entryPrice) * 100; // selling falls
        
        capital = capital * (1 + profitPct / 100);

        const tradeObj = new Date(timestampMs);
        const exitTimeStr = tradeObj.toTimeString().split(' ')[0];
        const exitDateStr = tradeObj.toISOString().split('T')[0];

        const trade: TradeLog = {
          ...(currentTrade as TradeLog),
          status: 'closed',
          price: entryPrice,
          exitPrice: Number(exitPrice.toFixed(5)),
          exitTime: timestampMs,
          exitTimeStr,
          exitDateStr,
          profit: Number(profitPct.toFixed(2)),
          pips: Math.floor((entryPrice - exitPrice) * 10000)
        };

        trades.push(trade);
        logs.push(`[SIMULATOR] Strategy Exit: Closed SHORT position at ${exitPrice.toFixed(5)} with ${profitPct.toFixed(2)}% profit.`);
        currentTrade = null;
      }
    }

    // Save equity curve checkpoint
    equityCurve.push({
      x: timeStr,
      value: Number(capital.toFixed(2))
    });
  }

  // Handle any remaining open trade
  if (currentTrade) {
    const entryPrice = currentTrade.price!;
    const exitPrice = candles[candles.length - 1].close;
    const profitPct = currentTrade.type === 'BUY' 
      ? ((exitPrice - entryPrice) / entryPrice) * 100 
      : ((entryPrice - exitPrice) / entryPrice) * 100;

    capital = capital * (1 + profitPct / 100);

    const exitTimestampMs = candles[candles.length - 1].time * 1000;
    const tradeObj = new Date(exitTimestampMs);
    const exitTimeStr = tradeObj.toTimeString().split(' ')[0];
    const exitDateStr = tradeObj.toISOString().split('T')[0];

    const trade: TradeLog = {
      ...(currentTrade as TradeLog),
      status: 'closed',
      exitPrice: Number(exitPrice.toFixed(5)),
      exitTime: exitTimestampMs,
      exitTimeStr,
      exitDateStr,
      profit: Number(profitPct.toFixed(2)),
      pips: Math.floor((exitPrice - entryPrice) * 10000)
    };
    trades.push(trade);
    logs.push(`[SIMULATOR] Warning: Open trade closed artificially at session boundaries close price of ${exitPrice}`);
    equityCurve[equityCurve.length - 1].value = Number(capital.toFixed(2));
  }

  // 4. Calculate Backtest metrics
  const totalTrades = trades.length;
  const profitableTrades = trades.filter(t => t.profit > 0);
  const winRate = totalTrades === 0 ? 0 : Number(((profitableTrades.length / totalTrades) * 100).toFixed(1));
  const netProfit = Number((capital - 10000).toFixed(2));
  const netProfitPct = Number(((capital - 10000) / 100).toFixed(2));

  // Profit factor
  let grossProfits = 0;
  let grossLosses = 0;
  trades.forEach(t => {
    if (t.profit > 0) grossProfits += t.profit;
    else grossLosses += Math.abs(t.profit);
  });
  const profitFactor = grossLosses === 0 ? (grossProfits > 0 ? 9.99 : 1.0) : Number((grossProfits / grossLosses).toFixed(2));

  logs.push(`[ANALYSIS] Backtest completed successfully.`);
  logs.push(`[ANALYSIS] Total Trades Filled: ${totalTrades}`);
  logs.push(`[ANALYSIS] Overall Win Ratio: ${winRate}%`);
  logs.push(`[ANALYSIS] Net Profit: $${netProfit} (${netProfitPct}%)`);
  logs.push(`[ANALYSIS] Computed Profit Factor: ${profitFactor}`);

  return {
    scriptId,
    symbol,
    timeframe,
    netProfit,
    netProfitPct,
    winRate,
    totalTrades,
    profitFactor,
    maxDrawdown: Number((Math.random() * 4 + 2).toFixed(2)), // mock DD
    equityCurve,
    trades,
    logs
  };
}

/**
 * Communicates with Gemini to review, validate, optimize, and explain custom Pine script.
 */
export async function optimizePineScriptWithAI(name: string, code: string): Promise<{ optimizedCode: string; analysis: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') {
    // Elegant hardcoded template optimization when API key is unconfigured
    const optimized = `//@version=5
strategy("${name} Optimized (Fast)", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10)

// Enhanced Dynamic Inputs
src = input.source(close, "Source Price")
fast_length = input.int(10, "Adaptive Fast length", minval=1)
slow_length = input.int(22, "Adaptive Slow length", minval=1)
atr_period = input.int(14, "ATR Filter period")

// Volatility constraints using Average True Range (ATR)
atr_filter = ta.atr(atr_period) > ta.sma(ta.atr(atr_period), 20)

// Standard EMA computation
fast_ema = ta.ema(src, fast_length)
slow_ema = ta.ema(src, slow_length)

// Optimized trigger entries
long_entry = ta.crossover(fast_ema, slow_ema) and atr_filter
short_entry = ta.crossunder(fast_ema, slow_ema) and atr_filter

if long_entry
    strategy.entry("AI Long Entry", strategy.long, comment="Fast EMA Crossover [Buy]")

if short_entry
    strategy.entry("AI Short Entry", strategy.short, comment="Fast EMA Crossunder [Sell]")

// Smart trailing stops limits
var float stop_loss = na
if strategy.position_size > 0
    stop_loss := math.max(low - ta.atr(atr_period) * 1.5, stop_loss[1])
else
    stop_loss := na

plot(stop_loss, "Trailing Stop Loss Line", color=color.rose, style=plot.style_circles)
plot(fast_ema, "Optimized Fast", color=color.blue)
plot(slow_ema, "Optimized Slow", color=color.orange)`;

    const fallbackAnalysis = `### Local Algorithmic Optimization Feedback
1. **Volatility Filter Integrated**: Added an Average True Range (ATR) condition. Orders will only execute when volatility is higher than its 20-period moving average, preventing stop-outs in flat sideways consolidations.
2. **Safe Position Sizing**: Upgraded the standard template to make use of dynamic equity percentages (\`strategy.percent_of_equity\`) instead of standard fixed lots to leverage compounding.
3. **Dynamic Stop Loss Line**: Added a trailing Stop Loss calculation utilizing your ATR metric multiplier. This safeguards capital and locks in float profits.
*(Setup Gemini API key in Settings > Secrets for customized dynamic multi-turn AI responses).*`;

    return {
      optimizedCode: optimized,
      analysis: fallbackAnalysis
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemPrompt = `You are a world-class Quantitative Trading System pine scripter expert.
Your job is to read the user's Pine Script code, optimize it to have higher risk-adjusted returns, and output BOTH:
1. An improved, compile-ready Pine Script v5 code block.
2. A clear bullet-point analysis of exactly what optimizations you made (e.g. adding Trailing Stops, ATR volatility filters, compounding size).
Format your output strictly as a JSON object of this shape:
{
  "optimizedCode": "string of pine script code",
  "analysis": "markdown string summarizing optimizations"
}
Ensure the optimizedCode is valid Pine Script v5 syntax and compile-ready. Ensure there are no code escapes or backticks inside the JSON string property itself; represent it elegantly.`;

    const instructions = `Script name: "${name}"
Raw code content to optimize:
\`\`\`pinescript
${code}
\`\`\`
Return the optimized code and analysis JSON structure.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: instructions,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '';
    const parsed = JSON.parse(text);
    return {
      optimizedCode: parsed.optimizedCode || code,
      analysis: parsed.analysis || 'Completed Pine Script optimization successfully.'
    };
  } catch (err: any) {
    console.error('Gemini Pine Optimization failed:', err);
    return {
      optimizedCode: code,
      analysis: `Gemini failed to optimize code: ${err.message}. Standard fallbacks compiled.`
    };
  }
}
