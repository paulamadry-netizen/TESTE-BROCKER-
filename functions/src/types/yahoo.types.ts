/**
 * Type definitions for Yahoo Finance API responses
 */

export interface YahooQuoteResult {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketTime: number;
}

export interface YahooFinanceResponse {
  quoteResponse: {
    result: YahooQuoteResult[];
    error: null | string;
  };
}

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

export interface SymbolMapping {
  [key: string]: string;
}

export interface QuoteCache {
  ts: number;
  data: QuoteData[];
}

export interface CacheStore {
  [key: string]: QuoteCache;
}
