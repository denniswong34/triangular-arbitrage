import * as types from '../type';
import { Rate } from '../rate';
import { Queue } from '../storage/queue';
import { BigNumber } from 'bignumber.js';
import * as bitbank from 'bitbank-handler';
import {logger} from './logger';
import { ApiHandler } from '../api-handler';

const ccxt = require('ccxt');
const config = require('config');
const excTime = require('execution-time');
const binance = require('binance');
const clc = require('cli-color');
const exchangeTickerBlackList: any = {'hitbtc2': ['BCH', 'GUSD']};

export class Helper {
  static getPrivateKey(exchangeId: types.ExchangeId) {
    if (config.account[exchangeId] && config.account[exchangeId].apiKey && config.account[exchangeId].secret) {
      return <types.ICredentials>{
        apiKey: config.account[exchangeId].apiKey,
        secret: config.account[exchangeId].secret,
      };
    }
  }

  static getExchange(exchangeId: types.ExchangeId): types.IExchange | undefined {
    const privateKey = Helper.getPrivateKey(exchangeId);
    switch (exchangeId) {
      case types.ExchangeId.Bitbank:
          if (privateKey) {
              return {
                  id: exchangeId,
                  endpoint: {
                      private: new bitbank.Bitbank({
                          apiKey: privateKey.apiKey,
                          apiSecret: privateKey.secret,
                      }),
                  },
              };
          }
          return {
              id: exchangeId,
              endpoint: {
                  public: new bitbank.Bitbank({}),
              },
          };
      case types.ExchangeId.KuCoin:
      case types.ExchangeId.Binance:
      default:
        let ws, rest;
        if (exchangeId === types.ExchangeId.Binance) {
          ws = new binance.BinanceWS();
          rest = new binance.BinanceRest({
            key: privateKey ? privateKey.apiKey : '',
            secret: privateKey ? privateKey.secret : '',
            timeout: 15000,
            recvWindow: 10000,
            disableBeautification: false,
            handleDrift: false,
          });
        }
        if (privateKey) {
          return {
            id: exchangeId,
            endpoint: {
              private: new ccxt[exchangeId](privateKey),
              ws,
              rest,
            },
          };
        }
        return {
          id: exchangeId,
          endpoint: {
            public: new ccxt[exchangeId](),
            ws,
            rest,
          },
        };

    }
  }

  static getMarketCoins(pairs: string[]) {
    const markets: string[] = [];
    pairs.reduce(
      (pre, pair) => {
        const market = pair.substr(pair.indexOf('/') + 1);
        if (market && !markets.includes(market)) {
          markets.push(market);
        }
      },
      <any>{},
    );
    return markets;
  }

  static changeBinanceTickers(tickers: types.Binance24HrTicker[], pairs: types.IPairs) {
    const allTickers: types.ITickers = {};
    const pairKeys = Object.keys(pairs);
    for (const pair of pairKeys) {
      const oTicker = tickers.find((ticker) => ticker.symbol === pair.replace('/', ''));
      if (oTicker) {
        allTickers[pair] = {
          ask: +oTicker.bestAskPrice,
          askVolume: +oTicker.bestAskQuantity,
          bid: +oTicker.bestBid,
          bidVolume: +oTicker.bestBidQuantity,
          symbol: pair,
          timestamp: oTicker.eventTime,
          datetime: '',
          high: +oTicker.high,
          low: +oTicker.low,
          info: {},
        };
      }
    }
    return allTickers;
  }

  /**
   * 获取排行数据
   * @param triangles 三角套利数组
   */
  static async getRanks(exchange: types.IExchange, triangles: types.ITriangle[]) {
    const ranks: types.IRank[] = [];
	let api = new ApiHandler();

	const balance = await api.getBalance(exchange);
	for (let i = 0; i < triangles.length; i++) {
		const tri : types.ITriangle = triangles[i];
		
		if (tri.rate <= 0) {
          continue;
        }
        const rate = new BigNumber(tri.rate);
        let fee = [0, 0];
        if (exchange.id === types.ExchangeId.Binance) {
          fee = [rate.times(0.1).toNumber(), rate.times(0.05).toNumber()];
        }
        const clcRate = tri.rate < 0 ? clc.redBright(tri.rate) : clc.greenBright(tri.rate);
        const profitRate = [rate.minus(fee[0]), rate.minus(fee[1])];

        // check if it has available balance
        const asset = (tri.a.side === 'buy' ? balance[tri.a.coinFrom] : balance[tri.a.coinTo]);
        if (!asset) {
            logger.info(`Remove Path(No available balance) ：${clc.cyanBright(tri.id)} Rate: ${clcRate}`);
            continue;
        }

        if (profitRate[0].isLessThan(config.arbitrage.minRateProfit)) {
			logger.info(`Remove Path(ProfitRate Too Less) ：${clc.cyanBright(tri.id)} Rate: ${clcRate}`);
			continue;
        }

        if(exchangeTickerBlackList[exchange.id] && (exchangeTickerBlackList[exchange.id].indexOf(tri.a.coinFrom) !== -1 ||
            exchangeTickerBlackList[exchange.id].indexOf(tri.b.coinFrom) !== -1 ||
            exchangeTickerBlackList[exchange.id].indexOf(tri.c.coinFrom) !== -1)
        ) {
            logger.info(`Remove Path(Ticker Blacklist) ：${clc.cyanBright(tri.id)} Rate: ${clcRate}`);
            continue;
        }
		
		//Refill triangle quantity
		await api.refillTriangleQuantity(exchange, tri);
		tri.a.amountInUSD = ((tri.a.side === 'buy') ? await api.getTickerFromCMC(tri.a.coinFrom + "/USD") : await api.getTickerFromCMC(tri.b.coinFrom + "/USD")) * tri.a.quantity * tri.a.price;
		tri.b.amountInUSD = ((tri.b.side === 'buy') ? await api.getTickerFromCMC(tri.b.coinFrom + "/USD") : await api.getTickerFromCMC(tri.c.coinFrom + "/USD")) * tri.b.quantity * tri.b.price;
		tri.c.amountInUSD = ((tri.c.side === 'buy') ? await api.getTickerFromCMC(tri.c.coinFrom + "/USD") : await api.getTickerFromCMC(tri.a.coinFrom + "/USD")) * tri.c.quantity * tri.c.price;
		
		//logger.debug(`Triangle after refill quantity and USD Value: ${JSON.stringify(tri)}`);
		let minAmountInUSD = Math.min(tri.a.amountInUSD, tri.b.amountInUSD, tri.c.amountInUSD);
		tri.minAmountInUSD = minAmountInUSD;
		
		if(!minAmountInUSD || minAmountInUSD < config.arbitrage.minProfitInUSD) {
			//logger.debug(`Triangle removed due to minAmountInUSD (${minAmountInUSD}) is less than ${config.arbitrage.minProfitInUSD}`);
			logger.info(`Remove Path(USD Too Less) ：${clc.cyanBright(tri.id)} Rate: ${clcRate} minAmountInUSD: (${minAmountInUSD})`);
			continue;
		}
			
        const rank: types.IRank = {
		  triangle: tri,
          stepA: tri.a.coinFrom,
          stepB: tri.b.coinFrom,
          stepC: tri.c.coinFrom,
          rate: rate.toNumber(),
          fee: [fee[0], fee[1]],
          profitRate: [profitRate[0].toNumber(), profitRate[1].toNumber()],
          ts: tri.ts,
        };
        ranks.push(rank);
		logger.info(`PUSH Path to Ranks  ：${clc.greenBright(tri.id)} Rate: ${clcRate} minAmountInUSD: (${minAmountInUSD})`);
	}
	logger.info(`Ranks size after reduce: ${ranks.length}`);
    return ranks;
  }

  static toFixed(val: BigNumber, precision: number = 8) {
    return val.toFixed(precision);
  }

  static getTriangleRate(a: types.IEdge, b: types.IEdge, c: types.IEdge) {
    // Rate = (1/priceA/priceB*priceC-1)-1
    // 资本金
      /*
      logger.debug("getTriangleRate...");
      logger.debug("A:" + JSON.stringify(a, null, 2));
      logger.debug("B:" + JSON.stringify(b, null, 2));
      logger.debug("C:" + JSON.stringify(c, null, 2));
      */
    const capital = new BigNumber(1);
    let step1Rate = new BigNumber(a.price);
    if (a.side === 'buy') {
      step1Rate = capital.div(a.price);
    }

    let step2Rate = step1Rate.times(b.price);
    if (b.side === 'buy') {
      step2Rate = step1Rate.div(b.price);
    }

    let step3Rate = step2Rate.times(c.price);
    if (c.side === 'buy') {
      step3Rate = step2Rate.div(c.price);
    }

    return +step3Rate
      .minus(1)
      .times(100)
      .toFixed(8);
  }

  static getTimer() {
    const timer = excTime();
    timer.start();
    return timer;
  }

  static endTimer(timer: any) {
    return timer.stop().words;
  }

  /**
   * 获取价格精度
   */
  static getPriceScale(pairs: types.IPairs, pairName: string): types.IPrecision | undefined {
    const symbol = pairs[pairName];
    if (!symbol) {
      logger.debug(`Symbol is null in getPriceScale.. Pairs: ` + JSON.stringify(pairs) + `, pairName: ` + pairName);
      return;
    }
    logger.debug(`Symbol: ` + JSON.stringify(symbol, null, 2));

    const precision = symbol.precision.amount ? symbol.precision.amount : 8;
    const selfCalCost = parseFloat((((symbol.limits.price.min ? symbol.limits.price.min :
        symbol.limits.amount.min * symbol.info.low)).toFixed(precision)));
    logger.info(`selfCalCost: ${selfCalCost}`);
    return {
      amount: symbol.precision.amount,
      price: symbol.precision.price,
      cost: symbol.limits.cost ?
              symbol.limits.cost.min ? symbol.limits.cost.min : selfCalCost :
                selfCalCost,
    };
  }

  /**
   * 获取基础货币交易额度
   */
  static getBaseTradeAmount(tradeAmount: BigNumber, freeAmount: BigNumber) {
    // 如果A点交易额 x 50% < 该资产可用额度
    if (tradeAmount.times(0.5).isLessThan(freeAmount)) {
      // 返回交易额 x 50%
      return tradeAmount.times(0.5);
    }
    // 返回可用额度 x 50%
    return freeAmount.times(0.5);
  }

  /**
   * 获取基础货币交易额度
   */
  static getBaseAmountByBC(triangle: types.ITriangle, freeAmount: BigNumber, minAmount: BigNumber) {
    const { a, b, c } = triangle;

	const aAmount = (a.side == "sell") ? new BigNumber(a.quantity) : new BigNumber((a.quantity * a.price).toFixed(8));
	logger.info(`A点的数量: ${aAmount} ${a.coinFrom}`);
	
    // B点的数量
    const bAmount = Helper.convertAmount(b.price, b.quantity, b.side);
	//logger.info(`B点的数量: ${bAmount}`);

    // 换回A点的数量
    const b2aAmount = Helper.convertAmount(a.price, bAmount.toNumber(), a.side);
	logger.info(`B换回A点的数量: ${b2aAmount}  ${a.coinFrom}`);
    // c点数量
    const c2aAmount = Helper.getConvertedAmount({
      side: triangle.c.side,
      exchangeRate: triangle.c.price,
      amount: triangle.c.quantity,
    })
	logger.info(`C换回A数量: ${c2aAmount}  ${a.coinFrom}`);

    // 选取数量最大的
	const amountList = [aAmount, b2aAmount, c2aAmount, freeAmount];
	amountList.sort(function(a, b){return a.minus(b).toNumber()});
	
	const minAvailableAmount = amountList[0];
	logger.info(`选取数量最小的: ${minAvailableAmount}  ${a.coinFrom}`);
	logger.info(`minAmount: ${minAmount}  ${a.coinFrom}`);
	logger.info(`freeAmount: ${freeAmount}  ${a.coinFrom}`);
	
    // 选取数量 > 最小交易量 && 选取数量 < 可用余额
    //if (thanAmount.isGreaterThan(minAmount) && thanAmount.isLessThan(freeAmount)) {
    //  return thanAmount;
    //}
    return (a.side === "buy") ? minAvailableAmount.dividedBy(new BigNumber(a.price)) : minAvailableAmount;
  }

  /**
   * 获取转换后的数量
   */
  static getConvertedAmount(rateQuote: types.IRateQuote) {
    return Rate.convert(rateQuote);
  }

  /**
   * 转换获取指定总价（标的货币数量）时，需要的交易数量
   * @param price 价格
   * @param cost 总价
   * @param side 方向
   */
  static convertAmount(price: number, cost: number, side: 'sell' | 'buy') {
    return Rate.convertAmount(price, cost, side);
  }

  /**
   * 检查交易队列是否超过限制
   */
  static async checkQueueLimit(queue: Queue) {
    const res = await queue.info();
    if (res && res.doc_count < config.trading.limit) {
      return true;
    }
    return false;
  }
}
