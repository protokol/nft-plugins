import "@arkecosystem/core-test-framework/src/matchers";

import { Contracts } from "@arkecosystem/core-kernel";
import { ApiHelpers } from "@arkecosystem/core-test-framework/src";

import { setUp, tearDown } from "../__support__/setup";

let app: Contracts.Kernel.Application;
let api: ApiHelpers;

beforeAll(async () => {
    app = await setUp();
    api = new ApiHelpers(app);
});

afterAll(async () => await tearDown());

describe("API - Configurations", () => {
    describe("GET /nft/exchange/configurations", () => {
        it("should GET nft-exchange-api configurations data", async () => {
            const response = await api.request("GET", "nft/exchange/configurations");
            expect(response).toBeSuccessfulResponse();

            expect(response.data.data.package.name).toStrictEqual(require("../../../package.json").name);
            expect(response.data.data.package.version).toStrictEqual(require("../../../package.json").version);
            expect(response.data.data.crypto).toBeObject();
            expect(response.data.data.transactions).toBeObject();
        });
    });
});
