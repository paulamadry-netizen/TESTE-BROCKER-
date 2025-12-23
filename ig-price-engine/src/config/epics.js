/**
 * IG Markets EPICS Configuration
 * Complete list of tradable instruments
 */

const EPICS = {
  // Indices (12)
  indices: {
    'IX.D.CAC.IFD.IP': { name: 'France 40', symbol: 'CAC40' },
    'IX.D.DAX.IFD.IP': { name: 'Allemagne 40', symbol: 'DAX40' },
    'IX.D.DOW.IFD.IP': { name: 'Wall Street', symbol: 'DOW' },
    'IX.D.NASDAQ.IFD.IP': { name: 'US Tech 100', symbol: 'NASDAQ' },
    'IX.D.SPTRD.IFD.IP': { name: 'US 500', symbol: 'SP500' },
    'IX.D.FTSE.IFD.IP': { name: 'UK 100', symbol: 'FTSE' },
    'IX.D.ASX.IFD.IP': { name: 'Australie 200', symbol: 'ASX200' },
    'IX.D.STX.IFD.IP': { name: 'Euro Stoxx 50', symbol: 'STOXX50' },
    'IX.D.IBEX.IFD.IP': { name: 'Espagne 35', symbol: 'IBEX35' },
    'IX.D.NIKKEI.IFD.IP': { name: 'Japon 225', symbol: 'NIKKEI' },
    'IX.D.SMI.IFD.IP': { name: 'Suisse', symbol: 'SMI' },
    'IX.D.HSI.IFD.IP': { name: 'Hong Kong', symbol: 'HSI' }
  },

  // Forex (20)
  forex: {
    'CS.D.EURUSD.CFD.IP': { name: 'EUR/USD', symbol: 'EURUSD' },
    'CS.D.GBPUSD.CFD.IP': { name: 'GBP/USD', symbol: 'GBPUSD' },
    'CS.D.USDJPY.CFD.IP': { name: 'USD/JPY', symbol: 'USDJPY' },
    'CS.D.AUDUSD.CFD.IP': { name: 'AUD/USD', symbol: 'AUDUSD' },
    'CS.D.USDCAD.CFD.IP': { name: 'USD/CAD', symbol: 'USDCAD' },
    'CS.D.USDCHF.CFD.IP': { name: 'USD/CHF', symbol: 'USDCHF' },
    'CS.D.EURGBP.CFD.IP': { name: 'EUR/GBP', symbol: 'EURGBP' },
    'CS.D.EURJPY.CFD.IP': { name: 'EUR/JPY', symbol: 'EURJPY' },
    'CS.D.GBPJPY.CFD.IP': { name: 'GBP/JPY', symbol: 'GBPJPY' },
    'CS.D.EURCHF.CFD.IP': { name: 'EUR/CHF', symbol: 'EURCHF' },
    'CS.D.AUDJPY.CFD.IP': { name: 'AUD/JPY', symbol: 'AUDJPY' },
    'CS.D.EURAUD.CFD.IP': { name: 'EUR/AUD', symbol: 'EURAUD' },
    'CS.D.GBPAUD.CFD.IP': { name: 'GBP/AUD', symbol: 'GBPAUD' },
    'CS.D.NZDUSD.CFD.IP': { name: 'NZD/USD', symbol: 'NZDUSD' },
    'CS.D.CADJPY.CFD.IP': { name: 'CAD/JPY', symbol: 'CADJPY' },
    'CS.D.GBPCAD.CFD.IP': { name: 'GBP/CAD', symbol: 'GBPCAD' },
    'CS.D.CHFJPY.CFD.IP': { name: 'CHF/JPY', symbol: 'CHFJPY' },
    'CS.D.EURNZD.CFD.IP': { name: 'EUR/NZD', symbol: 'EURNZD' },
    'CS.D.AUDCAD.CFD.IP': { name: 'AUD/CAD', symbol: 'AUDCAD' },
    'CS.D.NZDJPY.CFD.IP': { name: 'NZD/JPY', symbol: 'NZDJPY' }
  },

  // Commodities (6)
  commodities: {
    'CS.D.GD.CFD.IP': { name: 'Or', symbol: 'GOLD' },
    'CS.D.SI.CFD.IP': { name: 'Argent', symbol: 'SILVER' },
    'CC.D.CL.UMA.IP': { name: 'Pétrole Brut', symbol: 'CRUDE' },
    'CC.D.COFFEE.UMA.IP': { name: 'Café', symbol: 'COFFEE' },
    'TM.D.ZINC.CFD.IP': { name: 'Zinc', symbol: 'ZINC' },
    'TM.D.COPPER.CFD.IP': { name: 'Cuivre', symbol: 'COPPER' }
  }
};

// Get all EPICS as a flat array
const getAllEpics = () => {
  return [
    ...Object.keys(EPICS.indices),
    ...Object.keys(EPICS.forex),
    ...Object.keys(EPICS.commodities)
  ];
};

// Get EPIC info by code
const getEpicInfo = (epicCode) => {
  return EPICS.indices[epicCode] || 
         EPICS.forex[epicCode] || 
         EPICS.commodities[epicCode] || 
         null;
};

// Get EPICS by category
const getEpicsByCategory = (category) => {
  return EPICS[category] || {};
};

module.exports = {
  EPICS,
  getAllEpics,
  getEpicInfo,
  getEpicsByCategory
};
