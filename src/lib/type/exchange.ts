import { Market as IMarket } from 'ccxt';

export { IMarket };

export interface ISupportExchange {
  id: string;
  name: string;
}

export interface IExchange {
  id: ExchangeId;
  endpoint: {
    public?: any;
    private?: any;
    ws?: any;
    rest?: any;
  };
  markets?: IMarkets;
  pairs?: IPairs;
}

export interface IMarkets {
  [baseCoin: string]: IMarket[];
}

export interface IPairs {
  [pair: string]: IMarket;
}

export enum ExchangeId {
  KuCoin = 'kucoin',
  Binance = 'binance',
  Bitbank = 'bitbank',
  Bittrex = 'bittrex',
  Cryptopia = 'cryptopia',
  Hitbtc = 'hitbtc',
  Hitbtc2 = 'hitbtc2',
  Cobinhood = 'cobinhood',
  Livecoin = 'livecoin',
  Okex = 'okex',
  Huobipro = 'huobipro',
  Poloniex = 'poloniex',
}

export const SupportExchanges = [
  {
    id: ExchangeId.KuCoin,
    name: 'Kucoin',
  },
  {
    id: ExchangeId.Binance,
    name: 'Binance',
  },
  {
    id: ExchangeId.Bitbank,
    name: 'Bitbank',
  },
  {
      id: ExchangeId.Bittrex,
      name: 'Bittrex',
  },
  {
      id: ExchangeId.Cryptopia,
      name: 'Cryptopia',
  },
  {
      id: ExchangeId.Cobinhood,
      name: 'Cobinhood',
  },
  {
      id: ExchangeId.Hitbtc,
      name: 'Hitbtc',
  },
  {
        id: ExchangeId.Hitbtc2,
        name: 'Hitbtc2',
  },
  {
      id: ExchangeId.Livecoin,
      name: 'Livecoin',
  },
  {
      id: ExchangeId.Okex,
      name: 'Okex',
  },
  {
        id: ExchangeId.Huobipro,
        name: 'Huobipro',
  },
  {
        id: ExchangeId.Poloniex,
  },
]

export interface ICredentials {
  apiKey: string;
  secret: string;
}
