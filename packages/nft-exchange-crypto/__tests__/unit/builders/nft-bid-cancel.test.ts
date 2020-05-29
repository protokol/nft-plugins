import "jest-extended";

import { Managers, Transactions } from "@arkecosystem/crypto";

import { NFTBidCancelBuilder } from "../../../src/builders";
import { NFTBidCancelTransaction } from "../../../src/transactions";

describe("NFT Bid Cancel tests", () => {
    describe("Verify tests", () => {
        Managers.configManager.setFromPreset("testnet");
        Managers.configManager.setHeight(2);
        Transactions.TransactionRegistry.registerTransactionType(NFTBidCancelTransaction);

        it("should verify correctly ", () => {
            const actual = new NFTBidCancelBuilder()
                .NFTBidCancelAsset({
                    bidId: "dfa8cbc8bba806348ebf112a4a01583ab869cccf72b72f7f3d28af9ff902d06d",
                })
                .nonce("5")
                .sign("clay harbor enemy utility margin pretty hub comic piece aerobic umbrella acquire");

            expect(actual.build().verified).toBeTrue();
            expect(actual.verify()).toBeTrue();
        });
    });
});