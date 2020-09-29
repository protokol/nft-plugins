import "jest-extended";

import { Connection } from "@arkecosystem/client";
import nock from "nock";

import { GuardianConnection, NFTConnection } from "../../src";
import { PeerDiscovery } from "../../src/peer-discovery";
import { dummyGithubSeeds, dummyPeers } from "../mocks/peer-discovery/peers";

beforeEach(() => {
    nock.cleanAll();
});

describe("PeerDiscovery", () => {
    describe("New instance test", () => {
        beforeEach(() => {
            nock("http://127.0.0.1").get("/api").reply(500);
        });

        it("should fail if no connection, network or url specified", async () => {
            await expect(PeerDiscovery.new()).rejects.toThrowError(
                new Error("No connection, network or url specified"),
            );
        });

        it("should fail if url is wrong", async () => {
            await expect(PeerDiscovery.new(undefined, "url")).rejects.toThrowError(
                new Error("Failed to discovery any peers, because the url is wrong"),
            );
        });

        it("should fail if there is a problem fetching seeds from url", async () => {
            await expect(PeerDiscovery.new(undefined, "http://127.0.0.1/api")).rejects.toThrowError(
                new Error("Failed to discovery any peers."),
            );
        });

        it("should fail if there is a problem fetching seeds from connection", async () => {
            await expect(PeerDiscovery.new(new Connection("http://127.0.0.1/api"))).rejects.toThrowError(
                new Error("Failed to discovery any peers."),
            );
        });
    });

    describe("Connection tests", () => {
        beforeEach(() => {
            nock("http://127.0.0.1").get("/api/peers").reply(200, {
                data: dummyPeers,
            });
            nock(/.+/).get("/api/peers").reply(200, {
                data: dummyPeers,
            });
        });
        it("should return peers with nft connection", async () => {
            const peerInstance = await PeerDiscovery.new(new NFTConnection("http://127.0.0.1/api"));
            expect(await peerInstance.findPeers()).toEqual(expect.arrayContaining(dummyPeers));
        });

        it("should return peers with guardian connection", async () => {
            const peerInstance = await PeerDiscovery.new(new GuardianConnection("http://127.0.0.1/api"));
            expect(await peerInstance.findPeers()).toEqual(expect.arrayContaining(dummyPeers));
        });

        it("should return peers with connection", async () => {
            const peerInstance = await PeerDiscovery.new(new Connection("http://127.0.0.1/api"));
            expect(await peerInstance.findPeers()).toEqual(expect.arrayContaining(dummyPeers));
        });
    });

    describe("Network url", () => {
        it("should return with specified url", async () => {
            nock("http://1.1.1.1/api").get("/peers").reply(200, {
                data: dummyPeers,
            });
            const peerInstance = await PeerDiscovery.new(undefined, "http://1.1.1.1/api/peers");
            expect(await peerInstance.getSeeds()).toEqual(expect.arrayContaining(dummyPeers));
        });
    });

    describe("Github", () => {
        it("should return with specified network", async () => {
            nock("https://raw.githubusercontent.com/ArkEcosystem/peers/master")
                .get("/mainnet.json")
                .reply(200, dummyGithubSeeds);

            const peerInstance = await PeerDiscovery.new(undefined, "mainnet");
            expect(await peerInstance.getSeeds()).toEqual(expect.arrayContaining(dummyGithubSeeds));
        });

        it("should fail if 404 response is recieved", async () => {
            nock("https://raw.githubusercontent.com/ArkEcosystem/peers/master").get("/mainnet.json").reply(404);

            await expect(PeerDiscovery.new(undefined, "mainnet")).rejects.toThrowError(
                new Error("Failed to discovery any peers."),
            );
        });

        it("should fail if the seed list is empty", async () => {
            nock("https://raw.githubusercontent.com/ArkEcosystem/peers/master").get("/mainnet.json").reply(200, []);

            await expect(PeerDiscovery.new(undefined, "mainnet")).rejects.toThrowError(new Error("No seeds found"));
        });
    });

    describe("FindPeers", () => {
        let peerDiscovery: PeerDiscovery;
        beforeEach(async () => {
            nock("http://127.0.0.1").get("/api/peers").reply(200, {
                data: dummyPeers,
            });

            peerDiscovery = await PeerDiscovery.new(new Connection("http://127.0.0.1/api"));
        });

        it("should find peers", async () => {
            nock(/.+/).get("/api/peers").reply(200, {
                data: dummyPeers,
            });

            expect(await peerDiscovery.findPeers()).toEqual(expect.arrayContaining(dummyPeers));
        });

        describe("should find valid peer among the mix of valid and invalid ones", () => {
            const mathCopy = Object.create(global.Math);
            beforeAll(() => {
                const mockMath = Object.create(global.Math);
                const random = jest.fn();
                random.mockReturnValueOnce(0).mockReturnValue(0.5);
                mockMath.random = random;
                global.Math = mockMath;
            });

            beforeEach(async () => {
                nock("http://127.0.0.1")
                    .get("/api/peers")
                    .reply(200, {
                        data: [{}, { ports: {} }, ...dummyPeers],
                    });

                peerDiscovery = await PeerDiscovery.new(new Connection("http://127.0.0.1/api"));
            });

            afterAll(() => {
                global.Math = mathCopy;
            });

            it("should find peers if selected peer doesn't have ports defined", async () => {
                nock(/.+/).get("/api/peers").reply(200, {
                    data: dummyPeers,
                });

                expect(await peerDiscovery.findPeers()).toEqual(dummyPeers);
            });
        });

        describe("should find valid peer among the mix of valid and invalid one", () => {
            const mathCopy = Object.create(global.Math);
            beforeAll(async () => {
                const mockMath = Object.create(global.Math);
                const random = jest.fn();
                random.mockReturnValueOnce(0.3).mockReturnValue(0.5);
                mockMath.random = random;
                global.Math = mockMath;
            });

            beforeEach(async () => {
                nock("http://127.0.0.1")
                    .get("/api/peers")
                    .reply(200, {
                        data: [{}, { ports: {} }, ...dummyPeers],
                    });

                peerDiscovery = await PeerDiscovery.new(new Connection("http://127.0.0.1/api"));
            });

            afterAll(() => {
                global.Math = mathCopy;
            });

            it("should find peers if selected peer doesn't have api port defined", async () => {
                nock(/.+/).get("/api/peers").reply(200, {
                    data: dummyPeers,
                });

                expect(await peerDiscovery.findPeers()).toEqual(dummyPeers);
            });
        });

        it("should retry three times", async () => {
            nock(/.+/).get("/api/peers").twice().reply(500).get("/api/peers").reply(200, {
                data: dummyPeers,
            });

            const peers = await peerDiscovery.findPeers({
                retry: { limit: 3 },
            });

            expect(peers).toEqual(expect.arrayContaining(dummyPeers));
        });

        it("should timeout request", async () => {
            nock(/.+/).get("/api/peers").delay(2000).reply(200, {
                data: dummyPeers,
            });

            await expect(
                peerDiscovery.findPeers({
                    timeout: 1000,
                }),
            ).rejects.toThrowError(new Error("Request timed out"));
        });

        it("should filter with version", async () => {
            nock(/.+/).get("/api/peers").twice().reply(200, {
                data: dummyPeers,
            });

            await expect(peerDiscovery.withVersion("3.0.0-alpha.10").findPeers()).resolves.toEqual([dummyPeers[1]]);

            await expect(peerDiscovery.withVersion(">=3.0.0-alpha").findPeers()).resolves.toEqual(
                expect.arrayContaining(dummyPeers),
            );
        });

        it("should filter by latency", async () => {
            nock(/.+/).get("/api/peers").twice().reply(200, {
                data: dummyPeers,
            });

            await expect(peerDiscovery.withLatency(150).findPeers()).resolves.toEqual([dummyPeers[1]]);

            await expect(peerDiscovery.withLatency(250).findPeers()).resolves.toEqual(
                expect.arrayContaining(dummyPeers),
            );
        });

        it("should sort by latency asc", async () => {
            nock(/.+/).get("/api/peers").reply(200, {
                data: dummyPeers,
            });

            await expect(peerDiscovery.sortBy("latency", "asc").findPeers()).resolves.toEqual([
                dummyPeers[1],
                dummyPeers[0],
            ]);
        });

        it("should sort by version desc", async () => {
            nock(/.+/).get("/api/peers").reply(200, {
                data: dummyPeers,
            });

            await expect(peerDiscovery.sortBy("version").findPeers()).resolves.toEqual([dummyPeers[0], dummyPeers[1]]);
        });
    });

    describe("FindPeersWithPlugin", () => {
        let peerDiscovery: PeerDiscovery;
        beforeEach(async () => {
            nock("http://127.0.0.1").get("/api/peers").reply(200, {
                data: dummyPeers,
            });

            peerDiscovery = await PeerDiscovery.new(new Connection("http://127.0.0.1/api"));
        });

        it("should find peers with the deprecated wallet api plugin", async () => {
            nock(/.+/).get("/api/peers").reply(200, {
                data: dummyPeers,
            });

            await expect(peerDiscovery.findPeersWithPlugin("core-wallet-api")).resolves.toEqual([]);
        });

        it("should skip peers with invalid port", async () => {
            nock(/.+/).get("/api/peers").reply(200, {
                data: dummyPeers,
            });

            await expect(peerDiscovery.findPeersWithPlugin("core-webhooks")).resolves.toEqual([]);
        });

        it("should find peers with core-api plugin", async () => {
            nock(/.+/).get("/api/peers").reply(200, {
                data: dummyPeers,
            });

            await expect(peerDiscovery.findPeersWithPlugin("core-api")).resolves.toEqual(
                expect.arrayContaining(dummyPeers),
            );
        });
    });

    describe("findPeersWithoutEstimates", () => {
        let peerDiscovery: PeerDiscovery;
        beforeEach(async () => {
            nock("http://127.0.0.1").get("/api/peers").reply(200, {
                data: dummyPeers,
            });

            peerDiscovery = await PeerDiscovery.new(new Connection("http://127.0.0.1/api"));
        });

        it("should find peers without estimates", async () => {
            nock(/.+/)
                .get("/api/peers")
                .reply(200, {
                    data: dummyPeers,
                })
                .persist()
                .get("/api/blocks?limit=1")
                .reply(200, {
                    meta: {
                        totalCountIsEstimate: false,
                    },
                });

            await expect(peerDiscovery.findPeersWithoutEstimates()).resolves.toEqual(dummyPeers);
        });

        it("should skip peers with estimates", async () => {
            nock(/.+/)
                .get("/api/peers")
                .reply(200, {
                    data: dummyPeers,
                })
                .persist()
                .get("/api/blocks?limit=1")
                .reply(200, {
                    meta: {
                        totalCountIsEstimate: true,
                    },
                });

            await expect(peerDiscovery.findPeersWithoutEstimates()).resolves.toEqual([]);
        });
    });
});