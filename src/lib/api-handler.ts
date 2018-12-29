import * as ccxt from 'ccxt';
import * as types from './type';
import { Bitbank } from 'bitbank-handler';
import { logger, Helper } from './common';

const delay = require('delay');
const cmcTickerMap: any = {};
const cmc = new ccxt.coinmarketcap();

const CoinGecko = require('coingecko-api');
const CoinGeckoClient = new CoinGecko();
const specialTicker = ['NZDT/USD'];

let createOrderFailCount : number = 0;

export { ccxt };
export class ApiHandler {

  async getTickerFromCMC(ticker: string) {
      if(specialTicker.indexOf(ticker) !== -1) {
          cmcTickerMap[ticker] = await CoinGeckoClient.coins.fetchTickers('nzed');
      }
      if(!cmcTickerMap[ticker]) {
          cmcTickerMap[ticker] = (await cmc.fetchTicker(ticker)).last;
      }
      return cmcTickerMap[ticker];
  }
  
  async getBalance(exchange: types.IExchange): Promise<types.IBalances | undefined> {
    const api = exchange.endpoint.private;
    if (!api) {
      return;
    }
    switch (exchange.id) {
      case types.ExchangeId.Bitbank:
        const bitbank = <Bitbank>api;
        // TODO
        return <any>await bitbank.getAssets().toPromise();
      default:
        return await api.fetchBalance();
    }
  }

  async refillTriangleQuantity (exchange: types.IExchange, triangle: types.ITriangle) {
    const api = <ccxt.Exchange>exchange.endpoint.private;
    if (!api) {
      return;
    }

    const { a, b, c } = triangle;
    if ( !a.quantity || !b.quantity || !c.quantity )	{
        const [orderBookA, orderBookB, orderBookC] = await Promise.all([
            api.fetchOrderBook(a.pair, 1),
            api.fetchOrderBook(b.pair, 1),
            api.fetchOrderBook(c.pair, 1)]);

        if ( ! orderBookA.asks[0] || ! orderBookA.bids[0] || ! orderBookB.asks[0] ||
            ! orderBookB.bids[0] || ! orderBookC.asks[0] || ! orderBookC.bids[0] ) {
            return;
        }

        a.quantity = (a.side === 'buy') ? orderBookA.asks[0][1] : orderBookA.bids[0][1];
        b.quantity = (b.side === 'buy') ? orderBookB.asks[0][1] : orderBookB.bids[0][1];
        c.quantity = (c.side === 'buy') ? orderBookC.asks[0][1] : orderBookC.bids[0][1];

        // logger.debug(`Updated triangle: ${JSON.stringify(triangle)}`);
    }
  }

  async getFreeAmount(exchange: types.IExchange, coin: string) {
    const balances = await this.getBalance(exchange);
    if (!balances) {
      return 0;
    }
    const asset = balances[coin];
    if (!asset) {
      logger.debug(`未查找到持有${coin}！！`);
      return 0;
    }
    return asset.free;
  }

  async createOrder(exchange: types.IExchange, order: types.IOrder): Promise<ccxt.Order | undefined> {
    const api = <ccxt.Exchange>exchange.endpoint.private;
    if (!api) {
      return;
    }


    if( exchange.id.toLowerCase() === 'hitbtc2' ) {
        order.amount = order.amount * 0.95;
    }

    // Check if there is enough balance
    let pairs: string[] = [];
    pairs = order.symbol.split('/');
    let freeAmount = 0;

    if (order.side === 'buy') {
        freeAmount = await this.getFreeAmount(exchange, pairs[1]);
        if (createOrderFailCount < 5 && freeAmount < order.amount * order.price) {
            logger.info(`createOrderFailCount: ${createOrderFailCount}`);
            createOrderFailCount++;
            await delay(1000);
            return await this.createOrder(exchange, order);
        } else if ( createOrderFailCount >= 5 ){
            createOrderFailCount = 0;
            logger.info(`Balance ${freeAmount} not enough for createOrder: ${JSON.stringify(order, null, 2)}`);
            return await api.createOrder(order.symbol, order.type, order.side, freeAmount / order.price, order.price);
        }
    } else {
        freeAmount = await this.getFreeAmount(exchange, pairs[0]);
        if (createOrderFailCount < 5 && freeAmount < order.amount) {
            createOrderFailCount++;
            await delay(1000);
            return await this.createOrder(exchange, order);
        } else if ( createOrderFailCount >= 5 ){
            createOrderFailCount = 0;
            logger.info(`Balance ${freeAmount} not enough for createOrder: ${order}`);
            return await api.createOrder(order.symbol, order.type, order.side, freeAmount, order.price);
        }
    }
    createOrderFailCount = 0;
    return await api.createOrder(order.symbol, order.type, order.side, order.amount, order.price);
  }

  async queryOrder(exchange: types.IExchange, orderId: string, symbol: string): Promise<ccxt.Order | undefined> {
    const api = <ccxt.Exchange>exchange.endpoint.private;
    if (!api) {
      return;
    }
    try {
        logger.info(`queryOrder(${orderId}, ${symbol})`);
        logger.info(`Exchange: ${JSON.stringify(exchange.id)}`);
        return await api.fetchOrder(orderId, symbol);
    } catch (err) {
        logger.error(`queryOrder exception: ` + err.message);
        logger.error(err.stack);
        return;
    }
  }

  async queryOrderForKucoin(exchange: types.IExchange, orderId: string, symbol: string, side: string): Promise<ccxt.Order | undefined> {
    const api = <ccxt.Exchange>exchange.endpoint.private;
    if (!api) {
      return;
    }
    try {
          logger.info(`queryOrderForKucoin(${orderId}, ${symbol})`);
          return await api.fetchOrder(orderId, symbol, { type: (side === 'buy' ? 'BUY' : 'SELL') });
    } catch (err) {
          logger.error(`queryOrder exception: ` + err.message);
          logger.error(err.stack);
          return;
    }
  }

  async queryOrderStatus(exchange: types.IExchange, orderId: string, symbol: string) {
    const api = <ccxt.Exchange>exchange.endpoint.private;
    if (!api) {
      return;
    }
    return await api.fetchOrderStatus(orderId, symbol);
  }
}
