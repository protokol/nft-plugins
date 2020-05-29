import Hapi from "@hapi/hapi";
import Joi from "@hapi/joi";

import { BidsController } from "../controllers/bids";

export const register = (server: Hapi.Server): void => {
    const controller = server.app.app.resolve(BidsController);
    server.bind(controller);

    server.route({
        method: "GET",
        path: "/bids",
        handler: controller.index,
        options: {
            validate: {
                query: Joi.object({
                    ...server.app.schemas.pagination,
                    ...{
                        orderBy: server.app.schemas.orderBy,
                        transform: Joi.bool().default(true),
                    },
                }),
            },
        },
    });

    server.route({
        method: "GET",
        path: "/bids/{id}",
        handler: controller.show,
        options: {
            validate: {
                params: Joi.object({
                    id: Joi.string().hex().length(64),
                }),
            },
        },
    });

    server.route({
        method: "GET",
        path: "/bids/{id}/wallets",
        handler: controller.showAuctionWallet,
        options: {
            validate: {
                params: Joi.object({
                    id: Joi.string().hex().length(64),
                }),
            },
        },
    });

    server.route({
        method: "POST",
        path: "/bids/search",
        handler: controller.search,
        options: {
            validate: {
                query: Joi.object({
                    ...server.app.schemas.pagination,
                    orderBy: server.app.schemas.orderBy,
                }),
                payload: Joi.object({
                    senderPublicKey: Joi.string().hex().length(66).optional(),
                    auctionId: Joi.string().hex().length(64).optional(),
                    bidAmount: Joi.string().optional(),
                }),
            },
        },
    });

    server.route({
        method: "GET",
        path: "/bids/canceled",
        handler: controller.indexCanceled,
        options: {
            validate: {
                query: Joi.object({
                    ...server.app.schemas.pagination,
                    orderBy: server.app.schemas.orderBy,
                }),
            },
        },
    });

    server.route({
        method: "GET",
        path: "/bids/canceled/{id}",
        handler: controller.showAuctionCanceled,
        options: {
            validate: {
                params: Joi.object({
                    id: Joi.string().hex().length(64),
                }),
            },
        },
    });
};