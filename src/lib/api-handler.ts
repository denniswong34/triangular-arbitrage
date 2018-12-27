import * as ccxt from 'ccxt';
import * as types from './type';
import { Bitbank } from 'bitbank-handler';
import { logger, Helper } from './common';

export { ccxt };
export class ApiHandler {
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
  
  async refillTriangleQuantity (exchange: types.IExchange, triangle: Itriangle) {
	const api = <ccxt.Exchange>exchange.endpoint.private;
    if (!api) {
      return;
    }
	
	if(!a.quantity || !b.quantity || c.quantity)
	{
		const { a, b, c } = triangle;
		const {orderBookA, orderBookB, orderBookC} = await Promise.all([
													api.fetchOrderBook(a.pair, 1),
													api.fetchOrderBook(b.pair, 1),
													api.fetchOrderBook(c.pair, 1)]);
	
		a.quantity = (a.side === 'buy') ? orderBookA.asks[0][1] : orderBookA.bids[0][1];
		b.quantity = (b.side === 'buy') ? orderBookB.asks[0][1] : orderBookB.bids[0][1];
		c.quantity = (c.side === 'buy') ? orderBookC.asks[0][1] : orderBookC.bids[0][1];
	}
  }

  async getFreeAmount(exchange: types.IExchange, coin: string) {
    const balances = await this.getBalance(exchange);
    if (!balances) {
      return;
    }
    const asset = balances[coin];
    if (!asset) {
      logger.debug(`未查找到持有${coin}！！`);
      return;
    }
    return asset.free;
  }

  async createOrder(exchange: types.IExchange, order: types.IOrder): Promise<ccxt.Order | undefined> {
    const api = <ccxt.Exchange>exchange.endpoint.private;
    if (!api) {
      return;
    }
    return await api.createOrder(order.symbol, order.type, order.side, order.amount, order.price);
  }

  async queryOrder(exchange: types.IExchange, orderId: string, symbol: string): Promise<ccxt.Order | undefined> {
    const api = <ccxt.Exchange>exchange.endpoint.private;
    if (!api) {
      return;
    }
    return await api.fetchOrder(orderId, symbol);
  }

  async queryOrderStatus(exchange: types.IExchange, orderId: string, symbol: string) {
    const api = <ccxt.Exchange>exchange.endpoint.private;
    if (!api) {
      return;
    }
    return await api.fetchOrderStatus(orderId, symbol);
  }
}
