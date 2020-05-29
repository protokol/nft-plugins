import "jest-extended";

import { Application, Contracts } from "@arkecosystem/core-kernel";
import { Identifiers } from "@arkecosystem/core-kernel/src/ioc";
import { Wallets } from "@arkecosystem/core-state";
import passphrases from "@arkecosystem/core-test-framework/src/internal/passphrases.json";
import { TransactionHandler } from "@arkecosystem/core-transactions/src/handlers";
import { TransactionHandlerRegistry } from "@arkecosystem/core-transactions/src/handlers/handler-registry";
import { Interfaces, Transactions } from "@arkecosystem/crypto";
import { Builders } from "@protokol/nft-base-crypto";
import { Enums } from "@protokol/nft-base-crypto";
import { Interfaces as NFTInterfaces } from "@protokol/nft-base-crypto";

import { setMockTransaction } from "../__mocks__/transaction-repository";
import { buildWallet, initApp } from "../__support__/app";
import { NFTBaseInvalidAjvSchemaError } from "../../../src/errors";
import { NFTIndexers } from "../../../src/wallet-indexes";
import { collectionWalletCheck, deregisterTransactions } from "../utils/utils";

let app: Application;

let senderWallet: Contracts.State.Wallet;

let walletRepository: Contracts.State.WalletRepository;

let transactionHandlerRegistry: TransactionHandlerRegistry;

let handler: TransactionHandler;

let actual: Interfaces.ITransaction;

const nftCollectionAsset: NFTInterfaces.NFTCollectionAsset = {
    name: "Nft card",
    description: "Nft description",
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
};

beforeEach(() => {
    app = initApp();

    senderWallet = buildWallet(app, passphrases[0]);

    walletRepository = app.get<Wallets.WalletRepository>(Identifiers.WalletRepository);

    transactionHandlerRegistry = app.get<TransactionHandlerRegistry>(Identifiers.TransactionHandlerRegistry);

    handler = transactionHandlerRegistry.getRegisteredHandlerByType(
        Transactions.InternalTransactionType.from(
            Enums.NFTBaseTransactionTypes.NFTRegisterCollection,
            Enums.NFTBaseTransactionGroup,
        ),
        2,
    );
    walletRepository.index(senderWallet);

    actual = new Builders.NFTRegisterCollectionBuilder()
        .NFTRegisterCollectionAsset(nftCollectionAsset)
        .nonce("1")
        .sign(passphrases[0])
        .build();
});

afterEach(() => {
    deregisterTransactions();
});

describe("NFT Register collection tests", () => {
    describe("bootstrap tests", () => {
        it("should test bootstrap method", async () => {
            setMockTransaction(actual);

            await expect(handler.bootstrap()).toResolve();

            // @ts-ignore
            collectionWalletCheck(senderWallet, actual.id, 0, nftCollectionAsset);

            // @ts-ignore
            expect(walletRepository.findByIndex(NFTIndexers.CollectionIndexer, actual.id)).toStrictEqual(senderWallet);
        });
    });

    describe("throwIfCannotBeApplied tests", () => {
        it("should not throw", async () => {
            await expect(handler.throwIfCannotBeApplied(actual, senderWallet, walletRepository)).toResolve();
        });

        it("should throw NFTBaseInvalidAjvSchemaError", async () => {
            const actual = new Builders.NFTRegisterCollectionBuilder()
                .NFTRegisterCollectionAsset({
                    name: "Nft card",
                    description: "Nft description",
                    maximumSupply: 100,
                    jsonSchema: {
                        properties: {
                            string: { type: "something" },
                        },
                    },
                })
                .nonce("1")
                .sign(passphrases[0])
                .build();

            await expect(handler.throwIfCannotBeApplied(actual, senderWallet, walletRepository)).rejects.toThrowError(
                NFTBaseInvalidAjvSchemaError,
            );
        });
    });

    describe("apply tests", () => {
        it("should test apply method", async () => {
            await expect(handler.apply(actual, walletRepository)).toResolve();

            // @ts-ignore
            collectionWalletCheck(senderWallet, actual.id, 0, nftCollectionAsset);

            // @ts-ignore
            expect(walletRepository.findByIndex(NFTIndexers.CollectionIndexer, actual.id)).toStrictEqual(senderWallet);
        });
    });

    describe("revert tests", () => {
        it("should test revert method", async () => {
            await handler.apply(actual, walletRepository);

            await expect(handler.revert(actual, walletRepository)).toResolve();

            // @ts-ignore
            expect(senderWallet.getAttribute("nft.base.collections")[actual.id]).toBeUndefined();
            // @ts-ignore
            expect(walletRepository.getIndex(NFTIndexers.CollectionIndexer).get(actual.id)).toBeUndefined();
        });
    });
});