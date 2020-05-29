import "jest-extended";

import { Application } from "@arkecosystem/core-kernel";
import { Identifiers } from "@arkecosystem/core-kernel/src/ioc";
import { Generators } from "@arkecosystem/core-test-framework/src";
import { Managers, Transactions } from "@arkecosystem/crypto";
import { configManager } from "@arkecosystem/crypto/src/managers";
import { Transactions as NFTTransactions } from "@protokol/nft-base-crypto";
import { Defaults as CryptoDefaults } from "@protokol/nft-exchange-crypto";
import { Transactions as ExchangeTransactions } from "@protokol/nft-exchange-crypto";
import { Defaults as TransactionsDefaults } from "@protokol/nft-exchange-transactions";

import { initApp, ItemResponse } from "../__support__";
import { ConfigurationsController } from "../../../src/controllers/configurations";

let configurationsController: ConfigurationsController;

const transactionHistoryService = {
    findManyByCriteria: jest.fn(),
    findOneByCriteria: jest.fn(),
    listByCriteria: jest.fn(),
};

let app: Application;

beforeEach(() => {
    const config = Generators.generateCryptoConfigRaw();
    configManager.setConfig(config);
    Managers.configManager.setConfig(config);

    app = initApp();

    transactionHistoryService.findManyByCriteria.mockReset();
    transactionHistoryService.findOneByCriteria.mockReset();
    transactionHistoryService.listByCriteria.mockReset();

    app.bind(Identifiers.TransactionHistoryService).toConstantValue(transactionHistoryService);

    configurationsController = app.resolve<ConfigurationsController>(ConfigurationsController);
});

afterEach(() => {
    Transactions.TransactionRegistry.deregisterTransactionType(NFTTransactions.NFTRegisterCollectionTransaction);
    Transactions.TransactionRegistry.deregisterTransactionType(NFTTransactions.NFTCreateTransaction);
    Transactions.TransactionRegistry.deregisterTransactionType(NFTTransactions.NFTTransferTransaction);
    Transactions.TransactionRegistry.deregisterTransactionType(NFTTransactions.NFTBurnTransaction);

    Transactions.TransactionRegistry.deregisterTransactionType(ExchangeTransactions.NFTAuctionTransaction);
    Transactions.TransactionRegistry.deregisterTransactionType(ExchangeTransactions.NFTAuctionCancelTransaction);
    Transactions.TransactionRegistry.deregisterTransactionType(ExchangeTransactions.NFTBidTransaction);
    Transactions.TransactionRegistry.deregisterTransactionType(ExchangeTransactions.NFTBidCancelTransaction);
    Transactions.TransactionRegistry.deregisterTransactionType(ExchangeTransactions.NFTAcceptTradeTransaction);
});

describe("Test configurations controller", () => {
    it("index - return package name and version and crypto and transactions default settings", async () => {
        const response = (await configurationsController.index(undefined, undefined)) as ItemResponse;
        expect(response.data).toStrictEqual({
            package: {
                name: require("../../../package.json").name,
                version: require("../../../package.json").version,
            },
            crypto: {
                ...CryptoDefaults,
            },
            transactions: {
                ...TransactionsDefaults,
            },
        });
    });
});