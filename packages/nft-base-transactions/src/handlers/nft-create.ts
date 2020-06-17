import { Models } from "@arkecosystem/core-database";
import { Container, Contracts, Utils as AppUtils } from "@arkecosystem/core-kernel";
import { Handlers, TransactionReader } from "@arkecosystem/core-transactions";
import { Interfaces, Transactions } from "@arkecosystem/crypto";
import { Interfaces as NFTInterfaces } from "@protokol/nft-base-crypto";
import { Transactions as NFTTransactions } from "@protokol/nft-base-crypto";
import Ajv from "ajv";

import {
    NFTBaseCollectionDoesNotExists,
    NFTBaseMaximumSupplyError,
    NFTBaseSchemaDoesNotMatch,
    NFTBaseSenderPublicKeyDoesNotExists,
} from "../errors";
import { NFTApplicationEvents } from "../events";
import { INFTCollections, INFTTokens } from "../interfaces";
import { NFTIndexers } from "../wallet-indexes";
import { NFTBaseTransactionHandler } from "./nft-base-handler";
import { NFTRegisterCollectionHandler } from "./nft-register-collection";

@Container.injectable()
export class NFTCreateHandler extends NFTBaseTransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return NFTTransactions.NFTCreateTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [NFTRegisterCollectionHandler];
    }

    public walletAttributes(): ReadonlyArray<string> {
        return ["nft.base.tokenIds"];
    }

    public async bootstrap(): Promise<void> {
        const reader: TransactionReader = this.getTransactionReader();
        const transactions: Models.Transaction[] = await reader.read();

        for (const transaction of transactions) {
            const wallet: Contracts.State.Wallet = this.walletRepository.findByPublicKey(transaction.senderPublicKey);

            const tokensWallet = wallet.getAttribute<INFTTokens>("nft.base.tokenIds", {});
            tokensWallet[transaction.id] = {};
            wallet.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);
            this.walletRepository.index(wallet);

            const collectionId = transaction.asset.nftToken.collectionId;
            const genesisWallet = this.walletRepository.findByIndex(NFTIndexers.CollectionIndexer, collectionId);
            const genesisWalletCollection = genesisWallet.getAttribute<INFTCollections>("nft.base.collections");
            genesisWalletCollection[collectionId].currentSupply += 1;
            genesisWallet.setAttribute<INFTCollections>("nft.base.collections", genesisWalletCollection);
        }
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: Contracts.Kernel.EventDispatcher): void {
        emitter.dispatch(NFTApplicationEvents.NFTCreate, transaction.data);
    }

    public async throwIfCannotBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: Contracts.State.Wallet,
    ): Promise<void> {
        AppUtils.assert.defined<NFTInterfaces.NFTTokenAsset>(transaction.data.asset?.nftToken);
        AppUtils.assert.defined<string>(transaction.data.senderPublicKey);
        const nftTokenAsset: NFTInterfaces.NFTTokenAsset = transaction.data.asset.nftToken;
        let genesisWallet: Contracts.State.Wallet;

        try {
            genesisWallet = this.walletRepository.findByIndex(
                NFTIndexers.CollectionIndexer,
                nftTokenAsset.collectionId,
            );
        } catch (e) {
            throw new NFTBaseCollectionDoesNotExists();
        }

        const genesisWalletCollection = genesisWallet.getAttribute<INFTCollections>("nft.base.collections")[
            nftTokenAsset.collectionId
        ];

        if (genesisWalletCollection.nftCollectionAsset.allowedIssuers) {
            if (!genesisWalletCollection.nftCollectionAsset.allowedIssuers.includes(transaction.data.senderPublicKey)) {
                throw new NFTBaseSenderPublicKeyDoesNotExists();
            }
        }

        const ajv = new Ajv({
            allErrors: true,
            removeAdditional: true,
        });
        const validate = ajv.compile(genesisWalletCollection.nftCollectionAsset.jsonSchema);
        if (!validate(transaction.data.asset.nftToken.attributes)) {
            throw new NFTBaseSchemaDoesNotMatch();
        }

        if (genesisWalletCollection.currentSupply >= genesisWalletCollection.nftCollectionAsset.maximumSupply) {
            throw new NFTBaseMaximumSupplyError();
        }

        return super.throwIfCannotBeApplied(transaction, wallet);
    }

    public async applyToSender(transaction: Interfaces.ITransaction): Promise<void> {
        await super.applyToSender(transaction);

        AppUtils.assert.defined<string>(transaction.data.senderPublicKey);
        AppUtils.assert.defined<string>(transaction.data.id);
        // Line is already checked inside throwIfCannotBeApplied run by super.applyToSender method
        //AppUtils.assert.defined<NFTInterfaces.NFTTokenAsset>(transaction.data.asset?.nftToken);

        const sender: Contracts.State.Wallet = this.walletRepository.findByPublicKey(transaction.data.senderPublicKey);

        const tokensWallet = sender.getAttribute<INFTTokens>("nft.base.tokenIds", {});
        tokensWallet[transaction.data.id] = {};
        sender.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);
        this.walletRepository.index(sender);

        const collectionId = transaction.data.asset!.nftToken.collectionId;
        const genesisWallet = this.walletRepository.findByIndex(NFTIndexers.CollectionIndexer, collectionId);
        const genesisWalletCollection = genesisWallet.getAttribute<INFTCollections>("nft.base.collections");
        genesisWalletCollection[collectionId].currentSupply += 1;
        genesisWallet.setAttribute<INFTCollections>("nft.base.collections", genesisWalletCollection);
    }

    public async revertForSender(transaction: Interfaces.ITransaction): Promise<void> {
        await super.revertForSender(transaction);

        AppUtils.assert.defined<string>(transaction.data.senderPublicKey);
        AppUtils.assert.defined<string>(transaction.data.id);
        AppUtils.assert.defined<NFTInterfaces.NFTTokenAsset>(transaction.data.asset?.nftToken);

        const sender: Contracts.State.Wallet = this.walletRepository.findByPublicKey(transaction.data.senderPublicKey);

        const tokensWallet = sender.getAttribute<INFTTokens>("nft.base.tokenIds");
        delete tokensWallet[transaction.data.id];
        sender.setAttribute<INFTTokens>("nft.base.tokenIds", tokensWallet);
        this.walletRepository.forgetByIndex(NFTIndexers.NFTTokenIndexer, transaction.data.id);
        this.walletRepository.index(sender);

        const collectionId = transaction.data.asset.nftToken.collectionId;
        const genesisWallet = this.walletRepository.findByIndex(NFTIndexers.CollectionIndexer, collectionId);
        const genesisWalletCollection = genesisWallet.getAttribute<INFTCollections>("nft.base.collections");
        genesisWalletCollection[collectionId].currentSupply -= 1;
        genesisWallet.setAttribute<INFTCollections>("nft.base.collections", genesisWalletCollection);
    }

    public async applyToRecipient(
        transaction: Interfaces.ITransaction,
        // tslint:disable-next-line: no-empty
    ): Promise<void> {}

    public async revertForRecipient(
        transaction: Interfaces.ITransaction,
        // tslint:disable-next-line:no-empty
    ): Promise<void> {}
}
