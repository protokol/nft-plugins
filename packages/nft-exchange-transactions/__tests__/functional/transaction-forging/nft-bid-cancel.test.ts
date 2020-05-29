import "@arkecosystem/core-test-framework/src/matchers";

import { Contracts } from "@arkecosystem/core-kernel";
import secrets from "@arkecosystem/core-test-framework/src/internal/passphrases.json";
import { snoozeForBlock } from "@arkecosystem/core-test-framework/src/utils";
import { Utils } from "@arkecosystem/crypto";
import { NFTBaseTransactionFactory } from "@protokol/nft-base-transactions/__tests__/functional/transaction-forging/__support__/transaction-factory";

import * as support from "./__support__";
import { NFTExchangeTransactionFactory } from "./__support__/transaction-factory";

let app: Contracts.Kernel.Application;
beforeAll(async () => (app = await support.setUp()));
afterAll(async () => await support.tearDown());

describe("NFT Cancel Bid functional tests", () => {
    describe("Signed with one passphrase", () => {
        it("should broadcast, accept and forge it [Signed with 1 Passphrase]", async () => {
            const nftRegisteredCollection = NFTBaseTransactionFactory.initialize(app)
                .NFTRegisterCollection({
                    name: "Nft card",
                    description: "Nft card description",
                    maximumSupply: 100,
                    jsonSchema: {
                        properties: {
                            name: {
                                type: "string",
                            },
                            damage: {
                                type: "integer",
                            },
                            health: {
                                type: "integer",
                            },
                            mana: {
                                type: "integer",
                            },
                        },
                    },
                })
                .withPassphrase(secrets[0])
                .createOne();

            await expect(nftRegisteredCollection).toBeAccepted();
            await snoozeForBlock(1);
            await expect(nftRegisteredCollection.id).toBeForged();

            const nftCreate = NFTBaseTransactionFactory.initialize(app)
                .NFTCreate({
                    // @ts-ignore
                    collectionId: nftRegisteredCollection.id,
                    attributes: {
                        name: "card name",
                        damage: 3,
                        health: 2,
                        mana: 2,
                    },
                })
                .withPassphrase(secrets[0])
                .createOne();

            await expect(nftCreate).toBeAccepted();
            await snoozeForBlock(1);
            await expect(nftCreate.id).toBeForged();

            const nftSellOffer = NFTExchangeTransactionFactory.initialize(app)
                .NFTAuction({
                    expiration: {
                        blockHeight: 27,
                    },
                    startAmount: Utils.BigNumber.make("1"),
                    nftId: nftCreate.id,
                })
                .withPassphrase(secrets[0])
                .createOne();

            await expect(nftSellOffer).toBeAccepted();
            await snoozeForBlock(1);
            await expect(nftSellOffer.id).toBeForged();

            const nftBid = NFTExchangeTransactionFactory.initialize(app)
                .NFTBid({
                    // @ts-ignore
                    auctionId: nftSellOffer.id,
                    bidAmount: Utils.BigNumber.make("2"),
                })
                .withPassphrase(secrets[1])
                .createOne();

            await expect(nftBid).toBeAccepted();
            await snoozeForBlock(1);
            await expect(nftBid.id).toBeForged();

            const nftCancelBid = NFTExchangeTransactionFactory.initialize(app)
                .NFTBidCancel({
                    bidId: nftBid.id,
                })
                .withPassphrase(secrets[1])
                .createOne();

            await expect(nftCancelBid).toBeAccepted();
            await snoozeForBlock(1);
            await expect(nftCancelBid.id).toBeForged();
        });
    });
});