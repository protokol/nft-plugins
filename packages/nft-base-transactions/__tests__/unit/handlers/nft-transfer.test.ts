import "jest-extended";

import { Application, Contracts } from "@arkecosystem/core-kernel";
import { Identifiers } from "@arkecosystem/core-kernel/src/ioc";
import { Wallets } from "@arkecosystem/core-state";
import passphrases from "@arkecosystem/core-test-framework/src/internal/passphrases.json";
import { Mempool } from "@arkecosystem/core-transaction-pool";
import { TransactionHandler } from "@arkecosystem/core-transactions/src/handlers";
import { TransactionHandlerRegistry } from "@arkecosystem/core-transactions/src/handlers/handler-registry";
import { Identities, Transactions } from "@arkecosystem/crypto";
import { Builders } from "@protokol/nft-base-crypto";
import { Enums } from "@protokol/nft-base-crypto";

import { setMockTransaction } from "../__mocks__/transaction-repository";
import { buildWallet, initApp } from "../__support__/app";
import { NFTBaseTransferCannotBeApplied, NFTBaseTransferWalletDoesntOwnSpecifiedNftToken } from "../../../src/errors";
import { INFTTokens } from "../../../src/interfaces";
import { NFTIndexers } from "../../../src/wallet-indexes";
import { deregisterTransactions } from "../utils/utils";

let app: Application;

let senderWallet: Contracts.State.Wallet;
let recipientWallet: Contracts.State.Wallet;

let walletRepository: Contracts.State.WalletRepository;

let transactionHandlerRegistry: TransactionHandlerRegistry;

let nftTransferHandler: TransactionHandler;

beforeEach(() => {
    app = initApp();

    senderWallet = buildWallet(app, passphrases[0]);
    recipientWallet = buildWallet(app, passphrases[1]);

    walletRepository = app.get<Wallets.WalletRepository>(Identifiers.WalletRepository);

    transactionHandlerRegistry = app.get<TransactionHandlerRegistry>(Identifiers.TransactionHandlerRegistry);

    nftTransferHandler = transactionHandlerRegistry.getRegisteredHandlerByType(
        Transactions.InternalTransactionType.from(
            Enums.NFTBaseTransactionTypes.NFTTransfer,
            Enums.NFTBaseTransactionGroup,
        ),
        2,
    );
    walletRepository.index(senderWallet);
    walletRepository.index(recipientWallet);
});

afterEach(() => {
    deregisterTransactions();
});

describe("NFT Transfer tests", () => {
    describe("bootstrap tests", () => {
        it("should test bootstrap", async () => {
            const tokensWallet = senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds", {});
            tokensWallet["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"] = {};
            senderWallet.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);

            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: Identities.Address.fromPassphrase(passphrases[1]),
                })
                .nonce("1")
                .sign(passphrases[0])
                .build();

            setMockTransaction(actual);

            await expect(nftTransferHandler.bootstrap()).toResolve();

            expect(
                senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds")[
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"
                ],
            ).toBeUndefined();

            expect(
                recipientWallet.getAttribute<INFTTokens>("nft.base.tokenIds")[
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"
                ],
            ).toBeObject();

            expect(
                walletRepository.findByIndex(
                    NFTIndexers.NFTTokenIndexer,
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61",
                ),
            ).toStrictEqual(recipientWallet);
        });

        it("should test bootstrap resend to the same wallet", async () => {
            const tokensWallet = senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds", {});
            tokensWallet["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"] = {};
            senderWallet.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);

            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: Identities.Address.fromPassphrase(passphrases[0]),
                })
                .nonce("1")
                .sign(passphrases[0])
                .build();

            setMockTransaction(actual);
            await expect(nftTransferHandler.bootstrap()).toResolve();

            expect(
                senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds")[
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"
                ],
            ).toBeObject();

            expect(
                walletRepository.findByIndex(
                    NFTIndexers.NFTTokenIndexer,
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61",
                ),
            ).toStrictEqual(senderWallet);
        });
    });

    describe("throwIfCannotBeApplied tests", () => {
        it("should not throw", async () => {
            const tokensWallet = senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds", {});
            tokensWallet["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"] = {};
            senderWallet.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);

            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: Identities.Address.fromPassphrase(passphrases[0]),
                })
                .nonce("1")
                .sign(passphrases[0])
                .build();

            await expect(nftTransferHandler.throwIfCannotBeApplied(actual, senderWallet, walletRepository)).toResolve();
        });

        it("should throw NFTBaseTransferCannotBeApplied", async () => {
            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["9701560ba877d5552303cb54d10d461a0836a324649608a0a56c885b631b0434"],
                    recipientId: Identities.Address.fromPassphrase(passphrases[0]),
                })
                .nonce("1")
                .sign(passphrases[0])
                .build();

            await expect(
                nftTransferHandler.throwIfCannotBeApplied(actual, senderWallet, walletRepository),
            ).rejects.toThrowError(NFTBaseTransferCannotBeApplied);
        });

        it("should throw NFTBaseTransferWalletDoesntOwnSpecifiedNftToken", async () => {
            const tokensWallet = senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds", {});
            tokensWallet["c791bead8ee3a43faaa62d04ba4fce0d5df002f6493a2ad9af72b16bf66ad793"] = {};
            senderWallet.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);

            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: Identities.Address.fromPassphrase(passphrases[0]),
                })
                .nonce("1")
                .sign(passphrases[0])
                .build();
            await expect(
                nftTransferHandler.throwIfCannotBeApplied(actual, senderWallet, walletRepository),
            ).rejects.toThrowError(NFTBaseTransferWalletDoesntOwnSpecifiedNftToken);
        });
    });

    describe("throwIfCannotEnterPool", () => {
        it("should not throw", async () => {
            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: Identities.Address.fromPassphrase(passphrases[0]),
                })
                .nonce("1")
                .sign(passphrases[0])
                .build();
            await expect(nftTransferHandler.throwIfCannotEnterPool(actual)).toResolve();
        });

        it("should throw because transaction of specified nft is already in pool", async () => {
            const tokensWallet = senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds", {});
            tokensWallet["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"] = {};
            senderWallet.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);

            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: Identities.Address.fromPassphrase(passphrases[0]),
                })
                .nonce("1")
                .sign(passphrases[0])
                .build();
            await app.get<Mempool>(Identifiers.TransactionPoolMempool).addTransaction(actual);

            const actualTwo = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: Identities.Address.fromPassphrase(passphrases[0]),
                })
                .nonce("2")
                .sign(passphrases[0])
                .build();
            await expect(nftTransferHandler.throwIfCannotEnterPool(actualTwo)).rejects.toThrow();
        });
    });

    describe("apply test", () => {
        it("should test apply logic", async () => {
            const tokensWallet = senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds", {});
            tokensWallet["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"] = {};
            senderWallet.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);

            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: recipientWallet.address,
                })
                .nonce("3")
                .sign(passphrases[0])
                .build();

            await expect(nftTransferHandler.apply(actual, walletRepository)).toResolve();

            expect(
                senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds")[
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"
                ],
            ).toBeUndefined();

            expect(
                recipientWallet.getAttribute<INFTTokens>("nft.base.tokenIds")[
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"
                ],
            ).toBeObject();

            expect(
                walletRepository.findByIndex(
                    NFTIndexers.NFTTokenIndexer,
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61",
                ),
            ).toStrictEqual(recipientWallet);
        });

        it("should test apply logic for resend", async () => {
            const tokensWallet = senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds", {});
            tokensWallet["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"] = {};
            senderWallet.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);

            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: senderWallet.address,
                })
                .nonce("3")
                .sign(passphrases[0])
                .build();

            await expect(nftTransferHandler.apply(actual, walletRepository)).toResolve();

            expect(
                senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds")[
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"
                ],
            ).toBeObject();

            expect(
                walletRepository.findByIndex(
                    NFTIndexers.NFTTokenIndexer,
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61",
                ),
            ).toStrictEqual(senderWallet);
        });
    });

    describe("revert tests", () => {
        it("should test revert logic", async () => {
            const tokensWallet = senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds", {});
            tokensWallet["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"] = {};
            senderWallet.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);
            walletRepository.index(senderWallet);

            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: recipientWallet.address,
                })
                .nonce("3")
                .sign(passphrases[0])
                .build();

            await nftTransferHandler.apply(actual, walletRepository);
            await expect(nftTransferHandler.revert(actual, walletRepository)).toResolve();

            expect(
                senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds")[
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"
                ],
            ).toBeObject();

            expect(
                recipientWallet.getAttribute<INFTTokens>("nft.base.tokenIds")[
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"
                ],
            ).toBeUndefined();

            expect(
                walletRepository.findByIndex(
                    NFTIndexers.NFTTokenIndexer,
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61",
                ),
            ).toStrictEqual(senderWallet);
        });
        it("should test revert logic - resend", async () => {
            const tokensWallet = senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds", {});
            tokensWallet["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"] = {};
            senderWallet.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);
            walletRepository.index(senderWallet);

            const actual = new Builders.NFTTransferBuilder()
                .NFTTransferAsset({
                    nftIds: ["8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"],
                    recipientId: recipientWallet.address,
                })
                .nonce("3")
                .sign(passphrases[0])
                .build();

            await nftTransferHandler.apply(actual, walletRepository);
            await expect(nftTransferHandler.revert(actual, walletRepository)).toResolve();

            expect(
                senderWallet.getAttribute<INFTTokens>("nft.base.tokenIds")[
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61"
                ],
            ).toBeObject();
            expect(
                walletRepository.findByIndex(
                    NFTIndexers.NFTTokenIndexer,
                    "8527a891e224136950ff32ca212b45bc93f69fbb801c3b1ebedac52775f99e61",
                ),
            ).toStrictEqual(senderWallet);
        });
    });
});