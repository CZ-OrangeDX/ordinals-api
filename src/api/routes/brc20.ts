import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  AddressParam,
  Brc20BalanceResponseSchema,
  Brc20HolderResponseSchema,
  Brc20TickerParam,
  Brc20TickersParam,
  Brc20TokenDetailsSchema,
  Brc20TokenResponseSchema,
  LimitParam,
  NotFoundResponse,
  OffsetParam,
  PaginatedResponse,
} from '../schemas';
import {
  DEFAULT_API_LIMIT,
  parseBrc20Balances,
  parseBrc20Holders,
  parseBrc20Supply,
  parseBrc20Tokens,
} from '../util/helpers';
import { Value } from '@sinclair/typebox/value';
import { handleInscriptionTransfersCache } from '../util/cache';

export const Brc20Routes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.addHook('preHandler', handleInscriptionTransfersCache);

  fastify.get(
    '/brc-20/tokens',
    {
      schema: {
        operationId: 'getBrc20Tokens',
        summary: 'BRC-20 Tokens',
        description: 'Retrieves information for BRC-20 tokens',
        tags: ['BRC-20'],
        querystring: Type.Object({
          ticker: Type.Optional(Brc20TickersParam),
          // Pagination
          offset: Type.Optional(OffsetParam),
          limit: Type.Optional(LimitParam),
        }),
        response: {
          200: PaginatedResponse(Brc20TokenResponseSchema, 'Paginated BRC-20 Token Response'),
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? DEFAULT_API_LIMIT;
      const offset = request.query.offset ?? 0;
      const response = await fastify.db.getBrc20Tokens({
        limit,
        offset,
        ticker: request.query.ticker,
      });
      await reply.send({
        limit,
        offset,
        total: response.total,
        results: parseBrc20Tokens(response.results),
      });
    }
  );

  fastify.get(
    '/brc-20/tokens/:ticker',
    {
      schema: {
        operationId: 'getBrc20TokenDetails',
        summary: 'BRC-20 Token Details',
        description: 'Retrieves information for a BRC-20 token including supply and holders',
        tags: ['BRC-20'],
        params: Type.Object({
          ticker: Brc20TickerParam,
        }),
        response: {
          200: Brc20TokenDetailsSchema,
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      await fastify.db.sqlTransaction(async sql => {
        const token = await fastify.db.getBrc20Tokens({
          limit: 1,
          offset: 0,
          ticker: [request.params.ticker],
        });
        if (!token) {
          await reply.code(404).send(Value.Create(NotFoundResponse));
          return;
        }
        const supply = await fastify.db.getBrc20TokenSupply({ ticker: request.params.ticker });
        if (!supply) {
          await reply.code(404).send(Value.Create(NotFoundResponse));
          return;
        }
        await reply.send({
          token: parseBrc20Tokens(token.results)[0],
          supply: parseBrc20Supply(supply),
        });
      });
    }
  );

  fastify.get(
    '/brc-20/tokens/:ticker/holders',
    {
      schema: {
        operationId: 'getBrc20TokenHolders',
        summary: 'BRC-20 Token Holders',
        description: 'Retrieves a list of holders and their balances for a BRC-20 token',
        tags: ['BRC-20'],
        params: Type.Object({
          ticker: Brc20TickerParam,
        }),
        querystring: Type.Object({
          // Pagination
          offset: Type.Optional(OffsetParam),
          limit: Type.Optional(LimitParam),
        }),
        response: {
          200: PaginatedResponse(Brc20HolderResponseSchema, 'Paginated BRC-20 Holders Response'),
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? DEFAULT_API_LIMIT;
      const offset = request.query.offset ?? 0;
      const holders = await fastify.db.getBrc20TokenHolders({
        limit,
        offset,
        ticker: request.params.ticker,
      });
      if (!holders) {
        await reply.code(404).send(Value.Create(NotFoundResponse));
        return;
      }
      await reply.send({
        limit,
        offset,
        total: holders.total,
        results: parseBrc20Holders(holders.results),
      });
    }
  );

  fastify.get(
    '/brc-20/balances/:address',
    {
      schema: {
        operationId: 'getBrc20Balances',
        summary: 'BRC-20 Balances',
        description: 'Retrieves BRC-20 token balances for a Bitcoin address',
        tags: ['BRC-20'],
        params: Type.Object({
          address: AddressParam,
        }),
        querystring: Type.Object({
          ticker: Type.Optional(Brc20TickersParam),
          // Pagination
          offset: Type.Optional(OffsetParam),
          limit: Type.Optional(LimitParam),
        }),
        response: {
          200: PaginatedResponse(Brc20BalanceResponseSchema, 'Paginated BRC-20 Balance Response'),
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? DEFAULT_API_LIMIT;
      const offset = request.query.offset ?? 0;
      const balances = await fastify.db.getBrc20Balances({
        limit,
        offset,
        address: request.params.address,
        ticker: request.query.ticker,
      });
      await reply.send({
        limit,
        offset,
        total: balances.total,
        results: parseBrc20Balances(balances.results),
      });
    }
  );

  done();
};
