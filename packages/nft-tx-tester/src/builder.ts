import * as MagistrateCrypto from "@arkecosystem/core-magistrate-crypto";
import { Crypto, Enums, Identities, Managers, Transactions, Utils } from "@arkecosystem/crypto";

import { builders } from "./builders";
import { config } from "./config/config";
import { WalletSignType } from "./enums";
import { App, ExtendedWallet, WalletChange } from "./types";
import assert = require("assert");

const multiSignatureAddress = () => {
    return {
        publicKey: Identities.PublicKey.fromMultiSignatureAsset({
            min: config.multiSignature.asset.min,
            publicKeys: config.multiSignature.asset.participants.map((passphrase) =>
                Identities.PublicKey.fromPassphrase(passphrase),
            ),
        }),
        address: Identities.Address.fromMultiSignatureAsset({
            min: config.multiSignature.asset.min,
            publicKeys: config.multiSignature.asset.participants.map((passphrase) =>
                Identities.PublicKey.fromPassphrase(passphrase),
            ),
        }),
    };
};

const sign = (builder, passphrase) => {
    if (!config.ecdsa) {
        builder.sign(passphrase);
    } else {
        const buffer = Transactions.Utils.toHash(builder.data, {
            excludeSignature: true,
            excludeSecondSignature: true,
        });

        builder.data.signature = Crypto.Hash.signECDSA(buffer, Identities.Keys.fromPassphrase(passphrase));
    }
};

const secondSign = (builder, passphrase) => {
    if (!config.ecdsa) {
        builder.secondSign(passphrase);
    } else {
        const buffer = Transactions.Utils.toHash(builder.data, {
            excludeSecondSignature: true,
        });

        builder.data.secondSignature = Crypto.Hash.signECDSA(buffer, Identities.Keys.fromPassphrase(passphrase));
    }
};

const configureCrypto = async (app) => {
    // @ts-ignore
    Managers.configManager.setFromPreset(config.network);

    try {
        const height = await app.client.retrieveHeight();

        Managers.configManager.setHeight(height);
    } catch (ex) {
        console.log("configureCrypto: " + ex.message);
        process.exit();
    }
};

export class Builder {
    public constructor(private app: App) {}

    public async buildTransaction(type: number, quantity: number, splitInput: string[]) {
        await configureCrypto(this.app);

        const { builder } = builders[type];
        if (!builder) {
            throw new Error("Unknown type");
        }

        const walletChanges: WalletChange[] = [];

        let senderWallet = (config.passphrase
            ? this.app.walletRepository.getWallet(config.passphrase as any)
            : this.app.walletRepository.getRandomWallet()) as ExtendedWallet;

        const recipientWallet = (config.recipientId
            ? this.app.walletRepository.getWallet(config.recipientId as any)
            : this.app.walletRepository.getRandomWallet()) as ExtendedWallet;
        const recipientId = recipientWallet.address;

        senderWallet = {
            ...senderWallet,
            ...(await this.app.client.retrieveSenderWallet(Identities.Address.fromPublicKey(senderWallet.publicKey))),
        };

        const transactions = [];

        for (let i = 0; i < quantity; i++) {
            let nonce = this.app.nonces[senderWallet.publicKey];
            if (!nonce) {
                let senderNonce = senderWallet.nonce;
                if (config.multiSignature.enabled) {
                    senderNonce = (await this.app.client.retrieveSenderWallet(multiSignatureAddress().address)).nonce;
                }

                nonce = Utils.BigNumber.make(config.startNonce || senderNonce || 0).plus(1);
            } else {
                nonce = nonce.plus(1);
            }
            this.app.nonces[senderWallet.publicKey] = nonce;

            const transaction = builder().nonce(nonce.toFixed()).senderPublicKey(senderWallet.publicKey);

            if (config.fee) {
                transaction.fee(config.fee);
            }

            if (type === Enums.TransactionType.Transfer) {
                transaction.recipientId(recipientId);
                transaction.amount(config.amount);
                transaction.expiration(config.expiration || 0);
            } else if (type === Enums.TransactionType.SecondSignature) {
                const secondPassphrase = config.secondPassphrase || "second passphrase";
                transaction.signatureAsset(secondPassphrase);

                walletChanges.push({
                    transaction: transaction,
                    address: senderWallet.address,
                    publicKey: undefined || "", // TODO
                    secondPassphrase: config.secondPassphrase || "second passphrase",
                });
            } else if (type === Enums.TransactionType.DelegateRegistration) {
                const username = config.delegateName || `delegate.${senderWallet.publicKey.slice(0, 10)}`;
                transaction.usernameAsset(username);
            } else if (type === Enums.TransactionType.Vote) {
                if (config.vote) {
                    transaction.votesAsset([`+${config.vote}`]);
                } else if (config.unvote) {
                    transaction.votesAsset([`-${config.unvote}`]);
                } else {
                    if (senderWallet.vote) {
                        transaction.votesAsset([`-${senderWallet.vote}`]);
                    } else {
                        transaction.votesAsset([`+${senderWallet.publicKey}`]);
                    }
                }
            } else if (type === Enums.TransactionType.MultiSignature && Managers.configManager.getMilestone().aip11) {
                for (const passphrase of config.multiSignature.asset.participants) {
                    transaction.participant(Identities.PublicKey.fromPassphrase(passphrase));
                }

                transaction.min(config.multiSignature.asset.min);

                const multiSignatureAddress = Identities.Address.fromMultiSignatureAsset(
                    transaction.data.asset.multiSignature,
                );
                console.log(`Created MultiSignature address: ${multiSignatureAddress}`);
                transaction.senderPublicKey(senderWallet.publicKey);

                const participants = config.multiSignature.asset.participants;
                for (let i = 0; i < participants.length; i++) {
                    transaction.multiSign(participants[i], i);
                }

                walletChanges.push({
                    transaction: transaction,
                    address: multiSignatureAddress,
                    passphrases: config.multiSignature.asset.participants,
                    publicKey: Identities.PublicKey.fromMultiSignatureAsset(transaction.data.asset.multiSignature),
                });
            } else if (type === Enums.TransactionType.Ipfs && Managers.configManager.getMilestone().aip11) {
                transaction.ipfsAsset(config.ipfs);
            } else if (type === Enums.TransactionType.MultiPayment && Managers.configManager.getMilestone().aip11) {
                let payments;
                if (!config.multiPayments || config.multiPayments.length === 0) {
                    payments = [];
                    const count = Math.floor(Math.random() * (128 - 64 + 1) + 64);
                    for (let i = 0; i < count; i++) {
                        payments.push({
                            recipientId: this.app.walletRepository.getRandomWallet().address,
                            amount: "1",
                        });
                    }
                } else {
                    payments = config.multiPayments;
                }

                for (const payment of payments) {
                    transaction.addPayment(payment.recipientId, payment.amount);
                }
            } else if (
                type === Enums.TransactionType.DelegateResignation &&
                Managers.configManager.getMilestone().aip11
            ) {
            } else if (type === Enums.TransactionType.HtlcLock && Managers.configManager.getMilestone().aip11) {
                transaction.recipientId(recipientId);
                transaction.amount(config.amount);

                if (config.htlc.lock.expiration.type === Enums.HtlcLockExpirationType.EpochTimestamp) {
                    const networktime = await this.app.client.retrieveNetworktime();
                    if (config.htlc.lock.expiration.value < networktime) {
                        config.htlc.lock.expiration.value += networktime;
                    }
                }

                transaction.htlcLockAsset(config.htlc.lock);
            } else if (type === Enums.TransactionType.HtlcClaim && Managers.configManager.getMilestone().aip11) {
                const claim = config.htlc.claim;
                const lockTransactionId =
                    claim.lockTransactionId ||
                    (await this.app.client.retrieveTransaction(senderWallet.publicKey, 8))[0].id;

                transaction.htlcClaimAsset({ ...claim, lockTransactionId });
            } else if (type === Enums.TransactionType.HtlcRefund && Managers.configManager.getMilestone().aip11) {
                const refund = config.htlc.refund;
                const lockTransactionId =
                    refund.lockTransactionId ||
                    (await this.app.client.retrieveTransaction(senderWallet.publicKey, 8))[0].id;

                transaction.htlcRefundAsset({ lockTransactionId });
            } else if (type === 11 && Managers.configManager.getMilestone().aip11) {
                // Entity
                const EntityType = MagistrateCrypto.Enums.EntityType;
                const EntitySubType = MagistrateCrypto.Enums.EntitySubType;
                const mapTypeAndSubtype = {
                    business: { type: EntityType.Business, subType: EntitySubType.None },
                    bridgechain: { type: EntityType.Bridgechain, subType: EntitySubType.None },
                    developer: { type: EntityType.Developer, subType: EntitySubType.None },
                    "plugin-core": { type: EntityType.Plugin, subType: EntitySubType.PluginCore },
                    "plugin-desktop": { type: EntityType.Plugin, subType: EntitySubType.PluginDesktop },
                };
                const mapAction = {
                    register: { action: MagistrateCrypto.Enums.EntityAction.Register },
                    update: { action: MagistrateCrypto.Enums.EntityAction.Update },
                    resign: { action: MagistrateCrypto.Enums.EntityAction.Resign },
                };
                const entityAsset = {
                    ...mapTypeAndSubtype[splitInput[2]],
                    ...mapAction[splitInput[3]],
                    data: {},
                };
                if (entityAsset.action === MagistrateCrypto.Enums.EntityAction.Register) {
                    entityAsset.data.name = splitInput[4];
                    entityAsset.data.ipfsData = splitInput[5];
                } else if (entityAsset.action === MagistrateCrypto.Enums.EntityAction.Update) {
                    entityAsset.registrationId = splitInput[4];
                    entityAsset.data.ipfsData = splitInput[5];
                } else if (entityAsset.action === MagistrateCrypto.Enums.EntityAction.Resign) {
                    entityAsset.registrationId = splitInput[4];
                }
                transaction.asset(entityAsset);
            } else if (type === 12 && Managers.configManager.getMilestone().aip11) {
                // NFTRegisterCollection
                transaction.NFTRegisterCollectionAsset(config.nft.registerCollection);
            } else if (type === 13 && Managers.configManager.getMilestone().aip11) {
                // NFTCreateToken
                const createAsset = { ...config.nft.createAsset };
                if (!createAsset.collectionId) {
                    if (!senderWallet.attributes.nft?.base?.collections) {
                        throw new Error("Wallet doesn't have any collections");
                    }
                    createAsset.collectionId = Object.keys(senderWallet.attributes.nft.base.collections)[0];
                }
                transaction.NFTCreateToken(createAsset);
            } else if (type === 14 && Managers.configManager.getMilestone().aip11) {
                // NFTTransferAsset
                const transferAsset = { ...config.nft.transferAsset };
                if (!transferAsset.nftIds?.length) {
                    if (
                        !senderWallet.attributes.nft?.base?.tokenIds ||
                        !Object.keys(senderWallet.attributes.nft.base.tokenIds).length
                    ) {
                        throw new Error("Wallet doesn't own any assets");
                    }

                    // @ts-ignore
                    transferAsset.nftIds = [Object.keys(senderWallet.attributes.nft.base.tokenIds)[i]];
                }

                if (!transferAsset.recipientId) {
                    transferAsset.recipientId = recipientId;
                }
                transaction.NFTTransferAsset(transferAsset);
            } else if (type === 15 && Managers.configManager.getMilestone().aip11) {
                // NFTBurnAsset
                const burnAsset = { ...config.nft.burnAsset };
                if (!burnAsset.nftId) {
                    if (
                        !senderWallet.attributes.nft?.base?.tokenIds ||
                        !Object.keys(senderWallet.attributes.nft.base.tokenIds).length
                    ) {
                        throw new Error("Wallet doesn't own any assets");
                    }

                    burnAsset.nftId = Object.keys(senderWallet.attributes.nft.base.tokenIds)[i];
                }

                transaction.NFTBurnAsset(burnAsset);
            } else if (type === 16 && Managers.configManager.getMilestone().aip11) {
                // NFTAuctionAsset
                const auctionAsset = { ...config.nft.auctionAsset };
                if (!auctionAsset.nftIds?.length) {
                    if (
                        !senderWallet.attributes.nft?.base?.tokenIds ||
                        !Object.keys(senderWallet.attributes.nft.base.tokenIds).length
                    ) {
                        throw new Error("Wallet doesn't own any assets");
                    }

                    // @ts-ignore
                    auctionAsset.nftIds = [Object.keys(senderWallet.attributes.nft.base.tokenIds)[i]];
                }

                transaction.NFTAuctionAsset(auctionAsset);
            } else if (type === 17 && Managers.configManager.getMilestone().aip11) {
                // NFTCancelAuctionAsset
                const cancelAuction = { ...config.nft.cancelAuction };
                if (!cancelAuction.auctionId) {
                    if (
                        !senderWallet.attributes.nft?.exchange?.auctions ||
                        !Object.keys(senderWallet.attributes.nft.exchange.auctions).length
                    ) {
                        throw new Error("Wallet doesn't own any auctions");
                    }

                    cancelAuction.auctionId = Object.keys(senderWallet.attributes.nft.exchange.auctions)[i];
                }

                transaction.NFTAuctionCancelAsset(cancelAuction);
            } else if (type === 18 && Managers.configManager.getMilestone().aip11) {
                // NFTBidAsset
                const bidAsset = { ...config.nft.bidAsset };
                if (!bidAsset.auctionId) {
                    if (
                        !recipientWallet.attributes.nft?.exchange?.auctions ||
                        !Object.keys(recipientWallet.attributes.nft.exchange.auctions).length
                    ) {
                        throw new Error("Wallet doesn't own any auctions");
                    }

                    bidAsset.auctionId = Object.keys(recipientWallet.attributes.nft.exchange.auctions)[i];
                }

                // set different bid amount for multiple bids
                bidAsset.bidAmount += i;

                transaction.NFTBidAsset(bidAsset);
            } else if (type === 19 && Managers.configManager.getMilestone().aip11) {
                // NFTCancelBidAsset
                const cancelBidAsset = { ...config.nft.cancelBidAsset };
                if (!cancelBidAsset.bidId) {
                    const bids = await this.app.client.retrieveBidsByPublicKey(senderWallet.publicKey);
                    if (!bids.length) {
                        throw new Error("Wallet doesn't have any bids");
                    }

                    cancelBidAsset.bidId = bids[i].id;
                }

                transaction.NFTBidCancelAsset(cancelBidAsset);
            } else if (type === 20 && Managers.configManager.getMilestone().aip11) {
                // NFTAcceptTradeAsset
                const acceptTradeAsset = { ...config.nft.acceptTradeAsset };

                if (!acceptTradeAsset.auctionId) {
                    if (
                        !senderWallet.attributes.nft?.exchange?.auctions ||
                        !Object.keys(senderWallet.attributes.nft.exchange.auctions).length
                    ) {
                        throw new Error("Wallet doesn't own any auctions");
                    }

                    acceptTradeAsset.auctionId = Object.keys(senderWallet.attributes.nft.exchange.auctions)[i];
                }

                if (!acceptTradeAsset.bidId) {
                    if (
                        !Object.keys(senderWallet.attributes.nft.exchange.auctions[acceptTradeAsset.auctionId].bids)
                            .length
                    ) {
                        throw new Error("Auction doesn't own any bids");
                    }

                    acceptTradeAsset.bidId =
                        senderWallet.attributes.nft.exchange.auctions[acceptTradeAsset.auctionId].bids[0];
                }

                transaction.NFTAcceptTradeAsset(acceptTradeAsset);
            } else {
                throw new Error("Version 2 not supported.");
            }

            let vendorField = config.vendorField.value;
            // @ts-ignore
            if (!vendorField && config.vendorField.random && (type === 0 || type === 6 || type === 8)) {
                // @ts-ignore TODO
                vendorField = Math.random().toString();
            }

            if (vendorField) {
                transaction.vendorField(vendorField);
            }

            if (senderWallet.signType === WalletSignType.Basic) {
                sign(transaction, senderWallet.passphrase);
            }

            if (senderWallet.signType === WalletSignType.SecondSignature) {
                sign(transaction, senderWallet.passphrase);
                secondSign(transaction, config.secondPassphrase || "second passphrase");
            }

            if (senderWallet.signType === WalletSignType.MultiSignature) {
                for (const { index, passphrase } of config.multiSignature.passphrases) {
                    transaction.multiSign(passphrase, index);
                }
            }

            const instance = transaction.build();
            const payload = instance.toJson();

            if (config.verbose) {
                console.log(`Transaction: ${JSON.stringify(payload, undefined, 4)}`);
            }

            assert(instance.verify() || senderWallet.signType === WalletSignType.MultiSignature);
            // @ts-ignore TODO
            transactions.push(payload);
        }

        return { transactions, walletChanges };
    }
}